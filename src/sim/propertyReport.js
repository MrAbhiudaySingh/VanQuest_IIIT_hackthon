// Property performance from the actual record: every rupee you put into a purchase ("deal") and
// every rupee it returned, taken from ledger entries tagged with that deal, plus — for a property
// you still hold — what you'd pocket if you sold today (value − 2% fee − loans still owed).
//   cash invested = down payment + stamp duty + loan fees + EMIs + prepayments + upkeep
//                   (+ the cash you add at a sale to clear loans)
//   cash returned = rent received + sale proceeds after the loans are repaid
//   profit        = returned − invested;   return on cash = profit / invested
// It then splits the result into what caused it: price paid vs the estimate, location (the
// neighbourhood's long-run growth), market timing (the cycle), financing (interest + fees),
// renting (rent − upkeep, months vacant) and transaction costs. Nothing is labelled "good" just
// because the value went up.
import { PROPERTIES, NEIGHBOURHOODS, PROPERTY_RULES } from '../data/properties.js';
import { LOCATIONS } from '../data/locations.js';
import { propertyValue, marketIndex, PHASES } from './housingMarket.js';
import { securedBalance } from './loans.js';
import { monthsBetween, inr } from './util.js';

export function propertyReport(state, rec, id = rec.id) {
  const open = !rec.soldDay, endDay = rec.soldDay ?? state.day;
  const entries = state.ledger.filter(e => e.deal === rec.uid && e.status === 'ok');
  const sum = (cats, sign = -1) => entries.filter(e => cats.includes(e.category) && Math.sign(e.amount) === sign).reduce((s, e) => s + Math.abs(e.amount), 0);
  const loans = state.loans.filter(l => l.deal === rec.uid);
  const disbursed = loans.filter(l => l.kind === 'mortgage').reduce((s, l) => s + l.principal, 0);
  const equityDrawn = loans.filter(l => l.kind === 'equity').reduce((s, l) => s + l.principal, 0);
  const purchase = sum(['property_buy']);
  const down = purchase - disbursed;                              // includes stamp duty
  const fees = sum(['loan_fee']);
  const emis = sum(['emi']), prepaid = sum(['loan_prepayment']), upkeep = sum(['upkeep']);
  const interest = loans.reduce((s, l) => s + l.interestPaid, 0) + loans.reduce((s, l) => s + l.lateFees, 0);
  const rent = sum(['rent_income'], 1);
  const saleNet = sum(['property_sell', 'repossession'], 1);
  const settled = sum(['loan_settlement']);
  const owedNow = open ? securedBalance(state, id) : 0;
  const valueNow = open ? propertyValue(id, state.day) : rec.sale.value;
  const ifSold = open ? Math.round(valueNow * (1 - PROPERTY_RULES.sellFee)) - (rec.arrears ?? 0) - owedNow : 0;
  // equity loans put cash in your pocket; count it as returned (its repayments are in EMIs)
  const invested = down + fees + emis + prepaid + upkeep;
  const returned = rent + equityDrawn + (open ? ifSold : saleNet - settled);
  const profit = returned - invested, roi = invested ? profit / invested : 0;

  // attribution of the change in value (estimate at purchase → value at sale / today)
  const hood = NEIGHBOURHOODS[PROPERTIES[id].hood];
  const years = monthsBetween(rec.boughtDay, endDay) / 12;
  const locationGain = Math.round(rec.marketAtPurchase * (Math.pow(1 + hood.drift, years) - 1));
  const marketGain = valueNow - rec.marketAtPurchase - locationGain;
  const pricePremium = rec.price - rec.marketAtPurchase;
  const indexMove = marketIndex(endDay) / marketIndex(rec.boughtDay) - 1;
  const financing = interest + fees;
  const rentalNet = rent - upkeep;
  const transaction = rec.duty + (open ? Math.round(valueNow * PROPERTY_RULES.sellFee) : rec.sale.fee);

  const drivers = [
    { key: 'price', label: pricePremium > 0 ? `Paid ${inr(pricePremium)} above the estimated value` : `Bought ${inr(-pricePremium)} below the estimated value`, amount: -pricePremium },
    { key: 'location', label: `${hood.name}: long-run growth of ${(hood.drift * 100).toFixed(1)}%/yr`, amount: locationGain },
    { key: 'market', label: `Market timing: bought in ${PHASES[rec.phaseAtPurchase]?.label ?? 'an unknown phase'}, index ${indexMove >= 0 ? 'up' : 'down'} ${Math.abs(indexMove * 100).toFixed(1)}% since (× ${hood.beta} sensitivity)`, amount: marketGain },
    { key: 'financing', label: loans.length ? `Loan interest, late fees and processing fees` : 'No loan — no interest paid', amount: -financing },
    { key: 'renting', label: `Rent received ${inr(rent)} − upkeep ${inr(upkeep)}${rec.vacantMonths ? ` (${rec.vacantMonths} month(s) empty)` : ''}`, amount: rentalNet },
    { key: 'costs', label: `Stamp duty + ${open ? 'selling fee if sold now' : 'selling fee'}`, amount: -transaction },
  ];
  const ranked = [...drivers].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const helped = ranked.filter(d => d.amount > 0).slice(0, 2), hurt = ranked.filter(d => d.amount < 0).slice(0, 2);
  const verdict = `${open ? 'So far, if sold today, this' : 'This'} purchase ${profit >= 0 ? 'made' : 'lost'} ${inr(Math.abs(profit))} on ${inr(invested)} of your own money (${(roi * 100).toFixed(1)}%). `
    + (helped.length ? `It was helped most by: ${helped.map(d => d.label.toLowerCase()).join('; ')}. ` : '')
    + (hurt.length ? `It was held back most by: ${hurt.map(d => d.label.toLowerCase()).join('; ')}.` : '');

  return { id, name: LOCATIONS[id].name, open, hood: hood.name, quality: PROPERTIES[id].quality, boughtDay: rec.boughtDay, endDay, months: monthsBetween(rec.boughtDay, endDay),
    price: rec.price, marketAtPurchase: rec.marketAtPurchase, phaseAtPurchase: rec.phaseAtPurchase, financed: loans.some(l => l.kind === 'mortgage'),
    down, duty: rec.duty, fees, emis, prepaid, interest, upkeep, rent, vacantMonths: rec.vacantMonths ?? 0, valueNow, ifSold, saleNet, settled, owedNow,
    forced: !!rec.sale?.forced, invested, returned, profit, roi, drivers, verdict };
}

export const allReports = state => [
  ...Object.entries(state.properties).map(([id, rec]) => propertyReport(state, rec, id)),
  ...state.propertyHistory.map(rec => propertyReport(state, rec)),
];
