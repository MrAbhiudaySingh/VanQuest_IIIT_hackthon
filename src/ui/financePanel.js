// Consolidated financial overview (net worth). Numbers come from sim/networth.js.
import { overview } from '../sim/networth.js';
import { LOCATIONS } from '../data/locations.js';
import { inr } from '../sim/util.js';
import { esc } from './core.js';

export class FinancePanel {
  constructor(game) { this.game = game; this.title = 'My finances'; this.sub = 'Everything you own and owe, in one place'; }
  render() {
    const o = overview(this.game.state), a = o.assets, l = o.liabilities, f = o.flows;
    const row = (k, v, cls = '') => `<tr><td>${k}</td><td class="n ${cls}">${inr(v)}</td></tr>`;
    return `<div class="kpis"><div class="kpi"><div class="k">Total assets</div><div class="v">${inr(o.totalAssets)}</div></div>
        <div class="kpi"><div class="k">Total liabilities</div><div class="v neg">${inr(o.totalLiabilities)}</div></div>
        <div class="kpi"><div class="k">Net worth</div><div class="v ${o.netWorth >= 0 ? 'pos' : 'neg'}" data-testid="networth">${inr(o.netWorth)}</div></div></div>
      <div class="split"><table class="t"><tr><th>Assets (what you own)</th><th class="n">${inr(o.totalAssets)}</th></tr>
          ${row('Cash on hand', a.cash)}${row('Savings account', a.savings)}${row('Fixed deposits (incl. interest so far)', a.fixedDeposits)}
          ${row('Trading desk (cash + holdings)', a.investments)}${o.properties.map(p => row(`${esc(LOCATIONS[p.id].name)} (market value)`, p.value)).join('') || row('Property', 0)}
          ${row('Cars (resale value)', a.vehicles)}${a.rentDeposit ? row('Your rent deposit (the landlord owes it back)', a.rentDeposit) : ''}</table>
        <table class="t"><tr><th>Liabilities (what you owe)</th><th class="n">${inr(o.totalLiabilities)}</th></tr>
          ${row('Home loans', l.mortgages, 'neg')}${row('Other loans & debts (home-equity, forced-sale shortfall, unpaid rent)', l.otherLoans, 'neg')}
          ${row('Tenants\' deposits you hold (owed back to them)', l.tenantDeposits, 'neg')}${row('Unpaid bills (upkeep, repairs, car costs)', l.unpaidBills, 'neg')}</table></div>
      <h3 style="margin:12px 0 4px">Where money came from and went (all time)</h3>
      <table class="t">${row('Salary', f.salary, 'pos')}${row('Rent from tenants', f.rentIncome, 'pos')}${row('Interest earned (savings + FDs)', f.interestEarned, 'pos')}
        ${row('Investment returns on the trading desk (realised + unrealised)', f.investmentReturns, f.investmentReturns >= 0 ? 'pos' : 'neg')}
        ${row('Sale proceeds (property, cars)', f.saleProceeds)}${row('Loan money received — a debt, not income', f.loanProceeds)}
        ${row('Interest paid on loans', f.interestPaid, 'neg')}${row('All spending (bills, shopping, EMIs, purchases…)', f.spending, 'neg')}</table>
      <p class="muted">Net worth = assets − liabilities. Borrowing adds the same amount to both sides, so it never makes you richer by itself; nor does a tenant's deposit (it's in your cash, and owed back). Moving money between cash, savings and FDs changes nothing.</p>`;
  }
}
