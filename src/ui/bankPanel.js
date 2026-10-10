// Nidhi Bank — functional banking UI (the final design will replace this). All maths lives in sim/.
import { BANK, SAVINGS, FD_TERMS, FD_MIN, FD_PENALTY } from '../data/banking.js';
import { MORTGAGE, EQUITY, LENDING_RULES } from '../data/lending.js';
import { LOCATIONS } from '../data/locations.js';
import { deposit, withdraw, openFD, breakFD, fdMaturityValue, fdEarlyValue, fdAccruedValue } from '../sim/bank.js';
import { equityQuote, takeEquityLoan, prepay, schedule, loanName } from '../sim/loans.js';
import { creditProfile } from '../sim/credit.js';
import { balance } from '../sim/ledger.js';
import { inr, fmtDate, fmtShortDate, addMonths } from '../sim/util.js';
import { esc, newToken, why } from './core.js';

const pct = r => `${(r * 100).toFixed(2)}%`;
const reasons = q => `<ul>${q.reasons.map(r => `<li class="neg">${esc(r)}</li>`).join('')}</ul>${q.tips.length ? `<p class="muted">To improve: ${q.tips.map(esc).join(' ')}</p>` : ''}`;

export class BankPanel {
  constructor(game, { tab = 'accounts' } = {}) {
    this.game = game;
    this.title = BANK.name;
    this.sub = `${esc(BANK.banker.name)} · ${esc(BANK.banker.role)} — "Let's put your money where it works for you."`;
    this.tab = tab; this.amount = 1000; this.fdAmount = FD_MIN; this.fdTerm = 1;
    this.eq = { prop: null, amount: 100000, years: 5 }; this.confirm = null; this.msg = null;
  }
  get s() { return this.game.state; }
  headExtra() {
    return `<div class="tabs" style="margin:0">${[['accounts', 'Accounts'], ['fd', 'Fixed deposits'], ['loans', 'Loans'], ['credit', 'Credit profile'], ['rules', 'Rules']]
      .map(([t, l]) => `<button class="tab ${this.tab === t ? 'on' : ''}" data-a="tab" data-t="${t}">${l}</button>`).join('')}</div>`;
  }
  render() {
    const msg = this.msg ? `<div class="msg ${this.msg.kind}">${esc(this.msg.text)}</div>` : '';
    return msg + this[`r_${this.tab}`]() + this.renderConfirm();
  }
  footer() { return `<span class="muted">Cash</span><span class="balance">${inr(balance(this.s))}</span><span class="muted">Savings</span><span class="balance">${inr(balance(this.s, 'bank'))}</span>`; }

  r_accounts() {
    const s = this.s, b = s.bank;
    const recent = s.ledger.filter(e => e.account === 'bank').slice(-8).reverse()
      .map(e => `<tr class="${e.status === 'failed' ? 'muted' : ''}"><td>${fmtShortDate(e.day)}</td><td>${esc(e.memo)}</td><td class="n ${e.amount >= 0 ? 'pos' : 'neg'}">${e.amount >= 0 ? '+' : ''}${inr(e.amount)}</td></tr>`).join('');
    return `<div class="kpis"><div class="kpi"><div class="k">Cash on hand</div><div class="v">${inr(balance(s))}</div></div>
        <div class="kpi"><div class="k">Savings account</div><div class="v">${inr(balance(s, 'bank'))}</div></div>
        <div class="kpi"><div class="k">Interest rate</div><div class="v">${pct(SAVINGS.rate)} p.a.</div></div>
        <div class="kpi"><div class="k">Accrued, not yet paid</div><div class="v">${inr(Math.floor(b.accrued))}</div></div>
        <div class="kpi"><div class="k">Interest earned to date</div><div class="v pos">${inr(b.interestToDate)}</div></div></div>
      <p class="muted">Interest is worked out on each day's closing balance and paid into your savings on 1 Jan, 1 Apr, 1 Jul and 1 Oct (quarterly compounding). No fees, no minimum balance, free withdrawals. Bills and purchases use your cash first, then your savings.</p>
      <div class="row" style="margin:8px 0"><input class="num" type="number" min="1" step="100" value="${this.amount}" data-in="amount" aria-label="amount">
        <button class="btn primary" data-a="deposit">Deposit cash</button><button class="btn" data-a="withdraw">Withdraw cash</button></div>
      ${recent ? `<table class="t"><tr><th>Date</th><th>Savings activity</th><th class="n">Amount</th></tr>${recent}</table>` : '<div class="empty">No savings activity yet.</div>'}`;
  }

  r_fd() {
    const s = this.s, term = FD_TERMS[this.fdTerm];
    const list = s.bank.fds.slice().reverse().map(f => `<tr><td>${f.uid}</td><td class="n">${inr(f.principal)}</td><td class="n">${pct(f.rate)}</td><td>${fmtShortDate(f.startDay)} → ${fmtDate(f.maturityDay)}</td>
      <td class="n">${inr(f.expected)}</td><td>${f.status === 'active' ? `<span class="tag gold">ACTIVE</span> worth ${inr(fdAccruedValue(f, s.day))} now` : `<span class="tag">${f.status.toUpperCase()}</span> paid ${inr(f.payout)}`}</td>
      <td>${f.status === 'active' ? `<button class="btn sm danger" data-a="break" data-id="${f.uid}">Close early…</button>` : ''}</td></tr>`).join('');
    return `<div class="card"><h3>Open a fixed deposit (from savings: ${inr(balance(s, 'bank'))})</h3>
        <div class="row" style="flex-wrap:wrap">${FD_TERMS.map((t, i) => `<button class="tab ${this.fdTerm === i ? 'on' : ''}" data-a="term" data-t="${i}">${t.months} months · ${pct(t.rate)}</button>`).join('')}</div>
        <div class="row"><input class="num" type="number" min="${FD_MIN}" step="1000" value="${this.fdAmount}" data-in="fdAmount" aria-label="FD amount">
        <span>matures in ${term.months} months for <b>${inr(fdMaturityValue(Math.max(0, this.fdAmount | 0), term.rate, term.months))}</b> (quarterly compounding)</span>
        <button class="btn primary" data-a="fd-open">Open FD…</button></div>
        <p class="muted">Minimum ${inr(FD_MIN)}. The money leaves your savings and can't be spent until the FD ends. Closing early: you get (rate − ${FD_PENALTY * 100}%) for the time held — never less than you put in.</p></div>
      ${list ? `<table class="t" style="margin-top:10px"><tr><th>FD</th><th class="n">Deposit</th><th class="n">Rate</th><th>Start → maturity</th><th class="n">At maturity</th><th>Status</th><th></th></tr>${list}</table>` : '<div class="empty" style="margin-top:10px">No fixed deposits yet.</div>'}`;
  }

  r_loans() {
    const s = this.s;
    const loans = s.loans.slice().reverse().map(l => {
      const sched = schedule(l.principal, l.rate, l.months);
      return `<div class="card"><h3>${esc(loanName(l))} <span class="tag ${l.status === 'active' ? 'gold' : ''}">${l.status.toUpperCase()}</span></h3>
        <div class="specs"><b>BORROWED</b><span>${inr(l.principal)} on ${fmtShortDate(l.startDay)}</span><b>RATE (FIXED)</b><span>${pct(l.rate)} for ${l.months / 12} years</span>
        <b>EMI</b><span>${inr(l.emi)} on the 1st</span><b>STILL OWED</b><span>${inr(l.balance)}</span><b>PAID SO FAR</b><span>${l.paidCount} EMIs · interest ${inr(l.interestPaid)}</span>
        <b>SCHEDULED INTEREST</b><span>${inr(sched.reduce((a, r) => a + r.interest, 0))} over the full term</span>
        <b>MISSED</b><span class="${l.missed ? 'neg' : ''}">${l.missedDays.length} total, ${l.missed} in a row${l.lateFees ? ` · late fees ${inr(l.lateFees)}` : ''}</span></div>
        ${l.status === 'active' ? `<div class="row"><input class="num" type="number" min="1000" step="1000" value="${Math.min(l.balance, 10000)}" data-in="prepay-${l.uid}" aria-label="prepay amount"><button class="btn sm" data-a="prepay" data-id="${l.uid}">Prepay</button></div>` : ''}</div>`;
    }).join('');
    const owned = Object.keys(s.properties);
    const p = this.eq.prop && s.properties[this.eq.prop] ? this.eq.prop : owned[0] ?? null;
    let eq = '<div class="empty">Home-equity loans need a property you own.</div>';
    if (p) {
      this.eq.prop = p;
      const q = equityQuote(s, p, this.eq.amount, this.eq.years);
      eq = `<div class="card"><h3>Borrow against your property (home-equity loan)</h3>
        <div class="row" style="flex-wrap:wrap">${owned.map(id => `<button class="tab ${p === id ? 'on' : ''}" data-a="eq-prop" data-t="${id}">${esc(LOCATIONS[id].name)}</button>`).join('')}</div>
        <div class="specs"><b>VALUE</b><span>${inr(q.value)}</span><b>ALREADY OWED ON IT</b><span>${inr(q.existing)}</span><b>LOAN-TO-VALUE LIMIT</b><span>${q.ltv * 100}%</span>
        <b>MAX YOU CAN BORROW</b><span>${inr(q.maxLoan)}</span><b>RATE (FIXED)</b><span>${q.rate === null ? '—' : pct(q.rate)}</span><b>EMI</b><span>${inr(q.emi)}/month</span>
        <b>TOTAL REPAYMENT</b><span>${inr(q.totalRepay)} (interest ${inr(q.totalInterest)})</span><b>FEE</b><span>${inr(q.fee)}</span></div>
        <div class="row"><input class="num" type="number" min="10000" step="10000" value="${this.eq.amount}" data-in="eq-amount" aria-label="loan amount">
          ${EQUITY.tenureYears.map(y => `<button class="tab ${this.eq.years === y ? 'on' : ''}" data-a="eq-years" data-t="${y}">${y} yrs</button>`).join('')}
          <button class="btn primary" data-a="eq-apply" ${q.ok ? '' : 'disabled'}>Apply…</button></div>
        ${q.ok ? '' : reasons(q)}
        <p class="muted">This is borrowing against your home, not free money. Miss ${LENDING_RULES.defaultAfter} EMIs in a row and the bank sells the property to get its money back.</p></div>`;
    }
    return `${loans || '<div class="empty">No loans. Home loans are offered when you buy a property through Lakshmi, the agent.</div>'}<div style="margin-top:10px">${eq}</div>`;
  }

  r_credit() {
    const c = creditProfile(this.s);
    return `<div class="kpis"><div class="kpi"><div class="k">Credit profile</div><div class="v">${c.score}</div></div><div class="kpi"><div class="k">Tier</div><div class="v">${c.tier.name}</div></div>
      <div class="kpi"><div class="k">Rate offered</div><div class="v">${c.tier.eligible ? `base ${c.tier.rateAdj >= 0 ? '+' : ''}${pct(c.tier.rateAdj)}` : 'no new loans'}</div></div></div>
      <table class="t"><tr><th>What counts</th><th class="n">Points</th></tr>${c.factors.map(f => `<tr><td>${esc(f.label)}</td><td class="n ${f.points < 0 ? 'neg' : f.points > 0 && f.label !== 'Starting point' ? 'pos' : ''}">${f.points > 0 && f.label !== 'Starting point' ? '+' : ''}${f.points}</td></tr>`).join('')}
      <tr><td><b>Total</b></td><td class="n"><b>${c.score}</b></td></tr></table>
      <p class="muted">Tiers: Excellent 780+, Good 720+, Fair 650+, Poor 550+, Very poor below 550 (no new loans). Your rate is fixed when you take a loan — a later change in your profile doesn't change existing loans.</p>`;
  }

  r_rules() {
    return `<p><b>Savings:</b> ${pct(SAVINGS.rate)} a year on each day's closing balance, paid quarterly (1 Jan/Apr/Jul/Oct). No fees.</p>
      <p><b>Fixed deposits:</b> ${FD_TERMS.map(t => `${t.months} m ${pct(t.rate)}`).join(' · ')}; interest compounds quarterly and is paid with the principal at maturity. Early closure earns rate − ${FD_PENALTY * 100}% for the time held.</p>
      <p><b>Home loans</b> (at purchase, via the agent): base ${pct(MORTGAGE.baseRate)} fixed, adjusted by your credit tier; ${MORTGAGE.tenureYears.join('/')} years; down payment ${MORTGAGE.downOptions.map(d => d * 100 + '%').join('/')} (loans up to ₹30 lakh may cover 90% of the price, up to ₹75 lakh 80%, larger 75%). Processing fee ${MORTGAGE.fee * 100}% (min ${inr(MORTGAGE.feeMin)}). Stamp duty is never financed.</p>
      <p><b>Home-equity loans:</b> base + ${pct(EQUITY.rateAdd)}, up to ${EQUITY.ltv * 100}% of the property's value minus what's already owed on it; ${EQUITY.tenureYears.join('/')} years; fee ${EQUITY.fee * 100}%.</p>
      <p><b>Eligibility:</b> all EMIs together must stay within ${LENDING_RULES.maxFoir * 100}% of your salary, you must have the up-front money, and your credit tier must not be "Very poor".</p>
      <p><b>Missed EMI:</b> nothing is taken; that month's interest + ${inr(LENDING_RULES.lateFee)} late fee are added to what you owe and it shows on your credit profile. ${LENDING_RULES.defaultAfter} in a row = default: the bank sells the property at a ${LENDING_RULES.forcedSaleDiscount * 100}% discount, repays itself and returns any surplus.</p>
      <p><b>EMI formula:</b> EMI = P·r(1+r)<sup>n</sup> / ((1+r)<sup>n</sup> − 1), r = yearly rate ÷ 12, n = months. Each month's interest = what you still owe × r; the rest of the EMI repays the loan.</p>`;
  }

  renderConfirm() {
    const c = this.confirm;
    if (!c) return '';
    const box = (title, body, label, kind = 'primary') => `<div class="confirm"><h4>${title}</h4><p>${body}</p><div class="row"><button class="btn ${kind}" data-a="confirm">${label}</button><button class="btn" data-a="cancel">Cancel</button></div></div>`;
    if (c.kind === 'prepay') return box('Prepay this loan?', `${inr(c.amount)} goes straight to reducing what you owe. Your EMI stays the same, so the loan ends sooner and you pay less interest.`, `Prepay ${inr(c.amount)}`);
    if (c.kind === 'deposit') return box('Deposit cash into savings?', `${inr(c.amount)} moves from cash to your savings account.`, `Deposit ${inr(c.amount)}`);
    if (c.kind === 'withdraw') return box('Withdraw cash?', `${inr(c.amount)} moves from savings to cash.`, `Withdraw ${inr(c.amount)}`);
    if (c.kind === 'fd') { const t = FD_TERMS[c.term]; return box(`Open a ${t.months}-month FD?`, `${inr(c.amount)} moves from savings into the FD at ${pct(t.rate)}. It matures on ${fmtDate(addMonths(this.s.day, t.months))} for ${inr(fdMaturityValue(c.amount, t.rate, t.months))}.`, `Open FD of ${inr(c.amount)}`); }
    if (c.kind === 'break') { const f = this.s.bank.fds.find(x => x.uid === c.uid); return box('Close this FD early?', `You'll get ${inr(fdEarlyValue(f, this.s.day))} now instead of ${inr(f.expected)} at maturity (rate − ${FD_PENALTY * 100}% for the time held).`, 'Close early', 'danger'); }
    if (c.kind === 'equity') { const q = equityQuote(this.s, c.prop, c.amount, c.years); return box('Take this home-equity loan?', `${inr(c.amount)} is paid into your savings; you repay ${inr(q.emi)} every month for ${c.years} years (total ${inr(q.totalRepay)}). Fee ${inr(q.fee)}. ${esc(LOCATIONS[c.prop].name)} is the collateral.`, `Borrow ${inr(c.amount)}`); }
    return '';
  }

  onInput(el) {
    const v = Math.floor(Number(el.value) || 0);
    if (el.dataset.in === 'amount') this.amount = v;
    if (el.dataset.in === 'fdAmount') this.fdAmount = v;
    if (el.dataset.in === 'eq-amount') this.eq.amount = v;
    if (el.dataset.in?.startsWith('prepay-')) this[el.dataset.in] = v;
    this.confirm = null;
  }

  onAction(a, el) {
    const done = (r, ok) => { this.msg = r.ok ? { kind: 'ok', text: ok } : { kind: 'error', text: r.reason === 'not_eligible' ? 'Not eligible — see the reasons above.' : r.reason === 'below_minimum' ? `The minimum FD is ${inr(FD_MIN)}.` : why(r) }; this.confirm = null; };
    switch (a) {
      case 'tab': this.tab = el.dataset.t; this.confirm = null; this.msg = null; break;
      case 'deposit': case 'withdraw': this.confirm = { kind: a, amount: this.amount, token: newToken() }; this.msg = null; break;
      case 'term': this.fdTerm = +el.dataset.t; this.confirm = null; break;
      case 'fd-open': this.confirm = { kind: 'fd', amount: this.fdAmount, term: this.fdTerm, token: newToken() }; this.msg = null; break;
      case 'break': this.confirm = { kind: 'break', uid: el.dataset.id, token: newToken() }; this.msg = null; break;
      case 'eq-prop': this.eq.prop = el.dataset.t; break;
      case 'eq-years': this.eq.years = +el.dataset.t; break;
      case 'eq-apply': this.confirm = { kind: 'equity', prop: this.eq.prop, amount: this.eq.amount, years: this.eq.years, token: newToken() }; this.msg = null; break;
      case 'prepay': { const uid = el.dataset.id; this.confirm = { kind: 'prepay', uid, amount: this[`prepay-${uid}`] ?? Math.min(10000, this.s.loans.find(l => l.uid === uid).balance), token: newToken() }; this.msg = null; break; }
      case 'cancel': this.confirm = null; break;
      case 'confirm': {
        const c = this.confirm;
        if (c.kind === 'prepay') done(this.game.act(s => prepay(s, c.uid, c.amount, c.token)), `Prepaid ${inr(c.amount)}.`);
        if (c.kind === 'deposit') done(this.game.act(s => deposit(s, c.amount, c.token)), `Deposited ${inr(c.amount)}.`);
        if (c.kind === 'withdraw') done(this.game.act(s => withdraw(s, c.amount, c.token)), `Withdrew ${inr(c.amount)}.`);
        if (c.kind === 'fd') done(this.game.act(s => openFD(s, c.amount, c.term, c.token)), `FD opened: ${inr(c.amount)}.`);
        if (c.kind === 'break') done(this.game.act(s => breakFD(s, c.uid, c.token)), 'FD closed — the money is in your savings.');
        if (c.kind === 'equity') done(this.game.act(s => takeEquityLoan(s, c.prop, c.amount, c.years, c.token)), `${inr(c.amount)} paid into your savings. First EMI on the 1st.`);
        break;
      }
    }
  }
}
