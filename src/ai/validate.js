// Validators for model output, shared by the local AI service (server/tasks.mjs) and the browser
// (defence in depth). Model text is only ever shown after it passes these checks; it can never change
// numbers, scores, classifications or game state — those come from deterministic code.
const NUM = /(?:₹\s?)?\d[\d,]*(?:\.\d+)?%?/g;
const CONTACT = /(https?:\/\/|www\.|\.com\b|\.in\b|\.org\b|@[a-z]|\b\d{10,}\b|\+91)/i;

// Every number the text quotes must be one we gave it (small counts ≤ 12, e.g. "3 months", are fine).
export function numbersAllowed(text, allowed) {
  const ok = new Set(allowed.flatMap(n => [Math.round(n), Math.round(n * 100) / 100]));
  const bad = [];
  for (const m of String(text).matchAll(NUM)) {
    const raw = m[0], v = Number(raw.replace(/[₹,%\s]/g, ''));
    if (!Number.isFinite(v) || (Number.isInteger(v) && v <= 12 && !raw.includes('₹'))) continue;
    if (!ok.has(v) && !ok.has(Math.round(v))) bad.push(raw);
  }
  return bad;
}

const str = (v, lo, hi) => typeof v === 'string' && v.trim().length >= lo && v.length <= hi;

// "explain": a short explanation of a practice result.
export function validateExplain(d, input) {
  const errors = [];
  if (!d || typeof d !== 'object') return { ok: false, errors: ['not an object'] };
  if (!str(d.explanation, 40, 900)) errors.push('explanation must be 40–900 characters');
  if (d.tip != null && !str(d.tip, 0, 240)) errors.push('tip must be at most 240 characters');
  if (d.misconception != null && !str(d.misconception, 0, 300)) errors.push('misconception must be at most 300 characters');
  const text = [d.explanation, d.tip, d.misconception].filter(Boolean).join(' ');
  const bad = numbersAllowed(text, input.allowedNumbers ?? []);
  if (bad.length) errors.push(`uses numbers that are not in the results: ${bad.slice(0, 4).join(', ')}`);
  if (CONTACT.test(text)) errors.push('contains a link or contact detail');
  return { ok: !errors.length, errors, value: { explanation: d.explanation?.trim(), tip: d.tip?.trim() || null, misconception: d.misconception?.trim() || null } };
}

// "life_feedback": the qualitative paragraph of the final report.
export function validateLifeFeedback(d, input) {
  const errors = [];
  if (!d || typeof d !== 'object') return { ok: false, errors: ['not an object'] };
  if (!str(d.narrative, 80, 1400)) errors.push('narrative must be 80–1400 characters');
  if (!str(d.encouragement, 10, 300)) errors.push('encouragement must be 10–300 characters');
  const text = `${d.narrative ?? ''} ${d.encouragement ?? ''}`;
  const bad = numbersAllowed(text, input.allowedNumbers ?? []);
  if (bad.length) errors.push(`uses numbers that are not in the report: ${bad.slice(0, 4).join(', ')}`);
  const ratings = ['Excellent', 'Strong', 'Developing', 'Struggling', 'Needs support'].filter(r => r !== input.rating);
  const other = ratings.find(r => new RegExp(`\\b${r}\\b`, 'i').test(text));
  if (other) errors.push(`gives a different rating ("${other}") than the calculated one ("${input.rating}")`);
  if (CONTACT.test(text)) errors.push('contains a link or contact detail');
  return { ok: !errors.length, errors, value: { narrative: d.narrative?.trim(), encouragement: d.encouragement?.trim() } };
}

// "reasoning": rubric-based reading of a player's written reasoning. Advisory only: quotes must be exact
// substrings of what the player wrote, and only the given criteria ids may be used.
export function validateReasoning(d, input) {
  const errors = [], ids = new Set(input.rubric.map(c => c.id));
  if (!d || !Array.isArray(d.criteria)) return { ok: false, errors: ['criteria must be a list'] };
  const seen = new Set();
  for (const c of d.criteria) {
    if (!ids.has(c.id)) errors.push(`unknown criterion "${c.id}"`);
    if (seen.has(c.id)) errors.push(`criterion "${c.id}" repeated`);
    seen.add(c.id);
    if (typeof c.met !== 'boolean') errors.push(`criterion "${c.id}": met must be true/false`);
    if (c.met && (!str(c.quote, 3, 240) || !input.answer.toLowerCase().includes(c.quote.toLowerCase().trim()))) errors.push(`criterion "${c.id}": the quote must be copied exactly from the player's answer`);
  }
  for (const id of ids) if (!seen.has(id)) errors.push(`criterion "${id}" missing`);
  if (!str(d.feedback, 20, 700)) errors.push('feedback must be 20–700 characters');
  if (CONTACT.test(d.feedback ?? '')) errors.push('contains a link or contact detail');
  return { ok: !errors.length, errors, value: { criteria: d.criteria.map(c => ({ id: c.id, met: c.met, quote: c.met ? c.quote.trim() : null })), feedback: d.feedback?.trim() } };
}

// Round 7: a rupee amount must be one of the rupee amounts in the facts, and a percentage one of the
// percentages — a number that exists elsewhere in the facts with a different meaning is still refused.
export function unitsAllowed(text, { allowedRupees, allowedPercents } = {}) {
  const bad = [], near = (set, v) => set.some(x => Math.abs(x - v) < 0.051);
  for (const m of String(text).matchAll(/₹\s?(\d[\d,]*(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?%/g)) {
    if (m[1] && allowedRupees && !near(allowedRupees, Number(m[1].replace(/,/g, '')))) bad.push(m[0]);
    if (m[2] && allowedPercents && !near(allowedPercents, Number(m[2]))) bad.push(m[0]);
  }
  return bad;
}
export const factUnits = text => ({
  allowedRupees: [...String(text).matchAll(/₹\s?(\d[\d,]*(?:\.\d+)?)/g)].map(m => Number(m[1].replace(/,/g, ''))),
  allowedPercents: [...String(text).matchAll(/(\d+(?:\.\d+)?)%/g)].map(m => Number(m[1])),
});

// ------------------------------------------------------------------ Round 7: the final life report
export const LIFE_SECTIONS = ['investing', 'budgeting', 'saving', 'risk', 'quality', 'goals'];
const RW = '(Excellent|Strong|Developing|Struggling|Needs support)';
const RATING_PHRASE = new RegExp(`\\b(?:rat(?:ed|ing)(?: (?:is|was|of|as))?|overall(?: (?:is|was))?)\\W+(?:an? )?${RW}\\b|\\b${RW}\\W+(?:overall |life )?rating\\b`, 'gi');
// A topic may only be mentioned if the facts mention it — the model can't add events that never happened.
const TOPICS = [/\b(scam|fraud|ponzi|con artist)\w*/i, /\b(vikram|tipster|street tip)\w*/i, /\b(crypto|token|coinnova)\w*/i, /\b(mortgage|loan|emi|debt)s?\b/i,
  /\bevict\w*/i, /\b(car|vehicle)s?\b/i, /\b(graduat|degree|college)\w*/i, /\bpromot\w*/i, /\b(fixed deposit|fds?)\b/i, /\b(stock|shares|index fund|bond fund)s?\b/i,
  /\b(property|properties|landlord|tenant)\w*/i, /\b(hungry|hunger|starv|malnutrition)\w*/i, /\b(died|death|dead)\b/i, /\bretire\w*/i];
const topicErrors = (text, factsText) => TOPICS.filter(re => re.test(text) && !re.test(factsText)).map(re => `mentions "${text.match(re)[0]}", which is not in the record`);

export function validateLifeReport(d, input) {
  const errors = [];
  if (!d || typeof d !== 'object' || !d.sections || typeof d.sections !== 'object') return { ok: false, errors: ['must be an object with summary, sections and improvements'] };
  const refs = new Set(input.refs ?? []), facts = JSON.stringify(input.criteria) + JSON.stringify(input.ending) + JSON.stringify(input.achievements ?? []);
  if (!str(d.summary, 80, 900)) errors.push('summary must be 80–900 characters');
  const value = { summary: d.summary?.trim(), sections: {}, improvements: [] };
  for (const k of LIFE_SECTIONS) {
    const s = d.sections[k];
    if (!s || !str(s.text, 40, 900)) { errors.push(`sections.${k} is missing or not 40–900 characters`); continue; }
    const rs = Array.isArray(s.refs) ? s.refs.map(String) : [];
    const bad = rs.filter(r => !refs.has(r));
    if (bad.length) errors.push(`sections.${k} cites evidence that does not exist: ${bad.slice(0, 3).join(', ')}`);
    const needs = (input.criteria[k]?.findings ?? []).some(f => f.r?.length);
    if (needs && !rs.some(r => refs.has(r))) errors.push(`sections.${k} must cite at least one evidence id from its findings`);
    value.sections[k] = { text: s.text.trim(), refs: rs.filter(r => refs.has(r)) };
  }
  const imp = Array.isArray(d.improvements) ? d.improvements : [];
  if (imp.length < 1 || imp.length > 4) errors.push('improvements must have 1–4 items');
  for (const [i, x] of imp.entries()) {
    if (!str(x?.text, 30, 400)) { errors.push(`improvements[${i}] must be 30–400 characters`); continue; }
    const rs = Array.isArray(x.refs) ? x.refs.map(String) : [];
    if (rs.some(r => !refs.has(r))) errors.push(`improvements[${i}] cites evidence that does not exist`);
    value.improvements.push({ text: x.text.trim(), refs: rs.filter(r => refs.has(r)) });
  }
  const text = [d.summary, ...LIFE_SECTIONS.map(k => d.sections[k]?.text), ...imp.map(x => x?.text)].filter(Boolean).join(' ');
  const nums = [...numbersAllowed(text, input.allowedNumbers ?? []), ...unitsAllowed(text, input)];
  if (nums.length) errors.push(`uses amounts or percentages that are not in the record (or not with that meaning): ${[...new Set(nums)].slice(0, 4).join(', ')}`);
  // the rating may only be named as the calculated one ("strong budgeting" is fine; "a Strong rating" is not)
  const named = [...text.matchAll(RATING_PHRASE)].map(m => m[1] ?? m[2]).find(w => w.toLowerCase() !== String(input.rating).toLowerCase());
  if (named) errors.push(`gives a different rating ("${named}") than the calculated one ("${input.rating}")`);
  // what happened (summary + sections) may only mention things in the record; general advice may name any topic
  errors.push(...topicErrors([d.summary, ...LIFE_SECTIONS.map(k => d.sections[k]?.text)].filter(Boolean).join(' '), facts).slice(0, 3));
  if (CONTACT.test(text)) errors.push('contains a link or contact detail');
  return { ok: !errors.length, errors, value };
}

// ------------------------------------------------------------------ Round 7: the monthly newspaper
const PREDICT = /\b(guarantee\w*|will (definitely |surely )?(rise|fall|go up|go down|double|crash|recover|keep rising|keep falling)|sure thing|can'?t lose|risk[- ]free|buy now|sell now|you should (buy|sell)|invest all|all your (savings|money))\b/i;
// an explanation of WHY a price moved ("due to strong earnings") must come from a recorded event
const CAUSE = /\b(?:due to|because(?: of)?|driven by|thanks to|following|amid|on the back of|fuell?ed by|caused by|after|may have|might have|could have|likely)\b[^.]{0,60}?\b(concerns?|fears?|worries|optimism|sentiment|earnings|results|news|announce\w*|tariff|regulator\w*|listing|trials?|merger|demand|profits?|revenue|investors?|economic|economy)\b/i;
const UP = /\b(rose|rise|rising|gained|gain|climbed|jumped|up|higher|rallied|increased)\b/i, DOWN = /\b(fell|fall|falling|dropped|drop|declined|decline|lost|down|lower|slid|slumped|crashed|decreased)\b/i;
export function validateNewspaper(d, input) {
  const errors = [];
  if (!d || typeof d !== 'object') return { ok: false, errors: ['not an object'] };
  if (!str(d.headline, 10, 120)) errors.push('headline must be 10–120 characters');
  if (!str(d.lead, 40, 500)) errors.push('lead must be 40–500 characters');
  if (!str(d.safety, 30, 400)) errors.push('safety must be 30–400 characters');
  const ids = new Map(input.assets.map(a => [a.id, a])), seen = new Set(), assets = [];
  for (const a of Array.isArray(d.assets) ? d.assets : []) {
    const f = ids.get(a?.id);
    if (!f) { errors.push(`unknown asset "${a?.id}"`); continue; }
    if (seen.has(a.id)) { errors.push(`asset ${a.id} repeated`); continue; }
    seen.add(a.id);
    if (!str(a.text, 30, 400)) { errors.push(`assets.${a.id} must be 30–400 characters`); continue; }
    const why = (input.events ?? []).filter(e => e.asset === a.id).map(e => e.text ?? '').join(' ');
    const cause = a.text.match(CAUSE)?.[1];
    if (cause && !new RegExp(`\\b${cause}`, 'i').test(why)) errors.push(`assets.${a.id}: gives a reason ("${cause}") that no recorded event supports — say no specific event was recorded`);
    if (f.pct > 0 && DOWN.test(a.text) && !UP.test(a.text)) errors.push(`assets.${a.id}: it rose ${f.pct}%, but the text says it fell`);
    if (f.pct < 0 && UP.test(a.text) && !DOWN.test(a.text)) errors.push(`assets.${a.id}: it fell ${Math.abs(f.pct)}%, but the text says it rose`);
    assets.push({ id: a.id, text: a.text.trim() });
  }
  for (const id of ids.keys()) if (!seen.has(id)) errors.push(`assets.${id} missing`);
  const text = [d.headline, d.lead, d.safety, ...assets.map(a => a.text)].filter(Boolean).join(' ');
  const nums = [...numbersAllowed(text, input.allowedNumbers ?? []), ...unitsAllowed(text, input)];
  if (nums.length) errors.push(`uses numbers that are not in the market data: ${[...new Set(nums)].slice(0, 4).join(', ')}`);
  const leadCause = `${d.lead ?? ''} ${d.headline ?? ''}`.match(CAUSE)?.[1], anyWhy = (input.events ?? []).map(e => e.text ?? '').join(' ');
  if (leadCause && !new RegExp(`\\b${leadCause}`, 'i').test(anyWhy)) errors.push(`the lead gives a reason ("${leadCause}") that no recorded event supports`);
  if (PREDICT.test(text)) errors.push(`makes a prediction or a command ("${text.match(PREDICT)[0]}") — describe what happened and the risks only`);
  if (CONTACT.test(text)) errors.push('contains a link or contact detail');
  return { ok: !errors.length, errors, value: { headline: d.headline?.trim(), lead: d.lead?.trim(), safety: d.safety?.trim(), assets } };
}
