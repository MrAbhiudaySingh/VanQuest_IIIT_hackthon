// Single source of truth for money. Balances are *derived* from the ledger, so the
// displayed balance can never disagree with the transaction history.
//
// Accounts:
//   'wallet'    cash on hand (salary arrives here)
//   'bank'      Nidhi Bank savings account (earns interest)
//   'fd'        money locked in fixed deposits (principal only; interest is paid out at maturity)
//   'brokerage' virtual investing cash on the Summit trading desk
// Failed attempts (e.g. a bill that couldn't be paid) are recorded with status 'failed' and
// amount 0 so they appear in history without moving money.
// Entries can carry `prop` (property id), `deal` (purchase record id) and `loan` (loan id) so
// property and loan reports can be built from the real history.

export function balance(state, account = 'wallet') {
  let sum = 0;
  for (const e of state.ledger) if (e.account === account && e.status === 'ok') sum += e.amount;
  return sum;
}

// Money you can pay with: cash first, then your savings account (like a debit card).
export const spendable = state => balance(state, 'wallet') + balance(state, 'bank');

export function post(state, { account = 'wallet', amount, category, memo, ref = null, prop, deal, loan }) {
  if (!Number.isInteger(amount)) throw new Error(`ledger amounts must be whole rupees, got ${amount}`);
  if (amount < 0 && balance(state, account) + amount < 0) return { ok: false, reason: 'insufficient_funds' };
  const entry = { id: state.nextId++, day: state.day, account, amount, category, memo, ref, status: 'ok' };
  if (prop) entry.prop = prop;
  if (deal) entry.deal = deal;
  if (loan) entry.loan = loan;
  state.ledger.push(entry);
  return { ok: true, entry };
}

// Pay a bill or purchase: from cash first, the rest from savings. All-or-nothing.
export function pay(state, { amount, ...rest }) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`bad amount ${amount}`);
  if (spendable(state) < amount) return { ok: false, reason: 'insufficient_funds' };
  const fromCash = Math.min(amount, balance(state, 'wallet')), fromBank = amount - fromCash;
  const entries = [];
  if (fromCash || !fromBank) entries.push(post(state, { ...rest, account: 'wallet', amount: -fromCash }).entry);
  if (fromBank) entries.push(post(state, { ...rest, account: 'bank', amount: -fromBank, memo: `${rest.memo} (from savings)` }).entry);
  return { ok: true, entry: entries[0], entries };
}

export function recordFailure(state, { account = 'wallet', attempted, category, memo, ref = null, prop, loan }) {
  const entry = { id: state.nextId++, day: state.day, account, amount: 0, attempted, category, memo, ref, status: 'failed' };
  if (prop) entry.prop = prop;
  if (loan) entry.loan = loan;
  state.ledger.push(entry);
  return entry;
}

// Moves money between accounts atomically (both legs or neither).
export function transfer(state, from, to, amount, memo, extra = {}) {
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  if (balance(state, from) < amount) return { ok: false, reason: 'insufficient_funds' };
  post(state, { account: from, amount: -amount, category: extra.category ?? 'transfer', memo, ref: extra.ref ?? null });
  post(state, { account: to, amount, category: extra.category ?? 'transfer', memo, ref: extra.ref ?? null });
  return { ok: true };
}

// A confirmation token (or a recurring event's key) may only ever be charged once.
export const tokenUsed = (state, token) => state.ledger.some(e => e.ref === token);
