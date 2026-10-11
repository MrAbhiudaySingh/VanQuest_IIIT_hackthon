// Nidhi Bank in the supplied design (Assets/supplied-ui/part 2/Bank → skins/bank.css, helpers in
// skins/bankKit.js): the banking hall, the console with its five tabs, the five pillar counters,
// notice ribbon, deposit/withdraw bar, savings-activity log and cash/savings chips. The template only
// draws the Accounts tab; the other tabs (fixed deposits, loans, credit profile, rules) show their
// content inside the same console. Presentation only — every number and action comes from sim/.
import { BANK, SAVINGS, FD_TERMS, FD_MIN, FD_PENALTY } from '../data/banking.js';
import { MORTGAGE, EQUITY, LENDING_RULES, RENT_INCOME } from '../data/lending.js';
import { LOCATIONS } from '../data/locations.js';
import { deposit, withdraw, openFD, breakFD, fdMaturityValue, fdEarlyValue, fdAccruedValue } from '../sim/bank.js';
import { equityQuote, takeEquityLoan, prepay, schedule, loanName, accruedInterest } from '../sim/loans.js';
import { creditProfile } from '../sim/credit.js';
import { balance } from '../sim/ledger.js';
import { inr, fmtDate, fmtShortDate, addMonths } from '../sim/util.js';
import { esc, newToken, why } from './core.js';
import { getPillarPropSVG, PILLARS, ICONS, playPixelSound } from './skins/bankKit.js';

const pct = r => `${(r * 100).toFixed(2)}%`;
const num = v => Number(v).toLocaleString('en-IN');
const reasons = q => `<ul>${q.reasons.map(r => `<li class="neg">${esc(r)}</li>`).join('')}</ul>${q.tips.length ? `<p class="muted">To improve: ${q.tips.map(esc).join(' ')}</p>` : ''}`;
const TABS = [['accounts', 'ACCOUNTS'], ['fd', 'FIXED DEPOSITS'], ['loans', 'LOANS'], ['credit', 'CREDIT PROFILE'], ['rules', 'RULES']];
// the template's slogan, banner mottos and officer line (from its bankConfig and placeholders)
const SLOGAN = 'YOUR MONEY. A BRIGHTER TOMORROW.', MOTTO_L = 'SAVE • PLAN • GROW', MOTTO_R = 'SECURE • TODAY • BRIGHTER';
const QUOTE = 'Let\'s put your money where it works for you.';
// savings-activity labels for the log, by ledger category
const LOG_TAG = { deposit: ['DEPOSIT', '#34d399'], withdrawal: ['WITHDRAW', '#38bdf8'], interest: ['INTEREST', '#facc15'], fd_open: ['TO FD', '#38bdf8'], fd_close: ['FROM FD', '#34d399'], loan_disbursement: ['LOAN IN', '#fef08a'] };

export class BankPanel {
  constructor(game, { tab = 'accounts' } = {}) {
    this.game = game;
    this.title = BANK.name;
    this.tab = tab; this.amount = 1000; this.fdAmount = FD_MIN; this.fdTerm = 1;
    this.eq = { prop: null, amount: 100000, years: 5 }; this.confirm = null; this.msg = null;
  }
  get s() { return this.game.state; }

  frame() {
    const s = this.s, name = BANK.name.toUpperCase();
    const tab = ([t, l]) => `<button class="pixel-bank-tab ${this.tab === t ? 'active' : ''}" data-a="tab" data-t="${t}">${l}</button>`;
    return `<div class="vq-bank">
      <div class="ambient-hall-backdrop"></div><div class="ambient-vignette"></div>
      <aside class="hall-banner banner-left" aria-hidden="true"><div class="banner-pillar-icon">${ICONS.bannerLeft}</div><div class="banner-motto">${MOTTO_L}</div></aside>
      <aside class="hall-banner banner-right" aria-hidden="true"><div class="banner-pillar-icon">${ICONS.bannerRight}</div><div class="banner-motto">${MOTTO_R}</div></aside>
      <div class="bank-clerk-booth" aria-hidden="true"><div class="clerk-sprite">${ICONS.clerk}</div><div class="clerk-desk-counter"></div></div>
      <aside class="bank-aframe-sign" aria-hidden="true"><div class="bank-sign-inner">${ICONS.signBoard}<div class="sign-inst-name">${name}</div></div><div class="sign-leg leg-l"></div><div class="sign-leg leg-r"></div></aside>
      <div class="grand-entrance-plaque"><div class="plaque-gold-rim"><div class="plaque-inner"><div class="plaque-pillar-emblem">${ICONS.plaqueEmblem}</div>
        <div class="plaque-text-block"><h1 class="plaque-title">${name}</h1><div class="plaque-slogan">${SLOGAN}</div></div></div></div></div>
      <main class="bank-console-window" role="dialog" aria-labelledby="bankHeaderTitle">
        <header class="bank-console-header">
          <div class="bank-header-profile"><h2 class="bank-name-heading" id="bankHeaderTitle">${name}</h2>
            <div class="bank-officer-quote-line"><span class="officer-name">${esc(BANK.banker.name)}</span><span class="officer-sep">•</span><span class="officer-role">${esc(BANK.banker.role)}</span>
              <span class="officer-dash">—</span><span class="officer-quote">"${esc(QUOTE)}"</span></div></div>
          <div class="bank-header-right-nav"><div class="bank-nav-cluster"><div class="nav-row-top">${TABS.slice(0, 3).map(tab).join('')}</div><div class="nav-row-bottom">${TABS.slice(3).map(tab).join('')}</div></div>
            <button class="pixel-bank-close-btn" data-a="close" title="Close Bank Window" aria-label="Close Bank"><span>✕</span></button></div>
        </header>
        ${this.tab === 'accounts' ? this.accounts() : `<section class="bank-tab-body" data-scroll="tab">${this[`r_${this.tab}`]()}</section>`}
        <footer class="bank-console-footer">
          <div class="footer-balance-chip chip-wallet"><div class="chip-icon">${ICONS.wallet}</div><span class="chip-label">CASH:</span><span class="chip-currency">₹</span><span class="chip-value" data-testid="bank-cash">${num(balance(s))}</span></div>
          <div class="footer-balance-chip chip-savings"><div class="chip-icon">${ICONS.piggy}</div><span class="chip-label">SAVINGS:</span><span class="chip-currency">₹</span><span class="chip-value" data-testid="bank-savings">${num(balance(s, 'bank'))}</span></div>
        </footer>
        <div class="pixel-toast ${this.msg ? 'show' : ''} ${this.msg ? `said-${this.msg.kind}` : ''}" aria-live="polite" data-testid="bank-msg">${esc(this.msg?.text ?? '')}</div>
        ${this.renderConfirm()}
      </main></div>`;
  }

  // ------------------------------------------------------------------ Accounts: the template's own layout
  accounts() {
    const s = this.s, b = s.bank;
    const values = { pillar_cash: ['CASH ON HAND', balance(s)], pillar_savings: ['SAVINGS ACCOUNT', balance(s, 'bank')], pillar_rate: ['INTEREST RATE', `${pct(SAVINGS.rate)} p.a.`],
      pillar_accrued: ['ACCRUED, NOT YET PAID', Math.floor(b.accrued)], pillar_earned: ['INTEREST EARNED TO DATE', b.interestToDate] };
    const pillars = PILLARS.map(([id, prop, green]) => {
      const [title, v] = values[id];
      return `<article class="pillar-arch-card ${green ? 'highlight-green' : ''}" id="${id}"><div class="pillar-arch-header"><span class="arch-flourish">◈</span><h3 class="pillar-arch-title">${title}</h3></div>
        <div class="pillar-arch-stage"><div class="arch-prop-sprite">${getPillarPropSVG(prop)}</div></div>
        <div class="pillar-arch-plaque">${typeof v === 'number' ? `<span class="arch-val-currency">₹</span><span class="arch-val-num">${num(v)}</span>` : `<span class="arch-val-num">${v}</span>`}</div></article>`;
    }).join('');
    const log = s.ledger.filter(e => e.account === 'bank').slice(-30).reverse().map(e => {
      const [tag, col] = e.status === 'failed' ? ['FAILED', '#64748b'] : LOG_TAG[e.category] ?? (e.amount >= 0 ? ['IN', '#34d399'] : ['PAID', '#f87171']);
      return `<div class="ledger-row" title="${esc(e.memo)}"><span style="color: ${col}; font-weight: bold;">[${tag}]</span><span class="ledger-memo">${esc(e.memo)}</span><span>${e.amount < 0 ? '−' : ''}₹${num(Math.abs(e.amount))}</span><span style="color: #64748b;">${fmtShortDate(e.day)}</span></div>`;
    }).join('');
    return `<section class="bank-pillars-grid" aria-label="Account Overview Counters">${pillars}</section>
      <section class="bank-info-ribbon"><p class="ribbon-text">Interest (${pct(SAVINGS.rate)} a year) is worked out on each day's closing balance and paid into savings on 1 Jan, 1 Apr, 1 Jul and 1 Oct — quarterly compounding. No fees, no minimum balance, free withdrawals. Bills and purchases use your cash first, then your savings.</p></section>
      <section class="bank-action-controls-bar">
        <div class="action-amount-input-box"><span class="cash-stack-icon" aria-hidden="true">${ICONS.cashStack}</span>
          <input type="number" class="pixel-amount-input" data-in="amount" value="${this.amount}" min="1" step="50" aria-label="Transaction Amount"></div>
        <button class="pixel-btn-bank-deposit" data-a="deposit"><span class="btn-icon">${ICONS.deposit}</span><span class="btn-caption">DEPOSIT CASH</span></button>
        <button class="pixel-btn-bank-withdraw" data-a="withdraw"><span class="btn-icon">${ICONS.withdraw}</span><span class="btn-caption">WITHDRAW CASH</span></button>
      </section>
      <section class="bank-ledger-viewport" data-scroll="log" aria-label="Savings Activity Log">
        ${log ? `<div class="ledger-history-list" style="display: flex;">${log}</div>` : `<div class="ledger-empty-state"><span class="empty-pillar-icon">${ICONS.emptyLedger}</span><span class="empty-state-text">No savings activity yet.</span></div>`}
      </section>`;
  }

  // ------------------------------------------------------------------ the other tabs (content inside the console)
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
      const sched = schedule(l.principal, l.rate, l.months), accrued = accruedInterest(l, s.day);
      const what = l.kind === 'shortfall' ? 'OWED AFTER THE FORCED SALE' : l.kind === 'rent_arrears' ? 'UNPAID RENT (BEYOND YOUR DEPOSIT)' : 'BORROWED';
      return `<div class="card" data-loan="${l.uid}"><h3>${esc(loanName(l))} <span class="tag ${l.status === 'active' ? 'gold' : ''}">${l.status.toUpperCase()}</span></h3>
        <div class="specs"><b>${what}</b><span>${inr(l.principal)} on ${fmtShortDate(l.startDay)}</span><b>RATE (FIXED)</b><span>${pct(l.rate)} for ${l.months} months</span>
        <b>EMI</b><span>${inr(l.emi)} on the 1st</span><b>STILL OWED</b><span>${inr(l.balance)}${l.status === 'active' ? ` · payoff today ${inr(l.balance + accrued)} (incl. ${inr(accrued)} interest since the last EMI)` : ''}</span>
        <b>PAID SO FAR</b><span>${l.paidCount} EMIs · interest ${inr(l.interestPaid)} · principal ${inr(l.principalRepaid ?? 0)}</span>
        ${l.interestCapitalised ? `<b>ADDED FOR MISSED EMIs</b><span class="neg">interest ${inr(l.interestCapitalised)}</span>` : ''}
        <b>SCHEDULED INTEREST</b><span>${inr(sched.reduce((a, r) => a + r.interest, 0))} over the full term</span>
        <b>MISSED</b><span class="${l.missed ? 'neg' : ''}">${l.missedDays.length} total, ${l.missed} in a row${l.lateFees ? ` · late fees ${inr(l.lateFees)}` : ''}</span></div>
        ${l.status === 'active' ? `<div class="row"><input class="num" type="number" min="1000" step="1000" value="${Math.min(l.balance - 1, 10000)}" data-in="prepay-${l.uid}" aria-label="prepay amount"><button class="btn sm" data-a="prepay" data-id="${l.uid}">Prepay</button>
          <button class="btn sm" data-a="payoff" data-id="${l.uid}">Pay off ${inr(l.balance + accrued)}</button></div>` : ''}</div>`;
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
      <p><b>Home-equity loans:</b> base + ${pct(EQUITY.rateAdd)}, up to ${EQUITY.ltv * 100}% of the property's value minus everything already owed on it; ${EQUITY.tenureYears.join('/')} years; fee ${EQUITY.fee * 100}%.</p>
      <p><b>Eligibility:</b> all EMIs together within ${LENDING_RULES.maxFoir * 100}% of your eligible income — salary plus ${RENT_INCOME.allowance * 100}% of the rent you actually received over the last ${RENT_INCOME.months} months from let properties — and income must still cover EMIs plus essential bills. You need the up-front money, and your credit tier must not be "Very poor".</p>
      <p><b>Missed EMI:</b> nothing is taken; that month's interest + ${inr(LENDING_RULES.lateFee)} late fee are added to what you owe and it shows on your credit profile. ${LENDING_RULES.defaultAfter} in a row = default: the bank sells the property ${LENDING_RULES.forcedSaleDiscount * 100}% below value, charges ${LENDING_RULES.enforcementCost * 100}% costs, repays itself and returns any surplus; any shortfall stays owed, repaid over ${LENDING_RULES.shortfallMonths} months.</p>
      <p><b>Paying off early:</b> the balance plus interest since the last EMI (balance × rate × days ÷ 365).</p>
      <p><b>EMI formula:</b> EMI = P·r(1+r)<sup>n</sup> / ((1+r)<sup>n</sup> − 1), r = yearly rate ÷ 12, n = months. Each month's interest = what you still owe × r; the rest of the EMI repays the loan.</p>`;
  }

  renderConfirm() {
    const c = this.confirm;
    if (!c) return '';
    const box = (title, body, label) => `<div class="bank-confirm" id="confirm"><div class="bank-confirm-card"><h4>${title}</h4><p>${body}</p>
      <div class="row"><button class="pixel-btn-bank-deposit" data-a="confirm"><span class="btn-caption">${label.toUpperCase()}</span></button><button class="pixel-btn-bank-withdraw" data-a="cancel"><span class="btn-caption">CANCEL</span></button></div></div></div>`;
    if (c.kind === 'prepay') { const l = this.s.loans.find(x => x.uid === c.uid), payoff = l.balance + accruedInterest(l, this.s.day);
      return c.amount >= payoff ? box('Pay off this loan?', `${inr(payoff)} = the ${inr(l.balance)} balance + ${inr(payoff - l.balance)} interest since the last EMI. The loan closes — no more EMIs.`, `Pay off ${inr(payoff)}`)
        : box('Prepay this loan?', `${inr(c.amount)} goes straight to reducing what you owe. Your EMI stays the same, so the loan ends sooner and you pay less interest.`, `Prepay ${inr(c.amount)}`); }
    if (c.kind === 'deposit') return box('Deposit cash into savings?', `${inr(c.amount)} moves from cash to your savings account.`, `Deposit ${inr(c.amount)}`);
    if (c.kind === 'withdraw') return box('Withdraw cash?', `${inr(c.amount)} moves from savings to cash.`, `Withdraw ${inr(c.amount)}`);
    if (c.kind === 'fd') { const t = FD_TERMS[c.term]; return box(`Open a ${t.months}-month FD?`, `${inr(c.amount)} moves from savings into the FD at ${pct(t.rate)}. It matures on ${fmtDate(addMonths(this.s.day, t.months))} for ${inr(fdMaturityValue(c.amount, t.rate, t.months))}.`, `Open FD of ${inr(c.amount)}`); }
    if (c.kind === 'break') { const f = this.s.bank.fds.find(x => x.uid === c.uid); return box('Close this FD early?', `You'll get ${inr(fdEarlyValue(f, this.s.day))} now instead of ${inr(f.expected)} at maturity (rate − ${FD_PENALTY * 100}% for the time held).`, 'Close early'); }
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
    const done = (r, ok) => {
      this.msg = r.ok ? { kind: 'ok', text: ok } : { kind: 'error', text: r.reason === 'not_eligible' ? 'Not eligible — see the reasons above.' : r.reason === 'below_minimum' ? `The minimum FD is ${inr(FD_MIN)}.` : why(r) };
      this.confirm = null;
      if (r.ok) { playPixelSound(650, 0.1, 'square'); setTimeout(() => playPixelSound(880, 0.18, 'triangle'), 80); } else playPixelSound(200, 0.25, 'sawtooth');
    };
    switch (a) {
      case 'tab': this.tab = el.dataset.t; this.confirm = null; this.msg = null; playPixelSound(540, 0.05, 'triangle'); break;
      case 'deposit': case 'withdraw':
        if (this.amount <= 0) { this.msg = { kind: 'error', text: 'Please enter a valid amount.' }; playPixelSound(220, 0.15, 'sawtooth'); break; }
        this.confirm = { kind: a, amount: this.amount, token: newToken() }; this.msg = null; break;
      case 'term': this.fdTerm = +el.dataset.t; this.confirm = null; break;
      case 'fd-open': this.confirm = { kind: 'fd', amount: this.fdAmount, term: this.fdTerm, token: newToken() }; this.msg = null; break;
      case 'break': this.confirm = { kind: 'break', uid: el.dataset.id, token: newToken() }; this.msg = null; break;
      case 'eq-prop': this.eq.prop = el.dataset.t; break;
      case 'eq-years': this.eq.years = +el.dataset.t; break;
      case 'eq-apply': this.confirm = { kind: 'equity', prop: this.eq.prop, amount: this.eq.amount, years: this.eq.years, token: newToken() }; this.msg = null; break;
      case 'payoff': { const l = this.s.loans.find(x => x.uid === el.dataset.id); this.confirm = { kind: 'prepay', uid: l.uid, amount: l.balance + accruedInterest(l, this.s.day), token: newToken() }; this.msg = null; break; }
      case 'prepay': { const uid = el.dataset.id; this.confirm = { kind: 'prepay', uid, amount: this[`prepay-${uid}`] ?? Math.min(10000, this.s.loans.find(l => l.uid === uid).balance), token: newToken() }; this.msg = null; break; }
      case 'cancel': this.confirm = null; break;
      case 'confirm': {
        const c = this.confirm;
        if (!c) break;
        if (c.kind === 'prepay') done(this.game.act(s => prepay(s, c.uid, c.amount, c.token)), `Prepaid ${inr(c.amount)}.`);
        if (c.kind === 'deposit') done(this.game.act(s => deposit(s, c.amount, c.token)), `Deposited ${inr(c.amount)} to savings.`);
        if (c.kind === 'withdraw') done(this.game.act(s => withdraw(s, c.amount, c.token)), `Withdrew ${inr(c.amount)} to cash.`);
        if (c.kind === 'fd') done(this.game.act(s => openFD(s, c.amount, c.term, c.token)), `FD opened: ${inr(c.amount)}.`);
        if (c.kind === 'break') done(this.game.act(s => breakFD(s, c.uid, c.token)), 'FD closed — the money is in your savings.');
        if (c.kind === 'equity') done(this.game.act(s => takeEquityLoan(s, c.prop, c.amount, c.years, c.token)), `${inr(c.amount)} paid into your savings. First EMI on the 1st.`);
        break;
      }
    }
  }
}
