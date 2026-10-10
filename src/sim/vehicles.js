// Vehicle ownership (rules also shown at the dealership):
//  • One of each model at most. Buying charges the full price; the car becomes your active car
//    if you don't have one.
//  • On every 1st you pay each owned car's monthly insurance + servicing. If you can't, the amount
//    becomes arrears and that car can't be driven until you pay it off.
//  • Fuel is charged for the distance you actually drive (on leaving the car). You need ₹100 in
//    your wallet to start a trip, and the car stalls if the trip's fuel would exceed your wallet.
//  • Dealer buy-back = price × 85% × 0.99^months owned (floor 25%), minus unpaid arrears.
import { VEHICLES, RESALE, PX_PER_KM, MIN_FUEL_MONEY } from '../data/vehicles.js';
import { post, pay, recordFailure, spendable, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { monthsBetween, monthKey, inr } from './util.js';

export const findVehicle = (state, uid) => state.vehicles.find(v => v.uid === uid);
export const activeVehicle = state => findVehicle(state, state.activeVehicle) ?? null;

export function vehicleValue(state, v) {
  const m = VEHICLES[v.model];
  const f = Math.max(RESALE.floor, RESALE.initial * Math.pow(RESALE.monthly, monthsBetween(v.boughtDay, state.day)));
  return Math.round(m.price * f);
}
export const resaleOffer = (state, v) => Math.max(0, vehicleValue(state, v) - (v.arrears ?? 0));

export function buyVehicle(state, model, token) {
  const m = VEHICLES[model];
  if (!m) return { ok: false, reason: 'unknown_model' };
  if (state.vehicles.some(v => v.model === model)) return { ok: false, reason: 'already_owned' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  if (spendable(state) < m.price) return { ok: false, reason: 'insufficient_funds', total: m.price };
  pay(state, { amount: m.price, category: 'vehicle_buy', memo: `Bought ${m.name}`, ref: token });
  const v = { uid: `v${state.nextId++}`, model, boughtDay: state.day, price: m.price, arrears: 0, parked: null };
  state.vehicles.push(v);
  state.activeVehicle ??= v.uid;
  logEvent(state, 'vehicle', `Bought a ${m.name} for ${inr(m.price)}`);
  return { ok: true, vehicle: v };
}

export function sellVehicle(state, uid, token) {
  const v = findVehicle(state, uid);
  if (!v) return { ok: false, reason: 'not_owned' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const value = vehicleValue(state, v), offer = resaleOffer(state, v);
  post(state, { amount: offer, category: 'vehicle_sell', memo: `Sold ${VEHICLES[v.model].name} to Roadstar (${inr(value)}${v.arrears ? ` − ${inr(v.arrears)} unpaid costs` : ''})`, ref: token });
  state.vehicles = state.vehicles.filter(x => x.uid !== uid);
  if (state.activeVehicle === uid) state.activeVehicle = state.vehicles[0]?.uid ?? null;
  logEvent(state, 'vehicle', `Sold ${VEHICLES[v.model].name} for ${inr(offer)}`);
  return { ok: true, amount: offer };
}

export function setActiveVehicle(state, uid) {
  const v = findVehicle(state, uid);
  if (!v) return { ok: false, reason: 'not_owned' };
  const prev = activeVehicle(state);
  if (prev && prev !== v) { v.parked = prev.parked; prev.parked = null; }   // swapped at the same parking spot
  state.activeVehicle = uid;
  return { ok: true };
}

export function canDrive(state, v) {
  if (!v) return { ok: false, reason: 'no_vehicle' };
  if (v.arrears > 0) return { ok: false, reason: 'arrears' };
  if (spendable(state) < MIN_FUEL_MONEY) return { ok: false, reason: 'no_fuel_money' };
  return { ok: true };
}

export const tripFuelCost = (v, px) => Math.round(px / PX_PER_KM * VEHICLES[v.model].fuelPerKm);

// Called when you leave the car. Charges what you can; any shortfall becomes arrears.
export function chargeFuel(state, uid, px) {
  const v = findVehicle(state, uid);
  if (!v) return { ok: false, reason: 'not_owned' };
  const cost = tripFuelCost(v, px);
  if (cost <= 0) return { ok: true, cost: 0 };
  const paid = Math.min(cost, spendable(state));
  if (paid > 0) pay(state, { amount: paid, category: 'fuel', memo: `Fuel — ${VEHICLES[v.model].name}, ${(px / PX_PER_KM).toFixed(2)} km` });
  if (paid < cost) v.arrears += cost - paid;
  return { ok: true, cost, paid };
}

// Monthly, on the 1st.
export function payVehicleCosts(state) {
  const notes = [];
  for (const v of state.vehicles) {
    const m = VEHICLES[v.model];
    const ref = `veh-${v.uid}-${monthKey(state.day)}`;
    if (tokenUsed(state, ref) || v.lastBilled === monthKey(state.day)) continue;      // once per month
    v.lastBilled = monthKey(state.day);
    if (pay(state, { amount: m.monthly, category: 'vehicle_costs', memo: `Insurance & servicing — ${m.name}`, ref }).ok) continue;
    {
      recordFailure(state, { attempted: -m.monthly, category: 'vehicle_costs', memo: `Insurance & servicing — ${m.name} — unpaid` });
      v.arrears += m.monthly;
      notes.push({ kind: 'error', text: `Couldn't pay ${inr(m.monthly)} for your ${m.name}. It can't be driven until you settle it at Roadstar Motors.` });
    }
  }
  return notes;
}

export function payVehicleArrears(state, uid) {
  const v = findVehicle(state, uid);
  if (!v?.arrears) return { ok: false, reason: 'nothing_owed' };
  const r = pay(state, { amount: v.arrears, category: 'vehicle_costs', memo: `Settled unpaid costs — ${VEHICLES[v.model].name}` });
  if (!r.ok) return r;
  v.arrears = 0;
  return { ok: true };
}

export const ownedVehicleValue = state => state.vehicles.reduce((s, v) => s + vehicleValue(state, v), 0);
