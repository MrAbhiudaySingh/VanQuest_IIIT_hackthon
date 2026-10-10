// Fictional housing-market index, a pure function of the in-game month (month 0 = July 2026).
// It cycles growth → stable → decline → recovery → growth … Phase lengths and the month-to-month
// noise come from a fixed seed, so every game sees the same market history (testable, explainable),
// but the future is never shown to the player.
//   growth    +0.9%/month (± up to 0.3%)     10–17 months
//   stable    +0.1%/month (± up to 0.3%)      4–8 months
//   decline   −1.4%/month (± up to 0.3%)      6–11 months
//   recovery  +0.6%/month (± up to 0.3%)      6–10 months
// A property's value = day-0 price × (1 + neighbourhood drift)^(years) × (1 + beta × (index − 1)).
// Rent = day-0 rent × (1 + drift)^(years) × (1 + beta/2 × (index − 1)), rounded to ₹100.
// Sellers' asking prices differ from the estimate: (phase tilt + seeded −2.4%…+3.6%), e.g. buyers
// overpay in a boom and find bargains in a slump.
import { PROPERTIES, NEIGHBOURHOODS } from '../data/properties.js';
import { hash01, monthsBetween } from './util.js';

export const PHASES = {
  growth: { step: 0.009, min: 10, max: 17, next: 'stable', label: 'Growth', ask: 0.03 },
  stable: { step: 0.001, min: 4, max: 8, next: 'decline', label: 'Stable', ask: 0 },
  decline: { step: -0.014, min: 6, max: 11, next: 'recovery', label: 'Decline', ask: -0.03 },
  recovery: { step: 0.006, min: 6, max: 10, next: 'growth', label: 'Recovery', ask: -0.01 },
};

const months = [{ index: 1, phase: 'growth', inPhase: 4, length: 14 }];   // month 0: mid-way through a boom
function extend(m) {
  while (months.length <= m) {
    const prev = months.at(-1), k = months.length;
    let { phase, inPhase, length } = prev;
    if (++inPhase >= length) {
      phase = PHASES[phase].next; inPhase = 0;
      const p = PHASES[phase];
      length = p.min + Math.floor(hash01('hm-len', k) * (p.max - p.min + 1));
    }
    const noise = (hash01('hm-noise', k) - 0.5) * 0.006;
    months.push({ index: prev.index * (1 + PHASES[phase].step + noise), phase, inPhase, length });
  }
}

export const monthOf = day => monthsBetween(0, day);
export function market(day) { const m = Math.max(0, monthOf(day)); extend(m); return months[m]; }
export const marketIndex = day => market(day).index;
export const marketPhase = day => market(day).phase;

export function propertyValue(id, day) {
  const p = PROPERTIES[id], h = NEIGHBOURHOODS[p.hood], m = Math.max(0, monthOf(day));
  return Math.round(p.price * Math.pow(1 + h.drift, m / 12) * (1 + h.beta * (marketIndex(day) - 1)));
}

export function marketRent(id, day) {
  const p = PROPERTIES[id], h = NEIGHBOURHOODS[p.hood], m = Math.max(0, monthOf(day));
  return Math.round(p.rent * Math.pow(1 + h.drift, m / 12) * (1 + h.beta / 2 * (marketIndex(day) - 1)) / 100) * 100;
}

export function askingPrice(id, day) {
  const m = Math.max(0, monthOf(day));
  const premium = PHASES[marketPhase(day)].ask + 0.06 * (hash01('ask', id, m) - 0.4);
  return Math.round(propertyValue(id, day) * (1 + premium) / 1000) * 1000;
}

// Past index values for charts (never the future).
export const indexHistory = (day, n = 24) => Array.from({ length: n }, (_, i) => {
  const m = monthOf(day) - n + 1 + i;
  if (m < 0) return null;
  extend(m); return { month: m, index: months[m].index, phase: months[m].phase };
}).filter(Boolean);
