// Property market rules (shown to the player in the agent's and bank's menus):
//  • Market value follows the neighbourhood and the housing-market cycle (sim/housingMarket.js);
//    it only changes on the 1st. Sellers ask a price that can be above or below that estimate.
//  • Buying costs the asking price + 6% stamp duty & registration — paid in full, or with a home
//    loan (down payment + loan; stamp duty and the loan fee are always paid from your money).
//  • Selling pays the market value − 2% agent fee − any unpaid upkeep; every loan secured on the
//    property is repaid from the proceeds first. If the proceeds can't cover the loans, you must
//    have the difference, or you can't sell. You can't sell the home you live in — move out first.
//  • Renting a home: the first month's rent (the market rent when you sign, fixed for the tenancy)
//    is charged when you sign, then on every 1st. Moving anywhere else ends it. Two unpaid rents in
//    a row → evicted.
//  • Renting yours out: list a vacant owned property. A tenant moves in on the 1st once the
//    neighbourhood's vacancy period has passed (0–2 extra months) and pays the current market rent
//    every 1st (the agent keeps 5%). One tenant per property, one payment per month.
//  • Owners pay monthly upkeep for every property they own, lived in, vacant or let.
//  • Furniture belongs to a property. Leaving a rental, letting a property or selling it packs its
//    movable furniture into storage. Built-in fixtures stay.
import { PROPERTIES, NEIGHBOURHOODS, PROPERTY_RULES as R } from '../data/properties.js';
import { LOCATIONS } from '../data/locations.js';
import { LENDING_RULES } from '../data/lending.js';
import { post, pay, recordFailure, spendable, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { monthKey, monthsBetween, inr } from './util.js';
import { propertyValue, marketRent, askingPrice, marketPhase } from './housingMarket.js';
import { mortgageQuote, originateMortgage, securedBalance, securedOn, settleLoansOn } from './loans.js';

export { propertyValue, marketRent, askingPrice };
export const propName = id => LOCATIONS[id].name;

export function buyCost(id, day) {
  const price = askingPrice(id, day), duty = Math.round(price * R.stampDuty);
  return { price, value: propertyValue(id, day), duty, total: price + duty };
}
export const saleProceeds = (state, id) => {
  const v = propertyValue(id, state.day), fee = Math.round(v * R.sellFee), arrears = state.properties[id]?.arrears ?? 0;
  const debt = securedBalance(state, id), net = v - fee - arrears;
  return { value: v, fee, arrears, net, debt, toYou: net - debt };
};
export const isOwned = (state, id) => !!state.properties[id];
export const homeId = state => state.housing?.propertyId ?? null;

// Access rule — the single check used by the router, the interior scene and furniture placement:
//  • your current home (rented or owned) → yes
//  • a property you own that is vacant → yes
//  • a property you own that is listed for or let to a tenant → no (manage it from outside)
//  • anything you neither own nor rent → no
export function canEnter(state, id) {
  if (homeId(state) === id) return { ok: true };
  const p = state.properties[id];
  if (!p) return { ok: false, reason: 'no_access' };
  if (p.status === 'let' || p.status === 'listed') return { ok: false, reason: 'tenant_occupied' };
  return { ok: true };
}
export const canFurnish = (state, id) => canEnter(state, id).ok;

function clearFurniture(state, id) {
  let n = 0;
  for (const f of state.furniture) if (f.home === id) { f.home = null; f.x = 0; f.y = 0; n++; }
  if (n) logEvent(state, 'furniture', `${n} furniture piece(s) from ${propName(id)} moved to storage`);
}

// Leave wherever you live now (ending a tenancy, or making your owned home vacant).
function leaveCurrentHome(state, nextId) {
  const h = state.housing;
  if (!h || h.propertyId === nextId) return;
  if (h.kind === 'rent') {
    clearFurniture(state, h.propertyId);
    logEvent(state, 'housing', `Moved out of ${propName(h.propertyId)} — tenancy ended`);
  } else if (state.properties[h.propertyId]) state.properties[h.propertyId].status = 'vacant';
}

// financing: null (cash) or { downPct, years } for a home loan.
export function buyProperty(state, id, token, financing = null) {
  if (!PROPERTIES[id]) return { ok: false, reason: 'unknown_property' };
  if (isOwned(state, id)) return { ok: false, reason: 'already_owned' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const c = buyCost(id, state.day);
  let q = null;
  if (financing) {
    q = mortgageQuote(state, id, financing.downPct, financing.years);
    if (!q.ok) return { ok: false, reason: 'not_eligible', quote: q };
  } else if (spendable(state) < c.total) return { ok: false, reason: 'insufficient_funds', total: c.total };
  const deal = `deal${state.nextId++}`;
  // the loan (if any) is disbursed to the seller first, then the whole price + duty is paid
  const loan = q ? originateMortgage(state, q, deal) : null;
  pay(state, { amount: c.total, category: 'property_buy', memo: `Bought ${propName(id)} (${inr(c.price)} + ${inr(c.duty)} stamp duty)${loan ? ` — ${inr(q.principal)} of it by home loan` : ''}`, ref: token, prop: id, deal });
  // if you were renting this very place, the tenancy simply converts to ownership
  const wasRentingIt = state.housing?.kind === 'rent' && state.housing.propertyId === id;
  state.properties[id] = {
    uid: deal, boughtDay: state.day, price: c.price, duty: c.duty, fee: q?.fee ?? 0, paid: c.total,
    marketAtPurchase: c.value, phaseAtPurchase: marketPhase(state.day), hood: PROPERTIES[id].hood,
    loanUid: loan?.uid ?? null, down: q ? q.down : c.price, status: wasRentingIt ? 'home' : 'vacant', arrears: 0, vacantMonths: 0, letMonths: 0,
  };
  if (wasRentingIt) state.housing = { kind: 'own', propertyId: id };
  logEvent(state, 'property', `Bought ${propName(id)} for ${inr(c.total)}${loan ? ` with a ${inr(q.principal)} home loan` : ' in cash'}`);
  return { ok: true, cost: c, loan };
}

export function moveIn(state, id) {
  const p = state.properties[id];
  if (!p) return { ok: false, reason: 'not_owned' };
  if (homeId(state) === id) return { ok: false, reason: 'already_home' };
  if (p.status !== 'vacant') return { ok: false, reason: 'has_tenant' };
  leaveCurrentHome(state, id);
  p.status = 'home';
  state.housing = { kind: 'own', propertyId: id };
  state.residence = id;
  logEvent(state, 'housing', `Moved into your own home: ${propName(id)}`);
  return { ok: true };
}

export function rentHome(state, id, token) {
  if (!PROPERTIES[id]) return { ok: false, reason: 'unknown_property' };
  if (isOwned(state, id)) return { ok: false, reason: 'you_own_it' };
  if (homeId(state) === id) return { ok: false, reason: 'already_home' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const rent = marketRent(id, state.day);
  if (spendable(state) < rent) return { ok: false, reason: 'insufficient_funds', total: rent };
  pay(state, { amount: rent, category: 'rent', memo: `First month's rent — ${propName(id)}`, ref: token, prop: id });
  leaveCurrentHome(state, id);
  state.housing = { kind: 'rent', propertyId: id, rent, since: state.day, paidMonth: monthKey(state.day), missed: 0 };
  state.residence = id;
  logEvent(state, 'housing', `Signed a tenancy for ${propName(id)} at ${inr(rent)}/month`);
  return { ok: true, rent };
}

export function listForRent(state, id) {
  const p = state.properties[id];
  if (!p) return { ok: false, reason: 'not_owned' };
  if (homeId(state) === id) return { ok: false, reason: 'is_home' };
  if (p.status !== 'vacant') return { ok: false, reason: 'already_listed' };
  p.status = 'listed';
  p.listedDay = state.day;
  clearFurniture(state, id);
  const wait = NEIGHBOURHOODS[PROPERTIES[id].hood].vacancy;
  logEvent(state, 'property', `Listed ${propName(id)} for rent — a tenant moves in on the 1st${wait ? ` after about ${wait} more month(s) of searching` : ''}`);
  return { ok: true, extraMonths: wait };
}

export function stopRentingOut(state, id) {
  const p = state.properties[id];
  if (!p || !['listed', 'let'].includes(p.status)) return { ok: false, reason: 'not_let' };
  p.status = 'vacant';
  logEvent(state, 'property', `Tenant arrangement ended at ${propName(id)}`);
  return { ok: true };
}

function closeRecord(state, id, sale) {
  const p = state.properties[id];
  state.propertyHistory.push({ id, ...p, soldDay: state.day, sale });
  clearFurniture(state, id);
  delete state.properties[id];
}

export function sellProperty(state, id, token) {
  const p = state.properties[id];
  if (!p) return { ok: false, reason: 'not_owned' };
  if (homeId(state) === id) return { ok: false, reason: 'is_home' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const s = saleProceeds(state, id);
  if (s.toYou < 0 && spendable(state) < -s.toYou) return { ok: false, reason: 'negative_equity', shortfall: -s.toYou };
  post(state, { amount: s.net, category: 'property_sell', memo: `Sold ${propName(id)} (${inr(s.value)} − ${inr(s.fee)} fee${s.arrears ? ` − ${inr(s.arrears)} unpaid upkeep` : ''})`, ref: token, prop: id, deal: p.uid });
  const settled = settleLoansOn(state, id, `Sale of ${propName(id)}`);
  closeRecord(state, id, { value: s.value, fee: s.fee, arrears: s.arrears, net: s.net, settled, forced: false });
  logEvent(state, 'property', `Sold ${propName(id)} for ${inr(s.net)}${settled ? `; ${inr(settled)} went to repay its loans` : ''}`);
  return { ok: true, sale: s, settled };
}

// Loan default: the bank sells the collateral at a discount and repays itself.
export function repossess(state, loan) {
  const id = loan.propertyId, p = state.properties[id];
  if (!p) { loan.status = 'defaulted'; return []; }
  const value = propertyValue(id, state.day), price = Math.round(value * (1 - LENDING_RULES.forcedSaleDiscount));
  const debt = securedBalance(state, id);
  post(state, { amount: price, category: 'repossession', memo: `Bank sold ${propName(id)} after 3 missed EMIs (forced sale at ${inr(price)})`, prop: id, deal: p.uid });
  const pays = Math.min(price, debt);
  if (pays > 0) post(state, { amount: -pays, category: 'loan_settlement', memo: 'Forced sale proceeds repaid the bank', prop: id, deal: p.uid, loan: loan.uid });
  // the bank keeps what it is owed; any shortfall is written off (and recorded as a default)
  for (const l of securedOn(state, id)) Object.assign(l, { status: 'defaulted', closedDay: state.day, balance: 0 });
  loan.writtenOff = Math.max(0, debt - pays);
  state.credit.defaults.push({ day: state.day, loan: loan.uid, property: id });
  if (homeId(state) === id) { state.housing = null; state.residence = null; }
  closeRecord(state, id, { value, fee: 0, arrears: 0, net: price, settled: pays, forced: true });
  logEvent(state, 'loan', `Defaulted on ${propName(id)} — the bank sold it`);
  return [{ kind: 'error', text: `You missed 3 EMIs in a row. The bank sold ${propName(id)} for ${inr(price)} to repay itself${price > debt ? `; ${inr(price - debt)} was returned to you` : ''}. This default stays on your credit profile.` }];
}

// Monthly, on the 1st (called by the clock, in this order).
export function collectRents(state) {
  const notes = [];
  for (const [id, p] of Object.entries(state.properties)) {
    if (p.status === 'listed') {
      const waited = monthsBetween(p.listedDay, state.day), need = 1 + NEIGHBOURHOODS[PROPERTIES[id].hood].vacancy;
      if (waited >= need) { p.status = 'let'; p.tenantSince = state.day; logEvent(state, 'property', `A tenant moved into ${propName(id)}`); }
      else { p.vacantMonths++; continue; }
    }
    if (p.status === 'vacant') { p.vacantMonths++; continue; }
    if (p.status !== 'let') continue;
    const ref = `rentin-${id}-${monthKey(state.day)}`;
    if (tokenUsed(state, ref)) continue;
    const rent = marketRent(id, state.day), net = Math.round(rent * (1 - R.agentFee));
    post(state, { amount: net, category: 'rent_income', memo: `Rent from tenant — ${propName(id)} (${inr(rent)} − 5% agent fee)`, ref, prop: id, deal: p.uid });
    p.letMonths++;
    notes.push({ kind: 'ok', text: `Rent received: ${inr(net)} from your tenant at ${propName(id)}.` });
  }
  return notes;
}

export function payRent(state) {
  const h = state.housing;
  if (h?.kind !== 'rent' || h.paidMonth === monthKey(state.day)) return null;   // never twice a month
  const memo = `Rent — ${propName(h.propertyId)}`;
  const r = pay(state, { amount: h.rent, category: 'rent', memo, ref: `rent-${h.propertyId}-${monthKey(state.day)}`, prop: h.propertyId });
  if (r.ok) { h.paidMonth = monthKey(state.day); h.missed = 0; return null; }
  recordFailure(state, { attempted: -h.rent, category: 'rent', memo: `${memo} — unpaid (insufficient funds)`, prop: h.propertyId });
  h.paidMonth = monthKey(state.day);           // this month's attempt is done (missed), not retried
  h.missed++;
  if (h.missed >= R.missedRentToEvict) {
    const id = h.propertyId;
    clearFurniture(state, id);
    state.housing = null;
    state.residence = null;
    logEvent(state, 'housing', `Evicted from ${propName(id)} after ${R.missedRentToEvict} unpaid rents`);
    return { kind: 'error', text: `You were evicted from ${propName(id)} after missing rent twice. You have no home — your health will suffer until you rent or buy one (see the property agent).` };
  }
  return { kind: 'error', text: `Rent of ${inr(h.rent)} couldn't be paid. Miss it again next month and you'll be evicted.` };
}

export function payUpkeep(state) {
  const notes = [];
  for (const [id, p] of Object.entries(state.properties)) {
    const cost = PROPERTIES[id].upkeep, ref = `upkeep-${id}-${monthKey(state.day)}`;
    if (tokenUsed(state, ref) || state.ledger.some(e => e.status === 'failed' && e.category === 'upkeep' && e.prop === id && e.day === state.day)) continue;
    if (pay(state, { amount: cost, category: 'upkeep', memo: `Upkeep & property tax — ${propName(id)}`, ref, prop: id, deal: p.uid }).ok) continue;
    recordFailure(state, { attempted: -cost, category: 'upkeep', memo: `Upkeep — ${propName(id)} — unpaid, added to arrears`, prop: id });
    p.arrears = (p.arrears ?? 0) + cost;
    notes.push({ kind: 'error', text: `Couldn't pay ${inr(cost)} upkeep on ${propName(id)}. It's owed and will be taken from the sale price.` });
  }
  return notes;
}

export function payPropertyArrears(state, id) {
  const p = state.properties[id];
  if (!p?.arrears) return { ok: false, reason: 'nothing_owed' };
  const r = pay(state, { amount: p.arrears, category: 'upkeep', memo: `Paid upkeep arrears — ${propName(id)}`, prop: id, deal: p.uid });
  if (!r.ok) return r;
  p.arrears = 0;
  return { ok: true };
}

export const ownedPropertyValue = state => Object.keys(state.properties).reduce((s, id) => s + propertyValue(id, state.day), 0);
