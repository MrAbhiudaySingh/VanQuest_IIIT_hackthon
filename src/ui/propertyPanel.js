// Lakshmi's property agency in the supplied design (Assets/supplied-ui/round8/property agent panel ui →
// skins/agent.css): header with tabs, current-home banner + housing-market HUD, category pills, sort and
// property rows. Presentation only — every price, rent, rule and action comes from sim/ and data/. Parts
// of the design with no game data or rule behind them are left out (see README, Round 8): photos, beds/
// baths/area, favourites and "+ Add Property".
import { PROPERTIES, NEIGHBOURHOODS, PROPERTY_RULES as R, AGENT, TENANCY, REPAIRS } from '../data/properties.js';
import { MORTGAGE, RENT_INCOME, LENDING_RULES } from '../data/lending.js';
import { LOCATIONS } from '../data/locations.js';
import { buyProperty, sellProperty, rentHome, moveIn, listForRent, stopRentingOut, buyCost, saleProceeds, propertyValue, marketRent, payPropertyArrears, homeId, rentTerms } from '../sim/property.js';
import { PHASES, marketPhase, indexHistory, hoodChange } from '../sim/housingMarket.js';
import { mortgageQuote, securedBalance } from '../sim/loans.js';
import { allReports } from '../sim/propertyReport.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtShortDate, fmtDate } from '../sim/util.js';
import { esc, newToken, why } from './core.js';

const STATUS = { home: 'You live here', vacant: 'Vacant', listed: 'Listed — looking for a tenant', let: 'Let to a tenant' };
const pct = r => `${(r * 100).toFixed(2)}%`;
const chg = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
// the design's category pills ↔ the game's neighbourhoods
const CATS = [['all', 'All Properties', 'building'], ['budget', 'Budget', 'circle'], ['central', 'Well-connected', 'heart'], ['family', 'Family Friendly', 'home'], ['premium', 'Premium', 'award']];
const SORTS = [['rent', 'Market Rent'], ['price-asc', 'Asking Price (Low to High)'], ['price-desc', 'Asking Price (High to Low)']];
// the design's line icons (its app.js getIconSvg)
const ICON = {
  home: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
  heart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>',
  chart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
  book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
  building: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M8 10h.01"></path><path d="M16 10h.01"></path><path d="M8 14h.01"></path><path d="M16 14h.01"></path></svg>',
  circle: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle></svg>',
  award: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>',
  trend: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
};

export class PropertyPanel {
  constructor(game, { tab = 'market' } = {}) {
    this.game = game;
    this.title = 'Lakshmi Rao — Property agent';
    this.tab = tab; this.confirm = null; this.msg = null;
    this.cat = 'all'; this.sort = 'rent';
  }
  get s() { return this.game.state; }
  frame() {
    const n = Object.keys(this.s.properties).length, r = this.s.propertyHistory.length + n;
    const tab = (t, l, ic) => `<button class="nav-btn ${this.tab === t ? 'active' : ''}" data-a="tab" data-t="${t}" aria-pressed="${this.tab === t}">${ICON[ic]} <span>${l}</span></button>`;
    const msg = this.msg ? `<div class="msg ${this.msg.kind}" data-testid="agent-msg">${esc(this.msg.text)}</div>` : '';
    const bar = this.tab === 'market' ? `<section class="filter-sort-bar" aria-label="Filter properties">
        <div class="category-pills">${CATS.map(([id, l, ic]) => `<button class="cat-pill ${this.cat === id ? 'active' : ''}" data-a="cat" data-t="${id}" aria-pressed="${this.cat === id}"${NEIGHBOURHOODS[id] ? ` title="${esc(NEIGHBOURHOODS[id].name)}"` : ''}>${ICON[ic]} <span>${l}</span></button>`).join('')}</div>
        <div class="sort-group"><label for="agentSort">Sort by:</label><select id="agentSort" class="sort-select" data-in="sort">${SORTS.map(([id, l]) => `<option value="${id}"${this.sort === id ? ' selected' : ''}>${l}</option>`).join('')}</select></div></section>` : '';
    return `<div class="vq-agent" data-scroll="page"><main class="screen-container" role="dialog" aria-modal="true" aria-labelledby="agentTitle">
      <header class="top-header">
        <div class="header-left"><button class="home-avatar-btn" data-a="close" aria-label="Close — back to the city" title="Back to the city">${ICON.home.replace(/"15"/g, '"24"')}</button>
          <div class="agent-title-group"><h1 id="agentTitle"><span>${esc(AGENT.name)}</span> <span style="font-weight:400; opacity:0.6;">—</span> <span>${esc(AGENT.role)}</span></h1>
            <p>Renting or buying — let's look at what you can actually afford.</p></div></div>
        <nav class="header-nav">${tab('market', 'Properties', 'home')}${tab('mine', `Yours (${n})`, 'heart')}${tab('reports', `Performance (${r})`, 'chart')}${tab('rules', 'Rules', 'book')}</nav>
      </header>
      <section class="banner-container" aria-label="Current Residence and Market Summary"><div class="banner-content-overlay">${this.residence()}${this.marketHud()}</div></section>
      ${bar}
      <section class="properties-container" aria-label="${this.tab === 'market' ? 'Properties list' : 'Details'}">${msg}${this.tab === 'market' ? this.r_market() : `<div class="agent-sheet">${this[`r_${this.tab}`]()}</div>`}</section>
      </main>${this.confirm ? `<div class="agent-confirm">${this.renderConfirm()}</div>` : ''}</div>`;
  }

  residence() {
    const h = this.s.housing;
    const money = `<div class="deposit-line">Cash + savings <b class="balance">${inr(spendable(this.s))}</b></div>`;
    if (!h) return `<div class="current-residence-card"><div class="badge-location-header">${ICON.pin} You live at</div><h2>No home</h2><div class="rent-line">You have no home. Renting the cheapest flat is the quickest fix.</div>${money}</div>`;
    return `<div class="current-residence-card" data-testid="agent-home"><div class="badge-location-header">${ICON.pin} You live at</div><h2>${esc(LOCATIONS[h.propertyId].name)}</h2>
      ${h.kind === 'rent' ? `<div class="rent-line">Renting at ${inr(h.rent)}/month (paid on the 1st)</div><div class="deposit-line">Deposit held by the landlord ${inr(h.deposit ?? 0)}.${h.arrears ? ` <span class="neg">Unpaid rent ${inr(h.arrears)}.</span>` : ''}</div>`
        : '<div class="rent-line">You own it.</div>'}${money}
      ${h.kind === 'own' && this.tab !== 'mine' ? '<button class="view-details-pill-btn" data-a="tab" data-t="mine">View House Details →</button>' : ''}</div>`;
  }

  // the same figures as before Round 8: city index over up to 12 months, each neighbourhood over the last 12
  marketHud() {
    const hist = indexHistory(this.s.day, 13), phase = PHASES[marketPhase(this.s.day)].label, months = hist.length - 1;
    const yr = months > 0 ? hist.at(-1).index / hist[0].index - 1 : 0;
    const rows = Object.entries(NEIGHBOURHOODS).map(([k, nb]) => { const c = hoodChange(k, this.s.day).change; return `<div class="breakdown-row"><span class="lbl" title="${esc(nb.name)}">${esc(nb.name)}</span><span class="val ${c < 0 ? 'down' : ''}">${chg(c)}</span></div>`; }).join('');
    return `<div class="market-hud-overlay" data-testid="market-hud"><div class="market-hud-header">${ICON.trend} City-wide housing market · ${esc(phase)}</div>
      <div class="market-hud-grid"><div class="growth-primary"><div class="lbl">Growth</div><div class="val ${yr < 0 ? 'down' : ''}" data-testid="hud-growth">${chg(yr)}</div><div class="period">over the last ${months} month(s)</div></div>
        <div class="growth-sub-breakdown">${rows}</div></div>
      <div class="market-disclaimer"><span aria-hidden="true">ℹ️</span><span>Each neighbourhood moves differently (last ${Math.min(12, months)} months shown). Values as of ${fmtDate(this.s.day)}. Nobody can tell you what happens next.</span></div></div>`;
  }

  r_market() {
    const day = this.s.day;
    const list = Object.entries(PROPERTIES).filter(([, p]) => this.cat === 'all' || p.hood === this.cat).map(([id, p]) => ({ id, p, c: buyCost(id, day), rent: marketRent(id, day) }));
    if (this.sort === 'rent') list.sort((a, b) => b.rent - a.rent);
    if (this.sort === 'price-asc') list.sort((a, b) => a.c.price - b.c.price);
    if (this.sort === 'price-desc') list.sort((a, b) => b.c.price - a.c.price);
    const rows = list.map(({ id, p, c, rent }) => {
      const own = this.s.properties[id], home = homeId(this.s) === id, gap = c.price / c.value - 1;
      const badge = home ? '<span class="badge-current-home-inline">CURRENT HOME</span>' : own ? '<span class="badge-current-home-inline">YOURS</span>' : '';
      const acts = own ? '<div class="badge-you-rent">YOU OWN<br>THIS</div>'
        : `${home ? '<div class="badge-you-rent">YOU RENT<br>THIS</div>' : `<button class="btn-rent" data-a="rent" data-id="${id}">Rent</button>`}<button class="btn-buy" data-a="buy" data-id="${id}">Buy...</button>`;
      return `<div class="property-row" data-property="${id}">
        <div class="prop-main-info"><div class="prop-header-title"><span class="prop-name">${esc(LOCATIONS[id].name)}</span>${badge}</div>
          <div class="prop-subtitle">${esc(p.kind)} · ${esc(p.quality)}</div>
          <div class="prop-tags"><span class="tag-badge">${esc(NEIGHBOURHOODS[p.hood].name)}</span>${own ? `<span class="tag-badge">${STATUS[own.status]}</span>` : ''}</div></div>
        <div class="stat-col"><span class="stat-label">Asking Price</span><span class="stat-primary-val" data-testid="asking">${inr(c.price)}</span>
          <span class="stat-comparison ${gap > 0 ? '' : 'below'}">${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}% vs est.</span><span class="stat-est-val ${gap > 0 ? '' : 'below'}">${inr(c.value)}</span></div>
        <div class="stat-col"><span class="stat-label">Market Rent</span><span class="stat-primary-val" data-testid="rent">${inr(rent)}/mo</span></div>
        <div class="stat-col"><span class="stat-label">Owner Upkeep</span><span class="stat-primary-val">${inr(p.upkeep)}/mo</span></div>
        <div class="prop-actions">${acts}</div></div>`;
    }).join('');
    return (rows || '<div class="agent-empty">No properties found in this category.</div>')
      + `<p class="agent-note">Asking prices can be above or below the estimated market value. Buy in cash or with a home loan (up to ${MORTGAGE.tenureYears.at(-1)} years). Neighbourhoods: ${Object.values(NEIGHBOURHOODS).map(nb => `<b>${esc(nb.name)}</b> — ${esc(nb.about)}`).join(' ')}</p>`;
  }

  r_mine() {
    const own = Object.entries(this.s.properties);
    if (!own.length) return '<div class="empty">You don\'t own any property yet.</div>';
    const year = this.s.ledger.filter(e => e.status === 'ok' && this.s.day - e.day < 365);
    const sum = (cat, p) => year.filter(e => e.category === cat && e.deal === p.uid).reduce((a, e) => a + e.amount, 0);
    return `<div class="grid">${own.map(([id, p]) => {
      const sale = saleProceeds(this.s, id), home = homeId(this.s) === id, debt = securedBalance(this.s, id), t = p.tenant;
      const tenant = t ? `<b>TENANT</b><span>${inr(t.rent)}/mo since ${fmtShortDate(t.since)}, lease to ${fmtShortDate(t.leaseEnd)} · ${t.reliable ? 'always pays on time' : 'sometimes pays late'}${t.arrears ? ` · <span class="neg">owes ${inr(t.arrears)}</span>` : ''}${t.late ? ' · rent due by the 15th' : ''}</span>
        <b>DEPOSIT HELD</b><span>${inr(t.deposit)} — the tenant's money, returned when they leave</span>` : '';
      return `<div class="card"><h3>${esc(LOCATIONS[id].name)}</h3><div>${STATUS[p.status]}</div>
        <div class="specs"><b>BOUGHT</b><span>${fmtShortDate(p.boughtDay)} for ${inr(p.price)} (+${inr(p.duty)} duty)</span><b>VALUE NOW</b><span>${inr(propertyValue(id, this.s.day))}</span>
        <b>LOAN OWED</b><span class="${debt ? 'neg' : ''}">${inr(debt)}</span>
        <b>RENT IN (12M)</b><span class="pos">${inr(sum('rent_income', p))}</span><b>UPKEEP (12M)</b><span class="neg">${inr(-sum('upkeep', p))}</span>
        <b>REPAIRS (12M)</b><span class="neg">${inr(-sum('repair', p))}</span>${tenant}${p.depositOwed ? `<b>DEPOSIT OWED</b><span class="neg">${inr(p.depositOwed)} to a former tenant</span>` : ''}
        <b>UNPAID BILLS</b><span>${inr(p.arrears ?? 0)}</span><b>IF SOLD</b><span>${inr(sale.toYou)} to you after fees${sale.deposits ? ', deposits' : ''}${debt ? ' and loan payoff' : ''}</span></div>
        <div class="row" style="flex-wrap:wrap">
          ${!home && p.status === 'vacant' ? `<button class="btn sm primary" data-a="movein" data-id="${id}">Move in</button><button class="btn sm" data-a="list" data-id="${id}">Rent it out</button>` : ''}
          ${['listed', 'let'].includes(p.status) ? `<button class="btn sm" data-a="unlist" data-id="${id}">Stop renting out</button>` : ''}
          ${p.arrears ? `<button class="btn sm" data-a="arrears" data-id="${id}">Pay ${inr(p.arrears)}</button>` : ''}
          ${home ? '<span class="muted">Move elsewhere before selling.</span>' : `<button class="btn sm danger" data-a="sell" data-id="${id}">Sell…</button>`}</div></div>`;
    }).join('')}</div>`;
  }

  r_reports() {
    const reps = allReports(this.s);
    if (!reps.length) return '<div class="empty">Buy a property and its performance will be tracked here — every rupee in and out.</div>';
    const row = (k, v, cls = '') => `<tr><td>${k}</td><td class="n ${cls}">${inr(v)}</td></tr>`;
    return reps.map(r => `<div class="card" style="margin-bottom:8px" data-report="${r.id}"><h3>${esc(r.name)} ${r.open ? '<span class="tag gold">HELD — ESTIMATE</span>' : `<span class="tag">${r.forced ? 'SOLD BY BANK — REALISED' : 'SOLD — REALISED'}</span>`}</h3>
      <p data-testid="verdict">${esc(r.verdict)}</p>
      <div class="split"><table class="t"><tr><th>Economic return ${r.open ? '(unrealised estimate)' : '(realised)'}</th><th class="n ${r.profit >= 0 ? 'pos' : 'neg'}">${inr(r.profit)}</th></tr>
          ${row(`${r.open ? 'Value today' : r.forced ? 'Forced-sale price' : 'Sale value'} − purchase price`, r.economic.appreciation, r.economic.appreciation >= 0 ? 'pos' : 'neg')}
          ${row('− Stamp duty, loan fees, selling costs', -r.economic.transaction, 'neg')}
          ${row('− Interest &amp; late fees (principal is not a cost)', -r.economic.financing, 'neg')}
          ${row(`+ Rent ${inr(r.rental.rent)}${r.rental.keptRent ? ` + deposit kept ${inr(r.rental.keptRent + r.rental.keptDamage)}` : ''} − upkeep ${inr(r.rental.upkeep)} − repairs ${inr(r.rental.repairs)}`, r.economic.rentalNet, r.economic.rentalNet >= 0 ? 'pos' : 'neg')}
          <tr><td><b>Return on your cash</b> (${inr(r.invested)} put in)</td><td class="n"><b>${(r.roi * 100).toFixed(1)}%</b></td></tr></table>
        <table class="t"><tr><th>Cash flow — your pocket</th><th class="n ${r.cash.result >= 0 ? 'pos' : 'neg'}">${inr(r.cash.result)}</th></tr>
          ${row('Cash in so far (rent, deposits, loan money, sale)', r.cash.in, 'pos')}${row('Cash out so far (down payment, fees, EMIs, bills, repayments)', -r.cash.out, 'neg')}
          ${r.open ? row('If sold today: value − fee − bills − deposits − loan payoff', r.cash.exitEstimate) : ''}${r.cash.debtStillOwed ? row('− Shortfall debt you still owe', -r.cash.debtStillOwed, 'neg') : ''}
          <tr><td>EMIs paid ${inr(r.loans.emis)} = interest ${inr(r.loans.interestPaid)} + principal ${inr(r.loans.principalRepaid - r.loans.prepaid)}</td><td></td></tr>
          ${r.loans.equityDrawn ? `<tr><td>Borrowed against it: ${inr(r.loans.equityDrawn)} (a debt, not income)</td><td></td></tr>` : ''}
          <tr><td>Still owed on it${r.open ? ' (loan payoff, tenant deposits, bills)' : ''}</td><td class="n ${r.outstanding ? 'neg' : ''}">${inr(r.outstanding)}</td></tr></table></div>
      <table class="t" style="margin-top:6px"><tr><th>What drove it</th><th class="n">Effect</th></tr>${r.drivers.map(d => `<tr><td>${esc(d.label)}</td><td class="n ${d.amount >= 0 ? 'pos' : 'neg'}">${d.amount >= 0 ? '+' : ''}${inr(d.amount)}</td></tr>`).join('')}</table>
      <p class="muted">Bought ${fmtShortDate(r.boughtDay)} for ${inr(r.price)} (estimate then ${inr(r.marketAtPurchase)}, market: ${esc(PHASES[r.phaseAtPurchase]?.label ?? 'unknown')}) · ${r.financed ? `home loan of ${inr(r.purchase.mortgage)}` : 'cash'} · held ${r.months} month(s) · ${esc(r.hood)}, ${esc(r.quality)} · ${r.rental.tenants} tenant(s), ${r.rental.vacantMonths} month(s) empty · ${r.valuations.length} monthly valuations recorded.</p></div>`).join('');
  }

  r_rules() {
    return `<p>• <b>Living, renting, owning:</b> you live in one place. Rent it (monthly rent) or own it (no rent, but upkeep). You can own several properties and rent the others out.</p>
      <p>• <b>Buying</b> costs the seller's asking price + ${R.stampDuty * 100}% stamp duty & registration. Pay in cash, or with a home loan: down payment ${MORTGAGE.downOptions.map(d => d * 100 + '%').join('/')} and ${MORTGAGE.tenureYears.join('/')} years at a fixed rate (base ${pct(MORTGAGE.baseRate)}, adjusted by your credit profile). Stamp duty and the ${MORTGAGE.fee * 100}% loan fee always come from your own money.</p>
      <p>• <b>Loan eligibility</b>: all EMIs ≤ ${LENDING_RULES.maxFoir * 100}% of eligible income, and income must still cover EMIs + essential bills (upkeep, car costs, grocery plan). Eligible income = salary + ${RENT_INCOME.allowance * 100}% of the average rent you actually received over the last ${RENT_INCOME.months} months from properties that have a tenant now. Empty properties and the home you're buying count for nothing.</p>
      <p>• <b>Prices</b> follow each neighbourhood's own index — the city cycle (growth → stable → decline → recovery) times the area's sensitivity, plus its own local ups and downs, never more than ±3% a month. Values update on the 1st and are recorded monthly. Nobody — including me — knows what comes next.</p>
      <p>• <b>Renting a home:</b> ${TENANCY.depositMonths} months' deposit + the first month's rent when you sign; the rent is fixed for your tenancy and due every 1st. Unpaid rent is owed: when you leave, your deposit covers it and the rest comes back; anything beyond the deposit is repaid to the landlord over ${TENANCY.arrearsMonths} months. Miss rent ${R.missedRentToEvict} months in a row and you're evicted.</p>
      <p>• <b>Renting yours out:</b> list a vacant property; a tenant arrives on the 1st after the neighbourhood's search time (0–2 extra months), pays a ${TENANCY.depositMonths}-month deposit (you hold it for them — it isn't income) and rent from that day. ${TENANCY.reliableShare * 100}% of tenants always pay on the 1st; the rest sometimes pay late (by the ${TENANCY.lateDay}th) or miss a month — two misses in a row and they leave. Leases run ${TENANCY.leaseMonths.join('/')} months. When a tenant leaves, the deposit covers unpaid rent and damage, the rest is refunded, you pay a wear-and-tear repair, and the property is listed again (empty until the next tenant). I keep ${R.agentFee * 100}% of rent.</p>
      <p>• <b>Upkeep</b> is charged every 1st for every property you own, plus occasional repairs (about ${REPAIRS.chance * 100}% of months).</p>
      <p>• <b>Selling</b> pays the market value − ${R.sellFee * 100}% fee − unpaid bills − any tenant's deposit; every loan on it is then repaid in full (balance + interest since the last EMI). If that isn't enough, you pay the difference or you can't sell.</p>
      <p>• <b>Missing ${LENDING_RULES.defaultAfter} EMIs</b> in a row: the bank sells the property ${LENDING_RULES.forcedSaleDiscount * 100}% below value and charges ${LENDING_RULES.enforcementCost * 100}% costs. Any surplus is yours; any shortfall stays a debt you repay over ${LENDING_RULES.shortfallMonths} months.</p>`;
  }

  renderConfirm() {
    const c = this.confirm;
    if (!c) return '';
    const name = esc(LOCATIONS[c.id].name);
    if (c.kind === 'buy') {
      const b = buyCost(c.id, this.s.day), cashOk = spendable(this.s) >= b.total;
      const finance = c.loan ? mortgageQuote(this.s, c.id, c.downPct, c.years) : null;
      const opts = `<div class="row" style="flex-wrap:wrap;margin:6px 0"><button class="tab ${c.loan ? '' : 'on'}" data-a="pay-cash">Pay in cash</button><button class="tab ${c.loan ? 'on' : ''}" data-a="pay-loan">Home loan</button>
        ${c.loan ? `<span class="muted">Down:</span>${MORTGAGE.downOptions.map(d => `<button class="tab ${c.downPct === d ? 'on' : ''}" data-a="down" data-t="${d}">${d * 100}%</button>`).join('')}
        <span class="muted">Term:</span>${MORTGAGE.tenureYears.map(y => `<button class="tab ${c.years === y ? 'on' : ''}" data-a="years" data-t="${y}">${y} yrs</button>`).join('')}` : ''}</div>`;
      const body = !finance
        ? `<p>${inr(b.price)} asking price + ${inr(b.duty)} stamp duty = <b>${inr(b.total)}</b> now (estimated value ${inr(b.value)}). Then ${inr(PROPERTIES[c.id].upkeep)}/month upkeep. Money after: ${inr(spendable(this.s) - b.total)}.</p>
           ${cashOk ? '' : `<div class="msg error">You're ${inr(b.total - spendable(this.s))} short — consider a home loan.</div>`}`
        : `<div class="specs"><b>PRICE</b><span>${inr(finance.price)} (estimate ${inr(finance.value)})</span><b>STAMP DUTY</b><span>${inr(finance.duty)}</span>
            <b>DOWN PAYMENT</b><span>${inr(finance.down)}</span><b>LOAN</b><span>${inr(finance.principal)}</span><b>RATE (FIXED)</b><span>${finance.rate === null ? '—' : pct(finance.rate)} for ${c.years} years</span>
            <b>EMI</b><span><b>${inr(finance.emi)}</b>/month from next month</span><b>TOTAL INTEREST</b><span>${inr(finance.totalInterest)}</span><b>TOTAL REPAYMENT</b><span>${inr(finance.totalRepay)}</span>
            <b>PROCESSING FEE</b><span>${inr(finance.fee)}</span><b>PAY NOW</b><span>${inr(finance.cashNeeded)} (down + duty + fee) → ${inr(finance.cashLeft)} left</span>
            <b>EXISTING EMIs</b><span>${inr(finance.existingEmis)}/month</span><b>ELIGIBLE INCOME</b><span>${inr(finance.income)} = salary ${inr(finance.incomeBreakdown.salary)}${finance.incomeBreakdown.rent ? ` + ${inr(finance.incomeBreakdown.rent)} counted rent (${RENT_INCOME.allowance * 100}% of the last ${RENT_INCOME.months} months' average)` : ''}</span><b>ALL EMIs / INCOME</b><span class="${finance.foir > 0.5 ? 'neg' : ''}">${Math.round(finance.foir * 100)}% (limit 50%)</span><b>ESSENTIAL BILLS</b><span>${inr(finance.essentials.total)}/month → ${inr(finance.leftAfterCommitments)} left after EMIs and bills</span>
            <b>CREDIT PROFILE</b><span>${finance.profile.score} · ${finance.profile.tier.name}</span></div>
           ${finance.ok ? '' : `<ul>${finance.reasons.map(r => `<li class="neg">${esc(r)}</li>`).join('')}</ul><p class="muted">To improve: ${finance.tips.map(esc).join(' ')}</p>`}`;
      const ok = finance ? finance.ok : cashOk;
      return `<div class="confirm"><h4>Buy ${name}?</h4>${opts}${body}
        <div class="row"><button class="btn primary" data-a="buy-confirm" ${ok ? '' : 'disabled'}>${finance ? `Buy with a ${inr(finance.principal)} loan` : `Buy for ${inr(b.total)}`}</button><button class="btn" data-a="cancel">Cancel</button></div></div>`;
    }
    if (c.kind === 'rent') {
      const t = rentTerms(this.s, c.id), h = this.s.housing;
      const back = h?.kind === 'rent' ? Math.max(0, (h.deposit ?? 0) - (h.arrears ?? 0)) : 0, ok = spendable(this.s) + back >= t.total;
      return `<div class="confirm"><h4>Rent ${name}?</h4><p>First month's rent <b>${inr(t.rent)}</b> + a <b>${inr(t.deposit)}</b> security deposit (${TENANCY.depositMonths} months, returned when you leave, minus any unpaid rent) = <b>${inr(t.total)}</b> now. Then ${inr(t.rent)} every 1st (fixed for your tenancy).
        ${h ? `You'll move out of ${esc(LOCATIONS[h.propertyId].name)}${h.kind === 'rent' ? ` (that tenancy ends${back ? ` and ${inr(back)} of its deposit comes back to you` : ''}; its furniture goes to storage)` : ' (it stays yours, empty)'}.` : ''}</p>
        ${ok ? '' : `<div class="msg error">You're ${inr(t.total - spendable(this.s) - back)} short.</div>`}
        <div class="row"><button class="btn primary" data-a="rent-confirm" ${ok ? '' : 'disabled'}>Sign & pay ${inr(t.total)}</button><button class="btn" data-a="cancel">Cancel</button></div></div>`;
    }
    const s = saleProceeds(this.s, c.id);
    return `<div class="confirm"><h4>Sell ${name}?</h4><table class="t" data-testid="sale-calc">
        <tr><td>Market value</td><td class="n">${inr(s.value)}</td></tr><tr><td>− Selling fee (${R.sellFee * 100}%)</td><td class="n neg">${inr(-s.fee)}</td></tr>
        ${s.arrears ? `<tr><td>− Unpaid upkeep & repairs</td><td class="n neg">${inr(-s.arrears)}</td></tr>` : ''}${s.deposits ? `<tr><td>− Tenant's deposit, returned to them</td><td class="n neg">${inr(-s.deposits)}</td></tr>` : ''}
        <tr><td>= Net proceeds</td><td class="n">${inr(s.net)}</td></tr>
        ${s.debt ? `<tr><td>− Loan payoff (${s.loans} loan(s): balance + ${inr(s.interest)} interest since the last EMI)</td><td class="n neg">${inr(-s.debt)}</td></tr>` : ''}
        <tr><td><b>${s.toYou >= 0 ? 'Comes to you' : 'You must pay'}</b></td><td class="n ${s.toYou >= 0 ? 'pos' : 'neg'}"><b>${inr(Math.abs(s.toYou))}</b></td></tr></table>
      <p>${s.deposits ? 'The tenant leaves; furniture' : 'Furniture'} goes to storage. The loan is closed and can't be charged again.</p>
      ${s.toYou < 0 ? `<div class="msg ${spendable(this.s) >= -s.toYou ? 'warn' : 'error'}">The sale doesn't cover the loan: you'd pay ${inr(-s.toYou)} from your own money.</div>` : ''}
      <div class="row"><button class="btn danger" data-a="sell-confirm">Sell</button><button class="btn" data-a="cancel">Keep it</button></div></div>`;
  }

  onInput(el) { if (el.dataset.in === 'sort' && SORTS.some(([id]) => id === el.value)) this.sort = el.value; }

  onAction(a, el) {
    const id = el.dataset.id, name = id && LOCATIONS[id].name;
    const done = (r, ok) => { this.msg = r.ok ? { kind: 'ok', text: ok } : { kind: 'error', text: r.reason === 'not_eligible' ? 'The bank declined the loan — see the reasons.' : r.reason === 'negative_equity' ? `The sale doesn't cover the loan and you're ${inr(r.shortfall)} short.` : why(r) }; this.confirm = null; };
    const c = this.confirm;
    switch (a) {
      case 'tab': this.tab = el.dataset.t; this.confirm = null; this.msg = null; break;
      case 'cat': this.cat = el.dataset.t; break;
      case 'buy': this.confirm = { kind: 'buy', id, token: newToken(), loan: false, downPct: 0.2, years: 20 }; this.msg = null; break;
      case 'rent': case 'sell': this.confirm = { kind: a, id, token: newToken() }; this.msg = null; break;
      case 'pay-cash': c.loan = false; break;
      case 'pay-loan': c.loan = true; break;
      case 'down': c.downPct = +el.dataset.t; break;
      case 'years': c.years = +el.dataset.t; break;
      case 'cancel': this.confirm = null; break;
      case 'buy-confirm': done(this.game.act(s => buyProperty(s, c.id, c.token, c.loan ? { downPct: c.downPct, years: c.years } : null)), `${LOCATIONS[c.id].name} is yours${c.loan ? ' — your first EMI is due on the 1st of next month' : ''}. Move in or rent it out from the "Yours" tab.`); break;
      case 'rent-confirm': done(this.game.act(s => rentHome(s, c.id, c.token)), `You now rent ${LOCATIONS[c.id].name}. Welcome home!`); break;
      case 'sell-confirm': done(this.game.act(s => sellProperty(s, c.id, c.token)), `Sold ${LOCATIONS[c.id].name}.`); break;
      case 'movein': done(this.game.act(s => moveIn(s, id)), `You moved into ${name}.`); break;
      case 'list': done(this.game.act(s => listForRent(s, id)), `${name} is listed with me — I'll find a tenant.`); break;
      case 'unlist': done(this.game.act(s => stopRentingOut(s, id)), `${name} is vacant again${this.s.properties[id]?.pastTenants?.length ? ' — the tenant left and their deposit was settled' : ''}.`); break;
      case 'arrears': done(this.game.act(s => payPropertyArrears(s, id)), 'Upkeep arrears paid.'); break;
    }
  }
}
