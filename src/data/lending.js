// Loan products (fictional, fixed-rate for the whole term). One engine (sim/loans.js) runs them all.
// EMI = P·r(1+r)^n / ((1+r)^n − 1), r = annual rate / 12, n = months; zero-rate loans pay P/n.
export const MORTGAGE = {
  baseRate: 0.085,
  tenureYears: [5, 10, 15, 20],
  downOptions: [0.10, 0.20, 0.30, 0.50],
  // maximum loan-to-value by loan size (mirrors common Indian housing-loan limits)
  ltv: principal => (principal <= 3000000 ? 0.90 : principal <= 7500000 ? 0.80 : 0.75),
  fee: 0.005, feeMin: 2000,          // processing fee, paid upfront from your money
};

// Home-equity loan: borrow against a property you own. Max = 60% of its market value minus any
// loans already secured on it. Paid into your savings account.
export const EQUITY = { rateAdd: 0.015, ltv: 0.60, tenureYears: [3, 5, 10], fee: 0.01, feeMin: 2000 };

export const LENDING_RULES = {
  maxFoir: 0.50,          // all EMIs (existing + new) ≤ 50% of monthly income
  lateFee: 500,           // added to the loan balance for each missed EMI
  defaultAfter: 3,        // consecutive missed EMIs → default: the bank sells the collateral
  forcedSaleDiscount: 0.15,
};
