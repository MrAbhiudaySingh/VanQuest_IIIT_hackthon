// Consolidated financial position. Assets and liabilities are each counted once:
//   a loan adds the cash it paid out to your assets AND the same amount to your liabilities,
//   so borrowing never changes net worth by itself — it is not income.
import { balance } from './ledger.js';
import { portfolio } from './market.js';
import { fdTotal } from './bank.js';
import { propertyValue } from './housingMarket.js';
import { ownedVehicleValue } from './vehicles.js';

export function overview(state) {
  const p = portfolio(state);
  const properties = Object.keys(state.properties).map(id => ({ id, value: propertyValue(id, state.day) }));
  const loans = state.loans.filter(l => l.status === 'active');
  const assets = {
    cash: balance(state, 'wallet'),
    savings: balance(state, 'bank'),
    fixedDeposits: fdTotal(state),                       // principal + interest earned so far
    investments: p.total,                                // trading-desk cash + holdings at today's price
    property: properties.reduce((s, x) => s + x.value, 0),
    vehicles: ownedVehicleValue(state),
  };
  const liabilities = {
    mortgages: loans.filter(l => l.kind === 'mortgage').reduce((s, l) => s + l.balance, 0),
    otherLoans: loans.filter(l => l.kind !== 'mortgage').reduce((s, l) => s + l.balance, 0),
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
export function flows(state) {
  const sumCat = (cats, sign) => state.ledger.filter(e => e.status === 'ok' && ['wallet', 'bank'].includes(e.account) && cats.includes(e.category) && Math.sign(e.amount) === sign)
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  const out = Object.fromEntries(Object.entries(GROUPS).map(([k, cats]) => [k, sumCat(cats, 1)]));
  out.interestPaid = state.loans.reduce((s, l) => s + l.interestPaid, 0);
  const p = portfolio(state);
  out.investmentReturns = p.realized + p.unrealized;
  const excluded = new Set(['transfer', 'deposit', 'withdrawal', 'fd_open', 'fd_close', 'loan_disbursement', 'opening', 'test']);
  out.spending = state.ledger.filter(e => e.status === 'ok' && ['wallet', 'bank'].includes(e.account) && e.amount < 0 && !excluded.has(e.category))
    .reduce((s, e) => s - e.amount, 0);
  return out;
}
