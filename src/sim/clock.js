// The one simulation clock. Every recurring system runs from here, in a fixed order,
// exactly once per in-game day (each step is also idempotent on its own):
//   1st of month:  1. education/career progression   2. salary   3. savings interest (Jan/Apr/Jul/Oct)
//                  4. your tenants: move in (deposit + rent) / pay on time / say they'll pay late /
//                     miss / leave (deposit settled, repairs)   5. your rent
//                  6. property upkeep, occasional repairs, overdue tenant-deposit refunds   7. loan EMIs
//                     (a 3rd missed EMI → forced sale)   8. vehicle insurance & servicing
//                  9. grocery plan billing / delivery   10. record each owned property's value
//   every day:     11. fixed deposits that mature today pay out   12. late rent arrives (the 15th)
//                  13. hunger & health (today's stock)   14. household eats   15. tipster stakes settle
//                  16. savings interest accrues on the day's closing balance   17. low-food warning
// Round 7 — before ANY of the above on the 1st of a month:
//   0a. close last month: its life record (lifeLog.js) and its newspaper issue (newspaper.js) —
//       read-only snapshots, nothing is charged   (after step 10: any achievements the record now supports)
//   0b. the 60th birthday (the character was born on 1 July, so it is always the 1st): retire NOW, before
//       that day's salary, rent, EMIs or interest — the last processed month is the one before the birthday.
// The run stops the moment the life ends: death (status 'dead', step 13) or retirement (status 'retired');
// either one finalises the life report exactly once (lifeEnd.js).
// (Market prices, property values and rents are pure functions of the day.)
import { isMonthStart, fmtShortDate, sameDateNextYear } from './util.js';
import { progressCareer, paySalary } from './career.js';
import { billPlan, consumeDay } from './groceryPlan.js';
import { resolveDue } from './encounters.js';
import { collectRents, collectLateRents, payRent, payUpkeep, repossess, recordValuations } from './property.js';
import { payVehicleCosts } from './vehicles.js';
import { nutritionDay, lowFoodWarning } from './health.js';
import { creditSavingsInterest, accrueSavings, matureFDs } from './bank.js';
import { processLoans } from './loans.js';
import { logEvent } from './state.js';
import { closeMonth } from './lifeLog.js';
import { makeIssue } from './newspaper.js';
import { unlockNew } from './achievements.js';
import { finalizeLife, retirementDue } from './lifeEnd.js';

export function runDay(state) {
  const notes = [];
  const push = x => { if (Array.isArray(x)) x.forEach(push); else if (x) notes.push({ day: state.day, ...x }); };
  if (isMonthStart(state.day)) {
    closeMonth(state);
    const issue = makeIssue(state);
    if (issue) push({ kind: 'info', text: `📰 ${issue.month} edition of the newspaper is out (N).`, news: issue.id });
  }
  if (retirementDue(state)) {
    finalizeLife(state, 'retired_age');
    push({ kind: 'ok', text: 'Happy 60th birthday — your character has retired. Your final life report is ready.', ended: true });
    return notes;
  }
  if (isMonthStart(state.day)) {
    push(progressCareer(state));
    push(paySalary(state));
    push(creditSavingsInterest(state));
    push(collectRents(state));
    push(payRent(state));
    push(payUpkeep(state));
    push(processLoans(state, repossess));
    push(payVehicleCosts(state));
    push(billPlan(state));
    recordValuations(state);
    for (const a of unlockNew(state)) push({ kind: 'ok', text: `🏆 Achievement unlocked: ${a.name}`, achievement: a.id });   // after the day's salary & bills
  }
  push(matureFDs(state));
  push(collectLateRents(state));
  push(nutritionDay(state));
  if (state.status === 'dead') { finalizeLife(state, 'death'); push({ kind: 'error', text: 'Your final life report is ready.', ended: true }); return notes; }
  const ranOut = consumeDay(state);
  if (ranOut.length) {
    logEvent(state, 'pantry', `Ran out of ${ranOut.join(', ')}`);
    push({ kind: 'warn', text: `${fmtShortDate(state.day)}: your household ran out of ${ranOut.join(', ')}.` });
  }
  push(resolveDue(state));
  accrueSavings(state);
  push(lowFoodWarning(state));
  return notes;
}

export function advanceDays(state, n = 1) {
  const notes = [];
  for (let i = 0; i < n && state.status === 'alive'; i++) {
    state.day++;
    notes.push(...runDay(state));
  }
  return notes;
}

// Twelve in-game months: to the same calendar date next year, day by day under the normal rules.
export const daysInNextYear = state => sameDateNextYear(state.day) - state.day;
