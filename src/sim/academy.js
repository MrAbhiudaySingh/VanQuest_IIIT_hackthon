import { LESSONS } from '../data/lessons.js';
import { logEvent } from './state.js';

export const PASS_MARK = 0.67;

// Questions for a lesson. Today this returns the static set; a future adaptive provider
// (e.g. AI-generated challenges) can replace it using the player's record as context.
export let questionProvider = (lesson, _record) => lesson.questions;
export const setQuestionProvider = fn => { questionProvider = fn; };

// answers: array of chosen option indexes, one per question.
export function submitLesson(state, lessonId, answers) {
  const lesson = LESSONS.find(l => l.id === lessonId);
  if (!lesson) return { ok: false, reason: 'unknown_lesson' };
  const qs = questionProvider(lesson, state.academy.lessons[lessonId]);
  if (answers.length !== qs.length || answers.some(a => !Number.isInteger(a))) return { ok: false, reason: 'incomplete' };
  const correct = qs.filter((q, i) => q.answer === answers[i]).length;
  const score = correct / qs.length;
  const rec = state.academy.lessons[lessonId] ??= { attempts: 0, bestScore: 0, passed: false, completedDay: null };
  rec.attempts++;
  rec.lastScore = score;
  rec.lastAnswers = answers;
  rec.bestScore = Math.max(rec.bestScore, score);
  if (score >= PASS_MARK && !rec.passed) {
    rec.passed = true;
    rec.completedDay = state.day;
    logEvent(state, 'academy', `Completed lesson "${lesson.title}" (${correct}/${qs.length})`);
  }
  return { ok: true, correct, total: qs.length, score, passed: score >= PASS_MARK };
}
