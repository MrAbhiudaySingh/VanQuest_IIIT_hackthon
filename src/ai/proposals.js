// FUTURE FINANCIAL DISTRICT — the only door through which an AI component may ever suggest changes
// to the live game's financial parameters. NOT CONNECTED to the live game in Round 6: nothing imports
// this from src/sim, and activate() refuses while ACTIVATION_ENABLED is false.
//
// Four distinct stages, each a separate, immutable record:
//   1 PROPOSAL   what a model suggested: { params, rationale, source }. Untrusted data.
//   2 CANDIDATE  a proposal that passed validate(): every key is known, every value is a finite number
//                inside its configured bounds, and no value moves more than maxStep from the current one.
//   3 APPROVED   a candidate explicitly approved (by a person or a deterministic policy) with an
//                effective day on a clock boundary (the 1st of a month) in the future — never mid-month,
//                never retroactively.
//   4 HISTORY    an append-only log of every parameter set that was active, with its day range, so
//                statements, loans and reports can always be recomputed with the rates of their time.
//
// A future Financial District would: ask the model for a proposal → validate() → show the candidate →
// approve() → at the next month boundary call activate() inside the clock's month-start step → record in
// history. Interest, EMIs and prices keep being calculated by the existing deterministic code; only the
// parameter values it reads would change, and only at those boundaries.
export const ACTIVATION_ENABLED = false;

// Bounds a candidate must respect (annual rates as fractions; prices as multipliers of today's level).
export const PARAMETER_BOUNDS = {
  savingsRate: { min: 0.02, max: 0.06, maxStep: 0.005 },
  fdRate12: { min: 0.04, max: 0.09, maxStep: 0.005 },
  mortgageRate: { min: 0.07, max: 0.14, maxStep: 0.01 },
  personalLoanRate: { min: 0.10, max: 0.24, maxStep: 0.01 },
  propertyPriceIndex: { min: 0.7, max: 1.4, maxStep: 0.05 },
  marketIndexDrift: { min: -0.1, max: 0.15, maxStep: 0.02 },
  transferFee: { min: 0, max: 50, maxStep: 10 },
};

const freeze = o => Object.freeze(JSON.parse(JSON.stringify(o)));

export function propose({ params, rationale = '', source = 'model' }) {
  return freeze({ stage: 'proposal', params: params && typeof params === 'object' ? params : {}, rationale: String(rationale).slice(0, 1000), source });
}

// current: today's active parameters. Returns { ok, errors, candidate }.
export function validate(proposal, current, bounds = PARAMETER_BOUNDS) {
  const errors = [], params = proposal?.params ?? {};
  if (proposal?.stage !== 'proposal') errors.push('not a proposal');
  if (!Object.keys(params).length) errors.push('no parameters proposed');
  for (const [k, v] of Object.entries(params)) {
    const b = bounds[k];
    if (!b) { errors.push(`unknown parameter "${k}"`); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${k} must be a number`); continue; }
    if (v < b.min || v > b.max) errors.push(`${k}=${v} is outside ${b.min}–${b.max}`);
    if (current?.[k] != null && Math.abs(v - current[k]) > b.maxStep + 1e-12) errors.push(`${k} moves ${Math.abs(v - current[k]).toFixed(4)} from ${current[k]}; the limit is ${b.maxStep}`);
  }
  return { ok: !errors.length, errors, candidate: errors.length ? null : freeze({ stage: 'candidate', params, from: proposal.source, rationale: proposal.rationale }) };
}

// effectiveDay must be later than today and the first day of a month — the caller passes the game
// clock's own isMonthStart(day), so this module doesn't assume a calendar.
export function approve(candidate, { approvedBy, today, effectiveDay, isMonthStart }) {
  if (candidate?.stage !== 'candidate') return { ok: false, reason: 'not_a_candidate' };
  if (!approvedBy) return { ok: false, reason: 'approval_required' };
  if (!(effectiveDay > today)) return { ok: false, reason: 'not_in_future' };
  if (!isMonthStart?.(effectiveDay)) return { ok: false, reason: 'not_on_clock_boundary' };
  return { ok: true, approved: freeze({ ...candidate, stage: 'approved', approvedBy, effectiveDay }) };
}

// history: [{ params, fromDay, toDay|null }]. Disabled in Round 6.
export function activate(history, approved, current) {
  if (!ACTIVATION_ENABLED) return { ok: false, reason: 'activation_disabled' };
  if (approved?.stage !== 'approved') return { ok: false, reason: 'not_approved' };
  const prev = history.at(-1);
  const closed = prev ? [...history.slice(0, -1), { ...prev, toDay: approved.effectiveDay - 1 }] : [];
  return { ok: true, history: [...closed, { params: { ...current, ...approved.params }, fromDay: approved.effectiveDay, toDay: null }] };
}

// Which parameters applied on a given day (for recomputing past statements).
export const paramsOn = (history, day) => history.find(h => h.fromDay <= day && (h.toDay == null || day <= h.toDay))?.params ?? null;
