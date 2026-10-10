// Transparent simulated credit profile (300–900). Every point comes from a listed factor the
// player can see, computed from their actual record — no hidden score.
//   start                          700
//   each on-time EMI               +2   (up to +60)
//   each missed EMI, last 12 months −45
//   each missed rent, last 12 months −20
//   other unpaid bills, last 12 m   −5 each (up to −40)
//   each loan default (ever)       −200
//   EMIs above 35% / 50% of income −25 / −60
// Tiers set what lenders offer (fixed for the life of each loan once taken).
export const TIERS = [
  { min: 780, name: 'Excellent', rateAdj: -0.0025, eligible: true },
  { min: 720, name: 'Good', rateAdj: 0, eligible: true },
  { min: 650, name: 'Fair', rateAdj: 0.0075, eligible: true },
  { min: 550, name: 'Poor', rateAdj: 0.02, eligible: true },
  { min: 0, name: 'Very poor', rateAdj: null, eligible: false },
];

export const monthlyIncome = state => state.job.salary;
export const totalEmis = state => state.loans.filter(l => l.status === 'active').reduce((s, l) => s + l.emi, 0);

export function creditProfile(state) {
  const recent = e => state.day - e.day < 365;
  const onTime = state.loans.reduce((s, l) => s + l.paidCount, 0);
  const missedEmi = state.loans.reduce((s, l) => s + l.missedDays.filter(d => state.day - d < 365).length, 0);
  const failed = state.ledger.filter(e => e.status === 'failed' && recent(e));
  const missedRent = failed.filter(e => e.category === 'rent').length;
  const otherUnpaid = failed.filter(e => !['rent', 'emi'].includes(e.category)).length;
  const defaults = state.credit.defaults.length;
  const dti = monthlyIncome(state) ? totalEmis(state) / monthlyIncome(state) : (totalEmis(state) ? 1 : 0);
  const factors = [
    { label: 'Starting point', points: 700 },
    { label: `On-time EMIs (${onTime})`, points: Math.min(60, onTime * 2) },
    { label: `Missed EMIs in the last 12 months (${missedEmi})`, points: -45 * missedEmi },
    { label: `Missed rent in the last 12 months (${missedRent})`, points: -20 * missedRent },
    { label: `Other unpaid bills in the last 12 months (${otherUnpaid})`, points: -Math.min(40, 5 * otherUnpaid) },
    { label: `Loan defaults (${defaults})`, points: -200 * defaults },
    { label: `EMIs are ${Math.round(dti * 100)}% of income`, points: dti > 0.5 ? -60 : dti > 0.35 ? -25 : 0 },
  ];
  const score = Math.max(300, Math.min(900, factors.reduce((s, f) => s + f.points, 0)));
  return { score, tier: TIERS.find(t => score >= t.min), factors, dti };
}
