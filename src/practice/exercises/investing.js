// Exercise C — INVESTING (Course 3). Fictional credits only. You choose an allocation for a stated goal
// and horizon; a seeded fictional market path plays out month by month, including a market fall at a
// seeded month where you decide to hold, rebalance or sell. Prices and returns are computed by this code,
// never by a language model. The score rates the PROCESS (diversification, horizon fit, fees, reaction
// to the fall) — not the ending balance, which is partly luck. A 200-path comparison shows how much.
import { rng } from '../rng.js';

// Fictional asset categories (annual expected return mu, volatility vol, fee = yearly cost, beta to the
// shared market factor, crash = extra move in the market-fall month). Illustrative, not real products.
export const ASSETS = {
  index: { name: 'Broad share index fund', mu: 0.10, vol: 0.18, fee: 0.002, beta: 1.0, crash: -0.22, liquid: true,
    about: 'Hundreds of companies in one fund. Rises and falls with the whole market.' },
  single: { name: 'One company\'s shares', mu: 0.10, vol: 0.38, fee: 0.004, beta: 1.1, crash: -0.30, liquid: true,
    about: 'Everything rides on one company. Same expected return as the index, far bigger swings.' },
  bond: { name: 'Bond fund', mu: 0.065, vol: 0.05, fee: 0.005, beta: 0.1, crash: 0.01, liquid: true,
    about: 'Loans to governments and companies. Steadier, lower expected return.' },
  cash: { name: 'Cash-like (liquid fund)', mu: 0.035, vol: 0.004, fee: 0.0, beta: 0, crash: 0, liquid: true,
    about: 'Very stable; after inflation it barely grows.' },
  hot: { name: 'Hyped "next 100×" token', mu: 0.0, vol: 0.95, fee: 0.015, beta: 1.5, crash: -0.55, liquid: false,
    about: 'Influencers love it. No earnings, no regulator, huge swings and high trading costs.' },
};
export const KEYS = Object.keys(ASSETS);
export const FOCUS = {
  basic: 'Match the investment to the goal and the time you have.',
  products: 'Know what each kind of asset is before you choose.',
  returns: 'Measure what happened — gains and losses in percent.',
  risk: 'Match risk to your time horizon and your ability to take a loss.',
  diversify: 'Spread exposure so no single holding decides your future.',
  fees: 'Small yearly fees compound into big differences.',
  compounding: 'Time lets returns earn returns — if you stay invested.',
  sip: 'Invest a fixed amount every month and see how timing evens out.',
  charts: 'A chart shows the past, not the future.',
  discipline: 'Markets fall. Your plan decides what you do next.',
  portfolio: 'Build a hypothetical portfolio and explain it.',
};

export function create(seed, focus = 'basic') {
  const r = rng('invest', seed, focus);
  const goal = r.pick([
    { name: 'Course fees due next year', years: 1 },
    { name: 'A deposit for a first home', years: 5 },
    { name: 'Long-term wealth for your future', years: 10 },
    { name: 'Starting a small business', years: 3 },
  ]);
  const months = goal.years * 12;
  const credits = 100000, monthly = focus === 'sip' ? 2000 : 0;
  const crashMonth = r.int(Math.max(2, Math.floor(months * 0.2)), Math.max(3, Math.floor(months * 0.7)));
  return { exercise: 'investing', seed, focus, brief: FOCUS[focus] ?? FOCUS.basic, goal, months, credits, monthly, crashMonth, pathSeed: `${seed}:${focus}` };
}

// a neutral starting point (everything in cash) — the player has to make the choices
export const defaults = () => ({ alloc: { index: 0, single: 0, bond: 0, cash: 100, hot: 0 }, reaction: 'hold' });

export function check(sc, d) {
  const errors = [], a = d.alloc ?? {};
  if (!KEYS.every(k => Number.isInteger(a[k]) && a[k] >= 0 && a[k] <= 100)) errors.push('Each share must be a whole percentage from 0 to 100.');
  const total = KEYS.reduce((s, k) => s + (a[k] || 0), 0);
  if (total !== 100) errors.push(`Your allocation adds up to ${total}% — it must be exactly 100%.`);
  if (!['hold', 'rebalance', 'sell'].includes(d.reaction)) errors.push('Choose how to react to the market fall.');
  return { ok: !errors.length, errors, total };
}

// Monthly returns for every asset on one seeded path (shared market factor + own noise + the fall).
export function path(pathSeed, months, crashMonth) {
  const r = rng('market', pathSeed);
  return Array.from({ length: months }, (_, i) => {
    const m = i + 1, market = r.normal();
    return Object.fromEntries(KEYS.map(k => {
      const A = ASSETS[k], sd = A.vol / Math.sqrt(12), own = r.normal();
      const z = A.beta ? Math.min(1, A.beta) * market + Math.sqrt(Math.max(0, 1 - Math.min(1, A.beta) ** 2)) * own : own;
      let ret = A.mu / 12 - sd * sd / 2 + sd * z;
      if (m === crashMonth) ret += A.crash;
      return [k, Math.max(-0.95, ret)];
    }));
  });
}

// Simulate holdings month by month. reaction applies once, in the fall month (after the fall).
export function simulate(sc, d, pathSeed = sc.pathSeed) {
  const P = path(pathSeed, sc.months, sc.crashMonth);
  let h = Object.fromEntries(KEYS.map(k => [k, sc.credits * d.alloc[k] / 100]));
  let fees = 0, peak = sc.credits, maxDD = 0, contributed = sc.credits, soldAt = null, lockedLoss = 0;
  const values = [sc.credits];
  for (let i = 0; i < sc.months; i++) {
    const m = i + 1;
    for (const k of KEYS) { h[k] *= 1 + P[i][k]; const f = h[k] * ASSETS[k].fee / 12; h[k] -= f; fees += f; }
    if (sc.monthly) { contributed += sc.monthly; for (const k of KEYS) h[k] += sc.monthly * d.alloc[k] / 100; }
    let v = KEYS.reduce((s, k) => s + h[k], 0);
    if (m === sc.crashMonth && d.reaction !== 'hold') {
      if (d.reaction === 'sell') {          // panic: everything risky to cash at the bottom (the token is illiquid: 5% haircut)
        soldAt = v; lockedLoss = Math.max(0, peak - v);
        h = { index: 0, single: 0, bond: h.bond, hot: 0, cash: h.cash + h.index + h.single + h.hot * 0.95 };
        v = KEYS.reduce((s, k) => s + h[k], 0);
      } else {                              // rebalance back to the chosen mix
        h = Object.fromEntries(KEYS.map(k => [k, v * d.alloc[k] / 100]));
      }
    }
    peak = Math.max(peak, v); maxDD = Math.max(maxDD, 1 - v / peak);
    values.push(v);
  }
  const end = values.at(-1);
  return { values: values.map(Math.round), end: Math.round(end), fees: Math.round(fees), maxDD, contributed, gain: Math.round(end - contributed),
    ret: end / contributed - 1, annual: Math.pow(end / contributed, 12 / sc.months) - 1, soldAt: soldAt && Math.round(soldAt), lockedLoss: Math.round(lockedLoss),
    fallMonth: sc.crashMonth, fallValue: Math.round(values[sc.crashMonth]) };
}

// Risk metrics of an allocation (what the player chose, independent of the luck of the path).
export function profile(alloc) {
  const w = Object.fromEntries(KEYS.map(k => [k, alloc[k] / 100]));
  const vol = Math.sqrt(KEYS.reduce((s, k) => s + (w[k] * ASSETS[k].vol) ** 2, 0) + 2 * w.index * w.single * ASSETS.index.vol * ASSETS.single.vol * 0.7);
  const fee = KEYS.reduce((s, k) => s + w[k] * ASSETS[k].fee, 0);
  const risky = ['index', 'single', 'hot'], riskyW = risky.reduce((s, k) => s + w[k], 0);
  const concentrated = w.single + w.hot;                       // money riding on one company or a hyped token
  const hhi = KEYS.reduce((s, k) => s + w[k] * w[k], 0);       // 1 = all in one asset
  return { vol, fee, riskyShare: riskyW, concentrated, hhi, expected: KEYS.reduce((s, k) => s + w[k] * ASSETS[k].mu, 0) - fee };
}

// The same allocation on 200 other seeded paths: how much of the result was luck?
export function luck(sc, d, n = 200) {
  const ends = Array.from({ length: n }, (_, i) => simulate(sc, { ...d, reaction: 'hold' }, `${sc.pathSeed}:alt${i}`).end).sort((a, b) => a - b);
  const actual = simulate(sc, d).end, pct = q => ends[Math.min(n - 1, Math.floor(q * n))];
  return { p10: pct(0.1), median: pct(0.5), p90: pct(0.9), worst: ends[0], best: ends.at(-1), rank: ends.filter(e => e <= actual).length / n, lossChance: ends.filter(e => e < sc.credits + sc.monthly * sc.months).length / n };
}

export function run(sc, d) {
  const c = check(sc, d);
  if (!c.ok) return { ok: false, errors: c.errors };
  return { ok: true, ...simulate(sc, d), profile: profile(d.alloc), luck: luck(sc, d) };
}

// Target risk for the horizon (a teaching guide, not advice): short goals need stability.
const VOL_BAND = { 1: [0, 0.06], 3: [0.03, 0.11], 5: [0.06, 0.15], 10: [0.09, 0.2] };
export function score(sc, d, res) {
  const pts = [], add = (label, earned, max, why) => pts.push({ label, earned: Math.max(0, Math.min(max, Math.round(earned))), max, why });
  const p = res.profile, [lo, hi] = VOL_BAND[sc.goal.years];
  const fit = p.vol < lo ? 1 - (lo - p.vol) / 0.1 : p.vol > hi ? 1 - (p.vol - hi) / 0.08 : 1;
  add('Risk matches the time horizon', 25 * fit, 25, p.vol > hi ? `Your mix swings about ${Math.round(p.vol * 100)}% a year — a lot for money needed in ${sc.goal.years} year(s); a fall near the deadline could leave you short.`
    : p.vol < lo ? `With ${sc.goal.years} years to go, your very cautious mix (${Math.round(p.vol * 100)}% swings) may grow too slowly for the goal.` : `About ${Math.round(p.vol * 100)}% yearly swings suits a ${sc.goal.years}-year goal.`);
  add('Diversification', 25 * Math.max(0, Math.min(1, (1 - p.hhi) / 0.6)) * (p.concentrated > 0.25 ? 0.5 : 1), 25,
    p.concentrated > 0.25 ? `${Math.round(p.concentrated * 100)}% rides on a single company or a hyped token — concentration risk.` : `Spread across ${KEYS.filter(k => d.alloc[k] > 0).length} kinds of asset.`);
  add('Costs', p.fee <= 0.004 ? 15 : Math.max(0, 15 - (p.fee - 0.004) * 1500), 15, `Average yearly fee ${(p.fee * 100).toFixed(2)}% — ₹${res.fees.toLocaleString('en-IN')} paid over the period.`);
  const reactionPts = d.reaction === 'sell' ? 0 : 20;
  add('Reaction to the market fall', reactionPts, 20, d.reaction === 'sell' ? `Selling at the bottom (month ${sc.crashMonth}) turned a temporary fall into a permanent loss of about ₹${res.lockedLoss.toLocaleString('en-IN')}.`
    : d.reaction === 'rebalance' ? 'You rebalanced after the fall — buying more of what had become cheap, in line with your plan.' : 'You held through the fall instead of locking in the loss.');
  add('Avoided hype', d.alloc.hot === 0 ? 15 : Math.max(0, 15 - d.alloc.hot), 15, d.alloc.hot ? `${d.alloc.hot}% in a hyped token with no earnings and high costs.` : 'No money in the hyped token.');
  const total = pts.reduce((s, x) => s + x.earned, 0);
  const lucky = res.luck.rank >= 0.8 ? 'This path was luckier than 80% of the alternatives — a good result here is not proof of a good strategy.' : res.luck.rank <= 0.2 ? 'This path was unluckier than 80% of the alternatives — a weak result here doesn\'t prove the plan was bad.' : 'This path was fairly typical for your mix.';
  return { exercise: 'investing', seed: sc.seed, score: total, points: pts, luckNote: lucky,
    wentWell: pts.filter(x => x.earned >= x.max * 0.8).map(x => x.why), improve: pts.filter(x => x.earned < x.max * 0.8).map(x => x.why) };
}
