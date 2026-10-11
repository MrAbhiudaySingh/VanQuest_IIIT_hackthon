import { ITEMS, SHOPS } from '../data/catalog.js';
import { spendable, pay, tokenUsed } from './ledger.js';
import { isPosInt } from './util.js';
import { canFurnish } from './property.js';

export const ownedCount = (state, id) => {
  const item = ITEMS[id];
  if (item.kind === 'furniture') return state.furniture.filter(f => f.itemId === id).length;
  if (item.kind === 'grocery' || item.kind === 'household') return state.pantry[id] ?? 0;
  return state.owned[id] ?? 0;
};

export function addItems(state, id, qty) {
  const item = ITEMS[id];
  if (item.kind === 'grocery' || item.kind === 'household') state.pantry[id] = (state.pantry[id] ?? 0) + qty;
  else if (item.kind === 'furniture') for (let i = 0; i < qty; i++) state.furniture.push({ uid: `f${state.nextId++}`, itemId: id, home: null, x: 0, y: 0 });
  else state.owned[id] = (state.owned[id] ?? 0) + qty;
}

// Validates a cart without touching state. cart = { itemId: qty }.
export function quote(state, shopId, cart) {
  const shop = SHOPS[shopId];
  if (!shop) return { ok: false, reason: 'unknown_shop' };
  const lines = [];
  for (const [id, qty] of Object.entries(cart)) {
    if (qty === 0) continue;
    if (!shop.items.includes(id)) return { ok: false, reason: 'not_sold_here', id };
    if (!isPosInt(qty)) return { ok: false, reason: 'invalid_quantity', id };
    const item = ITEMS[id];
    if (item.limit && ownedCount(state, id) + qty > item.limit) return { ok: false, reason: 'limit', id, limit: item.limit };
    lines.push({ id, qty, price: item.price, total: item.price * qty });
  }
  if (!lines.length) return { ok: false, reason: 'empty' };
  const total = lines.reduce((s, l) => s + l.total, 0);
  if (total > spendable(state)) return { ok: false, reason: 'insufficient_funds', total, lines };
  return { ok: true, total, lines };
}

// Charges once per confirmation `token`, then delivers items. Nothing changes on failure.
export function purchase(state, shopId, cart, token) {
  if (!token) return { ok: false, reason: 'missing_token' };
  if (tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const q = quote(state, shopId, cart);
  if (!q.ok) return q;
  const memo = q.lines.map(l => `${l.qty}× ${ITEMS[l.id].name}`).join(', ');
  const paid = pay(state, { amount: q.total, category: 'purchase', memo, ref: token });
  if (!paid.ok) return paid;
  for (const e of paid.entries) e.shop = shopId;    // both legs (cash and savings) say where the money went
  for (const l of q.lines) addItems(state, l.id, l.qty);
  return { ok: true, total: q.total, lines: q.lines };
}

// ---------------------------------------------------------------- furniture
export const furnitureIn = (state, home) => state.furniture.filter(f => f.home === home);
export const furnitureStored = state => state.furniture.filter(f => f.home === null);

export function placeFurniture(state, uid, home, x, y) {
  const f = state.furniture.find(f => f.uid === uid);
  if (!f) return { ok: false, reason: 'not_owned' };
  if (!canFurnish(state, home)) return { ok: false, reason: 'not_your_home' };
  Object.assign(f, { home, x, y });
  return { ok: true };
}
export function storeFurniture(state, uid) {
  const f = state.furniture.find(f => f.uid === uid);
  if (!f) return { ok: false, reason: 'not_owned' };
  Object.assign(f, { home: null, x: 0, y: 0 });
  return { ok: true };
}
