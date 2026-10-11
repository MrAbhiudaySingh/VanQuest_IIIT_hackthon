// Compound Financial Academy: the four supplied VanQuest Core Courses (src/data/courses.js,
// imported verbatim from the course documents). This module holds the learning rules and the one
// progress record (state.academy.courses); the UI only displays it.
//
//   • A course is complete when every lesson has been studied AND its knowledge check is passed.
//   • Multiple-choice checks (courses 1–2) are marked against the documents' answer keys.
//   • Open-answer checks (courses 3–4) have model answers but no options, so they can't be marked
//     automatically: the learner writes an answer, reveals the model answer and marks themselves.
//     (An AI marker can replace this later through setCheckProvider/setOpenMarker — see below.)
//   • Pass mark: 67% (unchanged from the earlier academy).
//   • Progress from the retired Round 1–4 lessons stays in state.academy.lessons, untouched, and is
//     shown as an earlier record next to the course that now covers the same topic.
import { COURSES } from '../data/courses.js';
import { logEvent } from './state.js';

export const PASS_MARK = 0.67;
export const NOTE_MAX = 2000;

// The seven lessons used before Round 5 (their records are kept in saves), and the supplied
// course that covers the same ground.
export const LEGACY_LESSONS = {
  budgeting: { title: 'Budgeting basics', course: 'core01' },
  emergency_fund: { title: 'Emergency savings', course: 'core02' },
  compounding: { title: 'The power of compounding', course: 'core02' },
  diversification: { title: 'Diversification', course: 'core03' },
  risk: { title: 'Investment risk', course: 'core03' },
  long_term: { title: 'Long-term investing', course: 'core03' },
  scams: { title: 'Spotting scams', course: 'core04' },
};

// Extension points for a future adaptive / AI layer. Defaults are the supplied material.
export let checkProvider = (course, _record) => course.check;
export const setCheckProvider = fn => { checkProvider = fn; };
export let openMarker = null;                      // (question, answerText) => { correct, feedback } | null
export const setOpenMarker = fn => { openMarker = fn; };

export const courseById = id => COURSES.find(c => c.id === id);

export function courseRecord(state, id) {
  state.academy.courses ??= {};
  return state.academy.courses[id] ??= { studied: {}, notes: {}, check: { attempts: 0, bestScore: 0, passed: false, completedDay: null }, completedDay: null };
}
const peek = (state, id) => state.academy.courses?.[id];
// For display: the record if it exists, otherwise a blank one that is NOT attached to the state
// (rendering a course must never change the save).
export const readRecord = (state, id) => peek(state, id) ?? { studied: {}, notes: {}, check: { attempts: 0, bestScore: 0, passed: false, completedDay: null }, completedDay: null };

export function courseProgress(state, id) {
  const c = courseById(id), r = peek(state, id);
  const studied = r ? c.lessons.filter((_, i) => r.studied[i] != null).length : 0;
  const passed = !!r?.check.passed;
  const steps = c.lessons.length + 1;                          // every lesson + the knowledge check
  return { studied, lessons: c.lessons.length, passed, bestScore: r?.check.bestScore ?? 0, attempts: r?.check.attempts ?? 0,
    complete: r?.completedDay != null, completedDay: r?.completedDay ?? null, pct: (studied + (passed ? 1 : 0)) / steps,
    legacy: Object.entries(LEGACY_LESSONS).filter(([lid, l]) => l.course === id && state.academy.lessons?.[lid]).map(([lid, l]) => ({ id: lid, title: l.title, ...state.academy.lessons[lid] })) };
}

function maybeComplete(state, id) {
  const c = courseById(id), r = courseRecord(state, id);
  if (r.completedDay != null || !r.check.passed || c.lessons.some((_, i) => r.studied[i] == null)) return false;
  r.completedDay = state.day;
  logEvent(state, 'academy', `Completed course "${c.title}"`);
  return true;
}

// Idempotent: studying a lesson twice keeps the first date.
export function markStudied(state, id, lessonIndex) {
  const c = courseById(id);
  if (!c || !Number.isInteger(lessonIndex) || !c.lessons[lessonIndex]) return { ok: false, reason: 'unknown_lesson' };
  const r = courseRecord(state, id);
  r.studied[lessonIndex] ??= state.day;
  return { ok: true, completed: maybeComplete(state, id) };
}

export function saveNote(state, id, key, text) {
  if (!courseById(id)) return { ok: false, reason: 'unknown_lesson' };
  const r = courseRecord(state, id), t = String(text ?? '').slice(0, NOTE_MAX);
  if (t) r.notes[key] = t; else delete r.notes[key];
  return { ok: true };
}

// Deterministic feedback for one multiple-choice answer, using only the supplied answer key.
export function choiceFeedback(q, chosen) {
  const right = q.options.find(o => o.key === q.answer);
  return { correct: chosen === q.answer, chosen, answer: q.answer, answerText: right.text };
}

// answers: multiple choice → option keys ('A'…); open → { text, revealed, self: 'got'|'missed' } per question.
export function submitCheck(state, id, answers) {
  const c = courseById(id);
  if (!c) return { ok: false, reason: 'unknown_lesson' };
  const r = courseRecord(state, id), check = checkProvider(c, r), qs = check.questions;
  if (!Array.isArray(answers) || answers.length !== qs.length) return { ok: false, reason: 'incomplete' };
  let results;
  if (check.type === 'choice') {
    if (answers.some((a, i) => !qs[i].options.some(o => o.key === a))) return { ok: false, reason: 'incomplete' };
    results = qs.map((q, i) => choiceFeedback(q, answers[i]));
  } else {
    // a model answer must be revealed and the learner's own judgement given for every question
    if (answers.some(a => !a?.revealed || !['got', 'missed'].includes(a.self))) return { ok: false, reason: 'incomplete' };
    results = qs.map((q, i) => {
      const ai = openMarker?.(q, answers[i].text ?? '');
      return ai ? { ...ai, model: q.model } : { correct: answers[i].self === 'got', selfMarked: true, model: q.model };
    });
  }
  const correct = results.filter(x => x.correct).length, score = correct / qs.length, passed = score >= PASS_MARK;
  r.check.attempts++;
  r.check.lastScore = score;
  r.check.lastAnswers = answers.map(a => (typeof a === 'object' ? { ...a, text: String(a.text ?? '').slice(0, NOTE_MAX) } : a));
  r.check.bestScore = Math.max(r.check.bestScore, score);
  if (passed && !r.check.passed) {
    r.check.passed = true;
    r.check.completedDay = state.day;
    logEvent(state, 'academy', `Passed the knowledge check of "${c.title}" (${correct}/${qs.length})`);
  }
  const completed = maybeComplete(state, id);
  return { ok: true, type: check.type, correct, total: qs.length, score, passed, results, completed };
}

// Glossary terms (from the same course) that a lesson's text mentions — for the lesson's key-term cards.
export function lessonTerms(course, lesson) {
  const text = JSON.stringify(lesson.blocks).toLowerCase();
  return course.glossary.filter(g => {
    const term = g.term.toLowerCase().split(/\s*\/\s*/)[0].replace(/[()]/g, '');
    return new RegExp(`\\b${term.replace(/[.*+?^${}|[\]\\]/g, '\\$&')}`).test(text);
  });
}
