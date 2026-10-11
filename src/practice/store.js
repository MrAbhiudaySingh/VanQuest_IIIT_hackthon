// The academy's PRACTICE store — completely separate from the main game.
//
//  • Its own object and its own storage key (vanquest.practice.v1). It never reads or writes the
//    main-game save (vanquest.save.v1), ledger, clock, inventory, property, loans, health or job.
//  • Practice modules (src/practice/*) import only pure helpers — never sim/state, sim/ledger,
//    sim/clock, sim/game or anything that takes the live game state.
//  • Versioned: migrate() upgrades older practice data in place. If the stored data is from a NEWER
//    version than this build understands, it is loaded read-only and never overwritten.
export const PRACTICE_KEY = 'vanquest.practice.v1';
export const PRACTICE_VERSION = 1;

export function newPractice() {
  return {
    version: PRACTICE_VERSION,
    nextSeed: 1,               // seeds for new scenarios (each scenario stores its own seed)
    lessons: {},               // `${courseId}:${lessonIndex}` → { attempts, best, last, completedDay, history: [...] }
    runs: [],                  // finished practice-life runs: { id, seed, finishedAt, report }
    life: null,                // the practice life in progress (see life.js)
    vikram: { seen: [], log: [] },   // fingerprints of generated encounters (duplicate detection) + results
  };
}

export function migrate(p) {
  if (!p || typeof p !== 'object') return newPractice();
  // version 1 is the first; future versions add their upgrades here, never discarding data
  p.lessons ??= {}; p.runs ??= []; p.vikram ??= { seen: [], log: [] }; p.nextSeed ??= 1;
  return p;
}

export function loadPractice(storage) {
  try {
    const raw = storage?.getItem(PRACTICE_KEY);
    if (!raw) return newPractice();
    const p = JSON.parse(raw);
    if (p.version > PRACTICE_VERSION) return Object.assign(migrate(p), { readOnly: true });
    return migrate(p);
  } catch { return Object.assign(newPractice(), { readOnly: true, loadError: true }); }   // never clobber unreadable data
}

export function savePractice(storage, p) {
  if (p.readOnly) return false;
  try { storage?.setItem(PRACTICE_KEY, JSON.stringify(p)); return true; } catch { return false; }
}

export const takeSeed = p => `s${p.nextSeed++}`;

// Record one finished practice attempt for a lesson. Practice is scored separately from reading
// (state.academy … studied) and from the course knowledge check.
export function recordAttempt(p, courseId, lessonIndex, result, at = Date.now()) {
  const k = `${courseId}:${lessonIndex}`, r = p.lessons[k] ??= { attempts: 0, best: 0, last: null, completedAt: null, history: [] };
  r.attempts++;
  r.last = result.score;
  r.best = Math.max(r.best, result.score);
  if (result.score >= 60 && !r.completedAt) r.completedAt = at;
  r.history.push({ at, exercise: result.exercise, seed: result.seed, score: result.score });
  if (r.history.length > 20) r.history.shift();
  return r;
}
