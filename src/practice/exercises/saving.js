// Exercise B — SAVING (Course 2). You split a lump sum between cash, a savings account and a fixed
// deposit, then live through the months: an emergency and a planned purchase arrive on seeded dates.
// All arithmetic is deterministic (sim/finmath.js + the game's real FD/savings rates).
import { rng, roundTo } from '../rng.js';
import { compoundMonthly, fdMaturityValue, fdEarlyMonths } from '../../sim/finmath.js';
import { FD_TERMS, FD_PENALTY, SAVINGS } from '../../data/banking.js';

export const FOCUS = {
  basic: 'Decide where your money lives: easy to reach, or locked for more interest.',
  goal: 'A planned purchase is coming — have the money ready on time.',
  emergency: 'Something unexpected will happen. Keep enough within reach.',
  banking: 'Track every movement and reconcile the balance.',
  interest: 'See simple vs compound growth and what locking money earns.',
  credit: 'Without a reserve, an emergency means borrowing — see what that costs.',
  commitments: 'Bills keep coming while you save. Leave room for them.',
};
export const INFLATION = 0.05;
export const BORROW_RATE = 0.24;     // informal/credit-card style borrowing for a shortfall (24% a year)

export function create(seed, focus = 'basic') {
  const r = rng('saving', seed, focus);
  const months = r.pick([12, 18, 24]);
  const lump = r.step(30000, 90000, 5000), monthly = r.step(1500, 5000, 500), essentials = r.step(8000, 14000, 1000);
  const emergency = { month: r.int(2, months - 2), amount: roundTo(essentials * (0.6 + r.next() * 1.0), 500), name: r.pick(['Hospital bill', 'Laptop repair', 'Family emergency travel', 'Scooter accident repair']) };
  const purchase = { month: r.int(Math.ceil(months / 2), months), amount: r.step(15000, 45000, 2500), name: r.pick(['Course fees', 'A laptop for college', 'Admission deposit']) };
  return { exercise: 'saving', seed, focus, brief: FOCUS[focus] ?? FOCUS.basic, months, lump, monthly, essentials, emergency, purchase,
    savingsRate: SAVINGS.rate, fdTerms: FD_TERMS.filter(t => t.months <= 36), fdPenalty: FD_PENALTY, inflation: INFLATION, borrowRate: BORROW_RATE };
}

// a neutral starting point (all cash) — the player decides where it goes
export const defaults = sc => ({ cash: sc.lump, savings: 0, fd: 0, fdTerm: 1, monthlyTo: 'cash' });

export function check(sc, d) {
  const errors = [];
  if (![d.cash, d.savings, d.fd].every(x => Number.isInteger(x) && x >= 0)) errors.push('Amounts must be whole rupees, zero or more.');
  if (d.cash + d.savings + d.fd !== sc.lump) errors.push(`Split exactly your ₹${sc.lump.toLocaleString('en-IN')}: you've placed ₹${(d.cash + d.savings + d.fd).toLocaleString('en-IN')}.`);
  if (d.fd > 0 && d.fd < 5000) errors.push('A fixed deposit needs at least ₹5,000.');
  if (!sc.fdTerms[d.fdTerm]) errors.push('Choose an FD term.');
  if (!['savings', 'cash'].includes(d.monthlyTo)) errors.push('Choose where the monthly savings go.');
  return { ok: !errors.length, errors };
}

// Month-by-month simulation. Payments come from cash, then savings, then (if needed) by breaking the
// FD early, then by borrowing at 24% a year until the next surplus repays it.
export function run(sc, d) {
  const c = check(sc, d);
  if (!c.ok) return { ok: false, errors: c.errors };
  const term = sc.fdTerms[d.fdTerm];
  let cash = d.cash, sav = d.savings, fd = d.fd, fdOpen = d.fd > 0, fdStart = 0, debt = 0;
  let interest = 0, penalty = 0, borrowCost = 0, brokeFd = false, minLiquid = Infinity;
  const rows = [], events = [];
  const pay = (amount, what, m) => {
    let need = amount;
    const fromCash = Math.min(cash, need); cash -= fromCash; need -= fromCash;
    const fromSav = Math.min(sav, need); sav -= fromSav; need -= fromSav;
    if (need > 0 && fdOpen) {
      const early = fdEarlyMonths(fd, term.rate, m - fdStart, sc.fdPenalty), full = fdMaturityValue(fd, term.rate, m - fdStart);
      penalty += Math.max(0, full - early); interest += early - fd; brokeFd = true; fdOpen = false;
      events.push({ month: m, text: `Broke the FD early to pay for ${what}: got ₹${early.toLocaleString('en-IN')} (₹${Math.max(0, full - early).toLocaleString('en-IN')} less than keeping it to this date at the full rate)` });
      sav += early; fd = 0;
      const more = Math.min(sav, need); sav -= more; need -= more;
    }
    if (need > 0) { debt += need; events.push({ month: m, text: `Borrowed ₹${need.toLocaleString('en-IN')} at ${sc.borrowRate * 100}% a year to pay for ${what}` }); }
    return amount - need;
  };
  for (let m = 1; m <= sc.months; m++) {
    const before = sav;
    sav = compoundMonthly(sav, sc.savingsRate, 1);
    interest += sav - before;
    if (debt) { const i = debt * sc.borrowRate / 12; borrowCost += i; debt += i; }
    let surplus = sc.monthly;
    if (debt) { const repay = Math.min(debt, surplus); debt -= repay; surplus -= repay; }
    if (d.monthlyTo === 'savings') sav += surplus; else cash += surplus;
    if (fdOpen && m - fdStart === term.months) {
      const v = fdMaturityValue(fd, term.rate, term.months); interest += v - fd; sav += v; fd = 0; fdOpen = false;
      events.push({ month: m, text: `FD matured: ₹${v.toLocaleString('en-IN')} moved to savings` });
    }
    if (m === sc.emergency.month) { events.push({ month: m, text: `${sc.emergency.name}: ₹${sc.emergency.amount.toLocaleString('en-IN')}`, shock: true }); pay(sc.emergency.amount, sc.emergency.name.toLowerCase(), m); }
    if (m === sc.purchase.month) { events.push({ month: m, text: `${sc.purchase.name}: ₹${sc.purchase.amount.toLocaleString('en-IN')} due`, goal: true }); pay(sc.purchase.amount, sc.purchase.name.toLowerCase(), m); }
    minLiquid = Math.min(minLiquid, cash + sav);
    rows.push({ month: m, cash: Math.round(cash), savings: Math.round(sav), fd: fdOpen ? fd : 0, debt: Math.round(debt) });
  }
  const fdNow = fdOpen ? fdEarlyMonths(fd, term.rate, sc.months - fdStart, 0) : 0;      // accrued value if still running
  if (fdOpen) interest += fdNow - fd;
  const total = Math.round(cash + sav + fdNow - debt);
  const contributed = sc.lump + sc.monthly * sc.months - sc.emergency.amount - sc.purchase.amount;
  return { ok: true, rows, events, interest: Math.round(interest), penalty: Math.round(penalty), borrowCost: Math.round(borrowCost), brokeFd, debtEnd: Math.round(debt),
    total, contributed, realTotal: Math.round(total / Math.pow(1 + sc.inflation, sc.months / 12)), minLiquid: Math.round(minLiquid), fdStillOpen: fdOpen, idleCash: Math.round(cash) };
}

// What the same months would have given with a few simple alternatives (same engine, for comparison).
export function alternatives(sc) {
  const best = { cash: 0, savings: sc.lump, fd: 0, fdTerm: 0, monthlyTo: 'savings' };
  const opts = [['Everything in savings', best], ['Everything in cash', { ...best, cash: sc.lump, savings: 0, monthlyTo: 'cash' }]];
  for (const [i, t] of sc.fdTerms.entries()) if (t.months <= sc.months) opts.push([`Everything in a ${t.months}-month FD`, { ...best, savings: 0, fd: sc.lump, fdTerm: i }]);
  const reserve = Math.min(sc.lump, roundTo(sc.essentials * 3, 1000));
  for (const [i, t] of sc.fdTerms.entries()) if (t.months <= sc.months && sc.lump - reserve >= 5000) opts.push([`3 months' essentials in savings, the rest in a ${t.months}-month FD`, { ...best, savings: reserve, fd: sc.lump - reserve, fdTerm: i }]);
  return opts.map(([label, d]) => ({ label, decision: d, result: run(sc, d) }));
}

export function score(sc, d, res) {
  const pts = [], add = (label, earned, max, why) => pts.push({ label, earned: Math.max(0, Math.min(max, Math.round(earned))), max, why });
  add('Emergency paid without borrowing', res.events.some(e => /Borrowed/.test(e.text) && e.month === sc.emergency.month) ? 0 : res.brokeFd && res.events.find(e => /Broke the FD/.test(e.text))?.month === sc.emergency.month ? 15 : 30, 30,
    res.brokeFd && res.events.find(e => /Broke the FD/.test(e.text))?.month === sc.emergency.month ? `The emergency forced you to break the FD early (₹${res.penalty.toLocaleString('en-IN')} lost to the penalty).`
      : res.events.some(e => /Borrowed/.test(e.text) && e.month === sc.emergency.month) ? 'You had to borrow for the emergency — accessible savings ran out.' : 'The emergency was paid from money you could reach.');
  const purchaseOk = !res.events.some(e => e.month === sc.purchase.month && /Borrowed/.test(e.text));
  add('Planned purchase paid on time', purchaseOk ? 25 : 5, 25, purchaseOk ? `${sc.purchase.name} paid when due.` : `${sc.purchase.name} needed borrowing — the money wasn't ready.`);
  const alts = alternatives(sc).filter(a => a.result.ok && !a.result.debtEnd && !a.result.borrowCost);
  const bestSafe = Math.max(...alts.map(a => a.result.total), res.total);
  add('Interest earned vs the best safe option', 20 * Math.max(0, 1 - (bestSafe - res.total) / Math.max(1, bestSafe * 0.02)), 20,
    `You finished with ₹${res.total.toLocaleString('en-IN')}; the best plan that never borrowed finished with ₹${bestSafe.toLocaleString('en-IN')}.`);
  add('Kept a reserve within reach', 15 * Math.min(1, res.minLiquid / sc.essentials), 15,
    `Your lowest accessible balance was ₹${res.minLiquid.toLocaleString('en-IN')} — ${res.minLiquid >= sc.essentials ? 'at least a month of essentials' : `less than one month of essentials (₹${sc.essentials.toLocaleString('en-IN')})`}.`);
  add('No idle cash earning nothing', res.idleCash <= sc.essentials ? 10 : Math.max(0, 10 - (res.idleCash - sc.essentials) / 2000), 10,
    res.idleCash > sc.essentials ? `₹${res.idleCash.toLocaleString('en-IN')} sat in cash at 0% — and lost value to ${sc.inflation * 100}% inflation.` : 'Money you didn\'t need in hand was earning interest.');
  const total = pts.reduce((s, p) => s + p.earned, 0);
  return { exercise: 'saving', seed: sc.seed, score: total, points: pts, wentWell: pts.filter(p => p.earned >= p.max * 0.8).map(p => p.why), improve: pts.filter(p => p.earned < p.max * 0.8).map(p => p.why) };
}
