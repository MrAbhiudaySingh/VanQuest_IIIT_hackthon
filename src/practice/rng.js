// Seeded randomness for practice scenarios: the same seed always produces the same scenario,
// market path and outcome (reproducible for debugging and tests). Pure — no global state.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// mulberry32 — small, fast, good enough for teaching scenarios
export function rng(...seedParts) {
  let a = hashString(seedParts.join('|'));
  const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),                       // inclusive
    step: (lo, hi, step) => lo + step * Math.floor(next() * (Math.floor((hi - lo) / step) + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    weighted: weights => { const tot = Object.values(weights).reduce((s, w) => s + w, 0); let x = next() * tot;
      for (const [k, w] of Object.entries(weights)) { if ((x -= w) < 0) return k; } return Object.keys(weights).at(-1); },
    normal: () => { const u = Math.max(next(), 1e-12), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    shuffle: arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  };
}

export const fingerprint = text => hashString(String(text).toLowerCase().replace(/[^a-z0-9₹]+/g, ' ').trim()).toString(36);
export const roundTo = (x, step) => Math.round(x / step) * step;
