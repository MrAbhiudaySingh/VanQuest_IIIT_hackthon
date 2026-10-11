// Game facade: owns the state, saves after every action, and tells listeners
// (HUD, panels) that something changed. Scenes and UI call game.act(...).
import { loadGame, saveGame, backupBeforeMigration } from './state.js';
import { ensureProfile, createCharacter, switchCharacter, touchProfile } from './profiles.js';
import { settleOnLoad } from './lifeEnd.js';
import { unlockNew } from './achievements.js';
import { advanceDays, daysInNextYear } from './clock.js';
import { snapshot, periodSummary } from './summary.js';

export const FEED_LIMIT = 40;

// Recent updates for the side panel: every money movement (from the ledger) plus warnings.
export function updateFeed(state, ledgerFrom, notes) {
  for (const e of state.ledger.slice(ledgerFrom))
    state.feed.push({ day: e.day, kind: e.status === 'failed' ? 'error' : e.amount >= 0 ? 'in' : 'out', text: e.memo, amount: e.status === 'failed' ? e.attempted : e.amount });
  for (const n of notes) if (n.kind === 'warn' || n.kind === 'error' || n.feed) state.feed.push({ day: n.day ?? state.day, kind: n.kind, text: n.text });
  if (state.feed.length > FEED_LIMIT) state.feed.splice(0, state.feed.length - FEED_LIMIT);
}

// A 1st-of-the-month was processed during this action (cheap check for refreshing the profile summary).
const isMonthTurn = (state, from) => state.ledger.slice(from).some(e => e.category === 'salary');

export class Game {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    backupBeforeMigration(storage);
    this.state = loadGame(storage);
    ensureProfile(storage, this.state);
    if (settleOnLoad(this.state)) saveGame(storage, this.state);   // e.g. an older save that had already ended
    this.listeners = new Set();
  }
  get alive() { return this.state.status === 'alive'; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(notes = []) { for (const fn of this.listeners) fn(this.state, notes); }

  // Run a state change; persist and notify only after it completes. Once a life has ended (death or
  // retirement) nothing can change it any more: no purchases, transfers, trades, movement or time.
  // `afterLife` is only for bookkeeping that is not part of the life (reading the newspaper, attaching the
  // report's one-time AI wording).
  act(fn, { afterLife = false } = {}) {
    if (!afterLife && !this.alive) return { ok: false, reason: 'life_ended', notes: [] };
    const from = this.state.ledger.length, wasAlive = this.alive;
    const result = fn(this.state);
    // achievements the player's action just earned (e.g. turning down a scam) pop up straight away
    const earned = this.alive ? unlockNew(this.state).map(a => ({ kind: 'ok', text: `🏆 Achievement unlocked: ${a.name}`, achievement: a.id })) : [];
    const notes = [...(result?.notes ?? []), ...earned];
    updateFeed(this.state, from, notes);
    saveGame(this.storage, this.state);
    if (wasAlive !== this.alive || isMonthTurn(this.state, from)) touchProfile(this.storage, this.state);
    this.emit(notes);
    return result;
  }

  // Characters on this browser (sim/profiles.js). Both keep every other character's save.
  newCharacter(name) {
    const r = createCharacter(this.storage, this.state, name);
    if (!r.ok) return r;
    this.state = r.state;
    this.emit([{ kind: 'ok', text: 'New character started.' }]);
    return r;
  }
  switchTo(id) {
    const r = switchCharacter(this.storage, this.state, id);
    if (!r.ok) return r;
    this.state = r.state;
    this.emit([]);
    return r;
  }

  advance(days) {
    return this.act(s => ({ notes: advanceDays(s, days) })).notes;
  }

  // Twelve months under the normal rules; returns the year summary (and stops early on death).
  skipYear() {
    const before = snapshot(this.state);
    const r = this.act(s => ({ notes: advanceDays(s, daysInNextYear(s)) }));
    return { summary: periodSummary(this.state, before), notes: r.notes };
  }

  // "Start a new life": a new character; the current one (and its final report) stays in the list.
  reset() { return this.newCharacter(); }
}
