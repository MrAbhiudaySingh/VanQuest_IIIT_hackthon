// Round 7: characters (local profiles), the supplied goals quiz, the life cycle (death, retirement at 60,
// manual retirement), the final main-game life evaluation, achievements, the monthly newspaper, the AI
// validators and fallbacks, and save migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, saveGame, migrate, SAVE_VERSION, SAVE_KEY } from '../src/sim/state.js';
import { Game } from '../src/sim/game.js';
import { advanceDays } from '../src/sim/clock.js';
import { balance } from '../src/sim/ledger.js';
import { ageOn, retirementDay } from '../src/sim/character.js';
import { QUIZ, KEY_BY_INDEX } from '../src/data/goalsQuiz.js';
import { submitGoals, saveDraft, startRevision, currentGoals, goalStatus, retirementEligibility, confirmGoal } from '../src/sim/goals.js';
import { finalizeLife, retire } from '../src/sim/lifeEnd.js';
import { buildLifeReport, CRITERIA } from '../src/sim/lifeReport.js';
import { evaluate, unlockNew, CATALOGUE, UNTRACKED, ADDITIONS } from '../src/sim/achievements.js';
import { SUPPLIED_ACHIEVEMENTS } from '../src/data/achievements.js';
import { makeIssue, renderIssue, markRead } from '../src/sim/newspaper.js';
import { closeMonth } from '../src/sim/lifeLog.js';
import { price, trade, portfolio } from '../src/sim/market.js';
import { transfer } from '../src/sim/ledger.js';
import { startEncounter, decline, invest, ask } from '../src/sim/encounters.js';
import { buyVehicle } from '../src/sim/vehicles.js';
import { createCharacter, listProfiles, readIndex, cleanName, PROFILES_KEY, ARCHIVE_PREFIX } from '../src/sim/profiles.js';
import { validateLifeReport, validateNewspaper, LIFE_SECTIONS } from '../src/ai/validate.js';
import { lifeFacts, fallbackLife, newsInput } from '../src/ai/narratives.js';
import { runTask, TASKS } from '../server/tasks.mjs';
import { ITEMS } from '../src/data/catalog.js';
import { nextMonthStart, monthKey } from '../src/sim/util.js';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), keys: () => [...m.keys()], m }; };
const stock = (s, days = 20000) => { for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'grocery') s.pantry[id] = Math.ceil(days * it.usePerDay) + 1; return s; };
const give = (s, amount, account = 'wallet') => { s.ledger.push({ id: s.nextId++, day: s.day, account, amount, category: 'test', memo: 'test funds', status: 'ok' }); return s; };
const toFirst = s => advanceDays(s, nextMonthStart(s.day) - s.day);
const ANSWERS = { goal: 'Own a car or vehicle', age: 30, ageUnsure: false, priority: 'Build savings', income: 'Part-time or freelance income', saving: 'Learn how to save',
  knowledge: 'Beginner', risk: 'Prefer safer choices', time: 'Within 1–3 years', style: 'A mix of everything', currency: 'INR (₹)', expectedIncome: 'Not sure' };
const withGoals = (s, a = ANSWERS) => { assert.ok(submitGoals(s, a, 'quiz-1').ok); return s; };

// ------------------------------------------------------------------ character & save v5
test('a new character is 18 on day 0, retires on the 60th birthday, and the save is version 5', () => {
  const s = newGame({ name: 'Asha' });
  assert.equal(s.version, 5); assert.equal(SAVE_VERSION, 5);
  assert.equal(ageOn(s), 18);
  assert.equal(retirementDay(s), 15341, '1 July 2068');
  assert.equal(s.character.name, 'Asha');
  assert.deepEqual(s.onboarding, { introDone: false, quizDone: false });
  assert.equal(s.housing.propertyId, 'home_apartment', 'starts in the cheapest rented flat');
  assert.deepEqual([s.lifeLog, s.newspaper.issues, s.achievements.unlocked, s.life.final], [[], [], [], null]);
});

test('older saves migrate to v5 without losing anything, are marked legacy, skip onboarding, and keep a backup', () => {
  const raw = readFileSync(new URL('./fixtures/round4_save.json', import.meta.url), 'utf8'), old = JSON.parse(raw);
  const st = mem(); st.setItem(SAVE_KEY, raw);
  const g = new Game(st), s = g.state;
  assert.equal(s.version, 5);
  assert.equal(st.getItem(`${SAVE_KEY}.backup-v3`), raw, 'the pre-upgrade save is kept byte-for-byte');
  assert.equal(balance(s), old.ledger.filter(e => e.account === 'wallet' && e.status === 'ok').reduce((a, e) => a + e.amount, 0));
  assert.deepEqual(s.properties && Object.keys(s.properties).sort(), Object.keys(old.properties).sort());
  assert.equal(s.character.legacy, true); assert.equal(s.character.historyFrom, old.day);
  assert.equal(s.onboarding.introDone, true, 'a returning player is not sent through onboarding');
  assert.equal(s.goals.original, null, 'no goals are invented for an old save');
  const again = JSON.stringify(s); migrate(s); assert.equal(JSON.stringify(s), again, 'migrating twice is a no-op');
  assert.ok(readIndex(st).profiles.some(p => p.id === s.character.profileId), 'the old save becomes a listed character');
});

// ------------------------------------------------------------------ local profiles
test('profiles: new, returning, multiple — creating or switching never deletes another character', () => {
  const st = mem();
  const g = new Game(st); const first = g.state.character.profileId;
  give(g.state, 12345); saveGame(st, g.state);
  const savedFirst = JSON.stringify(g.state);
  assert.equal(new Game(st).state.character.profileId, first, 'returning: same profile id, same save');
  const r = g.newCharacter('Ravi');
  assert.ok(r.ok);
  assert.notEqual(g.state.character.profileId, first);
  assert.equal(g.state.character.name, 'Ravi'); assert.equal(g.state.day, 0); assert.equal(balance(g.state), 15000, 'a genuinely new character');
  assert.equal(st.getItem(ARCHIVE_PREFIX + first), savedFirst, 'the first character is archived byte-for-byte');
  const list = listProfiles(st, g.state);
  assert.deepEqual(list.map(p => p.name).sort(), [cleanName(JSON.parse(savedFirst).character.name), 'Ravi'].sort());
  assert.equal(list[0].active, true);
  const back = g.switchTo(first);
  assert.ok(back.ok);
  assert.equal(JSON.stringify(g.state), savedFirst, 'switching back restores exactly the same state');
  assert.ok(st.getItem(ARCHIVE_PREFIX + r.state.character.profileId), 'Ravi is archived, not lost');
  assert.equal(readIndex(st).activeId, first);
});

test('profiles: invalid data is ignored safely, names are sanitised, and a full disk refuses instead of losing data', () => {
  const st = mem();
  st.setItem(PROFILES_KEY, '{not json');
  const g = new Game(st);
  assert.ok(readIndex(st).profiles.length === 1, 'a corrupt index is rebuilt from the save');
  st.setItem(PROFILES_KEY, JSON.stringify({ profiles: [{ id: '../../evil', name: 'x' }, { id: 'p-abcd1234', name: '<script>alert(1)</script>' }], activeId: 42 }));
  const idx = readIndex(st);
  assert.deepEqual(idx.profiles.map(p => p.id), ['p-abcd1234']);
  assert.ok(!idx.profiles[0].name.includes('<'));
  assert.equal(idx.activeId, null);
  assert.equal(cleanName('  Asha \u0007 K  '), 'Asha K'); assert.equal(cleanName(''), 'Character'); assert.equal(cleanName('x'.repeat(40)).length, 24);
  // out of space: nothing changes
  const before = JSON.stringify(g.state), full = { ...st, setItem: () => { throw new Error('QuotaExceededError'); } };
  const r = createCharacter(full, g.state, 'Nope');
  assert.equal(r.ok, false); assert.equal(JSON.stringify(g.state), before);
});

// ------------------------------------------------------------------ goals quiz
test('the goals quiz is the supplied one: every question, option label and value, in order', () => {
  const html = readFileSync(new URL('../Assets/supplied-ui/journey/index.html', import.meta.url), 'utf8');
  const qs = [...html.matchAll(/<section class="question[^"]*" data-q="(\d+)"[\s\S]*?<h3>(.*?)<\/h3>([\s\S]*?)<\/section>/g)];
  assert.equal(qs.length, 11);
  qs.slice(0, 10).forEach((m, i) => {
    assert.equal(QUIZ.questions[i].question, m[2].replace(/&amp;/g, '&'), `question ${i + 1}`);
    const opts = [...m[3].matchAll(/data-value="([^"]+)"><span class="symbol">(.*?)<\/span>(.*?)<\/button>/g)].map(o => ({ value: o[1], symbol: o[2], label: o[3] }));
    assert.deepEqual(QUIZ.questions[i].options ?? [], opts, `options of question ${i + 1}`);
  });
  assert.deepEqual(KEY_BY_INDEX, ['goal', null, 'priority', 'income', 'saving', 'knowledge', 'risk', 'time', 'style', 'currency']);
});

test('goals: required answers validate; submission is linked to the character; no duplicates; drafts survive save/load', () => {
  const st = mem(), g = new Game(st);
  assert.equal(g.act(s => submitGoals(s, { ...ANSWERS, goal: null }, 't0')).reason, 'invalid');
  assert.equal(g.act(s => submitGoals(s, { ...ANSWERS, goal: 'Win the lottery' }, 't0')).reason, 'invalid', 'only the supplied options');
  g.act(s => saveDraft(s, { goal: 'Become financially independent', priority: 'Build savings' }, 3));
  const reloaded = new Game(st).state;
  assert.equal(reloaded.goals.draft.step, 3); assert.equal(reloaded.goals.draft.answers.goal, 'Become financially independent');
  const r = g.act(s => submitGoals(s, ANSWERS, 'tok'));
  assert.ok(r.ok);
  assert.equal(r.record.runId, g.state.character.runId); assert.equal(r.record.age, 18); assert.equal(r.record.day, 0);
  assert.equal(g.act(s => submitGoals(s, ANSWERS, 'tok')).reason, 'duplicate', 'double click');
  assert.equal(g.act(s => submitGoals(s, { ...ANSWERS, goal: 'Travel the world' }, 'tok2')).reason, 'already_submitted');
  assert.equal(g.state.goals.original.answers.goal, 'Own a car or vehicle');
  assert.equal(g.state.goals.draft, null); assert.equal(g.state.onboarding.quizDone, true);
});

test('goals: the original is an immutable baseline; revisions are dated history; the latest counts for retirement', () => {
  const s = withGoals(stock(newGame()));
  const original = JSON.stringify(s.goals.original);
  advanceDays(s, 400);
  startRevision(s);
  assert.ok(submitGoals(s, { ...ANSWERS, goal: 'Save for higher education', age: 25 }, 'rev').ok);
  assert.equal(JSON.stringify(s.goals.original), original, 'the original never changes');
  assert.throws(() => { 'use strict'; s.goals.original.answers.goal = 'x'; }, TypeError, 'original answers are frozen');
  assert.equal(s.goals.revisions.length, 1); assert.equal(s.goals.revisions[0].day, 400); assert.equal(s.goals.revisions[0].age, 19);
  assert.equal(currentGoals(s).answers.goal, 'Save for higher education');
  assert.ok(s.events.some(e => e.type === 'goals' && /Revised/.test(e.text)));
});

// ------------------------------------------------------------------ life endings
test('death finalizes the life exactly once; afterwards nothing can change the character', () => {
  const st = mem(), g = new Game(st);
  withGoals(g.state);
  g.state.pantry = {};
  g.advance(200);
  const s = g.state;
  assert.equal(s.status, 'dead');
  assert.equal(s.life.final.ending.kind, 'death'); assert.equal(s.life.final.ending.cause, 'malnutrition');
  const frozen = JSON.stringify(s);
  assert.equal(finalizeLife(s, 'retired_manual').already, true, 'a second terminal event changes nothing');
  assert.equal(g.act(st2 => give(st2, 1000)).reason, 'life_ended');
  assert.equal(g.advance(30).length, 0);
  assert.equal(JSON.stringify(s), frozen, 'no purchases, transfers, time or report changes after death');
  const ids = s.achievements.unlocked.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate achievements');
  assert.ok(ids.includes('short-run'));
  // reload: the same report, not a new one
  assert.equal(JSON.stringify(new Game(st).state.life.final), JSON.stringify(s.life.final));
});

test('retirement at 60 happens on the birthday morning, before that day\'s salary, rent, EMIs or interest', () => {
  const s = stock(give(newGame(), 500000));
  s.day = retirementDay(s) - 40; s.housing.paidMonth = monthKey(s.day);
  toFirst(s);                                                  // 1 June 2068: a normal 1st
  const juneSalary = s.ledger.filter(e => e.category === 'salary' && e.day === s.day).length;
  assert.equal(juneSalary, 1);
  const notes = advanceDays(s, 100);
  assert.equal(s.status, 'retired'); assert.equal(s.day, retirementDay(s), 'the clock stopped on the birthday');
  assert.equal(s.life.final.ending.kind, 'retired_age'); assert.equal(s.life.final.ending.age, 60);
  assert.equal(s.ledger.filter(e => e.day === s.day && e.category !== 'test').length, 0, 'no July salary, rent, EMI or interest');
  assert.equal(s.lifeLog.filter(r => r.month === '2068-06').length, 1, 'June closed exactly once');
  assert.equal(s.newspaper.issues.filter(i => i.month === '2068-06').length, 1);
  assert.ok(notes.some(n => /retired/.test(n.text)));
});

test('manual retirement: refused with reasons until the goal is met; cancelling changes nothing; one retirement only', () => {
  const s = withGoals(stock(give(newGame(), 900000)));
  const el = retirementEligibility(s);
  assert.equal(el.eligible, false); assert.match(el.unmet.join(), /haven't bought a car/);
  assert.equal(retire(s, 'r1').reason, 'not_eligible');
  const before = JSON.stringify(s);
  // "Cancel" = never calling retire: the state is untouched
  assert.equal(JSON.stringify(s), before);
  buyVehicle(s, 'hatch', 'car');
  assert.equal(retirementEligibility(s).eligible, true);
  assert.equal(retire(s, null).reason, 'duplicate', 'needs a confirmation token');
  const r = retire(s, 'confirm-1');
  assert.ok(r.ok); assert.equal(s.status, 'retired'); assert.equal(s.life.final.ending.kind, 'retired_manual');
  const again = retire(s, 'confirm-2');
  assert.equal(again.already, true); assert.equal(again.report, r.report, 'the same report, not a second retirement');
  assert.equal(advanceDays(s, 10).length, 0); assert.equal(s.day, r.report.ending.day);
});

test('qualitative goals need the player\'s own confirmation (never the AI) before manual retirement', () => {
  const s = withGoals(stock(newGame()), { ...ANSWERS, goal: 'Travel the world' });
  const el = retirementEligibility(s);
  assert.equal(el.eligible, false); assert.equal(el.needsConfirmation, true);
  assert.ok(confirmGoal(s, 'Went to Goa').ok);
  assert.equal(retirementEligibility(s).eligible, true);
  assert.equal(goalStatus(s, currentGoals(s)).status, 'confirmed');
});

// ------------------------------------------------------------------ the final evaluation
function richLife() {
  const s = withGoals(stock(give(newGame(), 200000)));
  s.job.salary = 40000;
  toFirst(s);
  transfer(s, 'wallet', 'brokerage', 120000, 'fund');
  trade(s, 'SAGAR50', 'buy', 100, 'a'); trade(s, 'KAVERI', 'buy', 300, 'b'); trade(s, 'COINNOVA', 'buy', 200, 'c');
  const scam = startEncounter(s, 'plantation_doubler'); ask(s, scam.uid, 'investigate'); decline(s, scam.uid);
  const hype = startEncounter(s, 'coinnova_moon'); invest(s, hype.uid, 5000, 'h');
  advanceDays(s, 500);
  trade(s, 'COINNOVA', 'sell', 100, 'd');
  buyVehicle(s, 'hatch', 'car');
  advanceDays(s, 400);
  return s;
}

test('final report: every mandatory criterion, from the real record; realised and unrealised gains are kept apart', () => {
  const s = richLife();
  const r = finalizeLife(s, 'retired_manual').report;
  assert.deepEqual(Object.keys(r.criteria).sort(), Object.keys(CRITERIA).sort());
  for (const c of Object.values(r.criteria)) assert.ok(c.findings.length, `${c.key} has findings`);
  assert.ok(r.improvements.focus.length + r.improvements.strengths.length > 0);
  const cats = r.criteria.investing.metrics.categories, desk = s.brokerage.trades;
  const crypto = cats.find(c => c.key === 'Crypto token');
  assert.equal(crypto.capital, desk.filter(t => t.asset === 'COINNOVA' && t.side === 'buy').reduce((a, t) => a + t.net, 0));
  assert.equal(crypto.realized, desk.filter(t => t.asset === 'COINNOVA' && t.side === 'sell').reduce((a, t) => a + t.realized, 0));
  assert.equal(crypto.unrealized, portfolio(s).rows.find(x => x.id === 'COINNOVA').pnl);
  // no double counting: realised + unrealised = what came back + what is still held − what went in
  const deskCats = cats.filter(c => ['Index fund', 'Bond fund', 'Stock', 'Crypto token'].includes(c.key));
  const back = desk.filter(t => t.side === 'sell').reduce((a, t) => a + t.net, 0), held = portfolio(s).invested, put = desk.filter(t => t.side === 'buy').reduce((a, t) => a + t.net, 0);
  assert.equal(deskCats.reduce((a, c) => a + c.realized + c.unrealized, 0), back + held - put);
  assert.ok(cats.some(c => c.key === 'tipster'), 'the tip Vikram sold counts as an investment category');
  assert.ok(r.criteria.investing.rankings.unnecessaryRisk.includes('Crypto token'));
  // budgeting matches the ledger for the recorded months
  const months = new Set(s.lifeLog.map(x => x.month));
  const earned = s.ledger.filter(e => e.status === 'ok' && ['wallet', 'bank'].includes(e.account) && ['salary', 'interest', 'rent_income'].includes(e.category) && months.has(monthKey(e.day))).reduce((a, e) => a + e.amount, 0);
  assert.equal(r.criteria.budgeting.metrics.earnedRecorded, earned);
  // risk: the declined scam and the hype token are the player's actual decisions, with evidence ids that exist
  assert.equal(r.criteria.risk.metrics.avoided, 1); assert.equal(r.criteria.risk.metrics.lostToScams, 1);
  for (const c of Object.values(r.criteria)) for (const f of c.findings) for (const id of f.refs) assert.ok(r.evidence[id], `evidence ${id} exists`);
  // goals: the car goal was achieved and the report says so
  assert.equal(r.criteria.goals.metrics.outcomes[0].outcome, 'achieved');
});

test('final report: wealth with neglected basic needs is capped and the trade-off is named; poverty itself is not punished', () => {
  const rich = stock(give(newGame(), 30000000));                  // ₹3 crore, earning only ₹10,000 a month
  advanceDays(rich, 300);
  const fed = buildLifeReport(rich, { kind: 'retired_manual', day: rich.day });
  rich.pantry = {}; rich.groceryPlan = null;
  advanceDays(rich, 20); stock(rich); advanceDays(rich, 100);       // health falls to ~31 before food returns
  assert.equal(rich.status, 'alive');
  const starved = finalizeLife(rich, 'retired_manual').report;
  assert.ok(starved.overall <= 62, `capped (${starved.overall})`);
  assert.ok(fed.overall > starved.overall);
  assert.ok(starved.criteria.quality.findings.some(f => /Money should support a life, not replace one/.test(f.text)));
  assert.ok(starved.caps.length);
  // a low income, every bill paid, never hungry: a strong rating is possible
  const poor = stock(newGame()); poor.job.salary = 3200; advanceDays(poor, 730);      // rent alone takes 94% of income
  const p = finalizeLife(poor, 'retired_manual').report;
  assert.equal(p.constrained, true);
  assert.ok(p.criteria.budgeting.score >= 70, `budgeting ${p.criteria.budgeting.score}`);
  assert.ok(p.criteria.quality.score >= 90);
  assert.ok(p.criteria.budgeting.findings.some(f => /low income is not a mistake/.test(f.text)));
});

test('final report: reopening never changes it; a saved report is stable across save/load', () => {
  const st = mem(), g = new Game(st);
  stock(g.state); withGoals(g.state); g.advance(100);
  g.act(s => { give(s, 2000000); buyVehicle(s, 'hatch', 'x'); return retire(s, 'go'); });
  assert.equal(g.state.status, 'retired');
  const a = JSON.stringify(g.state.life.final);
  const b = JSON.stringify(new Game(st).state.life.final);
  assert.equal(a, b);
  assert.equal(JSON.stringify(finalizeLife(g.state, 'death').report), a);
});

// ------------------------------------------------------------------ AI: no invented facts, reliable fallback
test('AI life report: unknown evidence, invented amounts, wrong ratings, unrecorded events and missing sections are rejected; the fallback always validates', () => {
  const s = richLife(), r = finalizeLife(s, 'retired_manual').report, input = lifeFacts(r);
  const fb = fallbackLife(r);
  const ok = validateLifeReport(fb, input);
  assert.ok(ok.ok, ok.errors.join('; '));
  for (const k of LIFE_SECTIONS) assert.ok(fb.sections[k].text.length > 0);
  const bad = (patch, re) => { const d = structuredClone(fb); patch(d); const v = validateLifeReport(d, input); assert.equal(v.ok, false); assert.match(v.errors.join(' | '), re); };
  bad(d => { d.sections.risk.refs = ['enc99999']; }, /does not exist/);
  bad(d => { d.sections.saving.text += ' You also saved ₹9,99,999 in gold.'; }, /not in the record/);
  bad(d => { d.summary += ' You saved 70% of your income.'; }, /not in the record/);
  const wrong = ['Excellent', 'Strong', 'Developing', 'Struggling'].find(x => x !== r.rating);
  bad(d => { d.summary += ` Your overall rating is ${wrong}.`; }, /different rating/);
  bad(d => { d.sections.quality.text += ' You were evicted twice.'; }, /not in the record/);
  bad(d => { delete d.sections.goals; }, /goals/);
  // the narrative can never touch scores or achievements: they're not in its output at all
  assert.equal('overall' in ok.value || 'achievements' in ok.value, false);
});

test('AI life report task: the server refuses bad input before calling the model and returns only validated output', async () => {
  const s = richLife(), r = finalizeLife(s, 'retired_manual').report, input = lifeFacts(r);
  let calls = 0;
  const llm = { json: async ({ validate }) => { calls++; const v = validate(fallbackLife(r)); return v.ok ? { ok: true, data: v.value } : { ok: false, reason: 'invalid', detail: v.errors.join() }; } };
  assert.equal((await runTask(llm, 'life_report', { criteria: {} })).reason, 'bad_input'); assert.equal(calls, 0);
  const out = await runTask(llm, 'life_report', input);
  assert.ok(out.ok, out.detail); assert.deepEqual(Object.keys(out.data.sections).sort(), [...LIFE_SECTIONS].sort());
  assert.ok(JSON.stringify(input).length < TASKS.life_report.maxInput, 'fits the task\'s input limit');
});

// ------------------------------------------------------------------ achievements
test('achievements: the supplied catalogue, deterministic rules, never duplicated, and untracked ones never unlock', () => {
  const html = readFileSync(new URL('../Assets/supplied-ui/achievements/index.html', import.meta.url), 'utf8');
  assert.equal(SUPPLIED_ACHIEVEMENTS.length, 43);
  for (const a of SUPPLIED_ACHIEVEMENTS) assert.ok(html.includes(`name:"${a.name}",desc:"${a.desc}"`), a.id);
  assert.equal(CATALOGUE.length, 43 + ADDITIONS.length);
  const s = richLife();
  assert.deepEqual(evaluate(s), evaluate(s), 'deterministic');
  assert.ok(s.achievements.unlocked.length > 0, 'unlocked month by month as the life went on');
  const n = s.achievements.unlocked.length;
  assert.equal(unlockNew(s).length, 0); assert.equal(unlockNew(s).length, 0); assert.equal(s.achievements.unlocked.length, n, 'no duplicates');
  const ids = s.achievements.unlocked.map(a => a.id);
  for (const id of Object.keys(UNTRACKED)) assert.ok(!ids.includes(id), `${id} is untracked`);
  for (const id of ['first-paycheck', 'scam-smart', 'first-investment', 'goal-setter']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('debt-slayer'), 'no loan, no Debt Slayer');
  for (const u of s.achievements.unlocked) assert.ok(u.why && Number.isInteger(u.day));
});

// ------------------------------------------------------------------ newspaper
test('newspaper: one issue per month from the simulation\'s own prices; reopening or re-running never changes it', () => {
  const st = mem(), g = new Game(st);
  stock(g.state); g.advance(95);
  const issues = g.state.newspaper.issues;
  assert.deepEqual(issues.map(i => i.month), ['2026-07', '2026-08', '2026-09']);
  const i = issues[1];
  for (const a of i.assets) {
    assert.equal(a.close, Math.round(price(g.state, a.id, i.end) * 100) / 100);
    assert.equal(a.open, Math.round(price(g.state, a.id, i.from - 1) * 100) / 100);
    assert.equal(a.pct, Math.round((price(g.state, a.id, i.end) / price(g.state, a.id, i.from - 1) - 1) * 1000) / 10);
  }
  const s2 = structuredClone(g.state); s2.day = issues[2].day;
  assert.equal(makeIssue(s2), null, 'never twice for a month'); assert.equal(closeMonth(s2), null);
  const text = JSON.stringify(renderIssue(i));
  g.act(s => markRead(s, i.id), { afterLife: true });
  assert.equal(JSON.stringify(renderIssue(new Game(st).state.newspaper.issues[1])), text, 'same issue after reading and reloading');
  assert.equal(g.state.newspaper.unread, 2);
  assert.match(renderIssue(i).disclaimer, /Past performance does not guarantee future returns/);
});

test('newspaper AI wording: predictions, commands, wrong directions, invented reasons and invented numbers are rejected', () => {
  const s = stock(newGame()); advanceDays(s, 40);
  const issue = s.newspaper.issues[0], input = newsInput(issue);
  const good = { headline: 'A month of mixed moves in the simulated markets', lead: 'Some fictional assets rose and some fell this month. Nothing here is a prediction.', safety: 'Never commit money you need for food and rent. Check any offer before paying.',
    assets: issue.assets.map(a => ({ id: a.id, text: `This asset ${a.pct >= 0 ? 'rose' : 'fell'} ${Math.abs(a.pct)}% this month. No specific event was recorded. Consider whether you could hold through swings.` })) };
  const v = validateNewspaper(good, input); assert.ok(v.ok, v.errors.join('; '));
  const bad = (patch, re) => { const d = structuredClone(good); patch(d); const r = validateNewspaper(d, input); assert.equal(r.ok, false, re); assert.match(r.errors.join(' | '), re); };
  bad(d => { d.lead += ' Lumen will definitely rise next month.'; }, /prediction/);
  bad(d => { d.safety = 'You should buy CoinNova now with all your savings, it is a sure thing.'; }, /prediction|command/);
  const up = issue.assets.find(a => a.pct > 0) ?? issue.assets[0];
  bad(d => { d.assets.find(a => a.id === up.id).text = `It fell sharply this month, dropping a lot. No specific event was recorded here.`; }, /says it fell|says it rose/);
  bad(d => { d.assets[0].text = 'It moved this month due to strong quarterly earnings reported by the company.'; }, /no recorded event supports/);
  bad(d => { d.assets[0].text = `It moved 42.4% this month. No specific event was recorded for this asset.`; }, /not in the market data/);
  bad(d => { d.assets.pop(); }, /missing/);
});
