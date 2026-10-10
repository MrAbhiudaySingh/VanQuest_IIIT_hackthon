// Lakshmi's property agency — functional UI (final design comes later). All rules live in sim/.
import { PROPERTIES, NEIGHBOURHOODS, PROPERTY_RULES as R, AGENT } from '../data/properties.js';
import { MORTGAGE } from '../data/lending.js';
import { LOCATIONS } from '../data/locations.js';
import { buyProperty, sellProperty, rentHome, moveIn, listForRent, stopRentingOut, buyCost, saleProceeds, propertyValue, marketRent, payPropertyArrears, homeId } from '../sim/property.js';
import { PHASES, marketPhase, indexHistory } from '../sim/housingMarket.js';
import { mortgageQuote, securedBalance } from '../sim/loans.js';
import { allReports } from '../sim/propertyReport.js';
import { spendable } from '../sim/ledger.js';
import { inr, fmtShortDate } from '../sim/util.js';
import { esc, newToken, why } from './core.js';

const STATUS = { home: 'You live here', vacant: 'Vacant', listed: 'Listed — looking for a tenant', let: 'Let to a tenant' };
const pct = r => `${(r * 100).toFixed(2)}%`;

export class PropertyPanel {
  constructor(game, { tab = 'market' } = {}) {
    this.game = game;
    this.title = 'Lakshmi Rao — Property agent';
    this.sub = `${esc(AGENT.role)} · "Renting or buying — let's look at what you can actually afford."`;
    this.tab = tab; this.confirm = null; this.msg = null;
  }
  get s() { return this.game.state; }
  headExtra() {
    const n = Object.keys(this.s.properties).length, r = this.s.propertyHistory.length + n;
    return `<div class="tabs" style="margin:0">${[['market', 'Properties'], ['mine', `Yours (${n})`], ['reports', `Performance (${r})`], ['rules', 'Rules']]
      .map(([t, l]) => `<button class="tab ${this.tab === t ? 'on' : ''}" data-a="tab" data-t="${t}">${l}</button>`).join('')}</div>`;
  }
  render() {
    const h = this.s.housing;
    const living = !h ? '<div class="msg error">You have no home. Renting the cheapest flat is the quickest fix.</div>'
      : `<div class="msg">You live at <b>${esc(LOCATIONS[h.propertyId].name)}</b> — ${h.kind === 'rent' ? `renting at ${inr(h.rent)}/month (paid on the 1st)` : 'you own it'}.</div>`;
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    return msg + living + this[`r_${this.tab}`]() + this.renderConfirm();
  }

  marketBanner() {
    const hist = indexHistory(this.s.day, 13), phase = PHASES[marketPhase(this.s.day)].label;
    const yr = hist.length > 1 ? hist.at(-1).index / hist[0].index - 1 : 0;
    return `<div class="msg">Housing market right now: <b>${phase}</b> · prices ${yr >= 0 ? 'up' : 'down'} ${Math.abs(yr * 100).toFixed(1)}% over the last ${hist.length - 1} month(s). Nobody can tell you what happens next.</div>`;
  }

  r_market() {
    const rows = Object.entries(PROPERTIES).map(([id, p]) => {
      const c = buyCost(id, this.s.day), own = this.s.properties[id], home = homeId(this.s) === id, gap = c.price / c.value - 1;
      const status = own ? `<span class="tag gold">YOURS</span> ${STATUS[own.status]}` : home ? '<span class="tag ok">YOU RENT THIS</span>' : '<span class="tag">FOR SALE / TO LET</span>';
      const acts = own ? '' : `${home ? '' : `<button class="btn sm" data-a="rent" data-id="${id}">Rent</button>`}<button class="btn sm primary" data-a="buy" data-id="${id}">Buy…</button>`;
      return `<tr><td><b>${esc(LOCATIONS[id].name)}</b><div class="muted">${esc(p.kind)} · ${esc(p.quality)} · ${esc(NEIGHBOURHOODS[p.hood].name)}</div></td>
        <td class="n">${inr(c.price)}<div class="muted ${gap > 0 ? 'neg' : 'pos'}">${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}% vs est. ${inr(c.value)}</div></td>
        <td class="n">${inr(marketRent(id, this.s.day))}/mo</td><td class="n">${inr(p.upkeep)}/mo</td><td>${status}</td><td><div class="row">${acts}</div></td></tr>`;
    }).join('');
    return this.marketBanner() + `<table class="t"><tr><th>Property</th><th class="n">Asking price</th><th class="n">Market rent</th><th class="n">Owner upkeep</th><th>Status</th><th></th></tr>${rows}</table>
      <p class="muted" style="margin-top:8px">Asking prices can be above or below the estimated market value. Buy in cash or with a home loan (up to ${MORTGAGE.tenureYears.at(-1)} years). Neighbourhoods: ${Object.values(NEIGHBOURHOODS).map(n => `<b>${esc(n.name)}</b> — ${esc(n.about)}`).join(' ')}</p>`;
  }

  r_mine() {
    const own = Object.entries(this.s.properties);
    if (!own.length) return '<div class="empty">You don\'t own any property yet.</div>';
    const year = this.s.ledger.filter(e => e.status === 'ok' && this.s.day - e.day < 365);
    const sum = (cat, p) => year.filter(e => e.category === cat && e.deal === p.uid).reduce((a, e) => a + e.amount, 0);
    return `<div class="grid">${own.map(([id, p]) => {
      const sale = saleProceeds(this.s, id), home = homeId(this.s) === id, debt = securedBalance(this.s, id);
      return `<div class="card"><h3>${esc(LOCATIONS[id].name)}</h3><div>${STATUS[p.status]}</div>
        <div class="specs"><b>BOUGHT</b><span>${fmtShortDate(p.boughtDay)} for ${inr(p.price)} (+${inr(p.duty)} duty)</span><b>VALUE NOW</b><span>${inr(propertyValue(id, this.s.day))}</span>
        <b>LOAN OWED</b><span class="${debt ? 'neg' : ''}">${inr(debt)}</span>
        <b>RENT IN (12M)</b><span class="pos">${inr(sum('rent_income', p))}</span><b>UPKEEP (12M)</b><span class="neg">${inr(-sum('upkeep', p))}</span>
        <b>UNPAID UPKEEP</b><span>${inr(p.arrears ?? 0)}</span><b>IF SOLD</b><span>${inr(sale.toYou)} to you after fees${debt ? ' and loan' : ''}</span></div>
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
    return reps.map(r => `<div class="card" style="margin-bottom:8px"><h3>${esc(r.name)} ${r.open ? '<span class="tag gold">HELD</span>' : `<span class="tag">${r.forced ? 'SOLD BY BANK' : 'SOLD'}</span>`}</h3>
      <p>${esc(r.verdict)}</p>
      <div class="split"><table class="t"><tr><th>Your money in</th><th class="n">${inr(r.invested)}</th></tr>
          <tr><td>Down payment + stamp duty</td><td class="n">${inr(r.down)}</td></tr><tr><td>Loan fees</td><td class="n">${inr(r.fees)}</td></tr>
          <tr><td>EMIs (interest ${inr(r.interest)})</td><td class="n">${inr(r.emis)}</td></tr><tr><td>Prepayments</td><td class="n">${inr(r.prepaid)}</td></tr><tr><td>Upkeep</td><td class="n">${inr(r.upkeep)}</td></tr></table>
        <table class="t"><tr><th>Money back</th><th class="n">${inr(r.returned)}</th></tr><tr><td>Rent received (${r.vacantMonths} month(s) empty)</td><td class="n">${inr(r.rent)}</td></tr>
          <tr><td>${r.open ? 'If sold today (after 2% fee and the loan)' : `Sale ${inr(r.saleNet)} − loans repaid ${inr(r.settled)}`}</td><td class="n">${inr(r.open ? r.ifSold : r.saleNet - r.settled)}</td></tr>
          <tr><td><b>Profit / loss</b> · return on your cash</td><td class="n ${r.profit >= 0 ? 'pos' : 'neg'}"><b>${inr(r.profit)}</b> · ${(r.roi * 100).toFixed(1)}%</td></tr></table></div>
      <table class="t" style="margin-top:6px"><tr><th>What drove it</th><th class="n">Effect</th></tr>${r.drivers.map(d => `<tr><td>${esc(d.label)}</td><td class="n ${d.amount >= 0 ? 'pos' : 'neg'}">${d.amount >= 0 ? '+' : ''}${inr(d.amount)}</td></tr>`).join('')}</table>
      <p class="muted">Bought ${fmtShortDate(r.boughtDay)} for ${inr(r.price)} (estimate then ${inr(r.marketAtPurchase)}, market: ${esc(PHASES[r.phaseAtPurchase]?.label ?? 'unknown')}) · ${r.financed ? 'home loan' : 'cash'} · held ${r.months} month(s) · ${esc(r.hood)}, ${esc(r.quality)}.</p></div>`).join('');
  }

  r_rules() {
    return `<p>• <b>Living, renting, owning:</b> you live in one place. Rent it (monthly rent) or own it (no rent, but upkeep). You can own several properties and rent the others out.</p>
      <p>• <b>Buying</b> costs the seller's asking price + ${R.stampDuty * 100}% stamp duty & registration. Pay in cash, or with a home loan: down payment ${MORTGAGE.downOptions.map(d => d * 100 + '%').join('/')} and ${MORTGAGE.tenureYears.join('/')} years at a fixed rate (base ${pct(MORTGAGE.baseRate)}, adjusted by your credit profile). Stamp duty and the ${MORTGAGE.fee * 100}% loan fee always come from your own money.</p>
      <p>• <b>Prices</b> follow the neighbourhood's long-run growth and the housing-market cycle (growth → stable → decline → recovery). Premium areas swing hardest. Values update on the 1st. Nobody — including me — knows what comes next.</p>
      <p>• <b>Renting a home:</b> the market rent when you sign is paid then and on every 1st. Moving ends the tenancy; furniture goes to storage. Miss rent ${R.missedRentToEvict} months in a row and you're evicted.</p>
      <p>• <b>Renting yours out:</b> list a vacant property; a tenant arrives on the 1st after the neighbourhood's search time (0–2 months) and pays the current market rent each 1st; I keep ${R.agentFee * 100}%. You can't let out the place you live in.</p>
      <p>• <b>Upkeep</b> is charged every 1st for every property you own.</p>
      <p>• <b>Selling</b> pays the market value − ${R.sellFee * 100}% fee − unpaid upkeep; any loan on the property is repaid first. If that isn't enough, you need the difference or you can't sell.</p>`;
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
            <b>EXISTING EMIs</b><span>${inr(finance.existingEmis)}/month</span><b>ALL EMIs / SALARY</b><span class="${finance.foir > 0.5 ? 'neg' : ''}">${Math.round(finance.foir * 100)}% (limit 50%)</span>
            <b>CREDIT PROFILE</b><span>${finance.profile.score} · ${finance.profile.tier.name}</span></div>
           ${finance.ok ? '' : `<ul>${finance.reasons.map(r => `<li class="neg">${esc(r)}</li>`).join('')}</ul><p class="muted">To improve: ${finance.tips.map(esc).join(' ')}</p>`}`;
      const ok = finance ? finance.ok : cashOk;
      return `<div class="confirm"><h4>Buy ${name}?</h4>${opts}${body}
        <div class="row"><button class="btn primary" data-a="buy-confirm" ${ok ? '' : 'disabled'}>${finance ? `Buy with a ${inr(finance.principal)} loan` : `Buy for ${inr(b.total)}`}</button><button class="btn" data-a="cancel">Cancel</button></div></div>`;
    }
    if (c.kind === 'rent') {
      const rent = marketRent(c.id, this.s.day), ok = spendable(this.s) >= rent, h = this.s.housing;
      return `<div class="confirm"><h4>Rent ${name}?</h4><p>First month's rent <b>${inr(rent)}</b> now, then ${inr(rent)} every 1st (fixed for your tenancy).
        ${h ? `You'll move out of ${esc(LOCATIONS[h.propertyId].name)}${h.kind === 'rent' ? ' (that tenancy ends; its furniture goes to storage)' : ' (it stays yours, empty)'}.` : ''}</p>
        ${ok ? '' : `<div class="msg error">You're ${inr(rent - spendable(this.s))} short.</div>`}
        <div class="row"><button class="btn primary" data-a="rent-confirm" ${ok ? '' : 'disabled'}>Sign & pay ${inr(rent)}</button><button class="btn" data-a="cancel">Cancel</button></div></div>`;
    }
    const s = saleProceeds(this.s, c.id);
    return `<div class="confirm"><h4>Sell ${name}?</h4><p>${inr(s.value)} − ${inr(s.fee)} fee${s.arrears ? ` − ${inr(s.arrears)} unpaid upkeep` : ''} = ${inr(s.net)}${s.debt ? `; ${inr(s.debt)} repays the loan, so <b>${inr(s.toYou)}</b> comes to you` : ''}. Any tenant leaves; furniture goes to storage.</p>
      ${s.toYou < 0 ? `<div class="msg ${spendable(this.s) >= -s.toYou ? 'warn' : 'error'}">The sale doesn't cover the loan: you'd pay ${inr(-s.toYou)} from your own money.</div>` : ''}
      <div class="row"><button class="btn danger" data-a="sell-confirm">Sell</button><button class="btn" data-a="cancel">Keep it</button></div></div>`;
  }

  footer() { return `<span class="muted">Cash + savings</span><span class="balance">${inr(spendable(this.s))}</span>`; }

  onAction(a, el) {
    const id = el.dataset.id, name = id && LOCATIONS[id].name;
    const done = (r, ok) => { this.msg = r.ok ? { kind: 'ok', text: ok } : { kind: 'error', text: r.reason === 'not_eligible' ? 'The bank declined the loan — see the reasons.' : r.reason === 'negative_equity' ? `The sale doesn't cover the loan and you're ${inr(r.shortfall)} short.` : why(r) }; this.confirm = null; };
    const c = this.confirm;
    switch (a) {
      case 'tab': this.tab = el.dataset.t; this.confirm = null; this.msg = null; break;
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
      case 'unlist': done(this.game.act(s => stopRentingOut(s, id)), `${name} is vacant again.`); break;
      case 'arrears': done(this.game.act(s => payPropertyArrears(s, id)), 'Upkeep arrears paid.'); break;
    }
  }
}
