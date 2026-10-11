// Property performance from the actual record. Every ledger entry a purchase ("deal") caused is
// tagged with it — the purchase, loan money, fees, EMIs, prepayments, upkeep, repairs, rent, tenant
// deposits, the sale and the loan settlement — so the report is built from what really happened.
//
// Two different questions, answered separately:
//  1. CASH FLOW — what went in and out of your pocket: every tagged cash movement, including loan
//     money received and principal repaid (EMIs are cash out even though part of them builds equity).
//     For a property you still hold, "if sold today" adds the estimated sale (value − 2% fee − unpaid
//     upkeep − tenant deposits − loan payoff). For a sold one, any debt still owed (a forced-sale
//     shortfall) is subtracted, because you still have to pay it.
//  2. ECONOMIC RETURN — did the investment make money?
//        appreciation      end value − purchase price (end value = sale price, or today's estimate)
//      − transaction costs stamp duty + loan fees + selling fee (or the bank's forced-sale costs)
//      − financing cost    interest (paid, added to the loan when EMIs were missed, and accrued at
//                          payoff) + late fees. Principal repayments are NOT a cost — they reduce debt.
//      + net rental income rent received + deposit kept for unpaid rent/damage − upkeep − repairs
//     Deposits held for tenants and loan money are neither income nor cost.
//     For a held property this is an unrealised ESTIMATE; once sold it is realised.
//  The two agree: cash result (incl. the exit and any debt still owed) = economic return.
//  Return on invested cash = economic return ÷ your own money put in (down payment + duty + fees +
//  EMIs + prepayments + upkeep + repairs + any cash you added at the sale).
import { PROPERTIES, NEIGHBOURHOODS, PROPERTY_RULES } from '../data/properties.js';
import { LOCATIONS } from '../data/locations.js';
import { propertyValue, hoodIndex, PHASES } from './housingMarket.js';
import { securedPayoff } from './loans.js';
import { depositsHeld } from './property.js';
import { monthsBetween, inr } from './util.js';

const lower = t => t[0].toLowerCase() + t.slice(1);   // keep acronyms like EMI intact

export function propertyReport(state, rec, id = rec.id) {
  const open = !rec.soldDay, endDay = rec.soldDay ?? state.day, sale = rec.sale ?? {};
  const entries = state.ledger.filter(e => e.deal === rec.uid && e.status === 'ok' && ['wallet', 'bank'].includes(e.account));
  const inn = c => entries.filter(e => e.category === c && e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const out = c => entries.filter(e => e.category === c && e.amount < 0).reduce((s, e) => s - e.amount, 0);
  const loans = state.loans.filter(l => l.deal === rec.uid);
  const mortgage = loans.filter(l => l.kind === 'mortgage').reduce((s, l) => s + l.principal, 0);
  const equityDrawn = loans.filter(l => l.kind === 'equity').reduce((s, l) => s + l.principal, 0);

  // ---- purchase
  const down = out('property_buy') - mortgage;                 // your own money for price + duty
  const loanFees = out('loan_fee');
  // ---- running the property
  const rent = inn('rent_income'), keptRent = rec.depositKeptRent ?? 0, keptDamage = rec.depositKeptDamage ?? 0;
  const upkeepPaid = out('upkeep'), repairs = out('repair');
  const depositsIn = inn('tenant_deposit'), depositsOut = out('tenant_deposit_refund');
  // ---- loans
  const emis = out('emi'), prepaid = out('loan_prepayment'), settledCash = out('loan_settlement');
  const interestPaid = loans.reduce((s, l) => s + l.interestPaid, 0), capitalised = loans.reduce((s, l) => s + (l.interestCapitalised ?? 0), 0);
  const lateFees = loans.reduce((s, l) => s + l.lateFees, 0), principalRepaid = loans.reduce((s, l) => s + (l.principalRepaid ?? 0), 0);
  const unpaidAccrued = Math.max(0, (sale.accruedAtSale ?? 0) - (sale.interestAtPayoff ?? 0));       // forced sale: interest that went into the shortfall
  // ---- exit (actual sale, or an estimate today)
  const valueNow = open ? propertyValue(id, state.day) : null;
  const marketEnd = open ? valueNow : (sale.marketValue ?? sale.value);
  const endPrice = open ? valueNow : sale.value;                // what it sold (or would sell) for
  const sellCosts = open ? Math.round(valueNow * PROPERTY_RULES.sellFee) : sale.fee;
  const arrearsAtExit = open ? (rec.arrears ?? 0) : sale.forced ? (sale.arrears - (sale.arrearsCovered ?? sale.arrears)) : sale.arrears;
  const payoffNow = open ? securedPayoff(state, id) : 0;
  const heldNow = open ? depositsHeld(rec) : 0;
  const exitEstimate = open ? endPrice - sellCosts - (rec.arrears ?? 0) - heldNow - payoffNow : 0;
  const debtStillOwed = loans.filter(l => l.status === 'active' && l.propertyId == null).reduce((s, l) => s + l.balance, 0);   // shortfall debt
  const outstanding = open ? payoffNow + heldNow + (rec.arrears ?? 0) : debtStillOwed;

  // ---- 1. cash flow
  const cashIn = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter(e => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  const netCash = cashIn - cashOut;
  const cashResult = netCash + exitEstimate - debtStillOwed;

  // ---- 2. economic return
  const accruedInterestNow = open ? payoffNow - loans.filter(l => l.status === 'active' && l.propertyId === id).reduce((s, l) => s + l.balance, 0) : 0;
  const appreciation = endPrice - rec.price;
  const transaction = rec.duty + loanFees + sellCosts;
  const financing = interestPaid + capitalised + lateFees + unpaidAccrued + accruedInterestNow;
  const upkeep = upkeepPaid + arrearsAtExit;
  const rentalNet = rent + keptRent + keptDamage - upkeep - repairs;
  const profit = appreciation - transaction - financing + rentalNet;
  const topUpAtSale = open || sale.forced ? 0 : Math.max(0, settledCash + (sale.deposits ?? 0) - (inn('property_sell')));
  const invested = down + loanFees + emis + prepaid + upkeepPaid + repairs + topUpAtSale - (sale.forced ? Math.min(upkeepPaid, sale.arrearsCovered ?? 0) : 0);
  const roi = invested ? profit / invested : 0;
  const operatingCash = rent + keptRent + keptDamage - upkeepPaid - repairs - emis;     // what owning it cost/paid you month to month

  // ---- what drove it (value change split into location vs market, plus the other components)
  const hood = NEIGHBOURHOODS[PROPERTIES[id].hood];
  const years = monthsBetween(rec.boughtDay, endDay) / 12;
  const locationGain = Math.round(rec.marketAtPurchase * (Math.pow(1 + hood.drift, years) - 1));
  const marketGain = marketEnd - rec.marketAtPurchase - locationGain;
  const pricePremium = rec.price - rec.marketAtPurchase;
  const hoodMove = hoodIndex(PROPERTIES[id].hood, endDay) / hoodIndex(PROPERTIES[id].hood, rec.boughtDay) - 1;
  const drivers = [
    { key: 'price', label: pricePremium > 0 ? `Paid ${inr(pricePremium)} above the estimated value` : `Bought ${inr(-pricePremium)} below the estimated value`, amount: -pricePremium },
    { key: 'location', label: `${hood.name}: long-run growth of ${(hood.drift * 100).toFixed(1)}%/yr`, amount: locationGain },
    { key: 'market', label: `Market timing: bought in ${PHASES[rec.phaseAtPurchase]?.label ?? 'an unknown phase'}; this neighbourhood's prices ${hoodMove >= 0 ? 'rose' : 'fell'} ${Math.abs(hoodMove * 100).toFixed(1)}% since`, amount: marketGain },
    ...(sale.forced ? [{ key: 'forced', label: 'Forced sale 15% below market value', amount: endPrice - marketEnd }] : []),
    { key: 'financing', label: loans.length ? 'Loan interest (incl. interest added for missed EMIs) and late fees' : 'No loan — no interest paid', amount: -financing },
    { key: 'renting', label: `Rent ${inr(rent + keptRent)} − upkeep ${inr(upkeep)} − repairs ${inr(repairs)}${keptDamage ? ` + ${inr(keptDamage)} damage covered by deposits` : ''}${rec.vacantMonths ? ` (${rec.vacantMonths} month(s) empty)` : ''}`, amount: rentalNet },
    { key: 'costs', label: `Stamp duty + loan fees + ${open ? 'selling fee if sold now' : sale.forced ? "the bank's sale costs" : 'selling fee'}`, amount: -transaction },
  ];
  const ranked = [...drivers].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const helped = ranked.filter(d => d.amount > 0).slice(0, 2), hurt = ranked.filter(d => d.amount < 0).slice(0, 2);
  const verdict = `${open ? 'Estimate if sold today (unrealised): this' : 'Realised result: this'} purchase ${profit >= 0 ? 'made' : 'lost'} ${inr(Math.abs(profit))} on ${inr(invested)} of your own money (${(roi * 100).toFixed(1)}%). `
    + `Month to month it ${operatingCash >= 0 ? 'paid you' : 'cost you'} ${inr(Math.abs(operatingCash))} in total${principalRepaid ? `, but ${inr(principalRepaid)} of that was loan principal — paying off debt, not a cost` : ''}. `
    + (helped.length ? `Helped most by: ${helped.map(d => lower(d.label)).join('; ')}. ` : '')
    + (hurt.length ? `Held back most by: ${hurt.map(d => lower(d.label)).join('; ')}.` : '')
    + (debtStillOwed ? ` You still owe ${inr(debtStillOwed)} from the forced sale.` : '');

  return { id, name: LOCATIONS[id].name, open, forced: !!sale.forced, hood: hood.name, quality: PROPERTIES[id].quality, boughtDay: rec.boughtDay, endDay,
    months: monthsBetween(rec.boughtDay, endDay), price: rec.price, marketAtPurchase: rec.marketAtPurchase, phaseAtPurchase: rec.phaseAtPurchase,
    financed: mortgage > 0, valuations: rec.valuations ?? [],
    purchase: { price: rec.price, duty: rec.duty, loanFees, down, mortgage },
    loans: { emis, prepaid, settled: settledCash, interestPaid, capitalised, lateFees, principalRepaid, equityDrawn, unpaidAccrued: unpaidAccrued + accruedInterestNow },
    rental: { rent, keptRent, keptDamage, upkeep, repairs, vacantMonths: rec.vacantMonths ?? 0, depositsIn, depositsOut, depositsHeld: heldNow, tenants: (rec.pastTenants?.length ?? 0) + (rec.tenant ? 1 : 0) },
    exit: { value: endPrice, marketValue: marketEnd, sellCosts, arrears: arrearsAtExit, payoff: open ? payoffNow : (sale.settled ?? 0), deposits: open ? heldNow : (sale.deposits ?? 0), shortfall: sale.shortfall ?? 0, estimate: open },
    cash: { in: cashIn, out: cashOut, net: netCash, exitEstimate, debtStillOwed, result: cashResult, operating: operatingCash },
    economic: { appreciation, transaction, financing, rentalNet, profit, realised: !open },
    outstanding, invested, profit, roi, drivers, verdict };
}

export const allReports = state => [
  ...Object.entries(state.properties).map(([id, rec]) => propertyReport(state, rec, id)),
  ...state.propertyHistory.map(rec => propertyReport(state, rec)),
];
