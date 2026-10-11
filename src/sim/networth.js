// Consolidated financial position. Assets and liabilities are each counted once:
//   a loan adds the cash it paid out to your assets AND the same amount to your liabilities,
//   so borrowing never changes net worth by itself — it is not income.
//   A deposit you paid a landlord is money owed back to you (an asset); a deposit a tenant paid you
//   is sitting in your cash but owed back to them (a liability) — neither is income.
import { balance } from './ledger.js';
import { portfolio } from './market.js';
import { fdTotal } from './bank.js';
import { propertyValue } from './housingMarket.js';
import { ownedVehicleValue } from './vehicles.js';
import { depositsHeld } from './property.js';

export function overview(state) {
  const p = portfolio(state);
  const properties = Object.keys(state.properties).map(id => ({ id, value: propertyValue(id, state.day) }));
  const loans = state.loans.filter(l => l.status === 'active');
  const h = state.housing;
  const assets = {
    cash: balance(state, 'wallet'),
    savings: balance(state, 'bank'),
    fixedDeposits: fdTotal(state),                       // principal + interest earned so far
    investments: p.total,                                // trading-desk cash + holdings at today's price
    property: properties.reduce((s, x) => s + x.value, 0),
    vehicles: ownedVehicleValue(state),
    rentDeposit: h?.kind === 'rent' ? Math.max(0, (h.deposit ?? 0) - (h.arrears ?? 0)) : 0,   // what your landlord owes back
  };
  const liabilities = {
    mortgages: loans.filter(l => l.kind === 'mortgage').reduce((s, l) => s + l.balance, 0),
    otherLoans: loans.filter(l => l.kind !== 'mortgage').reduce((s, l) => s + l.balance, 0),
    tenantDeposits: Object.values(state.properties).reduce((s, x) => s + depositsHeld(x), 0),
    unpaidBills: Object.values(state.properties).reduce((s, x) => s + (x.arrears ?? 0), 0)
      + state.vehicles.reduce((s, v) => s + (v.arrears ?? 0), 0)
      + (h?.kind === 'rent' ? Math.max(0, (h.arrears ?? 0) - (h.deposit ?? 0)) : 0),
  };
  const sum = o => Object.values(o).reduce((s, v) => s + v, 0);
  const totalAssets = sum(assets), totalLiabilities = sum(liabilities);
  return { assets, liabilities, totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, properties, flows: flows(state) };
}

// Lifetime money flows by type (wallet + savings), so the player can tell them apart.
const GROUPS = {
  salary: ['salary'], rentIncome: ['rent_income'], interestEarned: ['interest'],
  loanProceeds: ['loan_disbursement'], saleProceeds: ['property_sell', 'vehicle_sell', 'repossession'],
  tipster: ['tip_investment'],
};
// Moving money between your own accounts, borrowing, and deposits held/returned aren't spending.
export const NOT_SPENDING = new Set(['transfer', 'deposit', 'withdrawal', 'fd_open', 'fd_close', 'loan_disbursement', 'opening', 'test',
  'tenant_deposit', 'tenant_deposit_refund', 'deposit_paid', 'deposit_refund']);
export function flows(state) {
  const sumCat = (cats, sign) => state.ledger.filter(e => e.status === 'ok' && ['wallet', 'bank'].includes(e.account) && cats.includes(e.category) && Math.sign(e.amount) === sign)
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  const out = Object.fromEntries(Object.entries(GROUPS).map(([k, cats]) => [k, sumCat(cats, 1)]));
  out.interestPaid = state.loans.reduce((s, l) => s + l.interestPaid, 0);
  const p = portfolio(state);
  out.investmentReturns = p.realized + p.unrealized;
  out.depositsHeldNow = Object.values(state.properties).reduce((s, x) => s + depositsHeld(x), 0);
  out.spending = state.ledger.filter(e => e.status === 'ok' && ['wallet', 'bank'].includes(e.account) && e.amount < 0 && !NOT_SPENDING.has(e.category))
    .reduce((s, e) => s - e.amount, 0);
  return out;
}
