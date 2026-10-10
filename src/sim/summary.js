// Summaries computed from the ledger + state, so they always match the real numbers.
import { balance } from './ledger.js';
import { overview } from './networth.js';
import { MAJORS } from '../data/majors.js';

export const CATEGORY_LABELS = {
  salary: 'Salary', rent_income: 'Rent from tenants', property_sell: 'Property sales', vehicle_sell: 'Car sales', tip_investment: 'Tipster offers',
  rent: 'Rent', grocery_plan: 'Grocery plan', purchase: 'Shopping', upkeep: 'Property upkeep', vehicle_costs: 'Car insurance & servicing',
  fuel: 'Fuel', tuition: 'Tuition', property_buy: 'Property purchases', vehicle_buy: 'Car purchases', opening: 'Opening savings', transfer: 'Transfers',
  interest: 'Interest earned', emi: 'Loan EMIs', loan_fee: 'Loan fees', loan_disbursement: 'Loan money received (a debt, not income)', loan_settlement: 'Loans repaid at sale',
  loan_prepayment: 'Loan prepayments', repossession: 'Forced sale by the bank', deposit: 'Deposits', withdrawal: 'Withdrawals', fd_open: 'Moved into FDs', fd_close: 'FDs returned',
};

export function snapshot(state) {
  const o = overview(state), wallet = balance(state);
  return { day: state.day, wallet, savings: o.assets.savings, fds: o.assets.fixedDeposits, invested: o.assets.investments, properties: o.assets.property,
    vehicles: o.assets.vehicles, debt: o.totalLiabilities, netWorth: o.netWorth,
    health: state.health, hunger: state.hunger, job: { ...state.job }, education: state.education ? { ...state.education } : null,
    ledgerLen: state.ledger.length, stats: { ...state.stats } };
}

// Money in/out between two snapshots, by category (wallet account only; transfers excluded).
export function periodSummary(state, before) {
  const after = snapshot(state);
  const entries = state.ledger.slice(before.ledgerLen).filter(e => e.account === 'wallet' && e.category !== 'transfer');
  const income = {}, expenses = {};
  let failed = 0;
  for (const e of entries) {
    if (e.status === 'failed') { failed++; continue; }
    const bag = e.amount >= 0 ? income : expenses;
    bag[e.category] = (bag[e.category] ?? 0) + Math.abs(e.amount);
  }
  const sum = o => Object.values(o).reduce((s, v) => s + v, 0);
  const transfers = state.ledger.slice(before.ledgerLen).filter(e => e.account === 'wallet' && e.category === 'transfer' && e.status === 'ok').reduce((s, e) => s + e.amount, 0);
  const edu = (ed) => !ed ? 'Not enrolled' : `${MAJORS[ed.majorId].name} — ${ed.status}`;
  return {
    from: before.day, to: after.day, days: after.day - before.day, before, after,
    income, expenses, totalIncome: sum(income), totalExpenses: sum(expenses), transfers, failedPayments: failed,
    // wallet change must equal income − expenses + transfers (checked by tests)
    walletChange: after.wallet - before.wallet,
    education: { before: edu(before.education), after: edu(after.education) },
    job: { before: `${before.job.title} (₹${before.job.salary.toLocaleString('en-IN')})`, after: `${after.job.title} (₹${after.job.salary.toLocaleString('en-IN')})` },
    daysUnfed: after.stats.daysUnfed - before.stats.daysUnfed, daysHungry: after.stats.daysHungry - before.stats.daysHungry,
    died: state.status === 'dead',
  };
}

// For the end-of-run screen: what led here, from the actual record.
export function lifeSummary(state) {
  const spent = {};
  for (const e of state.ledger) if (e.account === 'wallet' && e.status === 'ok' && e.amount < 0) spent[e.category] = (spent[e.category] ?? 0) + -e.amount;
  const food = state.ledger.filter(e => e.status === 'ok' && (e.category === 'grocery_plan' || (e.category === 'purchase' && ['market_grocery', 'market_general'].includes(e.shop))));
  const lastFood = food.at(-1)?.day ?? null;
  const failed = state.ledger.filter(e => e.status === 'failed');
  return { daysLived: state.day, spent, foodSpend: food.reduce((s, e) => s - e.amount, 0), lastFoodDay: lastFood,
    planStatus: state.groceryPlan?.status ?? 'none', failedPayments: failed.length, stats: { ...state.stats }, wallet: balance(state) };
}
