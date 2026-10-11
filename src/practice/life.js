// Exercise E — PRACTICE LIFE: twelve fictional months that combine budgeting, saving, investing,
// emergencies, Vikram's offers and essential needs. Entirely inside the practice store; pure functions
// that take the practice life object and return a new one. Never touches the live game.
//
// Each month, in order:
//   1 income arrives   2 your chosen withdrawals (from reserve / goal fund / investments) arrive
//   3 rent, transport and utilities are paid — from cash, then the reserve, then borrowing (debt);
//     then any monthly commitment you accepted from Vikram (recurring deposit / SIP)
//   4 debt interest (4%/month) accrues; your chosen repayment is paid
//   5 food and leisure are spent   6 contributions go to the reserve, goal fund and investments
//   7 an unexpected cost, if one is scheduled — from cash, reserve, goal fund, then debt
//      (health cover from Vikram, if you bought it, pays medical costs)
//   8 a bonus, if scheduled   9 markets move (seeded), the reserve earns 3.5%/yr
//  10 health, stress and quality of life update   11 the month is recorded
import { rng, roundTo } from './rng.js';
import { path as marketPath } from './exercises/investing.js';
import * as V from './vikram.js';

export const LIFE_VERSION = 1;
export const MONTHS = 12;
export const DEBT_RATE = 0.04;             // informal borrowing: 4% a month
export const RESERVE_RATE = 0.035;
const inr = n => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function createLife(seed) {
  const r = rng('life', LIFE_VERSION, seed);
  const income = r.pick([12000, 16000, 20000, 26000, 34000, 45000]);
  const rent = roundTo(income * (0.22 + r.next() * 0.1), 500), transport = r.step(800, 2000, 100), utilities = r.step(600, 1500, 100);
  const foodNeed = roundTo(Math.max(2800, income * 0.16), 100);
  const essentials = rent + transport + utilities + foodNeed;
  const shocks = r.shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]).slice(0, 3).sort((a, b) => a - b).map(m => ({ month: m, ...r.pick([
    { name: 'Hospital visit', medical: true }, { name: 'Phone stolen', medical: false }, { name: 'Family wedding gift', medical: false }, { name: 'Dental treatment', medical: true }, { name: 'Laptop repair', medical: false }]),
    amount: roundTo(essentials * (0.3 + r.next() * 0.9), 500) }));
  const bonusMonth = r.int(3, 11), vikramMonths = r.shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, 3).sort((a, b) => a - b);
  const crashMonth = r.int(3, 10);
  const scenario = { seed, version: LIFE_VERSION, income, rent, transport, utilities, foodNeed, essentials, shocks, bonus: { month: bonusMonth, amount: roundTo(income * 0.5, 500) },
    vikramMonths, crashMonth, goal: { name: r.pick(['Diploma course fees', 'A used scooter', 'Starting a tuition class']), target: roundTo(income * 3, 1000) },
    start: { cash: roundTo(income * (0.3 + r.next() * 0.5), 500), reserve: roundTo(income * r.next() * 0.6, 500) } };
  const P = marketPath(`life:${seed}`, MONTHS, crashMonth);
  scenario.market = P.map(m => ({ index: m.index, risky: m.single }));
  return {
    version: LIFE_VERSION, seed, scenario, month: 1, done: false,
    cash: scenario.start.cash, reserve: scenario.start.reserve, goalFund: 0, invest: { index: 0, risky: 0 }, debt: 0,
    health: 80, stress: 20, qol: 60, insured: false, pending: [], commitments: [], rd: 0, log: [], encounters: [], encounter: null,
  };
}

export const emptyDecision = () => ({ food: 0, leisure: 0, reserve: 0, goal: 0, index: 0, risky: 0, repay: 0, withdraw: { reserve: 0, goal: 0, index: 0, risky: 0 } });
export function suggestDecision(L) {
  const s = L.scenario, spare = Math.max(0, L.cash + s.income - s.rent - s.transport - s.utilities - s.foodNeed);
  return { ...emptyDecision(), food: s.foodNeed, leisure: roundTo(spare * 0.2, 100), reserve: roundTo(spare * 0.4, 100), goal: roundTo(spare * 0.3, 100), repay: Math.min(L.debt, roundTo(spare * 0.1, 100)) };
}

const fixedBills = s => s.rent + s.transport + s.utilities;
export function checkDecision(L, d) {
  const errors = [], s = L.scenario;
  const nums = [d.food, d.leisure, d.reserve, d.goal, d.index, d.risky, d.repay, ...Object.values(d.withdraw)];
  if (!nums.every(x => Number.isInteger(x) && x >= 0)) errors.push('Amounts must be whole rupees, zero or more.');
  const w = d.withdraw;
  if (w.reserve > L.reserve) errors.push(`Your reserve only holds ${inr(L.reserve)}.`);
  if (w.goal > L.goalFund) errors.push(`Your goal fund only holds ${inr(L.goalFund)}.`);
  if (w.index > L.invest.index) errors.push(`Your index fund is only worth ${inr(L.invest.index)}.`);
  if (w.risky > L.invest.risky) errors.push(`Your single-company shares are only worth ${inr(L.invest.risky)}.`);
  if (d.repay > L.debt + Math.ceil(L.debt * DEBT_RATE)) errors.push('You can\'t repay more than you owe.');
  const inflow = L.cash + s.income + Object.values(w).reduce((a, b) => a + b, 0);
  const spend = d.food + d.leisure + d.reserve + d.goal + d.index + d.risky + d.repay;
  const afterBills = inflow - fixedBills(s);
  if (spend > Math.max(0, afterBills)) errors.push(`You've planned ${inr(spend)} but only ${inr(Math.max(0, afterBills))} is left after rent, transport and utilities. Money can't be created — spend less, or withdraw from savings.`);
  return { ok: !errors.length, errors, inflow, afterBills, left: afterBills - spend };
}

// Pay `amount` from cash → reserve → goal fund → debt; returns the sources used.
function payWaterfall(L, amount) {
  const used = { cash: 0, reserve: 0, goal: 0, debt: 0 };
  let need = amount;
  for (const k of ['cash', 'reserve', 'goal']) { const src = k === 'goal' ? 'goalFund' : k, take = Math.min(L[src], need); L[src] -= take; used[k] = take; need -= take; }
  if (need > 0) { L.debt += need; used.debt = need; }
  return used;
}

// Advance one month with the player's decision. Returns { ok, life } — never mutates the input.
export function stepMonth(life, d) {
  if (life.done) return { ok: false, errors: ['This practice life is finished.'] };
  if (life.encounter && !life.encounter.decision) return { ok: false, errors: ['Decide on Vikram\'s offer first.'] };
  const c = checkDecision(life, d);
  if (!c.ok) return { ok: false, errors: c.errors };
  const L = JSON.parse(JSON.stringify(life)), s = L.scenario, m = L.month, rec = { month: m, decision: d, events: [] };
  const start = netWorth(L);
  L.cash += s.income;                                                          // 1
  for (const [k, v] of Object.entries(d.withdraw)) { if (!v) continue; if (k === 'reserve') L.reserve -= v; else if (k === 'goal') L.goalFund -= v; else L.invest[k] -= v; L.cash += v;
    rec.events.push({ kind: 'withdraw', text: `Withdrew ${inr(v)} from ${k === 'goal' ? 'your goal fund' : k === 'reserve' ? 'your reserve' : k === 'index' ? 'the index fund' : 'single-company shares'}`, amount: v, from: k,
      afterFall: (k === 'index' || k === 'risky') && m > s.crashMonth && m <= s.crashMonth + 2 }); }
  const bills = payWaterfall(L, fixedBills(s));                                // 3
  rec.bills = { total: fixedBills(s), ...bills };
  for (const c of L.commitments) {                                             // 3b monthly commitments
    const used = payWaterfall(L, c.monthly);
    if (c.kind === 'rd') L.rd = Math.round(L.rd * (1 + c.rate / 12)) + c.monthly; else L.invest.index += c.monthly;
    rec.events.push({ kind: 'commitment', text: `${c.kind === 'rd' ? 'Recurring deposit' : 'Index-fund SIP'}: ${inr(c.monthly)}${used.debt ? ` (${inr(used.debt)} of it borrowed)` : ''}`, amount: c.monthly, debt: used.debt });
  }
  if (bills.reserve || bills.debt) rec.events.push({ kind: 'bills_short', text: `Rent, transport and utilities (${inr(fixedBills(s))}) needed ${bills.reserve ? `${inr(bills.reserve)} from your reserve` : ''}${bills.reserve && bills.debt ? ' and ' : ''}${bills.debt ? `${inr(bills.debt)} borrowed` : ''}`, debt: bills.debt });
  const interest = Math.round(L.debt * DEBT_RATE); L.debt += interest; rec.debtInterest = interest;   // 4
  const repay = Math.min(d.repay, L.debt, L.cash); L.cash -= repay; L.debt -= repay; rec.repaid = repay;
  for (const k of ['food', 'leisure']) L.cash -= d[k];                          // 5 (feasibility checked above)
  L.reserve += d.reserve; L.goalFund += d.goal; L.invest.index += d.index; L.invest.risky += d.risky;   // 6
  L.cash -= d.reserve + d.goal + d.index + d.risky;
  if (L.cash < 0) { L.debt += -L.cash; L.cash = 0; }
  for (const sh of s.shocks.filter(x => x.month === m)) {                      // 7
    if (sh.medical && L.insured) { rec.events.push({ kind: 'shock', text: `${sh.name}: ${inr(sh.amount)} — paid by your health insurance`, amount: sh.amount, covered: true, sources: { insurance: sh.amount } }); continue; }
    const used = payWaterfall(L, sh.amount);
    rec.events.push({ kind: 'shock', text: `${sh.name}: ${inr(sh.amount)} — paid from ${Object.entries(used).filter(([, v]) => v).map(([k, v]) => `${k === 'debt' ? 'borrowing' : k === 'goal' ? 'your goal fund' : k} ${inr(v)}`).join(', ')}`, amount: sh.amount, sources: used });
  }
  if (s.bonus.month === m) { L.cash += s.bonus.amount; rec.events.push({ kind: 'bonus', text: `Festival bonus: ${inr(s.bonus.amount)}`, amount: s.bonus.amount }); }   // 8
  const mk = s.market[m - 1];                                                  // 9
  L.invest.index = Math.round(L.invest.index * (1 + mk.index)); L.invest.risky = Math.round(L.invest.risky * (1 + mk.risky));
  L.reserve = Math.round(L.reserve * (1 + RESERVE_RATE / 12));
  if (m === s.crashMonth) rec.events.push({ kind: 'market_fall', text: `Markets fell sharply this month (index ${Math.round(mk.index * 100)}%, single-company shares ${Math.round(mk.risky * 100)}%)` });
  for (const p of L.pending.filter(p => p.month === m)) { L.cash += p.value; rec.events.push({ kind: 'matured', text: p.text, amount: p.value }); }
  L.pending = L.pending.filter(p => p.month !== m);
  const foodRatio = d.food / s.foodNeed;                                       // 10
  L.health = Math.max(0, Math.min(100, L.health + (foodRatio >= 1 ? 3 : foodRatio >= 0.8 ? -4 : -12)));
  const monthEss = s.essentials;
  L.stress = Math.max(0, Math.min(100, Math.round(L.stress * 0.6 + 8 + (L.debt > 0 ? 18 : 0) + (L.reserve < monthEss ? 12 : 0) + (bills.debt ? 12 : 0) + (foodRatio < 1 ? 10 : 0))));
  const leisureScore = Math.min(100, d.leisure / (s.income * 0.1) * 100);
  L.qol = Math.round(0.45 * L.health + 0.35 * leisureScore + 0.2 * (100 - L.stress));
  Object.assign(rec, { foodRatio, health: L.health, stress: L.stress, qol: L.qol, cash: L.cash, reserve: L.reserve, goalFund: L.goalFund, invest: { ...L.invest }, debt: L.debt,
    netStart: start, netEnd: netWorth(L), market: mk });
  L.log.push(rec);
  L.month++;
  if (L.month > MONTHS) { L.done = true; for (const p of L.pending) { L.cash += p.value; } L.pending = []; if (L.rd) { L.cash += L.rd; L.rd = 0; } }
  else if (s.vikramMonths.includes(L.month)) L.encounter = makeEncounter(L);
  else L.encounter = null;
  return { ok: true, life: L };
}

export const netWorth = L => Math.round(L.cash + L.reserve + L.goalFund + L.invest.index + L.invest.risky + (L.rd ?? 0) + L.pending.reduce((s, p) => s + p.value, 0) - L.debt);

// ---------------------------------------------------------------- Vikram during the practice life
export function makeEncounter(L, weights) {
  const s = L.scenario;
  return V.generate(`${L.seed}:m${L.month}`, { liquid: L.cash + L.reserve, reserveTarget: s.essentials, income: s.income, maxStake: Math.max(1000, roundTo((L.cash + L.reserve) * 0.6, 1000)) }, weights ? { weights } : {});
}
export const startFirstEncounter = L => (L.scenario.vikramMonths.includes(L.month) && !L.encounter ? { ...L, encounter: makeEncounter(L) } : L);

export function encounterAct(life, action) {
  const r = V.reveal(life.encounter, action);
  return r.ok ? { ok: true, life: { ...life, encounter: r.enc }, evidence: r.evidence } : r;
}

// The money effect of a decision is applied to the PRACTICE life only.
export function encounterDecide(life, decision) {
  const e = life.encounter, f = e.facts, upfront = f.monthly ? f.monthly : f.stake;
  if (decision === 'accept' && upfront > life.cash + life.reserve) return { ok: false, errors: [`You don't have ${inr(upfront)} available.`] };
  const r = V.decide(e, decision);
  if (!r.ok) return r;
  const L = JSON.parse(JSON.stringify({ ...life, encounter: r.enc })), o = f.outcome;
  if (decision === 'accept') {
    if (o.kind === 'loss') payWaterfall(L, o.amount);
    else if (e.archetype === 'health_cover') { payWaterfall(L, f.stake); L.insured = true; }
    else if (o.kind === 'market') L.commitments.push({ kind: 'sip', monthly: f.monthly, from: L.month });
    else if (o.kind === 'fixed' && f.monthly) L.commitments.push({ kind: 'rd', monthly: f.monthly, rate: f.rate, from: L.month });
    else { payWaterfall(L, f.stake); const value = f.stake + r.enc.outcome.money; L.pending.push({ month: Math.min(MONTHS, L.month + 6), value, text: `${f.provider}: ${r.enc.outcome.text}` }); }
  }
  const ev = V.evaluate(r.enc);
  L.encounters.push({ month: L.month, id: e.id, seed: e.seed, category: e.category, archetype: e.archetype, decision, revealed: e.revealed, score: ev.score, money: decision === 'accept' ? (o.kind === 'loss' ? -o.amount : 0) : 0 });
  return { ok: true, life: L, evaluation: ev };
}
