// The one simulation clock. Every recurring system runs from here, in a fixed order,
// exactly once per in-game day (each step is also idempotent on its own):
//   1st of month:  1. education/career progression   2. salary   3. savings interest (Jan/Apr/Jul/Oct)
//                  4. tenants pay you   5. your rent   6. property upkeep   7. loan EMIs
//                  8. vehicle insurance & servicing   9. grocery plan billing / delivery
//   every day:     10. fixed deposits that mature today pay out   11. hunger & health (today's stock)
//                  12. household eats   13. tipster stakes settle   14. savings interest accrues on
//                  the day's closing balance   15. low-food warning
// The run stops the moment the player dies (status 'dead').
// (Market prices, property values and rents are pure functions of the day.)
import { isMonthStart, fmtShortDate, sameDateNextYear } from './util.js';
import { progressCareer, paySalary } from './career.js';
import { billPlan, consumeDay } from './groceryPlan.js';
import { resolveDue } from './encounters.js';
import { collectRents, payRent, payUpkeep, repossess } from './property.js';
import { payVehicleCosts } from './vehicles.js';
import { nutritionDay, lowFoodWarning } from './health.js';
import { creditSavingsInterest, accrueSavings, matureFDs } from './bank.js';
import { processLoans } from './loans.js';
import { logEvent } from './state.js';

export function runDay(state) {
  const notes = [];
  const push = x => { if (Array.isArray(x)) x.forEach(push); else if (x) notes.push({ day: state.day, ...x }); };
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
  }
  push(matureFDs(state));
  push(nutritionDay(state));
  if (state.status === 'dead') return notes;
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
  for (let i = 0; i < n && state.status !== 'dead'; i++) {
    state.day++;
    notes.push(...runDay(state));
  }
  return notes;
}

// Twelve in-game months: to the same calendar date next year, day by day under the normal rules.
export const daysInNextYear = state => sameDateNextYear(state.day) - state.day;
