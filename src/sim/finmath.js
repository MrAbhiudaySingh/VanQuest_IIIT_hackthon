// Pure financial formulas shared by the live game (sim/loans.js, sim/bank.js) and the academy's
// isolated practice simulator (src/practice/). No state, no ledger, no side effects — inputs in,
// numbers out — so the practice code can reuse the game's arithmetic without touching the game.

// EMI = P·r(1+r)^n / ((1+r)^n − 1), r = annual/12; r = 0 → P/n (rounded up).
export function emi(P, annualRate, n) {
  if (n <= 0) return P;
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(P / n);
  return Math.round(P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

// Full amortisation schedule (the final EMI clears any rounding, so the balance never goes negative).
export function schedule(P, annualRate, n) {
  const e = emi(P, annualRate, n), r = annualRate / 12, rows = [];
  let bal = P;
  for (let m = 1; m <= n && bal > 0; m++) {
    const interest = Math.round(bal * r), due = m === n ? bal + interest : Math.min(e, bal + interest);
    bal = bal + interest - due;
    rows.push({ month: m, emi: due, interest, principal: due - interest, balance: bal });
  }
  return rows;
}

// Fixed deposit: compounded quarterly.
export const fdMaturityValue = (principal, rate, months) => Math.round(principal * Math.pow(1 + rate / 4, months / 3));
// Closing an FD early after `months`: (rate − penalty) for completed quarters + simple for the rest; never below principal.
export function fdEarlyMonths(principal, rate, monthsHeld, penalty) {
  const r = Math.max(0, rate - penalty), q = Math.floor(monthsHeld / 3), rest = monthsHeld - 3 * q;
  return Math.max(principal, Math.round(principal * Math.pow(1 + r / 4, q) * (1 + r * rest / 12)));
}
// Monthly compounding (a simple savings-account model for practice: rate/12 each month).
export const compoundMonthly = (principal, annualRate, months) => principal * Math.pow(1 + annualRate / 12, months);
