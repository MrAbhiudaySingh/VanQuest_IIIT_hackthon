// The character's age. The game's rule: every character is 18 on the day their life in the game begins
// (game day 0 = 1 July 2026 → born 1 July 2008), and retires automatically on their 60th birthday.
// Saves from before Round 7 had no age; they get the same rule (18 on game day 0).
import { dateOf } from './util.js';

export const START_AGE = 18, RETIRE_AGE = 60;
const EPOCH = Date.UTC(2026, 6, 1), DAY_MS = 86400000;
const dayOfUTC = (y, m, d) => Math.round((Date.UTC(y, m, d) - EPOCH) / DAY_MS);

// The game day on which someone who is `age` on `startDay` was born (same calendar date).
export function birthDayFor(startDay = 0, age = START_AGE) {
  const d = dateOf(startDay);
  return dayOfUTC(d.getUTCFullYear() - age, d.getUTCMonth(), d.getUTCDate());
}

export function newCharacter(startDay = 0, runId = `run-${Math.random().toString(36).slice(2, 10)}`) {
  return { runId, birthDay: birthDayFor(startDay), startAge: START_AGE, retireAge: RETIRE_AGE, startDay };
}

// Whole years of age on `day`.
export function ageOn(state, day = state.day) {
  const c = state.character;
  if (!c) return null;
  const b = dateOf(c.birthDay), d = dateOf(day);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

// The game day of the birthday on which the character turns `age` (default: retirement age).
export function birthdayOfAge(state, age = state.character?.retireAge ?? RETIRE_AGE) {
  const b = dateOf(state.character.birthDay);
  return dayOfUTC(b.getUTCFullYear() + age, b.getUTCMonth(), b.getUTCDate());
}
export const retirementDay = state => (state.character ? birthdayOfAge(state) : Infinity);
