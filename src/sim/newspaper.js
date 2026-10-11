// The monthly financial newspaper (Round 7): "The VanQuest Ledger", a
// fictional, educational paper. An issue is created ONCE per month, on the 1st, BEFORE that day's events
// (clock.js), from a deterministic snapshot of the simulated world for the month that just ended:
//   • every fictional asset on the trading desk: last close of the previous month → last close of this one,
//     with the month's high and low (sim/market.js — the same prices the player trades at)
//   • the city housing-market index and its phase (sim/housingMarket.js)
//   • Nidhi Bank's rates (data/banking.js — fixed in this version, so reported as unchanged)
//   • simulated events that moved a price this month (the world events planted by Vikram's offers)
//   • a rotating financial-safety lesson built from the warning signs in data/encounters.js
// The game does not model inflation or a changing cost of living, so the paper never mentions them.
// Nothing is re-simulated to write an issue, and an issue's facts never change after it is created.
// The AI may add wording once (aiStatus none → pending → done | failed); the facts stay authoritative.
import { ASSETS } from '../data/market.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { SAVINGS, FD_TERMS } from '../data/banking.js';
import { price } from './market.js';
import { market, PHASES } from './housingMarket.js';
import { monthStartOf } from './lifeLog.js';
import { monthKey, monthsBetween, dateOf } from './util.js';

export const PAPER = 'The VanQuest Ledger';
const r1 = x => Math.round(x * 1000) / 10;                    // fraction → % with one decimal
const r2 = x => Math.round(x * 100) / 100;
const LESSONS = ENCOUNTERS.filter(e => ['scam', 'misleading'].includes(e.verdict));
export const monthName = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };

export function makeIssue(state) {
  const paper = state.newspaper ??= { issues: [], unread: 0 };
  const end = state.day - 1;
  if (end < 0) return null;
  const from = monthStartOf(end), month = monthKey(end), id = `N${month}`;
  if (paper.issues.some(i => i.id === id)) return null;                      // at most one issue per month
  const before = Math.max(0, from - 1);
  const assets = Object.keys(ASSETS).map(a => {
    const days = Array.from({ length: end - from + 1 }, (_, i) => price(state, a, from + i));
    const open = price(state, a, before), close = price(state, a, end);
    return { id: a, open: r2(open), close: r2(close), pct: r1(close / open - 1), high: r2(Math.max(...days)), low: r2(Math.min(...days)) };
  });
  const events = state.marketEvents.filter(e => e.day >= from && e.day <= end).map(e => {
    const rec = state.encounters.log.find(r => r.uid === e.source), def = ENCOUNTERS.find(d => d.id === rec?.id);
    return { asset: e.asset, day: e.day, pct: r1(e.factor - 1), ref: e.source ?? null, text: def?.outcome.text ?? null };
  });
  const m = monthsBetween(0, end), now = market(end), prev = market(Math.max(0, before));
  const issue = {
    id, month, day: state.day, from, end, version: 1,
    assets, events,
    housing: { index: r2(now.index * 100), prevIndex: r2(prev.index * 100), pct: r1(now.index / prev.index - 1), phase: now.phase },
    rates: { savings: SAVINGS.rate, fd: FD_TERMS.map(t => ({ months: t.months, rate: t.rate })), changed: false },
    lesson: LESSONS.length ? LESSONS[m % LESSONS.length].id : null,
    aiStatus: 'none', ai: null, read: false,
  };
  paper.issues.push(issue);
  paper.unread = paper.issues.filter(i => !i.read).length;
  return issue;
}

export function markRead(state, id) {
  const p = state.newspaper, i = p?.issues.find(x => x.id === id);
  if (!i || i.read) return false;
  i.read = true;
  p.unread = p.issues.filter(x => !x.read).length;
  return true;
}

// ------------------------------------------------------------------ the deterministic edition (always available)
const dir = p => (p > 0 ? 'rose' : p < 0 ? 'fell' : 'was flat');
const RISK_Q = {
  Low: 'Is a steady, lower return what this money is for — and can you wait if rates change?',
  Medium: 'Could you leave this money invested through a bad year without needing it?',
  High: 'Would a 30% fall force you to sell — and is it a small part of your money?',
  'Very high': 'Could you lose most of this and still pay rent and buy food?',
};
export function renderIssue(issue) {
  const by = Object.fromEntries(issue.assets.map(a => [a.id, a]));
  const sorted = [...issue.assets].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)), top = sorted[0];
  const ph = PHASES[issue.housing.phase]?.label ?? issue.housing.phase;
  const headline = `${ASSETS[top.id].name} ${dir(top.pct)} ${Math.abs(top.pct)}% in ${monthName(issue.month)}`;
  const lead = `In the simulated markets this month, ${issue.assets.filter(a => a.pct > 0).length} of ${issue.assets.length} fictional assets rose and ${issue.assets.filter(a => a.pct < 0).length} fell. The city housing index ${dir(issue.housing.pct)} ${Math.abs(issue.housing.pct)}% (phase: ${ph}). Nidhi Bank's rates were unchanged.`;
  const assets = issue.assets.map(a => {
    const d = ASSETS[a.id], evs = issue.events.filter(e => e.asset === a.id);
    const why = evs.length ? `Behind the move: ${evs.map(e => e.text ?? `a simulated event moved the price ${e.pct}%`).join(' ')}`
      : `No specific event was recorded; ${d.type.toLowerCase()} prices in this game move with the market's ups and downs${d.vol >= 0.3 ? ', and this one swings a lot' : ''}.`;
    return { id: a.id, name: d.name, type: d.type, risk: d.risk, text: `${d.name} ${dir(a.pct)} ${Math.abs(a.pct)}% (₹${a.open} → ₹${a.close}; range ₹${a.low}–₹${a.high}). ${why}`,
      question: RISK_Q[d.risk] ?? RISK_Q.High };
  });
  const L = ENCOUNTERS.find(e => e.id === issue.lesson);
  const safety = L ? { title: 'Safety desk: spot the warning signs', signs: L.flags, text: L.debrief.replace(/GoldenLeaf|CoinNova/gi, 'the scheme') } : null;
  const housing = `The housing index stands at ${issue.housing.index} (from ${issue.housing.prevIndex}), ${ph.toLowerCase()} phase. ${issue.housing.phase === 'decline' ? 'Prices falling can mean bargains — and it can mean they fall further. Buying needs a deposit you won\'t miss and EMIs your income can carry.' : issue.housing.phase === 'growth' ? 'Rising prices make sellers ask more; buyers who stretch to keep up carry bigger loans.' : 'Housing moves slowly; selling costs fees, so property suits money you can leave for years.'}`;
  return { headline, lead, assets, housing, safety,
    rates: `Savings ${(issue.rates.savings * 100).toFixed(1)}% a year; fixed deposits ${issue.rates.fd.map(f => `${f.months} months ${(f.rate * 100).toFixed(2)}%`).join(', ')} — unchanged.`,
    disclaimer: 'Educational simulation, not investment advice. Prices are fictional. Past performance does not guarantee future returns. Ask: do I need this money soon? Can I afford to lose it?',
    dateText: dateOf(issue.day).toISOString().slice(0, 10) };
}

// What the newspaper may say, for the AI task: names, moves and events only — never a prediction.
export function issueFacts(issue) {
  return { month: monthName(issue.month), assets: issue.assets.map(a => ({ id: a.id, name: ASSETS[a.id].name, type: ASSETS[a.id].type, risk: ASSETS[a.id].risk, pct: a.pct, open: a.open, close: a.close })),
    housing: { pct: issue.housing.pct, phase: issue.housing.phase }, events: issue.events.map(e => ({ asset: e.asset, pct: e.pct, text: e.text })) };
}
