// One loan engine for home mortgages and home-equity loans (rules in data/lending.js).
//  • Fixed rate for the whole term. EMI = P·r(1+r)^n / ((1+r)^n − 1), r = annual/12; r = 0 → P/n.
//  • EMIs fall due on the 1st of every month, starting the month after the loan is taken.
//    Each EMI's interest = balance × r (rounded); the rest repays principal (true amortisation).
//  • Paid from cash, then savings. If you can't pay: nothing is charged, that month's interest and a
//    ₹500 late fee are ADDED to the balance, and your credit profile records a missed EMI.
//    Paying the next EMI on time resets the "consecutive" count. Three missed in a row = default:
//    the bank sells the collateral at a 15% discount, repays itself, and returns any surplus.
//  • Each month is processed once (lastMonth marker) — reloads and time-skips can't double-charge.
import { MORTGAGE, EQUITY, LENDING_RULES as R } from '../data/lending.js';
import { PROPERTY_RULES } from '../data/properties.js';
import { LOCATIONS } from '../data/locations.js';
import { post, pay, recordFailure, spendable, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { creditProfile, monthlyIncome, totalEmis } from './credit.js';
import { askingPrice, propertyValue } from './housingMarket.js';
import { monthKey, nextMonthStart, inr } from './util.js';

export function emi(P, annualRate, n) {
  if (n <= 0) return P;
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(P / n);
  return Math.round(P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

// Full amortisation schedule (the same rounding the monthly processor uses).
export function schedule(P, annualRate, n) {
  const e = emi(P, annualRate, n), r = annualRate / 12, rows = [];
  let bal = P;
  for (let m = 1; m <= n && bal > 0; m++) {
    // the final EMI pays off whatever rounding has left over
    const interest = Math.round(bal * r), due = m === n ? bal + interest : Math.min(e, bal + interest);
    bal = bal + interest - due;
    rows.push({ month: m, emi: due, interest, principal: due - interest, balance: bal });
  }
  return rows;
}

export const securedOn = (state, propId) => state.loans.filter(l => l.status === 'active' && l.propertyId === propId);
export const securedBalance = (state, propId) => securedOn(state, propId).reduce((s, l) => s + l.balance, 0);
export const loanName = l => `${l.kind === 'mortgage' ? 'Home loan' : 'Home-equity loan'} on ${LOCATIONS[l.propertyId].name}`;

function offerRate(state, base) {
  const t = creditProfile(state).tier;
  return t.eligible ? Math.round((base + t.rateAdj) * 10000) / 10000 : null;
}

function affordability(state, principal, rate, months) {
  const e = emi(principal, rate, months), income = monthlyIncome(state), existing = totalEmis(state);
  return { emi: e, income, existing, foir: income ? (existing + e) / income : Infinity };
}

// ------------------------------------------------------------------ mortgage quote / eligibility
export function mortgageQuote(state, propId, downPct, years) {
  const price = askingPrice(propId, state.day), duty = Math.round(price * PROPERTY_RULES.stampDuty);
  const principal = Math.round(price * (1 - downPct)), down = price - principal, months = years * 12;
  const fee = Math.max(MORTGAGE.feeMin, Math.round(principal * MORTGAGE.fee));
  const profile = creditProfile(state), rate = offerRate(state, MORTGAGE.baseRate);
  const a = affordability(state, principal, rate ?? MORTGAGE.baseRate, months);
  const sched = rate === null ? [] : schedule(principal, rate, months);
  const totalInterest = sched.reduce((s, r) => s + r.interest, 0);
  const cashNeeded = down + duty + fee;
  const reasons = [], tips = [];
  if (state.properties[propId]) reasons.push('You already own this property.');
  if (!MORTGAGE.downOptions.includes(downPct)) reasons.push('Choose one of the offered down payments.');
  if (!MORTGAGE.tenureYears.includes(years)) reasons.push('Choose one of the offered loan terms.');
  const ltvCap = MORTGAGE.ltv(principal);
  if (1 - downPct > ltvCap + 1e-9) { reasons.push(`Loans of this size can cover at most ${Math.round(ltvCap * 100)}% of the price.`); tips.push(`Put down at least ${Math.round((1 - ltvCap) * 100)}%.`); }
  if (rate === null) { reasons.push(`Your credit profile is "${profile.tier.name}" (${profile.score}) — the bank won't lend.`); tips.push('Pay bills and EMIs on time for a year to rebuild your profile.'); }
  if (a.foir > R.maxFoir) { reasons.push(`All your EMIs would be ${Math.round(a.foir * 100)}% of your ${inr(a.income)} income (limit ${R.maxFoir * 100}%).`); tips.push('Pick a longer term, a bigger down payment, a cheaper home, or raise your income first.'); }
  if (spendable(state) < cashNeeded) { reasons.push(`You need ${inr(cashNeeded)} up front (down payment + stamp duty + fee) but have ${inr(spendable(state))}.`); tips.push('Save more, or choose a smaller down payment if the loan limits allow.'); }
  return { ok: !reasons.length, reasons, tips, propId, price, value: propertyValue(propId, state.day), duty, down, downPct, principal, years, months, rate, emi: a.emi, fee,
    totalInterest, totalRepay: principal + totalInterest, cashNeeded, cashLeft: spendable(state) - cashNeeded, existingEmis: a.existing, income: a.income, foir: a.foir, profile };
}

function newLoan(state, kind, propId, principal, rate, months, fee, deal) {
  const loan = { uid: `ln${state.nextId++}`, kind, propertyId: propId, deal, principal, rate, months, emi: emi(principal, rate, months), balance: principal,
    startDay: state.day, firstDueMonth: monthKey(nextMonthStart(state.day)), lastMonth: null, paidCount: 0, missed: 0, missedDays: [],
    interestPaid: 0, lateFees: 0, fee, status: 'active' };
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

// ------------------------------------------------------------------ home-equity loans
export function equityQuote(state, propId, amount, years) {
  const p = state.properties[propId];
  const value = p ? propertyValue(propId, state.day) : 0, existing = securedBalance(state, propId);
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
  if (a.foir > R.maxFoir) { reasons.push(`All EMIs would be ${Math.round(a.foir * 100)}% of income (limit ${R.maxFoir * 100}%).`); tips.push('Borrow less or choose a longer term.'); }
  if (spendable(state) < fee) reasons.push(`The ${inr(fee)} fee must be paid from your money.`);
  return { ok: !reasons.length, reasons, tips, propId, value, existing, ltv: EQUITY.ltv, maxLoan, amount, years, months, rate, emi: a.emi, fee, totalInterest,
    totalRepay: amount + totalInterest, income: a.income, existingEmis: a.existing, foir: a.foir, profile };
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
      l.interestPaid += interest; l.paidCount++; l.missed = 0;
      if (l.balance <= 0) { l.balance = 0; l.status = 'closed'; l.closedDay = state.day; notes.push({ kind: 'ok', text: `${loanName(l)} fully repaid!`, feed: true }); }
      continue;
    }
    recordFailure(state, { attempted: -due, category: 'emi', memo: `EMI — ${loanName(l)} — MISSED (₹${R.lateFee} late fee + interest added to the loan)`, loan: l.uid, prop: l.propertyId });
    l.balance += interest + R.lateFee; l.lateFees += R.lateFee; l.missed++; l.missedDays.push(state.day);
    if (l.missed >= R.defaultAfter) { notes.push(...onDefault(state, l)); continue; }
    notes.push({ kind: 'error', text: `Missed EMI on your ${loanName(l).toLowerCase()} (${l.missed}/${R.defaultAfter}). ${inr(interest + R.lateFee)} was added to what you owe; ${R.defaultAfter} in a row and the bank sells the property.` });
  }
  return notes;
}

// Pay extra principal (or everything). Same EMI, so the loan ends sooner.
export function prepay(state, uid, amount, token) {
  const l = state.loans.find(x => x.uid === uid);
  if (!l || l.status !== 'active') return { ok: false, reason: 'not_active' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  const amt = Math.min(amount, l.balance);
  const r = pay(state, { amount: amt, category: 'loan_prepayment', memo: `Prepayment — ${loanName(l)}`, ref: token, loan: l.uid, prop: l.propertyId, deal: l.deal });
  if (!r.ok) return r;
  l.balance -= amt; l.missed = 0;
  if (l.balance === 0) { l.status = 'closed'; l.closedDay = state.day; }
  return { ok: true, paid: amt };
}

// Settle every loan secured on a property out of its sale (the caller supplies the money).
export function settleLoansOn(state, propId, memoPrefix) {
  let total = 0;
  for (const l of securedOn(state, propId)) {
    pay(state, { amount: l.balance, category: 'loan_settlement', memo: `${memoPrefix}: repaid ${loanName(l)} in full`, loan: l.uid, prop: propId, deal: l.deal });
    total += l.balance; l.balance = 0; l.status = 'closed'; l.closedDay = state.day;
  }
  return total;
}

export const outstandingDebt = state => state.loans.filter(l => l.status === 'active').reduce((s, l) => s + l.balance, 0);
