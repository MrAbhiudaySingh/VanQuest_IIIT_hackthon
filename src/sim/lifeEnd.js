// The end of a life (Round 7). Three terminal events, each final:
//   death           health reached 0 (sim/health.js — the only way to die; nothing is invented here)
//   retired_age     the morning of the 60th birthday, BEFORE that day's monthly events (clock.js)
//   retired_manual  the player chose to retire, allowed once their goals are met (sim/goals.js)
// finalizeLife() is idempotent and atomic: it changes the state in memory in one step (status, ending,
// achievements, the deterministic report) and the game saves once afterwards — so a crash can't leave a
// half-finished life, and a second call (double click, reload, retry) returns the same report unchanged.
// After it, the clock stops and Game.act refuses every action (sim/game.js).
import { closeMonth } from './lifeLog.js';
import { unlockNew, achievementDef, CATALOGUE, UNTRACKED, evaluate } from './achievements.js';
import { buildLifeReport } from './lifeReport.js';
import { retirementEligibility } from './goals.js';
import { ageOn, retirementDay } from './character.js';
import { logEvent } from './state.js';
import { fmtDate } from './util.js';

export const isAlive = state => state.status === 'alive';
export const lifeEnded = state => !!state.life?.final;

export function finalizeLife(state, kind, extra = {}) {
  state.life ??= { ending: null, final: null };
  if (state.life.final) return { ok: true, already: true, report: state.life.final };
  const ending = { kind, day: state.day, ...extra };
  if (kind === 'death') { ending.cause = state.death?.cause ?? 'unknown'; state.status = 'dead'; }
  else state.status = 'retired';
  state.life.ending = ending;
  closeMonth(state, true);                               // the unfinished last month, up to today
  const report = buildLifeReport(state, ending);
  unlockNew(state, ending);
  const locked = CATALOGUE.filter(a => !state.achievements.unlocked.some(u => u.id === a.id));
  report.achievements = {
    unlocked: state.achievements.unlocked.map(u => ({ ...achievementDef(u.id), ...u })),
    locked: locked.filter(a => !UNTRACKED[a.id]).map(a => ({ ...a })),
    untracked: locked.filter(a => UNTRACKED[a.id]).map(a => ({ ...a, why: UNTRACKED[a.id] })),
  };
  report.achievements.xp = report.achievements.unlocked.reduce((s, a) => s + (a.xp ?? 0), 0);
  report.narrative = { status: 'none' };                 // the AI wording is attached once, later (never changes numbers)
  state.life.final = report;
  logEvent(state, 'life', kind === 'death' ? `Life ended on ${fmtDate(state.day)} (age ${ageOn(state)}).` : `Retired on ${fmtDate(state.day)} at age ${ageOn(state)} (${kind === 'retired_age' ? 'automatically at 60' : 'by choice'}).`);
  return { ok: true, report };
}

// Manual retirement: eligibility from the goals (never from the AI) + an explicit confirmation token.
export function retire(state, token) {
  state.life ??= { ending: null, final: null };
  if (state.life.final) return { ok: true, already: true, report: state.life.final };
  if (!isAlive(state)) return { ok: false, reason: 'life_ended' };
  if (!token || state.life.retireToken === token) return { ok: false, reason: 'duplicate' };
  const el = retirementEligibility(state);
  if (!el.eligible) return { ok: false, reason: 'not_eligible', unmet: el.unmet };
  state.life.retireToken = token;
  return finalizeLife(state, 'retired_manual');
}

// Called by the clock at the start of every day, before anything else that day.
export function retirementDue(state) {
  return isAlive(state) && state.character && state.day >= retirementDay(state);
}

// For saves loaded in a terminal state (or past 60) without a final report — e.g. a pre-Round-7 save
// that had already died. Returns true if something changed.
export function settleOnLoad(state) {
  if (state.life?.final) return false;
  if (state.status === 'dead') { finalizeLife(state, 'death', { day: state.death?.day ?? state.day, onLoad: true }); return true; }
  if (retirementDue(state)) { closeMonth(state); finalizeLife(state, 'retired_age'); return true; }
  return false;
}

export { evaluate as evaluateAchievements };
