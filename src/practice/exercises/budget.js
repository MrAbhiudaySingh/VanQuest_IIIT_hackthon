// Exercise A — BUDGETING (Course 1). Pure and deterministic: create() builds a seeded month,
// check() refuses impossible allocations (you can't allocate money you don't have), run() plays the
// month day by day (bills on their due dates, an unexpected cost after you commit), score() grades it.
import { rng, roundTo } from '../rng.js';

const R = (r, lo, hi, step = 100) => r.step(lo, hi, step);
export const FOCUS = {
  basic: 'Build a budget that covers every essential first.',
  categories: 'Sort costs into essential and flexible, then decide what can give.',
  goal: 'Reach a savings goal without dropping an essential.',
  records: 'Plan, then compare what actually happened with the plan.',
  opportunity: 'A tempting purchase competes with your goal — what does it cost you?',
  timing: 'Your pay arrives late in the month — make sure bills due earlier are covered.',
  review: 'Budget Day: last month went over plan. Set this month realistically.',
};

export function create(seed, focus = 'basic') {
  const r = rng('budget', seed, focus);
  const income = R(r, 14000, 26000, 500);
  const payday = focus === 'timing' ? 28 : 1;
  const opening = focus === 'timing' ? R(r, 4000, 7000, 500) : R(r, 1000, 3000, 500);
  const rent = roundTo(income * (0.26 + r.next() * 0.06), 100);
  const bills = [
    { id: 'rent', name: 'Rent contribution', amount: rent, due: 5, essential: true },
    { id: 'transport', name: 'Transport pass', amount: R(r, 700, 1400), due: 3, essential: true },
    { id: 'phone', name: 'Phone & internet', amount: R(r, 300, 700), due: 10, essential: true },
    { id: 'study', name: 'Study materials (planned)', amount: R(r, 400, 1200), due: 15, essential: true },
  ];
  const food = { need: R(r, 2800, 4200), due: 2 };            // the cost of eating properly this month
  const wants = [
    { id: 'fun', name: 'Entertainment & outings', suggested: R(r, 800, 2000) },
    { id: 'eatout', name: 'Eating out', suggested: R(r, 500, 1500) },
  ];
  if (focus === 'opportunity') wants.push({ id: 'gadget', name: 'New headphones (on sale)', suggested: R(r, 2000, 4000, 500), oneOff: true });
  const goal = { name: r.pick(['Course fee', 'Laptop fund', 'Exam coaching', 'Bicycle']), target: R(r, 6000, 15000, 500), months: r.int(3, 8), saved: R(r, 0, 3000, 500) };
  goal.monthly = Math.ceil((goal.target - goal.saved) / goal.months / 100) * 100;
  const essentials = bills.reduce((s, b) => s + b.amount, 0) + food.need;
  const emergency = { have: R(r, 0, 2000, 500), target: roundTo(essentials * 0.5, 500) };   // a starter reserve: half a month of essentials
  const shock = { name: r.pick(['Phone screen repair', 'Doctor visit and medicine', 'Bicycle repair', 'Replacement school shoes']), amount: R(r, 900, 2800), day: r.int(12, 22) };
  const lastMonth = focus === 'review' ? { planned: essentials, actual: essentials + R(r, 400, 1200) } : null;
  return { exercise: 'budget', seed, focus, brief: FOCUS[focus] ?? FOCUS.basic, income, payday, opening, bills, food, wants, goal, emergency, shock, lastMonth,
    lateFeeRate: 0.05, lateFeeMin: 100, borrowFee: 0.10 };
}

export const available = sc => sc.opening + sc.income;

export function defaults(sc) {
  return { bills: Object.fromEntries(sc.bills.map(b => [b.id, b.amount])), food: sc.food.need,
    wants: Object.fromEntries(sc.wants.map(w => [w.id, w.oneOff ? 0 : w.suggested])), goal: 0, emergency: 0,
    shock: { emergency: 0, wants: 0, goal: 0 } };
}

const intOk = x => Number.isInteger(x) && x >= 0;
export function check(sc, d) {
  const errors = [];
  const amounts = [...Object.values(d.bills), d.food, ...Object.values(d.wants), d.goal, d.emergency];
  if (!amounts.every(intOk)) errors.push('Every amount must be a whole number of rupees, zero or more.');
  for (const b of sc.bills) if ((d.bills[b.id] ?? 0) > b.amount) errors.push(`${b.name}: you can't pay more than the ₹${b.amount} bill.`);
  const total = amounts.reduce((s, x) => s + (Number(x) || 0), 0), have = available(sc);
  if (total > have) errors.push(`You've allocated ₹${total.toLocaleString('en-IN')} but only have ₹${have.toLocaleString('en-IN')} (opening cash + income). Money can't be created.`);
  return { ok: !errors.length, errors, total, left: have - total };
}

// How the unexpected cost is covered (decided after the budget is committed).
export function checkShock(sc, d) {
  const s = d.shock, errors = [];
  if (![s.emergency, s.wants, s.goal].every(intOk)) errors.push('Amounts must be whole rupees.');
  const emergencyFund = sc.emergency.have + d.emergency, wantsLeft = Object.values(d.wants).reduce((a, b) => a + b, 0);
  if (s.emergency > emergencyFund) errors.push(`Your emergency fund only holds ₹${emergencyFund.toLocaleString('en-IN')}.`);
  if (s.wants > wantsLeft) errors.push(`You only planned ₹${wantsLeft.toLocaleString('en-IN')} of flexible spending to cut.`);
  if (s.goal > d.goal) errors.push(`You only planned to put ₹${d.goal.toLocaleString('en-IN')} towards your goal this month.`);
  if (s.emergency + s.wants + s.goal > sc.shock.amount) errors.push(`That's more than the ₹${sc.shock.amount.toLocaleString('en-IN')} cost.`);
  const unplanned = check(sc, d).left;                                  // money you never allocated
  const covered = s.emergency + s.wants + s.goal + unplanned;
  return { ok: !errors.length, errors, unplanned, borrowed: Math.max(0, sc.shock.amount - covered) };
}

// Play the month day by day. Bills are paid on their due day from the cash you hold that day.
export function run(sc, d) {
  const c = check(sc, d), sh = checkShock(sc, d);
  if (!c.ok || !sh.ok) return { ok: false, errors: [...c.errors, ...sh.errors] };
  const events = [];
  let cash = sc.opening, lateFees = 0, unpaid = 0;
  const pays = [
    ...sc.bills.map(b => ({ day: b.due, name: b.name, amount: d.bills[b.id], full: b.amount, essential: true })),
    { day: sc.food.due, name: 'Food for the month', amount: d.food, full: sc.food.need, essential: true },
    ...sc.wants.map(w => ({ day: 2, name: w.name, amount: d.wants[w.id], full: 0 })),
  ].filter(p => p.amount > 0 || p.full > 0).sort((a, b) => a.day - b.day);
  const dayList = [...new Set([1, sc.payday, ...pays.map(p => p.day), sc.shock.day])].sort((a, b) => a - b);
  for (const day of dayList) {
    if (day === sc.payday) { cash += sc.income; events.push({ day, text: `Pay arrives`, amount: sc.income, cash }); }
    for (const p of pays.filter(x => x.day === day)) {
      if (p.amount > cash) {
        const fee = Math.max(sc.lateFeeMin, Math.round(p.amount * sc.lateFeeRate));
        lateFees += fee;
        events.push({ day, text: `${p.name}: not enough cash on the ${day}th — paid late with a ₹${fee} fee`, amount: -(p.amount + fee), late: true });
        p.paidLate = true; p.day = Math.max(sc.payday, day);
        continue;
      }
      cash -= p.amount;
      if (p.essential && p.amount < p.full) unpaid += p.full - p.amount;
      events.push({ day, text: p.essential && p.amount < p.full ? `${p.name}: paid ₹${p.amount} of ₹${p.full} — ₹${p.full - p.amount} unpaid` : p.name, amount: -p.amount, cash });
    }
    if (day === sc.shock.day) events.push({ day, text: `Unexpected: ${sc.shock.name}`, amount: -sc.shock.amount, shock: true });
  }
  // late payments come out after payday; savings moves happen at the end of the month
  for (const p of pays.filter(x => x.paidLate)) { cash -= p.amount + Math.max(sc.lateFeeMin, Math.round(p.amount * sc.lateFeeRate)); if (p.essential && p.amount < p.full) unpaid += p.full - p.amount; }
  const borrowCost = Math.round(sh.borrowed * sc.borrowFee);
  const emergencyEnd = sc.emergency.have + d.emergency - d.shock.emergency;
  const goalAdded = d.goal - d.shock.goal, goalSaved = sc.goal.saved + goalAdded;
  const remaining = goalSaved >= sc.goal.target ? 0 : sc.goal.target - goalSaved;
  const monthsToGoal = goalAdded > 0 ? Math.ceil(remaining / goalAdded) : Infinity;
  const essentialsShort = sc.bills.reduce((s, b) => s + Math.max(0, b.amount - d.bills[b.id]), 0);
  const foodShort = Math.max(0, sc.food.need - d.food);
  return { ok: true, events, lateFees, borrowed: sh.borrowed, borrowCost, debtAfter: sh.borrowed + borrowCost, unplannedUsed: Math.min(sh.unplanned, sc.shock.amount),
    endCash: c.left - Math.max(0, Math.min(sh.unplanned, sc.shock.amount)) - lateFees, emergencyEnd, goalAdded, goalSaved, monthsToGoal, essentialsShort, foodShort,
    wantsSpent: Object.values(d.wants).reduce((a, b) => a + b, 0) - d.shock.wants };
}

// Score out of 100 with the reason for every point (documented in the README).
export function score(sc, d, res) {
  const pts = [];
  const add = (label, earned, max, why) => pts.push({ label, earned: Math.max(0, Math.min(max, Math.round(earned))), max, why });
  const essentialTotal = sc.bills.reduce((s, b) => s + b.amount, 0);
  add('Essential bills paid in full', 25 * (1 - res.essentialsShort / essentialTotal), 25,
    res.essentialsShort ? `₹${res.essentialsShort.toLocaleString('en-IN')} of essential bills went unpaid.` : 'Every essential bill was covered.');
  add('Enough food', res.foodShort ? 10 * Math.max(0, 1 - res.foodShort / sc.food.need * 3) : 10, 10,
    res.foodShort ? `Food was ₹${res.foodShort.toLocaleString('en-IN')} below what you need to eat properly.` : 'You budgeted enough to eat properly.');
  add('Bills paid on time', res.lateFees ? Math.max(0, 10 - res.lateFees / 50) : 10, 10,
    res.lateFees ? `₹${res.lateFees} in late fees — a bill fell due before you had the cash (check due dates against payday).` : 'No late fees: cash was there on every due date.');
  add('Unexpected cost handled without borrowing', res.borrowed ? Math.max(0, 15 - res.borrowed / 100) : 15, 15,
    res.borrowed ? `You had to borrow ₹${res.borrowed.toLocaleString('en-IN')} for the ${sc.shock.name.toLowerCase()}, costing ₹${res.borrowCost} extra.` : `The ₹${sc.shock.amount.toLocaleString('en-IN')} ${sc.shock.name.toLowerCase()} was covered from money you had.`);
  add('Emergency reserve', 15 * Math.min(1, res.emergencyEnd / sc.emergency.target), 15,
    res.emergencyEnd >= sc.emergency.target ? `Your reserve ends at ₹${res.emergencyEnd.toLocaleString('en-IN')} — at or above the ₹${sc.emergency.target.toLocaleString('en-IN')} starter target.` : `Your reserve ends at ₹${res.emergencyEnd.toLocaleString('en-IN')}, below the ₹${sc.emergency.target.toLocaleString('en-IN')} starter target.`);
  add('Progress towards your goal', 15 * Math.min(1, res.goalAdded / sc.goal.monthly), 15,
    res.goalAdded >= sc.goal.monthly ? `₹${res.goalAdded.toLocaleString('en-IN')} saved — on track for the ${sc.goal.name.toLowerCase()} in ${sc.goal.months} months.`
      : `₹${res.goalAdded.toLocaleString('en-IN')} saved; the ${sc.goal.name.toLowerCase()} needs ₹${sc.goal.monthly.toLocaleString('en-IN')} a month to be ready in ${sc.goal.months} months${Number.isFinite(res.monthsToGoal) ? ` (at this rate: ${res.monthsToGoal} months)` : ''}.`);
  const flexibleShare = res.wantsSpent / sc.income;
  add('Flexible spending fits the plan', flexibleShare <= 0.2 ? 10 : Math.max(0, 10 - (flexibleShare - 0.2) * 50), 10,
    `Flexible spending was ${Math.round(flexibleShare * 100)}% of income${flexibleShare > 0.2 ? ' — high while goals and the reserve are still short' : ''}.`);
  const total = pts.reduce((s, p) => s + p.earned, 0);
  return { exercise: 'budget', seed: sc.seed, score: total, points: pts,
    wentWell: pts.filter(p => p.earned >= p.max * 0.8).map(p => p.why), improve: pts.filter(p => p.earned < p.max * 0.8).map(p => p.why) };
}
