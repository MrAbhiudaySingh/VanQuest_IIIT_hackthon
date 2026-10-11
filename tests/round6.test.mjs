// Round 6: the academy's practice simulation (budget, saving, investing, safety, practice life), its
// strict isolation from the live game, Vikram's seeded encounters, whole-life evaluation, the local-AI
// adapter (timeouts, retries, validation, fallback), the AI service's HTTP surface, and the inactive
// Financial District parameter interface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { loadGame, SAVE_KEY } from '../src/sim/state.js';
import { submitCheck, markStudied, courseProgress } from '../src/sim/academy.js';
import { COURSES } from '../src/data/courses.js';
import { PRACTICE_KEY, PRACTICE_VERSION, loadPractice, savePractice, newPractice, migrate, recordAttempt } from '../src/practice/store.js';
import { LESSON_PRACTICE, practiceFor, EXERCISES } from '../src/practice/catalog.js';
import * as B from '../src/practice/exercises/budget.js';
import * as S from '../src/practice/exercises/saving.js';
import * as I from '../src/practice/exercises/investing.js';
import * as F from '../src/practice/exercises/safety.js';
import * as V from '../src/practice/vikram.js';
import * as L from '../src/practice/life.js';
import { evaluateLife, reportFacts } from '../src/practice/evaluate.js';
import { PracticeLab } from '../src/ui/practiceLab.js';
import { createLLM } from '../server/llm.mjs';
import { runTask, TASKS } from '../server/tasks.mjs';
import { createApp } from '../server/serve.mjs';
import { createAIClient } from '../src/ai/client.js';
import { validateExplain, validateLifeFeedback, validateReasoning } from '../src/ai/validate.js';
import * as P from '../src/ai/proposals.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), keys: () => [...m.keys()] }; };
const offlineAI = { check: async () => ({ available: false, reason: 'test' }), task: async () => ({ ok: false, reason: 'test' }) };
const ROOT = new URL('../', import.meta.url);

// ------------------------------------------------------------------ helpers: play a whole practice life
function playLife(seed, policy) {
  let life = L.startFirstEncounter(L.createLife(seed));
  while (!life.done) {
    if (life.encounter && !life.encounter.decision) {
      life = L.encounterAct(life, 'verify_provider').life;
      life = L.encounterAct(life, 'compare_terms').life;
      const want = policy.offer(life.encounter);
      let r = L.encounterDecide(life, want);
      if (!r.ok) r = L.encounterDecide(life, 'reject');
      life = r.life;
    }
    const r = L.stepMonth(life, policy.month(life));
    assert.ok(r.ok, `month ${life.month}: ${r.errors?.join('; ')}`);
    life = r.life;
  }
  return life;
}
const careful = { offer: e => (e.category === 'scam' ? 'report' : 'reject'), month: l => L.suggestDecision(l) };
// hoards money: eats half of what's needed, no leisure, saves nothing visible, accepts everything
const neglect = { offer: () => 'accept', month: l => ({ ...L.emptyDecision(), food: Math.round(l.scenario.foodNeed * 0.5) }) };

// ------------------------------------------------------------------ academy content & progress
test('the four supplied courses are intact: 42 lessons, 34 questions, 56 glossary terms', () => {
  assert.equal(COURSES.reduce((s, c) => s + c.lessons.length, 0), 42);
  assert.equal(COURSES.reduce((s, c) => s + c.check.questions.length, 0), 34);
  assert.equal(COURSES.reduce((s, c) => s + c.glossary.length, 0), 56);
  for (const c of COURSES) { assert.ok(c.objectives.length > 0, `${c.id} objectives`); assert.ok(c.lessons.every(l => l.blocks.length > 0), `${c.id} lessons have content`); }
});

test('courses 3–4 keep the source\'s written-answer format: model answers, no invented options, self-assessment', () => {
  for (const id of ['core03', 'core04']) {
    const c = COURSES.find(x => x.id === id);
    assert.equal(c.check.type, 'open');
    for (const q of c.check.questions) { assert.ok(q.model?.length > 10); assert.equal(q.options, undefined); }
    const s = loadGame(mem());
    const r = submitCheck(s, id, c.check.questions.map(() => ({ text: 'mine', revealed: true, self: 'got' })));
    assert.ok(r.ok && r.passed && r.results.every(x => x.selfMarked));
  }
});

test('every one of the 42 lessons has a practice exercise that matches the lesson order', () => {
  for (const c of COURSES) {
    assert.equal(LESSON_PRACTICE[c.id].length, c.lessons.length, c.id);
    c.lessons.forEach((_, i) => { const p = practiceFor(c.id, i); assert.ok(EXERCISES[p.exercise] && p.brief, `${c.id}:${i}`); });
  }
});

test('reading, practice and the knowledge check are recorded separately', () => {
  const s = loadGame(mem()), p = newPractice();
  markStudied(s, 'core01', 1);
  assert.deepEqual(p.lessons, {}, 'reading does not create practice');
  recordAttempt(p, 'core01', 2, { exercise: 'budget', seed: 's1', score: 80 });
  assert.equal(courseProgress(s, 'core01').studied, 1, 'practice does not mark reading');
  assert.equal(s.academy.courses.core01.check.attempts, 0, 'nor the check');
  assert.ok(p.lessons['core01:2'].completedAt && p.lessons['core01:2'].best === 80);
});

// ------------------------------------------------------------------ isolation
const FORBIDDEN = ['sim/state.js', 'sim/ledger.js', 'sim/clock.js', 'sim/game.js', 'sim/property.js', 'sim/loans.js', 'sim/inventory.js', 'sim/health.js', 'sim/vehicles.js',
  'sim/career.js', 'sim/bank.js', 'sim/market.js', 'sim/academy.js', 'app.js'];
function importsOf(url, seen = new Set()) {
  if (seen.has(url.href)) return seen;
  seen.add(url.href);
  for (const m of readFileSync(url, 'utf8').matchAll(/^import[^'"]*['"](\.[^'"]+)['"]/gm)) importsOf(new URL(m[1], url), seen);
  return seen;
}
test('isolation (static): practice code cannot reach any module that holds or changes the live game', () => {
  const files = [...readdirSync(new URL('src/practice/', ROOT)).filter(f => f.endsWith('.js')).map(f => new URL(`src/practice/${f}`, ROOT)),
    ...readdirSync(new URL('src/practice/exercises/', ROOT)).map(f => new URL(`src/practice/exercises/${f}`, ROOT)), new URL('src/ui/practiceLab.js', ROOT)];
  for (const f of files) for (const dep of importsOf(f)) assert.ok(!FORBIDDEN.some(x => dep.endsWith(`/src/${x}`)), `${f.pathname.split('/src/')[1]} reaches ${dep.split('/src/')[1]}`);
  const code = readFileSync(new URL('src/ui/practiceLab.js', ROOT), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bgame\.(act|state|advance|emit)|\bvq\.|\bthis\.state\b/, 'the lab never touches the game object');
});

test('isolation (runtime): a whole practice session leaves a real saved game byte-for-byte unchanged', () => {
  const storage = mem();
  storage.setItem(SAVE_KEY, readFileSync(new URL('fixtures/round4_save.json', import.meta.url), 'utf8'));
  const state = loadGame(storage);
  const before = JSON.stringify(state), saved = storage.getItem(SAVE_KEY), day = state.day, ledger = state.ledger.length;
  // every exercise through the UI-level lab (which persists to the same storage)…
  const lab = new PracticeLab({ storage, ai: offlineAI });
  for (const c of COURSES) for (let i = 0; i < c.lessons.length; i++) {
    lab.labHtml(c.id, i, c.lessons[i].title);
    const ex = lab.ex;
    if (ex.exercise === 'safety') { lab.onAction('lab-inspect', { dataset: { v: 'documents' } }); lab.onAction('lab-decide', { dataset: { v: 'accept' } }); }
    else if (ex.exercise === 'investing') { ex.d.alloc = { index: 0, single: 0, bond: 0, cash: 0, hot: 100 }; lab.onAction('lab-invest', {}); lab.onAction('lab-react', { dataset: { v: 'sell' } }); }
    else { if (ex.exercise === 'budget') lab.onAction('lab-commit', {}); lab.onAction('lab-run', {}); }
    assert.equal(lab.ex.stage, 'result', `${c.id}:${i} reached a result`);
    lab.ex = null;
  }
  // …and a full practice life with every offer accepted
  lab.newLife();
  while (!lab.life.done) {
    if (lab.life.encounter && !lab.life.encounter.decision) { lab.onAction('life-decide', { dataset: { v: 'accept' } }); if (!lab.life.encounter?.decision) lab.onAction('life-decide', { dataset: { v: 'reject' } }); lab.onAction('life-dismiss', {}); continue; }
    lab.onAction('life-suggest', {}); lab.onAction('life-month', {});
  }
  assert.equal(JSON.stringify(state), before, 'live state untouched');
  assert.equal(storage.getItem(SAVE_KEY), saved, 'live save untouched');
  assert.equal(state.day, day); assert.equal(state.ledger.length, ledger);
  assert.deepEqual(storage.keys().sort(), [PRACTICE_KEY, SAVE_KEY].sort());
  assert.equal(JSON.parse(storage.getItem(PRACTICE_KEY)).runs.length, 1);
});

test('practice store: separate versioned key; newer or unreadable data is never overwritten', () => {
  const st = mem();
  const p = loadPractice(st);
  assert.equal(p.version, PRACTICE_VERSION);
  assert.ok(savePractice(st, p));
  assert.deepEqual(st.keys(), [PRACTICE_KEY]);
  st.setItem(PRACTICE_KEY, JSON.stringify({ version: PRACTICE_VERSION + 1, lessons: { x: 1 } }));
  const newer = loadPractice(st);
  assert.ok(newer.readOnly);
  assert.equal(savePractice(st, newer), false);
  assert.match(st.getItem(PRACTICE_KEY), /"version":2/, 'newer data kept');
  st.setItem(PRACTICE_KEY, '{broken');
  const bad = loadPractice(st);
  assert.ok(bad.readOnly && bad.loadError);
  assert.equal(savePractice(st, bad), false);
  assert.equal(st.getItem(PRACTICE_KEY), '{broken', 'unreadable data kept for recovery');
  const old = migrate({ version: 1, lessons: { 'core01:0': { attempts: 1 } } });
  assert.deepEqual(old.lessons, { 'core01:0': { attempts: 1 } }); assert.deepEqual(old.runs, []); assert.ok(old.vikram);
});

test('identical seeds reproduce identical scenarios, market paths, encounters and whole lives', () => {
  for (const E of [B, S, I]) {
    const a = E.create('seed-42'), b = E.create('seed-42');
    assert.deepEqual(a, b);
    const d = E.defaults(a);
    if (E === I) d.alloc = { index: 50, single: 10, bond: 30, cash: 10, hot: 0 };
    if (E === B) assert.deepEqual(E.run(a, d), E.run(b, E.defaults(b)));
    else assert.deepEqual(E.run(a, d), E.run(b, JSON.parse(JSON.stringify(d))));
  }
  assert.deepEqual(F.create('s9', 'scams'), F.create('s9', 'scams'));
  assert.deepEqual(playLife('life-7', careful), playLife('life-7', careful));
  assert.notDeepEqual(B.create('seed-42'), B.create('seed-43'));
});

// ------------------------------------------------------------------ exercises
test('budget: you can\'t allocate money you don\'t have, pay more than a bill, or cover a surprise twice', () => {
  const sc = B.create('b1'), d = B.defaults(sc);
  d.goal = B.available(sc);
  const c = B.check(sc, d);
  assert.equal(c.ok, false); assert.match(c.errors.join(), /Money can't be created/);
  const d2 = B.defaults(sc); d2.bills.rent = sc.bills[0].amount + 1;
  assert.equal(B.check(sc, d2).ok, false);
  const d3 = B.defaults(sc); d3.shock.emergency = sc.emergency.have + 1;
  assert.equal(B.checkShock(sc, d3).ok, false);
  const d4 = B.defaults(sc); d4.food = -5;
  assert.equal(B.check(sc, d4).ok, false);
  assert.equal(B.run(sc, d).ok, false, 'an impossible plan never runs');
});

test('budget: a late payday makes early bills late (fees) — timing matters, not just totals', () => {
  const sc = B.create('t1', 'timing'), d = B.defaults(sc);
  assert.equal(sc.payday, 28);
  const r = B.run(sc, d);
  assert.ok(r.ok);
  if (sc.opening < sc.bills.reduce((s, b) => s + b.amount, 0) + sc.food.need) assert.ok(r.lateFees > 0);
  const s = B.score(sc, d, r);
  assert.ok(s.score >= 0 && s.score <= 100 && s.points.every(p => p.earned <= p.max));
});

test('saving: accessible and locked money are separate; breaking an FD early costs the penalty', () => {
  const sc = S.create('sv3', 'emergency');
  const allLocked = S.run(sc, { cash: 0, savings: 0, fd: sc.lump, fdTerm: sc.fdTerms.length - 1, monthlyTo: 'cash' });
  assert.ok(allLocked.ok);
  assert.ok(allLocked.brokeFd || allLocked.borrowCost > 0, 'an emergency with everything locked forces a break or a loan');
  if (allLocked.brokeFd) assert.ok(allLocked.penalty > 0);
  const reserve = S.run(sc, { cash: 0, savings: sc.lump, fd: 0, fdTerm: 0, monthlyTo: 'savings' });
  assert.equal(reserve.brokeFd, false); assert.ok(reserve.interest > 0);
  assert.ok(allLocked.rows.every(r => r.fd === 0 || r.fd === sc.lump), 'the locked FD is shown at its principal, separately');
  assert.equal(S.check(sc, { cash: 1, savings: 0, fd: 0, fdTerm: 0, monthlyTo: 'cash' }).ok, false, 'must place exactly the lump sum');
});

test('investing: a higher expected return is not a guaranteed better outcome, and lucky gains don\'t earn skill points', () => {
  const sc = I.create('inv', 'basic'), hype = { alloc: { index: 0, single: 0, bond: 0, cash: 0, hot: 100 }, reaction: 'hold' };
  const sensible = { alloc: { index: 50, single: 0, bond: 40, cash: 10, hot: 0 }, reaction: 'hold' };
  const r = I.run(sc, hype);
  assert.ok(r.luck.worst < sc.credits * 0.5 && r.luck.best > sc.credits, 'the same choice can end far above or below');
  // look for a path where the hyped token got lucky
  let lucky = null;
  for (let i = 0; i < 200 && !lucky; i++) { const s2 = I.create(`luck${i}`, 'basic'), r2 = I.run(s2, hype); if (r2.end > s2.credits * 1.3) lucky = [s2, r2]; }
  assert.ok(lucky, 'a lucky path exists');
  const [s2, r2] = lucky, score = I.score(s2, hype, r2);
  assert.ok(score.score <= 40, `lucky all-in-hype scores ${score.score}`);
  const good = I.score(s2, sensible, I.run(s2, sensible));
  assert.ok(good.score > score.score, 'process beats luck');
  assert.match(score.luckNote, /luck|typical/);
  const sold = I.run(sc, { ...sensible, reaction: 'sell' });
  assert.equal(I.score(sc, { ...sensible, reaction: 'sell' }, sold).points.find(p => /fall/.test(p.label)).earned, 0, 'panic selling scores zero');
});

// ------------------------------------------------------------------ Vikram
test('Vikram: all three categories occur, the distribution follows the configured weights, and seeds reproduce', () => {
  const counts = {};
  for (let i = 0; i < 300; i++) { const e = V.generate(`w${i}`, { liquid: 20000 }); counts[e.category] = (counts[e.category] ?? 0) + 1; }
  assert.ok(counts.scam > 60 && counts.legitimate > 40 && counts.moderate_risk > 40, JSON.stringify(counts));
  for (let i = 0; i < 30; i++) assert.equal(V.generate(`x${i}`, { liquid: 20000 }, { weights: { legitimate: 1 } }).category, 'legitimate');
  assert.deepEqual(V.generate('same', { liquid: 9000 }), V.generate('same', { liquid: 9000 }));
  assert.equal(V.generate('same', { liquid: 9000 }).version, V.VIKRAM_VERSION);
  const ids = new Set(Array.from({ length: 50 }, (_, i) => V.generate(`u${i}`, { liquid: 20000 }).id));
  assert.equal(ids.size, 50);
});

test('Vikram: facts never change while you inspect or after you decide; invalid actions are refused', () => {
  const enc = V.generate('f1', { liquid: 30000 }), facts = JSON.stringify(enc.facts);
  let e = V.reveal(enc, 'verify_provider').enc;
  e = V.reveal(e, 'documents').enc;
  assert.equal(V.reveal(e, 'hack_the_bank').reason, 'unknown_action');
  assert.equal(V.decide(e, 'transfer_all').reason, 'unknown_decision');
  e = V.decide(e, 'reject').enc;
  assert.equal(V.reveal(e, 'ask_more').reason, 'decided', 'no new evidence after the decision');
  assert.equal(V.decide(e, 'accept').reason, 'already_decided');
  assert.equal(JSON.stringify(e.facts), facts);
});

test('Vikram: outcomes follow the scenario rules; legit offers aren\'t auto-penalised; scam feedback matches the evidence', () => {
  const find = (cat, ctx = { liquid: 60000, reserveTarget: 8000, income: 30000 }) => { for (let i = 0; ; i++) { const e = V.generate(`${cat}${i}`, ctx, { weights: { [cat]: 1 } }); if (V.suitability(e).ok || cat === 'scam') return e; } };
  const legit = find('legitimate');
  const verified = V.reveal(V.reveal(legit, 'verify_provider').enc, 'compare_terms').enc;
  assert.ok(V.evaluate(V.decide(verified, 'reject').enc).score >= 60, 'declining a suitable genuine offer is still reasonable');
  assert.ok(V.evaluate(V.decide(verified, 'accept').enc).score >= 90);
  assert.ok(V.evaluate(V.decide(legit, 'report').enc).score < 50, 'reporting a genuine business is a mistake');
  const mod = find('moderate_risk');
  const modChecked = V.reveal(V.reveal(mod, 'compare_terms').enc, 'verify_provider').enc;
  assert.ok(V.evaluate(V.decide(modChecked, 'accept').enc).score >= 90, 'a considered, affordable risk is not a mistake');
  assert.ok(mod.facts.outcome.options.some(o => o.value < mod.facts.stake), 'a moderate risk can lose money — never a secret sure thing');
  const scam = find('scam');
  const s1 = V.reveal(scam, 'compare_terms').enc;
  const accepted = V.decide(s1, 'accept').enc, ev = V.evaluate(accepted);
  assert.equal(accepted.outcome.money, -scam.facts.outcome.amount);
  assert.ok(ev.score <= 15);
  assert.deepEqual(ev.identified, [scam.facts.evidence.compare_terms.fact]);
  assert.equal(ev.missed.length, Object.values(scam.facts.evidence).filter(x => x.signal === 'red').length - 1);
  assert.ok(ev.missed.every(m => Object.values(scam.facts.evidence).some(x => x.fact === m)), 'feedback only quotes real evidence');
  assert.ok(V.evaluate(V.decide(s1, 'report').enc).score >= 85);
});

test('Vikram: model wording is validated — invented amounts, links, missing provider, false guarantees and duplicates are rejected', () => {
  const legit = V.generate('n1', { liquid: 30000 }, { weights: { legitimate: 1 } }), amt = `₹${legit.facts.amounts[0].toLocaleString('en-IN')}`;
  const name = legit.facts.provider.replace(/["()]/g, '').split(/\s+/).find(w => w.length > 3);
  const ok = { pitch: `${name} can set you up with ${amt}. Have a look at the paperwork first.`, scene: 'at the bank', reactions: { verify_provider: 'Check the regulator list yourself.' } };
  const good = V.withNarrative(legit, ok);
  assert.ok(good.applied, good.errors.join());
  assert.deepEqual(good.enc.facts, legit.facts, 'wording never changes facts');
  for (const [bad, why] of [[{ ...ok, pitch: `${name} pays ₹77,777 to you.` }, /₹77,777 isn't an amount stated there/], [{ ...ok, pitch: `${name} ${amt}, see www.x.com` }, /link/],
    [{ ...ok, pitch: `A great deal for ${amt}, trust me now.` }, /provider/], [{ ...ok, pitch: `${name}: ${amt}, guaranteed risk-free!` }, /guarantee/], [{ ...ok, reactions: { delete_save: 'x' } }, /unknown action/], [null, /not an object/]])
    assert.match(V.validateNarrative(legit, bad).errors.join(), why);
  assert.equal(V.withNarrative(legit, ok, [good.enc.fingerprint]).applied, false, 'duplicate rejected');
  // seen with the real model: a real amount turned into a promised result for a market-linked SIP
  let sip = null;
  for (let i = 0; !sip; i++) { const e = V.generate(`sip${i}`, { liquid: 30000 }, { weights: { legitimate: 1 } }); if (e.facts.outcome.kind === 'market') sip = e; }
  const sipAmt = `₹${sip.facts.monthly.toLocaleString('en-IN')}`, sipName = sip.facts.provider.split(/\s+/)[0];
  assert.ok(V.validateNarrative(sip, { pitch: `${sipName} has a ${sipAmt}-a-month SIP. It can rise or fall — read the fact sheet.`, scene: 'at the bank', reactions: {} }).ok, 'honest wording passes');
  assert.match(V.validateNarrative(sip, { pitch: `Invest ${sipAmt} a month with ${sipName}. After five years, you’ll have ${sipAmt} working for you.`, scene: 'at the bank', reactions: {} }).errors.join(), /do not promise/);
  assert.ok(V.validateNarrative(sip, { pitch: `${sipName}: ${sipAmt} a month. Returns are not guaranteed — it's market-linked.`, scene: 'at the bank', reactions: {} }).ok, 'an honest "not guaranteed" disclaimer is allowed');
  const scam = V.generate('n2', { liquid: 30000 }, { weights: { scam: 1 } }), sAmt = `₹${scam.facts.amounts[0].toLocaleString('en-IN')}`;
  const sName = scam.facts.provider.replace(/["()]/g, '').split(/\s+/).find(w => w.length > 3);
  assert.ok(V.validateNarrative(scam, { pitch: `${sName}! Pay ${sAmt} and you'll get double, guaranteed.`, scene: 'by the gate', reactions: {} }).ok, 'a scammer may make false promises');
});

// ------------------------------------------------------------------ whole-life evaluation
test('evaluation: scores are bounded, deterministic and built only from the recorded run', () => {
  const life = playLife('ev1', careful), a = evaluateLife(life), b = evaluateLife(JSON.parse(JSON.stringify(life)));
  assert.deepEqual(a, b, 'the same completed run always gets the same report');
  for (const c of Object.values(a.categories)) assert.ok(c.score >= 0 && c.score <= 100);
  assert.ok(a.overall >= 0 && a.overall <= 100);
  assert.equal(Object.keys(a.categories).length, 10);
  assert.equal(a.priorities.length, 3); assert.ok(a.replay);
  const months = new Set(life.log.map(m => m.month));
  for (const x of [...a.best, ...a.mistakes]) if (x.month != null) assert.ok(months.has(x.month), 'refers to a month that happened');
  assert.equal(a.summary.endNet, L.netWorth(life));
  assert.throws(() => evaluateLife(L.createLife('unfinished')), /not finished/);
  const facts = reportFacts(a);
  assert.ok(facts.allowedNumbers.includes(a.overall));
});

test('evaluation: wealth alone can\'t buy a good rating; neglecting food and health caps it', () => {
  const life = playLife('rich', neglect), R = evaluateLife(life);
  assert.ok(R.summary.change > 0, 'they did build wealth');
  assert.ok(R.overall <= 55, `overall ${R.overall}`);
  assert.ok(R.categories.health.score < 50 && R.categories.qol.score < 50);
  assert.notEqual(R.rating, 'Excellent');
  // money managed well, but meals skipped: the cap stops the good money scores carrying the rating
  const frugal = { offer: careful.offer, month: l => ({ ...L.suggestDecision(l), food: Math.round(l.scenario.foodNeed * 0.7) }) };
  const F2 = evaluateLife(playLife('rich', frugal));
  const uncapped = Math.round(Object.values(F2.categories).reduce((a, c) => a + c.score, 0) / 10);
  assert.ok(uncapped > 55 && F2.overall === 55, `uncapped ${uncapped}, overall ${F2.overall}`);
  assert.match(F2.caps.join(), /capped at 55/);
  assert.match(F2.headline, /Money should support a life, not replace one/);
});

test('evaluation: modest income with sound decisions earns a strong rating — poverty itself isn\'t penalised', () => {
  let seed = null;
  for (let i = 0; i < 200 && !seed; i++) if (L.createLife(`low${i}`).scenario.income === 12000) seed = `low${i}`;
  assert.ok(seed);
  const R = evaluateLife(playLife(seed, careful));
  assert.ok(R.overall >= 70, `overall ${R.overall} (${JSON.stringify(Object.fromEntries(Object.entries(R.categories).map(([k, v]) => [k, v.score])))})`);
  const rich = evaluateLife(playLife('rich', neglect));
  assert.ok(R.overall > rich.overall);
});

test('practice life: decisions that need money you don\'t have are refused; the live game is never an input', () => {
  const life = L.startFirstEncounter(L.createLife('c1'));
  const r = L.stepMonth({ ...life, encounter: null }, { ...L.emptyDecision(), leisure: 10_000_000 });
  assert.equal(r.ok, false); assert.match(r.errors.join(), /Money can't be created/);
  assert.equal(L.stepMonth({ ...life, encounter: null }, { ...L.emptyDecision(), withdraw: { reserve: life.reserve + 1, goal: 0, index: 0, risky: 0 } }).ok, false);
});

// ------------------------------------------------------------------ the local-AI adapter
const CFG = { baseUrl: 'http://model.test', model: 'qwen-test', runtime: 'ollama', timeoutMs: 200, retries: 2, apiKey: 'sk-secret-123', numCtx: 4096, maxResponseChars: 2000, maxInputChars: 6000 };
const envelope = content => ({ ok: true, status: 200, text: async () => JSON.stringify({ message: { content } }) });
const scripted = responses => { const calls = []; return { calls, fetchImpl: async (url, init) => { calls.push({ url, init }); const r = responses[Math.min(calls.length - 1, responses.length - 1)]; return typeof r === 'function' ? r(init) : r; } }; };
const ask = (llm, validate) => llm.json({ system: 's', user: 'u', schema: { type: 'object' }, validate });

test('adapter: a valid structured answer is returned, validated, with the schema sent to the runtime', async () => {
  const f = scripted([envelope('{"tip":"save first"}')]), logs = [];
  const llm = createLLM(CFG, { fetchImpl: f.fetchImpl, log: e => logs.push(JSON.stringify(e)) });
  const r = await ask(llm, d => ({ ok: typeof d.tip === 'string', errors: [], value: d }));
  assert.deepEqual(r.data, { tip: 'save first' });
  const body = JSON.parse(f.calls[0].init.body);
  assert.deepEqual(body.format, { type: 'object' }); assert.equal(body.model, 'qwen-test'); assert.equal(body.stream, false);
  assert.equal(f.calls[0].init.headers.authorization, 'Bearer sk-secret-123');
  assert.ok(!logs.join().includes('sk-secret'), 'the key never reaches logs');
});

test('adapter: malformed JSON and schema-invalid answers are retried a bounded number of times, then fail safely', async () => {
  const f = scripted([envelope('not json at all')]);
  const r = await ask(createLLM(CFG, { fetchImpl: f.fetchImpl }));
  assert.equal(r.ok, false); assert.equal(r.reason, 'bad_json'); assert.equal(f.calls.length, 1 + CFG.retries);
  const g = scripted([envelope('{"amount":999999}')]);
  const v = await ask(createLLM(CFG, { fetchImpl: g.fetchImpl }), d => ({ ok: d.amount < 100, errors: ['amount is impossible'] }));
  assert.equal(v.reason, 'invalid'); assert.equal(g.calls.length, 3);
  assert.match(JSON.parse(g.calls[1].init.body).messages.at(-1).content, /amount is impossible/, 'the model is told exactly what was wrong');
  const h = scripted([envelope('{"amount":999999}'), envelope('{"amount":5}')]);
  const fixed = await ask(createLLM(CFG, { fetchImpl: h.fetchImpl }), d => ({ ok: d.amount < 100, errors: ['too big'], value: d }));
  assert.ok(fixed.ok); assert.equal(fixed.attempts, 2);
  const big = scripted([envelope(`{"x":"${'a'.repeat(5000)}"}`)]);
  assert.equal((await ask(createLLM(CFG, { fetchImpl: big.fetchImpl }))).reason, 'too_large');
});

test('adapter: timeouts, an unreachable runtime and HTTP errors fall back instead of hanging', async () => {
  const hang = (_, init) => new Promise((_r, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const t = await ask(createLLM({ ...CFG, retries: 1 }, { fetchImpl: hang }));
  assert.equal(t.reason, 'timeout');
  const refused = scripted([() => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); }]);
  const u = await ask(createLLM(CFG, { fetchImpl: refused.fetchImpl }));
  assert.equal(u.reason, 'unavailable'); assert.equal(refused.calls.length, 1, 'no pointless retries when nothing is listening');
  const e500 = scripted([{ ok: false, status: 500, text: async () => 'boom' }]);
  assert.equal((await ask(createLLM(CFG, { fetchImpl: e500.fetchImpl }))).reason, 'http_500');
  assert.equal(e500.calls.length, 3);
  const down = await createLLM(CFG, { fetchImpl: refused.fetchImpl }).status();
  assert.equal(down.available, false);
});

test('adapter: requests are queued and excess requests are refused rather than piling up', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const llm = createLLM(CFG, { fetchImpl: async () => { await gate; return envelope('{}'); } });
  const all = Array.from({ length: 6 }, () => ask(llm));
  release();
  const rs = await Promise.all(all);
  assert.ok(rs.filter(r => r.reason === 'busy').length >= 1);
  assert.ok(rs.filter(r => r.ok).length >= 1);
});

test('tasks: only the fixed tasks exist; bad input is refused before the model is called; meaning is validated', async () => {
  let called = 0;
  const llm = { json: async ({ validate }) => { called++; return { ok: true, data: validate({}).value }; } };
  assert.equal((await runTask(llm, 'run_shell', {})).reason, 'unknown_task');
  assert.equal((await runTask(llm, 'explain', { points: 'nope' })).reason, 'bad_input');
  assert.equal(called, 0);
  assert.deepEqual(Object.keys(TASKS).sort(), ['explain', 'life_feedback', 'life_report', 'newspaper', 'reasoning', 'vikram_narrative']);   // Round 7 added the final life report and the newspaper
  // contradictory or invented content
  assert.match(validateExplain({ explanation: 'You scored 95 because you saved ₹50,000 in the bank this month, great job overall.', tip: 'x' }, { allowedNumbers: [62, 15000] }).errors.join(), /not in the results/);
  assert.match(validateLifeFeedback({ narrative: 'An Excellent year all round, with careful budgeting and steady saving throughout the twelve months.', encouragement: 'Keep going!' }, { rating: 'Developing', allowedNumbers: [] }).errors.join(), /different rating/);
  assert.match(validateReasoning({ criteria: [{ id: 'risk', met: true, quote: 'words they never wrote' }], feedback: 'Some feedback here.' }, { answer: 'I spread my money.', rubric: [{ id: 'risk' }] }).errors.join(), /copied exactly/);
  assert.match(validateReasoning({ criteria: [{ id: 'made_up', met: false }], feedback: 'Some feedback here.' }, { answer: 'a', rubric: [{ id: 'risk' }] }).errors.join(), /unknown criterion/);
});

test('AI service: status hides the machine\'s model list; server files and oversized input are refused', async () => {
  const llm = { status: async () => ({ available: true, model: 'm', runtime: 'ollama', installedModels: ['private-model'] }), json: async () => ({ ok: false, reason: 'unavailable' }) };
  const srv = createServer(createApp({ llm })).listen(0), base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const st = await (await fetch(`${base}/api/ai/status`)).json();
    assert.equal(st.available, true); assert.equal(st.installedModels, undefined);
    for (const p of ['/server/config.mjs', '/vanquest.ai.json', '/tests/round6.test.mjs', '/node_modules/playwright/package.json', '/%2e%2e/etc/passwd']) assert.equal((await fetch(base + p)).status, 404, p);
    assert.equal((await fetch(`${base}/api/ai/task/explain`, { method: 'POST', body: 'x'.repeat(7000) })).status, 413);
    assert.equal((await fetch(`${base}/api/ai/task/nope`, { method: 'POST', body: '{}' })).status, 404);
    const down = await (await fetch(`${base}/api/ai/task/explain`, { method: 'POST', body: JSON.stringify({ points: [] }) })).json();
    assert.deepEqual([down.ok, down.reason], [false, 'unavailable'], 'model down → a clean offline answer');
    assert.equal((await fetch(`${base}/index.html`)).status, 200);
  } finally { srv.close(); }
});

test('browser client: no AI service or an invalid answer → offline fallback; it never sees the model address', async () => {
  const html = createAIClient({ fetchImpl: async () => ({ headers: { get: () => 'text/html' }, json: async () => ({}) }) });
  assert.equal((await html.check()).available, false);
  assert.equal((await html.task('explain', {})).ok, false);
  const json = r => ({ headers: { get: () => 'application/json' }, json: async () => r });
  const lying = createAIClient({ fetchImpl: async url => json(url.endsWith('status') ? { available: true, model: 'm' } : { ok: true, data: { explanation: 'You earned ₹1,00,00,000 this month, which is far more than anyone expected of you.', tip: 'x' } }) });
  const r = await lying.task('explain', { allowedNumbers: [10] });
  assert.equal(r.ok, false); assert.equal(r.reason, 'invalid', 're-validated in the browser');
  for (const f of walk(new URL('src/', ROOT))) assert.doesNotMatch(readFileSync(f, 'utf8'), /11434|VANQUEST_LLM|Bearer|apiKey/, `${f.pathname.split('/src/')[1]} must not reference the model endpoint or credentials`);
});
function walk(dir) { return readdirSync(dir).flatMap(n => { const u = new URL(n, dir); return statSync(u).isDirectory() ? walk(new URL(`${n}/`, dir)) : [u]; }); }

// ------------------------------------------------------------------ the future Financial District interface (inactive)
test('parameter proposals: proposal → validated candidate → approved, but activation is disabled this round', () => {
  const current = { savingsRate: 0.035, mortgageRate: 0.09 };
  const bad = P.validate(P.propose({ params: { savingsRate: 0.5, mortgageRate: 'low', secretFee: 1 } }), current);
  assert.equal(bad.ok, false);
  for (const why of [/savingsRate=0.5 is outside/, /mortgageRate must be a number/, /unknown parameter "secretFee"/]) assert.match(bad.errors.join('; '), why);
  assert.equal(P.validate(P.propose({ params: { savingsRate: 0.045 } }), current).ok, false, 'moves too far at once');
  const v = P.validate(P.propose({ params: { savingsRate: 0.039 }, rationale: 'inflation eased' }), current);
  assert.ok(v.ok); assert.equal(v.candidate.stage, 'candidate'); assert.ok(Object.isFrozen(v.candidate));
  const monthStart = d => d % 30 === 0;
  assert.equal(P.approve(v.candidate, { today: 40, effectiveDay: 60, isMonthStart: monthStart }).reason, 'approval_required');
  assert.equal(P.approve(v.candidate, { approvedBy: 'designer', today: 40, effectiveDay: 45, isMonthStart: monthStart }).reason, 'not_on_clock_boundary');
  assert.equal(P.approve(v.candidate, { approvedBy: 'designer', today: 40, effectiveDay: 30, isMonthStart: monthStart }).reason, 'not_in_future');
  const a = P.approve(v.candidate, { approvedBy: 'designer', today: 40, effectiveDay: 60, isMonthStart: monthStart });
  assert.ok(a.ok);
  assert.equal(P.ACTIVATION_ENABLED, false);
  assert.equal(P.activate([], a.approved, current).reason, 'activation_disabled');
  for (const f of walk(new URL('src/sim/', ROOT))) assert.doesNotMatch(readFileSync(f, 'utf8'), /ai\/proposals/, 'the live simulation never imports the proposal interface');
  assert.deepEqual(P.paramsOn([{ params: current, fromDay: 0, toDay: null }], 99), current);
});
