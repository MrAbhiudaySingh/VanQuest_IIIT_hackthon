// One loan engine for home mortgages, home-equity loans and the debts a forced sale or unpaid
// rent can leave behind (rules in data/lending.js).
//  • Fixed rate for the whole term — a loan keeps the rate it was given, whatever offers change to.
//    EMI = P·r(1+r)^n / ((1+r)^n − 1), r = annual/12; r = 0 → P/n (rounded up).
//  • EMIs fall due on the 1st of every month, starting the month after the loan is taken.
//    Each EMI's interest = balance × r (rounded); the rest repays principal (true amortisation).
//    The final EMI clears whatever is left, so rounding never leaves a balance or goes negative.
//  • Paid from cash, then savings. If you can't pay: nothing is charged, that month's interest and a
//    ₹500 late fee are ADDED to the balance (tracked as interest capitalised / late fees), the missed
//    instalment moves to the end of the term, and your credit profile records a missed EMI. Three
//    missed in a row on a secured loan = default: the bank sells the property (property.repossess).
//    Unsecured debts can't be repossessed; misses keep adding interest and fees and keep hurting
//    your credit profile.
//  • Paying a loan off early (a sale, a full prepayment) costs the balance PLUS interest accrued
//    since the last EMI date: balance × rate × days / 365.
//  • Each month is processed once (lastMonth marker) — reloads and time-skips can't double-charge.
import { MORTGAGE, EQUITY, LENDING_RULES as R } from '../data/lending.js';
import { PROPERTIES, PROPERTY_RULES } from '../data/properties.js';
import { LOCATIONS } from '../data/locations.js';
import { post, pay, recordFailure, spendable, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { creditProfile, incomeBreakdown, totalEmis, essentialCommitments } from './credit.js';
import { askingPrice, propertyValue } from './housingMarket.js';
import { monthKey, nextMonthStart, isMonthStart, inr } from './util.js';

// EMI and the amortisation schedule are pure formulas shared with the academy's practice simulator.
export { emi, schedule } from './finmath.js';
import { emi, schedule } from './finmath.js';

export const securedOn = (state, propId) => state.loans.filter(l => l.status === 'active' && l.propertyId != null && l.propertyId === propId)
  .sort((a, b) => (a.kind === 'mortgage' ? 0 : 1) - (b.kind === 'mortgage' ? 0 : 1));   // the first charge (mortgage) is repaid first
export const securedBalance = (state, propId) => securedOn(state, propId).reduce((s, l) => s + l.balance, 0);
const where = id => LOCATIONS[id]?.name ?? id;
export function loanName(l) {
  if (l.kind === 'mortgage') return `Home loan on ${where(l.propertyId)}`;
  if (l.kind === 'equity') return `Home-equity loan on ${where(l.propertyId)}`;
  if (l.kind === 'shortfall') return `Shortfall debt after the forced sale of ${where(l.origin)}`;
  return `Unpaid rent owed for ${where(l.origin)}`;
}

// Interest accrued since the last EMI date (the 1st) — or since the loan started, if later.
export function accruedInterest(l, day) {
  if (l.status !== 'active' || l.rate === 0) return 0;
  let since = day;
  while (since > l.startDay && !isMonthStart(since)) since--;
  return Math.round(l.balance * l.rate * (day - since) / 365);
}
export const payoffAmount = (l, day) => l.balance + accruedInterest(l, day);
export const securedPayoff = (state, propId) => securedOn(state, propId).reduce((s, l) => s + payoffAmount(l, state.day), 0);

function offerRate(state, base) {
  const t = creditProfile(state).tier;
  return t.eligible ? Math.round((base + t.rateAdj) * 10000) / 10000 : null;
}

// Affordability: all EMIs ≤ 50% of eligible income, and income must still cover EMIs + essential bills.
function affordability(state, principal, rate, months, extraUpkeep = 0) {
  const e = emi(principal, rate, months), inc = incomeBreakdown(state), existing = totalEmis(state);
  const essentials = essentialCommitments(state, extraUpkeep);
  return { emi: e, income: inc.total, incomeBreakdown: inc, existing, essentials, foir: inc.total ? (existing + e) / inc.total : Infinity,
    leftAfterCommitments: inc.total - existing - e - essentials.total };
}

function affordabilityReasons(a, reasons, tips) {
  if (!a.income) { reasons.push('You have no eligible regular income (salary, or rent actually received from a tenant).'); tips.push('Get a job, or let out a property you own and collect rent first.'); return; }
  if (a.foir > R.maxFoir) {
    reasons.push(`All your EMIs would be ${Math.round(a.foir * 100)}% of your ${inr(a.income)} eligible income (limit ${R.maxFoir * 100}%).`);
    tips.push('Pick a longer term, a bigger down payment, a cheaper home, or raise your eligible income first.');
  }
  if (a.leftAfterCommitments < 0) {
    reasons.push(`After all EMIs (${inr(a.existing + a.emi)}) and essential bills (${inr(a.essentials.total)}), your income would be ${inr(-a.leftAfterCommitments)} short every month.`);
    tips.push('Cut recurring costs or borrow less.');
  }
}

// ------------------------------------------------------------------ mortgage quote / eligibility
export function mortgageQuote(state, propId, downPct, years) {
  const price = askingPrice(propId, state.day), duty = Math.round(price * PROPERTY_RULES.stampDuty);
  const principal = Math.round(price * (1 - downPct)), down = price - principal, months = years * 12;
  const fee = Math.max(MORTGAGE.feeMin, Math.round(principal * MORTGAGE.fee));
  const profile = creditProfile(state), rate = offerRate(state, MORTGAGE.baseRate);
  const a = affordability(state, principal, rate ?? MORTGAGE.baseRate, months, PROPERTIES[propId].upkeep);
  const sched = rate === null ? [] : schedule(principal, rate, months);
  const totalInterest = sched.reduce((s, r) => s + r.interest, 0);
  const cashNeeded = down + duty + fee;
  const reasons = [], tips = [];
  if (state.properties[propId]) reasons.push('You already own this property.');
  if (!MORTGAGE.downOptions.includes(downPct)) reasons.push('Choose one of the offered down payments.');
  if (!MORTGAGE.tenureYears.includes(years)) reasons.push('Choose one of the offered loan terms.');
  const ltvCap = MORTGAGE.ltv(principal);
  if (1 - downPct > ltvCap + 1e-9) { reasons.push(`Loans of this size can cover at most ${Math.round(ltvCap * 100)}% of the price — your down payment is too small.`); tips.push(`Put down at least ${Math.round((1 - ltvCap) * 100)}%.`); }
  if (rate === null) { reasons.push(`Your credit profile is "${profile.tier.name}" (${profile.score}) — the bank won't lend.`); tips.push('Pay bills and EMIs on time for a year to rebuild your profile.'); }
  affordabilityReasons(a, reasons, tips);
  if (spendable(state) < cashNeeded) { reasons.push(`You need ${inr(cashNeeded)} up front (down payment + stamp duty + fee) but have ${inr(spendable(state))}.`); tips.push('Save more, or choose a smaller down payment if the loan limits allow.'); }
  return { ok: !reasons.length, reasons, tips, propId, price, value: propertyValue(propId, state.day), duty, down, downPct, principal, years, months, rate, emi: a.emi, fee,
    totalInterest, totalRepay: principal + totalInterest, cashNeeded, cashLeft: spendable(state) - cashNeeded, existingEmis: a.existing, income: a.income,
    incomeBreakdown: a.incomeBreakdown, essentials: a.essentials, leftAfterCommitments: a.leftAfterCommitments, foir: a.foir, profile };
}

function newLoan(state, kind, propId, principal, rate, months, fee, deal, extra = {}) {
  const loan = { uid: `ln${state.nextId++}`, kind, propertyId: propId, deal, principal, rate, months, emi: emi(principal, rate, months), balance: principal,
    startDay: state.day, firstDueMonth: monthKey(nextMonthStart(state.day)), lastMonth: null, paidCount: 0, missed: 0, missedDays: [],
    interestPaid: 0, interestCapitalised: 0, lateFees: 0, principalRepaid: 0, fee, status: 'active', ...extra };
  state.loans.push(loan);
  return loan;
}

// Called by property.buyProperty when financing is chosen. Returns the loan, already disbursed.
export function originateMortgage(state, q, deal) {
  const loan = newLoan(state, 'mortgage', q.propId, q.principal, q.rate, q.months, q.fee, deal);
  post(state, { amount: q.principal, category: 'loan_disbursement', memo: `${loanName(loan)} — ${inr(q.principal)} at ${(q.rate * 100).toFixed(2)}% for ${q.years} years (paid to the seller)`, loan: loan.uid, prop: q.propId, deal });
  pay(state, { amount: q.fee, category: 'loan_fee', memo: `Processing fee — ${loanName(loan)}`, loan: loan.uid, prop: q.propId, deal });
  logEvent(state, 'loan', `${loanName(loan)}: ${inr(q.principal)}, EMI ${inr(loan.emi)} for ${q.months} months`);
  return loan;
}

// A debt with no cash paid out (it replaces money already owed): forced-sale shortfall, unpaid rent.
export function convertToDebt(state, kind, origin, amount, rate, months, deal = null) {
  const loan = newLoan(state, kind, null, amount, rate, months, 0, deal, { origin });
  logEvent(state, 'loan', `${loanName(loan)}: ${inr(amount)} to repay at ${inr(loan.emi)}/month for ${months} months`);
  return loan;
}

// ------------------------------------------------------------------ home-equity loans
export function equityQuote(state, propId, amount, years) {
  const p = state.properties[propId];
  const value = p ? propertyValue(propId, state.day) : 0, existing = securedBalance(state, propId);
  // every loan already secured on the property counts, so the same equity can't be borrowed twice
  const maxLoan = Math.max(0, Math.floor((value * EQUITY.ltv - existing) / 1000) * 1000);
  const months = years * 12, profile = creditProfile(state), rate = offerRate(state, MORTGAGE.baseRate + EQUITY.rateAdd);
  const fee = Math.max(EQUITY.feeMin, Math.round(amount * EQUITY.fee));
  const a = affordability(state, amount, rate ?? MORTGAGE.baseRate, months);
  const totalInterest = rate === null ? 0 : schedule(amount, rate, months).reduce((s, r) => s + r.interest, 0);
  const reasons = [], tips = [];
  if (!p) reasons.push('You can only borrow against a property you own.');
  if (!EQUITY.tenureYears.includes(years)) reasons.push('Choose one of the offered terms.');
  if (!Number.isInteger(amount) || amount <= 0) reasons.push('Enter an amount.');
  else if (amount > maxLoan) { reasons.push(`The most you can borrow against it is ${inr(maxLoan)} (${EQUITY.ltv * 100}% of ${inr(value)} minus ${inr(existing)} already owed on it).`); tips.push('Pay down the existing loan, or wait for the value to rise.'); }
  if (rate === null) { reasons.push(`Your credit profile is "${profile.tier.name}" — the bank won't lend.`); tips.push('Rebuild your record with on-time payments.'); }
  affordabilityReasons(a, reasons, tips);
  if (spendable(state) < fee) reasons.push(`The ${inr(fee)} fee must be paid from your money.`);
  return { ok: !reasons.length, reasons, tips, propId, value, existing, ltv: EQUITY.ltv, maxLoan, amount, years, months, rate, emi: a.emi, fee, totalInterest,
    totalRepay: amount + totalInterest, income: a.income, incomeBreakdown: a.incomeBreakdown, essentials: a.essentials, existingEmis: a.existing, foir: a.foir, profile };
}

export function takeEquityLoan(state, propId, amount, years, token) {
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const q = equityQuote(state, propId, amount, years);
  if (!q.ok) return { ok: false, reason: 'not_eligible', quote: q };
  const loan = newLoan(state, 'equity', propId, amount, q.rate, q.months, q.fee, state.properties[propId].uid);
  post(state, { account: 'bank', amount, category: 'loan_disbursement', memo: `${loanName(loan)} paid into savings`, ref: token, loan: loan.uid, prop: propId, deal: loan.deal });
  pay(state, { amount: q.fee, category: 'loan_fee', memo: `Processing fee — ${loanName(loan)}`, loan: loan.uid, prop: propId, deal: loan.deal });
  logEvent(state, 'loan', `${loanName(loan)}: ${inr(amount)}, EMI ${inr(loan.emi)} for ${q.months} months`);
  return { ok: true, loan };
}

function close(state, l) { l.balance = 0; l.status = 'closed'; l.closedDay = state.day; }

// ------------------------------------------------------------------ monthly EMIs (on the 1st)
export function processLoans(state, onDefault) {
  const notes = [], key = monthKey(state.day);
  for (const l of state.loans) {
    if (l.status !== 'active' || key < l.firstDueMonth || l.lastMonth === key) continue;
    l.lastMonth = key;
    const r = l.rate / 12, interest = Math.round(l.balance * r);
    const due = l.paidCount + 1 >= l.months ? l.balance + interest : Math.min(l.emi, l.balance + interest);   // last EMI clears it
    const paid = pay(state, { amount: due, category: 'emi', memo: `EMI — ${loanName(l)} (interest ${inr(interest)}, principal ${inr(due - interest)})`, ref: `emi-${l.uid}-${key}`, loan: l.uid, prop: l.propertyId, deal: l.deal });
    if (paid.ok) {
      l.balance = l.balance + interest - due;
      l.interestPaid += interest; l.principalRepaid += due - interest; l.paidCount++; l.missed = 0;
      if (l.balance <= 0) { close(state, l); notes.push({ kind: 'ok', text: `${loanName(l)} fully repaid!`, feed: true }); }
      continue;
    }
    recordFailure(state, { attempted: -due, category: 'emi', memo: `EMI — ${loanName(l)} — MISSED (₹${R.lateFee} late fee + interest added to the loan)`, loan: l.uid, prop: l.propertyId });
    l.balance += interest + R.lateFee; l.interestCapitalised += interest; l.lateFees += R.lateFee; l.missed++; l.missedDays.push(state.day);
    l.months++;                                            // the missed instalment moves to the end
    if (l.missed >= R.defaultAfter && l.propertyId) { notes.push(...onDefault(state, l)); continue; }
    notes.push({ kind: 'error', text: `Missed EMI on your ${loanName(l).toLowerCase()} (${l.missed} in a row). ${inr(interest + R.lateFee)} was added to what you owe${l.propertyId ? `; ${R.defaultAfter} in a row and the bank sells the property` : ''}.` });
  }
  return notes;
}

// Pay extra principal, or the whole payoff (balance + interest accrued since the last EMI).
// Same EMI after a part-prepayment, so the loan ends sooner.
export function prepay(state, uid, amount, token) {
  const l = state.loans.find(x => x.uid === uid);
  if (!l || l.status !== 'active') return { ok: false, reason: 'not_active' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  const accrued = accruedInterest(l, state.day), payoff = l.balance + accrued;
  if (amount >= payoff) {
    const r = pay(state, { amount: payoff, category: 'loan_prepayment', memo: `Paid off — ${loanName(l)}${accrued ? ` (incl. ${inr(accrued)} interest since the last EMI)` : ''}`, ref: token, loan: l.uid, prop: l.propertyId, deal: l.deal });
    if (!r.ok) return r;
    l.interestPaid += accrued; l.principalRepaid += l.balance; close(state, l);
    return { ok: true, paid: payoff, closed: true };
  }
  if (amount >= l.balance) return { ok: false, reason: 'pay_full_payoff', payoff };
  const r = pay(state, { amount, category: 'loan_prepayment', memo: `Prepayment — ${loanName(l)}`, ref: token, loan: l.uid, prop: l.propertyId, deal: l.deal });
  if (!r.ok) return r;
  l.balance -= amount; l.principalRepaid += amount; l.missed = 0;
  return { ok: true, paid: amount, closed: false };
}

// Repay every loan secured on a property from your accounts (the caller has already credited the
// sale proceeds and checked the total is affordable). All-or-nothing; each loan is settled once.
export function settleLoansOn(state, propId, memoPrefix) {
  const loans = securedOn(state, propId), total = loans.reduce((s, l) => s + payoffAmount(l, state.day), 0);
  if (spendable(state) < total) return { ok: false, reason: 'insufficient_funds', total };
  let interest = 0;
  for (const l of loans) {
    const accrued = accruedInterest(l, state.day), due = l.balance + accrued;
    pay(state, { amount: due, category: 'loan_settlement', memo: `${memoPrefix}: repaid ${loanName(l)} in full${accrued ? ` (incl. ${inr(accrued)} interest since the last EMI)` : ''}`, loan: l.uid, prop: propId, deal: l.deal });
    l.interestPaid += accrued; l.principalRepaid += l.balance; interest += accrued; close(state, l);
  }
  return { ok: true, total, interest };
}

export const outstandingDebt = state => state.loans.filter(l => l.status === 'active').reduce((s, l) => s + l.balance, 0);
