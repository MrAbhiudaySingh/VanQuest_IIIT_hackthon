// Monthly Grocery Plan — billing rules (also shown to the player in the UI):
//  • The plan is billed on the 1st of every in-game month, never on the day you save it.
//  • Bill = Σ(item price × qty) + ₹40 delivery fee (delivery mode) or ₹0 (collect mode).
//  • Paid + delivery → items go straight into the pantry.
//    Paid + collect  → an order waits at FreshCart until you collect it (no extra charge).
//  • Not enough money → nothing is charged, the plan is PAUSED, and a failed entry is
//    recorded in your financial history. Resume it when you can pay.
//  • Buying groceries individually is a separate purchase; it never changes or refunds
//    the plan bill. The plan only ever charges once per month.
import { ITEMS, SHOPS, GROCERY_DELIVERY_FEE } from '../data/catalog.js';
import { pay, recordFailure, spendable } from './ledger.js';
import { addItems } from './inventory.js';
import { logEvent } from './state.js';
import { nextMonthStart, isPosInt, inr } from './util.js';

const ELIGIBLE = new Set(SHOPS.market_grocery.items);

export function planCost(items, mode) {
  const goods = Object.entries(items).reduce((s, [id, q]) => s + ITEMS[id].price * q, 0);
  return { goods, fee: mode === 'delivery' ? GROCERY_DELIVERY_FEE : 0, total: goods + (mode === 'delivery' ? GROCERY_DELIVERY_FEE : 0) };
}

export function savePlan(state, items, mode) {
  const clean = {};
  for (const [id, q] of Object.entries(items)) {
    if (q === 0) continue;
    if (!ELIGIBLE.has(id)) return { ok: false, reason: 'not_eligible', id };
    if (!isPosInt(q)) return { ok: false, reason: 'invalid_quantity', id };
    clean[id] = q;
  }
  if (!Object.keys(clean).length) return { ok: false, reason: 'empty' };
  if (mode !== 'delivery' && mode !== 'pickup') return { ok: false, reason: 'invalid_mode' };
  const wasActive = state.groceryPlan?.status === 'active';
  state.groceryPlan = { items: clean, mode, status: 'active', pausedReason: null, nextBillingDay: nextMonthStart(state.day), createdDay: state.groceryPlan?.createdDay ?? state.day };
  logEvent(state, 'grocery_plan', `${wasActive ? 'Updated' : 'Started'} monthly grocery plan (${inr(planCost(clean, mode).total)}/month)`);
  return { ok: true, plan: state.groceryPlan };
}

export function setPlanStatus(state, status) {
  const p = state.groceryPlan;
  if (!p || p.status === 'cancelled') return { ok: false, reason: 'no_plan' };
  if (!['active', 'paused', 'cancelled'].includes(status)) return { ok: false, reason: 'invalid_status' };
  p.status = status;
  p.pausedReason = status === 'paused' ? 'by_player' : null;
  if (status === 'active') p.nextBillingDay = nextMonthStart(state.day);
  logEvent(state, 'grocery_plan', { active: 'Resumed', paused: 'Paused', cancelled: 'Cancelled' }[status] + ' monthly grocery plan');
  return { ok: true };
}

// Called by the clock on the 1st of each month. Returns a notification (or null).
export function billPlan(state) {
  const p = state.groceryPlan;
  if (!p || p.status !== 'active' || state.day < p.nextBillingDay) return null;
  const { total } = planCost(p.items, p.mode);
  const memo = `Monthly grocery plan (${p.mode === 'delivery' ? 'home delivery' : 'collect at FreshCart'})`;
  const ref = `plan-${state.day}`;
  p.nextBillingDay = nextMonthStart(state.day);
  if (spendable(state) < total) {
    recordFailure(state, { attempted: -total, category: 'grocery_plan', memo: `${memo} — payment declined, plan paused`, ref });
    p.status = 'paused';
    p.pausedReason = 'insufficient_funds';
    logEvent(state, 'grocery_plan', `Grocery plan paused: ${inr(total)} due but only ${inr(spendable(state))} available`);
    return { kind: 'error', text: `Grocery plan payment of ${inr(total)} failed (insufficient funds). Plan paused — nothing was charged.` };
  }
  pay(state, { amount: total, category: 'grocery_plan', memo, ref });
  if (p.mode === 'delivery') {
    for (const [id, q] of Object.entries(p.items)) addItems(state, id, q);
    return { kind: 'ok', text: `Groceries delivered — ${inr(total)} charged for your monthly plan.` };
  }
  state.pickupOrders.push({ id: ref, items: { ...p.items }, paidDay: state.day });
  return { kind: 'ok', text: `Grocery plan paid (${inr(total)}). Your order is ready to collect at FreshCart.` };
}

export function collectOrders(state) {
  if (!state.pickupOrders.length) return { ok: false, reason: 'nothing_to_collect' };
  for (const o of state.pickupOrders) for (const [id, q] of Object.entries(o.items)) addItems(state, id, q);
  const n = state.pickupOrders.length;
  state.pickupOrders = [];
  logEvent(state, 'grocery_plan', `Collected ${n} grocery order${n > 1 ? 's' : ''} from FreshCart`);
  return { ok: true, count: n };
}

// Household consumption — deterministic: every stocked item's usePerDay accumulates
// daily and each time it reaches a whole unit, one unit leaves the pantry. Items you
// don't have aren't used. Running out is reported (once, on the day it happens).
export function consumeDay(state) {
  const ranOut = [];
  for (const id of Object.keys(state.pantry)) {
    const item = ITEMS[id];
    const need = (state.consumption[id] ?? 0) + item.usePerDay;
    const whole = Math.floor(need + 1e-9);
    state.consumption[id] = need - whole;
    if (!whole) continue;
    state.pantry[id] = Math.max(0, state.pantry[id] - whole);
    if (state.pantry[id] === 0) {
      delete state.pantry[id];
      delete state.consumption[id];
      ranOut.push(item.name);
    }
  }
  return ranOut;
}
