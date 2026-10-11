// Untranslated-string audit (Round 9). Renders every screen of the game in Telugu, in Node, on real game
// states: a scripted life (shopping, banking, trading, property, college, encounters, the academy and its
// Practice Lab, the newspaper, retirement and death), with a seeded "monkey" pressing the buttons of each
// screen. Every text segment and title/aria-label/placeholder/alt that has no Telugu translation is listed.
//   node tools/i18n_audit.mjs                 → summary + missing templates (exit 1 if any are missing)
//   node tools/i18n_audit.mjs --json out.json → also write { template: example } for translators
// Text that is intentionally English (names of places, assets and vehicles, tickers, the model's name,
// player-written text) never counts: those are entities or marked translate="no" (see README, Round 9).
import { writeFileSync } from 'node:fs';
import { setLang, setAuditing, missing, localizeHtml, tr, setDynamicNames } from '../src/i18n/i18n.js';

// ------------------------------------------------------------------ a tiny browser stand-in
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() }; };
globalThis.localStorage = mem();
const fakeEl = () => new Proxy({ style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, children: [] }, {
  get: (o, k) => (k in o ? o[k] : typeof k === 'string' && /^(querySelector|closest)$/.test(k) ? () => fakeEl() : k === 'querySelectorAll' ? () => [] : typeof k === 'string' && /^(add|remove)EventListener|append|prepend|focus|blur|remove|scrollTo$/.test(k) ? () => {} : undefined),
  set: (o, k, v) => { o[k] = v; return true; },
});
globalThis.document = { createElement: () => fakeEl(), getElementById: () => fakeEl(), querySelector: () => null, querySelectorAll: () => [], documentElement: {}, addEventListener() {} };
globalThis.window = globalThis; globalThis.addEventListener = () => {};
globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ ok: false, reason: 'unavailable' }) });
globalThis.confirm = () => true; globalThis.alert = () => {};

const { Game } = await import('../src/sim/game.js');
const { ITEMS, SHOPS } = await import('../src/data/catalog.js');
const { HOMES } = await import('../src/data/homes.js');
const { COURSES } = await import('../src/data/courses.js');
const { startEncounter } = await import('../src/sim/encounters.js');
const { finalizeLife } = await import('../src/sim/lifeEnd.js');
const { ENCOUNTERS } = await import('../src/data/encounters.js');
const P = {
  ...(await import('../src/ui/shopPanel.js')), ...(await import('../src/ui/tradingPanel.js')), ...(await import('../src/ui/academyPanel.js')),
  ...(await import('../src/ui/collegePanel.js')), ...(await import('../src/ui/infoPanels.js')), ...(await import('../src/ui/encounterPanel.js')),
  ...(await import('../src/ui/computerPanel.js')), ...(await import('../src/ui/dealershipPanel.js')), ...(await import('../src/ui/propertyPanel.js')),
  ...(await import('../src/ui/lifePanels.js')), ...(await import('../src/ui/journeyPanels.js')), ...(await import('../src/ui/reportPanels.js')),
  ...(await import('../src/ui/bankPanel.js')), ...(await import('../src/ui/financePanel.js')), ...(await import('../src/ui/titlePanel.js')),
};
const { Hud } = await import('../src/ui/hud.js');

setLang('te'); setAuditing(true);
let rnd = 12345;
const rand = n => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd % n; };

const notes = [];
const game = new Game(localStorage);
game.on((_, n) => notes.push(...n));
const routerStub = new Proxy({}, { get: () => () => {} });
const show = html => localizeHtml(html);
function view(p) {
  setDynamicNames([game.state.character?.name]);
  if (p.frame) return show(p.frame());
  return show(`<h2>${p.title ?? ''}</h2><div>${p.sub ?? ''}</div>${p.headExtra?.() ?? ''}${p.render?.() ?? ''}${p.footer?.() ?? ''}`);
}
const attrs = tag => Object.fromEntries([...tag.matchAll(/\sdata-([\w-]+)="([^"]*)"/g)].map(m => [m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()), m[2]]));
const NEVER = new Set(['close', 'exit', 'reset']);
// press up to `steps` random buttons / fill random inputs
function monkey(p, steps) {
  for (let i = 0; i < steps; i++) {
    let html;
    try { html = view(p); } catch (e) { console.warn(`render failed in ${p.constructor.name}: ${e.message}`); return; }
    const acts = [...html.matchAll(/<[a-z]+[^>]*\sdata-a="([^"]+)"[^>]*>/g)].filter(m => !NEVER.has(m[1]) && !/\sdisabled/.test(m[0]));
    const ins = [...html.matchAll(/<(?:input|textarea|select)[^>]*\sdata-in="([^"]+)"[^>]*>/g)];
    if (ins.length && rand(4) === 0) {
      const m = ins[rand(ins.length)], d = attrs(m[0]);
      const type = /type="(number|range)"/.test(m[0]) ? 'n' : /type="checkbox"/.test(m[0]) ? 'c' : 't';
      try { p.onInput?.({ dataset: d, value: type === 'n' ? String([1, 5, 100, 5000, 250000][rand(5)]) : 'A short answer about saving money and risk.', checked: !!rand(2), type }); } catch { /* invalid input is fine */ }
      continue;
    }
    if (!acts.length) return;
    const m = acts[rand(acts.length)];
    try { p.onAction?.(m[1], { dataset: attrs(m[0]), disabled: false, closest: () => null, value: '' }, {}); } catch { /* some actions need a live DOM */ }
  }
}
const feed = () => game.act(s => { for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'grocery') s.pantry[id] = Math.max(s.pantry[id] ?? 0, 400); });
const fund = (a, account = 'wallet') => game.act(s => { s.ledger.push({ id: s.nextId++, day: s.day, account, amount: a, category: 'test', memo: 'test funds', status: 'ok' }); });

const panels = () => [
  ...Object.keys(SHOPS).map(id => () => new P.ShopPanel(game, id)),
  () => new P.ShopPanel(game, 'market_grocery', { tab: 'plan' }),
  () => new P.TradingPanel(game), () => new P.BankPanel(game), () => new P.BankPanel(game, { tab: 'loans' }), () => new P.PropertyPanel(game), () => new P.PropertyPanel(game, { tab: 'mine' }),
  () => new P.DealershipPanel(game), () => new P.CollegePanel(game), () => new P.FinancePanel(game), () => new P.InventoryPanel(game), () => new P.HistoryPanel(game),
  () => new P.WardrobePanel(game), () => new P.PantryPanel(game), () => new P.YearSkipPanel(game, () => {}), () => new P.LifePanel(game, routerStub), () => new P.RetirePanel(game, {}),
  () => new P.NewspaperPanel(game), () => new P.ComputerPanel(game, HOMES.home_apartment.computer, HOMES.home_apartment, {}), () => new P.CharacterPanel(game, {}),
  () => new P.IntroPanel(game, { first: true }), () => new P.GoalsQuizPanel(game, {}), () => new P.TitlePanel(game, {}), () => new P.AcademyPanel(game, null),
];

const hud = new Hud(game, { onChange() {} }, routerStub);
const hudView = () => { hud.render(); show(hud.bar.innerHTML); show(hud.side.innerHTML); };

// ------------------------------------------------------------------ a scripted life
fund(30000000); feed();
for (let round = 0; round < 14; round++) {
  for (const make of panels()) monkey(make(), round < 2 ? 60 : 25);
  // an encounter now and then
  game.act(s => { const r = startEncounter(s, ENCOUNTERS[round % ENCOUNTERS.length].id); return r; });
  const enc = game.state.encounters.log.at(-1);
  if (enc && enc.status === 'active') monkey(new P.EncounterPanel(game, enc.uid), 20);
  hudView();
  feed(); game.advance([3, 31, 95, 200, 400][round % 5]);
  for (const n of notes.splice(0)) tr(n.text);
}
// the academy, every page of every course, with answer guides shown
for (const c of COURSES) {
  const p = new P.AcademyPanel(game, null);
  p.onAction('open', { dataset: { id: c.id } });
  const n = p.pages().length;
  for (let pg = 0; pg < n; pg++) { p.course = c.id; p.view = null; p.page = pg; p.reveal[pg] = true; view(p); monkey(p, 6); }
}
// the end of a life: retirement and death reports (and the final report panel's tabs)
for (const kind of ['retired_manual', 'death']) {
  const g = new Game(localStorage);
  g.act(s => finalizeLife(s, kind));
  const rep = g.state.life?.final;
  if (rep) { const p = new P.FinalReportPanel(g, rep, {}); monkey(p, 40); }
  hudView();
  for (const n of notes.splice(0)) tr(n.text);
}
game.act(s => finalizeLife(s, 'retired_age'));
if (game.state.life?.final) monkey(new P.FinalReportPanel(game, game.state.life.final, {}), 60);
hudView();
for (const e of game.state.feed) tr(e.text);
for (const e of game.state.ledger) tr(e.memo);

const out = Object.fromEntries([...missing.entries()].sort());
console.log(`untranslated templates: ${missing.size}`);
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
else for (const [k] of Object.entries(out).slice(0, 80)) console.log('  ' + k);
process.exitCode = missing.size ? 1 : 0;
