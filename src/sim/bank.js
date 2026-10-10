// Nidhi Bank: savings account + fixed deposits. Rules in data/banking.js; money moves only by ledger
// transfers (cash ⇄ savings ⇄ FD), so nothing is created or destroyed except credited interest.
import { SAVINGS, FD_TERMS, FD_MIN, FD_PENALTY } from '../data/banking.js';
import { balance, post, transfer, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { addMonths, dateOf, monthKey, inr, isPosInt } from './util.js';

const checkAmount = (state, amount, token, available) => {
  if (!isPosInt(amount)) return { ok: false, reason: 'invalid_amount' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  if (amount > available) return { ok: false, reason: 'insufficient_funds' };
  return null;
};

export function deposit(state, amount, token) {
  const bad = checkAmount(state, amount, token, balance(state, 'wallet'));
  if (bad) return bad;
  return transfer(state, 'wallet', 'bank', amount, 'Deposit cash into savings', { category: 'deposit', ref: token });
}

export function withdraw(state, amount, token) {
  const bad = checkAmount(state, amount, token, balance(state, 'bank'));
  if (bad) return bad;
  return transfer(state, 'bank', 'wallet', amount, 'Withdraw cash from savings', { category: 'withdrawal', ref: token });
}

// ------------------------------------------------------------------ savings interest
// Daily (end of day): accrue closing balance × rate / 365. Quarterly on the 1st: credit whole rupees.
export function accrueSavings(state) {
  state.bank.accrued += balance(state, 'bank') * SAVINGS.rate / 365;
}
export function creditSavingsInterest(state) {
  const d = dateOf(state.day), ref = `sav-int-${monthKey(state.day)}`;
  if (d.getUTCDate() !== 1 || !SAVINGS.creditMonths.includes(d.getUTCMonth() + 1) || tokenUsed(state, ref)) return null;
  const amount = Math.floor(state.bank.accrued + 1e-9);
  if (amount <= 0) return null;
  post(state, { account: 'bank', amount, category: 'interest', memo: `Savings interest (${(SAVINGS.rate * 100).toFixed(1)}% p.a., quarterly)`, ref });
  state.bank.accrued -= amount;
  state.bank.interestToDate += amount;
  return { kind: 'ok', text: `Savings interest credited: ${inr(amount)}.`, feed: true };
}

// ------------------------------------------------------------------ fixed deposits
const quarters = months => months / 3;
export const fdMaturityValue = (principal, rate, months) => Math.round(principal * Math.pow(1 + rate / 4, quarters(months)));

// Value if closed early on `day`: (rate − 1%) quarterly for completed quarters + simple for the rest; ≥ principal.
export function fdEarlyValue(fd, day) {
  const r = Math.max(0, fd.rate - FD_PENALTY);
  let q = 0; while (addMonths(fd.startDay, 3 * (q + 1)) <= day) q++;
  const rest = day - addMonths(fd.startDay, 3 * q);
  return Math.max(fd.principal, Math.round(fd.principal * Math.pow(1 + r / 4, q) * (1 + r * rest / 365)));
}

// What an active FD is worth today if held to maturity at its contracted rate (for net worth).
export function fdAccruedValue(fd, day) {
  if (fd.status !== 'active') return 0;
  let q = 0; while (q < quarters(fd.months) && addMonths(fd.startDay, 3 * (q + 1)) <= day) q++;
  const rest = Math.max(0, Math.min(day, fd.maturityDay) - addMonths(fd.startDay, 3 * q));
  return Math.min(fdMaturityValue(fd.principal, fd.rate, fd.months), Math.round(fd.principal * Math.pow(1 + fd.rate / 4, q) * (1 + fd.rate * rest / 365)));
}

export function openFD(state, amount, termIndex, token) {
  const term = FD_TERMS[termIndex];
  if (!term) return { ok: false, reason: 'invalid_term' };
  if (isPosInt(amount) && amount < FD_MIN) return { ok: false, reason: 'below_minimum' };
  const bad = checkAmount(state, amount, token, balance(state, 'bank'));
  if (bad) return bad;
  const fd = { uid: `fd${state.nextId++}`, principal: amount, rate: term.rate, months: term.months, startDay: state.day,
    maturityDay: addMonths(state.day, term.months), status: 'active', expected: fdMaturityValue(amount, term.rate, term.months) };
  transfer(state, 'bank', 'fd', amount, `Opened FD ${fd.uid}: ${term.months} months at ${(term.rate * 100).toFixed(2)}%`, { category: 'fd_open', ref: token });
  state.bank.fds.push(fd);
  logEvent(state, 'bank', `Opened a ${term.months}-month FD of ${inr(amount)} — matures ${dateOf(fd.maturityDay).toISOString().slice(0, 10)} for ${inr(fd.expected)}`);
  return { ok: true, fd };
}

function closeFD(state, fd, value, how) {
  const ref = `fd-close-${fd.uid}`;
  if (tokenUsed(state, ref)) return null;                         // never paid out twice
  transfer(state, 'fd', 'bank', fd.principal, `FD ${fd.uid} principal returned`, { category: 'fd_close', ref });
  const interest = value - fd.principal;
  if (interest > 0) post(state, { account: 'bank', amount: interest, category: 'interest', memo: `FD ${fd.uid} interest (${how})`, ref: `${ref}-int` });
  Object.assign(fd, { status: how === 'matured' ? 'matured' : 'broken', closedDay: state.day, payout: value, interest });
  state.bank.interestToDate += Math.max(0, interest);
  return interest;
}

// Daily: pay out every FD that has reached maturity.
export function matureFDs(state) {
  const notes = [];
  for (const fd of state.bank.fds) {
    if (fd.status !== 'active' || state.day < fd.maturityDay) continue;
    const interest = closeFD(state, fd, fd.expected, 'matured');
    if (interest !== null) notes.push({ kind: 'ok', text: `Your FD matured: ${inr(fd.expected)} (${inr(interest)} interest) is back in savings.`, feed: true });
  }
  return notes;
}

export function breakFD(state, uid, token) {
  const fd = state.bank.fds.find(f => f.uid === uid);
  if (!fd || fd.status !== 'active') return { ok: false, reason: 'not_active' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const value = fdEarlyValue(fd, state.day);
  closeFD(state, fd, value, 'closed early, rate − 1%');
  post(state, { account: 'bank', amount: 0, category: 'fd_close', memo: `Closed FD ${uid} early`, ref: token });
  return { ok: true, value };
}

export const fdTotal = (state, day = state.day) => state.bank.fds.reduce((s, f) => s + fdAccruedValue(f, day), 0);
