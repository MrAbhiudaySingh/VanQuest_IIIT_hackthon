// Round 4: bank, FDs, loans & mortgages, home-equity, credit, housing market, property reports,
// net worth, one-engine idempotency, year skip, Round 3 save migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, loadGame, saveGame, migrate, SAVE_VERSION, OPENING_BALANCE } from '../src/sim/state.js';
import { balance, spendable } from '../src/sim/ledger.js';
import { advanceDays, runDay, daysInNextYear } from '../src/sim/clock.js';
import { deposit, withdraw, openFD, breakFD, fdMaturityValue, fdEarlyValue, fdAccruedValue } from '../src/sim/bank.js';
import { emi, schedule, mortgageQuote, equityQuote, takeEquityLoan, prepay, accruedInterest } from '../src/sim/loans.js';
import { creditProfile } from '../src/sim/credit.js';
import { buyProperty, sellProperty, moveIn, listForRent, buyCost, rentHome } from '../src/sim/property.js';
import { propertyValue, marketIndex, marketPhase, askingPrice, market } from '../src/sim/housingMarket.js';
import { propertyReport } from '../src/sim/propertyReport.js';
import { overview } from '../src/sim/networth.js';
import { buyVehicle } from '../src/sim/vehicles.js';
import { purchase } from '../src/sim/inventory.js';
import { savePlan } from '../src/sim/groceryPlan.js';
import { Game } from '../src/sim/game.js';
import { ITEMS } from '../src/data/catalog.js';
import { SAVINGS, FD_TERMS } from '../src/data/banking.js';
import { LENDING_RULES } from '../src/data/lending.js';
import { nextMonthStart, monthKey, addMonths } from '../src/sim/util.js';

const toFirst = s => advanceDays(s, nextMonthStart(s.day) - s.day);
const stock = (s, days = 1500) => { for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'grocery') s.pantry[id] = Math.ceil(days * it.usePerDay) + 1; return s; };
const give = (s, amount, account = 'wallet') => { s.ledger.push({ id: s.nextId++, day: s.day, account, amount, category: 'test', memo: 'test funds', status: 'ok' }); return s; };
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const cat = (s, c, status = 'ok') => s.ledger.filter(e => e.category === c && e.status === status);
const raise = (s, salary) => { s.job.salary = salary; return s; };

// ------------------------------------------------------------------ deposits & withdrawals
test('deposit / withdraw move money between cash and savings, never create it', () => {
  const s = newGame();
  const total = () => balance(s) + balance(s, 'bank');
  assert.ok(deposit(s, 10000, 'd1').ok);
  assert.deepEqual([balance(s), balance(s, 'bank'), total()], [OPENING_BALANCE - 10000, 10000, OPENING_BALANCE]);
  assert.equal(deposit(s, 10000, 'd1').reason, 'duplicate');
  assert.equal(deposit(s, 99999, 'd2').reason, 'insufficient_funds');
  assert.equal(deposit(s, -5, 'd3').reason, 'invalid_amount');
  assert.equal(deposit(s, 1.5, 'd4').reason, 'invalid_amount');
  assert.ok(withdraw(s, 4000, 'w1').ok);
  assert.equal(withdraw(s, 7000, 'w2').reason, 'insufficient_funds');
  assert.equal(total(), OPENING_BALANCE);
});

test('bills draw on cash first, then savings', () => {
  const s = newGame();
  deposit(s, 14000, 'd');                        // ₹1,000 cash, ₹14,000 savings
  assert.equal(spendable(s), OPENING_BALANCE);
  assert.ok(purchase(s, 'market_electronics', { router: 1 }, 'p').ok);   // ₹1,899
  assert.deepEqual([balance(s), balance(s, 'bank')], [0, 14000 - 899]);
});

// ------------------------------------------------------------------ savings interest
test('savings interest accrues on daily closing balances and is credited quarterly', () => {
  const s = stock(newGame());
  deposit(s, 10000, 'd');
  advanceDays(s, 91);                             // 1 Jul → 30 Sep: accrued, not yet credited
  assert.equal(cat(s, 'interest').length, 0);
  const expectedAccrual = 10000 * SAVINGS.rate / 365 * 91;
  assert.ok(Math.abs(s.bank.accrued - expectedAccrual) < 0.01, `accrued ${s.bank.accrued}`);
  advanceDays(s, 1);                              // 1 Oct: credited before that day's accrual
  const credit = cat(s, 'interest');
  assert.equal(credit.length, 1);
  assert.equal(credit[0].amount, Math.floor(10000 * SAVINGS.rate / 365 * 91), '91 closing balances (2 Jul … 30 Sep)');
  advanceDays(s, 91);                             // to 31 Dec, next credit on 1 Jan includes compounding
  advanceDays(s, 1);
  const second = cat(s, 'interest')[1].amount;
  assert.ok(second >= credit[0].amount, 'balance now includes last quarter\'s interest');
  assert.equal(s.bank.interestToDate, credit[0].amount + second);
});

// ------------------------------------------------------------------ fixed deposits
test('FD: funded from savings, pays principal + quarterly-compounded interest once at maturity', () => {
  const s = stock(newGame());
  deposit(s, 15000, 'd');
  assert.equal(openFD(s, 4000, 1, 'f0').reason, 'below_minimum');
  assert.equal(openFD(s, 20000, 1, 'f0b').reason, 'insufficient_funds');
  const { fd } = openFD(s, 10000, 1, 'f1');                   // 12 months @ 6.75%
  assert.equal(balance(s, 'bank'), 5000, 'the money left savings — it cannot be spent twice');
  assert.equal(balance(s, 'fd'), 10000);
  assert.equal(fd.expected, Math.round(10000 * Math.pow(1 + 0.0675 / 4, 4)));
  assert.equal(fd.maturityDay, addMonths(0, 12));
  advanceDays(s, fd.maturityDay - 1);
  assert.equal(fd.status, 'active');
  advanceDays(s, 1);
  assert.equal(fd.status, 'matured');
  assert.equal(balance(s, 'fd'), 0);
  assert.equal(cat(s, 'interest').filter(e => e.memo.includes(fd.uid)).length, 1);
  const bankAfter = balance(s, 'bank');
  runDay(s);                                                   // re-processing the same date…
  advanceDays(s, 30);
  assert.equal(cat(s, 'interest').filter(e => e.memo.includes(fd.uid)).length, 1, '…never pays twice');
  assert.ok(balance(s, 'bank') >= bankAfter);
});

test('FD premature withdrawal earns rate − 1% for time held, never below principal', () => {
  const s = stock(newGame());
  deposit(s, 15000, 'd');
  const { fd } = openFD(s, 10000, 3, 'f');                     // 36 months @ 7.25%
  assert.equal(fdEarlyValue(fd, 10), 10000 + Math.round(10000 * 0.0625 * 10 / 365), 'simple interest inside the first quarter');
  advanceDays(s, 200);
  const v = fdEarlyValue(fd, s.day);
  const q = 2, rest = s.day - addMonths(0, 6);
  assert.equal(v, Math.round(10000 * Math.pow(1 + 0.0625 / 4, q) * (1 + 0.0625 * rest / 365)));
  assert.ok(v < fdAccruedValue(fd, s.day), 'the penalty costs something');
  const before = balance(s, 'bank');
  assert.ok(breakFD(s, fd.uid, 'b1').ok);
  assert.equal(balance(s, 'bank'), before + v);
  assert.equal(breakFD(s, fd.uid, 'b2').reason, 'not_active', 'no double payout');
  assert.equal(fdMaturityValue(10000, 0, 12), 10000, 'zero-rate edge case');
});

// ------------------------------------------------------------------ EMI & amortisation
test('EMI formula, zero-interest loans and a genuine amortisation schedule', () => {
  assert.equal(emi(1000000, 0.085, 240), 8678);                // standard reducing-balance EMI
  assert.equal(emi(120000, 0, 12), 10000, 'zero interest = P/n');
  const rows = schedule(1000000, 0.085, 240);
  assert.equal(rows.length, 240);
  assert.equal(rows.at(-1).balance, 0);
  assert.equal(rows.reduce((s, r) => s + r.principal, 0), 1000000, 'principal repaid exactly');
  assert.equal(rows[0].interest, Math.round(1000000 * 0.085 / 12));
  assert.ok(rows[0].interest > rows[100].interest, 'interest share falls over time');
  const z = schedule(120000, 0, 12);
  assert.ok(z.every(r => r.interest === 0) && z.at(-1).balance === 0);
});

// ------------------------------------------------------------------ mortgages
test('mortgage eligibility: LTV, income (FOIR), cash and credit — with reasons and tips', () => {
  const s = newGame();
  let q = mortgageQuote(s, 'home_starter', 0.10, 20);
  assert.equal(q.ok, false);
  assert.ok(q.reasons.some(r => /income/.test(r)), 'a ₹10,000 salary cannot carry this EMI');
  assert.ok(q.reasons.some(r => /up front/.test(r)));
  assert.ok(q.tips.length);
  raise(give(s, 600000), 60000);
  q = mortgageQuote(s, 'home_starter', 0.10, 20);
  assert.ok(q.ok, q.reasons.join('; '));
  assert.equal(q.principal, Math.round(q.price * 0.9));
  assert.equal(q.emi, emi(q.principal, q.rate, 240));
  assert.equal(q.cashNeeded, q.down + q.duty + q.fee);
  assert.equal(q.totalRepay, q.principal + q.totalInterest);
  assert.equal(mortgageQuote(s, 'home_luxury', 0.10, 20).ok, false, 'big loans need bigger down payments (75% LTV)');
  assert.ok(mortgageQuote(s, 'home_luxury', 0.10, 20).reasons.some(r => /at most 75%/.test(r)));
});

test('mortgage purchase: loan pays the seller, you pay down + duty + fee; EMIs amortise monthly, once', () => {
  const s = stock(raise(give(newGame(), 600000), 60000));
  const q = mortgageQuote(s, 'home_starter', 0.2, 10);
  const before = spendable(s);
  const r = buyProperty(s, 'home_starter', 't1', { downPct: 0.2, years: 10 });
  assert.ok(r.ok);
  assert.equal(spendable(s), before - q.cashNeeded, 'only down + stamp duty + fee came out of your money');
  const loan = s.loans[0];
  assert.deepEqual([loan.kind, loan.propertyId, loan.balance, loan.emi], ['mortgage', 'home_starter', q.principal, q.emi]);
  assert.equal(s.properties.home_starter.loanUid, loan.uid);
  toFirst(s);
  const rows = schedule(q.principal, q.rate, q.months);
  assert.equal(loan.balance, rows[0].balance, 'balance after EMI 1 matches the schedule');
  runDay(s);                                                   // same date again: no second EMI
  assert.equal(cat(s, 'emi').length, 1);
  for (let i = 0; i < 11; i++) toFirst(s);
  assert.equal(cat(s, 'emi').length, 12);
  assert.equal(loan.balance, rows[11].balance);
  assert.equal(loan.interestPaid, rows.slice(0, 12).reduce((a, x) => a + x.interest, 0));
  const st = mem(); saveGame(st, s);
  assert.deepEqual(loadGame(st).loans, s.loans, 'loan persists');
});

test('missed EMIs: recorded, interest + late fee added, recovery possible, 3 in a row → default', () => {
  const s = stock(raise(give(newGame(), 600000), 60000));
  buyProperty(s, 'home_starter', 't', { downPct: 0.2, years: 10 });
  const loan = s.loans[0];
  const drain = () => s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: -balance(s), category: 'test', memo: 'drain', status: 'ok' });
  const salary = s.job.salary; s.job.salary = 0; drain();
  const b0 = loan.balance, interest = Math.round(b0 * loan.rate / 12);
  toFirst(s);
  assert.equal(cat(s, 'emi', 'failed').length, 1);
  assert.equal(loan.balance, b0 + interest + LENDING_RULES.lateFee);
  assert.equal(loan.missed, 1);
  assert.ok(creditProfile(s).factors.find(f => /Missed EMIs/.test(f.label)).points < 0);
  s.job.salary = salary;                                        // income returns → recovery
  toFirst(s);
  assert.equal(loan.missed, 0, 'an on-time payment resets the consecutive count');
  s.job.salary = 0; drain();
  toFirst(s); drain(); toFirst(s); drain(); toFirst(s);
  assert.equal(loan.status, 'defaulted');
  assert.equal(s.properties.home_starter, undefined, 'collateral sold by the bank');
  assert.equal(s.credit.defaults.length, 1);
  assert.ok(cat(s, 'repossession').length === 1);
  assert.ok(balance(s) >= 0);
});

test('selling a mortgaged property repays the loan from the proceeds; negative equity blocks the sale', () => {
  const s = stock(raise(give(newGame(), 3000000), 80000));
  buyProperty(s, 'home_starter', 't', { downPct: 0.1, years: 20 });
  rentHome(s, 'home_apartment', 'r');
  toFirst(s);
  const loan = s.loans[0], debt = loan.balance, before = spendable(s);
  const value = propertyValue('home_starter', s.day), net = value - Math.round(value * 0.02);
  const r = sellProperty(s, 'home_starter', 'sell');
  assert.ok(r.ok);
  assert.equal(r.settled, debt);
  assert.equal(loan.status, 'closed');
  assert.equal(loan.balance, 0);
  assert.equal(spendable(s), before + net - debt);
  assert.equal(s.propertyHistory.length, 1);
  // negative equity: the loan has grown (e.g. capitalised missed EMIs) past what a sale would raise
  const t = stock(raise(give(newGame(), 300000), 80000));
  buyProperty(t, 'home_apartment_plus', 'x', { downPct: 0.1, years: 20 });
  rentHome(t, 'home_apartment', 'r2');
  t.loans[0].balance = propertyValue('home_apartment_plus', t.day) + 50000;
  t.ledger.push({ id: t.nextId++, day: t.day, account: 'wallet', amount: -balance(t), category: 'test', memo: 'drain', status: 'ok' });
  const sale = sellProperty(t, 'home_apartment_plus', 's2');
  assert.equal(sale.reason, 'negative_equity');
  assert.ok(t.properties.home_apartment_plus, 'still yours');
});

// ------------------------------------------------------------------ home-equity loans
test('home-equity loan: LTV against value minus existing secured debt; no repeated borrowing of the same equity', () => {
  const s = stock(raise(give(newGame(), 3000000), 150000));
  buyProperty(s, 'home_starter', 'cash');                      // fully paid
  const free = equityQuote(s, 'home_starter', 100000, 5);
  assert.equal(free.maxLoan, Math.floor(propertyValue('home_starter', s.day) * 0.6 / 1000) * 1000);
  assert.ok(free.ok);
  const toobig = equityQuote(s, 'home_starter', free.maxLoan + 1000, 5);
  assert.equal(toobig.ok, false);
  const bank0 = balance(s, 'bank'), money0 = spendable(s), fee = equityQuote(s, 'home_starter', free.maxLoan, 5).fee;
  assert.equal(fee, Math.round(free.maxLoan * 0.01), '1% of the amount borrowed');
  assert.ok(takeEquityLoan(s, 'home_starter', free.maxLoan, 5, 'e1').ok);
  assert.equal(balance(s, 'bank'), bank0 + free.maxLoan, 'paid into savings');
  assert.equal(spendable(s), money0 + free.maxLoan - fee, 'the fee comes out of your money');
  assert.equal(equityQuote(s, 'home_starter', 1000, 5).maxLoan, 0, 'the equity is already borrowed against');
  assert.equal(takeEquityLoan(s, 'home_starter', free.maxLoan, 5, 'e1').reason, 'duplicate');
  // a mortgaged property supports less
  const m = stock(raise(give(newGame(), 3000000), 150000));
  buyProperty(m, 'home_starter', 'mort', { downPct: 0.5, years: 10 });
  assert.ok(equityQuote(m, 'home_starter', 1000, 5).maxLoan < free.maxLoan);
  assert.equal(equityQuote(m, 'home_luxury', 1000, 5).ok, false, 'not owned');
});

test('net worth: a loan raises assets and liabilities equally, never income', () => {
  const s = stock(raise(give(newGame(), 3000000), 150000));
  buyProperty(s, 'home_starter', 'cash');
  const before = overview(s);
  const q = equityQuote(s, 'home_starter', 200000, 5);
  takeEquityLoan(s, 'home_starter', 200000, 5, 'e');
  const after = overview(s);
  assert.equal(after.totalLiabilities - before.totalLiabilities, 200000);
  assert.equal(after.netWorth, before.netWorth - q.fee, 'net worth only falls by the fee');
  assert.equal(after.flows.salary, before.flows.salary);
  assert.equal(after.flows.loanProceeds, 200000, 'shown as loan proceeds, separately from income');
  const sum = o => Object.values(o).reduce((a, v) => a + v, 0);
  assert.equal(after.totalAssets, sum(after.assets));
  assert.equal(after.netWorth, after.totalAssets - after.totalLiabilities);
  deposit(s, 1000, 'd'); openFD(s, 5000, 0, 'f');
  assert.equal(overview(s).netWorth, after.netWorth, 'moving money between accounts changes nothing');
});

// ------------------------------------------------------------------ credit profile
test('credit profile is transparent: factors add up to the score and change with behaviour', () => {
  const s = stock(raise(give(newGame(), 600000), 60000));
  let p = creditProfile(s);
  assert.equal(p.score, p.factors.reduce((a, f) => a + f.points, 0));
  assert.equal(p.tier.name, 'Fair');
  buyProperty(s, 'home_starter', 't', { downPct: 0.2, years: 10 });
  for (let i = 0; i < 12; i++) toFirst(s);
  p = creditProfile(s);
  assert.ok(p.score > 700, 'on-time EMIs build the profile');
  const rateGood = mortgageQuote(s, 'home_family', 0.5, 10).rate;
  const t = stock(raise(give(newGame(), 600000), 60000));
  t.credit.defaults.push({ day: 0 });
  assert.equal(creditProfile(t).tier.name, 'Very poor');
  assert.equal(mortgageQuote(t, 'home_starter', 0.5, 10).ok, false);
  assert.ok(mortgageQuote(t, 'home_starter', 0.5, 10).reasons.some(r => /credit profile/.test(r)));
  assert.ok(rateGood <= 0.085, 'a good profile is offered the base rate or better');
});

// ------------------------------------------------------------------ housing market
test('housing market: deterministic phases, values fall in declines and rise in recoveries', () => {
  const seen = new Set();
  let declineDrop = null, recoveryRise = null;
  for (let d = 0; d < 3650; d += 30) {
    seen.add(marketPhase(d));
    if (marketPhase(d) === 'decline' && marketPhase(d + 30) === 'decline') declineDrop ??= propertyValue('home_large', d + 31) < propertyValue('home_large', d);
    if (marketPhase(d) === 'recovery' && marketPhase(d + 30) === 'recovery') recoveryRise ??= propertyValue('home_large', d + 31) > propertyValue('home_large', d);
  }
  assert.deepEqual([...seen].sort(), ['decline', 'growth', 'recovery', 'stable']);
  assert.equal(declineDrop, true);
  assert.equal(recoveryRise, true);
  assert.equal(marketIndex(1000), marketIndex(1000), 'same day → same index');
  const premium = Object.values({ a: 1 }) && [propertyValue('home_luxury', 0), askingPrice('home_luxury', 0)];
  assert.ok(Math.abs(premium[1] / premium[0] - 1) < 0.08, 'asking prices stay near the estimate');
});

test('buying in a boom and selling in the slump that follows loses money; the report explains why', () => {
  const s = stock(raise(give(newGame(), 9000000), 300000));
  let d = 0; while (!(marketPhase(d) === 'growth' && market(d).inPhase >= 8)) d += 30;        // late boom
  advanceDays(s, d);
  buyProperty(s, 'home_large', 'boom');
  rentHome(s, 'home_apartment', 'r');
  while (marketPhase(s.day) !== 'decline' || market(s.day).inPhase < 4) toFirst(s);
  const rec = s.properties.home_large;
  const r1 = propertyReport(s, rec, 'home_large');
  assert.ok(r1.drivers.find(x => x.key === 'market').label.includes('Growth'));
  sellProperty(s, 'home_large', 'sold');
  const r = propertyReport(s, s.propertyHistory[0]);
  assert.ok(r.profit < 0, `lost money (${r.profit})`);
  // Round 5 report: realised economic return, and the cash record agrees with it to the rupee
  assert.equal(r.economic.realised, true);
  assert.equal(r.economic.profit, r.profit);
  assert.equal(r.cash.result, r.economic.profit, 'cash in/out (incl. the sale) = appreciation − costs − interest + net rent');
  assert.equal(r.economic.appreciation, s.propertyHistory[0].sale.value - rec.price);
  assert.match(r.verdict, /lost/);
  assert.ok(r.drivers.find(x => x.key === 'costs').amount < 0);
});

test('property report: invested/returned come from the ledger, financing costs included', () => {
  const s = stock(raise(give(newGame(), 3000000), 120000));
  buyProperty(s, 'home_apartment_plus', 'm', { downPct: 0.2, years: 10 });
  listForRent(s, 'home_apartment_plus');
  for (let i = 0; i < 6; i++) toFirst(s);
  const rec = s.properties.home_apartment_plus, r = propertyReport(s, rec, 'home_apartment_plus');
  const deal = s.ledger.filter(e => e.deal === rec.uid && e.status === 'ok');
  const emis = deal.filter(e => e.category === 'emi').reduce((a, e) => a - e.amount, 0);
  const out = c => deal.filter(e => e.category === c && e.amount < 0).reduce((a, e) => a - e.amount, 0);
  assert.equal(r.loans.emis, emis);
  assert.equal(r.rental.rent, deal.filter(e => e.category === 'rent_income').reduce((a, e) => a + e.amount, 0));
  assert.ok(r.financed && r.loans.interestPaid > 0 && r.purchase.loanFees > 0);
  assert.equal(r.invested, r.purchase.down + r.purchase.loanFees + r.loans.emis + r.loans.prepaid + out('upkeep') + out('repair'));
  const l = s.loans[0], payoff = l.balance + accruedInterest(l, s.day);
  assert.equal(r.cash.exitEstimate, r.exit.value - Math.round(r.exit.value * 0.02) - (rec.arrears ?? 0) - r.rental.depositsHeld - payoff, 'estimated exit: value − fee − arrears − deposits − loan payoff');
  assert.equal(r.purchase.down, rec.price + rec.duty - l.principal, 'down payment + stamp duty');
  // principal repayments are cash out but not an economic cost; only interest is
  assert.equal(r.economic.financing, l.interestPaid + l.interestCapitalised + l.lateFees + accruedInterest(l, s.day));
  assert.ok(r.loans.principalRepaid > 0 && r.economic.financing < r.loans.emis);
  assert.equal(r.economic.realised, false, 'a held property is an estimate');
  assert.equal(r.cash.result, r.economic.profit);
});

test('cash purchase vs mortgage of the same home: financing costs show up in the report', () => {
  const run = financing => { const s = stock(raise(give(newGame(), 3000000), 120000)); buyProperty(s, 'home_starter', 'b', financing); rentHome(s, 'home_apartment', 'r'); for (let i = 0; i < 12; i++) toFirst(s); return propertyReport(s, s.properties.home_starter, 'home_starter'); };
  const cash = run(null), loan = run({ downPct: 0.2, years: 10 });
  assert.equal(cash.loans.interestPaid, 0);
  assert.ok(loan.loans.interestPaid > 0);
  assert.ok(loan.drivers.find(d => d.key === 'financing').amount < cash.drivers.find(d => d.key === 'financing').amount);
});

// ------------------------------------------------------------------ one engine, idempotent dates
test('processing the same 1st twice never duplicates any recurring transaction', () => {
  const s = stock(raise(give(newGame(), 3000000), 150000));
  buyProperty(s, 'home_starter', 'b', { downPct: 0.2, years: 10 }); moveIn(s, 'home_starter');
  buyProperty(s, 'home_apartment_plus', 'c'); listForRent(s, 'home_apartment_plus');
  buyVehicle(s, 'hatch', 'v'); deposit(s, 50000, 'd'); savePlan(s, { bread: 2 }, 'delivery');
  advanceDays(s, nextMonthStart(s.day) - s.day);                 // 1 Aug
  const n = s.ledger.length;
  runDay(s); runDay(s);                                          // replay 1 Aug twice
  const fresh = s.ledger.slice(n).filter(e => e.amount !== 0);
  assert.deepEqual(fresh, [], `no duplicate money movements: ${fresh.map(e => e.category)}`);
});

// ------------------------------------------------------------------ year skip with everything
test('year skip with a mortgage, FD, savings, tenant, car and plan: 12 of each, summary reconciles', () => {
  const g = new Game(mem());
  stock(g.state); raise(g.state, 150000); give(g.state, 3000000);
  const s = g.state;
  buyProperty(s, 'home_starter', 'b', { downPct: 0.2, years: 10 }); moveIn(s, 'home_starter');
  buyProperty(s, 'home_apartment_plus', 'c'); listForRent(s, 'home_apartment_plus');
  buyVehicle(s, 'hatch', 'v'); deposit(s, 100000, 'd'); openFD(s, 50000, 1, 'f');
  savePlan(s, { bread: 2 }, 'delivery');
  const { summary } = g.skipYear();
  const months = c => new Set(cat(s, c).map(e => monthKey(e.day))).size;
  assert.equal(cat(s, 'salary').length, 12); assert.equal(months('salary'), 12);
  assert.equal(cat(s, 'emi').length, 12); assert.equal(months('emi'), 12);
  assert.equal(cat(s, 'rent_income').length, 12);
  assert.equal(cat(s, 'vehicle_costs').length, 12);
  assert.equal(cat(s, 'grocery_plan').length, 12);
  assert.equal(s.bank.fds[0].status, 'matured');
  assert.equal(cat(s, 'interest').filter(e => e.memo.includes('Savings')).length, 4, 'four quarterly credits');
  assert.equal(summary.after.wallet, balance(s));
  assert.equal(summary.walletChange, summary.totalIncome - summary.totalExpenses + summary.transfers);
  assert.equal(summary.after.netWorth, overview(s).netWorth);
  assert.equal(s.status, 'alive');
});

test('starving during a year skip still ends the run at the same point, loans or not', () => {
  const g = new Game(mem());
  g.state.pantry = {};
  raise(give(g.state, 600000), 60000);
  buyProperty(g.state, 'home_starter', 'b', { downPct: 0.2, years: 10 });
  const { summary } = g.skipYear();
  assert.equal(summary.died, true);
  assert.ok(g.state.day < 60);
  assert.ok(cat(g.state, 'emi').length <= 2);
});

// ------------------------------------------------------------------ migration
test('a real Round 3 save migrates: money, homes, tenant, furniture, clothes, car, plan, studies kept', () => {
  const raw = readFileSync(new URL('./fixtures/round3_save.json', import.meta.url), 'utf8');
  const old = JSON.parse(raw), st = mem(); st.setItem('vanquest.save.v1', raw);
  const s = loadGame(st);
  assert.equal(s.version, SAVE_VERSION);
  const money = st2 => st2.ledger.filter(e => e.status === 'ok').reduce((a, e) => a + e.amount, 0);
  assert.equal(money(s), money(old), 'same money');
  for (const k of ['furniture', 'wardrobe', 'vehicles', 'pantry', 'education', 'groceryPlan', 'brokerage']) assert.deepEqual(s[k], old[k], k);
  // Round 5 adds fields without changing anything that was there (no money moves in the upgrade)
  assert.deepEqual(s.housing, old.housing.kind === 'rent' ? { ...old.housing, uid: s.housing.uid, deposit: 0, arrears: 0 } : old.housing, 'housing (an owned home needs no tenancy fields)');
  assert.deepEqual(s.academy, { ...old.academy, courses: {} }, 'academy');
  assert.deepEqual(Object.keys(s.properties), Object.keys(old.properties));
  assert.ok(s.properties.home_starter.uid, 'purchase records upgraded');
  assert.deepEqual([s.loans, s.bank.fds, s.propertyHistory], [[], [], []]);
  const rec = s.properties.home_apartment_plus;
  const report = propertyReport(s, rec, 'home_apartment_plus');
  assert.ok(report.rental.rent > 0, 'past tenant rent is attributed to the purchase');
  assert.equal(rec.tenant.deposit, 0, 'a tenant from before deposits existed has a ₹0 deposit');
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))), s, 'migrating twice is a no-op');
  stock(s); toFirst(s);
  assert.equal(new Set(s.ledger.filter(e => e.category === 'rent_income').map(e => e.ref)).size, s.ledger.filter(e => e.category === 'rent_income').length, 'no duplicate rent after migration');
});

test('a Round 2 save still migrates all the way to Round 4', () => {
  const raw = readFileSync(new URL('./fixtures/round2_save.json', import.meta.url), 'utf8');
  const st = mem(); st.setItem('vanquest.save.v1', raw);
  const s = loadGame(st);
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(s.housing.kind, 'rent');
  assert.ok(Array.isArray(s.loans) && s.bank);
});
