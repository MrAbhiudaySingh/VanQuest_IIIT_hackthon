// Round 7: what the local model is shown for the final life report and the newspaper — compact,
// already-calculated facts with their evidence ids — and the deterministic text used whenever the model
// is unavailable or its answer fails validation (src/ai/validate.js). The model only ever adds wording.
import { numbersIn } from './client.js';
import { LIFE_SECTIONS, factUnits } from './validate.js';
import { issueFacts } from '../sim/newspaper.js';

const K = { strength: 's', weakness: 'w', note: 'n', limitation: 'l' };
const clip = (s, n) => String(s ?? '').slice(0, n);

export function lifeFacts(report) {
  const criteria = Object.fromEntries(LIFE_SECTIONS.map(k => {
    const c = report.criteria[k];
    return [k, { name: c.name, score: c.score, findings: c.findings.slice(0, 5).map(f => ({ k: K[f.kind], t: clip(f.text, 230), r: f.refs.slice(0, 3) })) }];
  }));
  const input = { ending: { how: report.ending.label, age: report.ending.age, years: report.years }, rating: report.rating, overall: report.overall,
    criteria, achievements: (report.achievements?.unlocked ?? []).slice(0, 12).map(a => a.name), caps: report.caps.map(c => clip(c, 200)) };
  input.refs = [...new Set(LIFE_SECTIONS.flatMap(k => criteria[k].findings.flatMap(f => f.r)))];
  input.allowedNumbers = numbersIn(input);
  Object.assign(input, factUnits(JSON.stringify(input.criteria) + JSON.stringify(input.caps)));
  return input;
}

// The report's text without the model: every sentence is a finding the game calculated.
export function fallbackLife(report) {
  const pick = c => c.findings.filter(f => f.kind !== 'limitation').slice(0, 3);
  const sections = Object.fromEntries(LIFE_SECTIONS.map(k => {
    const c = report.criteria[k], fs = pick(c);
    return [k, { text: fs.length ? fs.map(f => f.text).join(' ') : c.findings[0]?.text ?? 'Not enough history to judge.', refs: [...new Set(fs.flatMap(f => f.refs))].slice(0, 6) }];
  }));
  const strong = report.improvements.strengths.map(s => s.name.toLowerCase());
  const summary = `${report.ending.label} at ${report.ending.age} after ${report.years} years in VanQuest. Overall rating: ${report.rating} (${report.overall}/100).`
    + (strong.length ? ` Strongest areas: ${strong.join(', ')}.` : '') + (report.improvements.focus.length ? ` Most room to grow: ${report.improvements.focus.map(f => f.name.toLowerCase()).join(', ')}.` : '');
  return { summary, sections, improvements: report.improvements.focus.map(f => ({ text: f.advice, refs: f.refs })) };
}

export function newsInput(issue) {
  const facts = issueFacts(issue);
  return { ...facts, allowedNumbers: numbersIn(facts), allowedPercents: [...facts.assets.map(a => Math.abs(a.pct)), Math.abs(facts.housing.pct), ...facts.events.map(e => Math.abs(e.pct))],
    allowedRupees: facts.assets.flatMap(a => [a.open, a.close]) };
}
