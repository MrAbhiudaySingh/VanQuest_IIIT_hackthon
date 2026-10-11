// Dynamic Vikram encounters for the academy's practice simulation (never the live game).
//
// Who decides what:
//   • THIS CODE (deterministic, seeded): the encounter class (scam / legitimate / moderate-risk) from
//     configurable weights, the archetype, every amount, the provider, the terms, the evidence each
//     investigation reveals (and whether it is a warning sign), the outcome rules, suitability and the
//     score. Stored once at generation; nothing changes after the player starts acting.
//   • THE MODEL (optional, via the local AI service): only the WORDING — Vikram's pitch, the scene, and
//     how he reacts to each question. validateNarrative() rejects any text that adds amounts, drops the
//     provider or stake, makes guarantee claims a genuine offer didn't make, or contains links/numbers to
//     call; rejected or missing text falls back to built-in seeded wording.
import { rng, roundTo, fingerprint } from './rng.js';

export const VIKRAM_VERSION = 1;
export const VIKRAM_CONFIG = { weights: { scam: 0.4, legitimate: 0.3, moderate_risk: 0.3 } };   // configurable distribution
export const CATEGORIES = { scam: 'Scam / dangerous offer', legitimate: 'Legitimate opportunity', moderate_risk: 'Moderate-risk opportunity' };
export const ACTIONS = {
  investigate: 'Investigate it',
  documents: 'Request documentation',
  verify_provider: 'Verify the provider',
  compare_terms: 'Compare the terms',
  ask_more: 'Ask for more information',
};
export const DECISIONS = { accept: 'Accept', reject: 'Reject', report: 'Report it' };
const inr = n => `₹${Math.round(n).toLocaleString('en-IN')}`;
const FD_REF = 0.0675;   // a 1-year bank FD rate from data/banking.js, for comparing promised returns

// Each archetype builds the authoritative facts from a seeded rng and the player's situation.
const ARCHETYPES = [
  // ---------------------------------------------------------------- scams
  { id: 'doubler', category: 'scam', topics: ['claims', 'scams'], build(r, ctx) {
    const stake = Math.min(ctx.maxStake, r.step(2000, 20000, 1000)), days = r.pick([15, 30, 45]), mult = r.pick([2, 3]);
    const provider = `${r.pick(['GoldenLeaf', 'SunHarvest', 'Royal Spice', 'GreenAcre'])} ${r.pick(['Plantation Scheme', 'Growth Circle', 'Wealth Club'])}`;
    const yearly = Math.round((Math.pow(mult, 365 / days) - 1) * 100);
    return { provider, product: `pay ${inr(stake)}, get ${inr(stake * mult)} back in ${days} days`, stake, claims: { guarantee: true, urgency: true },
      evidence: {
        investigate: { fact: `No company called ${provider} appears in the company registry; the "office" address is a residential flat.`, signal: 'red' },
        documents: { fact: 'He shows only WhatsApp screenshots of "payouts". No contract, no registration number.', signal: 'red' },
        verify_provider: { fact: `${provider} is not registered with any financial regulator.`, signal: 'red' },
        compare_terms: { fact: `${mult}× in ${days} days is about ${yearly.toLocaleString('en-IN')}% a year — a bank FD pays about ${(FD_REF * 100).toFixed(2)}%. Nothing legitimate promises that.`, signal: 'red' },
        ask_more: { fact: '"Only 3 slots left this week — and don\'t tell your family, they won\'t understand."', signal: 'red' },
      },
      outcome: { kind: 'loss', amount: stake, text: `The scheme vanished. The ${inr(stake)} is gone.` }, amounts: [stake, stake * mult] };
  } },
  { id: 'bank_impersonation', category: 'scam', topics: ['otp', 'scams', 'identity'], build(r, ctx) {
    const bank = r.pick(['Nidhi Bank', 'your bank']), atRisk = Math.min(ctx.liquid, r.step(5000, 25000, 1000));
    return { provider: `"${bank} KYC desk"`, product: 'share the OTP you\'re about to receive so your account isn\'t blocked', stake: atRisk, claims: { urgency: true, authority: true },
      evidence: {
        investigate: { fact: 'The number calling you is not the one printed on your bank card or in the official app.', signal: 'red' },
        documents: { fact: 'The "verification link" he texts is a misspelled web address, not the bank\'s official site.', signal: 'red' },
        verify_provider: { fact: 'The official bank app shows no alert and no KYC request on your account.', signal: 'red' },
        compare_terms: { fact: 'Banks never ask customers to read out an OTP, PIN or password over the phone.', signal: 'red' },
        ask_more: { fact: '"Stay on the line, sir — if you hang up the account freezes in 10 minutes."', signal: 'red' },
      },
      outcome: { kind: 'loss', amount: atRisk, text: `The OTP authorised a transfer: ${inr(atRisk)} left your account.` }, amounts: [atRisk] };
  } },
  { id: 'upi_refund', category: 'scam', topics: ['payments', 'scams'], build(r) {
    const refund = r.step(500, 4000, 100), request = refund * r.pick([1, 2, 5]);
    return { provider: '"customer support"', product: `approve a UPI request to receive a ${inr(refund)} refund`, stake: request, claims: { urgency: true },
      evidence: {
        investigate: { fact: 'The payment screen he sends says "Pay" — approving it sends money from you, it doesn\'t receive any.', signal: 'red' },
        documents: { fact: `The request is for ${inr(request)}, not the ${inr(refund)} "refund".`, signal: 'red' },
        verify_provider: { fact: 'The shop\'s official app shows the refund is still "processing" and needs no action from you.', signal: 'red' },
        compare_terms: { fact: 'You never need to enter your UPI PIN to receive money.', signal: 'red' },
        ask_more: { fact: '"Quick quick, the refund link expires in 5 minutes!"', signal: 'red' },
      },
      outcome: { kind: 'loss', amount: request, text: `Approving the request sent ${inr(request)} to a stranger.` }, amounts: [refund, request] };
  } },
  { id: 'advance_fee', category: 'scam', topics: ['scams', 'rights', 'claims'], build(r) {
    const prize = r.step(10000, 50000, 5000), fee = r.pick([499, 999, 1499, 2999]), what = r.pick(['scholarship', 'job offer', 'lottery prize']);
    return { provider: `${r.pick(['National', 'Bright Future', 'Excel'])} ${what === 'scholarship' ? 'Scholarship Board' : what === 'job offer' ? 'Placements' : 'Lucky Draw'}`,
      product: `pay a ${inr(fee)} "processing fee" to release a ${inr(prize)} ${what}`, stake: fee, claims: { guarantee: true, urgency: true, secrecy: true },
      evidence: {
        investigate: { fact: 'You never applied for this. The letter uses a copied logo.', signal: 'red' },
        documents: { fact: 'The "official letter" has no reference number and a free email address.', signal: 'red' },
        verify_provider: { fact: 'Your school / the real organisation says they never charge a fee and sent no such message.', signal: 'red' },
        compare_terms: { fact: 'Genuine scholarships and jobs don\'t ask you to pay to receive money.', signal: 'red' },
        ask_more: { fact: '"Pay within 10 minutes and keep it confidential."', signal: 'red' },
      },
      outcome: { kind: 'loss', amount: fee, text: `The ${inr(fee)} fee was paid; no ${what} ever arrived.` }, amounts: [prize, fee] };
  } },
  { id: 'tips_group', category: 'scam', topics: ['claims', 'scams', 'discipline'], build(r, ctx) {
    const stake = Math.min(ctx.maxStake, r.step(3000, 20000, 1000)), daily = r.pick([2, 3, 5]);
    return { provider: `${r.pick(['ProfitPilot', 'AlphaSignals', 'TradeGuru'])} trading group`, product: `deposit ${inr(stake)} into a personal account; earn ${daily}% every day`, stake, claims: { guarantee: true },
      evidence: {
        investigate: { fact: 'The "profits" in the group are screenshots; members who ask to withdraw are removed.', signal: 'red' },
        documents: { fact: 'Money goes to an individual\'s personal account, not a registered broker.', signal: 'red' },
        verify_provider: { fact: 'The group is not a registered investment adviser or broker.', signal: 'red' },
        compare_terms: { fact: `${daily}% a day compounds to over ${Math.round((Math.pow(1 + daily / 100, 365) - 1)).toLocaleString('en-IN')}× in a year — impossible.`, signal: 'red' },
        ask_more: { fact: '"To withdraw, you first pay a 20% release fee."', signal: 'red' },
      },
      outcome: { kind: 'loss', amount: stake, text: `The ${inr(stake)} can't be withdrawn — the "release fee" is a second scam.` }, amounts: [stake] };
  } },
  // ---------------------------------------------------------------- legitimate
  { id: 'recurring_deposit', category: 'legitimate', topics: ['saving', 'banking', 'goal'], build(r, ctx) {
    const monthly = Math.min(Math.max(500, roundTo(ctx.income * 0.1, 500)), r.step(1000, 4000, 500)), months = r.pick([12, 24]), rate = r.pick([0.0625, 0.065, 0.07]);
    const value = Math.round(Array.from({ length: months }, (_, i) => monthly * Math.pow(1 + rate / 12, months - i)).reduce((a, b) => a + b, 0));
    return { provider: 'Nidhi Bank (registered bank)', product: `a ${months}-month recurring deposit: ${inr(monthly)} a month at ${(rate * 100).toFixed(2)}%`, stake: monthly * months, monthly, rate, claims: {},
      evidence: {
        investigate: { fact: 'He is a Nidhi Bank branch officer; the branch is listed on the bank\'s official website.', signal: 'green' },
        documents: { fact: `A printed rate sheet: ${(rate * 100).toFixed(2)}% fixed; closing early earns 1% less. Deposits are insured up to the legal limit.`, signal: 'green' },
        verify_provider: { fact: 'Nidhi Bank is a licensed, regulated bank.', signal: 'green' },
        compare_terms: { fact: `At maturity you'd have about ${inr(value)} for ${inr(monthly * months)} paid in — similar to other banks. Money is locked unless you pay the penalty.`, signal: 'info' },
        ask_more: { fact: '"Only do it if the monthly amount fits after your bills — you can start smaller."', signal: 'green' },
      },
      outcome: { kind: 'fixed', value, paid: monthly * months, months, text: `The deposit matures at ${inr(value)} for ${inr(monthly * months)} paid in.` },
      amounts: [monthly, monthly * months, value], commitment: monthly };
  } },
  { id: 'index_sip', category: 'legitimate', topics: ['investing', 'sip', 'diversify', 'fees'], build(r) {
    const monthly = r.step(500, 3000, 500), er = r.pick([0.1, 0.2, 0.3]);
    return { provider: `${r.pick(['Bharat', 'Lotus', 'Sahyadri'])} Nifty Index Fund (registered fund house)`, product: `a ${inr(monthly)}-a-month SIP into a broad index fund, ${er}% yearly fee`, stake: monthly * 12, monthly, claims: { risk: true },
      evidence: {
        investigate: { fact: 'The fund house is registered with the market regulator; its fact sheet is public.', signal: 'green' },
        documents: { fact: 'The scheme document says plainly: market-linked, can fall in value, no guaranteed return.', signal: 'green' },
        verify_provider: { fact: 'The fund appears in the regulator\'s list of registered schemes.', signal: 'green' },
        compare_terms: { fact: `A ${er}% fee is low for a fund. Over years, value usually rises but can drop 20–30% in a bad year.`, signal: 'info' },
        ask_more: { fact: '"Only invest money you won\'t need for five years or more."', signal: 'green' },
      },
      outcome: { kind: 'market', monthly, years: 5, text: 'Market-linked — the value in five years is uncertain.' }, amounts: [monthly, monthly * 12], commitment: monthly };
  } },
  { id: 'health_cover', category: 'legitimate', topics: ['insurance', 'commitments', 'emergency'], build(r) {
    const premium = r.step(3000, 9000, 500), cover = r.pick([200000, 300000, 500000]);
    return { provider: `${r.pick(['Suraksha', 'Arogya', 'Kavach'])} General Insurance (licensed insurer)`, product: `health insurance: ${inr(premium)} a year for ${inr(cover)} of hospital cover`, stake: premium, claims: {},
      evidence: {
        investigate: { fact: 'The insurer is licensed by the insurance regulator.', signal: 'green' },
        documents: { fact: 'The policy wording lists exclusions and a 30-day waiting period clearly.', signal: 'green' },
        verify_provider: { fact: 'The agent\'s licence number checks out on the regulator\'s website.', signal: 'green' },
        compare_terms: { fact: `Similar cover elsewhere costs ${inr(premium - 500)}–${inr(premium + 1500)} a year.`, signal: 'info' },
        ask_more: { fact: '"Read the exclusions — it won\'t cover everything."', signal: 'green' },
      },
      outcome: { kind: 'fixed', value: 0, paid: premium, months: 12, protection: cover, text: `You're covered for ${inr(cover)} of hospital bills this year for ${inr(premium)}.` },
      amounts: [premium, cover, premium - 500, premium + 1500] };
  } },
  // ---------------------------------------------------------------- moderate risk
  { id: 'friend_stall', category: 'moderate_risk', topics: ['risk', 'opportunity', 'goal'], build(r, ctx) {
    const stake = Math.min(ctx.maxStake, r.step(3000, 15000, 1000)), up = r.pick([0.25, 0.3, 0.4]), down = r.pick([0.5, 0.6, 0.8]), p = r.pick([0.45, 0.5, 0.55]);
    return { provider: 'Your cousin Ravi\'s food stall', product: `put ${inr(stake)} into a new food stall for a share of profits after a year`, stake, claims: { risk: true },
      evidence: {
        investigate: { fact: 'The stall is real and Ravi has a written plan; it\'s new, with no track record yet.', signal: 'info' },
        documents: { fact: 'A simple written agreement: your share of profit, or of losses, after 12 months.', signal: 'green' },
        verify_provider: { fact: 'Ravi has a trade licence; you know him personally.', signal: 'green' },
        compare_terms: { fact: `If it goes well you get about ${inr(stake * (1 + up))}; if it struggles you might get back only ${inr(stake * (1 - down))}. Many new food businesses struggle.`, signal: 'info' },
        ask_more: { fact: '"No pressure — only put in what you could afford to lose."', signal: 'green' },
      },
      outcome: { kind: 'distribution', options: [{ p, value: Math.round(stake * (1 + up)), text: 'The stall did well.' }, { p: 1 - p, value: Math.round(stake * (1 - down)), text: 'The stall struggled.' }] },
      amounts: [stake, Math.round(stake * (1 + up)), Math.round(stake * (1 - down))] };
  } },
  { id: 'smallcap', category: 'moderate_risk', topics: ['risk', 'returns', 'diversify', 'charts'], build(r, ctx) {
    const stake = Math.min(ctx.maxStake, r.step(2000, 12000, 1000)), co = r.pick(['Lumen Tech', 'Halcyon Pharma', 'Deccan Motors']);
    return { provider: `${co} shares (listed company, via a registered broker)`, product: `buy ${inr(stake)} of one small company's shares`, stake, claims: { risk: true },
      evidence: {
        investigate: { fact: `${co}'s published results show growing sales but thin profits.`, signal: 'info' },
        documents: { fact: 'The broker is registered; the contract note shows a small brokerage fee.', signal: 'green' },
        verify_provider: { fact: 'The company is listed on a regulated exchange.', signal: 'green' },
        compare_terms: { fact: 'Shares like this have swung ±40% in a year. One company is concentrated risk.', signal: 'info' },
        ask_more: { fact: '"I like it, but I could be wrong — it\'s jumpy."', signal: 'green' },
      },
      outcome: { kind: 'distribution', options: [{ p: 0.35, value: Math.round(stake * 1.35), text: 'The shares rose.' }, { p: 0.35, value: Math.round(stake * 0.98), text: 'The shares went nowhere.' }, { p: 0.3, value: Math.round(stake * 0.6), text: 'The shares fell sharply.' }] },
      amounts: [stake, Math.round(stake * 1.35), Math.round(stake * 0.98), Math.round(stake * 0.6)] };
  } },
  { id: 'p2p', category: 'moderate_risk', topics: ['credit', 'risk', 'saving'], build(r, ctx) {
    const stake = Math.min(ctx.maxStake, r.step(5000, 20000, 1000)), y = r.pick([0.11, 0.12, 0.14]);
    return { provider: 'LendLink (registered peer-to-peer lending platform)', product: `lend ${inr(stake)} to borrowers for 12 months at a ${Math.round(y * 100)}% target return`, stake, claims: { risk: true },
      evidence: {
        investigate: { fact: 'The platform is registered as a P2P lender with the central bank.', signal: 'green' },
        documents: { fact: 'The terms say returns are not guaranteed; some borrowers default and money is locked for 12 months.', signal: 'green' },
        verify_provider: { fact: 'Its registration number matches the regulator\'s list.', signal: 'green' },
        compare_terms: { fact: `${Math.round(y * 100)}% is double a bank FD — because of the default risk. Typical default losses: 3–10% of the money lent.`, signal: 'info' },
        ask_more: { fact: '"Spread it over many borrowers, and don\'t use money you might need this year."', signal: 'green' },
      },
      outcome: { kind: 'distribution', options: [{ p: 0.6, value: Math.round(stake * (1 + y - 0.03)), text: 'Most borrowers repaid.' }, { p: 0.4, value: Math.round(stake * (1 + y - 0.12)), text: 'Several borrowers defaulted.' }] },
      amounts: [stake, Math.round(stake * (1 + y - 0.03)), Math.round(stake * (1 + y - 0.12))] };
  } },
];
export const ARCHETYPE_IDS = ARCHETYPES.map(a => a.id);

// Built-in seeded wording (used when the model is unavailable or its text fails validation).
const FALLBACK = {
  scam: [f => `Bhai, listen — ${f.provider}. You just ${f.product}. My cousin did it last month. But you have to decide today.`,
    f => `Good news for you! ${f.provider} — ${f.product}. Everyone's doing it, slots are almost gone.`],
  legitimate: [f => `Hello! I'm with ${f.provider}. We offer ${f.product}. Have a look at the paperwork — no rush.`,
    f => `If you're thinking about the future: ${f.provider} has ${f.product}. Take the brochure home and compare.`],
  moderate_risk: [f => `I've got something interesting — ${f.provider}: ${f.product}. Could do well, could not. Think about it.`,
    f => `${f.provider} — ${f.product}. I'm in myself, but it's not a sure thing.`],
};
const SCENES = ['outside the college gate', 'at the bus stop on Main Street', 'by the chai stall near the market', 'on a phone call while you\'re at home', 'in a WhatsApp message'];

// ctx: the practice player's situation — { liquid, reserveTarget, income, maxStake }
export function generate(seed, ctx, { weights = VIKRAM_CONFIG.weights, topic = null } = {}) {
  const r = rng('vikram', VIKRAM_VERSION, seed);
  const category = r.weighted(weights);
  const pool = ARCHETYPES.filter(a => a.category === category);
  const preferred = topic ? pool.filter(a => a.topics.includes(topic)) : [];
  const arch = r.pick(preferred.length ? preferred : pool);
  const c = { liquid: Math.max(0, ctx.liquid ?? 20000), reserveTarget: ctx.reserveTarget ?? 10000, income: ctx.income ?? 15000 };
  c.maxStake = Math.max(1000, Math.min(ctx.maxStake ?? Infinity, roundTo(Math.max(c.liquid, 2000) * 0.8, 1000)));
  const facts = arch.build(r, c);
  const narrative = { pitch: r.pick(FALLBACK[category])(facts), scene: r.pick(SCENES), reactions: {}, source: 'built-in' };
  const enc = { id: `vk-${VIKRAM_VERSION}-${seed}`, version: VIKRAM_VERSION, seed, category, archetype: arch.id, ctx: c, facts, narrative, revealed: [], decision: null, outcome: null };
  enc.fingerprint = fingerprint(`${arch.id}|${facts.product}|${narrative.pitch}`);
  return enc;
}

// ---------------------------------------------------------------- validating model text
const GUARANTEE = /\b(guarantee[ds]?|risk[- ]?free|no risk|100% safe|sure[- ]?shot|can't lose|cannot lose|double your money)\b/i;
// honest disclaimers ("returns are not guaranteed") are fine — strip negated forms before checking
const NEGATED = /\b(no|not|never|isn't|is not|aren't|are not|without(?: any)?|nothing is)\s+(?:a\s+|any\s+)?(guarantee[ds]?|risk[- ]?free|sure[- ]?shot)\b/gi;
// an offer with an uncertain result must not turn an amount into a promised one ("you'll have ₹X")
const CERTAIN_OUTCOME = /\b(you'll|you will|you'd|you would|it will|it'll|this will|that's|that is)\s+(definitely\s+|surely\s+)?(have|get|earn|make|receive|end up with|grow to|be worth|double|triple)\b/i;
const UNCERTAIN = new Set(['market', 'distribution']);
const amountsIn = text => new Set([...String(text).matchAll(/₹\s?([\d,]+)/g)].map(m => Number(m[1].replace(/,/g, ''))));
const CONTACT = /(https?:\/\/|www\.|\.com\b|\.in\b|@[a-z]|\b\d{10,}\b|\+91)/i;
export const NARRATIVE_LIMITS = { pitch: [20, 420], scene: [3, 120], reaction: [0, 240] };

// Returns { ok, errors, value } — value is a cleaned narrative the UI may show.
export function validateNarrative(enc, n) {
  const errors = [];
  if (!n || typeof n !== 'object') return { ok: false, errors: ['not an object'] };
  const str = (v, [lo, hi], name) => { if (typeof v !== 'string' || v.trim().length < lo || v.length > hi) errors.push(`${name}: length must be ${lo}–${hi}`); return typeof v === 'string' ? v.trim() : ''; };
  const pitch = str(n.pitch, NARRATIVE_LIMITS.pitch, 'pitch'), scene = str(n.scene, NARRATIVE_LIMITS.scene, 'scene');
  const reactions = {};
  for (const [k, v] of Object.entries(n.reactions ?? {})) { if (!ACTIONS[k]) { errors.push(`unknown action ${k}`); continue; } reactions[k] = str(v, NARRATIVE_LIMITS.reaction, `reaction.${k}`); }
  const all = [pitch, scene, ...Object.values(reactions)].join(' ').replace(/[\u2018\u2019]/g, "'");
  // Each piece of text may only quote the amounts of its own source, so a real amount can't be given a
  // new meaning ("₹30,000 over five years" when ₹30,000 is one year of payments): the pitch quotes the
  // offer's own wording (or, if that has no amounts, the offer's amounts), each reaction the offer's wording + its own evidence.
  const allowed = new Set(enc.facts.amounts.map(Math.round)), inProduct = amountsIn(enc.facts.product);
  const check = (text, ok, where) => { for (const v of amountsIn(text)) if (!ok.has(v)) errors.push(`${where}: ₹${v.toLocaleString('en-IN')} isn't an amount stated there — quote only ${ok.size ? [...ok].map(x => `₹${x.toLocaleString('en-IN')}`).join(', ') : 'no amounts'}`); };
  check(pitch, inProduct.size ? inProduct : allowed, 'pitch');
  check(scene, new Set(), 'scene');
  for (const [k, v] of Object.entries(reactions)) check(v, new Set([...inProduct, ...amountsIn(enc.facts.evidence?.[k]?.fact ?? '')]), `reaction.${k}`);
  if (CONTACT.test(all)) errors.push('contains a link, email or phone number');
  if (enc.category !== 'scam' && GUARANTEE.test(all.replace(NEGATED, ''))) errors.push('a genuine offer must not be described with guarantee / no-risk language');
  if (enc.category !== 'scam' && UNCERTAIN.has(enc.facts.outcome?.kind) && CERTAIN_OUTCOME.test(all)) errors.push('the result is uncertain — do not promise what the player will end up with; state the terms instead');
  const providerWord = enc.facts.provider.replace(/["()]/g, '').split(/\s+/).find(w => w.length > 3) ?? enc.facts.provider;
  if (!pitch.toLowerCase().includes(providerWord.toLowerCase())) errors.push(`pitch must name the provider (${providerWord})`);
  // when the offer itself is stated in rupees, the pitch must quote one of its real amounts
  if (inProduct.size && ![...amountsIn(pitch)].some(v => inProduct.has(v))) errors.push('pitch must state the offer\'s amount');
  return { ok: !errors.length, errors, value: { pitch, scene, reactions, source: 'model' } };
}

// Apply model wording if it validates and isn't a duplicate. Facts are never touched.
export function withNarrative(enc, n, seenFingerprints = []) {
  const v = validateNarrative(enc, n);
  if (!v.ok) return { enc, applied: false, errors: v.errors };
  const fp = fingerprint(`${enc.archetype}|${enc.facts.product}|${v.value.pitch}`);
  if (seenFingerprints.includes(fp)) return { enc, applied: false, errors: ['duplicate of an earlier encounter'] };
  return { enc: { ...enc, narrative: v.value, fingerprint: fp }, applied: true, errors: [] };
}

// ---------------------------------------------------------------- playing it
export function reveal(enc, action) {
  if (enc.decision) return { ok: false, reason: 'decided' };           // no new evidence after the decision
  if (!ACTIONS[action]) return { ok: false, reason: 'unknown_action' };
  if (enc.revealed.includes(action)) return { ok: true, enc, evidence: enc.facts.evidence[action] };
  return { ok: true, enc: { ...enc, revealed: [...enc.revealed, action] }, evidence: enc.facts.evidence[action] };
}

// Suitability of the offer for THIS player's situation (deterministic).
export function suitability(enc) {
  const { liquid, reserveTarget, income } = enc.ctx, f = enc.facts, free = Math.max(0, liquid - reserveTarget);
  if (enc.category === 'legitimate') {
    if (f.commitment) return { ok: f.commitment <= income * 0.2 && liquid >= reserveTarget * 0.5, why: f.commitment <= income * 0.2 ? (liquid >= reserveTarget * 0.5 ? 'the monthly amount fits your income and you have a reserve' : 'you have almost no emergency reserve yet — locking money away first is risky') : 'the monthly commitment is a big share of your income' };
    return { ok: f.stake <= free || f.outcome.protection, why: f.outcome.protection ? 'it protects you against a large cost you couldn\'t pay from savings' : 'you can pay it without touching your reserve' };
  }
  if (enc.category === 'moderate_risk') return { ok: f.stake <= free * 0.3, why: f.stake <= free * 0.3 ? 'the stake is a small share of money beyond your emergency reserve' : `the ${inr(f.stake)} stake is more than you could comfortably lose (about ${inr(free * 0.3)} beyond your reserve)` };
  return { ok: false, why: 'it is a scam' };
}

// Resolve the decision with the scenario's own rules. rand: a seeded number in [0,1) for distributions.
export function decide(enc, decision) {
  if (enc.decision) return { ok: false, reason: 'already_decided' };
  if (!DECISIONS[decision]) return { ok: false, reason: 'unknown_decision' };
  const f = enc.facts, r = rng('vikram-outcome', enc.seed);
  let money = 0, text = 'Nothing changed hands.';
  if (decision === 'accept') {
    const o = f.outcome;
    if (o.kind === 'loss') { money = -o.amount; text = o.text; }
    else if (o.kind === 'fixed') { money = o.value - o.paid; text = o.text; }
    else if (o.kind === 'market') { text = o.text; money = 0; }
    else { let x = r.next(); const pick = o.options.find(op => (x -= op.p) < 0) ?? o.options.at(-1); money = pick.value - f.stake; text = `${pick.text} You got back ${inr(pick.value)} for ${inr(f.stake)}.`; }
  }
  const outcome = { decision, money, text, expected: f.outcome.kind === 'distribution' ? Math.round(f.outcome.options.reduce((s, o) => s + o.p * o.value, 0) - f.stake) : null };
  return { ok: true, enc: { ...enc, decision, outcome } };
}

// Deterministic evaluation of a finished encounter (score 0–100 + feedback built from the facts).
export function evaluate(enc) {
  const f = enc.facts, ev = Object.entries(f.evidence), red = ev.filter(([, e]) => e.signal === 'red').map(([k]) => k);
  const seenRed = enc.revealed.filter(k => red.includes(k)), missedRed = red.filter(k => !enc.revealed.includes(k));
  const verified = enc.revealed.includes('verify_provider') || enc.revealed.includes('documents'), compared = enc.revealed.includes('compare_terms');
  const suit = suitability(enc), d = enc.decision;
  let score, verdict;
  if (enc.category === 'scam') {
    score = d === 'accept' ? Math.min(15, 5 * seenRed.length) : (d === 'report' ? 85 : 72) + Math.min(15, 5 * seenRed.length);
    verdict = d === 'accept' ? 'You fell for a scam.' : d === 'report' ? 'You spotted the scam and reported it — the best outcome.' : 'You turned the scam down.';
  } else if (enc.category === 'legitimate') {
    score = d === 'accept' ? (suit.ok ? 82 + (verified ? 10 : 0) + (compared ? 8 : 0) : 40 + (verified ? 5 : 0)) : d === 'reject' ? (suit.ok ? 62 + (verified ? 8 : 0) : 85) : 30;
    verdict = d === 'report' ? 'You reported a genuine offer — checking first would have shown it was legitimate.'
      : d === 'accept' ? (suit.ok ? 'A sound choice: a genuine offer that suited your situation.' : `A genuine offer, but not a good fit right now: ${suit.why}.`)
      : suit.ok ? 'Turning it down was reasonable — though it was a genuine offer that would have suited you.' : `Declining was sensible: ${suit.why}.`;
  } else {
    score = d === 'accept' ? (suit.ok ? 70 + (compared ? 20 : 0) + (verified ? 10 : 0) : 25 + (compared ? 5 : 0)) : d === 'reject' ? 75 + (compared ? 10 : 0) : 30;
    verdict = d === 'report' ? 'This was a real, if risky, opportunity — not something to report.'
      : d === 'accept' ? (suit.ok ? `A considered risk: ${suit.why}.` : `Too big a risk for your situation: ${suit.why} — even if it pays off, that would be luck.`)
      : 'Passing on an uncertain opportunity is always a reasonable choice.';
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const nextTime = [];
  if (enc.category === 'scam' && missedRed.length) nextTime.push(`Check before deciding — ${missedRed.map(k => ACTIONS[k].toLowerCase()).join(', ')} would have shown more warning signs.`);
  if (enc.category !== 'scam' && !verified) nextTime.push('Verify the provider and read the documents even when an offer looks fine.');
  if (enc.category === 'moderate_risk' && !compared) nextTime.push('Compare the terms: work out the best and worst case before committing.');
  if (enc.category === 'legitimate' && d === 'report') nextTime.push('Report only when the evidence points to fraud.');
  if (!nextTime.length) nextTime.push('Keep using the same steps: pause, verify, then act.');
  return {
    score, verdict, classification: CATEGORIES[enc.category],
    evidence: ev.map(([k, e]) => ({ action: ACTIONS[k], fact: e.fact, signal: e.signal, seen: enc.revealed.includes(k) })),
    identified: seenRed.map(k => f.evidence[k].fact), missed: missedRed.map(k => f.evidence[k].fact),
    consequences: enc.outcome?.text ?? '', money: enc.outcome?.money ?? 0, expected: enc.outcome?.expected ?? null,
    verificationAppropriate: enc.category === 'legitimate' ? 'Yes — even genuine offers deserve a quick check.' : 'Yes — this offer needed checking before any money moved.',
    suitability: suit, nextTime,
  };
}
