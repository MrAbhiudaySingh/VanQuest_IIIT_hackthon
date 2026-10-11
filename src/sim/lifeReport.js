// The FINAL MAIN-GAME LIFE EVALUATION (Round 7) — built once, when a life ends (death, retirement at 60
// or manual retirement), from the character's actual record: the ledger, trades, fixed deposits, loans,
// property deals, Vikram's encounters, the monthly life record (lifeLog.js), health statistics, events
// and the goals quiz. It is NOT the academy's practice evaluation (src/practice/life.js).
//
// Everything here is deterministic. Each criterion has metrics (numbers computed below), findings (plain
// sentences that quote only those numbers) and evidence ids pointing at real records. An AI narrative may
// later be attached (lifeEnd.js) but it can never change anything in this object.
//
// Criteria and weights (renormalised over the criteria that could be assessed):
//   A investing 15% · B budgeting 20% · C saving & resilience 20% · D risk 15% · E quality of life 20% · F goals 10%
//   G (areas to improve) is derived from A–F and is not scored.
// Caps (applied after the weighted average, each explained in the report):
//   • repeated neglect of basic needs (≥ 30 days without enough food, ≥ 3 months without a home, or health
//     below 40) → overall at most 62, whatever the wealth;   • death from malnutrition → at most 45.
// Ratings: Excellent ≥ 85 · Strong ≥ 70 · Developing ≥ 55 · Struggling ≥ 40 · Needs support below 40.
import { ASSETS } from '../data/market.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { overview } from './networth.js';
import { portfolio, price } from './market.js';
import { fdAccruedValue } from './bank.js';
import { allReports } from './propertyReport.js';
import { goalStatus } from './goals.js';
import { ageOn } from './character.js';
import { classify } from './lifeLog.js';
import { inr, fmtDate, monthKey } from './util.js';

export const REPORT_VERSION = 1;
export const WEIGHTS = { investing: 0.15, budgeting: 0.20, saving: 0.20, risk: 0.15, quality: 0.20, goals: 0.10 };
export const CRITERIA = { investing: 'Investment performance & behaviour', budgeting: 'Money management & budgeting', saving: 'Saving & financial resilience',
  risk: 'Risk assessment & management', quality: 'Quality of life', goals: 'Goal achievement' };
export const RATINGS = [[85, 'Excellent'], [70, 'Strong'], [55, 'Developing'], [40, 'Struggling'], [0, 'Needs support']];
export const ratingFor = score => RATINGS.find(([min]) => score >= min)[1];
export const NEGLECT = { unfedDays: 30, homelessMonths: 3, minHealth: 40, cap: 62, starvedCap: 45 };
export const ENDINGS = { death: 'Died', retired_age: 'Retired automatically at 60', retired_manual: 'Retired by choice' };

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const pct = x => `${Math.round(x * 1000) / 10}%`;
const round1 = x => Math.round(x * 10) / 10;
const byId = Object.fromEntries(ENCOUNTERS.map(e => [e.id, e]));
const RISK_RANK = { Low: 1, Medium: 2, High: 3, 'Very high': 4 };

export function buildLifeReport(state, ending) {
  const evidence = {};
  const ev = (id, day, text) => { if (!evidence[id]) evidence[id] = { day, text: String(text).slice(0, 160) }; return id; };
  const endDay = ending.day, log = (state.lifeLog ?? []).filter(r => !r.partial), months = log.length;
  const years = Math.max(1 / 12, (endDay - (state.character?.startDay ?? 0)) / 365);
  const o = overview(state);
  const earnedTotal = log.reduce((s, r) => s + r.flow.earned, 0);
  const essentialTotal = log.reduce((s, r) => s + r.flow.essential, 0);
  const constrained = earnedTotal > 0 && essentialTotal / earnedTotal >= 0.85;

  const snapshot = {
    accessible: o.assets.cash + o.assets.savings, cash: o.assets.cash, savings: o.assets.savings, fixedDeposits: o.assets.fixedDeposits,
    investments: o.assets.investments, property: o.assets.property, vehicles: o.assets.vehicles, rentDeposit: o.assets.rentDeposit,
    debt: o.totalLiabilities, liabilities: o.liabilities, netWorth: o.netWorth, totalAssets: o.totalAssets,
    salary: state.job.salary, job: state.job.title, health: state.health, housing: state.housing?.kind ?? 'none',
  };

  const criteria = {
    investing: investing(state, ev, endDay, log, snapshot),
    budgeting: budgeting(state, ev, log, constrained),
    saving: saving(state, ev, log, constrained, snapshot),
    risk: risk(state, ev, log),
    quality: quality(state, ev, log, ending, snapshot, years, earnedTotal),
  };
  criteria.goals = goals(state, ev, criteria, endDay);
  for (const [k, c] of Object.entries(criteria)) { c.key = k; c.name = CRITERIA[k]; c.weight = WEIGHTS[k]; }

  // ---- overall score and caps
  const assessed = Object.values(criteria).filter(c => c.score != null);
  const wsum = assessed.reduce((s, c) => s + c.weight, 0);
  let overall = wsum ? Math.round(assessed.reduce((s, c) => s + c.score * c.weight, 0) / wsum) : 0;
  const caps = [];
  const q = criteria.quality.metrics;
  if (q.neglect) { const before = overall; overall = Math.min(overall, NEGLECT.cap); if (before > overall) caps.push(`Overall limited to ${NEGLECT.cap} because basic needs were repeatedly neglected (${q.neglectWhy}). Money should support a life, not replace one.`); }
  if (ending.kind === 'death' && ending.cause === 'malnutrition') { const before = overall; overall = Math.min(overall, NEGLECT.starvedCap); if (before > overall) caps.push(`Overall limited to ${NEGLECT.starvedCap} because the life ended in death from malnutrition.`); }

  const limitations = [];
  if (state.character?.legacy) limitations.push(`This save began before Round 7: the month-by-month record (health, balances, budgets) starts in ${monthKey(state.character.historyFrom)}. Earlier months are judged only from the ledger; nothing about them is assumed.`);
  if (months < 3) limitations.push(`Only ${months} complete month${months === 1 ? ' was' : 's were'} recorded, so budgeting and saving patterns can't be judged reliably.`);
  for (const c of Object.values(criteria)) if (c.limitation) limitations.push(`${c.name}: ${c.limitation}`);

  const report = {
    version: REPORT_VERSION, generatedDay: endDay,
    character: { name: state.character?.name ?? null, runId: state.character?.runId ?? null, startDay: state.character?.startDay ?? 0, legacy: !!state.character?.legacy },
    ending: { ...ending, label: ENDINGS[ending.kind], age: ageOn(state, endDay), date: fmtDate(endDay) },
    years: round1(years), monthsRecorded: months, snapshot, criteria, overall, rating: ratingFor(overall), caps, limitations,
    constrained, evidence,
  };
  report.improvements = improvements(report);
  return report;
}

// =====================================================================================  A. investing
function investing(state, ev, endDay, log, snap) {
  const trades = state.brokerage.trades, held = portfolio(state);
  const cats = [];
  // ---- the trading desk, grouped by asset type (each type is one category)
  const types = [...new Set(trades.map(t => ASSETS[t.asset].type))];
  const panicAll = [], dipsAll = [], churnAll = [];
  for (const type of types) {
    const ts = trades.filter(t => ASSETS[t.asset].type === type), ids = [...new Set(ts.map(t => t.asset))];
    const buys = ts.filter(t => t.side === 'buy'), sells = ts.filter(t => t.side === 'sell');
    const capital = buys.reduce((s, t) => s + t.net, 0), fees = ts.reduce((s, t) => s + t.fee, 0);
    const realized = sells.reduce((s, t) => s + (t.realized ?? 0), 0);
    const rows = held.rows.filter(r => ids.includes(r.id)), unrealized = rows.reduce((s, r) => s + r.pnl, 0);
    const first = Math.min(...buys.map(t => t.day)), last = rows.length ? endDay : Math.max(...ts.map(t => t.day));
    const span = Math.max(1, last - first);
    // behaviour on each trade, judged from prices known at that moment (the 30 days before it)
    const panic = [], dips = [], churn = [];
    for (const t of ts) {
      const high = Math.max(...Array.from({ length: 30 }, (_, i) => price(state, t.asset, Math.max(0, t.day - i))));
      const fall = t.price / high - 1;
      if (t.side === 'sell' && fall <= -0.10 && (t.realized ?? 0) < 0) panic.push(ev(`T${t.id}`, t.day, `Sold ${t.qty} ${t.asset} at ${inr(t.price)}, ${pct(-fall)} below its 30-day high, for a loss of ${inr(-t.realized)}`));
      if (t.side === 'buy' && fall <= -0.10) dips.push(ev(`T${t.id}`, t.day, `Bought ${t.qty} ${t.asset} at ${inr(t.price)} during a ${pct(-fall)} fall`));
      if (t.side === 'sell' && ts.some(b => b.side === 'buy' && b.asset === t.asset && t.day - b.day < 30 && t.day >= b.day)) churn.push(ev(`T${t.id}`, t.day, `Sold ${t.asset} within 30 days of buying it`));
    }
    panicAll.push(...panic); dipsAll.push(...dips); churnAll.push(...churn);
    const riskLvl = ids.map(id => ASSETS[id].risk).sort((a, b) => RISK_RANK[b] - RISK_RANK[a])[0];
    cats.push(category({ key: type, name: type === 'Stock' ? 'Individual stocks' : `${type}s`, capital, realized, unrealized, income: 0, fees, span, risk: riskLvl,
      decisions: ts.length, enough: span >= 365 || (buys.length >= 2 && span >= 90), refs: ts.slice(0, 4).map(t => ev(`T${t.id}`, t.day, `${t.side === 'buy' ? 'Bought' : 'Sold'} ${t.qty} ${t.asset} @ ${inr(t.price)}`)),
      detail: ids.map(id => ASSETS[id].name).join(', '), panic: panic.length, dips: dips.length, churn: churn.length }));
  }
  // ---- fixed deposits
  const fds = state.bank.fds;
  if (fds.length) {
    const capital = fds.reduce((s, f) => s + f.principal, 0);
    const realized = fds.filter(f => f.status !== 'active').reduce((s, f) => s + (f.interest ?? 0), 0);
    const unrealized = fds.filter(f => f.status === 'active').reduce((s, f) => s + fdAccruedValue(f, endDay) - f.principal, 0);
    const broken = fds.filter(f => f.status === 'broken');
    const penalty = broken.reduce((s, f) => s + Math.max(0, fdAccruedValue({ ...f, status: 'active' }, f.closedDay) - f.payout), 0);
    const span = Math.round(fds.reduce((s, f) => s + ((f.closedDay ?? endDay) - f.startDay), 0) / fds.length);
    cats.push(category({ key: 'fd', name: 'Fixed deposits', capital, realized, unrealized, income: 0, fees: penalty, span, risk: 'Low', decisions: fds.length, enough: true,
      refs: fds.slice(0, 4).map(f => ev(f.uid, f.startDay, `FD of ${inr(f.principal)} for ${f.months} months at ${pct(f.rate)}${f.status === 'broken' ? ', closed early' : ''}`)),
      detail: `${fds.length} opened, ${broken.length} closed early${penalty ? ` (${inr(penalty)} of interest given up)` : ''}`, broken: broken.length, penalty }));
  }
  // ---- property bought (economic return from propertyReport.js: realised when sold, an estimate if held)
  const props = allReports(state);
  if (props.length) {
    const capital = props.reduce((s, r) => s + r.invested, 0);
    const realized = props.filter(r => !r.open).reduce((s, r) => s + r.profit, 0), unrealized = props.filter(r => r.open).reduce((s, r) => s + r.profit, 0);
    const first = Math.min(...props.map(r => r.boughtDay)), span = Math.max(1, endDay - first);
    cats.push(category({ key: 'property', name: 'Property', capital, realized, unrealized, income: 0, fees: 0, span, risk: 'Medium', decisions: props.length, enough: span >= 365,
      refs: props.slice(0, 4).map(r => ev(`P-${r.id}-${r.boughtDay}`, r.boughtDay, `${r.name}: ${r.open ? 'held, estimated' : 'sold, realised'} ${inr(r.profit)} on ${inr(r.invested)} of own money${r.forced ? ' (forced sale)' : ''}`)),
      detail: props.map(r => `${r.name}${r.open ? '' : r.forced ? ' (repossessed)' : ' (sold)'}`).join(', '), forced: props.filter(r => r.forced).length }));
  }
  // ---- Vikram's offers the player put money into
  const stakes = state.encounters.log.filter(r => r.stake > 0);
  if (stakes.length) {
    const capital = stakes.reduce((s, r) => s + r.stake, 0), realized = stakes.filter(r => r.status === 'resolved').reduce((s, r) => s + r.pnl, 0);
    cats.push(category({ key: 'tipster', name: 'Street tips (Vikram\'s offers)', capital, realized, unrealized: 0, income: 0, fees: 0, span: 30, risk: 'Unverified', decisions: stakes.length, enough: stakes.length >= 2,
      refs: stakes.slice(0, 4).map(r => ev(r.uid, r.day, `Committed ${inr(r.stake)} to "${byId[r.id].offer.name}"${r.status === 'resolved' ? `, got back ${inr(r.payout)}` : ', not settled yet'}`)),
      detail: `${stakes.length} offer${stakes.length > 1 ? 's' : ''} taken` }));
  }

  const metrics = { categories: cats, trades: trades.length, tradesPerYear: round1(trades.length / Math.max(1, cats.length ? (endDay - Math.min(...trades.map(t => t.day), endDay)) / 365 : 1)),
    panicSells: panicAll.length, boughtDips: dipsAll.length, shortTrades: churnAll.length };
  if (!cats.length) return { score: null, metrics, findings: [{ kind: 'note', text: 'You never invested: no trades, fixed deposits, property or tips. There is nothing to judge here, and not investing is not marked down.', refs: [] }],
    limitation: 'No investment history.', rankings: null };

  const capital = cats.reduce((s, c) => s + c.capital, 0), pnl = cats.reduce((s, c) => s + c.realized + c.unrealized, 0);
  const maxClasses = Math.max(0, ...log.map(r => r.mix.classes));
  const concentratedMonths = log.filter(r => r.mix.total > 0 && r.mix.topShare > 0.6 && r.mix.total >= 3 * (r.essentialAvg || 1));
  const tradingCap = cats.filter(c => ASSETS_TYPES.has(c.key)).reduce((s, c) => s + c.capital, 0);
  const riskyCap = cats.filter(c => ['High', 'Very high'].includes(c.risk)).reduce((s, c) => s + c.capital, 0);
  Object.assign(metrics, { capital, pnl, returnOnCapital: capital ? round1(pnl / capital * 100) : 0, realized: cats.reduce((s, c) => s + c.realized, 0), unrealized: cats.reduce((s, c) => s + c.unrealized, 0),
    maxClasses, concentratedMonths: concentratedMonths.length, highRiskShare: tradingCap ? round1(riskyCap / tradingCap * 100) : 0 });

  // ---- rankings: by return on capital per year held (only categories with enough history), never by raw gains
  const judged = cats.filter(c => c.enough).sort((a, b) => b.annual - a.annual);
  const rankings = {
    best: judged.filter(c => c.annual > 0).slice(0, 2).map(c => c.key),
    worst: [...judged].reverse().filter(c => c.annual <= 0 || judged.indexOf(c) >= 2).slice(0, 2).map(c => c.key),
    strongestDecisions: cats.filter(c => c.decisionScore >= 70).sort((a, b) => b.decisionScore - a.decisionScore).slice(0, 2).map(c => c.key),
    unnecessaryRisk: cats.filter(c => c.riskFlag).map(c => c.key),
    insufficient: cats.filter(c => !c.enough).map(c => c.key),
  };

  const f = [];
  f.push({ kind: 'note', text: `You put ${inr(capital)} of your own money into ${cats.length} kind${cats.length > 1 ? 's' : ''} of investment. Realised result ${inr(metrics.realized)}; still-held positions ${metrics.unrealized >= 0 ? 'up' : 'down'} ${inr(Math.abs(metrics.unrealized))} (unrealised — not counted as profit taken).`, refs: cats.flatMap(c => c.refs.slice(0, 1)) });
  for (const k of rankings.best) { const c = cats.find(x => x.key === k); f.push({ kind: 'strength', text: `Best performer relative to the money and time involved: ${c.name} — ${pct(c.roc)} on ${inr(c.capital)} over ${Math.round(c.span / 30)} months (${pct(c.annual)} a year), ${c.risk} risk.`, refs: c.refs }); }
  for (const c of cats.filter(c => c.enough && c.annual < 0)) f.push({ kind: 'weakness', text: `${c.name} lost money: ${inr(c.realized + c.unrealized)} on ${inr(c.capital)} (${pct(c.roc)}).`, refs: c.refs });
  for (const c of cats.filter(c => !c.enough)) f.push({ kind: 'limitation', text: `${c.name}: only ${c.decisions} decision${c.decisions > 1 ? 's' : ''} over ${Math.round(c.span / 30)} month(s) — too little history to judge skill${c.realized + c.unrealized > 0 ? '; one good result is not proof of skill' : ''}.`, refs: c.refs });
  if (panicAll.length) f.push({ kind: 'weakness', text: `${panicAll.length} sale${panicAll.length > 1 ? 's' : ''} at a loss after a fall of 10% or more — selling into a decline locks the loss in.`, refs: panicAll.slice(0, 4) });
  if (dipsAll.length) f.push({ kind: 'strength', text: `${dipsAll.length} purchase${dipsAll.length > 1 ? 's' : ''} made during a fall of 10% or more, rather than selling.`, refs: dipsAll.slice(0, 4) });
  if (churnAll.length >= 3) f.push({ kind: 'weakness', text: `${churnAll.length} sales came within 30 days of buying — frequent short-term trading adds fees and rarely helps.`, refs: churnAll.slice(0, 4) });
  if (maxClasses >= 3) f.push({ kind: 'strength', text: `Diversified: at one point you held ${maxClasses} different kinds of investment at once.`, refs: [] });
  if (concentratedMonths.length >= 3) f.push({ kind: 'weakness', text: `For ${concentratedMonths.length} month(s) more than 60% of your investments sat in a single stock or token — concentration risk.`, refs: concentratedMonths.slice(0, 3).map(r => monthRef(ev, r)) });
  for (const c of cats.filter(c => c.riskFlag)) f.push({ kind: 'weakness', text: `${c.name}: ${c.riskFlag}`, refs: c.refs });
  const gains = cats.map(c => c.realized + c.unrealized).filter(x => x > 0), totalGain = gains.reduce((s, x) => s + x, 0);
  if (totalGain > 0 && Math.max(...gains) / totalGain > 0.6 && cats.reduce((s, c) => s + c.decisions, 0) < 5) f.push({ kind: 'limitation', text: 'Most of your gains came from a single kind of investment with only a few decisions, so they may owe more to luck than to a repeatable approach.', refs: [] });

  const rocPart = clamp(pnl / Math.max(1, capital) * 50, -15, 15);
  let score = 55 + rocPart + (maxClasses >= 3 ? 10 : maxClasses === 2 ? 5 : 0) - (concentratedMonths.length >= 6 ? 10 : concentratedMonths.length >= 3 ? 5 : 0)
    - Math.min(15, panicAll.length * 5) + Math.min(5, dipsAll.length * 2) - (churnAll.length >= 3 ? 5 : 0) - (metrics.highRiskShare > 50 ? 10 : 0)
    - Math.min(20, cats.filter(c => c.key === 'tipster').reduce((s, c) => s + (c.realized < 0 ? 10 : 0) + (c.riskFlag ? 5 : 0), 0))
    - Math.min(9, (cats.find(c => c.key === 'fd')?.broken ?? 0) * 3) - Math.min(20, (cats.find(c => c.key === 'property')?.forced ?? 0) * 10);
  return { score: Math.round(clamp(score)), metrics, findings: f, rankings };
}
const ASSETS_TYPES = new Set(Object.values(ASSETS).map(a => a.type));

function category(c) {
  c.roc = c.capital ? (c.realized + c.unrealized) / c.capital : 0;
  c.annual = c.span >= 90 ? Math.pow(Math.max(0.0001, 1 + c.roc), 365 / c.span) - 1 : c.roc;
  c.roc = Math.round(c.roc * 1000) / 1000; c.annual = Math.round(c.annual * 1000) / 1000;
  // decision quality, independent of the outcome
  let d = 70 - (c.panic ?? 0) * 10 - ((c.churn ?? 0) >= 3 ? 10 : 0) + Math.min(10, (c.dips ?? 0) * 5) - (c.broken ?? 0) * 5 - (c.forced ?? 0) * 25;
  if (c.key === 'tipster') d = 40;
  if (['High', 'Very high'].includes(c.risk) && c.capital > 0 && c.key !== 'tipster') d -= 10;
  c.decisionScore = clamp(d);
  if (c.key === 'Crypto token') c.riskFlag = `a very-high-risk token with no earnings behind it (${inr(c.capital)} put in).`;
  if (c.key === 'tipster') c.riskFlag = `money handed over on a street tip (${inr(c.capital)}) — unverified offers can't be checked like a regulated product.`;
  return c;
}

// =====================================================================================  B. budgeting
function budgeting(state, ev, log, constrained) {
  const m = log.length, sum = k => log.reduce((s, r) => s + r.flow[k], 0);
  const earned = sum('earned'), essential = sum('essential'), lifestyle = sum('lifestyle'), education = sum('education'), other = sum('other');
  const surplusMonths = log.filter(r => r.surplus >= 0), failedMonths = log.filter(r => r.failedEssential > 0);
  const failed = state.ledger.filter(e => e.status === 'failed');
  const byCat = c => failed.filter(e => e.category === c);
  const loans = state.loans, missedEmis = loans.reduce((s, l) => s + (l.missedDays?.length ?? 0), 0);
  const income = { salary: 0, rent_income: 0, interest: 0 };
  for (const e of state.ledger) if (classify(e) === 'earned') income[e.category] += e.amount;
  const metrics = { months: m, income, earnedRecorded: earned, essential, lifestyle, education, other,
    essentialShare: earned ? round1(essential / earned * 100) : null, lifestyleShare: earned ? round1(lifestyle / earned * 100) : null,
    surplusMonths: surplusMonths.length, failedPayments: failed.length, failedEssentialMonths: failedMonths.length,
    missedRent: byCat('rent').length, missedEmis, failedGroceryPlan: byCat('grocery_plan').length, failedUpkeep: byCat('upkeep').length + byCat('repair').length,
    failedCarCosts: byCat('vehicle_costs').length, loansTaken: loans.length, interestPaid: loans.reduce((s, l) => s + l.interestPaid, 0),
    lateFees: loans.reduce((s, l) => s + (l.lateFees ?? 0), 0), loansRepaid: loans.filter(l => l.status === 'closed').length, constrained };
  const f = [];
  if (m < 3) return { score: null, metrics, findings: [{ kind: 'limitation', text: `Only ${m} full month(s) were recorded — not enough to judge a budget.`, refs: [] }], limitation: 'Too few recorded months.' };
  f.push({ kind: 'note', text: `Over ${m} recorded months you earned ${inr(earned)}: essentials took ${pct(essential / Math.max(1, earned))}, lifestyle spending ${pct(lifestyle / Math.max(1, earned))}${education ? `, education ${inr(education)}` : ''}. You spent no more than you earned in ${surplusMonths.length} of ${m} months.`, refs: [] });
  if (constrained) f.push({ kind: 'note', text: `Essentials alone took ${pct(essential / earned)} of what you earned, so there was little room to save. This is judged against the income you actually had — a low income is not a mistake.`, refs: [] });
  if (failed.length) f.push({ kind: 'weakness', text: `${failed.length} payment${failed.length > 1 ? 's' : ''} failed for lack of money${metrics.missedRent ? ` (${metrics.missedRent} rent)` : ''}${missedEmis ? ` (${missedEmis} loan EMI${missedEmis > 1 ? 's' : ''})` : ''}${metrics.failedGroceryPlan ? ` (${metrics.failedGroceryPlan} grocery plan)` : ''}.`, refs: failed.slice(0, 4).map(e => ev(`L${e.id}`, e.day, e.memo)) });
  else f.push({ kind: 'strength', text: 'Every bill and instalment was paid — not a single failed payment.', refs: [] });
  if (!constrained && earned && lifestyle / earned > 0.3) f.push({ kind: 'weakness', text: `Lifestyle spending was ${pct(lifestyle / earned)} of income — high enough to crowd out saving.`, refs: [] });
  if (loans.length) f.push({ kind: missedEmis ? 'weakness' : 'strength', text: `${loans.length} loan${loans.length > 1 ? 's' : ''} taken; ${inr(metrics.interestPaid)} interest paid; ${metrics.loansRepaid} repaid in full${missedEmis ? `; ${missedEmis} EMI${missedEmis > 1 ? 's' : ''} missed (${inr(metrics.lateFees)} late fees)` : '; no EMI missed'}.`, refs: loans.slice(0, 3).map(l => ev(l.uid, l.startDay ?? 0, `${l.kind} loan of ${inr(l.principal)}`)) });
  // strongest and weakest stretches (12-month windows when the life was long enough, else single months)
  const win = m >= 24 ? 12 : 1, windows = [];
  for (let i = 0; i + win <= m; i++) { const w = log.slice(i, i + win), e = w.reduce((s, r) => s + r.flow.earned, 0); if (e > 0) windows.push({ from: w[0], to: w.at(-1), rate: e ? w.reduce((s, r) => s + r.surplus, 0) / e : 0, failed: w.reduce((s, r) => s + r.failedEssential, 0) }); }
  const best = [...windows].sort((a, b) => b.rate - a.rate)[0], worst = [...windows].sort((a, b) => a.rate - b.rate || b.failed - a.failed)[0];
  const span = w => (win === 1 ? w.from.month : `${w.from.month} to ${w.to.month}`);
  if (best && worst && best !== worst) {
    f.push({ kind: 'strength', text: `Strongest stretch: ${span(best)}, when ${pct(Math.max(0, best.rate))} of earnings were left over.`, refs: [monthRef(ev, best.from)] });
    f.push({ kind: worst.rate < 0 || worst.failed ? 'weakness' : 'note', text: `Weakest stretch: ${span(worst)} — ${worst.rate < 0 ? `you spent ${pct(-worst.rate)} more than you earned` : `only ${pct(worst.rate)} left over`}${worst.failed ? ` and ${worst.failed} essential payment(s) failed` : ''}.`, refs: [monthRef(ev, worst.from)] });
  }
  // money in the bank while going hungry is not a budget success
  const hungryWithMoney = log.filter(r => r.unfed > 3 && r.cash >= 1000);
  metrics.hungryWithMoneyMonths = hungryWithMoney.length;
  if (hungryWithMoney.length) f.push({ kind: 'weakness', text: `In ${hungryWithMoney.length} month(s) you went without enough food while still holding at least ${inr(1000)} — underspending on essentials is not saving.`, refs: hungryWithMoney.slice(0, 3).map(r => monthRef(ev, r)) });
  const share = surplusMonths.length / m, failShare = failedMonths.length / m;
  const lifeShare = earned ? lifestyle / earned : 0;
  const consistency = constrained ? Math.max(share, 1 - lifeShare) : share;
  const score = 40 * consistency + 30 * Math.max(0, 1 - failShare * 3) + 15 * (lifeShare <= 0.3 ? 1 : Math.max(0, 1 - (lifeShare - 0.3) * 3))
    + 15 * Math.max(0, 1 - missedEmis * 0.34 - state.propertyHistory.filter(p => p.sale?.forced).length) - Math.min(30, hungryWithMoney.length * 5);
  return { score: Math.round(clamp(score)), metrics, findings: f };
}

// =====================================================================================  C. saving & resilience
function saving(state, ev, log, constrained, snap) {
  const m = log.length, earned = log.reduce((s, r) => s + r.flow.earned, 0), surplus = log.reduce((s, r) => s + r.surplus, 0);
  const withReserve = log.filter(r => r.reserveMonths != null && r.reserveMonths >= 3), last = log.at(-1);
  const fds = state.bank.fds, broken = fds.filter(f => f.status === 'broken');
  const withdrawals = state.ledger.filter(e => e.category === 'withdrawal' && e.status === 'ok' && e.account === 'wallet').length;
  const repairsPaid = state.ledger.filter(e => e.category === 'repair' && e.status === 'ok').length, repairsFailed = state.ledger.filter(e => e.category === 'repair' && e.status === 'failed').length;
  const ess = last?.essentialAvg ?? 0, endReserve = ess > 0 ? round1(snap.accessible / ess) : null;
  const metrics = { months: m, savingsRate: earned ? round1(surplus / earned * 100) : null, surplus, reserveMonthsShare: m ? round1(withReserve.length / m * 100) : 0,
    endReserveMonths: endReserve, maxReserveMonths: Math.max(0, ...log.map(r => r.reserveMonths ?? 0)), fdsOpened: fds.length, fdsBroken: broken.length,
    withdrawals, interestEarned: state.bank.interestToDate, repairsPaid, repairsFailed,
    liquidity: { accessible: snap.accessible, locked: snap.fixedDeposits, invested: snap.investments, property: snap.property, debt: snap.debt } };
  if (m < 3) return { score: null, metrics, findings: [{ kind: 'limitation', text: `Only ${m} full month(s) were recorded — not enough to judge saving habits.`, refs: [] }], limitation: 'Too few recorded months.' };
  const f = [];
  const target = constrained ? 0.05 : 0.2, rate = earned ? surplus / earned : 0;
  f.push({ kind: rate >= target ? 'strength' : rate > 0 ? 'note' : 'weakness', text: `You kept ${pct(Math.max(0, rate))} of what you earned over the recorded months (${inr(surplus)}).${constrained ? ' With essentials taking most of your income, even a small rate counts.' : ''}`, refs: [] });
  f.push({ kind: withReserve.length / m >= 0.5 ? 'strength' : 'weakness', text: `Cash and savings covered at least 3 months of essentials at the end of ${withReserve.length} of ${m} months.`, refs: [] });
  f.push({ kind: 'note', text: `At the end: ${inr(snap.accessible)} you could spend straight away, ${inr(snap.fixedDeposits)} locked in fixed deposits, ${inr(snap.investments)} invested, ${inr(snap.property)} in property and ${inr(snap.debt)} owed${endReserve != null ? ` — about ${endReserve} months of essentials in accessible money` : ''}. A high net worth is not the same as money you can reach.`, refs: [] });
  if (fds.length) f.push({ kind: broken.length ? 'weakness' : 'strength', text: `${fds.length} fixed deposit${fds.length > 1 ? 's' : ''} opened${broken.length ? `; ${broken.length} closed early with a penalty` : ', all held to maturity or still running'}.`, refs: fds.slice(0, 3).map(fd => ev(fd.uid, fd.startDay, `FD ${inr(fd.principal)}, ${fd.months} months`)) });
  if (repairsPaid || repairsFailed) f.push({ kind: repairsFailed ? 'weakness' : 'strength', text: `Unexpected repairs: ${repairsPaid} paid${repairsFailed ? `, ${repairsFailed} couldn't be paid` : ' without trouble'}.`, refs: [] });
  const score = 35 * clamp(rate / target, 0, 1) + 35 * (withReserve.length / m) + 15 * (endReserve == null ? 0.5 : endReserve >= 6 ? 1 : endReserve >= 3 ? 0.7 : endReserve >= 1 ? 0.4 : 0)
    + 15 * Math.max(0, 1 - broken.length * 0.25 - repairsFailed * 0.25);
  return { score: Math.round(clamp(score)), metrics, findings: f };
}

// =====================================================================================  D. risk
function risk(state, ev, log) {
  const encs = state.encounters.log.filter(r => r.status !== 'open'), f = [];
  const bad = ['scam', 'misleading'];
  const avoided = encs.filter(r => r.status === 'declined' && bad.includes(byId[r.id].verdict));
  const lost = encs.filter(r => r.stake > 0 && bad.includes(byId[r.id].verdict));
  const taken = encs.filter(r => r.stake > 0), researched = encs.filter(r => r.asked.length > 0);
  const unresearched = taken.filter(r => !r.asked.includes('risks') && !r.asked.includes('investigate'));
  const lucky = unresearched.filter(r => (r.pnl ?? 0) > 0);
  const cautious = encs.filter(r => r.status === 'declined' && !bad.includes(byId[r.id].verdict));
  const repossessions = state.propertyHistory.filter(p => p.sale?.forced), evictions = state.events.filter(e => e.type === 'housing' && /^Evicted/.test(e.text));
  const trades = state.brokerage.trades.filter(t => t.side === 'buy'), tradeCap = trades.reduce((s, t) => s + t.net, 0);
  const risky = trades.filter(t => ['High', 'Very high'].includes(ASSETS[t.asset].risk)).reduce((s, t) => s + t.net, 0);
  const metrics = { encounters: encs.length, avoided: avoided.length, lostToScams: lost.length, lostAmount: lost.reduce((s, r) => s + r.stake - (r.payout ?? 0), 0), taken: taken.length,
    researched: researched.length, unresearched: unresearched.length, lucky: lucky.length, cautiousDeclines: cautious.length,
    highRiskShare: tradeCap ? round1(risky / tradeCap * 100) : 0, repossessions: repossessions.length, evictions: evictions.length, loanDefaults: (state.credit?.defaults ?? []).length };
  for (const r of avoided) f.push({ kind: 'strength', text: `Turned down "${byId[r.id].offer.name}"${r.asked.length ? ` after asking ${r.asked.length} question(s)` : ''} — it was a ${byId[r.id].verdict === 'scam' ? 'scam' : 'misleading offer'}.`, refs: [ev(r.uid, r.day, `Declined "${byId[r.id].offer.name}"`)] });
  for (const r of lost) f.push({ kind: 'weakness', text: `Put ${inr(r.stake)} into "${byId[r.id].offer.name}"${r.asked.length ? ` even after asking ${r.asked.length} question(s)` : ' without asking a single question'} — ${byId[r.id].verdict === 'scam' ? 'a scam' : 'a misleading offer'}${r.status === 'resolved' ? `; ${inr(r.stake - r.payout)} was lost` : ''}.`, refs: [ev(r.uid, r.day, `Committed ${inr(r.stake)} to "${byId[r.id].offer.name}"`)] });
  for (const r of lucky) f.push({ kind: 'note', text: `"${byId[r.id].offer.name}" made ${inr(r.pnl)}, but you committed without checking the risks or investigating — a good result from an unchecked decision is luck, not a method.`, refs: [ev(r.uid, r.day, `Committed ${inr(r.stake)} without researching`)] });
  for (const r of taken.filter(r => !bad.includes(byId[r.id].verdict) && !unresearched.includes(r))) f.push({ kind: 'strength', text: `Checked "${byId[r.id].offer.name}" before committing ${inr(r.stake)}${(r.pnl ?? 0) < 0 ? ' — it still lost money, which can happen to a reasonable decision' : ''}.`, refs: [ev(r.uid, r.day, `Researched then committed ${inr(r.stake)}`)] });
  if (metrics.highRiskShare > 50) f.push({ kind: 'weakness', text: `${metrics.highRiskShare}% of the money you used to buy investments went into high- or very-high-risk assets.`, refs: [] });
  for (const p of repossessions) f.push({ kind: 'weakness', text: `The bank sold ${p.id.replace(/_/g, ' ')} after missed EMIs — borrowing more than the budget could carry.`, refs: [ev(`P-${p.id}-${p.boughtDay}`, p.soldDay, 'Forced sale by the bank')] });
  for (const e of evictions) f.push({ kind: 'weakness', text: 'Evicted after unpaid rent.', refs: [ev(`E${e.id}`, e.day, e.text)] });
  if (!encs.length && !trades.length && !state.loans.length) f.push({ kind: 'limitation', text: 'You took almost no financial risks and met no offers to judge, so there is little evidence either way.', refs: [] });
  let score = 65 + Math.min(24, avoided.length * 8) - Math.min(45, lost.length * 15) - Math.min(15, unresearched.length * 5) + (encs.length >= 2 && researched.length / encs.length >= 0.75 ? 5 : 0)
    - (metrics.highRiskShare > 50 ? 10 : 0) - repossessions.length * 15 - evictions.length * 10;
  return { score: Math.round(clamp(score)), metrics, findings: f, limitation: !encs.length && !trades.length && !state.loans.length ? 'Little risk-taking to evaluate.' : null };
}

// =====================================================================================  E. quality of life
function quality(state, ev, log, ending, snap, years, earned) {
  const st = state.stats, homeless = log.filter(r => r.housing === 'none'), owned = log.filter(r => r.housing === 'own');
  const evictions = state.events.filter(e => e.type === 'housing' && /^Evicted/.test(e.text));
  const stress = log.filter(r => r.failedEssential > 0 || r.unfed > 3 || r.health < 50);
  const graduated = state.education?.status === 'graduated', promotions = state.events.filter(e => e.type === 'career').length;
  const avgHealth = log.length ? Math.round(log.reduce((s, r) => s + r.health, 0) / log.length) : state.health;
  const lifestyle = log.reduce((s, r) => s + r.flow.lifestyle, 0);
  const neglectWhy = [st.daysUnfed >= NEGLECT.unfedDays && `${st.daysUnfed} days without enough food`, homeless.length >= NEGLECT.homelessMonths && `${homeless.length} months without a home`, st.minHealth < NEGLECT.minHealth && `health fell to ${st.minHealth}`].filter(Boolean);
  const metrics = { healthEnd: state.health, healthMin: st.minHealth, healthAvg: avgHealth, daysUnfed: st.daysUnfed, daysHungry: st.daysHungry, homelessMonths: homeless.length,
    ownedHomeMonths: owned.length, evictions: evictions.length, stressMonths: stress.length, graduated, promotions, finalJob: state.job.title, finalSalary: state.job.salary,
    startSalary: 10000, lifestyleSpend: lifestyle, vehicles: state.vehicles.length, furnitureAtHome: log.at(-1)?.furniture ?? 0, neglect: neglectWhy.length > 0, neglectWhy: neglectWhy.join(', ') };
  const f = [];
  f.push({ kind: st.daysUnfed ? 'weakness' : 'strength', text: st.daysUnfed ? `${st.daysUnfed} day(s) without enough food (very hungry on ${st.daysHungry}); lowest health ${st.minHealth}/100.` : `You never went a day without enough food; lowest health ${st.minHealth}/100.`, refs: [] });
  if (homeless.length || evictions.length) f.push({ kind: 'weakness', text: `${homeless.length} month(s) without a home${evictions.length ? `, after ${evictions.length} eviction(s)` : ''}.`, refs: evictions.slice(0, 2).map(e => ev(`E${e.id}`, e.day, e.text)) });
  else if (log.length) f.push({ kind: 'strength', text: `You always had a home${owned.length ? `, and owned the one you lived in for ${owned.length} month(s)` : ''}.`, refs: [] });
  if (graduated || promotions) f.push({ kind: 'strength', text: `${graduated ? 'You graduated' : ''}${graduated && promotions ? ' and ' : ''}${promotions ? `earned ${promotions} promotion(s)` : ''}: from ${inr(10000)} a month at the start to ${inr(state.job.salary)} as ${state.job.title}.`, refs: state.events.filter(e => e.type === 'education' || e.type === 'career').slice(0, 3).map(e => ev(`E${e.id}`, e.day, e.text)) });
  if (stress.length) f.push({ kind: 'weakness', text: `${stress.length} month(s) of serious financial stress (a missed essential bill, hunger or poor health).`, refs: stress.slice(0, 3).map(r => monthRef(ev, r)) });
  // the trade-off between wealth and living, only when the record shows it
  const avgYearEarned = earned / Math.max(1, Math.min(years, log.length / 12 || years));
  const wealthy = snap.netWorth >= 1000000 && snap.netWorth >= 10 * Math.max(1, avgYearEarned);
  if (wealthy && neglectWhy.length) f.push({ kind: 'weakness', text: `You accumulated substantial wealth (${inr(snap.netWorth)}), but repeatedly sacrificed your basic needs to do it (${neglectWhy.join(', ')}). Money should support a life, not replace one.`, refs: [] });
  if (ending.kind === 'death') f.push({ kind: 'weakness', text: `The life ended early, at ${ageOn(state, ending.day)}, from ${ending.cause}.`, refs: [ev('D-end', ending.day, `Died of ${ending.cause}`)] });
  let score = 100 - Math.min(40, st.daysUnfed / 3) - Math.min(25, homeless.length * 5) - evictions.length * 10 - (log.length ? stress.length / log.length * 30 : 0) - (st.minHealth < 50 ? 10 : 0);
  if (ending.kind === 'death' && ending.cause === 'malnutrition') score = Math.min(score, 20);
  return { score: Math.round(clamp(score)), metrics, findings: f };
}

// =====================================================================================  F. goals
function goals(state, ev, criteria, endDay) {
  const g = state.goals ?? {}, f = [];
  const records = [g.original, ...(g.revisions ?? [])].filter(Boolean);
  if (!records.length) return { score: null, metrics: { records: 0 }, findings: [{ kind: 'limitation', text: 'No goals were recorded (the goals quiz was never completed), so there is nothing to compare your life with.', refs: [] }], limitation: 'No goals recorded.' };
  const statuses = records.map((rec, i) => {
    const s = goalStatus(state, rec), id = ev(i ? `G-rev${i}` : 'G-original', rec.day, `${i ? 'Revised' : 'Original'} goal: "${rec.goals.main.choice}"${rec.goals.targetAge ? ` by age ${rec.goals.targetAge}` : ''} (recorded at age ${rec.age ?? '?'})`);
    let outcome = s.status === 'achieved' || s.status === 'confirmed' ? (s.onTime === false ? 'partial' : 'achieved')
      : s.status === 'in_progress' ? 'partial' : s.status === 'needs_confirmation' ? 'unconfirmed' : s.status === 'none' ? 'none' : 'missed';
    if (i < records.length - 1) outcome = outcome === 'achieved' ? 'achieved' : 'revised';
    return { record: rec, status: s, outcome, ref: id };
  });
  const current = statuses.at(-1), endAge = ageOn(state, endDay);
  for (const x of statuses) {
    const m = x.record.goals.main, label = `"${m.choice}"${x.record.goals.targetAge ? ` by ${x.record.goals.targetAge}` : ''}`;
    const text = {
      achieved: () => `${label}: achieved${x.status.age != null ? ` at ${x.status.age}` : ''}${x.status.status === 'confirmed' ? ' (confirmed by you — the game can\'t measure this goal)' : ''}.`,
      partial: () => x.status.status === 'in_progress' ? `${label}: in progress when the life ended — ${x.status.text}` : `${label}: achieved, but later than planned (at ${x.status.age}).`,
      missed: () => `${label}: not achieved — ${x.status.text}${x.record.goals.targetAge != null && endAge < x.record.goals.targetAge ? ` (the life ended at ${endAge}, before your target age)` : ''}`,
      unconfirmed: () => `${label}: the game can't measure this goal and you didn't confirm it, so it is not judged.`,
      revised: () => `${label}: replaced by a later goal on ${fmtDate(statuses[statuses.indexOf(x) + 1].record.day)} (kept here as your original plan).`,
      none: () => `${label}: no goal chosen.`,
    }[x.outcome]();
    f.push({ kind: x.outcome === 'achieved' ? 'strength' : x.outcome === 'missed' ? 'weakness' : 'note', text, refs: [x.ref, ...(x.status.refs ?? []).filter(r => /^[LEM]/.test(r)).map(r => ev(r, x.status.day ?? endDay, `Evidence for "${m.choice}"`))] });
  }
  // priorities from the quiz, set against what the record shows (context, not a score)
  const pr = current.record.goals.preferences?.priority, c = criteria;
  const prio = { 'Build savings': ['saving', 'saving'], 'Control spending and budgeting': ['budgeting', 'budgeting'], 'Learn investing': ['investing', 'investing'], 'Avoid scams and protect my money': ['risk', 'protecting your money'] }[pr];
  if (prio && c[prio[0]].score != null) f.push({ kind: 'note', text: `You said you wanted to work on "${pr}" first; your ${prio[1]} score was ${c[prio[0]].score}/100.`, refs: [current.ref] });
  if (c.quality.metrics.neglect && statuses.some(x => x.outcome === 'achieved')) f.push({ kind: 'weakness', text: `You reached a goal, but at a cost to your basic needs (${c.quality.metrics.neglectWhy}) — a trade-off worth questioning.`, refs: [] });
  const scoreOf = { achieved: 100, partial: 65, missed: 30, unconfirmed: null, none: null, revised: null }[current.outcome];
  return { score: scoreOf, metrics: { records: records.length, revisions: records.length - 1, confirmations: (g.confirmations ?? []).length, outcomes: statuses.map(x => ({ goal: x.record.goals.main.choice, targetAge: x.record.goals.targetAge, outcome: x.outcome, age: x.status.age ?? null })) },
    findings: f, limitation: scoreOf == null ? 'Your current goal could not be measured and was not confirmed.' : null };
}

// =====================================================================================  G. areas to improve
const ADVICE = {
  investing: 'Decide in advance how much of your money goes into each kind of investment, spread it across more than one, and when prices fall, check whether the reason you bought has changed before selling.',
  budgeting: 'Pay essentials first on the 1st (rent, food plan, EMIs), set a ceiling for lifestyle spending, and keep a small buffer so a bill never fails.',
  saving: 'Move a fixed amount into savings each payday until cash and savings cover three to six months of essentials, and leave fixed deposits to mature.',
  risk: 'Before handing over money, ask for evidence, check the risks and investigate the claims; walk away from guarantees and pressure. Keep borrowing within what your income can carry.',
  quality: 'Protect the basics first — a home, enough food and your health. Keep a week of groceries in reserve or an active grocery plan before buying wants.',
  goals: 'Turn your goal into steps the game can measure (a course, a car, a savings target) and check your progress every year; revise it if your circumstances change.',
};
function improvements(r) {
  const list = Object.values(r.criteria).filter(c => c.score != null).sort((a, b) => a.score - b.score);
  const pick = list.filter(c => c.score < 70);
  const out = (pick.length ? pick : list.slice(0, 1)).slice(0, 4).map(c => {
    const weak = c.findings.filter(x => x.kind === 'weakness');
    return { criterion: c.key, name: c.name, score: c.score, because: weak.slice(0, 2).map(x => x.text), refs: weak.flatMap(x => x.refs).slice(0, 4), advice: ADVICE[c.key] };
  });
  const strengths = Object.values(r.criteria).filter(c => c.score != null && c.score >= 75).map(c => ({ criterion: c.key, name: c.name, score: c.score, because: c.findings.filter(x => x.kind === 'strength').slice(0, 2).map(x => x.text) }));
  return { focus: out, strengths };
}

function monthRef(ev, r) { return ev(`M${r.month}`, r.from, `${r.month}: earned ${inr(r.flow.earned)}, essentials ${inr(r.flow.essential)}, lifestyle ${inr(r.flow.lifestyle)}, ${r.failedEssential} failed bill(s), health ${r.health}`); }
