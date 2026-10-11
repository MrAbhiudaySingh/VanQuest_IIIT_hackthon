// Transparent simulated credit profile (300–900). Every point comes from a listed factor the
// player can see, computed from their actual record — no hidden score.
//   start                          700
//   each on-time EMI               +2   (up to +60)
//   each missed EMI, last 12 months −45
//   each missed rent, last 12 months −20
//   other unpaid bills, last 12 m   −5 each (up to −40)
//   each loan default (ever)       −200
//   EMIs above 35% / 50% of income −25 / −60
// Tiers set what lenders offer (fixed for the life of each loan once taken).
import { RENT_INCOME } from '../data/lending.js';
import { PROPERTIES } from '../data/properties.js';
import { VEHICLES } from '../data/vehicles.js';
import { planCost } from './groceryPlan.js';

export const TIERS = [
  { min: 780, name: 'Excellent', rateAdj: -0.0025, eligible: true },
  { min: 720, name: 'Good', rateAdj: 0, eligible: true },
  { min: 650, name: 'Fair', rateAdj: 0.0075, eligible: true },
  { min: 550, name: 'Poor', rateAdj: 0.02, eligible: true },
  { min: 0, name: 'Very poor', rateAdj: null, eligible: false },
];

// Eligible regular income for lending (see data/lending.js RENT_INCOME):
//   salary + 75% of the average rent actually received over the last 6 months from properties
//   that have a tenant now. Loan money, sale proceeds, deposits and one-off transfers never count,
//   and a vacant/listed property (or the home being bought) adds nothing — so no loan can make
//   itself affordable.
export function incomeBreakdown(state) {
  const since = state.day - Math.round(RENT_INCOME.months * 30.44);
  const rentals = Object.entries(state.properties).filter(([, p]) => p.status === 'let' && p.tenant).map(([id, p]) => {
    const received = state.ledger.filter(e => e.status === 'ok' && e.category === 'rent_income' && e.prop === id && e.deal === p.uid && e.day > since)
      .reduce((s, e) => s + e.amount, 0);
    return { id, received, counted: Math.round(received / RENT_INCOME.months * RENT_INCOME.allowance) };
  });
  const rent = rentals.reduce((s, r) => s + r.counted, 0);
  return { salary: state.job.salary, rentals, rent, total: state.job.salary + rent };
}
export const monthlyIncome = state => incomeBreakdown(state).total;
export const totalEmis = state => state.loans.filter(l => l.status === 'active').reduce((s, l) => s + l.emi, 0);

// Essential monthly bills a lender checks you can still pay after all EMIs: upkeep on every owned
// property (plus the one being bought), car insurance & servicing, and an active grocery plan.
export function essentialCommitments(state, extraUpkeep = 0) {
  const upkeep = Object.keys(state.properties).reduce((s, id) => s + PROPERTIES[id].upkeep, 0) + extraUpkeep;
  const vehicles = state.vehicles.reduce((s, v) => s + VEHICLES[v.model].monthly, 0);
  const p = state.groceryPlan, groceries = p && p.status === 'active' ? planCost(p.items, p.mode).total : 0;
  return { upkeep, vehicles, groceries, total: upkeep + vehicles + groceries };
}

export function creditProfile(state) {
  const recent = e => state.day - e.day < 365;
  const onTime = state.loans.reduce((s, l) => s + l.paidCount, 0);
  const missedEmi = state.loans.reduce((s, l) => s + l.missedDays.filter(d => state.day - d < 365).length, 0);
  const failed = state.ledger.filter(e => e.status === 'failed' && recent(e));
  const missedRent = failed.filter(e => e.category === 'rent').length;
  const otherUnpaid = failed.filter(e => !['rent', 'emi'].includes(e.category)).length;
  const defaults = state.credit.defaults.length;
  const dti = monthlyIncome(state) ? totalEmis(state) / monthlyIncome(state) : (totalEmis(state) ? 1 : 0);
  const factors = [
    { label: 'Starting point', points: 700 },
    { label: `On-time EMIs (${onTime})`, points: Math.min(60, onTime * 2) },
    { label: `Missed EMIs in the last 12 months (${missedEmi})`, points: -45 * missedEmi },
    { label: `Missed rent in the last 12 months (${missedRent})`, points: -20 * missedRent },
    { label: `Other unpaid bills in the last 12 months (${otherUnpaid})`, points: -Math.min(40, 5 * otherUnpaid) },
    { label: `Loan defaults (${defaults})`, points: -200 * defaults },
    { label: `EMIs are ${Math.round(dti * 100)}% of income`, points: dti > 0.5 ? -60 : dti > 0.35 ? -25 : 0 },
  ];
  const score = Math.max(300, Math.min(900, factors.reduce((s, f) => s + f.points, 0)));
  return { score, tier: TIERS.find(t => score >= t.min), factors, dti };
}
