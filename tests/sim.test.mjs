// Unit tests for the simulation: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, loadGame, saveGame, OPENING_BALANCE } from '../src/sim/state.js';
import { balance, transfer } from '../src/sim/ledger.js';
import { purchase, quote, placeFurniture, storeFurniture, furnitureIn, ownedCount } from '../src/sim/inventory.js';
import { savePlan, setPlanStatus, planCost, collectOrders, consumeDay } from '../src/sim/groceryPlan.js';
import { advanceDays } from '../src/sim/clock.js';
import { enrol } from '../src/sim/career.js';
import { price, trade, portfolio, quoteTrade } from '../src/sim/market.js';
import { startEncounter, ask, invest, decline, canTrigger } from '../src/sim/encounters.js';
import { submitCheck, courseRecord } from '../src/sim/academy.js';
import { COURSES } from '../src/data/courses.js';
import { ITEMS } from '../src/data/catalog.js';
import { MAJORS } from '../src/data/majors.js';
import { HOMES } from '../src/data/homes.js';
import { LOCATIONS } from '../src/data/locations.js';
import { nextMonthStart, dateOf, inr } from '../src/sim/util.js';
import { TRADE_FEE } from '../src/data/market.js';

const toFirst = s => advanceDays(s, nextMonthStart(s.day) - s.day);
// Long-running tests of money systems keep the household fed (~800 days of every grocery),
// otherwise the Round 3 health rules would (correctly) end the run.
const stockPantry = s => { for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'grocery') s.pantry[id] = Math.ceil(800 * it.usePerDay) + 1; return s; };
const RENT = 3000;
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('formatting uses ₹ and Indian grouping', () => {
  assert.equal(inr(120000), '₹1,20,000');
  assert.equal(inr(-500), '−₹500');
});

test('opening balance comes from the ledger', () => {
  const s = newGame();
  assert.equal(balance(s), OPENING_BALANCE);
});

test('purchase charges once, delivers items, rejects duplicates', () => {
  const s = newGame();
  const r = purchase(s, 'market_grocery', { rice_5kg: 2, milk_1l: 3 }, 'tok1');
  assert.ok(r.ok);
  assert.equal(r.total, 2 * 350 + 3 * 62);
  assert.equal(balance(s), OPENING_BALANCE - r.total);
  assert.equal(s.pantry.rice_5kg, 1 + 2);
  const again = purchase(s, 'market_grocery', { rice_5kg: 2 }, 'tok1');
  assert.equal(again.reason, 'duplicate');
  assert.equal(balance(s), OPENING_BALANCE - r.total, 'no second charge');
});

test('purchase rejects insufficient funds without changing anything', () => {
  const s = newGame();
  const before = JSON.stringify(s);
  const r = purchase(s, 'market_jewellery', { diamond_pendant: 1 }, 't');
  assert.equal(r.reason, 'insufficient_funds');
  assert.equal(JSON.stringify(s), before);
});

test('purchase validates shop, quantity and ownership limits', () => {
  const s = newGame();
  assert.equal(quote(s, 'market_grocery', { laptop: 1 }).reason, 'not_sold_here');
  assert.equal(quote(s, 'market_grocery', { rice_5kg: 1.5 }).reason, 'invalid_quantity');
  assert.equal(quote(s, 'market_grocery', { rice_5kg: -1 }).reason, 'invalid_quantity');
  assert.equal(quote(s, 'market_grocery', {}).reason, 'empty');
  assert.equal(quote(s, 'market_electronics', { printer: 2 }).reason, 'limit');
});

test('possessions and furniture go to the right inventory', () => {
  const s = newGame();
  assert.equal(purchase(s, 'market_clothing', { tshirt: 2 }, 'a0').reason, 'limit', 'clothing is owned once each');
  purchase(s, 'market_clothing', { tshirt: 1, jeans: 1 }, 'a');
  purchase(s, 'market_furniture', { plant: 2 }, 'b');
  assert.equal(s.owned.tshirt, 1);
  assert.equal(s.owned.jeans, 1);
  assert.equal(s.furniture.length, 2);
  assert.notEqual(s.furniture[0].uid, s.furniture[1].uid);
  assert.equal(ownedCount(s, 'plant'), 2);
  placeFurniture(s, s.furniture[0].uid, 'home_apartment', 3, 4);
  assert.equal(furnitureIn(s, 'home_apartment').length, 1);
  storeFurniture(s, s.furniture[0].uid);
  assert.equal(furnitureIn(s, 'home_apartment').length, 0);
  assert.equal(s.furniture.length, 2, 'placing/storing never duplicates or loses items');
});

test('salary of ₹10,000 is paid on the 1st of each month, once', () => {
  const s = stockPantry(newGame());
  advanceDays(s, 30);                         // 1 Jul → 31 Jul: no payday yet (July rent was prepaid)
  assert.equal(balance(s), OPENING_BALANCE);
  advanceDays(s, 1);                          // 1 Aug
  assert.equal(dateOf(s.day).getUTCDate(), 1);
  assert.equal(s.ledger.filter(e => e.category === 'salary').length, 1);
  assert.equal(s.ledger.filter(e => e.category === 'rent').length, 1, 'August rent charged once');
  assert.equal(balance(s), OPENING_BALANCE + 10000 - RENT);
  toFirst(s);
  assert.equal(s.ledger.filter(e => e.category === 'salary').length, 2);
});

test('grocery plan bills on the 1st, delivers, and never charges at save time', () => {
  const s = newGame();
  const r = savePlan(s, { rice_5kg: 1, milk_1l: 15 }, 'delivery');
  assert.ok(r.ok);
  assert.equal(balance(s), OPENING_BALANCE, 'saving a plan charges nothing');
  const { total } = planCost(s.groceryPlan.items, 'delivery');
  assert.equal(total, 350 + 15 * 62 + 40);
  toFirst(s);
  const charges = s.ledger.filter(e => e.category === 'grocery_plan' && e.status === 'ok');
  assert.equal(charges.length, 1);
  assert.equal(charges[0].amount, -total);
  assert.ok(s.ledger.findIndex(e => e.category === 'salary') < s.ledger.findIndex(e => e.category === 'grocery_plan'), 'salary is paid before the plan bills');
  assert.ok(s.pantry.milk_1l >= 14, 'delivered 15 (minus at most one used that day)');
});

test('grocery plan pauses on insufficient funds and charges nothing', () => {
  const s = newGame();
  purchase(s, 'market_electronics', { smartphone: 1 }, 'x');   // spend most savings
  stockPantry(s);
  savePlan(s, { rice_5kg: 40, oil_1l: 30 }, 'delivery');       // > salary + remaining
  const before = balance(s);
  const notes = toFirst(s);
  assert.equal(s.groceryPlan.status, 'paused');
  assert.equal(s.groceryPlan.pausedReason, 'insufficient_funds');
  assert.equal(balance(s), before + 10000 - RENT, 'only salary and rent moved');
  assert.ok(s.ledger.some(e => e.category === 'grocery_plan' && e.status === 'failed'));
  assert.ok(notes.some(n => n.kind === 'error' && /paused/.test(n.text)));
  toFirst(s);
  assert.equal(s.ledger.filter(e => e.category === 'grocery_plan').length, 1, 'paused plans are not retried');
  assert.ok(balance(s) >= 0);
});

test('grocery plan edit, pause, resume, cancel, and collect mode', () => {
  const s = stockPantry(newGame());
  savePlan(s, { bread: 4 }, 'pickup');
  savePlan(s, { bread: 6 }, 'pickup');                           // edit replaces basket
  assert.equal(s.groceryPlan.items.bread, 6);
  setPlanStatus(s, 'paused');
  toFirst(s);
  assert.equal(s.ledger.filter(e => e.category === 'grocery_plan').length, 0);
  setPlanStatus(s, 'active');
  toFirst(s);
  assert.equal(s.pickupOrders.length, 1, 'collect mode waits at the shop');
  const bread = s.pantry.bread ?? 0;
  assert.ok(collectOrders(s).ok);
  assert.equal(s.pantry.bread, bread + 6);
  assert.equal(collectOrders(s).reason, 'nothing_to_collect');
  setPlanStatus(s, 'cancelled');
  toFirst(s);
  assert.equal(s.ledger.filter(e => e.category === 'grocery_plan').length, 1);
});

test('household consumption is deterministic and reports running out', () => {
  const s = newGame();
  s.pantry = { milk_1l: 2 };
  assert.deepEqual(consumeDay(s), []);          // 0.5
  assert.deepEqual(consumeDay(s), []);          // 1.0 → 1 left
  assert.equal(s.pantry.milk_1l, 1);
  consumeDay(s);
  assert.deepEqual(consumeDay(s), ['Milk (1 L)']);
  assert.equal(s.pantry.milk_1l, undefined);
});

test('a 5 kg rice bag lasts 25 days', () => {
  const s = newGame();
  s.pantry = { rice_5kg: 1 };
  for (let d = 0; d < 24; d++) consumeDay(s);
  assert.equal(s.pantry.rice_5kg, 1);
  consumeDay(s);
  assert.equal(s.pantry.rice_5kg, undefined);
});

test('college: tuition only on success; part-time salary until graduation; then career salary', () => {
  const s = stockPantry(newGame());
  assert.equal(enrol(s, 'computer_science', 'e0').reason, 'insufficient_funds');
  assert.equal(balance(s), OPENING_BALANCE);
  const r = enrol(s, 'design', 'e1');                            // ₹25,000? not affordable at start…
  assert.equal(r.reason, 'insufficient_funds');
  advanceDays(s, 31 + 31);                                       // two paydays − two rents → ₹29,000
  const ok = enrol(s, 'design', 'e2');
  assert.ok(ok.ok);
  assert.equal(balance(s), OPENING_BALANCE + 20000 - 2 * RENT - MAJORS.design.tuition);
  assert.equal(enrol(s, 'business', 'e3').reason, 'already_enrolled');
  while (s.day < s.education.graduationDay - 1) {
    advanceDays(s, 1);
    if (dateOf(s.day).getUTCDate() === 1) assert.equal(s.ledger.at(-1).category === 'salary' ? s.ledger.at(-1).amount : 10000, 10000);
  }
  assert.equal(s.job.salary, 10000, 'still part-time the day before graduation');
  advanceDays(s, 1);
  assert.equal(s.education.status, 'graduated');
  assert.equal(s.job.title, 'Junior Designer');
  const sal = s.ledger.filter(e => e.category === 'salary').at(-1);
  assert.equal(sal.amount, 25000, 'graduation-day salary uses the new job');
  for (let i = 0; i < 12; i++) toFirst(s);
  assert.equal(s.job.title, 'Designer');
  assert.equal(s.job.salary, 32000);
});

test('market prices are deterministic and portfolio maths is consistent', () => {
  const a = newGame(), b = newGame();
  advanceDays(a, 40); advanceDays(b, 40);
  assert.equal(price(a, 'LUMEN'), price(b, 'LUMEN'));
  assert.equal(transfer(a, 'wallet', 'brokerage', 30000).reason, 'insufficient_funds');
  assert.ok(transfer(a, 'wallet', 'brokerage', 10000).ok);
  assert.equal(balance(a, 'brokerage'), 10000);
  const q = quoteTrade(a, 'SAGAR50', 'buy', 10);
  const t = trade(a, 'SAGAR50', 'buy', 10, 'b1');
  assert.ok(t.ok);
  assert.equal(trade(a, 'SAGAR50', 'buy', 10, 'b1').reason, 'duplicate');
  assert.equal(balance(a, 'brokerage'), 10000 - q.net);
  let p = portfolio(a);
  assert.equal(p.rows[0].cost, q.gross + TRADE_FEE);
  assert.equal(p.total, p.cash + p.invested);
  assert.equal(trade(a, 'SAGAR50', 'sell', 11, 's0').reason, 'not_enough_units');
  advanceDays(a, 20);
  const px = price(a, 'SAGAR50');
  const s1 = trade(a, 'SAGAR50', 'sell', 4, 's1');
  assert.equal(s1.trade.net, Math.round(px * 4) - TRADE_FEE);
  assert.equal(s1.trade.realized, s1.trade.net - Math.round(q.net * 4 / 10));
  p = portfolio(a);
  assert.equal(p.rows[0].qty, 6);
  assert.equal(p.rows[0].cost, q.net - Math.round(q.net * 4 / 10));
  trade(a, 'SAGAR50', 'sell', 6, 's2');
  p = portfolio(a);
  assert.equal(p.rows.length, 0);
  const netFlows = a.brokerage.trades.reduce((s, t) => s + (t.side === 'buy' ? -t.net : t.net), 0);
  assert.equal(p.cash, 10000 + netFlows, 'cash = deposits + trade cash flows');
  assert.equal(p.realized, netFlows, 'all positions closed → realized P/L = net flows');
});

test('scam encounter: stake is lost after the defined delay, recorded in history', () => {
  const s = newGame();
  const rec = startEncounter(s, 'plantation_doubler');
  assert.ok(ask(s, rec.uid, 'investigate').ok);
  assert.equal(invest(s, rec.uid, 50000, 'i0').reason, 'out_of_range');
  assert.ok(invest(s, rec.uid, 5000, 'i1').ok);
  assert.equal(balance(s), OPENING_BALANCE - 5000);
  advanceDays(s, 9);
  assert.equal(rec.status, 'invested');
  const notes = advanceDays(s, 1);
  assert.equal(rec.status, 'resolved');
  assert.equal(rec.payout, 0);
  assert.equal(balance(s), OPENING_BALANCE - 5000);
  assert.ok(notes.some(n => n.encounter === rec.uid));
  assert.ok(s.events.some(e => e.encounter === rec.uid));
});

test('asset-linked encounter pays out exactly per the simulated price; declining costs nothing', () => {
  const s = newGame();
  const rec = startEncounter(s, 'grid_tariff_news');
  assert.ok(s.marketEvents.some(e => e.source === rec.uid), 'the news exists in the market either way');
  invest(s, rec.uid, 10000, 'g');
  const p0 = rec.startPrice;
  advanceDays(s, 30);
  assert.equal(rec.payout, Math.round(10000 * price(s, 'BHARATGRID', rec.resolveDay) / p0));
  assert.equal(canTrigger(s), true);
  const s2 = newGame();
  const r2 = startEncounter(s2, 'forex_bot');
  assert.equal(canTrigger(s2), false, 'no new encounter while one is open');
  decline(s2, r2.uid);
  assert.equal(balance(s2), OPENING_BALANCE);
  assert.equal(canTrigger(s2), false, 'cooldown');
  advanceDays(s2, 3);
  assert.equal(canTrigger(s2), true);
});

test('academy records attempts, best score and completion separately from the portfolio', () => {
  // Round 5: the academy runs the supplied courses; the same guarantees apply to a course's check
  const s = newGame();
  const C = COURSES[0], qs = C.check.questions;
  const wrong = submitCheck(s, C.id, qs.map(q => q.options.find(o => o.key !== q.answer).key));
  assert.equal(wrong.passed, false);
  const right = submitCheck(s, C.id, qs.map(q => q.answer));
  assert.equal(right.correct, qs.length);
  const rec = courseRecord(s, C.id).check;
  assert.equal(rec.attempts, 2);
  assert.equal(rec.passed, true);
  assert.equal(rec.bestScore, 1);
  assert.equal(submitCheck(s, C.id, ['A']).reason, 'incomplete');
  assert.deepEqual(s.brokerage, { holdings: {}, trades: [] });
});

test('every home has a computer with a stable id and a city entrance', () => {
  for (const [id, home] of Object.entries(HOMES)) {
    assert.ok(LOCATIONS[id], id);
    assert.match(home.computer.id, /^home_pc_/);
  }
  assert.deepEqual(Object.keys(HOMES).sort(), Object.keys(LOCATIONS).filter(k => LOCATIONS[k].kind === 'home').sort());
});

test('catalogue is well-formed', () => {
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.equal(it.id, id);
    assert.ok(Number.isInteger(it.price) && it.price > 0, id);
    if (it.kind === 'grocery' || it.kind === 'household') assert.ok(it.usePerDay > 0, id);
  }
});

test('save/load round-trips through storage', () => {
  const st = memStorage();
  const s = newGame();
  purchase(s, 'market_grocery', { eggs_12: 1 }, 'p');
  saveGame(st, s);
  assert.deepEqual(loadGame(st), s);
  st.setItem('vanquest.save.v1', '{broken');
  assert.equal(balance(loadGame(st)), OPENING_BALANCE, 'corrupt save → new game');
});

test('clock runs monthly events once each, in order', () => {
  const s = stockPantry(newGame());
  savePlan(s, { bread: 2 }, 'delivery');
  advanceDays(s, 31);
  const cats = s.ledger.filter(e => e.day === s.day).map(e => e.category);
  assert.deepEqual(cats, ['salary', 'rent', 'grocery_plan']);
});
