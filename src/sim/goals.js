// The player's own goals, from the supplied goals quiz (data/goalsQuiz.js). This is NOT the academy's
// knowledge check: it records what the player wants from life, so the end-of-life report can compare
// intentions with what actually happened.
//
//  • The first completed quiz is the ORIGINAL baseline and is never changed.
//  • Later changes are REVISIONS, each dated, appended to a history (the original stays).
//  • The goal that counts for manual retirement is the latest one (the original if never revised).
//  • Only Question 01 ("biggest financial goal") with Question 02 (target age) defines an achievable
//    goal. The other answers are preferences (priority, risk preference, …) used for context in the
//    report — the quiz gives no amounts, so no target amounts are invented.
//  • A goal the game can measure is judged from the record; one it can't (travel, a business, family,
//    "something else", "build long-term wealth" without a target) needs the player's own confirmation.
import { QUIZ, QUIZ_DEFAULTS, KEY_BY_INDEX } from '../data/goalsQuiz.js';
import { logEvent } from './state.js';
import { balance } from './ledger.js';
import { fdTotal } from './bank.js';
import { portfolio } from './market.js';
import { ageOn } from './character.js';
import { monthKey } from './util.js';
import { isEssentialSpend, essentialMonthly, FI_MULTIPLE } from './lifeLog.js';

// The game's financial-independence rule (documented in the README; FI_MULTIPLE lives in lifeLog.js).
export { isEssentialSpend, essentialMonthly, FI_MULTIPLE };

// What each answer to Question 01 means in the game.
export const GOAL_KINDS = {
  'Save for higher education': { kind: 'education', measurable: true, test: 'Graduate from a programme at Ashford College.' },
  'Own a car or vehicle': { kind: 'vehicle', measurable: true, test: 'Own a car (bought at Roadstar Motors).' },
  'Become financially independent': { kind: 'independence', measurable: true, test: `Have cash, savings, fixed deposits and investments worth at least ${FI_MULTIPLE} years of your essential costs (the game's rule).` },
  'Travel the world': { kind: 'travel', measurable: false, why: 'The game has no travel, so only you can say whether you achieved this.' },
  'Start a business': { kind: 'business', measurable: false, why: 'The game has no businesses to start, so only you can say whether you achieved this.' },
  'Build long-term wealth': { kind: 'wealth', measurable: false, why: 'The quiz gives no target amount. Your report shows how your net worth changed; you decide whether that met your goal.' },
  'Support my family': { kind: 'family', measurable: false, why: 'The game has no family members, so only you can say whether you achieved this.' },
  'Something else': { kind: 'other', measurable: false, why: 'Your goal isn\'t one the game can measure, so only you can say whether you achieved it.' },
  Skipped: { kind: 'none', measurable: false, why: 'You skipped this question, so there is no goal to measure.' },
};
const goalInfo = choice => GOAL_KINDS[choice] ?? GOAL_KINDS['Something else'];

// ------------------------------------------------------------------ the quiz record
export function goalsRecord(state) {
  return state.goals ??= { draft: null, original: null, revisions: [], confirmations: [] };
}

// The answers object exactly as the supplied quiz builds it (validated against the supplied options).
export function validateAnswers(a) {
  const errors = [];
  if (!a || typeof a !== 'object') return { ok: false, errors: ['no answers'] };
  QUIZ.questions.forEach((q, i) => {
    const key = KEY_BY_INDEX[i];
    if (!key || !q.options) return;
    const v = a[key];
    if (v == null) errors.push(`Question ${String(i + 1).padStart(2, '0')} needs an answer (or Skip for now).`);
    else if (v !== 'Skipped' && !q.options.some(o => o.value === v)) errors.push(`Question ${String(i + 1).padStart(2, '0')}: "${v}" isn't one of the options.`);
  });
  if (!a.ageUnsure && !(Number.isInteger(a.age) && a.age >= 18 && a.age <= 70)) errors.push('Question 02: the target age must be 18–70 (or "not sure yet").');
  return { ok: !errors.length, errors };
}

const clean = a => Object.fromEntries(Object.keys(QUIZ_DEFAULTS).map(k => [k, a[k] ?? QUIZ_DEFAULTS[k]]));

// Structured goals derived from the answers (only what the questionnaire supports).
export function structure(a) {
  const info = goalInfo(a.goal);
  return {
    main: { choice: a.goal, ...info },
    targetAge: a.ageUnsure ? null : a.age,
    firstMilestone: a.time,                        // "Within 1 year" … — when the first major milestone should come
    preferences: { priority: a.priority, incomeContext: a.income, savingChallenge: a.saving, investingExperience: a.knowledge,
      riskPreference: a.risk, learningStyle: a.style, currency: a.currency, expectedIncome: a.expectedIncome },
  };
}

export function saveDraft(state, answers, step) {
  const g = goalsRecord(state);
  if (g.original && !g.revising) return { ok: false, reason: 'already_submitted' };
  g.draft = { answers: clean(answers), step, savedDay: state.day };
  return { ok: true };
}

// Submit the quiz. The first submission is the original; it can't be submitted twice. `token` makes a
// double click harmless.
export function submitGoals(state, answers, token) {
  const g = goalsRecord(state);
  if (!token || g.original?.token === token || g.revisions.some(r => r.token === token)) return { ok: false, reason: 'duplicate' };
  if (g.original && !g.revising) return { ok: false, reason: 'already_submitted' };
  const a = clean(answers), v = validateAnswers(a);
  if (!v.ok) return { ok: false, reason: 'invalid', errors: v.errors };
  const rec = { token, day: state.day, age: ageOn(state), runId: state.character?.runId ?? null, answers: Object.freeze({ ...a }), goals: structure(a) };
  if (!g.original) { g.original = rec; logEvent(state, 'goals', `Recorded your goals: "${a.goal}"${a.ageUnsure ? '' : ` by age ${a.age}`}.`); }
  else { g.revisions.push(rec); g.revising = false; logEvent(state, 'goals', `Revised your goals: "${a.goal}"${a.ageUnsure ? '' : ` by age ${a.age}`}.`); }
  g.draft = null;
  if (state.onboarding) state.onboarding.quizDone = true;
  return { ok: true, record: rec, revision: g.revisions.length > 0 && g.revisions.at(-1) === rec };
}

export function startRevision(state) {
  const g = goalsRecord(state);
  if (!g.original) return { ok: false, reason: 'no_goals' };
  g.revising = true;
  g.draft = { answers: { ...currentGoals(state).answers }, step: 0, savedDay: state.day };
  return { ok: true };
}
export function cancelRevision(state) { const g = goalsRecord(state); g.revising = false; g.draft = null; return { ok: true }; }

export const currentGoals = state => { const g = state.goals; return g?.revisions?.at(-1) ?? g?.original ?? null; };

// ------------------------------------------------------------------ measuring progress
export function independence(state) {
  const liveOn = balance(state, 'wallet') + balance(state, 'bank') + fdTotal(state) + portfolio(state).total;
  const yearly = essentialMonthly(state) * 12;
  return { liveOn, yearlyEssentials: Math.round(yearly), ratio: yearly > 0 ? liveOn / yearly : null, met: yearly > 0 && liveOn >= FI_MULTIPLE * yearly };
}

// Status of one goal record now: achieved / in_progress / not_yet / needs_confirmation / confirmed.
export function goalStatus(state, rec) {
  if (!rec) return { status: 'none', text: 'No goals recorded yet.' };
  const m = rec.goals.main, target = rec.goals.targetAge, age = ageOn(state);
  const done = (day, evidence, refs) => {
    const at = ageOn(state, day);
    return { status: 'achieved', day, age: at, onTime: target == null ? null : at <= target, evidence, refs };
  };
  let r;
  if (m.kind === 'education') {
    const ed = state.education;
    const ev = state.events.find(e => e.type === 'education' && /^Graduated/.test(e.text));
    r = ed?.status === 'graduated' ? done(ed.graduationDay, 'You graduated.', ev ? [`E${ev.id}`] : [])
      : ed?.status === 'enrolled' ? { status: 'in_progress', text: 'You are enrolled and haven\'t graduated yet.' } : { status: 'not_yet', text: 'You haven\'t enrolled at Ashford College.' };
  } else if (m.kind === 'vehicle') {
    const buy = state.ledger.find(e => e.category === 'vehicle_buy' && e.status === 'ok');
    r = buy ? done(buy.day, state.vehicles.length ? 'You own a car.' : 'You bought a car (and later sold it).', [`L${buy.id}`]) : { status: 'not_yet', text: 'You haven\'t bought a car.' };
  } else if (m.kind === 'independence') {
    const first = (state.lifeLog ?? []).find(x => x.fiMet);
    const fi = independence(state);
    r = first ? done(first.day, `Your savings and investments covered ${FI_MULTIPLE}+ years of essentials.`, [`M${first.month}`])
      : fi.met ? done(state.day, `Your savings and investments cover ${FI_MULTIPLE}+ years of essentials now.`, [])
      : { status: 'not_yet', text: `You have ${fi.ratio == null ? 'no record of essential costs yet' : `${fi.ratio.toFixed(1)} years of essential costs; the rule is ${FI_MULTIPLE}`}.`, ratio: fi.ratio };
  } else {
    const c = (state.goals?.confirmations ?? []).find(x => x.recordToken === rec.token);
    r = c ? { status: 'confirmed', day: c.day, age: ageOn(state, c.day), onTime: target == null ? null : ageOn(state, c.day) <= target, text: 'You confirmed you achieved this (player-confirmed, not measured).' }
      : { status: 'needs_confirmation', text: m.why };
  }
  if (r.status !== 'achieved' && r.status !== 'confirmed' && target != null && age > target) r.pastTarget = true;
  return { ...r, goal: m, targetAge: target };
}

// Manual retirement: allowed once the current goal is achieved — measured by the game, or, for a goal
// the game can't measure, confirmed by the player (never decided by the AI).
export function retirementEligibility(state) {
  const rec = currentGoals(state);
  if (!rec) return { eligible: false, needsQuiz: true, unmet: ['Record your goals first (the goals quiz) — retirement compares your life with them.'] };
  const st = goalStatus(state, rec);
  if (st.status === 'achieved' || st.status === 'confirmed') return { eligible: true, status: st, record: rec };
  if (st.status === 'needs_confirmation') return { eligible: false, needsConfirmation: true, status: st, record: rec, unmet: [`"${rec.goals.main.choice}": ${st.text}`] };
  return { eligible: false, status: st, record: rec, unmet: [`"${rec.goals.main.choice}": ${st.text}${rec.goals.main.test ? ` (Goal: ${rec.goals.main.test})` : ''}`] };
}

// A qualitative goal confirmed by the player (recorded with the date; part of the final report).
export function confirmGoal(state, text = '') {
  const rec = currentGoals(state);
  if (!rec || rec.goals.main.measurable) return { ok: false, reason: 'not_confirmable' };
  const g = goalsRecord(state);
  if (g.confirmations.some(c => c.recordToken === rec.token)) return { ok: true, already: true };
  g.confirmations.push({ recordToken: rec.token, day: state.day, age: ageOn(state), goal: rec.goals.main.choice, note: String(text).slice(0, 300) });
  logEvent(state, 'goals', `You confirmed you achieved your goal: "${rec.goals.main.choice}".`);
  return { ok: true };
}

export const monthOfRecord = rec => (rec ? monthKey(rec.day) : null);
