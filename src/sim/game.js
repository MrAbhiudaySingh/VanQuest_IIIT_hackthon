// Game facade: owns the state, saves after every action, and tells listeners
// (HUD, panels) that something changed. Scenes and UI call game.act(...).
import { loadGame, saveGame, newGame } from './state.js';
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

export class Game {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.state = loadGame(storage);
    this.listeners = new Set();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(notes = []) { for (const fn of this.listeners) fn(this.state, notes); }

  // Run a state change; persist and notify only after it completes.
  act(fn) {
    const from = this.state.ledger.length;
    const result = fn(this.state);
    updateFeed(this.state, from, result?.notes ?? []);
    saveGame(this.storage, this.state);
    this.emit(result?.notes ?? []);
    return result;
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

  reset() {
    this.state = newGame();
    saveGame(this.storage, this.state);
    this.emit([{ kind: 'ok', text: 'New game started.' }]);
  }
}
