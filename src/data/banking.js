// Fictional bank products (Nidhi Bank). All rates are annual and configurable here.
export const BANK = { name: 'Nidhi Bank', banker: { name: 'Mr. Desai', role: 'Bank officer', char: 1 } };

// Savings account: interest on each day's closing balance (balance × rate / 365), accrued daily,
// credited (and so compounded) quarterly on 1 Jan, 1 Apr, 1 Jul and 1 Oct. No fees, no minimum,
// unlimited free withdrawals.
export const SAVINGS = { rate: 0.035, creditMonths: [1, 4, 7, 10] };

// Fixed deposits: interest compounded quarterly; value = P × (1 + r/4)^(quarters).
// Premature withdrawal: allowed; you earn (rate − 1%) for the time actually held (quarterly
// compounding for completed quarters, simple interest for the remaining days), never less than P.
export const FD_TERMS = [
  { months: 6, rate: 0.060 },
  { months: 12, rate: 0.0675 },
  { months: 24, rate: 0.070 },
  { months: 36, rate: 0.0725 },
];
export const FD_MIN = 5000;
export const FD_PENALTY = 0.01;
