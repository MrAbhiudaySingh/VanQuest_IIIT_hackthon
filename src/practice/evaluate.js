// Whole-life evaluation of a finished practice life. Deterministic: every score and every listed
// decision comes from the recorded months (life.log) and encounters — nothing is invented, and the same
// run always produces the same report. Wealth is never scored directly: categories measure decisions
// relative to the player's own income and costs, so a modest income is not penalised.
//
// Categories (0–100 each), overall = average, then caps:
//   1 Budgeting discipline       months with no new borrowing; no raiding long-term money for leisure
//   2 Essential expenses         rent/transport/utilities paid from your own money; food at or above need
//   3 Emergency preparedness     average reserve vs 3 months of essentials; shocks paid without borrowing
//   4 Savings & goal progress    months you saved anything; goal fund vs target
//   5 Investing & diversification  (process, not returns) no panic selling after the fall, single-company
//                                share ≤ 30% of investments, not investing while the reserve was < 1 month
//   6 Risk assessment            average score on legitimate / moderate-risk offers
//   7 Scam detection & verification  average score on scams (rejecting/reporting, evidence checked)
//   8 Debt & obligations         months in debt, peak debt vs income, debt left at the end
//   9 Health & essential needs   average health; months eating below need
//  10 Quality-of-life balance    average quality of life (health, some leisure, low stress)
//  Caps: health & needs < 50 → overall ≤ 55; essential expenses < 50 → overall ≤ 60.
import { MONTHS, netWorth } from './life.js';

const clamp = x => Math.max(0, Math.min(100, Math.round(x)));
const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const inr = n => `₹${Math.round(n).toLocaleString('en-IN')}`;
export const RATINGS = [[85, 'Excellent'], [70, 'Strong'], [55, 'Developing'], [40, 'Struggling'], [0, 'Needs support']];
export const CATEGORY_NAMES = {
  budgeting: 'Budgeting discipline', essentials: 'Essential expense management', emergency: 'Emergency preparedness', saving: 'Savings consistency & goal progress',
  investing: 'Investment understanding & diversification', risk: 'Risk assessment', scams: 'Scam detection & verification', debt: 'Debt & obligation management',
  health: 'Health & essential needs', qol: 'Quality-of-life balance',
};

export function evaluateLife(L) {
  if (!L.done) throw new Error('The practice life is not finished yet.');
  const s = L.scenario, log = L.log, ess = s.essentials;
  const newDebtMonths = log.filter(m => m.events.some(e => e.debt > 0 || (e.kind === 'shock' && e.sources?.debt))).length;
  const raidedForLeisure = log.filter(m => (m.decision.withdraw.goal + m.decision.withdraw.index + m.decision.withdraw.risky) > 0 && m.decision.leisure > s.income * 0.15).length;
  const billsFromDebt = log.filter(m => m.bills.debt > 0).length, billsFromReserve = log.filter(m => m.bills.reserve > 0).length;
  const lowFood = log.filter(m => m.foodRatio < 1).length, veryLowFood = log.filter(m => m.foodRatio < 0.8).length;
  const shocks = log.flatMap(m => m.events.filter(e => e.kind === 'shock').map(e => ({ ...e, month: m.month })));
  const shocksDebt = shocks.filter(e => e.sources?.debt > 0);
  const savedMonths = log.filter(m => m.decision.reserve + m.decision.goal + m.decision.index + m.decision.risky > 0).length;
  const invested = log.some(m => m.decision.index + m.decision.risky > 0) || L.commitments?.some(c => c.kind === 'sip');
  const panic = log.filter(m => m.events.some(e => e.kind === 'withdraw' && e.afterFall)).length;
  const investedWhileThin = log.filter(m => m.decision.index + m.decision.risky > 0 && m.reserve < ess).length;
  const finalInv = L.invest.index + L.invest.risky, riskyShare = finalInv ? L.invest.risky / finalInv : 0;
  const scams = L.encounters.filter(e => e.category === 'scam'), others = L.encounters.filter(e => e.category !== 'scam');
  const peakDebt = Math.max(0, ...log.map(m => m.debt)), debtMonths = log.filter(m => m.debt > 0).length;
  const avgHealth = avg(log.map(m => m.health)), avgQol = avg(log.map(m => m.qol)), leisureMonths = log.filter(m => m.decision.leisure > 0).length;
  const highStress = log.filter(m => m.stress >= 60).length;

  const cats = {
    budgeting: clamp(100 * (1 - newDebtMonths / MONTHS) - 10 * raidedForLeisure),
    essentials: clamp(100 - 100 * billsFromDebt / MONTHS - 50 * lowFood / MONTHS - 5 * billsFromReserve),
    emergency: clamp(70 * Math.min(1, avg(log.map(m => m.reserve / (3 * ess)))) + 30 * (shocks.length ? 1 - shocksDebt.length / shocks.length : 1)),
    saving: clamp(50 * savedMonths / MONTHS + 50 * Math.min(1, L.goalFund / s.goal.target)),
    investing: invested ? clamp(100 - 35 * Math.min(1, panic) - (riskyShare > 0.3 ? 30 : 0) - 10 * Math.min(3, investedWhileThin)) : 60,
    risk: others.length ? clamp(avg(others.map(e => e.score))) : 70,
    scams: scams.length ? clamp(avg(scams.map(e => e.score))) : 70,
    debt: clamp(100 - 5 * debtMonths - 40 * Math.min(1, peakDebt / s.income) - (L.debt > 0 ? 25 : 0)),
    health: clamp(avgHealth - 6 * lowFood - 6 * veryLowFood),
    qol: clamp(avgQol - 3 * highStress + (leisureMonths >= 8 ? 5 : 0)),
  };
  let overall = Math.round(avg(Object.values(cats)));
  const caps = [];
  if (cats.health < 50 && overall > 55) { overall = 55; caps.push('Your health and basic needs were neglected, so the overall rating is capped at 55 — money should support a life, not replace one.'); }
  if (cats.essentials < 50 && overall > 60) { overall = 60; caps.push('Essential bills or food were repeatedly not covered, so the overall rating is capped at 60.'); }
  const rating = RATINGS.find(([min]) => overall >= min)[1];

  // ---- the financial summary (actual numbers)
  const startNet = log[0].netStart, endNet = netWorth(L);
  const totals = { income: s.income * MONTHS + (log.some(m => m.events.some(e => e.kind === 'bonus')) ? s.bonus.amount : 0), food: log.reduce((a, m) => a + m.decision.food, 0),
    leisure: log.reduce((a, m) => a + m.decision.leisure, 0), saved: log.reduce((a, m) => a + m.decision.reserve + m.decision.goal, 0), invested: log.reduce((a, m) => a + m.decision.index + m.decision.risky, 0),
    debtInterest: log.reduce((a, m) => a + m.debtInterest, 0), shocks: shocks.reduce((a, e) => a + e.amount, 0) };
  const marketMove = s.market.reduce((v, m) => v * (1 + m.index), 1) - 1;

  // ---- best decisions & costly mistakes (only from recorded events)
  const best = [], mistakes = [];
  for (const e of shocks) {
    if (e.covered) best.push({ month: e.month, text: `Month ${e.month}: your health insurance paid the ${inr(e.amount)} ${e.text.split(':')[0].toLowerCase()}.`, why: 'Insurance turned a large, unpredictable cost into a small, planned one.' });
    else if (!e.sources?.debt && e.sources?.reserve) best.push({ month: e.month, text: `Month ${e.month}: the ${inr(e.amount)} ${e.text.split(':')[0].toLowerCase()} came out of your reserve, with no borrowing.`, why: 'This is exactly what an emergency reserve is for.' });
    else if (e.sources?.debt) mistakes.push({ month: e.month, text: `Month ${e.month}: ${inr(e.sources.debt)} had to be borrowed for the ${e.text.split(':')[0].toLowerCase()}.`, why: `Borrowing at 4% a month cost you ${inr(totals.debtInterest)} in interest over the year.` });
  }
  for (const e of L.encounters) {
    if (e.category === 'scam' && e.decision !== 'accept') best.push({ month: e.month, text: `Month ${e.month}: you turned down a scam${e.decision === 'report' ? ' and reported it' : ''}${e.revealed.length ? ` after checking ${e.revealed.length} thing(s)` : ''}.`, why: 'Pausing and verifying protected your money.' });
    if (e.category === 'scam' && e.decision === 'accept') mistakes.push({ month: e.month, text: `Month ${e.month}: you accepted a scam and lost ${inr(-e.money)}.`, why: e.revealed.length ? 'The warning signs were there in what you checked.' : 'You decided without checking anything first.' });
    if (e.category !== 'scam' && e.score >= 80) best.push({ month: e.month, text: `Month ${e.month}: a well-judged decision on a ${e.category === 'legitimate' ? 'genuine' : 'risky'} offer.`, why: 'You matched the decision to your own situation.' });
    if (e.category !== 'scam' && e.score < 45) mistakes.push({ month: e.month, text: `Month ${e.month}: a ${e.category === 'legitimate' ? 'genuine' : 'risky'} offer was handled poorly for your situation.`, why: 'Check whether you can afford the commitment or the loss before saying yes — or before reporting a real business.' });
  }
  if (lowFood) mistakes.push({ month: null, text: `You ate below what you need in ${lowFood} month(s).`, why: 'Under-eating cost health points that money can\'t buy back quickly.' });
  if (panic) mistakes.push({ month: null, text: 'You sold investments right after the market fall.', why: 'Selling after a fall locks in the loss; the plan was long-term.' });
  if (billsFromDebt) mistakes.push({ month: null, text: `Rent and bills needed borrowing in ${billsFromDebt} month(s).`, why: 'Essentials come first in a budget — plan them before anything flexible.' });
  if (savedMonths >= 10) best.push({ month: null, text: `You saved something in ${savedMonths} of ${MONTHS} months.`, why: 'Consistency matters more than size.' });
  if (invested && !panic && marketMove < 0.05 && finalInv > 0) best.push({ month: null, text: 'You stayed invested through a weak market.', why: 'Discipline, not timing, is what you control.' });

  // ---- strengths / weaknesses / priorities
  const ranked = Object.entries(cats).sort((a, b) => a[1] - b[1]);
  const ADVICE = {
    budgeting: 'Plan essentials first, then savings, then flexible spending — and don\'t spend money you\'ll have to borrow.',
    essentials: 'Cover rent, bills and enough food every month before anything else.',
    emergency: 'Build a reserve towards three months of essentials before investing or taking risks.',
    saving: 'Save a little every month towards your goal, even when the amount is small.',
    investing: 'Keep single-company shares a small slice, invest only money you won\'t need soon, and don\'t sell in a panic.',
    risk: 'Before accepting an uncertain offer, work out what you could lose and whether you could afford it.',
    scams: 'Pause, verify the provider, read the documents and compare the terms before any money moves.',
    debt: 'Borrow only as a last resort and repay high-cost debt first.',
    health: 'Never cut food below what you need to stay healthy — it costs more later.',
    qol: 'Leave room for some rest and enjoyment; a plan you can live with is a plan you\'ll keep.',
  };
  const CHALLENGE = {
    budgeting: 'Replay and finish the year without borrowing a single rupee.', essentials: 'Replay and never let rent, bills or food fall short.',
    emergency: 'Replay and reach a 3-month reserve before your first investment.', saving: 'Replay and save something in all 12 months.',
    investing: 'Replay and hold a diversified mix through the market fall.', risk: 'Replay and compare the terms of every offer before deciding.',
    scams: 'Replay and verify the provider before every decision Vikram asks for.', debt: 'Replay and end the year debt-free.',
    health: 'Replay and keep your health above 80 all year.', qol: 'Replay and keep stress below 60 while still saving.',
  };
  const weakest = ranked.slice(0, 3).map(([k, v]) => ({ category: CATEGORY_NAMES[k], score: v, advice: ADVICE[k] }));
  const wealthy = endNet - startNet > s.income * 3, neglected = cats.health < 50 || lowFood >= 4;
  const headline = wealthy && neglected ? 'You built substantial wealth, but repeatedly sacrificed your basic needs to do it. Money should support a life, not replace one.'
    : !wealthy && overall >= 70 ? 'On a tight budget you met your obligations, protected yourself and kept your life in balance — that is real financial skill.'
    : overall >= 85 ? 'A careful, balanced year: your needs were met, your reserve held and you judged risks well.'
    : overall >= 55 ? 'A year with real strengths and a few costly habits worth changing.'
    : 'A hard year. The good news: the biggest problems have clear, practical fixes.';
  return {
    version: 1, seed: L.seed, overall, rating, caps, headline, categories: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, { name: CATEGORY_NAMES[k], score: v }])),
    summary: { startNet, endNet, change: endNet - startNet, debt: L.debt, reserve: L.reserve, goal: { name: s.goal.name, saved: L.goalFund, target: s.goal.target }, investments: finalInv, avgHealth: Math.round(avgHealth), avgQol: Math.round(avgQol), ...totals, marketMove },
    best: best.slice(0, 5), mistakes: mistakes.slice(0, 5),
    budgeting: { strengths: [cats.budgeting >= 70 && 'Spending stayed within income in most months.', cats.saving >= 70 && 'Regular saving.'].filter(Boolean), weaknesses: [newDebtMonths && `${newDebtMonths} month(s) needed new borrowing.`, raidedForLeisure && 'Long-term savings were used to fund leisure.'].filter(Boolean) },
    investing: { strengths: [invested && !panic && 'Held investments through the fall.', invested && riskyShare <= 0.3 && 'Kept single-company risk small.'].filter(Boolean),
      weaknesses: [!invested && 'You never invested — fine on a tight budget, but long-term money can grow.', riskyShare > 0.3 && `${Math.round(riskyShare * 100)}% of investments in one company.`, investedWhileThin && 'Invested while your reserve was under a month of essentials.'].filter(Boolean),
      luck: `The index fund moved ${Math.round(marketMove * 100)}% over your year. Investment results in one year are mostly luck; your score measures the decisions, not the result.` },
    priorities: weakest, replay: CHALLENGE[ranked[0][0]],
  };
}

// Numbers the narrative may quote (for validating model-written feedback against the real run).
export function reportFacts(R) {
  const nums = new Set([R.overall, ...Object.values(R.categories).map(c => c.score), ...Object.values(R.summary).filter(v => typeof v === 'number').map(Math.round),
    R.summary.goal.saved, R.summary.goal.target]);
  return { allowedNumbers: [...nums], rating: R.rating };
}
