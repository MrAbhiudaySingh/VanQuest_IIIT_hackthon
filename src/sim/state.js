// The whole save game is one plain JSON object. Everything that must survive a
// refresh lives here; scenes and UI only hold views of it.
// The storage key is unchanged since Round 2; older saves are upgraded by migrate().
import { monthKey } from './util.js';
import { LOCATIONS } from '../data/locations.js';
import { PROPERTIES, PROPERTY_RULES } from '../data/properties.js';

export const SAVE_KEY = 'vanquest.save.v1';
export const SAVE_VERSION = 3;

export const OPENING_BALANCE = 15000;
export const START_JOB = { id: 'part_time_retail', title: 'Part-time retail assistant', salary: 10000 };
export const START_RENT = 3000;   // Elm Court Flat 2B (kept in sync with data/properties.js)

// Fields added in save version 2 (Round 3), with their defaults.
function round3Fields(day) {
  return {
    // where you live and on what terms: { kind: 'rent', propertyId, rent, since, paidMonth, missed }
    // | { kind: 'own', propertyId } | null (no home)
    housing: { kind: 'rent', propertyId: 'home_apartment', rent: START_RENT, since: day, paidMonth: null, missed: 0 },
    properties: {},            // owned: id → { boughtDay, paid, status: 'vacant'|'home'|'listed'|'let', arrears }
    vehicles: [],              // owned: [{ uid, model, boughtDay, price, arrears, parked: {x,y,dir}|null }]
    activeVehicle: null,       // uid of the car parked in the city for you to drive
    wardrobe: { top: null, bottom: null, feet: null },
    hunger: 0,                 // 0 = well fed … 100 = starving
    health: 100,               // 0 = death
    status: 'alive',           // 'alive' | 'dead'
    death: null,               // { day, cause }
    flags: {},                 // one-shot warning latches (low food, hungry, ill)
    stats: { daysHungry: 0, daysUnfed: 0, minHealth: 100 },
    feed: [],                  // recent updates for the side panel (capped)
  };
}

// Fields added in save version 3 (Round 4).
function round4Fields() {
  return {
    bank: { accrued: 0, interestToDate: 0, fds: [] },   // savings interest accrues daily, FDs listed here
    loans: [],                 // mortgages & home-equity loans (sim/loans.js)
    credit: { defaults: [] },  // loan defaults (the rest of the credit profile is computed)
    propertyHistory: [],       // sold / repossessed purchases, kept for performance reports
  };
}

export function newGame() {
  const state = {
    version: SAVE_VERSION,
    day: 0,                    // 0 = 1 July 2026 (see util.dateOf)
    nextId: 1,
    ledger: [],
    events: [],                // non-money history: grocery plan paused, lesson done…
    pantry: { rice_5kg: 1, atta_5kg: 1, dal_1kg: 1, oil_1l: 1, milk_1l: 2, veg_1kg: 2, tea_250g: 1 },   // ~3 weeks of food
    consumption: {},           // fractional usage carried between days
    owned: {},                 // possessions: itemId → count
    furniture: [],             // [{ uid, itemId, home: null|propertyId, x, y }]
    residence: 'home_apartment',
    job: { ...START_JOB, since: 0 },
    education: null,           // { majorId, enrolledDay, graduationDay, status: 'enrolled'|'graduated' }
    groceryPlan: null,         // see groceryPlan.js
    pickupOrders: [],          // paid plan orders waiting at FreshCart
    brokerage: { holdings: {}, trades: [] },
    marketEvents: [],          // scheduled simulated price moves (from encounters)
    academy: { lessons: {} },
    encounters: { log: [], lastDay: -99, seen: [] },
    player: null,              // { x, y } last city position
    ...round3Fields(0),
    ...round4Fields(),
  };
  state.housing.paidMonth = '2026-07';   // July's rent was paid before the game starts
  state.ledger.push({ id: state.nextId++, day: 0, account: 'wallet', amount: OPENING_BALANCE, category: 'opening', memo: 'Savings at the start of the game', ref: null, status: 'ok' });
  logEvent(state, 'housing', `You rent Elm Court Flat 2B for ₹${START_RENT.toLocaleString('en-IN')}/month (July already paid).`);
  return state;
}

// Upgrade older saves in place. Never discards existing progress.
export function migrate(s) {
  if (s.version === 1) {
    const add = round3Fields(s.day);
    for (const [k, v] of Object.entries(add)) if (!(k in s)) s[k] = v;
    delete s.homesOwned;
    // Round 2 let you live at Elm Court rent-free; from now on it's a normal tenancy.
    // This month counts as paid, so the first rent is due on the next 1st.
    s.housing.paidMonth = monthKey(s.day);
    s.residence = 'home_apartment';
    s.feed = [{ day: s.day, kind: 'info', text: `Save upgraded: you now rent Elm Court Flat 2B (₹${START_RENT.toLocaleString('en-IN')}/month, first payment on the 1st).` }];
    logEvent(s, 'housing', 'Save upgraded to Round 3 — Elm Court is now a rented flat.');
    s.version = 2;
  }
  if (s.version === 2) {
    for (const [k, v] of Object.entries(round4Fields())) if (!(k in s)) s[k] = v;
    // Round 3 purchases get a deal id and the fields the new reports use; their past ledger
    // entries (found by property name) are tagged so the history still adds up.
    for (const [id, p] of Object.entries(s.properties)) {
      if (p.uid) continue;
      const name = LOCATIONS[id].name;
      p.uid = `deal${s.nextId++}`;
      p.price ??= Math.round(p.paid / (1 + PROPERTY_RULES.stampDuty));
      p.duty ??= p.paid - p.price;
      p.fee ??= 0; p.marketAtPurchase ??= p.price; p.phaseAtPurchase ??= 'unknown'; p.hood = PROPERTIES[id].hood;
      p.loanUid = null; p.down = p.price; p.vacantMonths ??= 0; p.letMonths ??= 0;
      if (p.status === 'listed') p.listedDay ??= s.day;
      for (const e of s.ledger) if (!e.deal && e.memo?.includes(name) && ['property_buy', 'rent_income', 'upkeep'].includes(e.category)) { e.deal = p.uid; e.prop = id; }
    }
    logEvent(s, 'bank', 'Save upgraded to Round 4 — Nidhi Bank, loans and the housing market are now open.');
    s.version = 3;
  }
  return s;
}

export function loadGame(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    const s = raw && JSON.parse(raw);
    if (s && s.version <= SAVE_VERSION && s.version >= 1) return migrate(s);
  } catch { /* corrupt or unavailable storage → fresh game */ }
  return newGame();
}

export function saveGame(storage, state) {
  try { storage?.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

export function logEvent(state, type, text, extra = {}) {
  state.events.push({ id: state.nextId++, day: state.day, type, text, ...extra });
}
