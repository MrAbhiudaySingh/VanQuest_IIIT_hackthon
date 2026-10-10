// Round 3 rules: property, vehicles, wardrobe, food & health, year skip, save migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, loadGame, saveGame, migrate, OPENING_BALANCE, SAVE_VERSION } from '../src/sim/state.js';
import { balance } from '../src/sim/ledger.js';
import { advanceDays, daysInNextYear } from '../src/sim/clock.js';
import { purchase, placeFurniture, furnitureIn } from '../src/sim/inventory.js';
import { savePlan, consumeDay } from '../src/sim/groceryPlan.js';
import { enrol } from '../src/sim/career.js';
import { buyProperty, sellProperty, rentHome, moveIn, listForRent, stopRentingOut, propertyValue, buyCost, canFurnish, askingPrice, marketRent } from '../src/sim/property.js';
import { marketIndex } from '../src/sim/housingMarket.js';
import { buyVehicle, sellVehicle, vehicleValue, setActiveVehicle, canDrive, chargeFuel, tripFuelCost } from '../src/sim/vehicles.js';
import { equip, unequip, equipped } from '../src/sim/wardrobe.js';
import { nutritionDay, pantryReport, forecastFedDays, caloriesAvailable, KCAL_NEED } from '../src/sim/health.js';
import { snapshot, periodSummary } from '../src/sim/summary.js';
import { Game } from '../src/sim/game.js';
import { ITEMS } from '../src/data/catalog.js';
import { PROPERTIES, NEIGHBOURHOODS } from '../src/data/properties.js';
import { VEHICLES, PX_PER_KM } from '../src/data/vehicles.js';
import { HOMES } from '../src/data/homes.js';
import { outfitRow, OUTFIT_TOPS, OUTFIT_BOTTOMS, OUTFIT_SHOES } from '../src/data/artIndex.js';
import { nextMonthStart, monthKey } from '../src/sim/util.js';

const toFirst = s => advanceDays(s, nextMonthStart(s.day) - s.day);
const stock = (s, days = 800) => { for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'grocery') s.pantry[id] = Math.ceil(days * it.usePerDay) + 1; return s; };
const give = (s, amount) => { s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount, category: 'test', memo: 'test funds', status: 'ok' }); return s; };
const count = (s, cat, status = 'ok') => s.ledger.filter(e => e.category === cat && e.status === status).length;
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

// ------------------------------------------------------------------ starting situation
test('you start renting the cheapest apartment, July prepaid, rent from 1 Aug', () => {
  const s = stock(newGame());
  assert.deepEqual([s.housing.kind, s.housing.propertyId, s.housing.rent], ['rent', 'home_apartment', 3000]);
  const cheapest = Object.entries(PROPERTIES).sort((a, b) => a[1].price - b[1].price)[0][0];
  assert.equal(s.housing.propertyId, cheapest);
  assert.deepEqual(s.properties, {}, 'nothing owned for free');
  toFirst(s);
  assert.equal(count(s, 'rent'), 1);
  assert.equal(balance(s), OPENING_BALANCE + 10000 - 3000);
});

// ------------------------------------------------------------------ property
test('buy: price + 6% stamp duty, one charge, persists; insufficient funds refused', () => {
  const s = newGame();
  assert.equal(buyProperty(s, 'home_apartment_plus', 'p0').reason, 'insufficient_funds');
  assert.deepEqual(s.properties, {});
  give(s, 2000000);
  const c = buyCost('home_apartment_plus', s.day);
  assert.equal(c.price, askingPrice('home_apartment_plus', s.day), 'you pay the seller\'s asking price');
  assert.equal(c.total, c.price + Math.round(c.price * 0.06), 'plus 6% stamp duty');
  const w = balance(s);
  assert.ok(buyProperty(s, 'home_apartment_plus', 'p1').ok);
  assert.equal(balance(s), w - c.total);
  assert.equal(buyProperty(s, 'home_apartment_plus', 'p1').reason, 'already_owned');
  assert.equal(buyProperty(s, 'home_starter', 'p1').reason, 'duplicate', 'a token is charged once');
  const st = mem(); saveGame(st, s);
  assert.equal(loadGame(st).properties.home_apartment_plus.status, 'vacant');
});

test('sell: only what you own, never your current home, credits value − 2%', () => {
  const s = give(newGame(), 2000000);
  assert.equal(sellProperty(s, 'home_starter', 'x').reason, 'not_owned');
  buyProperty(s, 'home_apartment_plus', 'b');
  moveIn(s, 'home_apartment_plus');
  assert.equal(sellProperty(s, 'home_apartment_plus', 's0').reason, 'is_home', 'must move first');
  assert.ok(rentHome(s, 'home_apartment', 'r').ok);                       // move back to a rental
  const w = balance(s), v = propertyValue('home_apartment_plus', s.day);
  assert.ok(sellProperty(s, 'home_apartment_plus', 's1').ok);
  assert.equal(balance(s), w + v - Math.round(v * 0.02));
  assert.equal(sellProperty(s, 'home_apartment_plus', 's2').reason, 'not_owned', 'no double sale');
});

test('values follow neighbourhood growth × the market cycle, only changing on the 1st', () => {
  assert.equal(propertyValue('home_family', 0), 3200000);
  assert.equal(propertyValue('home_family', 20), 3200000, 'unchanged mid-month');
  const d = 365, h = NEIGHBOURHOODS.family;
  assert.equal(propertyValue('home_family', d), Math.round(3200000 * Math.pow(1 + h.drift, 1) * (1 + h.beta * (marketIndex(d) - 1))));
});

test('renting a home: first month at signing, then each 1st, never twice in a month', () => {
  const s = stock(give(newGame(), 50000));
  const w = balance(s);
  assert.ok(rentHome(s, 'home_starter', 'r1').ok);
  assert.equal(balance(s), w - 8500);
  assert.equal(s.housing.propertyId, 'home_starter');
  toFirst(s);                                   // 1 Aug: 8,500 again (no Elm Court rent any more)
  const rents = s.ledger.filter(e => e.category === 'rent' && e.status === 'ok');
  assert.deepEqual(rents.map(e => e.amount), [-8500, -8500]);
  assert.equal(rentHome(s, 'home_starter', 'r2').reason, 'already_home');
});

test('signing on the 1st after that day’s billing does not double-charge', () => {
  const s = stock(give(newGame(), 50000));
  toFirst(s);                                   // Elm Court rent paid for August
  rentHome(s, 'home_family', 'f');              // August's rent for the new place, once
  advanceDays(s, 1);
  assert.equal(s.ledger.filter(e => e.category === 'rent' && e.memo.includes('18 Elm')).length, 1);
});

test('renting out: tenant arrives on the 1st, pays once a month per property, agent keeps 5%', () => {
  const s = stock(give(newGame(), 6000000));
  buyProperty(s, 'home_apartment_plus', 'a'); buyProperty(s, 'home_starter', 'b');
  assert.equal(listForRent(s, 'home_apartment_plus').ok, true);
  assert.equal(listForRent(s, 'home_apartment_plus').reason, 'already_listed');
  listForRent(s, 'home_starter');
  toFirst(s); toFirst(s); toFirst(s);
  const inc = s.ledger.filter(e => e.category === 'rent_income');
  // Lakeview (central, no extra vacancy) pays from the 1st; the starter house (family
  // neighbourhood, 1 extra month to find a tenant) pays from the 2nd 1st. No duplicates.
  assert.equal(inc.filter(e => e.memo.includes('Lakeview')).length, 3);
  assert.equal(inc.filter(e => e.memo.includes('12 Elm')).length, 2);
  assert.equal(s.properties.home_starter.vacantMonths, 1, 'the empty month is recorded');
  const first = inc.find(e => e.memo.includes('Lakeview'));
  assert.equal(first.amount, Math.round(marketRent('home_apartment_plus', first.day) * 0.95));
  assert.equal(count(s, 'upkeep'), 6, 'owners pay upkeep on both');
  stopRentingOut(s, 'home_starter');
  toFirst(s);
  assert.equal(s.ledger.filter(e => e.category === 'rent_income' && e.day === s.day).length, 1);
  assert.equal(listForRent(s, 'home_apartment').reason, 'not_owned', 'cannot let what you do not own');
});

test('you cannot let out the home you live in', () => {
  const s = give(newGame(), 2000000);
  buyProperty(s, 'home_apartment_plus', 'a'); moveIn(s, 'home_apartment_plus');
  assert.equal(listForRent(s, 'home_apartment_plus').reason, 'is_home');
});

test('two missed rents → eviction, furniture goes to storage, homelessness hurts health', () => {
  const s = stock(newGame());
  purchase(s, 'market_furniture', { plant: 1 }, 'f');
  placeFurniture(s, s.furniture[0].uid, 'home_apartment', 3, 3);
  s.ledger.push({ id: s.nextId++, day: 0, account: 'wallet', amount: -balance(s), category: 'test', memo: 'drain', status: 'ok' });
  s.job.salary = 0;
  toFirst(s);
  assert.equal(s.housing.missed, 1);
  toFirst(s);
  assert.equal(s.housing, null, 'evicted');
  assert.equal(s.furniture[0].home, null, 'furniture kept in storage');
  const h = s.health;
  advanceDays(s, 5);
  assert.ok(s.health < Math.min(100, h + 5), 'no home → health penalty');
  assert.ok(balance(s) >= 0, 'never negative');
});

test('furniture belongs to each property; moving does not erase it', () => {
  const s = stock(give(newGame(), 2000000));
  purchase(s, 'market_furniture', { plant: 2 }, 'f');
  const [a, b] = s.furniture;
  placeFurniture(s, a.uid, 'home_apartment', 3, 3);
  buyProperty(s, 'home_apartment_plus', 'p');
  assert.ok(canFurnish(s, 'home_apartment_plus'), 'owned vacant property can be furnished');
  placeFurniture(s, b.uid, 'home_apartment_plus', 4, 4);
  moveIn(s, 'home_apartment_plus');                          // leaving the rented flat
  assert.equal(furnitureIn(s, 'home_apartment').length, 0, 'rental furniture comes with you to storage');
  assert.equal(furnitureIn(s, 'home_apartment_plus').length, 1, 'owned home keeps its furniture');
  assert.equal(s.furniture.length, 2, 'nothing duplicated or lost');
  assert.equal(canFurnish(s, 'home_luxury'), false);
});

// ------------------------------------------------------------------ vehicles
test('vehicles: buy deducts price, no duplicates, insufficient refused, sell credits depreciated value', () => {
  const s = newGame();
  assert.equal(buyVehicle(s, 'used_hatch', 'v0').reason, 'insufficient_funds');
  give(s, 1000000);
  const w = balance(s);
  const r = buyVehicle(s, 'used_hatch', 'v1');
  assert.ok(r.ok);
  assert.equal(balance(s), w - 180000);
  assert.equal(s.activeVehicle, r.vehicle.uid);
  assert.equal(buyVehicle(s, 'used_hatch', 'v2').reason, 'already_owned');
  assert.equal(buyVehicle(s, 'hatch', 'v1').reason, 'duplicate');
  assert.equal(vehicleValue(s, r.vehicle), Math.round(180000 * 0.85));
  const before = balance(s);
  assert.ok(sellVehicle(s, r.vehicle.uid, 's1').ok);
  assert.equal(balance(s), before + Math.round(180000 * 0.85));
  assert.equal(s.vehicles.length, 0);
  assert.equal(s.activeVehicle, null);
  assert.equal(sellVehicle(s, r.vehicle.uid, 's2').reason, 'not_owned');
});

test('vehicles: monthly costs, arrears block driving, fuel by distance', () => {
  const s = stock(give(newGame(), 200000));
  const { vehicle: v } = buyVehicle(s, 'used_hatch', 'b');
  toFirst(s);
  assert.equal(s.ledger.filter(e => e.category === 'vehicle_costs' && e.status === 'ok').at(-1).amount, -1500);
  assert.ok(canDrive(s, v).ok);
  assert.equal(tripFuelCost(v, PX_PER_KM), 8, '1 km × ₹7.5 → ₹8');
  const w = balance(s);
  chargeFuel(s, v.uid, PX_PER_KM * 2);
  assert.equal(balance(s), w - 15);
  s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: -balance(s), category: 'test', memo: 'drain', status: 'ok' });
  s.job.salary = 0;
  toFirst(s);
  assert.equal(v.arrears, 1500);
  assert.equal(canDrive(s, v).reason, 'arrears');
});

test('better cars are genuinely faster and quicker', () => {
  const byPrice = Object.values(VEHICLES).sort((a, b) => a.price - b.price);
  assert.ok(byPrice.at(-1).maxSpeed > byPrice[0].maxSpeed && byPrice.at(-1).accel > byPrice[0].accel);
  for (const m of Object.values(VEHICLES)) assert.ok(m.maxSpeed > 80, `${m.name} faster than walking`);
});

test('switching the active car swaps it into the same parking spot', () => {
  const s = give(newGame(), 3000000);
  const a = buyVehicle(s, 'hatch', '1').vehicle, b = buyVehicle(s, 'sedan', '2').vehicle;
  a.parked = { x: 100, y: 200, dir: 2 };
  assert.ok(setActiveVehicle(s, b.uid).ok);
  assert.deepEqual(b.parked, { x: 100, y: 200, dir: 2 });
  assert.equal(a.parked, null);
});

// ------------------------------------------------------------------ wardrobe
test('clothing: equip only owned items, one per slot, persists; outfit rows map to the sheet', () => {
  const s = newGame();
  assert.equal(equip(s, 'kurta').reason, 'not_owned');
  purchase(s, 'market_clothing', { kurta: 1, jeans: 1, sneakers: 1 }, 'c');
  assert.ok(equip(s, 'kurta').ok); assert.ok(equip(s, 'jeans').ok); assert.ok(equip(s, 'sneakers').ok);
  assert.deepEqual(equipped(s), { top: 'kurta', bottom: 'jeans', feet: 'sneakers' });
  assert.equal(equip(s, 'laptop').reason, 'not_clothing');
  const st = mem(); saveGame(st, s);
  assert.deepEqual(equipped(loadGame(st)), { top: 'kurta', bottom: 'jeans', feet: 'sneakers' });
  unequip(s, 'feet');
  assert.equal(equipped(s).feet, null);
  assert.equal(outfitRow({}), 0);
  assert.equal(outfitRow({ top: 'silk_saree', bottom: 'jeans', feet: 'sneakers' }), OUTFIT_TOPS.length * OUTFIT_BOTTOMS.length * OUTFIT_SHOES.length - 1);
});

// ------------------------------------------------------------------ food & health
test('a full basket feeds you; no food raises hunger then lowers health by the documented rule', () => {
  const s = stock(newGame());
  assert.ok(caloriesAvailable(s.pantry) >= KCAL_NEED);
  nutritionDay(s);
  assert.equal(s.hunger, 0);
  s.pantry = {};
  nutritionDay(s); assert.equal(s.hunger, 50);
  assert.equal(s.health, 99, 'hunger 50 → −1');
  nutritionDay(s); assert.equal(s.hunger, 100);
  assert.equal(s.health, 95, 'hunger ≥ 80 → −4');
});

test('severe deprivation ends the run after weeks (with warnings first), and the clock stops', () => {
  const s = newGame();
  s.pantry = {};
  const notes = advanceDays(s, 60);
  assert.equal(s.status, 'dead');
  assert.equal(s.death.cause, 'malnutrition');
  assert.ok(s.death.day > 20 && s.death.day < 35, `took ${s.death.day} days`);
  const kinds = notes.map(n => n.text);
  assert.ok(kinds.some(t => /going hungry/.test(t)) && kinds.some(t => /seriously ill/.test(t)), 'warned before death');
  const day = s.day;
  advanceDays(s, 10);
  assert.equal(s.day, day, 'no time passes after death');
});

test('food is consumed at the stated rate and only when time advances', () => {
  const s = newGame();
  s.pantry = { milk_1l: 10 }; s.consumption = {};
  const snap = JSON.stringify(s.pantry);
  assert.equal(JSON.stringify(s.pantry), snap, 'no consumption without the clock');
  for (let i = 0; i < 4; i++) consumeDay(s);
  assert.equal(s.pantry.milk_1l, 8, '0.5 L/day × 4 days');
});

test('pantry report: days left, reserve, sufficiency vs next delivery, replenish cost', () => {
  const s = newGame();
  s.pantry = { rice_5kg: 1, milk_1l: 1 }; s.consumption = {};
  const r = pantryReport(s);
  const rice = r.rows.find(x => x.id === 'rice_5kg'), milk = r.rows.find(x => x.id === 'milk_1l');
  assert.equal(rice.daysLeft, 25);
  assert.equal(milk.daysLeft, 2);
  assert.equal(milk.reserve, 4, '7 days × 0.5 L');
  assert.equal(milk.replenishCost, 3 * 62);
  assert.equal(milk.sufficient, false);
  assert.equal(r.fedDays, forecastFedDays(s));
  savePlan(s, { milk_1l: 15 }, 'delivery');
  const r2 = pantryReport(s);
  assert.equal(r2.untilDelivery, 31);
  assert.equal(r2.rows.find(x => x.id === 'milk_1l').coverDays, 31);
});

test('grocery plan charges exactly once per billing date across a year', () => {
  const s = stock(newGame());
  savePlan(s, { bread: 4 }, 'delivery');
  advanceDays(s, daysInNextYear(s));
  const bills = s.ledger.filter(e => e.category === 'grocery_plan' && e.status === 'ok');
  assert.equal(bills.length, 12);
  assert.equal(new Set(bills.map(e => monthKey(e.day))).size, 12);
});

// ------------------------------------------------------------------ year skip
test('skip one year: 12 salaries, 12 rents, graduation, summary matches the ledger', () => {
  const g = new Game(mem());
  stock(g.state);
  give(g.state, 30000);
  enrol(g.state, 'design', 'e');
  const { summary } = g.skipYear();
  const s = g.state;
  assert.equal(s.day, 365);
  assert.equal(count(s, 'salary'), 12);
  assert.equal(count(s, 'rent'), 12);
  assert.equal(new Set(s.ledger.filter(e => e.category === 'salary').map(e => monthKey(e.day))).size, 12, 'no duplicate salary');
  assert.equal(s.education.status, 'graduated');
  assert.equal(summary.income.salary, s.ledger.filter(e => e.category === 'salary').reduce((a, e) => a + e.amount, 0));
  assert.equal(summary.walletChange, summary.totalIncome - summary.totalExpenses + summary.transfers, 'summary reconciles with the wallet');
  assert.equal(summary.after.wallet, balance(s));
  assert.match(summary.education.after, /graduated/);
});

test('skip one year without food: the run ends on the day the rules say, not at year end', () => {
  const g = new Game(mem());
  g.state.pantry = {};
  const { summary } = g.skipYear();
  assert.equal(summary.died, true);
  assert.ok(g.state.day < 60);
});

test('year skip is deterministic', () => {
  const a = new Game(mem()), b = new Game(mem());
  for (const g of [a, b]) { stock(g.state); g.skipYear(); }
  assert.equal(JSON.stringify(a.state.ledger), JSON.stringify(b.state.ledger));
});

// ------------------------------------------------------------------ feed & migration
test('side-panel feed records money movements and warnings, and is capped', () => {
  const g = new Game(mem());
  g.act(s => purchase(s, 'market_grocery', { eggs_12: 1 }, 'x'));
  assert.match(g.state.feed.at(-1).text, /Eggs/);
  g.state.pantry = {};
  g.advance(200);
  assert.ok(g.state.feed.length <= 40);
});

test('a real Round 2 save migrates without losing progress', () => {
  const raw = readFileSync(new URL('./fixtures/round2_save.json', import.meta.url), 'utf8');
  const st = mem(); st.setItem('vanquest.save.v1', raw);
  const old = JSON.parse(raw);
  const s = loadGame(st);
  assert.equal(s.version, SAVE_VERSION);
  assert.equal(balance(s), old.ledger.filter(e => e.account === 'wallet' && e.status === 'ok').reduce((a, e) => a + e.amount, 0), 'same money');
  assert.deepEqual(s.owned, old.owned, 'possessions kept (even two T-shirts)');
  assert.deepEqual(s.furniture, old.furniture, 'furniture and its placement kept');
  assert.deepEqual(s.academy, old.academy);
  assert.deepEqual(s.brokerage, old.brokerage);
  assert.equal(s.housing.kind, 'rent');
  assert.equal(s.housing.paidMonth, monthKey(old.day), 'current month treated as paid');
  assert.equal(s.health, 100);
  stock(s);
  toFirst(s);
  assert.equal(s.ledger.filter(e => e.category === 'rent').length, 1, 'first rent on the next 1st');
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s))), s, 'migrating twice is a no-op');
});

test('every home (incl. Lakeview) has an interior with a computer and a property listing', () => {
  for (const id of Object.keys(PROPERTIES)) {
    assert.ok(HOMES[id], id);
    assert.equal(HOMES[id].computer.id, `home_pc_${id.replace('home_', '')}`);
  }
});

// ------------------------------------------------------------------ property access
import { canEnter } from '../src/sim/property.js';
import { PROPERTY_RULES } from '../src/data/properties.js';

test('access: a fresh player is a tenant of the cheapest flat and can enter only that', () => {
  const s = newGame();
  const cheapest = Object.entries(PROPERTIES).sort((a, b) => a[1].price - b[1].price)[0][0];
  assert.equal(PROPERTY_RULES.startingHome, cheapest);
  assert.deepEqual([s.housing.kind, s.housing.propertyId, s.residence], ['rent', cheapest, cheapest]);
  assert.ok(canEnter(s, cheapest).ok);
  for (const id of Object.keys(PROPERTIES)) if (id !== cheapest) assert.equal(canEnter(s, id).reason, 'no_access', id);
});

test('access: buying unlocks, letting locks, selling revokes, moving updates', () => {
  const s = stock(give(newGame(), 6000000));
  assert.equal(canEnter(s, 'home_family').ok, false);
  buyProperty(s, 'home_family', 'b1');
  assert.ok(canEnter(s, 'home_family').ok, 'owned + vacant');
  listForRent(s, 'home_family');
  assert.equal(canEnter(s, 'home_family').reason, 'tenant_occupied', 'listed → tenant moving in');
  toFirst(s); toFirst(s);                                   // family neighbourhood: one extra month to find a tenant
  assert.equal(s.properties.home_family.status, 'let');
  assert.equal(canEnter(s, 'home_family').reason, 'tenant_occupied');
  stopRentingOut(s, 'home_family');
  assert.ok(canEnter(s, 'home_family').ok, 'vacant again');
  moveIn(s, 'home_family');
  assert.equal(s.residence, 'home_family');
  assert.equal(canEnter(s, 'home_apartment').reason, 'no_access', 'old rental no longer accessible');
  rentHome(s, 'home_apartment', 'r');
  assert.ok(sellProperty(s, 'home_family', 's').ok);
  assert.equal(canEnter(s, 'home_family').reason, 'no_access', 'sold → access revoked');
  assert.ok(canEnter(s, 'home_apartment').ok, 'the new tenancy is accessible');
});

test('furniture: place in the rented flat, survive reload, pack on move-out, never in a tenant home', () => {
  const s = stock(give(newGame(), 6000000));
  purchase(s, 'market_furniture', { plant: 1, rug: 1 }, 'f');
  const [plant, rug] = s.furniture;
  assert.ok(placeFurniture(s, plant.uid, 'home_apartment', 3, 3).ok, 'rented flat is your home');
  assert.equal(placeFurniture(s, rug.uid, 'home_luxury', 3, 3).reason, 'not_your_home', 'cannot furnish what you neither own nor rent');
  const st = mem(); saveGame(st, s);
  assert.deepEqual(loadGame(st).furniture.find(f => f.uid === plant.uid), { ...plant });
  buyProperty(s, 'home_starter', 'b'); moveIn(s, 'home_starter');
  assert.equal(s.furniture.find(f => f.uid === plant.uid).home, null, 'packed into storage on moving out');
  assert.ok(placeFurniture(s, plant.uid, 'home_starter', 4, 4).ok, 'taken to the new home');
  buyProperty(s, 'home_apartment_plus', 'b2');
  placeFurniture(s, rug.uid, 'home_apartment_plus', 2, 3);
  listForRent(s, 'home_apartment_plus');
  assert.equal(s.furniture.find(f => f.uid === rug.uid).home, null, 'letting out packs your furniture');
  assert.equal(placeFurniture(s, rug.uid, 'home_apartment_plus', 2, 3).reason, 'not_your_home', 'no placing in a tenant home');
  assert.equal(placeFurniture(s, 'f-nope', 'home_starter', 1, 1).reason, 'not_owned', 'cannot place what you do not own');
  assert.equal(s.furniture.length, 2, 'nothing duplicated or lost');
});
