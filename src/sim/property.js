// Property rules (shown to the player in the agent's and bank's menus). Numbers live in
// data/properties.js (PROPERTY_RULES, TENANCY, REPAIRS) and data/lending.js.
//  • Market value follows the neighbourhood's own index (sim/housingMarket.js); it changes on the 1st,
//    and every owned property's value is recorded monthly (p.valuations). Sellers ask a price that can
//    be above or below that estimate.
//  • Buying costs the asking price + 6% stamp duty & registration — paid in full, or with a home loan.
//  • Selling (voluntary): market value − 2% fee − unpaid upkeep − any tenant's deposit (returned out
//    of the proceeds) = net; then every loan on it is repaid at its payoff (balance + interest since
//    the last EMI). Anything left is yours; if the net doesn't cover the loans you must pay the
//    difference from cash/savings, or you can't sell. You can't sell the home you live in.
//  • Forced sale (3 missed EMIs): the bank sells at 15% below value and charges 2% sale costs; unpaid
//    upkeep and tenant deposits come out first, then the loans are repaid (mortgage first). A surplus
//    is paid to you; a shortfall stays owed as a "shortfall debt" repaid monthly — never written off.
//  • Renting a home: 2 months' deposit + the first month's rent when you sign; the rent is fixed for
//    the tenancy and due every 1st. Unpaid rent is owed; when the tenancy ends the deposit covers it
//    and the rest of the deposit is refunded. Unpaid rent beyond the deposit becomes a debt (0%, 6
//    months). Two unpaid rents in a row → evicted.
//  • Renting yours out: list a vacant property; a tenant moves in on the 1st after the neighbourhood's
//    search time, pays 2 months' deposit (held for them — a liability, not income) and the first
//    month's rent, then rent every 1st (the agent keeps 5%). 80% of tenants always pay on time; the
//    others sometimes pay late (on the 15th) or miss a month; two misses in a row and they leave.
//    Leases run 11/22/33 months. On move-out: the deposit covers unpaid rent and any damage, the rest
//    is refunded, you pay a wear-and-tear repair, and the property is re-listed (empty until the next
//    tenant). All seeded, so every outcome is reproducible.
//  • Owners pay monthly upkeep for every property, plus occasional repairs (4% chance a month).
//  • Furniture belongs to a property. Leaving a rental, letting a property or selling it packs its
//    movable furniture into storage. Built-in fixtures stay.
import { PROPERTIES, NEIGHBOURHOODS, PROPERTY_RULES as R, TENANCY as T, REPAIRS } from '../data/properties.js';
import { LOCATIONS } from '../data/locations.js';
import { LENDING_RULES } from '../data/lending.js';
import { post, pay, recordFailure, spendable, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { monthKey, monthsBetween, addMonths, hash01, inr } from './util.js';
import { propertyValue, marketRent, askingPrice, marketPhase } from './housingMarket.js';
import { mortgageQuote, originateMortgage, securedOn, securedPayoff, settleLoansOn, accruedInterest, payoffAmount, convertToDebt } from './loans.js';

export { propertyValue, marketRent, askingPrice };
export const propName = id => LOCATIONS[id].name;
const round100 = x => Math.round(x / 100) * 100;

export function buyCost(id, day) {
  const price = askingPrice(id, day), duty = Math.round(price * R.stampDuty);
  return { price, value: propertyValue(id, day), duty, total: price + duty };
}
// Deposits you hold for tenants (a liability until returned).
export const depositsHeld = p => (p.tenant?.deposit ?? 0) + (p.depositOwed ?? 0);
export const saleProceeds = (state, id) => {
  const p = state.properties[id], v = propertyValue(id, state.day), fee = Math.round(v * R.sellFee), arrears = p?.arrears ?? 0;
  const deposits = p ? depositsHeld(p) : 0, gross = v - fee - arrears, net = gross - deposits;
  const loans = securedOn(state, id), debt = securedPayoff(state, id), interest = loans.reduce((s, l) => s + accruedInterest(l, state.day), 0);
  return { value: v, fee, arrears, deposits, gross, net, debt, interest, loans: loans.length, toYou: net - debt };
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

// ------------------------------------------------------------------ your own tenancy
// End the tenancy you live in: the deposit covers unpaid rent, the rest comes back to you; unpaid
// rent beyond the deposit becomes a 0% debt to the landlord. Each tenancy is settled once.
function endTenancy(state, { keepFurniture = false } = {}) {
  const h = state.housing;
  if (h?.kind !== 'rent') return 0;
  const deposit = h.deposit ?? 0, owed = h.arrears ?? 0, kept = Math.min(deposit, owed), refund = deposit - kept;
  const ref = `deprefund-${h.uid ?? h.propertyId + h.since}`;
  if (refund > 0 && !tokenUsed(state, ref)) post(state, { amount: refund, category: 'deposit_refund', memo: `Deposit returned — ${propName(h.propertyId)}${kept ? ` (${inr(kept)} kept for unpaid rent)` : ''}`, ref, prop: h.propertyId });
  if (owed > kept) convertToDebt(state, 'rent_arrears', h.propertyId, owed - kept, 0, T.arrearsMonths);
  if (!keepFurniture) clearFurniture(state, h.propertyId);
  logEvent(state, 'housing', `Tenancy at ${propName(h.propertyId)} ended${refund ? ` — ${inr(refund)} deposit returned` : ''}${owed > kept ? `; ${inr(owed - kept)} unpaid rent is still owed` : ''}`);
  return refund;
}

// Leave wherever you live now (ending a tenancy, or making your owned home vacant).
function leaveCurrentHome(state, nextId) {
  const h = state.housing;
  if (!h || h.propertyId === nextId) return;
  if (h.kind === 'rent') endTenancy(state);
  else if (state.properties[h.propertyId]) state.properties[h.propertyId].status = 'vacant';
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
  // if you were renting this very place, the tenancy ends (deposit back) and you simply stay
  const wasRentingIt = state.housing?.kind === 'rent' && state.housing.propertyId === id;
  if (wasRentingIt) endTenancy(state, { keepFurniture: true });
  state.properties[id] = {
    uid: deal, boughtDay: state.day, price: c.price, duty: c.duty, fee: q?.fee ?? 0, paid: c.total,
    marketAtPurchase: c.value, phaseAtPurchase: marketPhase(state.day), hood: PROPERTIES[id].hood,
    loanUid: loan?.uid ?? null, down: q ? q.down : c.price, status: wasRentingIt ? 'home' : 'vacant', arrears: 0, vacantMonths: 0, letMonths: 0,
    tenant: null, pastTenants: [], depositOwed: 0, depositKeptRent: 0, depositKeptDamage: 0, rentLost: 0,
    valuations: [{ month: monthKey(state.day), value: c.value }],
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

export const rentTerms = (state, id) => { const rent = marketRent(id, state.day); return { rent, deposit: rent * T.depositMonths, total: rent * (1 + T.depositMonths) }; };

export function rentHome(state, id, token) {
  if (!PROPERTIES[id]) return { ok: false, reason: 'unknown_property' };
  if (isOwned(state, id)) return { ok: false, reason: 'you_own_it' };
  if (homeId(state) === id) return { ok: false, reason: 'already_home' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  const t = rentTerms(state, id), h = state.housing;
  const refundDue = h?.kind === 'rent' ? Math.max(0, (h.deposit ?? 0) - (h.arrears ?? 0)) : 0;
  if (spendable(state) + refundDue < t.total) return { ok: false, reason: 'insufficient_funds', total: t.total };
  leaveCurrentHome(state, id);
  pay(state, { amount: t.rent, category: 'rent', memo: `First month's rent — ${propName(id)}`, ref: token, prop: id });
  pay(state, { amount: t.deposit, category: 'deposit_paid', memo: `Security deposit (${T.depositMonths} months' rent) — ${propName(id)}, returned when you leave`, ref: `${token}-dep`, prop: id });
  state.housing = { kind: 'rent', uid: `ten${state.nextId++}`, propertyId: id, rent: t.rent, deposit: t.deposit, arrears: 0, since: state.day, paidMonth: monthKey(state.day), missed: 0 };
  state.residence = id;
  logEvent(state, 'housing', `Signed a tenancy for ${propName(id)} at ${inr(t.rent)}/month (${inr(t.deposit)} deposit)`);
  return { ok: true, rent: t.rent, deposit: t.deposit };
}

// ------------------------------------------------------------------ your tenants
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

function newTenant(state, id) {
  const uid = `tn${state.nextId++}`, rent = marketRent(id, state.day);
  const lease = T.leaseMonths[Math.floor(hash01('lease', uid) * T.leaseMonths.length)];
  return { uid, since: state.day, rent, deposit: rent * T.depositMonths, leaseEnd: addMonths(state.day, lease), lease,
    reliable: hash01('tenant', uid) < T.reliableShare, arrears: 0, missedRun: 0, late: null, lastMonth: monthKey(state.day), paidMonths: 0, lateMonths: 0, missedMonths: 0 };
}

// What a tenant does about one month's rent (seeded by tenant and month).
export function tenantOutcome(t, key) {
  if (t.reliable) return 'paid';
  const h = hash01('rentpay', t.uid, key);
  return h < T.irregular.missed ? 'missed' : h < T.irregular.missed + T.irregular.late ? 'late' : 'paid';
}

function receiveRent(state, id, key, late) {
  const p = state.properties[id], t = p.tenant, ref = `rentin-${id}-${key}`;
  if (tokenUsed(state, ref)) return null;
  const net = Math.round(t.rent * (1 - R.agentFee));
  post(state, { amount: net, category: 'rent_income', memo: `Rent from tenant${late ? ' (paid late)' : ''} — ${propName(id)} (${inr(t.rent)} − 5% agent fee)`, ref, prop: id, deal: p.uid });
  p.letMonths++;
  if (late) t.lateMonths++; else t.paidMonths++;
  return { kind: 'ok', text: `Rent received${late ? ' (late)' : ''}: ${inr(net)} from your tenant at ${propName(id)}.` };
}

// A tenant leaves: the deposit covers unpaid rent and damage, the rest is refunded; the owner pays
// for wear and tear. byOwner = you ended it (stays vacant); otherwise the property is re-listed.
function tenantLeaves(state, id, why, byOwner = false) {
  const p = state.properties[id], t = p.tenant, notes = [];
  const damage = hash01('damage', t.uid) < T.damageChance ? round100(t.rent * T.damageMax * hash01('damage-amt', t.uid)) : 0;
  const wear = round100(t.rent * T.wearRepair);
  const keptRent = Math.min(t.deposit, t.arrears), keptDamage = Math.min(t.deposit - keptRent, damage), refund = t.deposit - keptRent - keptDamage;
  p.depositKeptRent = (p.depositKeptRent ?? 0) + keptRent;
  p.depositKeptDamage = (p.depositKeptDamage ?? 0) + keptDamage;
  p.rentLost = (p.rentLost ?? 0) + (t.arrears - keptRent);
  if (refund > 0) {
    const r = pay(state, { amount: refund, category: 'tenant_deposit_refund', memo: `Tenant's deposit returned — ${propName(id)}${keptRent + keptDamage ? ` (${inr(keptRent + keptDamage)} kept for unpaid rent/damage)` : ''}`, ref: `tref-${t.uid}`, prop: id, deal: p.uid });
    if (!r.ok) { p.depositOwed = (p.depositOwed ?? 0) + refund; notes.push({ kind: 'error', text: `You couldn't return your tenant's ${inr(refund)} deposit at ${propName(id)}. You still owe it — it's retried every 1st and comes out of any sale.` }); }
  }
  const repair = wear + damage;
  if (!pay(state, { amount: repair, category: 'repair', memo: `Move-out repairs — ${propName(id)} (wear ${inr(wear)}${damage ? ` + damage ${inr(damage)}, covered by the deposit` : ''})`, ref: `trep-${t.uid}`, prop: id, deal: p.uid }).ok) {
    recordFailure(state, { attempted: -repair, category: 'repair', memo: `Move-out repairs — ${propName(id)} — unpaid, added to arrears`, prop: id });
    p.arrears = (p.arrears ?? 0) + repair;
  }
  (p.pastTenants ??= []).push({ uid: t.uid, since: t.since, left: state.day, why, rent: t.rent, reliable: t.reliable, paidMonths: t.paidMonths, lateMonths: t.lateMonths,
    missedMonths: t.missedMonths, deposit: t.deposit, keptRent, keptDamage, refund, repair });
  p.tenant = null;
  if (byOwner) p.status = 'vacant'; else { p.status = 'listed'; p.listedDay = state.day; }
  const reason = { lease_end: 'their lease ended', arrears: `they missed ${T.leaveAfterMissed} rents in a row`, owner: 'you ended the tenancy' }[why];
  logEvent(state, 'property', `Tenant left ${propName(id)} (${reason}): deposit ${inr(t.deposit)}, kept ${inr(keptRent + keptDamage)}, refunded ${inr(refund)}; repairs ${inr(repair)}`);
  notes.push({ kind: why === 'arrears' ? 'error' : 'info', text: `Your tenant at ${propName(id)} moved out — ${reason}. Repairs cost ${inr(repair)}${byOwner ? '' : '; it\'s listed again and empty until the next tenant arrives'}.` });
  return notes;
}

export function stopRentingOut(state, id) {
  const p = state.properties[id];
  if (!p || !['listed', 'let'].includes(p.status)) return { ok: false, reason: 'not_let' };
  if (p.tenant) {
    const refund = Math.max(0, p.tenant.deposit - p.tenant.arrears);
    if (spendable(state) < refund) return { ok: false, reason: 'deposit_refund', refund };
    return { ok: true, notes: tenantLeaves(state, id, 'owner', true) };
  }
  p.status = 'vacant';
  logEvent(state, 'property', `Stopped advertising ${propName(id)} for rent`);
  return { ok: true };
}

// Monthly, on the 1st: tenants move in, pay (on time / late / not at all) or leave.
export function collectRents(state) {
  const notes = [], key = monthKey(state.day);
  for (const [id, p] of Object.entries(state.properties)) {
    if (p.status === 'listed') {
      const waited = monthsBetween(p.listedDay, state.day), need = 1 + NEIGHBOURHOODS[PROPERTIES[id].hood].vacancy;
      if (waited < need) { p.vacantMonths++; continue; }
      const t = p.tenant = newTenant(state, id);
      p.status = 'let'; p.tenantSince = state.day;
      post(state, { amount: t.deposit, category: 'tenant_deposit', memo: `Tenant's security deposit, held for them (to be returned) — ${propName(id)}`, ref: `tdep-${t.uid}`, prop: id, deal: p.uid });
      logEvent(state, 'property', `A tenant moved into ${propName(id)}: ${inr(t.rent)}/month for ${t.lease} months, ${inr(t.deposit)} deposit`);
      notes.push({ kind: 'ok', text: `A tenant moved into ${propName(id)} at ${inr(t.rent)}/month and paid a ${inr(t.deposit)} deposit (you hold it for them).` });
      const r = receiveRent(state, id, key, false);
      if (r) notes.push(r);
      continue;
    }
    if (p.status === 'vacant') { p.vacantMonths++; continue; }
    if (p.status !== 'let' || !p.tenant || p.tenant.lastMonth === key) continue;
    const t = p.tenant;
    t.lastMonth = key;
    if (state.day >= t.leaseEnd) { notes.push(...tenantLeaves(state, id, 'lease_end')); p.vacantMonths++; continue; }
    const outcome = tenantOutcome(t, key);
    if (outcome === 'paid') { t.missedRun = 0; const r = receiveRent(state, id, key, false); if (r) notes.push(r); continue; }
    if (outcome === 'late') {
      t.missedRun = 0; t.late = { key, due: state.day + T.lateDay - 1 };
      notes.push({ kind: 'warn', text: `Your tenant at ${propName(id)} says this month's rent will be late (by the ${T.lateDay}th).` });
      continue;
    }
    t.arrears += t.rent; t.missedRun++; t.missedMonths++;
    logEvent(state, 'property', `Tenant at ${propName(id)} didn't pay ${key} rent (${inr(t.arrears)} owed)`);
    if (t.missedRun >= T.leaveAfterMissed) { notes.push(...tenantLeaves(state, id, 'arrears')); continue; }
    notes.push({ kind: 'error', text: `Your tenant at ${propName(id)} didn't pay this month's ${inr(t.rent)} rent. It's owed; their deposit covers it if they leave.` });
  }
  return notes;
}

// Daily: late rent arrives on the 15th (once — same reference as on-time rent for that month).
export function collectLateRents(state) {
  const notes = [];
  for (const [id, p] of Object.entries(state.properties)) {
    const t = p.tenant;
    if (p.status !== 'let' || !t?.late || state.day < t.late.due) continue;
    const r = receiveRent(state, id, t.late.key, true);
    t.late = null;
    if (r) notes.push(r);
  }
  return notes;
}

// ------------------------------------------------------------------ selling and forced sales
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
  post(state, { amount: s.gross, category: 'property_sell', memo: `Sold ${propName(id)} (${inr(s.value)} − ${inr(s.fee)} fee${s.arrears ? ` − ${inr(s.arrears)} unpaid upkeep` : ''})`, ref: token, prop: id, deal: p.uid });
  if (s.deposits) pay(state, { amount: s.deposits, category: 'tenant_deposit_refund', memo: `Tenant's deposit returned out of the sale — ${propName(id)}`, prop: id, deal: p.uid });
  if (p.tenant) { (p.pastTenants ??= []).push({ uid: p.tenant.uid, since: p.tenant.since, left: state.day, why: 'sold', rent: p.tenant.rent, deposit: p.tenant.deposit, refund: p.tenant.deposit }); p.tenant = null; }
  p.depositOwed = 0;
  const settled = settleLoansOn(state, id, `Sale of ${propName(id)}`);
  closeRecord(state, id, { value: s.value, fee: s.fee, arrears: s.arrears, deposits: s.deposits, net: s.net, settled: settled.total, interestAtPayoff: settled.interest, accruedAtSale: settled.interest, shortfall: 0, forced: false });
  logEvent(state, 'property', `Sold ${propName(id)} for ${inr(s.net)}${settled.total ? `; ${inr(settled.total)} repaid its loans` : ''}`);
  return { ok: true, sale: s, settled: settled.total };
}

// Loan default: the bank sells the collateral, takes its costs and what it's owed. Nothing is
// written off — a shortfall becomes a debt you keep repaying.
export function repossess(state, loan) {
  const id = loan.propertyId, p = state.properties[id];
  if (!p) { loan.status = 'defaulted'; return []; }
  const value = propertyValue(id, state.day), price = Math.round(value * (1 - LENDING_RULES.forcedSaleDiscount));
  const costs = Math.round(price * LENDING_RULES.enforcementCost), arrears = p.arrears ?? 0, deposits = depositsHeld(p);
  const tag = { prop: id, deal: p.uid };
  post(state, { amount: price, category: 'repossession', memo: `Bank sold ${propName(id)} after ${LENDING_RULES.defaultAfter} missed EMIs (forced sale at ${inr(price)}, 15% below value)`, ...tag });
  let left = price;
  const out = (amount, category, memo, extra = {}) => { const a = Math.min(amount, left); if (a > 0) { post(state, { amount: -a, category, memo, ...tag, ...extra }); left -= a; } return amount - a; };
  let unpaid = out(costs, 'enforcement_cost', `Bank's legal & sale costs (${LENDING_RULES.enforcementCost * 100}%) — ${propName(id)}`);
  const arrearsUnpaid = out(arrears, 'upkeep', `Unpaid upkeep settled from the forced sale — ${propName(id)}`);
  unpaid += arrearsUnpaid;
  unpaid += out(deposits, 'tenant_deposit_refund', `Tenant's deposit returned from the forced sale — ${propName(id)}`);
  let shortfall = unpaid, settled = 0, interestAtPayoff = 0, accruedAtSale = 0;
  for (const l of securedOn(state, id)) {
    const accrued = accruedInterest(l, state.day), due = payoffAmount(l, state.day);
    accruedAtSale += accrued;
    const cover = Math.min(left, due);
    if (cover > 0) { post(state, { amount: -cover, category: 'loan_settlement', memo: `Forced-sale proceeds paid to the bank — ${l.kind === 'mortgage' ? 'home loan' : 'home-equity loan'}`, ...tag, loan: l.uid }); left -= cover; settled += cover; }
    const toInterest = Math.min(cover, accrued);
    l.interestPaid += toInterest; interestAtPayoff += toInterest; l.principalRepaid += cover - toInterest;
    shortfall += due - cover;
    Object.assign(l, { status: cover === due ? 'closed' : 'defaulted', closedDay: state.day, balance: 0 });
  }
  const debt = shortfall > 0 ? convertToDebt(state, 'shortfall', id, shortfall, loan.rate, LENDING_RULES.shortfallMonths, p.uid) : null;
  state.credit.defaults.push({ day: state.day, loan: loan.uid, property: id, shortfall });
  const wasHome = homeId(state) === id;
  if (wasHome) { state.housing = null; state.residence = null; }
  p.tenant = null; p.depositOwed = 0;
  closeRecord(state, id, { value: price, marketValue: value, fee: costs, arrears, deposits, net: price - costs - arrears - deposits, settled, interestAtPayoff, accruedAtSale, arrearsCovered: arrears - arrearsUnpaid, shortfall, surplus: left, forced: true });
  logEvent(state, 'loan', `Defaulted on ${propName(id)} — the bank sold it for ${inr(price)}${shortfall ? `; ${inr(shortfall)} is still owed` : left ? `; ${inr(left)} surplus paid to you` : ''}`);
  return [{ kind: 'error', text: `You missed ${LENDING_RULES.defaultAfter} EMIs in a row. The bank sold ${propName(id)} for ${inr(price)} (costs ${inr(costs)}). `
    + (shortfall ? `It didn't cover what you owed: ${inr(shortfall)} is still owed, repaid at ${inr(debt.emi)}/month. ` : left ? `${inr(left)} left over was paid to you. ` : '')
    + (wasHome ? 'It was your home — you have nowhere to live until you rent or buy (see the property agent). ' : '') + 'This default stays on your credit profile.' }];
}

// ------------------------------------------------------------------ monthly bills (on the 1st)
export function payRent(state) {
  const h = state.housing;
  if (h?.kind !== 'rent' || h.paidMonth === monthKey(state.day)) return null;   // never twice a month
  const memo = `Rent — ${propName(h.propertyId)}`;
  const r = pay(state, { amount: h.rent, category: 'rent', memo, ref: `rent-${h.propertyId}-${monthKey(state.day)}`, prop: h.propertyId });
  if (r.ok) { h.paidMonth = monthKey(state.day); h.missed = 0; return null; }
  recordFailure(state, { attempted: -h.rent, category: 'rent', memo: `${memo} — unpaid (insufficient funds), still owed`, prop: h.propertyId });
  h.paidMonth = monthKey(state.day);           // this month's attempt is done (missed), not retried
  h.missed++;
  h.arrears = (h.arrears ?? 0) + h.rent;
  if (h.missed >= R.missedRentToEvict) {
    const id = h.propertyId;
    endTenancy(state);
    state.housing = null;
    state.residence = null;
    logEvent(state, 'housing', `Evicted from ${propName(id)} after ${R.missedRentToEvict} unpaid rents`);
    return { kind: 'error', text: `You were evicted from ${propName(id)} after missing rent twice. Your deposit went towards the unpaid rent. You have no home — your health will suffer until you rent or buy one (see the property agent).` };
  }
  return { kind: 'error', text: `Rent of ${inr(h.rent)} couldn't be paid — you now owe ${inr(h.arrears)}. Miss it again next month and you'll be evicted.` };
}

export function payUpkeep(state) {
  const notes = [], key = monthKey(state.day);
  for (const [id, p] of Object.entries(state.properties)) {
    const bill = (cost, category, memo, ref) => {
      if (tokenUsed(state, ref) || state.ledger.some(e => e.status === 'failed' && e.ref === ref)) return;
      if (pay(state, { amount: cost, category, memo, ref, prop: id, deal: p.uid }).ok) return;
      recordFailure(state, { attempted: -cost, category, memo: `${memo} — unpaid, added to arrears`, ref, prop: id });
      p.arrears = (p.arrears ?? 0) + cost;
      notes.push({ kind: 'error', text: `Couldn't pay ${inr(cost)} (${category}) on ${propName(id)}. It's owed and will be taken from the sale price.` });
    };
    bill(PROPERTIES[id].upkeep, 'upkeep', `Upkeep & property tax — ${propName(id)}`, `upkeep-${id}-${key}`);
    if (hash01('repair', id, key) < REPAIRS.chance) {
      const cost = round100(PROPERTIES[id].upkeep * REPAIRS.factor);
      bill(cost, 'repair', `Repair — ${propName(id)} (plumbing/wiring/roof)`, `repair-${id}-${key}`);
      notes.push({ kind: 'warn', text: `A repair was needed at ${propName(id)}: ${inr(cost)}.` });
    }
    if (p.depositOwed > 0) {
      const r = pay(state, { amount: p.depositOwed, category: 'tenant_deposit_refund', memo: `Overdue deposit returned to your former tenant — ${propName(id)}`, prop: id, deal: p.uid });
      if (r.ok) { notes.push({ kind: 'ok', text: `You returned the ${inr(p.depositOwed)} deposit you owed your former tenant.` }); p.depositOwed = 0; }
    }
  }
  return notes;
}

// Monthly, on the 1st (after the bills): record each owned property's value (history for reports).
export function recordValuations(state) {
  const key = monthKey(state.day);
  for (const [id, p] of Object.entries(state.properties)) {
    p.valuations ??= [];
    if (p.valuations.at(-1)?.month !== key) p.valuations.push({ month: key, value: propertyValue(id, state.day) });
  }
}

export function payPropertyArrears(state, id) {
  const p = state.properties[id];
  if (!p?.arrears) return { ok: false, reason: 'nothing_owed' };
  const r = pay(state, { amount: p.arrears, category: 'upkeep', memo: `Paid upkeep & repair arrears — ${propName(id)}`, prop: id, deal: p.uid });
  if (!r.ok) return r;
  p.arrears = 0;
  return { ok: true };
}

export const ownedPropertyValue = state => Object.keys(state.properties).reduce((s, id) => s + propertyValue(id, state.day), 0);
