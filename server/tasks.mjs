// The fixed set of things the browser may ask the local model to do. The browser sends structured
// facts (never a prompt); each task builds its own prompt from a template, asks for JSON matching a
// schema, and validates the meaning of the answer before returning it.
import { validateNarrative, ACTIONS } from '../src/practice/vikram.js';
import { validateExplain, validateLifeFeedback, validateReasoning, validateLifeReport, validateNewspaper, LIFE_SECTIONS } from '../src/ai/validate.js';

const SYSTEM = 'You write short, plain-English text for VanQuest, an educational financial-literacy game for Indian students aged 16–18. '
  + 'Everything is fictional. You never give personal financial advice, never invent numbers, names or facts that are not in the input, '
  + 'never include links, phone numbers or emails, and you reply with JSON only.';
const clip = (s, n) => String(s ?? '').slice(0, n);
const nums = (a, n) => (Array.isArray(a) ? a : []).slice(0, n).map(Number).filter(Number.isFinite);
const inr = n => `₹${n.toLocaleString('en-IN')}`;
// the amounts the pitch may quote (mirrors validateNarrative): those in the offer's own wording, else the offer's amounts
const pitchAmounts = i => { const own = [...i.facts.product.matchAll(/₹\s?([\d,]+)/g)].map(m => Number(m[1].replace(/,/g, ''))); return (own.length ? own : i.facts.amounts).map(inr); };

export const TASKS = {
  // Vikram's wording for a practice encounter whose facts are already fixed by the game.
  vikram_narrative: {
    input(raw) {
      const e = raw?.encounter;
      if (!e?.facts || !e.category) return null;
      return { category: e.category, archetype: clip(e.archetype, 40), facts: { provider: clip(e.facts.provider, 120), product: clip(e.facts.product, 220), amounts: (e.facts.amounts ?? []).slice(0, 6).map(Number),
        claims: e.facts.claims ?? {}, outcome: { kind: clip(e.facts.outcome?.kind, 20) }, evidence: Object.fromEntries(Object.entries(e.facts.evidence ?? {}).filter(([k]) => ACTIONS[k]).map(([k, v]) => [k, { fact: clip(v.fact, 260), signal: clip(v.signal, 6) }])) } };
    },
    schema: { type: 'object', properties: { pitch: { type: 'string' }, scene: { type: 'string' }, reactions: { type: 'object', properties: Object.fromEntries(Object.keys(ACTIONS).map(k => [k, { type: 'string' }])) } }, required: ['pitch', 'scene', 'reactions'] },
    prompt: i => `Write Vikram's lines for a street encounter. Vikram is a friendly, persuasive man who always sounds the same whether his offer is genuine or a scam, so the player must judge from evidence, not tone.
The encounter category is "${i.category}" (secret — never say it). Facts (do not change, add or contradict any):
${JSON.stringify(i.facts)}
Write JSON:
- "pitch": 2–3 sentences in Vikram's voice offering exactly this: ${i.facts.product}. Name "${i.facts.provider}". ${pitchAmounts(i).length ? `The ONLY rupee amounts the pitch may contain: ${pitchAmounts(i).join(', ')} — no totals, maturity values or results.` : 'Do not quote any rupee amounts in the pitch.'}${i.category === 'scam' ? ' Use the pressure and claims a scammer would.' : ' Do NOT use the words guaranteed, risk-free or "no risk".'}
- "scene": where it happens, at most 12 words (e.g. "outside the college gate").
Never predict what the player will end up with${i.category === 'scam' ? ' (except as the scammer\'s false promise)' : ''}: describe the offer's terms, not a result. Use each amount only with the meaning it has in the facts above.
- "reactions": for each of ${Object.keys(i.facts.evidence).join(', ')}: one short sentence of what Vikram says when the player does that. It must fit the matching evidence fact; quote only amounts that appear in that fact, and add no new facts.`,
    validate: (d, i) => validateNarrative({ category: i.category, facts: { ...i.facts } }, d),
    maxTokens: 650, temperature: 0.9,
  },
  // Explain a practice result in plain words, using only its numbers.
  explain: {
    input(raw) {
      if (!raw?.points || !Array.isArray(raw.points)) return null;
      return { exercise: clip(raw.exercise, 30), lesson: clip(raw.lesson, 120), score: Number(raw.score), points: raw.points.slice(0, 10).map(p => ({ label: clip(p.label, 80), earned: Number(p.earned), max: Number(p.max), why: clip(p.why, 300) })),
        allowedNumbers: (raw.allowedNumbers ?? []).slice(0, 80).map(Number).filter(Number.isFinite) };
    },
    schema: { type: 'object', properties: { explanation: { type: 'string' }, misconception: { type: 'string' }, tip: { type: 'string' } }, required: ['explanation', 'tip'] },
    prompt: i => `A student just finished a practice exercise ("${i.exercise}") for the lesson "${i.lesson}" and scored ${i.score}/100. These are the scored points, already calculated by the game:
${JSON.stringify(i.points)}
The student made choices in an interactive simulation; they did NOT write any answer or explanation, so never mention one. Talk only about the decisions and results named in the points.
Write JSON: "explanation" (3–5 sentences: why the result came out this way, linking cause and effect, in a warm, honest tone), "misconception" (one sentence naming a likely misunderstanding, or "" if none is evident), "tip" (one practical sentence for next time).
Use only numbers that appear above. Do not change the score or any number.`,
    validate: validateExplain, maxTokens: 450, temperature: 0.6,
  },
  // The qualitative paragraph of the final practice-life report.
  life_feedback: {
    input(raw) {
      if (!raw?.report) return null;
      const r = raw.report;
      return { rating: clip(r.rating, 20), overall: Number(r.overall), headline: clip(r.headline, 300), categories: Object.fromEntries(Object.entries(r.categories ?? {}).slice(0, 10).map(([k, c]) => [k, { name: clip(c.name, 60), score: Number(c.score) }])),
        best: (r.best ?? []).slice(0, 5).map(b => clip(b.text, 200)), mistakes: (r.mistakes ?? []).slice(0, 5).map(m => clip(m.text, 200)), caps: (r.caps ?? []).slice(0, 2).map(c => clip(c, 200)),
        allowedNumbers: (raw.allowedNumbers ?? []).slice(0, 120).map(Number).filter(Number.isFinite) };
    },
    schema: { type: 'object', properties: { narrative: { type: 'string' }, encouragement: { type: 'string' } }, required: ['narrative', 'encouragement'] },
    prompt: i => `Write the coach's paragraph for a student's year in a financial life simulation. The game has already calculated everything:
${JSON.stringify(i)}
Rules: judge decisions, not wealth; be honest, constructive and empathetic; mention one real strength and one real problem from the lists; never mention events that are not listed; use only numbers from the input; the overall rating is "${i.rating}" — do not call it anything else.
Write JSON: "narrative" (4–6 sentences), "encouragement" (one sentence).`,
    validate: validateLifeFeedback, maxTokens: 600, temperature: 0.6,
  },
  // Rubric-based comments on a player's written reasoning (advisory; never changes a score).
  reasoning: {
    input(raw) {
      if (typeof raw?.answer !== 'string' || !Array.isArray(raw?.rubric)) return null;
      return { question: clip(raw.question, 400), answer: clip(raw.answer, 1500), rubric: raw.rubric.slice(0, 6).map(c => ({ id: clip(c.id, 30), text: clip(c.text, 200) })) };
    },
    schema: { type: 'object', properties: { criteria: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, met: { type: 'boolean' }, quote: { type: 'string' } }, required: ['id', 'met'] } }, feedback: { type: 'string' } }, required: ['criteria', 'feedback'] },
    prompt: i => `A student answered: ${JSON.stringify(i.question)}
Their answer: ${JSON.stringify(i.answer)}
Rubric criteria: ${JSON.stringify(i.rubric)}
For EVERY criterion, decide if the answer meets it. If met, "quote" must be a short phrase copied exactly from the answer that shows it; if not met, quote "". Then "feedback": 2–3 kind, specific sentences on what was strong and what was missing. Do not invent anything the student did not write.`,
    validate: validateReasoning, maxTokens: 500, temperature: 0.3,
  },
  // Round 7: the narrative of a character's FINAL life report. Every number, score, ranking and
  // achievement is already fixed by the game; the model explains them and must cite evidence ids.
  life_report: {
    input(raw) {
      const c = raw?.criteria;
      if (!c || typeof c !== 'object' || !LIFE_SECTIONS.every(k => c[k])) return null;
      const findings = f => (Array.isArray(f) ? f : []).slice(0, 5).map(x => ({ k: clip(x.k, 1), t: clip(x.t, 240), r: (x.r ?? []).slice(0, 3).map(r => clip(r, 24)) }));
      return { ending: { how: clip(raw.ending?.how, 60), age: Number(raw.ending?.age), years: Number(raw.ending?.years) }, rating: clip(raw.rating, 20), overall: Number(raw.overall),
        criteria: Object.fromEntries(LIFE_SECTIONS.map(k => [k, { name: clip(c[k].name, 60), score: c[k].score == null ? null : Number(c[k].score), findings: findings(c[k].findings) }])),
        achievements: (raw.achievements ?? []).slice(0, 12).map(a => clip(a, 40)), caps: (raw.caps ?? []).slice(0, 2).map(x => clip(x, 200)),
        refs: (raw.refs ?? []).slice(0, 80).map(r => clip(r, 24)), allowedNumbers: nums(raw.allowedNumbers, 250), allowedRupees: nums(raw.allowedRupees, 120), allowedPercents: nums(raw.allowedPercents, 120) };
    },
    schema: { type: 'object', properties: { summary: { type: 'string' },
      sections: { type: 'object', properties: Object.fromEntries(LIFE_SECTIONS.map(k => [k, { type: 'object', properties: { text: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } }, required: ['text', 'refs'] }])), required: LIFE_SECTIONS },
      improvements: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, refs: { type: 'array', items: { type: 'string' } } }, required: ['text', 'refs'] } } }, required: ['summary', 'sections', 'improvements'] },
    prompt: i => `A player's character in a financial life simulation has reached the end of their life (${i.ending.how}, age ${i.ending.age}, after ${i.ending.years} years). The game has already calculated everything below. Findings are tagged k = s (strength), w (weakness), n (note), l (limitation: not enough data); r = evidence ids.
${JSON.stringify({ rating: i.rating, overall: i.overall, criteria: i.criteria, achievements: i.achievements, caps: i.caps })}
Write the coach's end-of-life review as JSON:
- "summary": 3–5 sentences on the life as a whole. The rating is "${i.rating}" (${i.overall}/100) — never call it anything else.
- "sections": for each of ${LIFE_SECTIONS.join(', ')}: "text" (2–4 sentences explaining that criterion's findings: what happened, why it mattered, the trade-offs) and "refs" (the evidence ids from that criterion's findings that support it).
- "improvements": 1–4 concrete, realistic suggestions specific to this life, each with "refs".
Rules: judge decisions, not wealth; a low income is not a failure; be honest, warm and specific; where a finding is a limitation, say the evidence is insufficient rather than guessing; mention only events, products and numbers that appear above; do not invent any event, amount, percentage, age or achievement; do not change any score.`,
    validate: validateLifeReport, maxTokens: 1600, temperature: 0.5, numCtx: 8192, maxInput: 16000,
  },
  // Round 7: wording for one monthly newspaper issue. The market data is fixed by the simulation.
  newspaper: {
    input(raw) {
      if (!Array.isArray(raw?.assets) || !raw.assets.length) return null;
      return { month: clip(raw.month, 30), assets: raw.assets.slice(0, 10).map(a => ({ id: clip(a.id, 16), name: clip(a.name, 60), type: clip(a.type, 30), risk: clip(a.risk, 12), pct: Number(a.pct), open: Number(a.open), close: Number(a.close) })),
        housing: { pct: Number(raw.housing?.pct), phase: clip(raw.housing?.phase, 12) }, events: (raw.events ?? []).slice(0, 6).map(e => ({ asset: clip(e.asset, 16), pct: Number(e.pct), text: clip(e.text, 200) })),
        allowedNumbers: nums(raw.allowedNumbers, 120), allowedRupees: nums(raw.allowedRupees, 40), allowedPercents: nums(raw.allowedPercents, 40) };
    },
    schema: { type: 'object', properties: { headline: { type: 'string' }, lead: { type: 'string' }, assets: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } }, safety: { type: 'string' } }, required: ['headline', 'lead', 'assets', 'safety'] },
    prompt: i => `Write the ${i.month} issue of "The VanQuest Ledger", an educational newspaper inside a financial-literacy game. All assets are fictional and these are the simulation's actual results for the month (pct = % change):
${JSON.stringify({ assets: i.assets, housing: i.housing, events: i.events })}
JSON: "headline" (under 12 words), "lead" (2–3 sentences), "assets" (one entry per asset id: 1–3 sentences on what happened, a possible reason ONLY if an event above explains it, and one risk or question a player should consider before deciding), "safety" (2 sentences of general money-safety advice).
Rules: use only the numbers given; if no event is listed for an asset, say no specific event was recorded — do not invent reasons (earnings, news, concerns, demand…); never predict prices; never say what anyone should buy or sell; past performance does not guarantee future returns; plain English for teenagers.`,
    validate: validateNewspaper, maxTokens: 900, temperature: 0.6,
  },
};

export async function runTask(llm, name, raw) {
  const task = TASKS[name];
  if (!task) return { ok: false, reason: 'unknown_task' };
  const input = task.input(raw);
  if (!input) return { ok: false, reason: 'bad_input' };
  return llm.json({ system: SYSTEM, user: task.prompt(input), schema: task.schema, validate: d => task.validate(d, input), maxTokens: task.maxTokens, temperature: task.temperature, numCtx: task.numCtx, seed: Number.isInteger(raw.seed) ? raw.seed : undefined });
}
