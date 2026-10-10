import { ENCOUNTERS } from '../data/encounters.js';
import { post, pay, spendable, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { price } from './market.js';
import { inr } from './util.js';

export const ENCOUNTER_COOLDOWN_DAYS = 3;
const byId = Object.fromEntries(ENCOUNTERS.map(e => [e.id, e]));
export const encounterDef = id => byId[id];

export const canTrigger = state =>
  state.day - state.encounters.lastDay >= ENCOUNTER_COOLDOWN_DAYS && !state.encounters.log.some(r => r.status === 'open');

// Unseen encounters first, in data order; then the one seen longest ago.
export function nextEncounterId(state) {
  const seen = state.encounters.seen;
  return ENCOUNTERS.find(e => !seen.includes(e.id))?.id ?? seen[0];
}

export function startEncounter(state, id = nextEncounterId(state)) {
  const def = byId[id];
  const rec = { uid: `enc${state.nextId++}`, id, day: state.day, asked: [], stake: 0, status: 'open' };
  state.encounters.log.push(rec);
  state.encounters.lastDay = state.day;
  state.encounters.seen = [...state.encounters.seen.filter(s => s !== id), id];
  // The situation exists in the simulated world whether or not the player bites.
  if (def.outcome.event) state.marketEvents.push({ asset: def.outcome.asset, day: state.day + def.outcome.event.inDays, factor: def.outcome.event.factor, source: rec.uid });
  return rec;
}

const find = (state, uid) => state.encounters.log.find(r => r.uid === uid);

export function ask(state, uid, topic) {
  const rec = find(state, uid), def = byId[rec?.id];
  if (!rec || rec.status !== 'open' || !def.answers[topic]) return { ok: false };
  if (!rec.asked.includes(topic)) rec.asked.push(topic);
  return { ok: true, text: def.answers[topic] };
}

export function decline(state, uid) {
  const rec = find(state, uid), def = byId[rec?.id];
  if (!rec || rec.status !== 'open') return { ok: false };
  rec.status = 'declined';
  logEvent(state, 'encounter', `Declined "${def.offer.name}" from the tipster`, { encounter: rec.uid });
  return { ok: true, def, rec };
}

export function invest(state, uid, amount, token) {
  const rec = find(state, uid), def = byId[rec?.id];
  if (!rec || rec.status !== 'open') return { ok: false, reason: 'closed' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  if (!Number.isInteger(amount) || amount < def.offer.min || amount > def.offer.max) return { ok: false, reason: 'out_of_range' };
  if (amount > spendable(state)) return { ok: false, reason: 'insufficient_funds' };
  pay(state, { amount, category: 'tip_investment', memo: `Committed to "${def.offer.name}" (tipster offer)`, ref: token });
  Object.assign(rec, { status: 'invested', stake: amount, resolveDay: state.day + def.outcome.days });
  if (def.outcome.type === 'asset') rec.startPrice = price(state, def.outcome.asset);
  return { ok: true, rec };
}

// Daily: settle any committed stakes that are due.
export function resolveDue(state) {
  const notes = [];
  for (const rec of state.encounters.log) {
    if (rec.status !== 'invested' || state.day < rec.resolveDay) continue;
    const def = byId[rec.id], o = def.outcome;
    const payout = o.type === 'loss' ? 0 : Math.round(rec.stake * price(state, o.asset, rec.resolveDay) / rec.startPrice);
    if (payout > 0) post(state, { amount: payout, category: 'tip_investment', memo: `Settled "${def.offer.name}"`, ref: `${rec.uid}-settle` });
    Object.assign(rec, { status: 'resolved', payout, pnl: payout - rec.stake });
    logEvent(state, 'encounter', `"${def.offer.name}": committed ${inr(rec.stake)}, got back ${inr(payout)} (${rec.pnl >= 0 ? '+' : ''}${inr(rec.pnl)})`, { encounter: rec.uid });
    notes.push({ kind: rec.pnl >= 0 ? 'ok' : 'error', text: `Tipster offer settled: ${o.text} You got back ${inr(payout)} on ${inr(rec.stake)}.`, encounter: rec.uid });
  }
  return notes;
}
