// Employment & education rules (shown in the College UI):
//  • You start as a part-time retail assistant earning ₹10,000, paid on the 1st of each month.
//  • Enrolling charges the full tuition immediately (only if you can afford it).
//  • While studying you KEEP the part-time job and its ₹10,000 salary.
//  • You graduate on the 1st of the month once the programme length has passed; that same
//    day your job switches to the major's first career level, and that day's salary is
//    already paid at the new rate.
//  • Raises follow the career's `levels` table (months counted from graduation).
import { MAJORS } from '../data/majors.js';
import { post, pay, spendable, tokenUsed } from './ledger.js';
import { logEvent } from './state.js';
import { nextMonthStart, monthsBetween, inr } from './util.js';

export function enrol(state, majorId, token) {
  const major = MAJORS[majorId];
  if (!major) return { ok: false, reason: 'unknown_major' };
  if (state.education) return { ok: false, reason: 'already_enrolled' };
  if (!token || tokenUsed(state, token)) return { ok: false, reason: 'duplicate' };
  if (spendable(state) < major.tuition) return { ok: false, reason: 'insufficient_funds', needed: major.tuition };
  pay(state, { amount: major.tuition, category: 'tuition', memo: `Tuition — ${major.name} at Ashford College`, ref: token });
  // graduation = the first 1st-of-month that is `months` calendar months after enrolment
  let grad = nextMonthStart(state.day);
  while (monthsBetween(state.day, grad) < major.months) grad = nextMonthStart(grad);
  state.education = { majorId, enrolledDay: state.day, graduationDay: grad, status: 'enrolled' };
  logEvent(state, 'education', `Enrolled in ${major.name} (${major.months}-month programme)`);
  return { ok: true, graduationDay: grad };
}

function careerLevel(major, monthsIn) {
  return [...major.career.levels].reverse().find(l => monthsIn >= l.afterMonths);
}

// Monthly step 1 of 3: education & career progression (before salary is paid).
export function progressCareer(state) {
  const ed = state.education;
  if (!ed) return null;
  const major = MAJORS[ed.majorId];
  if (ed.status === 'enrolled' && state.day >= ed.graduationDay) {
    ed.status = 'graduated';
    const lvl = major.career.levels[0];
    state.job = { id: `${major.career.id}_0`, title: lvl.title, salary: lvl.salary, since: state.day, careerOf: ed.majorId };
    logEvent(state, 'education', `Graduated in ${major.name}! New job: ${lvl.title} (${inr(lvl.salary)}/month)`);
    return { kind: 'ok', text: `🎓 You graduated in ${major.name}. You're now a ${lvl.title} earning ${inr(lvl.salary)}/month.` };
  }
  if (ed.status === 'graduated') {
    const lvl = careerLevel(major, monthsBetween(ed.graduationDay, state.day));
    if (lvl.title !== state.job.title) {
      state.job = { ...state.job, title: lvl.title, salary: lvl.salary, since: state.day };
      logEvent(state, 'career', `Promoted to ${lvl.title} (${inr(lvl.salary)}/month)`);
      return { kind: 'ok', text: `Promotion! You're now a ${lvl.title} earning ${inr(lvl.salary)}/month.` };
    }
  }
  return null;
}

// Monthly step 2 of 3: salary.
export function paySalary(state) {
  const { title, salary } = state.job;
  if (tokenUsed(state, `salary-${state.day}`)) return null;     // once per payday
  post(state, { amount: salary, category: 'salary', memo: `Salary — ${title}`, ref: `salary-${state.day}` });
  return { kind: 'ok', text: `Payday: ${inr(salary)} salary received (${title}).` };
}
