// Food, hunger and health — one rule set, run once per in-game day by the clock:
//  1. Calories available today = Σ (usePerDay × kcal per unit) of every grocery you have in stock.
//     You are FED if that reaches 90% of the 2,000 kcal a day your body needs.
//  2. Hunger (0 full … 100 starving): fed → −25; not fed → +50 × (share of calories missing).
//  3. Health (0 … 100): hunger ≥ 80 → −4/day · hunger ≥ 50 → −1/day · hunger < 30 → +1/day.
//     Having no home: no recovery and another −1/day (so −1/day even when well fed).
//  4. Health 0 = death. With no food at all that takes about four weeks, with warnings first.
// No real-time timers: nothing here runs unless the in-game clock advances.
import { ITEMS, SHOPS } from '../data/catalog.js';
import { logEvent } from './state.js';
import { fmtShortDate } from './util.js';

export const KCAL_NEED = 2000;
export const FED_SHARE = 0.9;
export const RESERVE_DAYS = 7;                 // recommended minimum stock = one week of use

const groceries = () => SHOPS.market_grocery.items;

export function caloriesAvailable(pantry) {
  let kcal = 0;
  for (const [id, q] of Object.entries(pantry)) if (q > 0 && ITEMS[id].kind === 'grocery') kcal += ITEMS[id].usePerDay * ITEMS[id].kcal;
  return kcal;
}

// Daily step: update hunger/health from today's stock. Returns notes.
export function nutritionDay(state) {
  const notes = [];
  const kcal = caloriesAvailable(state.pantry), share = Math.min(1, kcal / KCAL_NEED), fed = share >= FED_SHARE;
  state.hunger = fed ? Math.max(0, state.hunger - 25) : Math.min(100, state.hunger + Math.round(50 * (1 - share)));
  let dh = state.hunger >= 80 ? -4 : state.hunger >= 50 ? -1 : state.hunger < 30 ? 1 : 0;
  if (!state.housing) dh = Math.min(dh, 0) - 1;
  state.health = Math.max(0, Math.min(100, state.health + dh));
  const st = state.stats;
  if (!fed) st.daysUnfed++;
  if (state.hunger >= 50) st.daysHungry++;
  st.minHealth = Math.min(st.minHealth, state.health);

  const f = state.flags, latch = (key, on, off, note) => {
    if (on && !f[key]) { f[key] = true; notes.push(note); logEvent(state, 'health', note.text); }
    else if (off) f[key] = false;
  };
  latch('hungry', state.hunger >= 50, state.hunger < 30, { kind: 'warn', text: `You're going hungry (${fmtShortDate(state.day)}). Buy groceries — health drops while you're hungry.` });
  latch('ill', state.health < 50, state.health >= 60, { kind: 'error', text: `Your health is suffering (${state.health}/100) from not eating enough.` });
  latch('critical', state.health < 20, state.health >= 30, { kind: 'error', text: `You are seriously ill from malnutrition (${state.health}/100). You need food now.` });

  if (state.health <= 0) {
    state.status = 'dead';
    state.death = { day: state.day, cause: 'malnutrition' };
    logEvent(state, 'health', 'Died of malnutrition');
    notes.push({ kind: 'error', text: 'You have died of malnutrition.' });
  }
  return notes;
}

// How many days will the current stock keep you fed (no new purchases)? Simulates the same rules.
export function forecastFedDays(state, max = 60) {
  const pantry = { ...state.pantry }, use = { ...state.consumption };
  for (let d = 0; d < max; d++) {
    if (caloriesAvailable(pantry) < KCAL_NEED * FED_SHARE) return d;
    for (const id of Object.keys(pantry)) {
      const need = (use[id] ?? 0) + ITEMS[id].usePerDay, whole = Math.floor(need + 1e-9);
      use[id] = need - whole;
      if (whole) { pantry[id] = Math.max(0, pantry[id] - whole); if (!pantry[id]) delete pantry[id]; }
    }
  }
  return max;
}

export function nextDeliveryDay(state) {
  const p = state.groceryPlan;
  return p?.status === 'active' && p.mode === 'delivery' ? p.nextBillingDay : null;
}

// Per-item pantry report for the UI.
export function pantryReport(state) {
  const next = nextDeliveryDay(state);
  const rows = groceries().map(id => {
    const it = ITEMS[id], qty = state.pantry[id] ?? 0;
    const daysLeft = qty ? Math.floor((qty - (state.consumption[id] ?? 0)) / it.usePerDay + 1e-9) : 0;
    const reserve = Math.max(1, Math.ceil(it.usePerDay * RESERVE_DAYS));
    const planned = next !== null && state.groceryPlan.items[id] ? state.groceryPlan.items[id] : 0;
    const coverDays = planned ? next - state.day : RESERVE_DAYS;
    return { id, name: it.name, unit: it.unit, qty, use: it.usePerDay, daysLeft, reserve, planned, coverDays,
      sufficient: daysLeft >= coverDays, replenishQty: Math.max(0, reserve - qty), replenishCost: Math.max(0, reserve - qty) * it.price, kcalPerDay: Math.round(it.usePerDay * it.kcal) };
  });
  const fedDays = forecastFedDays(state);
  const untilDelivery = next === null ? null : next - state.day;
  return { rows, fedDays, untilDelivery, enough: untilDelivery === null ? fedDays >= RESERVE_DAYS : fedDays >= untilDelivery,
    kcalToday: Math.round(caloriesAvailable(state.pantry)), replenishTotal: rows.reduce((s, r) => s + r.replenishCost, 0) };
}

// Daily: warn once when food is about to run out (before hunger starts).
export function lowFoodWarning(state) {
  const days = forecastFedDays(state, 10);
  const f = state.flags;
  if (days < 3 && !f.lowFood) { f.lowFood = true; return { kind: 'warn', text: days === 0 ? 'Your pantry can\'t feed you today — buy groceries.' : `Food runs out in ~${days} day${days > 1 ? 's' : ''}. Restock at FreshCart or check your grocery plan.` }; }
  if (days >= 5) f.lowFood = false;
  return null;
}
