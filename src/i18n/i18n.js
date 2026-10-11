// VanQuest localisation (Round 9): English (default) and Telugu.
//
// The game's screens are built as HTML strings in English, and the simulation writes its records (feed,
// ledger memos, reports, newspaper facts) in English into the save. Instead of rewriting thousands of
// strings, translation happens once, at display time:
//   • localizeHtml(html) translates every text segment and the title / aria-label / placeholder / alt
//     attributes of a rendered screen. Anything inside translate="no" (and every <textarea>) is left alone —
//     that is how player-written text and "show the original English" work.
//   • tr(text) translates one plain string (toasts, confirm dialogs, canvas labels).
// A segment is looked up exactly first; otherwise it is turned into a template: proper nouns and data
// names (places, items, assets, jobs…), dates and numbers / ₹ amounts / percentages are replaced by {0},
// {1}… and the template is looked up (e.g. "Bought {0} ({1} + {2} stamp duty)"). Names are translated
// through the entity table, dates get Telugu month names, numbers are kept exactly as they are — so the
// same event shows the same figures in both languages, and the simulation never sees the language.
// The catalogue lives in src/i18n/te/ ; tools/i18n_audit.mjs lists every segment that has no translation.
import { TE } from './te/index.js';

export const LANGS = { en: 'English', te: 'తెలుగు' };
export const PREF_KEY = 'vanquest.lang.v1';          // { v: 1, lang } — the device's last explicit choice
const PREF_VERSION = 1;

let lang = 'en';
const subs = new Set();
export const getLang = () => lang;
export const onLangChange = fn => { subs.add(fn); return () => subs.delete(fn); };

export function setLang(l) {
  if (!LANGS[l] || l === lang) return LANGS[l] ? true : false;
  lang = l; memo.clear();
  if (globalThis.document) document.documentElement.lang = l;
  for (const fn of [...subs]) fn(l);
  return true;
}

const store = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
export function readPref(storage = store()) {
  try {
    const p = JSON.parse(storage?.getItem(PREF_KEY) ?? 'null');
    return p && p.v === PREF_VERSION && LANGS[p.lang] ? p.lang : null;
  } catch { return null; }
}
export function writePref(l, storage = store()) {
  if (!LANGS[l]) return false;
  try { storage?.setItem(PREF_KEY, JSON.stringify({ v: PREF_VERSION, lang: l })); return true; } catch { return false; }
}

// ------------------------------------------------------------------ entities (names inside sentences)
let dynamicNames = [];                                  // the player's own names: never translated
export function setDynamicNames(names) { const n = [...new Set(names.filter(x => typeof x === 'string' && x.trim().length > 1))]; if (n.join('\u0001') !== dynamicNames.join('\u0001')) { dynamicNames = n; entityRe = null; memo.clear(); } }
let entityRe = null;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function entityPattern() {
  if (entityRe) return entityRe;
  const names = [...new Set([...Object.keys(TE.entities), ...dynamicNames])].sort((a, b) => b.length - a.length);
  entityRe = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(reEsc).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
  return entityRe;
}

// ------------------------------------------------------------------ dates and numbers
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TE_MONTH = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జులై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
const DAYS = { Sun: 'ఆది', Mon: 'సోమ', Tue: 'మంగళ', Wed: 'బుధ', Thu: 'గురు', Fri: 'శుక్ర', Sat: 'శని' };
const monthIndex = m => { const i = MONTH.indexOf(m); if (i >= 0) return i; const j = MON.indexOf(m); return j < 0 ? -1 : j > 8 ? j - 1 : j; };
const DATE = new RegExp(`(?:\\b(?:${Object.keys(DAYS).join('|')}),\\s)?\\b\\d{1,2}\\s(?:${[...MONTH, ...MON].join('|')})\\b(?:,?\\s\\d{4})?|\\b(?:${MONTH.join('|')})\\s\\d{4}\\b|\\b\\d{4}-\\d{2}-\\d{2}\\b`, 'g');
function teDate(d) {
  let m;
  if ((m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${+m[3]} ${TE_MONTH[+m[2] - 1]} ${m[1]}`;
  if ((m = d.match(/^(\p{L}+)\s(\d{4})$/u))) return `${TE_MONTH[monthIndex(m[1])]} ${m[2]}`;
  m = d.match(/^(?:(\w{3}),\s)?(\d{1,2})\s(\p{L}+),?(?:\s(\d{4}))?$/u);
  if (!m) return d;
  return `${m[1] ? `${DAYS[m[1]]}, ` : ''}${m[2]} ${TE_MONTH[monthIndex(m[3])]}${m[4] ? ` ${m[4]}` : ''}`;
}
const NUM = /(?:[−-]\s?)?₹\s?\d[\d,]*(?:\.\d+)?|(?<![\p{L}\p{N}.,])[−-]?\d[\d,]*(?:\.\d+)?(?:%|st|nd|rd|th)?(?![\p{L}\p{N}])/gu;
const teNum = n => { const m = n.match(/^(\d+)(?:st|nd|rd|th)$/); return m ? `${m[1]}వ` : n; };

// ------------------------------------------------------------------ the lookup
const memo = new Map();
export const missing = new Map();                       // template → an example (filled while auditing)
export let auditing = false;
export const setAuditing = on => { auditing = on; if (on) missing.clear(); memo.clear(); };

// Split a segment into its template and the values taken out of it.
export function templateOf(text) {
  const vals = [];
  // markers are private-use characters (no digits or letters), so later passes can't match inside them
  const take = kind => x => { vals.push({ kind, x }); return `\uE000${String.fromCharCode(0xE100 + vals.length - 1)}\uE001`; };
  let s = text;
  const ent = entityPattern();
  if (ent) s = s.replace(ent, take('e'));
  s = s.replace(DATE, take('d')).replace(NUM, take('n'));
  // renumber in reading order so the key is stable: {0}, {1}…
  const order = [];
  const key = s.replace(/\uE000(.)\uE001/gu, (_, c) => `{${order.push(vals[c.charCodeAt(0) - 0xE100]) - 1}}`);
  return { key, vals: order };
}

const fill = (te, vals) => te.replace(/\{(\d+)\}/g, (_, i) => {
  const v = vals[+i]; if (!v) return '';
  return v.kind === 'e' ? (TE.entities[v.x] ?? v.x) : v.kind === 'd' ? teDate(v.x) : teNum(v.x);
});

function lookupOne(core, record) {
  const exact = TE.exact[core] ?? TE.ui[core];
  if (exact != null) return exact;
  if (TE.entities[core] != null) return TE.entities[core];
  const { key, vals } = templateOf(core);
  if (!/\p{L}/u.test(key.replace(/\{\d+\}/g, ''))) return fill(key, vals);   // only names / numbers / punctuation
  const t = TE.ui[key];
  if (t != null) return fill(t, vals);
  if (record && auditing && /[A-Za-z]{2}/.test(key.replace(/\{\d+\}/g, ''))) missing.set(key, core);
  return null;
}
// A paragraph built from several generated sentences (e.g. a newspaper lead) is matched sentence by
// sentence when it has no entry of its own. Sentences without a translation stay in English and are
// reported by the audit.
const SENTENCE = /(?<=[.!?])\s+(?=["“(]?[A-Z0-9₹])/;
function lookup(core) {
  const whole = lookupOne(core, false);
  if (whole != null) return whole;
  const parts = core.split(SENTENCE);
  if (parts.length < 2) return lookupOne(core, true);
  const out = parts.map(p => lookupOne(p, true));
  return out.some(x => x != null) ? out.map((x, i) => x ?? parts[i]).join(' ') : null;
}

// Translate one plain string (keeps leading / trailing whitespace).
export function tr(text) {
  if (lang === 'en' || text == null) return text;
  const s = String(text);
  if (!/[A-Za-z]/.test(s) || /[\u0C00-\u0C7F]/.test(s)) return s;     // nothing to do, or already Telugu
  if (memo.has(s)) return memo.get(s);
  const lead = s.match(/^\s*/)[0], trail = s.slice(lead.length).match(/\s*$/)[0];
  const core = s.slice(lead.length, s.length - trail.length).replace(/\s+/g, ' ');
  const out = lookup(core);
  const res = out == null ? s : lead + out + trail;
  if (memo.size > 20000) memo.clear();
  memo.set(s, res);
  return res;
}
// Same, with {name} parameters substituted after translation (for code-side sentences).
export const t = (text, params = {}) => tr(text).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));

// ------------------------------------------------------------------ rendered HTML
const unesc = s => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }[e]));
const escText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escText(s).replace(/"/g, '&quot;');
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['textarea', 'script', 'style', 'code']);
const ATTRS = /\s(title|aria-label|placeholder|alt)="([^"]*)"/g;

export function localizeHtml(html) {
  if (lang === 'en' || !html) return html;
  const out = [], stack = [];
  let skipAt = -1;
  for (const m of String(html).matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g)) {
    const tok = m[0];
    if (tok[0] !== '<' || tok === '<') { out.push(skipAt >= 0 ? tok : translateText(tok)); continue; }
    if (tok.startsWith('<!--')) { out.push(tok); continue; }
    const close = tok[1] === '/', name = tok.match(/^<\/?([a-zA-Z][\w-]*)/)[1].toLowerCase();
    if (close) {
      const i = stack.lastIndexOf(name);
      if (i >= 0) stack.length = i;
      if (skipAt > stack.length) skipAt = -1;               // the translate="no" element itself was closed
      out.push(tok); continue;
    }
    const selfClose = VOID.has(name) || /\/>$/.test(tok);
    out.push(skipAt >= 0 ? tok : tok.replace(ATTRS, (_, a, v) => ` ${a}="${escAttr(tr(unesc(v)))}"`));
    if (!selfClose) {
      stack.push(name);
      if (skipAt < 0 && (SKIP.has(name) || /\stranslate="no"/.test(tok))) skipAt = stack.length;
    }
  }
  return out.join('');
}
function translateText(chunk) {
  if (!/[A-Za-z]/.test(chunk)) return chunk;
  const r = tr(unesc(chunk));
  return escText(r);
}
