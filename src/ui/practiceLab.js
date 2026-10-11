// The academy's PRACTICE LAB (right-hand panel of every lesson) and PRACTICE LIFE (a fictional year
// with a final report). Everything here works on the practice store (src/practice/store.js — its own
// storage key); it never receives the live game state and never calls game.act, so practice can't touch
// the main game's money, ledger, clock, property, loans, vehicles, inventory, health or job.
//
// Exercises follow one cycle: situation → facts & constraints → inspect → decide → apply to the
// isolated simulation → numbers → trade-offs → retry / new scenario → recorded attempt.
// The local AI (optional) only adds wording: Vikram's lines, a coach's note, rubric feedback. Every
// number, score and outcome shown comes from src/practice/* (deterministic and seeded).
import { esc } from './core.js';
import { loadPractice, savePractice, takeSeed, recordAttempt } from '../practice/store.js';
import { practiceFor, EXERCISES } from '../practice/catalog.js';
import { ASSETS, KEYS as ASSET_KEYS, simulate, profile } from '../practice/exercises/investing.js';
import * as V from '../practice/vikram.js';
import * as LIFE from '../practice/life.js';
import { evaluateLife, reportFacts } from '../practice/evaluate.js';
import { ai as defaultAI, numbersIn } from '../ai/client.js';

const inr = n => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const signed = n => `${n < 0 ? '−' : '+'}${inr(Math.abs(n))}`;
const btn = (a, label, { cls = '', disabled = false, data = '' } = {}) => `<button class="lab-btn ${cls}" data-a="${a}" ${data} ${disabled ? 'disabled' : ''}>${label}</button>`;
const numIn = (key, value, { max, label } = {}) => `<input class="lab-num" type="number" inputmode="numeric" min="0" step="100" ${max != null ? `max="${max}"` : ''} data-in="lab" data-k="${key}" value="${Number.isFinite(value) ? value : ''}" aria-label="${esc(label ?? key)}">`;
const errorsHtml = errs => (errs?.length ? `<ul class="lab-errors" role="alert">${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '');
const table = (head, rows, cls = '') => `<div class="lab-table-wrap"><table class="lab-table ${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const section = (title, body, cls = '') => `<section class="lab-sec ${cls}"><h4>${title}</h4>${body}</section>`;
const setPath = (o, k, v) => { const ps = k.split('.'), last = ps.pop(); ps.reduce((x, p) => (x[p] ??= {}), o)[last] = v; };
const parseAmount = v => (v === '' ? NaN : Number(v));

// A small line chart (inline SVG) of values over months.
function spark(values, { mark = null, w = 320, h = 70 } = {}) {
  if (values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 4 - (v - lo) / span * (h - 8)).toFixed(1)}`).join(' ');
  const m = mark != null && mark < values.length ? `<line x1="${(mark / (values.length - 1) * w).toFixed(1)}" y1="0" x2="${(mark / (values.length - 1) * w).toFixed(1)}" y2="${h}" class="spark-mark"/>` : '';
  return `<svg class="lab-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Portfolio value from ${inr(values[0])} to ${inr(values.at(-1))}">${m}<polyline points="${pts}"/></svg>
    <div class="spark-axis"><span>${inr(lo)}</span><span>${inr(hi)}</span></div>`;
}

export class PracticeLab {
  constructor({ storage = globalThis.localStorage, refresh = () => {}, ai = defaultAI } = {}) {
    this.storage = storage;
    this.p = loadPractice(storage);
    this.refresh = refresh;
    this.ai = ai;
    this.ex = null;            // the exercise open in the lab
    this.lifeDraft = null;     // this month's decision being edited
    this.lifeMsg = null;
    this.lifeAI = null;        // { status, text } for the report's coach paragraph
    this.aiState = { available: false, model: null, checked: false };
    ai.check().then(s => { this.aiState = { ...s, checked: true }; this.refresh(); });
  }
  save() { return savePractice(this.storage, this.p); }

  // ---------------------------------------------------------------- progress (separate from reading & the check)
  lessonRecord(courseId, i) { return this.p.lessons[`${courseId}:${i}`] ?? null; }
  courseProgress(courseId, n) {
    const recs = Array.from({ length: n }, (_, i) => this.lessonRecord(courseId, i));
    return { done: recs.filter(r => r?.completedAt).length, tried: recs.filter(Boolean).length, total: n };
  }
  aiBadge() {
    const s = this.aiState;
    return !s.checked ? '<span class="lab-ai off">AI: CHECKING…</span>'
      : s.available ? `<span class="lab-ai on" title="Local model via ${esc(s.runtime)}">AI: ${esc(s.model)} (LOCAL)</span>`
      : '<span class="lab-ai off" title="The local AI service isn\'t reachable — all exercises use built-in content.">AI: OFFLINE — BUILT-IN CONTENT</span>';
  }

  // ---------------------------------------------------------------- lesson exercises
  open(courseId, lessonIndex, lessonTitle) {
    const key = `${courseId}:${lessonIndex}`;
    if (this.ex?.key === key) return;
    this.start(courseId, lessonIndex, lessonTitle);
  }
  start(courseId, lessonIndex, lessonTitle, seed = null) {
    const { exercise, focus, title } = practiceFor(courseId, lessonIndex);
    if (!seed) { seed = takeSeed(this.p); this.save(); }
    const sc = EXERCISES[exercise].create(seed, focus);
    const d = exercise === 'safety' ? null : EXERCISES[exercise].defaults(sc);
    this.ex = { key: `${courseId}:${lessonIndex}`, courseId, lessonIndex, lessonTitle, exercise, focus, title, seed, sc, d, stage: exercise === 'saving' || exercise === 'investing' ? 'plan' : exercise === 'budget' ? 'plan' : 'encounter',
      errors: [], res: null, sco: null, coach: null, reasoning: null, why: '' };
    if (exercise === 'safety') this.requestNarrative(() => this.ex?.sc.encounter, enc => { this.ex.sc = { ...this.ex.sc, encounter: enc }; });
  }

  // Ask the local model for Vikram's wording. Applied only if it validates, isn't a duplicate, and the
  // player hasn't started acting on this encounter — the facts never change.
  requestNarrative(getEnc, apply) {
    const enc = getEnc();
    if (!enc) return;
    const input = { seed: Number(String(enc.seed).replace(/\D/g, '').slice(0, 9)) || 1,
      encounter: { category: enc.category, archetype: enc.archetype, facts: { provider: enc.facts.provider, product: enc.facts.product, amounts: enc.facts.amounts, claims: enc.facts.claims, outcome: { kind: enc.facts.outcome.kind }, evidence: enc.facts.evidence } } };
    enc.narrative = { ...enc.narrative, pending: true };
    this.ai.task('vikram_narrative', input, { validateWith: d => V.validateNarrative(enc, d) }).then(r => {
      const cur = getEnc();
      if (!cur || cur.id !== enc.id) return;
      cur.narrative = { ...cur.narrative, pending: false };
      if (r.ok && !cur.revealed.length && !cur.decision) {
        const w = V.withNarrative(cur, r.data, this.p.vikram.seen);
        if (w.applied) { apply(w.enc); this.p.vikram.seen.push(w.enc.fingerprint); if (this.p.vikram.seen.length > 300) this.p.vikram.seen.shift(); this.save(); }
      }
      this.refresh();
    });
  }

  requestCoach(ex) {
    const s = ex.sco;
    ex.coach = { status: 'pending' };
    this.ai.task('explain', { exercise: ex.title, lesson: ex.lessonTitle ?? '', score: s.score, points: s.points, allowedNumbers: numbersIn(s.points, s.score, s.luckNote ?? '') }).then(r => {
      if (this.ex !== ex) return;
      ex.coach = r.ok ? { status: 'ok', ...r.data } : { status: 'none', reason: r.reason };
      this.refresh();
    });
  }

  finish(ex, res, sco) {
    ex.res = res; ex.sco = sco; ex.stage = 'result'; ex.errors = [];
    recordAttempt(this.p, ex.courseId, ex.lessonIndex, sco);
    if (ex.exercise === 'safety') this.p.vikram.log.push({ seed: ex.seed, id: ex.sc.encounter.id, category: ex.sc.encounter.category, decision: ex.sc.encounter.decision, score: sco.score });
    if (this.p.vikram.log.length > 100) this.p.vikram.log.shift();
    this.save();
    this.requestCoach(ex);
  }

  labHtml(courseId, lessonIndex, lessonTitle) {
    this.open(courseId, lessonIndex, lessonTitle);
    const ex = this.ex, rec = this.lessonRecord(courseId, lessonIndex);
    const body = ex.exercise === 'budget' ? this.budgetHtml(ex) : ex.exercise === 'saving' ? this.savingHtml(ex) : ex.exercise === 'investing' ? this.investHtml(ex) : this.safetyHtml(ex);
    return { ex, rec, body };
  }

  // ---- Exercise A: budgeting
  budgetHtml(ex) {
    const B = EXERCISES.budget, sc = ex.sc, d = ex.d;
    if (ex.stage === 'result') return this.budgetResult(ex);
    const c = B.check(sc, d), have = B.available(sc);
    const facts = table(['', 'Amount', 'When'], [
      ['Cash you start the month with', inr(sc.opening), 'day 1'],
      ['Income (pay)', inr(sc.income), `day ${sc.payday}${sc.payday > 1 ? ' — <b class="warn">late in the month</b>' : ''}`],
      ['<b>Available this month</b>', `<b>${inr(have)}</b>`, ''],
    ]);
    if (ex.stage === 'shock') {
      const sh = B.checkShock(sc, d), fund = sc.emergency.have + d.emergency, wants = Object.values(d.wants).reduce((a, b) => a + b, 0);
      return `<p class="lab-lead">Budget committed. Then, on day ${sc.shock.day}:</p>
        <div class="lab-alert"><b>Unexpected: ${esc(sc.shock.name)}</b> — costs <b>${inr(sc.shock.amount)}</b>.</div>
        <p class="lab-note">Unallocated money (${inr(Math.max(0, c.left))}) is used first. Decide how to cover the rest — anything left uncovered must be borrowed at a ${pct(sc.borrowFee)} fee.</p>
        ${table(['Cover it from', 'Available', 'Use'], [
          ['Emergency fund', inr(fund), numIn('shock.emergency', d.shock.emergency, { max: fund, label: 'From the emergency fund' })],
          ['Cut flexible spending', inr(wants), numIn('shock.wants', d.shock.wants, { max: wants, label: 'Cut flexible spending' })],
          ['Pause the goal saving', inr(d.goal), numIn('shock.goal', d.shock.goal, { max: d.goal, label: 'Take from goal saving' })],
        ])}
        <p class="lab-sum">Covered: ${inr(Math.min(sc.shock.amount, d.shock.emergency + d.shock.wants + d.shock.goal + Math.max(0, c.left)))} of ${inr(sc.shock.amount)} · <span class="${sh.borrowed ? 'bad' : 'good'}">to borrow: ${inr(sh.borrowed)}</span></p>
        ${errorsHtml(ex.errors.length ? ex.errors : sh.errors)}
        <div class="lab-actions">${btn('lab-run', 'PLAY THE MONTH ▶', { cls: 'primary', disabled: !sh.ok })}${btn('lab-back', 'CHANGE BUDGET')}</div>`;
    }
    const bills = table(['Essential bill', 'Due', 'Bill', 'You pay'], sc.bills.map(b => [esc(b.name), `day ${b.due}`, inr(b.amount), numIn(`bills.${b.id}`, d.bills[b.id], { max: b.amount, label: b.name })])
      .concat([['Food (to eat properly)', `day ${sc.food.due}`, inr(sc.food.need), numIn('food', d.food, { label: 'Food' })]]));
    const wants = table(['Flexible spending', 'Typical', 'You plan'], sc.wants.map(w => [esc(w.name) + (w.oneOff ? ' <span class="tag">one-off</span>' : ''), inr(w.suggested), numIn(`wants.${w.id}`, d.wants[w.id], { label: w.name })]));
    const goals = table(['Saving', 'Status', 'Put in'], [
      [`Goal: ${esc(sc.goal.name)}`, `${inr(sc.goal.saved)} of ${inr(sc.goal.target)} — ${inr(sc.goal.monthly)}/month to finish in ${sc.goal.months} months`, numIn('goal', d.goal, { label: 'Goal saving' })],
      ['Emergency fund', `${inr(sc.emergency.have)} now · starter target ${inr(sc.emergency.target)}`, numIn('emergency', d.emergency, { label: 'Emergency fund' })],
    ]);
    const over = c.left < 0;
    return `<p class="lab-lead">${esc(ex.sc.brief)}</p>${facts}
      ${sc.lastMonth ? `<p class="lab-note">Last month you planned ${inr(sc.lastMonth.planned)} of essentials but actually spent ${inr(sc.lastMonth.actual)}.</p>` : ''}
      ${bills}${wants}${goals}
      <p class="lab-sum" data-testid="lab-left">Allocated ${inr(c.total)} of ${inr(have)} · <span class="${over ? 'bad' : 'good'}">${over ? `over by ${inr(-c.left)}` : `unallocated ${inr(c.left)}`}</span></p>
      ${errorsHtml(c.errors)}
      <div class="lab-actions">${btn('lab-commit', 'COMMIT BUDGET ▶', { cls: 'primary', disabled: !c.ok })}</div>`;
  }
  budgetResult(ex) {
    const r = ex.res, sc = ex.sc;
    const ev = table(['Day', 'What happened', 'Amount'], r.events.map(e => [e.day, esc(e.text), `<span class="${e.amount < 0 ? 'bad' : 'good'}">${signed(e.amount)}</span>`]));
    const nums = table(['Result', ''], [
      ['Cash left at month end', inr(r.endCash)], ['Late fees', inr(r.lateFees)], ['Borrowed for the surprise (+ fee)', `${inr(r.borrowed)} (+${inr(r.borrowCost)})`],
      ['Emergency fund now', `${inr(r.emergencyEnd)} of ${inr(sc.emergency.target)} target`], ['Goal fund now', `${inr(r.goalSaved)} of ${inr(sc.goal.target)}`],
      ['Essential bills unpaid / food short', `${inr(r.essentialsShort)} / ${inr(r.foodShort)}`],
    ]);
    return section('THE MONTH, DAY BY DAY', ev) + section('WHERE YOU ENDED UP', nums) + this.scoreHtml(ex);
  }

  // ---- Exercise B: saving
  savingHtml(ex) {
    const S = EXERCISES.saving, sc = ex.sc, d = ex.d;
    if (ex.stage === 'result') return this.savingResult(ex);
    const c = S.check(sc, d), placed = (d.cash || 0) + (d.savings || 0) + (d.fd || 0);
    const rates = table(['Where', 'Interest', 'Access'], [
      ['Cash at home', '0%', 'any time'],
      ['Savings account', `${pct(sc.savingsRate, 1)} a year`, 'any time'],
      ...sc.fdTerms.map((t, i) => [`Fixed deposit, ${t.months} months`, `${pct(t.rate, 2)} a year`, `<span class="warn">locked</span> — break early: ${pct(sc.fdPenalty)} less interest${i === d.fdTerm ? ' ◀' : ''}`]),
    ]);
    return `<p class="lab-lead">${esc(sc.brief)}</p>
      ${table(['Your situation', ''], [['Money to place now', `<b>${inr(sc.lump)}</b>`], ['You can save each month', inr(sc.monthly)], ['Your essentials cost', `${inr(sc.essentials)} a month`],
        ['Planned purchase', `${esc(sc.purchase.name)}: ${inr(sc.purchase.amount)} in month ${sc.purchase.month}`], ['Period', `${sc.months} months · inflation ${pct(sc.inflation)} a year`], ['Something unexpected', 'may happen — you won\'t know when']])}
      ${rates}
      ${table(['Place the money', 'Amount'], [
        ['Cash (accessible, 0%)', numIn('cash', d.cash, { label: 'Cash' })],
        ['Savings account (accessible)', numIn('savings', d.savings, { label: 'Savings account' })],
        ['Fixed deposit (locked)', `${numIn('fd', d.fd, { label: 'Fixed deposit' })} <select class="lab-sel" data-in="lab" data-k="fdTerm" aria-label="FD term">${sc.fdTerms.map((t, i) => `<option value="${i}" ${i === d.fdTerm ? 'selected' : ''}>${t.months} months</option>`).join('')}</select>`],
        ['Monthly savings go to', `<select class="lab-sel" data-in="lab" data-k="monthlyTo" aria-label="Monthly savings go to"><option value="savings" ${d.monthlyTo === 'savings' ? 'selected' : ''}>savings account</option><option value="cash" ${d.monthlyTo === 'cash' ? 'selected' : ''}>cash</option></select>`],
      ])}
      <p class="lab-sum">Placed ${inr(placed)} of ${inr(sc.lump)} · accessible ${inr((d.cash || 0) + (d.savings || 0))} · <span class="warn">locked ${inr(d.fd || 0)}</span></p>
      ${errorsHtml(c.errors)}
      <div class="lab-actions">${btn('lab-run', `RUN ${sc.months} MONTHS ▶`, { cls: 'primary', disabled: !c.ok })}</div>`;
  }
  savingResult(ex) {
    const r = ex.res, sc = ex.sc;
    const rows = table(['Month', 'Cash', 'Savings (accessible)', 'FD (locked)', 'Debt'], r.rows.map(m => [m.month, inr(m.cash), inr(m.savings), m.fd ? inr(m.fd) : '—', m.debt ? `<span class="bad">${inr(m.debt)}</span>` : '—']), 'compact');
    const ev = r.events.length ? `<ul class="lab-list">${r.events.map(e => `<li><b>Month ${e.month}:</b> ${esc(e.text)}</li>`).join('')}</ul>` : '';
    const alts = table(['Plan (same months, same events)', 'Final', 'Borrowed?'], EXERCISES.saving.alternatives(sc).map(a => [esc(a.label), inr(a.result.total), a.result.borrowCost ? `<span class="bad">yes (${inr(a.result.borrowCost)} interest)</span>` : 'no']));
    const nums = table(['Result', ''], [['Final total (cash + savings + FD − debt)', `<b>${inr(r.total)}</b>`], ['Interest earned', inr(r.interest)], ['FD early-break penalty', inr(r.penalty)],
      ['Borrowing interest', inr(r.borrowCost)], ['Worth in today\'s money (after inflation)', inr(r.realTotal)], ['Lowest accessible balance', inr(r.minLiquid)]]);
    return section('WHAT HAPPENED', ev + rows) + section('THE NUMBERS', nums) + section('COMPARE: OTHER PLANS', alts + '<p class="lab-note">Locking more money earns more — until you need it early.</p>') + this.scoreHtml(ex);
  }

  // ---- Exercise C: investing
  investHtml(ex) {
    const I = EXERCISES.investing, sc = ex.sc, d = ex.d;
    if (ex.stage === 'result') return this.investResult(ex);
    if (ex.stage === 'fall') {
      const sim = simulate(sc, { ...d, reaction: 'hold' }), upTo = sim.values.slice(0, sc.crashMonth + 1), peak = Math.max(...upTo);
      return `<p class="lab-lead">Month ${sc.crashMonth} of ${sc.months}: <b>markets fell sharply.</b></p>
        ${spark(upTo)}
        ${table(['Your portfolio', ''], [['Value now', `<b>${inr(sim.fallValue)}</b>`], ['Highest so far', inr(peak)], ['Fall from the high', `<span class="bad">${pct(1 - sim.fallValue / peak, 1)}</span>`], ['Goal', `${esc(sc.goal.name)} — ${sc.months - sc.crashMonth} months left`]])}
        <p class="lab-note">What do you do? Nobody knows what happens next.</p>
        <div class="lab-actions col">${btn('lab-react', 'HOLD — stick to the plan', { data: 'data-v="hold"' })}${btn('lab-react', 'REBALANCE — back to my chosen mix', { data: 'data-v="rebalance"' })}${btn('lab-react', 'SELL — move everything risky to cash', { cls: 'danger', data: 'data-v="sell"' })}</div>`;
    }
    const c = I.check(sc, d), total = ASSET_KEYS.reduce((s, k) => s + (d.alloc[k] || 0), 0), pr = c.ok ? profile(d.alloc) : null;
    const rows = ASSET_KEYS.map(k => { const A = ASSETS[k]; return `<div class="lab-slider"><div class="ls-name"><b>${esc(A.name)}</b><span>${esc(A.about)}</span>
        <span class="ls-meta">expected ~${pct(A.mu)}/yr · swings ±${pct(A.vol)} · fee ${pct(A.fee, 1)}${A.liquid ? '' : ' · <span class="warn">hard to sell</span>'}</span></div>
        <input type="range" min="0" max="100" step="5" value="${d.alloc[k]}" class="square-pixel-slider" data-in="lab" data-k="alloc.${k}" aria-label="${esc(A.name)} percent"><span class="row-value-pill">${d.alloc[k]}%</span></div>`; }).join('');
    return `<p class="lab-lead">${esc(sc.brief)}</p>
      ${table(['Your situation', ''], [['Goal', esc(sc.goal.name)], ['Time horizon', `${sc.goal.years} year(s) — ${sc.months} months`], ['To invest', `${inr(sc.credits)} fictional credits${sc.monthly ? ` + ${inr(sc.monthly)} every month (SIP)` : ''}`]])}
      <div class="lab-sliders">${rows}</div>
      <p class="lab-sum">Allocated ${total}% of 100% ${total === 100 ? '<span class="good">[BALANCED]</span>' : total > 100 ? '<span class="bad">[OVER]</span>' : `<span class="warn">[${100 - total}% LEFT]</span>`}</p>
      ${pr ? `<p class="lab-note">This mix: expected about ${pct(pr.expected, 1)} a year after fees, typical yearly swing ±${pct(pr.vol)}. Expected ≠ guaranteed — a higher expected return comes with bigger swings, and one path can turn out far better or worse.</p>` : ''}
      ${errorsHtml(c.errors.filter(e => !/react/.test(e)))}
      <div class="lab-actions">${btn('lab-invest', 'INVEST AND START THE CLOCK ▶', { cls: 'primary', disabled: !c.ok })}</div>`;
  }
  investResult(ex) {
    const r = ex.res, sc = ex.sc, L = r.luck;
    const nums = table(['Result', ''], [['Paid in', inr(r.contributed)], ['Final value', `<b>${inr(r.end)}</b> (${signed(r.gain)}, ${pct(r.ret, 1)})`], ['Fees paid', inr(r.fees)],
      ['Biggest fall from a high', pct(r.maxDD, 1)], ...(r.soldAt ? [['Sold at the bottom for', `${inr(r.soldAt)} — loss locked in: <span class="bad">${inr(r.lockedLoss)}</span>`]] : [])]);
    const luck = table(['Same mix on 200 other market paths (held)', ''], [['Worst / best', `${inr(L.worst)} / ${inr(L.best)}`], ['10% / median / 90%', `${inr(L.p10)} / ${inr(L.median)} / ${inr(L.p90)}`],
      ['Chance of ending below what you paid in', pct(L.lossChance)], ['Your path vs the others', `better than ${pct(L.rank)}`]]);
    const rs = ex.reasoning;
    const why = `<textarea class="notes-box" data-in="lab-why" maxlength="1500" placeholder="In a few sentences: why this mix for this goal and horizon? What risks remain? What costs apply?" aria-label="Explain your choice">${esc(ex.why)}</textarea>
      <div class="lab-actions">${btn('lab-reason', rs?.status === 'pending' ? 'READING…' : 'GET FEEDBACK ON MY REASONING', { disabled: !ex.why.trim() || rs?.status === 'pending' || !this.aiState.available })}</div>
      ${!this.aiState.available ? '<p class="lab-note">Feedback on written reasoning needs the local AI service. Your score above doesn\'t depend on it.</p>' : ''}
      ${rs?.status === 'ok' ? `<div class="lab-coach"><span class="coach-tag">AI FEEDBACK — ADVISORY, NOT SCORED</span><ul class="lab-list">${rs.criteria.map(c => `<li>${c.met ? '✔' : '✘'} ${esc(REASON_RUBRIC.find(x => x.id === c.id)?.text ?? c.id)}${c.quote ? ` — “${esc(c.quote)}”` : ''}</li>`).join('')}</ul><p>${esc(rs.feedback)}</p></div>` : ''}
      ${rs?.status === 'none' ? `<p class="lab-note">No AI feedback this time (${esc(rs.reason)}).</p>` : ''}`;
    return section('YOUR PORTFOLIO OVER TIME', spark(r.values, { mark: r.fallMonth }) + `<p class="lab-note">Line = value each month; the marker is the market fall (month ${r.fallMonth}).</p>`)
      + section('THE NUMBERS', nums) + section('SKILL OR LUCK?', luck + `<p class="lab-note">${esc(ex.sco.luckNote)}</p>`) + this.scoreHtml(ex) + section('EXPLAIN YOUR CHOICE (OPTIONAL)', why);
  }

  // ---- Exercise D: financial safety (one Vikram encounter)
  safetyHtml(ex) {
    const enc = ex.sc.encounter;
    if (ex.stage === 'result') return this.encounterResult(ex.sco.evaluation) + this.scoreHtml(ex, { noPoints: true });
    return `<p class="lab-lead">${esc(ex.sc.brief)}</p>
      ${table(['Your situation (fictional)', ''], [['Money you could reach', inr(ex.sc.profile.liquid)], ['Emergency reserve you want to keep', inr(ex.sc.profile.reserveTarget)], ['Monthly income', inr(ex.sc.profile.income)]])}
      ${this.encounterHtml(enc, ex.errors)}`;
  }

  encounterHtml(enc, errors = []) {
    const n = enc.narrative, f = enc.facts;
    const found = enc.revealed.map(k => `<li><b>${esc(V.ACTIONS[k])}:</b> ${esc(f.evidence[k].fact)}${n.reactions?.[k] ? `<br><i>Vikram: “${esc(n.reactions[k])}”</i>` : ''}</li>`).join('');
    const left = Object.keys(V.ACTIONS).filter(k => !enc.revealed.includes(k));
    return `<div class="lab-vikram"><img src="art/ui/vikram.svg" alt="Vikram" class="vk-portrait">
        <div class="vk-say"><span class="coach-tag">VIKRAM · ${esc(n.scene)}${n.source === 'model' ? ' · AI-WRITTEN LINES' : n.pending ? ' · …' : ''}</span><p data-testid="vikram-pitch">“${esc(n.pitch)}”</p></div></div>
      ${table(['The offer', ''], [['From', esc(f.provider)], ['What', esc(f.product)]])}
      ${section(`WHAT YOU'VE CHECKED (${enc.revealed.length}/${Object.keys(V.ACTIONS).length})`, found ? `<ul class="lab-list" data-testid="evidence">${found}</ul>` : '<p class="lab-note">Nothing yet. Checking costs nothing but a moment.</p>')}
      ${left.length ? `<div class="lab-actions wrap">${left.map(k => btn('lab-inspect', esc(V.ACTIONS[k].toUpperCase()), { data: `data-v="${k}"` })).join('')}</div>` : ''}
      ${errorsHtml(errors)}
      <p class="lab-note">Decide when you're ready:</p>
      <div class="lab-actions">${Object.entries(V.DECISIONS).map(([k, v]) => btn('lab-decide', v.toUpperCase(), { cls: k === 'accept' ? 'primary' : k === 'report' ? 'danger' : '', data: `data-v="${k}"` })).join('')}</div>`;
  }

  encounterResult(ev) {
    return `<div class="lab-verdict ${ev.score >= 70 ? 'good' : ev.score >= 45 ? 'mid' : 'bad'}"><b>${esc(ev.classification.toUpperCase())}</b><p>${esc(ev.verdict)}</p></div>
      ${section('THE EVIDENCE', table(['Check', 'What it showed', 'You saw it?'], ev.evidence.map(e => [esc(e.action), `<span class="sig-${e.signal}">${e.signal === 'red' ? '⚠ ' : e.signal === 'green' ? '✔ ' : 'ℹ '}</span>${esc(e.fact)}`, e.seen ? 'yes' : '<span class="warn">no</span>'])))}
      ${section('WHAT HAPPENED', `<p>${esc(ev.consequences || 'Nothing changed hands.')}</p>${ev.expected != null ? `<p class="lab-note">On average this kind of offer returns ${signed(ev.expected)} — the result you got is one draw, not a guarantee either way.</p>` : ''}
        <p class="lab-note">Suitability for you: ${esc(ev.suitability.why)}.</p><p class="lab-note">Was more checking appropriate? ${esc(ev.verificationAppropriate)}</p>`)}
      ${ev.identified.length ? section('WARNING SIGNS YOU FOUND', `<ul class="lab-list">${ev.identified.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}
      ${ev.missed.length ? section('WARNING SIGNS YOU MISSED', `<ul class="lab-list">${ev.missed.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}
      ${section('NEXT TIME', `<ul class="lab-list">${ev.nextTime.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`)}`;
  }

  scoreHtml(ex, { noPoints = false } = {}) {
    const s = ex.sco, c = ex.coach;
    const pts = noPoints ? '' : table(['What was scored', 'Points', 'Why'], s.points.map(p => [esc(p.label), `${p.earned}/${p.max}`, esc(p.why)]));
    const coach = c?.status === 'pending' ? '<p class="lab-note">The coach is writing a note…</p>'
      : c?.status === 'ok' ? `<div class="lab-coach"><span class="coach-tag">COACH'S NOTE — LOCAL AI, USING ONLY THE NUMBERS ABOVE</span><p>${esc(c.explanation)}</p>${c.misconception ? `<p><b>Watch out for:</b> ${esc(c.misconception)}</p>` : ''}${c.tip ? `<p><b>Tip:</b> ${esc(c.tip)}</p>` : ''}</div>` : '';
    return `<div class="lab-score" data-testid="lab-score"><span class="ls-num">${s.score}</span><span class="ls-of">/100 PRACTICE SCORE</span></div>
      ${pts}
      ${s.wentWell?.length ? section('WENT WELL', `<ul class="lab-list good">${s.wentWell.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}
      ${s.improve?.length ? section('COULD IMPROVE', `<ul class="lab-list warnl">${s.improve.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}
      ${coach}
      <div class="lab-actions">${btn('lab-retry', 'RETRY THIS SCENARIO')}${btn('lab-new', 'NEW SCENARIO ▶', { cls: 'primary' })}</div>
      <p class="lab-note seed">Scenario ${esc(ex.exercise)}/${esc(ex.focus)} · seed ${esc(ex.seed)} — the same seed always replays the same situation.</p>`;
  }

  // ---------------------------------------------------------------- lab events
  onInput(el) {
    if (el.dataset.in === 'lab-why' && this.ex) { this.ex.why = el.value.slice(0, 1500); return; }
    if (el.dataset.in === 'life') return this.lifeInput(el);
    const ex = this.ex;
    if (!ex || el.dataset.in !== 'lab' || !ex.d) return;
    const k = el.dataset.k;
    if (k === 'monthlyTo') ex.d.monthlyTo = el.value;
    else if (k === 'fdTerm') ex.d.fdTerm = Number(el.value);
    else setPath(ex.d, k, parseAmount(el.value));
    ex.errors = [];
  }

  onAction(a, el) {
    const ex = this.ex;
    if (a.startsWith('life')) return this.lifeAction(a, el);
    if (!ex) return;
    const E = EXERCISES[ex.exercise];
    switch (a) {
      case 'lab-commit': if (E.check(ex.sc, ex.d).ok) ex.stage = 'shock'; break;
      case 'lab-back': ex.stage = 'plan'; ex.errors = []; break;
      case 'lab-run': {
        const r = E.run(ex.sc, ex.d);
        if (!r.ok) { ex.errors = r.errors; break; }
        this.finish(ex, r, E.score(ex.sc, ex.d, r));
        break;
      }
      case 'lab-invest': if (E.check(ex.sc, ex.d).ok) ex.stage = 'fall'; break;
      case 'lab-react': {
        ex.d.reaction = el.dataset.v;
        const r = E.run(ex.sc, ex.d);
        if (r.ok) this.finish(ex, r, E.score(ex.sc, ex.d, r));
        break;
      }
      case 'lab-inspect': ex.sc = E.reveal(ex.sc, el.dataset.v); break;
      case 'lab-decide': {
        const sc = E.decide(ex.sc, el.dataset.v);
        if (!sc.encounter.decision) break;
        ex.sc = sc;
        this.finish(ex, null, E.score(sc));
        break;
      }
      case 'lab-retry': this.start(ex.courseId, ex.lessonIndex, ex.lessonTitle, ex.seed); break;
      case 'lab-new': this.start(ex.courseId, ex.lessonIndex, ex.lessonTitle); break;
      case 'lab-reason': {
        if (!ex.why.trim()) break;
        ex.reasoning = { status: 'pending' };
        this.ai.task('reasoning', { question: `Why did you choose this portfolio for "${ex.sc.goal.name}" over ${ex.sc.goal.years} year(s)?`, answer: ex.why, rubric: REASON_RUBRIC }).then(r => {
          if (this.ex !== ex) return;
          ex.reasoning = r.ok ? { status: 'ok', ...r.data } : { status: 'none', reason: r.reason };
          this.refresh();
        });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- PRACTICE LIFE (Exercise E)
  get life() { return this.p.life; }
  newLife(seed = null) {
    if (!seed) seed = takeSeed(this.p);
    this.p.life = LIFE.startFirstEncounter(LIFE.createLife(seed));
    this.lifeDraft = LIFE.emptyDecision(); this.lifeMsg = null; this.lifeAI = null;
    this.save();
    this.lifeNarrative();
  }
  lifeNarrative() {
    const L = this.p.life;
    if (L?.encounter && !L.encounter.decision && L.encounter.narrative.source !== 'model') this.requestNarrative(() => this.p.life?.encounter, enc => { this.p.life = { ...this.p.life, encounter: enc }; this.save(); });
  }

  lifeInput(el) {
    this.lifeDraft ??= LIFE.emptyDecision();
    setPath(this.lifeDraft, el.dataset.k, parseAmount(el.value));
    this.lifeMsg = null;
  }

  lifeAction(a, el) {
    const L = this.p.life;
    switch (a) {
      case 'life-new': this.newLife(); break;
      case 'life-replay': this.newLife(L?.seed ?? null); break;
      case 'life-suggest': this.lifeDraft = LIFE.suggestDecision(L); this.lifeMsg = null; break;
      case 'life-clear': this.lifeDraft = LIFE.emptyDecision(); this.lifeMsg = null; break;
      case 'life-month': {
        const r = LIFE.stepMonth(L, this.lifeDraft);
        if (!r.ok) { this.lifeMsg = { kind: 'error', errors: r.errors }; break; }
        this.p.life = r.life; this.lifeMsg = null;
        this.lifeDraft = { ...LIFE.emptyDecision(), food: this.lifeDraft.food, leisure: this.lifeDraft.leisure, reserve: this.lifeDraft.reserve, goal: this.lifeDraft.goal, index: this.lifeDraft.index, risky: this.lifeDraft.risky };
        if (r.life.done) this.finishLife();
        this.save();
        this.lifeNarrative();
        break;
      }
      case 'life-inspect': { const r = LIFE.encounterAct(L, el.dataset.v); if (r.ok) { this.p.life = r.life; this.save(); } break; }
      case 'life-decide': {
        const r = LIFE.encounterDecide(L, el.dataset.v);
        if (!r.ok) { this.lifeMsg = { kind: 'error', errors: r.errors ?? [r.reason] }; break; }
        this.p.life = r.life; this.lifeMsg = { kind: 'encounter', evaluation: r.evaluation }; this.save();
        break;
      }
      case 'life-dismiss': this.p.life = { ...L, encounter: null }; this.lifeMsg = null; this.save(); break;
    }
  }

  finishLife() {
    const L = this.p.life, report = evaluateLife(L);
    this.p.runs.push({ id: `run-${L.seed}-${this.p.runs.length + 1}`, seed: L.seed, finishedAt: Date.now(), report });
    if (this.p.runs.length > 20) this.p.runs.shift();
    this.requestLifeFeedback(report);
  }
  requestLifeFeedback(report) {
    this.lifeAI = { status: 'pending' };
    this.ai.task('life_feedback', { report, ...reportFacts(report) }).then(r => {
      this.lifeAI = r.ok ? { status: 'ok', ...r.data } : { status: 'none', reason: r.reason };
      this.refresh();
    });
  }
  get lastReport() { return this.p.runs.at(-1)?.report ?? null; }

  // left column of the practice-life screen
  lifeLeftHtml() {
    const L = this.p.life;
    if (!L) return `<p class="lab-lead">Live twelve fictional months: a job, rent, food, a goal, surprises, a market fall and Vikram's offers. Every decision is yours — and none of it touches your real game.</p>
      <ul class="lab-list"><li>Money, prices and outcomes are calculated by the game, seeded so a run can be replayed exactly.</li><li>The final report judges your decisions and your quality of life, not just the money you end with.</li></ul>
      <div class="lab-actions">${btn('life-new', 'START A PRACTICE LIFE ▶', { cls: 'primary' })}</div>`;
    if (L.done) return this.reportHtml(this.lastReport, L);
    const s = L.scenario, d = this.lifeDraft ??= LIFE.emptyDecision(), c = LIFE.checkDecision(L, d);
    const pending = L.encounter && !L.encounter.decision;
    const plan = table(['This month', 'Amount'], [
      ['<b>Income</b>', inr(s.income)], ['Cash carried over', inr(L.cash)],
      ['Rent + transport + utilities (paid first, automatically)', `−${inr(s.rent + s.transport + s.utilities)}`],
      ...L.commitments.map(m => [`${m.kind === 'rd' ? 'Recurring deposit' : 'Index SIP'} you signed up for`, `−${inr(m.monthly)}`]),
      ...(L.debt ? [[`Debt owed (4% interest a month)`, `<span class="bad">${inr(L.debt)}</span>`]] : []),
    ]);
    const take = table(['Withdraw from', 'Holds', 'Take'], [
      ['Emergency reserve', inr(L.reserve), numIn('withdraw.reserve', d.withdraw.reserve, { max: L.reserve, label: 'Withdraw from reserve' })],
      ['Goal fund', inr(L.goalFund), numIn('withdraw.goal', d.withdraw.goal, { max: L.goalFund, label: 'Withdraw from goal fund' })],
      ['Index fund', inr(L.invest.index), numIn('withdraw.index', d.withdraw.index, { max: L.invest.index, label: 'Sell index fund' })],
      ['Single-company shares', inr(L.invest.risky), numIn('withdraw.risky', d.withdraw.risky, { max: L.invest.risky, label: 'Sell shares' })],
    ]);
    const spend = table(['Spend or save', 'Guide', 'Amount'], [
      ['Food', `need ${inr(s.foodNeed)}`, numIn('food', d.food, { label: 'Food' })],
      ['Leisure & social life', 'some keeps stress down', numIn('leisure', d.leisure, { label: 'Leisure' })],
      ['To emergency reserve', `target ${inr(3 * s.essentials)} (3 months)`, numIn('reserve', d.reserve, { label: 'To reserve' })],
      ['To goal fund', `${esc(s.goal.name)}: ${inr(s.goal.target)}`, numIn('goal', d.goal, { label: 'To goal' })],
      ['Invest: index fund', 'diversified, swings', numIn('index', d.index, { label: 'Invest in index fund' })],
      ['Invest: single company', 'concentrated, big swings', numIn('risky', d.risky, { label: 'Invest in one company' })],
      ...(L.debt ? [['Repay debt', `owe ${inr(L.debt)}`, numIn('repay', d.repay, { label: 'Repay debt' })]] : []),
    ]);
    const last = L.log.at(-1);
    return `<p class="lab-lead">Month ${L.month} of ${LIFE.MONTHS}. Plan the month, then live it. Surprises arrive after you commit.</p>
      ${pending ? '<div class="lab-alert">Vikram has an offer for you — deal with it first (right).</div>' : ''}
      ${plan}${take}${spend}
      <p class="lab-sum" data-testid="life-left">${c.ok ? `<span class="good">Left unplanned: ${inr(c.left)}</span> (stays as cash)` : `<span class="bad">Plan doesn't fit</span>`} · after bills you have ${inr(Math.max(0, c.afterBills))}</p>
      ${errorsHtml(this.lifeMsg?.kind === 'error' ? this.lifeMsg.errors : c.errors)}
      <div class="lab-actions">${btn('life-month', `LIVE MONTH ${L.month} ▶`, { cls: 'primary', disabled: !c.ok || pending })}${btn('life-suggest', 'START FROM A SIMPLE PLAN')}${btn('life-clear', 'CLEAR')}</div>
      ${last ? section(`LAST MONTH (MONTH ${last.month})`, `<ul class="lab-list">${last.events.map(e => `<li>${esc(e.text)}</li>`).join('') || '<li>A quiet month.</li>'}</ul>`) : ''}`;
  }

  // right column: status + Vikram
  lifeRightHtml() {
    const L = this.p.life;
    if (!L) return this.runsHtml();
    const bar = (label, v, good = true) => `<div class="lab-bar"><span>${label}</span><div class="lb-track"><div class="lb-fill ${good ? (v >= 60 ? 'g' : v >= 35 ? 'y' : 'r') : (v <= 40 ? 'g' : v <= 65 ? 'y' : 'r')}" style="width:${v}%"></div></div><b>${v}</b></div>`;
    const status = `${table(['You (fictional)', ''], [['Cash', inr(L.cash)], ['Emergency reserve', inr(L.reserve)], ['Goal fund', inr(L.goalFund)], ['Investments', inr(L.invest.index + L.invest.risky)],
      ...(L.rd ? [['Recurring deposit', inr(L.rd)]] : []), ['Debt', L.debt ? `<span class="bad">${inr(L.debt)}</span>` : '—'], ['Net worth', `<b>${inr(LIFE.netWorth(L))}</b>`], ['Health insurance', L.insured ? 'yes' : 'no']])}
      ${bar('HEALTH', L.health)}${bar('STRESS', L.stress, false)}${bar('QUALITY OF LIFE', L.qol)}`;
    let vik = '';
    if (L.encounter && !L.encounter.decision) vik = section('VIKRAM APPROACHES', this.encounterHtml(L.encounter, this.lifeMsg?.kind === 'error' ? this.lifeMsg.errors : []).replaceAll('data-a="lab-inspect"', 'data-a="life-inspect"').replaceAll('data-a="lab-decide"', 'data-a="life-decide"'));
    else if (this.lifeMsg?.kind === 'encounter') vik = section('VIKRAM — HOW IT WENT', this.encounterResult(this.lifeMsg.evaluation) + `<div class="lab-actions">${btn('life-dismiss', 'BACK TO MY MONTH')}</div>`);
    return (L.done ? '' : status) + vik + (L.done ? this.runsHtml() : '');
  }

  runsHtml() {
    if (!this.p.runs.length) return section('PAST PRACTICE LIVES', '<p class="lab-note">None yet.</p>');
    return section('PAST PRACTICE LIVES', table(['Seed', 'Score', 'Rating'], [...this.p.runs].reverse().slice(0, 8).map(r => [esc(r.seed), r.report.overall, esc(r.report.rating)])));
  }

  reportHtml(R, L) {
    if (!R) return '';
    const S = R.summary, enc = L.encounters, scams = enc.filter(e => e.category === 'scam'), others = enc.filter(e => e.category !== 'scam');
    const cats = Object.values(R.categories).map(c => `<div class="lab-bar"><span>${esc(c.name.toUpperCase())}</span><div class="lb-track"><div class="lb-fill ${c.score >= 70 ? 'g' : c.score >= 50 ? 'y' : 'r'}" style="width:${c.score}%"></div></div><b>${c.score}</b></div>`).join('');
    const list = (items, cls = '') => (items.length ? `<ul class="lab-list ${cls}">${items.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="lab-note">Nothing recorded.</p>');
    const encRows = es => (es.length ? table(['Month', 'Offer was', 'You', 'Checked', 'Score'], es.map(e => [e.month, esc(V.CATEGORIES[e.category]), esc(V.DECISIONS[e.decision]), e.revealed.length ? esc(e.revealed.map(k => V.ACTIONS[k].toLowerCase()).join(', ')) : '<span class="warn">nothing</span>', e.score])) : '<p class="lab-note">No offers of this kind came up in this life.</p>');
    const a = this.lifeAI;
    return `<div class="lab-report" data-testid="life-report">
      <div class="lab-score big"><span class="ls-num" data-testid="report-overall">${R.overall}</span><span class="ls-of">/100 · <b data-testid="report-rating">${esc(R.rating.toUpperCase())}</b></span></div>
      <p class="lab-headline" data-testid="report-headline">${esc(R.headline)}</p>
      ${R.caps.map(c => `<p class="lab-alert">${esc(c)}</p>`).join('')}
      ${section('SCORES BY CATEGORY', cats + '<p class="lab-note">Each category is scored from what you did, relative to your own income and costs — the size of your balance isn\'t scored directly.</p>')}
      ${section('YOUR YEAR IN NUMBERS', table(['', ''], [['Net worth: start → end', `${inr(S.startNet)} → <b>${inr(S.endNet)}</b> (${signed(S.change)})`], ['Income earned', inr(S.income)], ['Spent on food / leisure', `${inr(S.food)} / ${inr(S.leisure)}`],
        ['Saved to reserve + goal / invested', `${inr(S.saved)} / ${inr(S.invested)}`], ['Surprise costs', inr(S.shocks)], ['Interest paid on debt', inr(S.debtInterest)], ['Debt at the end', inr(S.debt)],
        ['Reserve at the end', inr(S.reserve)], [`Goal: ${esc(S.goal.name)}`, `${inr(S.goal.saved)} of ${inr(S.goal.target)}`], ['Average health / quality of life', `${S.avgHealth} / ${S.avgQol}`]]))}
      ${section('BEST DECISIONS', list(R.best.map(b => `${esc(b.text)} <i>${esc(b.why)}</i>`), 'good'))}
      ${section('COSTLY MISTAKES', list(R.mistakes.map(m => `${esc(m.text)} <i>${esc(m.why)}</i>`), 'warnl'))}
      ${section('BUDGETING', list([...R.budgeting.strengths.map(x => `✔ ${esc(x)}`), ...R.budgeting.weaknesses.map(x => `✘ ${esc(x)}`)]))}
      ${section('INVESTING', list([...R.investing.strengths.map(x => `✔ ${esc(x)}`), ...R.investing.weaknesses.map(x => `✘ ${esc(x)}`)]) + `<p class="lab-note">${esc(R.investing.luck)}</p>`)}
      ${section(`RISK ASSESSMENT — ${R.categories.risk.score}/100`, encRows(others))}
      ${section(`SCAM DETECTION — ${R.categories.scams.score}/100`, encRows(scams))}
      ${section('ESSENTIAL NEEDS & QUALITY OF LIFE', `<p>Health averaged ${S.avgHealth}/100 and quality of life ${S.avgQol}/100. You ate below what you need in ${L.log.filter(m => m.foodRatio < 1).length} of ${LIFE.MONTHS} months; stress was high (60+) in ${L.log.filter(m => m.stress >= 60).length}.</p>`)}
      ${section('THREE PRIORITIES', `<ol class="lab-list">${R.priorities.map(p => `<li><b>${esc(p.category)}</b> (${p.score}): ${esc(p.advice)}</li>`).join('')}</ol>`)}
      ${section('REPLAY CHALLENGE', `<p>${esc(R.replay)}</p>`)}
      ${a?.status === 'pending' ? '<p class="lab-note">The coach is writing a summary…</p>' : a?.status === 'ok' ? `<div class="lab-coach"><span class="coach-tag">COACH'S SUMMARY — LOCAL AI, BASED ONLY ON THIS REPORT</span><p>${esc(a.narrative)}</p><p><b>${esc(a.encouragement)}</b></p></div>` : ''}
      <div class="lab-actions">${btn('life-replay', 'REPLAY THE SAME LIFE')}${btn('life-new', 'NEW PRACTICE LIFE ▶', { cls: 'primary' })}</div>
      <p class="lab-note seed">Practice life seed ${esc(L.seed)} · educational simulation with fictional money, not financial advice.</p></div>`;
  }
}

// Rubric for the optional written reasoning on the investing exercise (advisory feedback only).
export const REASON_RUBRIC = [
  { id: 'horizon', text: 'Links the mix to the goal\'s time horizon' },
  { id: 'diversify', text: 'Mentions spreading money / diversification or concentration' },
  { id: 'risk', text: 'Names a risk or a possible loss' },
  { id: 'costs', text: 'Mentions fees or costs' },
];
