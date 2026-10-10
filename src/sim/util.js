// Shared helpers for the simulation. No Phaser / DOM here so it runs under Node tests.

// Game day 0 = Wednesday 1 July 2026. Days are integers; the calendar is derived.
const EPOCH = Date.UTC(2026, 6, 1);
const DAY_MS = 86400000;

export const dateOf = day => new Date(EPOCH + day * DAY_MS);
export const isMonthStart = day => dateOf(day).getUTCDate() === 1;
export const nextMonthStart = day => {
  const d = dateOf(day);
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - EPOCH) / DAY_MS);
};
export const monthsBetween = (a, b) => {
  const x = dateOf(a), y = dateOf(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
};
// Same day-of-month m months later (clamped to the month's last day), as a game day.
export const addMonths = (day, m) => {
  const d = dateOf(day), y = d.getUTCFullYear(), mo = d.getUTCMonth() + m;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  return Math.round((Date.UTC(y, mo, Math.min(d.getUTCDate(), last)) - EPOCH) / DAY_MS);
};
export const monthKey = day => { const d = dateOf(day); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
// Same calendar date one year later (handles 29 Feb by landing on 28 Feb / 1 Mar as JS does)
export const sameDateNextYear = day => { const d = dateOf(day); return Math.round((Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()) - EPOCH) / DAY_MS); };
export const fmtDate = day => dateOf(day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtShortDate = day => dateOf(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// ₹ with Indian digit grouping (₹1,20,000). Amounts are stored as whole rupees.
export const inr = n => (n < 0 ? '−₹' : '₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');

// Deterministic hash → [0,1). Same inputs always give the same number, so simulated
// market prices are reproducible and testable.
export function hash01(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// Standard normal from two hashes (Box–Muller).
export const gauss = (...parts) => {
  const u = Math.max(hash01(...parts, 'u'), 1e-12), v = hash01(...parts, 'v');
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const isPosInt = n => Number.isInteger(n) && n > 0;
