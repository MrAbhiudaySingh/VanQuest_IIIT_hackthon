// Local characters ("profiles", Round 7). VanQuest is a single-player browser game with no server
// accounts, so a profile is local to this browser on this device — it is NOT a secure or cross-device
// account, needs no real name, email or password, and anyone using this browser can open it.
//
// Storage (all in this browser's localStorage):
//   vanquest.save.v1          the character being played (the same key as every earlier round, so older
//                             saves, backups and tools keep working)
//   vanquest.char.<id>        every other character, archived whole while not being played
//   vanquest.profiles.v1      the index: id, chosen name and a small public summary per character —
//                             identity kept apart from the financial simulation state
// Switching or creating a character ARCHIVES the current one first, then fills the play slot, then updates
// the index — so an interruption at any point can duplicate a save but never lose one, and creating a new
// character never deletes another. If the browser is out of space for a full archive, a finished life is
// kept as its final report (compact) rather than being lost; the attempt is reported to the caller.
import { SAVE_KEY, newGame, saveGame, migrate, SAVE_VERSION } from './state.js';
import { overview } from './networth.js';
import { ageOn } from './character.js';

export const PROFILES_KEY = 'vanquest.profiles.v1';
export const ARCHIVE_PREFIX = 'vanquest.char.';
const ID = /^p-[a-z0-9]{4,20}$/;
export const newProfileId = () => `p-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`;

// A display name only: 1–24 printable characters, no markup. Falls back to "Character N".
export function cleanName(raw, fallback = 'Character') {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
  return s || fallback;
}

export function readIndex(storage) {
  let idx = null;
  try { idx = JSON.parse(storage?.getItem(PROFILES_KEY) ?? 'null'); } catch { idx = null; }
  const ok = idx && typeof idx === 'object' && Array.isArray(idx.profiles);
  const profiles = ok ? idx.profiles.filter(p => p && ID.test(p.id) && typeof p.name === 'string').map(p => ({ ...p, name: cleanName(p.name) })) : [];
  return { version: 1, activeId: ok && ID.test(idx.activeId) ? idx.activeId : null, profiles };
}
const writeIndex = (storage, idx) => { try { storage?.setItem(PROFILES_KEY, JSON.stringify(idx)); return true; } catch { return false; } };

// The public summary shown on the title / character screen.
export function profileMeta(state) {
  const c = state.character ?? {}, f = state.life?.final;
  let netWorth = null; try { netWorth = f?.snapshot.netWorth ?? overview(state).netWorth; } catch { /* compact archive */ }
  return { id: c.profileId, name: cleanName(c.name), runId: c.runId ?? null, status: state.status, day: state.day, age: c.birthDay != null ? ageOn(state) : null,
    netWorth, ending: f ? { kind: f.ending.kind, label: f.ending.label, age: f.ending.age, rating: f.rating, overall: f.overall } : null,
    legacy: !!c.legacy, goal: state.goals?.original?.answers?.goal ?? null, updated: Date.now() };
}

// Returns false when the summary is unchanged (then nothing needs writing; `updated` only moves on change).
function upsert(idx, meta) {
  const i = idx.profiles.findIndex(p => p.id === meta.id);
  if (i < 0) { idx.profiles.push({ ...meta, created: meta.updated }); return true; }
  const { updated, ...now } = meta, { updated: _u, created, ...was } = idx.profiles[i];
  if (JSON.stringify(now) === JSON.stringify(Object.fromEntries(Object.keys(now).map(k => [k, was[k]])))) return false;
  idx.profiles[i] = { ...idx.profiles[i], ...meta, created: created ?? updated };
  return true;
}

// Make sure the character in the play slot has a profile id and a name, and is the index's active one.
export function ensureProfile(storage, state) {
  const idx = readIndex(storage), c = state.character;
  if (!c) return idx;
  if (!ID.test(c.profileId ?? '')) c.profileId = newProfileId();
  c.name = cleanName(c.name, `Character ${idx.profiles.length + (idx.profiles.some(p => p.id === c.profileId) ? 0 : 1)}`);
  const changed = upsert(idx, profileMeta(state));
  if (changed || idx.activeId !== c.profileId) { idx.activeId = c.profileId; writeIndex(storage, idx); }
  return idx;
}

export function archive(storage, state) {
  const id = state.character?.profileId;
  if (!ID.test(id ?? '')) return { ok: false, reason: 'no_profile' };
  try { storage.setItem(ARCHIVE_PREFIX + id, JSON.stringify(state)); return { ok: true }; } catch { /* out of space */ }
  if (state.life?.final) {
    const compact = { compact: true, version: SAVE_VERSION, day: state.day, status: state.status, character: state.character, goals: state.goals, life: state.life, achievements: state.achievements };
    try { storage.setItem(ARCHIVE_PREFIX + id, JSON.stringify(compact)); return { ok: true, compact: true }; } catch { /* still no room */ }
  }
  return { ok: false, reason: 'storage_full' };
}

export function readArchive(storage, id) {
  try { const s = JSON.parse(storage.getItem(ARCHIVE_PREFIX + id)); return s && (s.compact ? s : migrate(s)); } catch { return null; }
}

// Every character this browser holds, the active one first. `available` = its save can be opened.
export function listProfiles(storage, state) {
  const idx = readIndex(storage), activeId = state?.character?.profileId;
  const has = id => id === activeId || !!storage?.getItem?.(ARCHIVE_PREFIX + id);
  const list = idx.profiles.map(p => (p.id === activeId ? { ...p, ...profileMeta(state), active: true, available: true } : { ...p, active: false, available: has(p.id) }));
  if (state?.character && !list.some(p => p.active)) list.unshift({ ...profileMeta(state), active: true, available: true });
  return list.filter(p => p.available).sort((a, b) => (b.active - a.active) || (b.updated ?? 0) - (a.updated ?? 0));
}

// Start a brand-new character. The current one is archived first and stays in the list.
export function createCharacter(storage, current, name) {
  const idx = readIndex(storage);
  if (current?.character) { const a = archive(storage, current); if (!a.ok) return { ok: false, reason: a.reason }; upsert(idx, profileMeta(current)); }
  const previousLives = idx.profiles.filter(p => p.status && p.status !== 'alive').length;
  const state = newGame({ profileId: newProfileId(), name: cleanName(name, `Character ${idx.profiles.length + 1}`) });
  state.character.previousLives = previousLives;
  if (!saveGame(storage, state)) return { ok: false, reason: 'storage_full' };
  upsert(idx, profileMeta(state)); idx.activeId = state.character.profileId;
  writeIndex(storage, idx);
  return { ok: true, state };
}

// Play another saved character. The current one is archived first; the chosen one moves into the play slot.
export function switchCharacter(storage, current, id) {
  if (id === current?.character?.profileId) return { ok: true, state: current };
  const next = readArchive(storage, id);
  if (!next) return { ok: false, reason: 'not_found' };
  if (next.compact) return { ok: false, reason: 'report_only', state: next };
  const idx = readIndex(storage);
  if (current?.character) { const a = archive(storage, current); if (!a.ok) return { ok: false, reason: a.reason }; upsert(idx, profileMeta(current)); }
  if (!saveGame(storage, next)) return { ok: false, reason: 'storage_full' };
  try { storage.removeItem?.(ARCHIVE_PREFIX + id); } catch { /* the copy in the play slot is the live one */ }
  upsert(idx, profileMeta(next)); idx.activeId = id;
  writeIndex(storage, idx);
  return { ok: true, state: next };
}

// Keep the index summary of the active character current (cheap; called after actions).
export function touchProfile(storage, state) {
  const idx = readIndex(storage);
  if (!state.character?.profileId) return;
  if (upsert(idx, profileMeta(state)) || idx.activeId !== state.character.profileId) { idx.activeId = state.character.profileId; writeIndex(storage, idx); }
}

export { SAVE_KEY };
