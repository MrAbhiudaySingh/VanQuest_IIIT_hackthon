// Round 5: lending with rental income, sales & forced-sale shortfalls, tenancies (deposits, late /
// missed rent, move-outs, vacancy, repairs), neighbourhood markets, valuation history, cash-flow vs
// economic returns, loan-engine edge cases, the supplied courses, and Round 4 save migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { newGame, loadGame, saveGame, migrate, SAVE_VERSION } from '../src/sim/state.js';
import { balance, spendable } from '../src/sim/ledger.js';
import { advanceDays, runDay } from '../src/sim/clock.js';
import { buyProperty, sellProperty, rentHome, moveIn, listForRent, stopRentingOut, propertyValue, canEnter, tenantOutcome, saleProceeds } from '../src/sim/property.js';
import { hoodIndex, hoodChange, market, marketPhase } from '../src/sim/housingMarket.js';
import { emi, schedule, mortgageQuote, equityQuote, takeEquityLoan, prepay, accruedInterest, securedOn } from '../src/sim/loans.js';
import { incomeBreakdown, creditProfile } from '../src/sim/credit.js';
import { overview, flows } from '../src/sim/networth.js';
import { propertyReport } from '../src/sim/propertyReport.js';
import { savePlan } from '../src/sim/groceryPlan.js';
import { purchase, placeFurniture } from '../src/sim/inventory.js';
import { submitCheck, markStudied, courseProgress, courseRecord, saveNote, LEGACY_LESSONS, PASS_MARK } from '../src/sim/academy.js';
import { COURSES } from '../src/data/courses.js';
import { ITEMS } from '../src/data/catalog.js';
import { NEIGHBOURHOODS, PROPERTIES, TENANCY, REPAIRS } from '../src/data/properties.js';
import { RENT_INCOME, LENDING_RULES } from '../src/data/lending.js';
import { nextMonthStart, monthKey, hash01, addMonths } from '../src/sim/util.js';

const toFirst = s => advanceDays(s, nextMonthStart(s.day) - s.day);
const stock = (s, days = 2500) => { for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'grocery') s.pantry[id] = Math.ceil(days * it.usePerDay) + 1; return s; };
const give = (s, amount, account = 'wallet') => { s.ledger.push({ id: s.nextId++, day: s.day, account, amount, category: 'test', memo: 'test funds', status: 'ok' }); return s; };
const drain = s => { for (const a of ['wallet', 'bank']) { const b = balance(s, a); if (b) give(s, -b, a); } s.job.salary = 0; return s; };
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const cat = (s, c, extra = () => true) => s.ledger.filter(e => e.category === c && e.status === 'ok' && extra(e));
const rich = (salary = 200000, cash = 9000000) => { const s = stock(give(newGame(), cash)); s.job.salary = salary; return s; };
// a let property with a tenant in place (cash purchase, listed, first 1st passes)
function letOut(s, id = 'home_apartment_plus', token = 'let') {
  assert.ok(buyProperty(s, id, token).ok);
  listForRent(s, id);
  while (s.properties[id].status !== 'let') toFirst(s);
  return s.properties[id];
}
// a tenant uid whose seeded payment outcomes over the given months match `want`
function uidFor(want, keys) {
  for (let i = 0; i < 100000; i++) { const t = { uid: `tnx${i}`, reliable: false }; if (keys.every((k, j) => tenantOutcome(t, k) === want[j])) return t.uid; }
  throw new Error('no uid found');
}

// ================================================================== mortgage eligibility
test('eligibility: salary only; actual rent received counts (75% of the 6-month average); vacant property does not', () => {
  const s = rich(30000, 3000000);
  const p = letOut(s);
  p.tenant.reliable = true;
  for (let i = 0; i < 7; i++) toFirst(s);
  const inc = incomeBreakdown(s);
  const since = s.day - Math.round(RENT_INCOME.months * 30.44);
  const got = cat(s, 'rent_income', e => e.prop === 'home_apartment_plus' && e.day > since).reduce((a, e) => a + e.amount, 0);
  assert.equal(inc.rentals.length, 1);
  assert.equal(inc.rent, Math.round(got / RENT_INCOME.months * RENT_INCOME.allowance));
  assert.ok(inc.rent > 0 && inc.total === 30000 + inc.rent);
  // choose a salary where the EMI fails on salary alone but passes with the counted rent
  const probe = mortgageQuote(s, 'home_starter', 0.2, 20);
  s.job.salary = Math.floor(probe.emi / LENDING_RULES.maxFoir) - Math.floor(inc.rent / 2);
  const withRent = mortgageQuote(s, 'home_starter', 0.2, 20);
  assert.ok(withRent.foir <= 0.5, `passes with rent (${withRent.foir})`);
  assert.equal(withRent.incomeBreakdown.rent, inc.rent);
  // the same property listed / empty adds nothing
  const vacant = JSON.parse(JSON.stringify(s));
  vacant.properties.home_apartment_plus.status = 'listed'; vacant.properties.home_apartment_plus.tenant = null;
  const noRent = mortgageQuote(vacant, 'home_starter', 0.2, 20);
  assert.deepEqual(noRent.incomeBreakdown.rentals, []);
  assert.equal(noRent.income, s.job.salary);
  assert.ok(noRent.foir > 0.5 && noRent.reasons.some(r => /eligible income/.test(r)), 'fails on salary alone');
});

test('eligibility: no circularity — the loan itself, sale money and deposits are never income', () => {
  const s = rich(150000, 7000000);
  const before = incomeBreakdown(s);
  assert.ok(buyProperty(s, 'home_starter', 'b', { downPct: 0.2, years: 20 }).ok);
  assert.deepEqual(incomeBreakdown(s), before, 'taking the loan did not change eligible income');
  letOut(s, 'home_family', 'f');                         // tenant deposit received — not income
  const inc = incomeBreakdown(s);
  const counted = cat(s, 'rent_income').reduce((a, e) => a + e.amount, 0);
  assert.equal(inc.rent, Math.round(counted / RENT_INCOME.months * RENT_INCOME.allowance));
  assert.ok(cat(s, 'tenant_deposit').length === 1);
});

test('eligibility: existing EMIs, down payment / LTV, credit tier, no income and essential bills each refuse with a reason', () => {
  const s = rich(60000, 3000000);
  const fresh = mortgageQuote(s, 'home_starter', 0.2, 20);
  assert.ok(fresh.ok, fresh.reasons.join());
  assert.ok(buyProperty(s, 'home_apartment_plus', 'a', { downPct: 0.2, years: 5 }).ok);
  const after = mortgageQuote(s, 'home_starter', 0.2, 20);
  assert.ok(after.existingEmis > 0 && after.foir > fresh.foir, 'existing EMIs count');
  const lux = mortgageQuote(rich(5000000, 20000000), 'home_luxury', 0.1, 20);
  assert.ok(lux.reasons.some(r => /down payment is too small/.test(r)), 'loans above ₹75 lakh: at most 75% of the price');
  const bad = rich(60000, 3000000); bad.credit.defaults.push({ day: 0 }, { day: 0 });
  assert.equal(creditProfile(bad).tier.name, 'Very poor');
  assert.ok(mortgageQuote(bad, 'home_starter', 0.2, 20).reasons.some(r => /won't lend/.test(r)));
  const jobless = rich(0, 3000000);
  assert.ok(mortgageQuote(jobless, 'home_starter', 0.2, 20).reasons.some(r => /no eligible regular income/.test(r)));
  const stretched = rich(20000, 3000000);
  savePlan(stretched, { rice_5kg: 30, oil_1l: 20, dal_1kg: 20 }, 'delivery');
  const q = mortgageQuote(stretched, 'home_apartment', 0.2, 20);
  assert.ok(q.foir <= 0.5 && q.leftAfterCommitments < 0 && q.reasons.some(r => /short every month/.test(r)), 'EMIs + essential bills must fit the income');
  const poor = rich(200000, 100000);
  assert.ok(mortgageQuote(poor, 'home_starter', 0.1, 20).reasons.some(r => /up front/.test(r)), 'down payment + duty + fee must be affordable');
});

// ================================================================== sales and forced sales
test('voluntary sale with a loan: payoff includes interest since the last EMI, settled exactly once, surplus to you', () => {
  const s = rich();
  buyProperty(s, 'home_starter', 'b', { downPct: 0.2, years: 20 });
  toFirst(s); toFirst(s); advanceDays(s, 10);                 // mid-month, after two EMIs
  const l = s.loans[0], accrued = accruedInterest(l, s.day);
  assert.equal(accrued, Math.round(l.balance * l.rate * 10 / 365));
  const sp = saleProceeds(s, 'home_starter'), cash0 = spendable(s);
  assert.equal(sp.debt, l.balance + accrued);
  assert.ok(sellProperty(s, 'home_starter', 'sell').ok);
  assert.equal(spendable(s) - cash0, sp.gross - sp.debt, 'you receive value − fee − loan payoff');
  assert.equal(l.status, 'closed'); assert.equal(l.balance, 0);
  assert.equal(cat(s, 'loan_settlement').length, 1);
  assert.equal(-cat(s, 'loan_settlement')[0].amount, sp.debt);
  advanceDays(s, 30);
  assert.equal(cat(s, 'emi', e => e.loan === l.uid).length, 2, 'no EMI after settlement');
  assert.equal(sellProperty(s, 'home_starter', 'sell2').reason, 'not_owned');
});

test('voluntary sale: a shortfall must be paid from your money, otherwise the sale is refused and nothing changes', () => {
  const s = rich();
  buyProperty(s, 'home_starter', 'b', { downPct: 0.2, years: 20 });
  s.loans[0].balance = 2500000;                             // more than the home is worth
  drain(s); give(s, 1000);
  const n = s.ledger.length, sp = saleProceeds(s, 'home_starter');
  assert.ok(sp.toYou < 0);
  const r = sellProperty(s, 'home_starter', 'x');
  assert.equal(r.reason, 'negative_equity'); assert.equal(r.shortfall, -sp.toYou);
  assert.equal(s.ledger.length, n); assert.ok(s.properties.home_starter);
  give(s, -sp.toYou);                                       // now you can cover it
  const cash0 = spendable(s);
  assert.ok(sellProperty(s, 'home_starter', 'y').ok);
  assert.equal(spendable(s), cash0 + sp.toYou, 'exactly the shortfall left your account');
  assert.equal(s.loans[0].status, 'closed');
});

test('forced sale with a shortfall: the rest stays owed as a debt (no write-off); home lost, access and furniture handled', () => {
  const s = rich();
  // 10% down: after a 15% forced-sale discount and 2% costs, the sale can't clear the loan
  buyProperty(s, 'home_starter', 'b', { downPct: 0.1, years: 20 }); moveIn(s, 'home_starter');
  purchase(s, 'market_furniture', { study_desk: 1 }, 'desk');
  const desk = s.furniture.find(f => f.itemId === 'study_desk');
  assert.ok(placeFurniture(s, desk.uid, 'home_starter', 3, 3).ok);
  drain(s);
  for (let i = 0; i < 3; i++) toFirst(s);
  const rec = s.propertyHistory[0], sale = rec.sale, debt = s.loans.find(l => l.kind === 'shortfall');
  assert.equal(sale.forced, true);
  assert.equal(sale.value, Math.round(sale.marketValue * 0.85));
  assert.equal(sale.fee, Math.round(sale.value * LENDING_RULES.enforcementCost));
  assert.ok(debt && debt.status === 'active', 'shortfall debt created');
  assert.equal(debt.balance, sale.shortfall);
  assert.equal(sale.settled + sale.fee + sale.arrearsCovered + sale.deposits, sale.value, 'every rupee of the sale price accounted for');
  assert.equal(s.loans[0].status, 'defaulted'); assert.equal(s.loans[0].balance, 0);
  assert.equal(overview(s).liabilities.otherLoans, debt.balance, 'still a liability');
  assert.equal(s.credit.defaults.length, 1);
  assert.equal(s.housing, null); assert.equal(canEnter(s, 'home_starter').ok, false);
  assert.equal(desk.home, null, 'furniture moved to storage');
  const n = s.ledger.length; runDay(s);
  assert.equal(s.ledger.filter((e, i) => i >= n && e.amount !== 0 && ['repossession', 'loan_settlement'].includes(e.category)).length, 0, 'never recovered twice');
  const r = propertyReport(s, rec);
  assert.equal(r.cash.debtStillOwed, debt.balance);
  assert.equal(r.cash.result, r.economic.profit, 'cash − debt still owed = economic result');
  assert.match(r.verdict, /still owe/);
});

test('forced sale with a surplus: the bank takes what it is owed and pays you the rest', () => {
  const s = rich();
  buyProperty(s, 'home_starter', 'b', { downPct: 0.5, years: 20 }); moveIn(s, 'home_starter');   // own home: no rent to complicate it
  drain(s);
  for (let i = 0; i < 3; i++) toFirst(s);
  const sale = s.propertyHistory[0].sale;
  assert.equal(sale.shortfall, 0);
  assert.ok(sale.surplus > 0);
  assert.equal(spendable(s), sale.surplus, 'surplus credited (you had nothing else)');
  assert.equal(s.loans.filter(l => l.kind === 'shortfall').length, 0);
  assert.equal(s.loans[0].status, 'closed');
});

// ================================================================== tenancies
test('your own deposit: 2 months at signing, returned once when you move, kept for unpaid rent on eviction', () => {
  const s = rich(0, 200000);
  assert.ok(rentHome(s, 'home_apartment_plus', 'r1').ok);
  const h = s.housing, dep = h.deposit;
  assert.equal(dep, h.rent * TENANCY.depositMonths);
  assert.equal(-cat(s, 'deposit_paid')[0].amount, dep);
  assert.ok(rentHome(s, 'home_starter', 'r2').ok);
  assert.equal(cat(s, 'deposit_refund').length, 1); assert.equal(cat(s, 'deposit_refund')[0].amount, dep);
  // eviction: two unpaid rents are covered by the 2-month deposit — no refund, no debt
  const rent = s.housing.rent;
  drain(s);
  toFirst(s); toFirst(s);
  assert.equal(s.housing, null);
  assert.equal(cat(s, 'deposit_refund').length, 1, 'nothing refunded — the deposit covered the unpaid rent');
  assert.equal(s.loans.length, 0);
  assert.ok(rent * 2 === s.ledger.filter(e => e.category === 'deposit_paid' && e.memo.includes('12 Elm')).reduce((a, e) => a - e.amount, 0));
});

test('eviction from a tenancy with no deposit: the unpaid rent stays owed (0%, 6 months), not erased', () => {
  const s = stock(newGame());
  drain(s);
  toFirst(s); toFirst(s);
  assert.equal(s.housing, null);
  const d = s.loans.find(l => l.kind === 'rent_arrears');
  assert.ok(d); assert.equal(d.balance, 3000 * 2); assert.equal(d.rate, 0); assert.equal(d.emi, 1000);
  assert.equal(overview(s).liabilities.otherLoans, 6000);
});

test('tenant deposit is a liability, not income; tenant pays late (on the 15th), misses, then leaves; deposit settles it', () => {
  const s = rich();
  const p = letOut(s);
  const t = p.tenant, dep = t.deposit;
  assert.equal(dep, t.rent * TENANCY.depositMonths);
  assert.equal(cat(s, 'tenant_deposit')[0].amount, dep);
  assert.equal(overview(s).liabilities.tenantDeposits, dep);
  assert.equal(flows(s).rentIncome, cat(s, 'rent_income').reduce((a, e) => a + e.amount, 0), 'deposit not counted as rent');
  // next three months: late, missed, missed → the tenant leaves for arrears
  const keys = [1, 2, 3].map(k => monthKey(addMonths(s.day, k)));
  t.uid = uidFor(['late', 'missed', 'missed'], keys);
  toFirst(s);                                               // late: nothing on the 1st
  assert.equal(cat(s, 'rent_income', e => e.ref === `rentin-home_apartment_plus-${keys[0]}`).length, 0);
  advanceDays(s, TENANCY.lateDay - 2);
  assert.equal(cat(s, 'rent_income', e => e.ref === `rentin-home_apartment_plus-${keys[0]}`).length, 0, 'not before the 15th');
  advanceDays(s, 1);
  const late = cat(s, 'rent_income', e => e.ref === `rentin-home_apartment_plus-${keys[0]}`);
  assert.equal(late.length, 1); assert.match(late[0].memo, /late/);
  advanceDays(s, 5);
  assert.equal(cat(s, 'rent_income', e => e.ref === `rentin-home_apartment_plus-${keys[0]}`).length, 1, 'paid once');
  toFirst(s);                                               // missed
  assert.equal(p.tenant.arrears, t.rent);
  toFirst(s);                                               // missed again → leaves
  assert.equal(p.tenant, null);
  assert.equal(p.status, 'listed', 're-advertised');
  const past = p.pastTenants.at(-1);
  assert.equal(past.why, 'arrears'); assert.equal(past.keptRent, Math.min(dep, 2 * t.rent));
  assert.equal(past.refund, dep - past.keptRent - past.keptDamage);
  assert.equal(cat(s, 'tenant_deposit_refund').reduce((a, e) => a - e.amount, 0), past.refund);
  assert.equal(overview(s).liabilities.tenantDeposits, 0);
  assert.equal(cat(s, 'repair', e => e.memo.includes('Move-out')).length, 1);
  // vacancy: no rent while empty
  const before = cat(s, 'rent_income').length;
  advanceDays(s, 20);
  assert.equal(cat(s, 'rent_income').length, before, 'an empty property earns nothing');
});

test('lease end: the tenant leaves on the 1st, deposit refunded minus damage, wear repair paid, one empty month', () => {
  const s = rich();
  const p = letOut(s);
  p.tenant.reliable = true;
  p.tenant.leaseEnd = nextMonthStart(s.day);
  const dep = p.tenant.deposit, uid = p.tenant.uid, rent = p.tenant.rent;
  const departKey = monthKey(nextMonthStart(s.day));
  toFirst(s);
  assert.equal(p.tenant, null);
  const past = p.pastTenants.at(-1);
  assert.equal(past.why, 'lease_end'); assert.equal(past.keptRent, 0);
  const damage = hash01('damage', uid) < TENANCY.damageChance ? Math.round(rent * TENANCY.damageMax * hash01('damage-amt', uid) / 100) * 100 : 0;
  assert.equal(past.keptDamage, Math.min(dep, damage));
  assert.equal(past.repair, Math.round(rent * TENANCY.wearRepair / 100) * 100 + damage);
  assert.equal(cat(s, 'rent_income', e => e.ref === `rentin-home_apartment_plus-${departKey}`).length, 0, 'no rent after the lease ends');
  toFirst(s);
  assert.ok(p.tenant && p.tenant.uid !== uid, 'a new tenant after the vacancy');
});

test('ending a tenancy yourself needs the deposit refund; a let property sold returns the deposit from the proceeds', () => {
  const s = rich();
  letOut(s);
  const dep = s.properties.home_apartment_plus.tenant.deposit;
  const poor = JSON.parse(JSON.stringify(s)); drain(poor);
  assert.equal(stopRentingOut(poor, 'home_apartment_plus').reason, 'deposit_refund');
  const sp = saleProceeds(s, 'home_apartment_plus');
  assert.equal(sp.deposits, dep);
  assert.equal(sp.net, sp.value - sp.fee - sp.arrears - dep);
  assert.ok(sellProperty(s, 'home_apartment_plus', 'sell').ok);
  assert.equal(-cat(s, 'tenant_deposit_refund').reduce((a, e) => a + e.amount, 0), dep);
  assert.equal(overview(s).liabilities.tenantDeposits, 0);
});

test('repairs: seeded months only, charged once, tagged to the property, in its report', () => {
  const s = rich();
  buyProperty(s, 'home_family', 'b');
  const months = [];
  for (let i = 0; i < 36; i++) { toFirst(s); if (hash01('repair', 'home_family', monthKey(s.day)) < REPAIRS.chance) months.push(monthKey(s.day)); }
  const rep = cat(s, 'repair', e => e.prop === 'home_family');
  assert.deepEqual(rep.map(e => e.ref), months.map(m => `repair-home_family-${m}`));
  assert.ok(rep.every(e => e.deal === s.properties.home_family.uid && -e.amount === Math.round(PROPERTIES.home_family.upkeep * REPAIRS.factor / 100) * 100));
  assert.ok(months.length > 0, 'the seed gives at least one repair in 3 years');
  const n = s.ledger.length; runDay(s);
  assert.equal(s.ledger.slice(n).filter(e => e.amount).length, 0, 'replaying the 1st repeats nothing');
  const r = propertyReport(s, s.properties.home_family, 'home_family');
  assert.equal(r.rental.repairs, -rep.reduce((a, e) => a + e.amount, 0));
  assert.equal(r.economic.rentalNet, r.rental.rent + r.rental.keptRent + r.rental.keptDamage - r.rental.upkeep - r.rental.repairs);
});

// ================================================================== neighbourhood markets
test('neighbourhoods behave differently: each rises and falls, none always leads, moves capped at ±3%', () => {
  const hoods = Object.keys(NEIGHBOURHOODS), leaders = new Set(), laggards = new Set();
  for (let y = 1; y <= 15; y++) {
    const ch = hoods.map(h => [h, hoodChange(h, y * 365).change]).sort((a, b) => b[1] - a[1]);
    leaders.add(ch[0][0]); laggards.add(ch.at(-1)[0]);
  }
  assert.ok(leaders.size >= 3, `different areas lead in different years: ${[...leaders]}`);
  assert.ok([...leaders].some(h => laggards.has(h)), 'a leader in one year lags in another');
  for (const h of hoods) {
    const yearly = Array.from({ length: 15 }, (_, y) => hoodChange(h, (y + 1) * 365).change);
    assert.ok(yearly.some(c => c > 0) && yearly.some(c => c < 0), `${h} has both rising and falling years`);
    for (let d = 31; d < 15 * 365; d += 30) assert.ok(Math.abs(hoodIndex(h, d) / hoodIndex(h, d - 30) - 1) <= 0.0301, `${h} no wild jump at ${d}`);
  }
});

test('market: deterministic, independent of evaluation order; declines and recoveries reach every area', () => {
  const a = hoodIndex('premium', 4000), b = hoodIndex('budget', 5000);
  assert.equal(hoodIndex('premium', 4000), a); assert.equal(hoodIndex('budget', 5000), b);
  let d = 0; while (!(marketPhase(d) === 'decline' && market(d).inPhase === 0)) d += 1;
  let e = d; while (marketPhase(e) === 'decline') e += 1;
  for (const h of Object.keys(NEIGHBOURHOODS)) assert.ok(hoodIndex(h, e - 1) < hoodIndex(h, d), `${h} fell during the city decline`);
  let r = e; while (marketPhase(r) === 'recovery') r += 1;
  assert.ok(Object.keys(NEIGHBOURHOODS).filter(h => hoodIndex(h, r - 1) > hoodIndex(h, e)).length >= 3, 'most areas recover');
});

test('valuation history: recorded monthly from the purchase, never rewritten', () => {
  const s = rich();
  buyProperty(s, 'home_large', 'b');
  const p = s.properties.home_large;
  assert.deepEqual(p.valuations, [{ month: monthKey(0), value: p.marketAtPurchase }]);
  for (let i = 0; i < 14; i++) toFirst(s);
  assert.equal(p.valuations.length, 15);
  const snap = JSON.stringify(p.valuations.slice(0, 15));
  p.valuations.forEach((v, i) => { if (i) assert.equal(v.value, propertyValue('home_large', addMonths(0, i))); });
  runDay(s); toFirst(s);
  assert.equal(JSON.stringify(p.valuations.slice(0, 15)), snap, 'earlier entries unchanged');
});

// ================================================================== accounting
test('cash flow and economic return agree: mortgage + equity loan + tenants + sale', () => {
  const s = rich(300000);
  buyProperty(s, 'home_family', 'b', { downPct: 0.5, years: 15 });   // half down leaves equity to borrow against
  listForRent(s, 'home_family');
  for (let i = 0; i < 4; i++) toFirst(s);
  assert.ok(takeEquityLoan(s, 'home_family', 200000, 5, 'eq').ok);
  for (let i = 0; i < 20; i++) toFirst(s);
  advanceDays(s, 9);
  const open = propertyReport(s, s.properties.home_family, 'home_family');
  assert.equal(open.economic.realised, false);
  assert.equal(open.cash.result, open.economic.profit, 'estimate: cash to date + if-sold-today = economic estimate');
  assert.ok(open.loans.equityDrawn === 200000 && open.cash.in >= 200000, 'borrowed money shows as cash in…');
  assert.ok(open.economic.appreciation === open.exit.value - open.price, '…but never as profit');
  assert.equal(securedOn(s, 'home_family')[0].kind, 'mortgage', 'mortgage is the first charge');
  assert.ok(sellProperty(s, 'home_family', 'sell').ok);
  const sold = propertyReport(s, s.propertyHistory[0]);
  assert.equal(sold.economic.realised, true);
  assert.equal(sold.cash.result, sold.economic.profit, 'realised: every rupee in and out = the economic result');
  assert.equal(sold.cash.debtStillOwed, 0);
  assert.ok(sold.loans.principalRepaid > 0 && sold.economic.financing === sold.loans.interestPaid + sold.loans.capitalised + sold.loans.lateFees);
});

test('net worth counts deposits once: yours as an asset, your tenants\' as a liability', () => {
  const s = rich();
  letOut(s);
  rentHome(s, 'home_starter', 'r');
  const o = overview(s);
  assert.equal(o.assets.rentDeposit, s.housing.deposit);
  assert.equal(o.liabilities.tenantDeposits, s.properties.home_apartment_plus.tenant.deposit);
  assert.equal(o.netWorth, o.totalAssets - o.totalLiabilities);
  const nw = o.netWorth; deposit_roundtrip: {
    const g = JSON.parse(JSON.stringify(s)); rentHome(g, 'home_large', 'r2');   // pay a new deposit, get the old one back
    const o2 = overview(g), rent = g.housing.rent;
    assert.equal(o2.netWorth, nw - rent, 'only the first month\'s rent changes net worth, not the deposits');
  }
});

// ================================================================== loan engine
test('loans: schedules never go negative; zero-rate exact; prepayment and early payoff with accrued interest', () => {
  for (let i = 0; i < 200; i++) {
    const P = 10000 + Math.floor(hash01('P', i) * 5e6), r = [0, 0.05, 0.085, 0.1, 0.12][i % 5], n = 1 + Math.floor(hash01('n', i) * 240);
    const rows = schedule(P, r, n);
    assert.ok(rows.every(x => x.balance >= 0) && rows.at(-1).balance === 0, `P=${P} r=${r} n=${n}`);
    assert.equal(rows.reduce((a, x) => a + x.principal, 0), P);
  }
  assert.deepEqual(schedule(1200, 0, 12).map(x => x.emi), Array(12).fill(100));
  const s = rich();
  buyProperty(s, 'home_starter', 'b', { downPct: 0.2, years: 20 });
  toFirst(s);
  const l = s.loans[0], emi0 = l.emi, bal = l.balance;
  assert.ok(prepay(s, l.uid, 100000, 'p1').ok);
  assert.equal(l.balance, bal - 100000); assert.equal(l.emi, emi0, 'same EMI, ends sooner');
  advanceDays(s, 12);
  const acc = accruedInterest(l, s.day);
  assert.ok(acc > 0);
  assert.equal(prepay(s, l.uid, l.balance, 'p2').reason, 'pay_full_payoff');
  const cash0 = spendable(s);
  const r = prepay(s, l.uid, 99999999, 'p3');
  assert.ok(r.ok && r.closed);
  assert.equal(cash0 - spendable(s), bal - 100000 + acc, 'payoff = balance + accrued interest');
  assert.equal(l.balance, 0); assert.equal(l.status, 'closed');
  assert.equal(prepay(s, l.uid, 1000, 'p4').reason, 'not_active');
});

test('loans: a missed EMI capitalises interest + fee and extends the term; the rate stays fixed when offers change', () => {
  const s = rich(100000, 3000000);
  buyProperty(s, 'home_starter', 'b', { downPct: 0.2, years: 20 });
  const l = s.loans[0], rate = l.rate, emi0 = l.emi, months = l.months;
  const keep = spendable(s); drain(s);
  const bal = l.balance; toFirst(s);
  const interest = Math.round(bal * rate / 12);
  assert.equal(l.balance, bal + interest + LENDING_RULES.lateFee);
  assert.equal(l.interestCapitalised, interest); assert.equal(l.months, months + 1);
  give(s, keep);
  s.credit.defaults.push({ day: s.day }, { day: s.day });       // the bank would no longer lend…
  assert.equal(mortgageQuote(s, 'home_family', 0.2, 20).rate, null);
  toFirst(s);
  assert.equal(l.rate, rate); assert.equal(l.emi, emi0, '…but the existing loan keeps its rate and EMI');
  assert.equal(-cat(s, 'emi', e => e.loan === l.uid).at(-1).amount, emi0);
});

test('loans: equity on top of a mortgage counts every secured balance; credit improves with on-time EMIs and drops on default', () => {
  const s = rich(300000);
  buyProperty(s, 'home_family', 'b', { downPct: 0.5, years: 15 });
  const q1 = equityQuote(s, 'home_family', 100000, 5);
  assert.equal(q1.maxLoan, Math.floor((propertyValue('home_family', s.day) * 0.6 - s.loans[0].balance) / 1000) * 1000);
  assert.ok(takeEquityLoan(s, 'home_family', q1.maxLoan, 5, 'e1').ok);
  const q2 = equityQuote(s, 'home_family', 1000, 5);
  assert.ok(q2.maxLoan < 1000 && !q2.ok, 'the same equity cannot be borrowed twice');
  const sc0 = creditProfile(s).score;
  for (let i = 0; i < 6; i++) toFirst(s);
  assert.ok(creditProfile(s).score > sc0, 'on-time EMIs build the profile');
  s.credit.defaults.push({ day: s.day });
  assert.ok(creditProfile(s).score <= sc0 + 24 - 200);
});

// ================================================================== courses (supplied material)
function docxParagraphs(path) {
  const buf = readFileSync(path);
  let eocd = buf.length - 22; while (buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
    const nameLen = buf.readUInt16LE(off + 28), extra = buf.readUInt16LE(off + 30), comment = buf.readUInt16LE(off + 32);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen), local = buf.readUInt32LE(off + 42);
    if (name === 'word/document.xml') {
      const size = buf.readUInt32LE(off + 20), method = buf.readUInt16LE(off + 10);
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), data = buf.subarray(start, start + size);
      const xml = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
      return xml.split('</w:p>').map(p => [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:br\/>/g)].map(m => m[1] ?? ' ').join(''))
        .map(t => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim()).filter(Boolean);
    }
    off += 46 + nameLen + extra + comment;
  }
  throw new Error('no document.xml');
}
const docPath = c => new URL(`../Assets/supplied-ui/${c.source}`, import.meta.url);

test('courses: every paragraph, list item and table cell of the four documents is in the game, verbatim', () => {
  assert.equal(COURSES.length, 4);
  for (const c of COURSES) {
    const game = JSON.stringify(c).replace(/\\n/g, ' ').replace(/\s+/g, ' ');
    // structure the importer turns into fields: section names, the glossary header row, question
    // numbers, option letters and the "Answer:" label (checked exactly in the next test)
    const structural = /^(Learning objectives|Learning outcomes|Knowledge check|Glossary|Term|Definition|Meaning)$|^Answer key:/i;
    const stored = p => p.replace(/^\d+\.\s+/, '').replace(/^[A-Z]\.\s+/, '').replace(/^Answer:\s+/, '');
    const missing = docxParagraphs(docPath(c)).filter(p => !structural.test(p) && !game.includes(JSON.stringify(stored(p)).slice(1, -1)));
    assert.deepEqual(missing, [], `${c.source}: nothing omitted`);
  }
});

test('courses: questions and answer keys come from the documents; open questions keep their model answers', () => {
  for (const c of COURSES) {
    const doc = docxParagraphs(docPath(c));
    const keyLine = doc.find(p => p.startsWith('Answer key:'));
    if (c.check.type === 'choice') {
      assert.ok(keyLine, `${c.source} has an answer key`);
      assert.deepEqual(c.check.questions.map((q, i) => `${i + 1}-${q.answer}`).join(', '), keyLine.replace('Answer key: ', '').replace(/\.$/, ''));
      for (const q of c.check.questions) assert.ok(q.options.length >= 2 && q.options.every(o => doc.includes(`${o.key}. ${o.text}`)));
    } else {
      assert.equal(keyLine, undefined);
      for (const q of c.check.questions) assert.ok(doc.includes(`Answer: ${q.model}`), q.q);
    }
    for (const q of c.check.questions) assert.ok(doc.some(p => p.endsWith(q.q)), q.q);
  }
  assert.deepEqual(COURSES.map(c => [c.check.type, c.check.questions.length]), [['choice', 6], ['choice', 8], ['open', 10], ['open', 10]]);
});

test('course progress: study + pass completes a course once; open checks need reveal + self-mark; persists; legacy kept', () => {
  const s = newGame();
  s.academy.lessons.budgeting = { attempts: 1, bestScore: 1, passed: true, completedDay: 3 };    // a pre-Round-5 record
  const c1 = COURSES[0];
  assert.deepEqual(courseProgress(s, c1.id).legacy.map(l => l.id), ['budgeting']);
  assert.equal(LEGACY_LESSONS.budgeting.course, 'core01');
  c1.lessons.forEach((_, i) => markStudied(s, c1.id, i));
  markStudied(s, c1.id, 0);
  assert.equal(courseProgress(s, c1.id).complete, false, 'check not passed yet');
  const r = submitCheck(s, c1.id, c1.check.questions.map(q => q.answer));
  assert.ok(r.passed && r.completed);
  assert.equal(submitCheck(s, c1.id, c1.check.questions.map(q => q.answer)).completed, false, 'completed only once');
  assert.equal(s.events.filter(e => e.type === 'academy' && /Completed course/.test(e.text)).length, 1);
  const fb = r.results[0];
  assert.deepEqual([fb.correct, fb.answer], [true, c1.check.questions[0].answer]);
  const c3 = COURSES[2], n = c3.check.questions.length;
  assert.equal(submitCheck(s, c3.id, Array(n).fill({ text: 'x', self: 'got' })).reason, 'incomplete', 'must reveal the model answer first');
  const need = Math.ceil(PASS_MARK * n);
  const ans = Array.from({ length: n }, (_, i) => ({ text: 'my answer', revealed: true, self: i < need ? 'got' : 'missed' }));
  const r3 = submitCheck(s, c3.id, ans);
  assert.equal(r3.correct, need); assert.ok(r3.passed); assert.ok(r3.results.every(x => x.model));
  saveNote(s, c3.id, 'portfolio', JSON.stringify({ v: [50, 30, 20], why: 'long-term goal' }));
  const st = mem(); saveGame(st, s);
  const back = loadGame(st);
  assert.deepEqual(back.academy, s.academy, 'progress, notes and the legacy record survive a reload');
  assert.equal(courseProgress(back, c1.id).complete, true);
  assert.deepEqual(back.brokerage, { holdings: {}, trades: [] }, 'learning never touches money or investments');
  assert.deepEqual(courseRecord(back, c1.id).studied[0], courseRecord(s, c1.id).studied[0]);
});

// ================================================================== migration
test('a real Round 4 save migrates: money, mortgage, tenant, FD, furniture, academy kept; nothing charged', () => {
  const raw = readFileSync(new URL('./fixtures/round4_save.json', import.meta.url), 'utf8');
  const old = JSON.parse(raw), st = mem(); st.setItem('vanquest.save.v1', raw);
  assert.equal(old.version, 3);
  const s = loadGame(st);
  assert.equal(s.version, SAVE_VERSION);
  const money = x => x.ledger.filter(e => e.status === 'ok').reduce((a, e) => a + e.amount, 0);
  assert.equal(money(s), money(old), 'no money created or charged by the upgrade');
  assert.equal(s.ledger.length, old.ledger.length);
  for (const k of ['furniture', 'wardrobe', 'vehicles', 'pantry', 'groceryPlan', 'brokerage', 'bank']) assert.deepEqual(s[k], old[k], k);
  assert.deepEqual(s.academy, { ...old.academy, courses: {} });
  assert.equal(s.loans[0].rate, old.loans[0].rate); assert.equal(s.loans[0].balance, old.loans[0].balance);
  assert.equal(s.loans[0].interestCapitalised, 0);
  const t = s.properties.home_apartment_plus.tenant;
  assert.ok(t && t.deposit === 0 && t.reliable);
  const lastRent = old.ledger.filter(e => e.category === 'rent_income').at(-1).amount;
  assert.equal(Math.round(t.rent * 0.95), lastRent, 'the tenant keeps paying what they paid');
  assert.ok(s.properties.home_starter.valuations.length === 1);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))), s, 'migrating twice is a no-op');
  const n = s.ledger.length;
  toFirst(s);
  const fresh = s.ledger.slice(n);
  assert.equal(fresh.filter(e => e.category === 'rent_income').length, 1);
  assert.equal(fresh.filter(e => e.category === 'emi' && e.status === 'ok').length, 1);
  const oldRefs = new Set(s.ledger.slice(0, n).map(e => e.ref).filter(Boolean));
  assert.deepEqual(fresh.filter(e => e.ref && oldRefs.has(e.ref)), [], 'nothing after the upgrade repeats an earlier charge');
});
