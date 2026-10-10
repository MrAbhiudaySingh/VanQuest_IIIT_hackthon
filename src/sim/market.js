// Simulated market. price(asset, day) is a deterministic geometric random walk seeded
// by (asset, day), times any scheduled events (e.g. a trial result planted by an
// encounter). Same save → same prices, so results are explainable and testable.
import { ASSETS, TRADE_FEE } from '../data/market.js';
import { balance, post, tokenUsed } from './ledger.js';
import { gauss, isPosInt, inr } from './util.js';

const walkCache = {};
function basePrice(id, day) {
  const a = ASSETS[id];
  const c = walkCache[id] ??= [Math.log(a.start)];
  const mu = a.drift / 365, sig = a.vol / Math.sqrt(365);
  for (let d = c.length; d <= day; d++) c.push(c[d - 1] + mu - sig * sig / 2 + sig * gauss('px', id, d));
  return Math.exp(c[Math.max(0, day)]);
}

export function price(state, id, day = state.day) {
  let p = basePrice(id, day);
  for (const e of state.marketEvents) if (e.asset === id && day >= e.day) p *= e.factor;
  return Math.round(p * 100) / 100;
}

export const history = (state, id, days = 30) =>
  Array.from({ length: days }, (_, i) => price(state, id, Math.max(0, state.day - days + 1 + i)));

export function portfolio(state) {
  const rows = Object.entries(state.brokerage.holdings).map(([id, h]) => {
    const px = price(state, id), value = Math.round(h.qty * px);
    return { id, qty: h.qty, cost: h.cost, price: px, value, pnl: value - h.cost, pnlPct: h.cost ? (value - h.cost) / h.cost : 0 };
  });
  const invested = rows.reduce((s, r) => s + r.value, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const cash = balance(state, 'brokerage');
  const realized = state.brokerage.trades.reduce((s, t) => s + (t.realized ?? 0), 0);
  return { rows, cash, invested, total: cash + invested, cost, unrealized: invested - cost, realized };
}

export function quoteTrade(state, id, side, qty) {
  if (!ASSETS[id]) return { ok: false, reason: 'unknown_asset' };
  if (!isPosInt(qty)) return { ok: false, reason: 'invalid_quantity' };
  const px = price(state, id), gross = Math.round(px * qty);
  if (side === 'buy') {
    const net = gross + TRADE_FEE;
    if (net > balance(state, 'brokerage')) return { ok: false, reason: 'insufficient_funds', net };
    return { ok: true, side, id, qty, price: px, gross, fee: TRADE_FEE, net };
  }
  if (side === 'sell') {
    const held = state.brokerage.holdings[id]?.qty ?? 0;
    if (qty > held) return { ok: false, reason: 'not_enough_units', held };
    return { ok: true, side, id, qty, price: px, gross, fee: TRADE_FEE, net: gross - TRADE_FEE };
  }
  return { ok: false, reason: 'invalid_side' };
}

export function trade(state, id, side, qty, token) {
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const q = quoteTrade(state, id, side, qty);
  if (!q.ok) return q;
  const b = state.brokerage;
  let realized = null;
  if (side === 'buy') {
    post(state, { account: 'brokerage', amount: -q.net, category: 'trade', memo: `Buy ${qty} ${id} @ ${inr(q.price)} + ${inr(q.fee)} fee`, ref: token });
    const h = b.holdings[id] ??= { qty: 0, cost: 0 };
    h.qty += qty; h.cost += q.net;                     // fee is part of cost basis
  } else {
    const h = b.holdings[id];
    const costOut = Math.round(h.cost * qty / h.qty);  // average-cost method
    realized = q.net - costOut;
    post(state, { account: 'brokerage', amount: q.net, category: 'trade', memo: `Sell ${qty} ${id} @ ${inr(q.price)} − ${inr(q.fee)} fee`, ref: token });
    h.qty -= qty; h.cost -= costOut;
    if (h.qty === 0) delete b.holdings[id];
  }
  const t = { id: state.nextId++, day: state.day, asset: id, side, qty, price: q.price, gross: q.gross, fee: q.fee, net: q.net, realized };
  b.trades.push(t);
  return { ok: true, trade: t };
}
