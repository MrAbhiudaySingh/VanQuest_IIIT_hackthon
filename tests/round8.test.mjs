// Round 8: the supplied main-screen navigation, Summit trading desk and property-agent designs (presentation
// only — same numbers, same rules, no state changes on opening), and the academy course-cover manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { newGame } from '../src/sim/state.js';
import { advanceDays } from '../src/sim/clock.js';
import { price, portfolio } from '../src/sim/market.js';
import { transfer } from '../src/sim/ledger.js';
import { buyCost, marketRent } from '../src/sim/property.js';
import { inr, nextMonthStart, fmtDate } from '../src/sim/util.js';
import { ASSETS } from '../src/data/market.js';
import { PROPERTIES, PROPERTY_RULES } from '../src/data/properties.js';
import { COURSES } from '../src/data/courses.js';
import { COURSE_COVERS, ACADEMY_IMAGE_DIR, coverFor } from '../src/data/academyImages.js';
import { ACTIVATION_ENABLED } from '../src/ai/proposals.js';
import { TradingPanel } from '../src/ui/tradingPanel.js';
import { PropertyPanel } from '../src/ui/propertyPanel.js';
import { ITEMS } from '../src/data/catalog.js';

const ROOT = new URL('../', import.meta.url);
const stock = s => { for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'grocery') s.pantry[id] = Math.ceil(20000 * it.usePerDay) + 1; return s; };
const give = (s, amount) => { s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount, category: 'test', memo: 'test funds', status: 'ok' }); return s; };
const fakeGame = state => ({ state });
// JPEG size from the first start-of-frame marker
function jpegInfo(buf) {
  for (let i = 2; i < buf.length;) {
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xC2) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    i += 2 + len;
  }
  return null;
}

// ------------------------------------------------------------------ academy covers
test('academy manifest: every supplied image exists, matches its recorded size, and covers exactly one course', () => {
  const supplied = ['planning and budgeting.jpeg', 'saveing and manageing money.jpeg', 'understanding investing.jpeg', 'finantial safty and consumer protection.jpeg'];
  assert.deepEqual(Object.values(COURSE_COVERS).map(c => c.file).sort(), [...supplied].sort(), 'all four supplied files, original names, each used once');
  for (const [id, c] of Object.entries(COURSE_COVERS)) {
    const f = new URL(ACADEMY_IMAGE_DIR + c.file, ROOT);
    assert.ok(existsSync(f), `${c.file} exists`);
    const info = jpegInfo(readFileSync(f));
    assert.deepEqual([info.width, info.height, info.components], [c.width, c.height, 3], `${c.file}: recorded size, RGB (no transparency)`);
    assert.ok(COURSES.some(x => x.id === id), `${id} is a course`);
    assert.ok(c.alt.length > 60 && /Core Course 0\d/.test(c.alt), 'descriptive alt text');
  }
  // the filename names the course; the cover goes on that course's overview lesson only
  const want = { core01: /planning/i, core02: /sav/i, core03: /invest/i, core04: /safty|safety/i };
  for (const c of COURSES) {
    assert.match(COURSE_COVERS[c.id].file, want[c.id]);
    assert.match(c.lessons[0].title, /^Course overview$/i);
    assert.ok(coverFor(c.id, 0), `${c.id} overview has its cover`);
    for (let i = 1; i < c.lessons.length; i++) assert.equal(coverFor(c.id, i), null, 'no cover on other lessons');
  }
  assert.equal(coverFor('nope', 0), null);
  assert.equal(coverFor('core01', 0).src, 'Assets/supplied-ui/round8/Imgs%20for%20finintial%20acadamy/planning%20and%20budgeting.jpeg');
});

// ------------------------------------------------------------------ Summit desk
test('Summit desk: shows the authoritative prices, KPIs and date; rendering every tab changes nothing', () => {
  const s = give(stock(newGame()), 50000);
  advanceDays(s, 45);
  transfer(s, 'wallet', 'brokerage', 20000, 'test');
  const before = JSON.stringify(s);
  const p = new TradingPanel(fakeGame(s));
  const html = [];
  for (const t of ['market', 'portfolio', 'history', 'learn']) { p.tab = t; html.push(p.frame()); }
  assert.equal(JSON.stringify(s), before, 'opening the desk never mutates the save or the clock');
  const market = html[0];
  for (const id of Object.keys(ASSETS)) assert.ok(market.includes(`data-id="${id}"`) && market.includes(inr(price(s, id))), `${id} at the simulated price`);
  const pf = portfolio(s);
  assert.match(market, new RegExp(`data-testid="kpi-cash">${inr(pf.cash)}<`));
  assert.match(market, new RegExp(`data-testid="kpi-total">${inr(pf.total)}<`));
  assert.ok(market.includes(`Prices as of ${fmtDate(s.day)}`));
  assert.ok(market.includes(`data-issue="${s.newspaper.issues.at(-1).id}"`), 'the bulletin shows the latest issue of the same world');
  assert.match(new TradingPanel(fakeGame(stock(newGame()))).frame(), /No market newspaper yet/);
  assert.equal(ACTIVATION_ENABLED, false);
  assert.match(market, /Proposed changes: none in force/, 'proposals are never presented as active');
  assert.doesNotMatch(market.replace(/<svg[\s\S]*?<\/svg>/g, ''), /https?:\/\//, 'no external links or data sources');
  // the same frame twice → identical (no randomness, no "live" ticking)
  p.tab = 'market';
  assert.equal(p.frame(), market);
});

test('Summit desk: the bulletin repeats the latest newspaper issue and labels AI wording only when it was stored', () => {
  const s = give(stock(newGame()), 1000);
  advanceDays(s, nextMonthStart(s.day) - s.day);                 // the 1st: an issue is published
  const issue = s.newspaper.issues.at(-1);
  const p = new TradingPanel(fakeGame(s));
  assert.ok(p.frame().includes(`data-issue="${issue.id}"`));
  assert.match(p.frame(), /SIMULATION DATA/);
  issue.aiStatus = 'done'; issue.ai = { headline: 'Scripted checked headline', lead: 'Scripted lead.', assets: [], safety: '' };
  assert.match(p.frame(), /AI WORDING · CHECKED/);
  assert.match(p.frame(), /Scripted checked headline/);
  issue.aiStatus = 'failed'; issue.ai = null;
  assert.doesNotMatch(p.frame(), /AI WORDING/);
});

test('historical desk prices stay fixed as days pass', () => {
  const s = stock(newGame());
  advanceDays(s, 20);
  const then = Object.fromEntries(Object.keys(ASSETS).map(id => [id, price(s, id, 15)]));
  advanceDays(s, 90);
  for (const id of Object.keys(ASSETS)) assert.equal(price(s, id, 15), then[id]);
});

// ------------------------------------------------------------------ property agent
test('property agent: every row shows the live asking price, estimate and rent; filters, sorting and tabs change nothing', () => {
  const s = give(stock(newGame()), 100000);
  advanceDays(s, 400);
  const before = JSON.stringify(s);
  const p = new PropertyPanel(fakeGame(s));
  const all = p.frame();
  for (const id of Object.keys(PROPERTIES)) {
    const c = buyCost(id, s.day);
    assert.ok(all.includes(`data-property="${id}"`), id);
    assert.ok(all.includes(inr(c.price)) && all.includes(inr(c.value)) && all.includes(`${inr(marketRent(id, s.day))}/mo`), `${id}: game figures`);
  }
  assert.doesNotMatch(all, /6,42,000|13,98,000|19,81,000|33,04,000|56,67,000/, 'no mock-up prices from the design');
  assert.doesNotMatch(all, /unsplash|https?:\/\/(?!www\.w3\.org)/, 'no external images');
  p.onAction('cat', { dataset: { t: 'premium' } });
  const prem = [...p.frame().matchAll(/data-property="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(prem.sort(), Object.entries(PROPERTIES).filter(([, x]) => x.hood === 'premium').map(([id]) => id).sort());
  p.onAction('cat', { dataset: { t: 'all' } });
  p.onInput({ dataset: { in: 'sort' }, value: 'price-asc' });
  const order = [...p.frame().matchAll(/data-property="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(order, Object.keys(PROPERTIES).sort((a, b) => buyCost(a, s.day).price - buyCost(b, s.day).price));
  p.onInput({ dataset: { in: 'sort' }, value: 'area' });               // not a supported sort: ignored
  assert.equal(p.sort, 'price-asc');
  for (const t of ['mine', 'reports', 'rules']) { p.onAction('tab', { dataset: { t } }); p.frame(); }
  assert.equal(JSON.stringify(s), before, 'browsing the agent never mutates the save');
  assert.match(p.frame(), new RegExp(`${PROPERTY_RULES.stampDuty * 100}% stamp duty`), 'rules text still comes from the data');
});

// ------------------------------------------------------------------ main-screen navigation
test('HUD navigation keeps every action and the supplied button classes', () => {
  const src = readFileSync(new URL('src/ui/hud.js', ROOT), 'utf8');
  const actions = [...src.matchAll(/class="navbtn[^"]*" data-a="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(actions, ['day', 'month', 'year', 'inv', 'pantry', 'wardrobe', 'fin', 'hist', 'life', 'news', 'retire', 'reset']);
  for (const cls of ['time', 'skip', 'inventory', 'pantry', 'wardrobe', 'finance', 'history', 'retirement', 'reset']) assert.match(src, new RegExp(`class="navbtn ${cls}"`));
  const nav = readFileSync(new URL('src/ui/skins/nav.css', ROOT), 'utf8');
  assert.doesNotMatch(nav, /@import|googleapis/, 'fonts are local');
  assert.match(nav, /\.vq-nav \.navbtn\.skip/);
});

test('no external network sources in the new screens', () => {
  for (const f of ['src/ui/hud.js', 'src/ui/tradingPanel.js', 'src/ui/propertyPanel.js', 'src/data/academyImages.js', 'src/ui/skins/nav.css', 'src/ui/skins/desk.css', 'src/ui/skins/agent.css']) {
    const t = readFileSync(new URL(f, ROOT), 'utf8').replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
    assert.doesNotMatch(t, /https?:\/\/|fetch\(/, f);
  }
});
