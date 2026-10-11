// The monthly life record. On the 1st of every month — BEFORE that day's salary, rent and bills (see
// clock.js) — the month that just ended is closed into one record built only from what the game
// recorded: the ledger, balances, health statistics and housing. The final life report, the goal
// checks and the achievements read these records; nothing here is estimated or invented.
//
// Money is classified once, here, for everyone:
//   earned     salary + rent from tenants + interest (savings and FDs)
//   essential  rent, grocery plan, EMIs, property upkeep & repairs, car insurance & servicing, loan fees,
//              and food bought at FreshCart / the general store
//   lifestyle  every other shop purchase, fuel
//   education  tuition                         other  anything not listed
//   NOT consumption (moving money into an asset or out of debt): property & car purchases, loan
//   prepayments / settlements at sale, tipster stakes, transfers, deposits, FDs, loan money received.
// surplus = earned − essential − lifestyle − education − other.
import { balance } from './ledger.js';
import { overview } from './networth.js';
import { portfolio } from './market.js';
import { ASSETS } from '../data/market.js';
import { dateOf, monthKey } from './util.js';

const ESSENTIAL = new Set(['rent', 'grocery_plan', 'emi', 'upkeep', 'repair', 'vehicle_costs', 'loan_fee']);
const FOOD_SHOPS = new Set(['market_grocery', 'market_general']);
const ASSET_OUT = { property_buy: 'property', vehicle_buy: 'vehicle', loan_prepayment: 'debt', loan_settlement: 'debt', tip_investment: 'tipster' };
const NOT_FLOW = new Set(['transfer', 'deposit', 'withdrawal', 'fd_open', 'fd_close', 'loan_disbursement', 'opening', 'test',
  'tenant_deposit', 'tenant_deposit_refund', 'deposit_paid', 'deposit_refund', 'trade']);
// The game's financial-independence rule: money you could live on — cash + savings + fixed deposits + the
// trading desk — of at least FI_MULTIPLE years of essential costs.
export const FI_MULTIPLE = 25;
export const EARNED = new Set(['salary', 'rent_income', 'interest']);

export const isEssentialSpend = e => ESSENTIAL.has(e.category) || (e.category === 'purchase' && FOOD_SHOPS.has(e.shop));

// What kind of money movement a ledger entry is (null = not income or spending).
export function classify(e) {
  if (e.status !== 'ok' || !['wallet', 'bank'].includes(e.account) || !e.amount || NOT_FLOW.has(e.category)) return null;
  if (e.amount > 0) return EARNED.has(e.category) ? 'earned' : ['property_sell', 'vehicle_sell', 'repossession'].includes(e.category) ? 'sales' : e.category === 'tip_investment' ? 'tipster_in' : 'other_in';
  if (isEssentialSpend(e)) return 'essential';
  if (ASSET_OUT[e.category]) return ASSET_OUT[e.category];
  if (e.category === 'purchase' || e.category === 'fuel') return 'lifestyle';
  if (e.category === 'tuition') return 'education';
  return 'other';
}

// Month start (game day) of the month containing `day`.
export const monthStartOf = day => day - dateOf(day).getUTCDate() + 1;

// Asset class of each holding on the trading desk + FDs + let property, for diversification.
export function holdingsMix(state) {
  const p = portfolio(state), parts = {};
  for (const r of p.rows) parts[ASSETS[r.id].type] = (parts[ASSETS[r.id].type] ?? 0) + r.value;
  const fd = state.bank.fds.filter(f => f.status === 'active').reduce((s, f) => s + f.principal, 0);
  if (fd) parts['Fixed deposit'] = fd;
  const total = Object.values(parts).reduce((s, v) => s + v, 0);
  // concentration = the largest single stock / token (funds and FDs are already spread across many holdings)
  const biggest = Math.max(0, ...p.rows.filter(r => ['Stock', 'Crypto token'].includes(ASSETS[r.id].type)).map(r => r.value));
  return { parts, total, classes: Object.keys(parts).length, topShare: total ? biggest / total : 0 };
}

// Average monthly essential spending over the last `months` months up to `endDay` (cash + savings).
export function essentialMonthly(state, endDay = state.day, months = 12) {
  const from = endDay - months * 30;
  let sum = 0;
  for (const e of state.ledger) if (e.status === 'ok' && e.day > from && e.day <= endDay && e.amount < 0 && ['wallet', 'bank'].includes(e.account) && isEssentialSpend(e)) sum -= e.amount;
  return sum / Math.min(months, Math.max(1, Math.ceil((endDay - Math.max(0, from)) / 30)));
}

// Close the month that ended yesterday. Idempotent: a month is recorded at most once.
// final = true closes the CURRENT, unfinished month up to today (when a life ends mid-month).
export function closeMonth(state, final = false) {
  const log = state.lifeLog ??= [];
  const end = final ? state.day : state.day - 1, from = monthStartOf(end), month = monthKey(end);
  if (end < 0 || log.some(r => r.month === month)) return null;
  if (final && from === state.day && !state.ledger.some(e => e.day === state.day)) return null;   // nothing happened yet this month
  const prev = log.at(-1), startIdx = prev?.ledgerTo ?? 0;
  const flow = { earned: 0, sales: 0, tipster_in: 0, other_in: 0, essential: 0, lifestyle: 0, education: 0, other: 0, property: 0, vehicle: 0, debt: 0, tipster: 0 };
  const income = { salary: 0, rent_income: 0, interest: 0 };
  let failed = 0, failedEssential = 0;
  for (let i = startIdx; i < state.ledger.length; i++) {
    const e = state.ledger[i];
    if (e.day < from || e.day > end) continue;
    if (e.status === 'failed') { failed++; if (ESSENTIAL.has(e.category)) failedEssential++; continue; }
    const c = classify(e);
    if (!c) continue;
    flow[c] += Math.abs(e.amount);
    if (c === 'earned') income[e.category] += e.amount;
  }
  const o = overview(state), st = state.stats, mix = holdingsMix(state);
  const cash = balance(state, 'wallet') + balance(state, 'bank');
  const ess = essentialMonthly(state, end);
  const was = prev?.statsAt ?? { daysUnfed: 0, daysHungry: 0 };
  const rec = {
    month, from, day: state.day, ledgerTo: state.ledger.length,
    income, flow, consumption: flow.essential + flow.lifestyle + flow.education + flow.other,
    surplus: flow.earned - flow.essential - flow.lifestyle - flow.education - flow.other,
    failed, failedEssential,
    cash, fd: o.assets.fixedDeposits, invest: o.assets.investments, property: o.assets.property, vehicles: o.assets.vehicles,
    debt: o.totalLiabilities, netWorth: o.netWorth, essentialAvg: Math.round(ess), reserveMonths: ess > 0 ? Math.round(cash / ess * 10) / 10 : null,
    health: state.health, hunger: state.hunger, unfed: st.daysUnfed - was.daysUnfed, hungry: st.daysHungry - was.daysHungry,
    statsAt: { daysUnfed: st.daysUnfed, daysHungry: st.daysHungry },
    housing: state.housing?.kind ?? 'none', home: state.housing?.propertyId ?? null, job: state.job.title, salary: state.job.salary,
    fiRatio: ess > 0 ? Math.round((cash + o.assets.fixedDeposits + o.assets.investments) / (ess * 12) * 10) / 10 : null,
    fiMet: ess > 0 && cash + o.assets.fixedDeposits + o.assets.investments >= FI_MULTIPLE * ess * 12,
    mix: { classes: mix.classes, topShare: Math.round(mix.topShare * 100) / 100, total: mix.total },
    furniture: state.housing ? state.furniture.filter(f => f.home === state.housing.propertyId).length : 0,
  };
  if ((state.character?.historyFrom ?? 0) > from) rec.partial = true;   // a pre-Round-7 save: only part of this month was recorded
  if (final) rec.final = true;                                           // the month the life ended in (up to that day)
  log.push(rec);
  return rec;
}
