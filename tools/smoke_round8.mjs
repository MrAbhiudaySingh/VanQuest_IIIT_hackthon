// End-to-end test of Round 8 in headless Chromium: the supplied main-screen navigation (every button, its
// hitbox, keyboard use, disabled state after a life ends, several viewport sizes), the Summit trading desk
// (authoritative prices, no state change on opening, the newspaper bulletin with the model offline, no
// external requests, one trade per confirmation), the property agent (live data, filters, rent / buy /
// move / let / stop letting / sell, dismissal and reopening, no duplicate transactions), and the academy
// course covers (right lesson, real files, missing-file fallback, narrow screens).
import { chromium } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { serve } from './e2e_server.mjs';

const { server, url, base } = serve();                       // the model is offline in this suite
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [], requests = [], broken = [];
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/GL|WebGL/.test(m.text()))) problems.push(m.text()); });
page.on('pageerror', e => problems.push(e.message));
page.on('dialog', d => d.dismiss());                         // the reset button's confirm(): keep this character
page.on('request', r => requests.push(r.url()));
page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/')) broken.push(`${r.status()} ${r.url()}`); });

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try { await fn(); } catch (e) { const shot = join(tmpdir(), 'vanquest-round8-failure.png'); await page.screenshot({ path: shot }).catch(() => {}); console.log(`FAILED (screenshot: ${shot})`); throw e; }
  console.log('ok');
};
const G = (fn, arg) => page.evaluate(fn, arg);
const ready = () => page.waitForFunction(() => window.game?.scene?.getScene('City')?.traffic && window.vq, null, { timeout: 15000 });
const boot = async () => { await ready(); await G(() => { vq.settings.passiveTime = false; vq.settings.randomEncounters = false; }); await page.waitForTimeout(250); };
const closeUi = () => page.keyboard.press('Escape');
const panel = () => G(() => vq.ui.panel?.constructor.name ?? null);
const snapshot = () => G(() => JSON.stringify(vq.game.state));
const feed = () => G(() => vq.game.act(s => { for (const id of ['rice_5kg', 'atta_5kg', 'dal_1kg', 'oil_1l', 'milk_1l', 'veg_1kg']) s.pantry[id] = 3000; }));
const fund = a => G(x => vq.game.act(s => { s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: x, category: 'test', memo: 'test funds', status: 'ok' }); }), a);
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const NAV = [['day', null], ['month', null], ['year', 'YearSkipPanel'], ['inv', 'InventoryPanel'], ['pantry', 'PantryPanel'], ['wardrobe', 'WardrobePanel'],
  ['fin', 'FinancePanel'], ['hist', 'HistoryPanel'], ['life', 'LifePanel'], ['news', 'NewspaperPanel'], ['retire', 'RetirePanel'], ['reset', null]];

try {
  await page.goto(url);
  await G(() => localStorage.clear());
  await page.reload(); await boot(); await feed();

  await step('main screen: the supplied buttons render with their styles, in order, with matching hitboxes', async () => {
    const btns = await G(() => [...document.querySelectorAll('.topbar.vq-nav .navglass .navbtn')].map(b => {
      const r = b.getBoundingClientRect(), cs = getComputedStyle(b), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { a: b.dataset.a, cls: b.className, font: cs.fontFamily, bg: cs.backgroundColor, w: r.width, h: r.height, hit: b.contains(hit), inView: r.right <= innerWidth && r.bottom <= innerHeight && r.x >= 0 };
    }));
    assert.deepEqual(btns.map(b => b.a), NAV.map(n => n[0]));
    for (const b of btns) {
      assert.match(b.font, /Press Start 2P/, `${b.a}: the design's pixel font`);
      assert.ok(b.hit, `${b.a}: clicking the middle of the visible button hits the button`);
      assert.ok(b.inView && b.w > 30 && b.h >= 40, `${b.a}: visible and fully on screen`);
    }
    assert.equal(btns.find(b => b.a === 'year').bg, 'rgba(184, 50, 50, 0.82)', 'SKIP 1 YEAR in the supplied red');
    assert.equal(btns.find(b => b.a === 'retire').bg, 'rgba(57, 102, 91, 0.86)', 'RETIREMENT in the supplied green');
    const glass = await G(() => getComputedStyle(document.querySelector('.vq-nav .navglass')).backdropFilter);
    assert.match(glass, /blur/);
  });

  await step('main screen: every button keeps its original action (and Retirement opens the existing confirmation)', async () => {
    const d0 = await G(() => vq.game.state.day);
    await page.click('.topbar [data-a="day"]');
    assert.equal(await G(() => vq.game.state.day), d0 + 1);
    await page.click('.topbar [data-a="month"]');
    assert.equal(await G(async () => (await import('./src/sim/util.js')).isMonthStart(vq.game.state.day)), true, 'skipped to the 1st');
    await feed();
    for (const [a, want] of NAV.filter(n => n[1])) {
      await page.click(`.topbar [data-a="${a}"]`);
      assert.equal(await panel(), want, a);
      if (a === 'year') assert.equal(await G(() => vq.game.state.day) > 0, true);
      await closeUi();
      assert.equal(await panel(), null);
    }
    const day = await G(() => vq.game.state.day);
    await page.click('.topbar [data-a="reset"]');                       // confirm() dismissed → nothing happens
    assert.equal(await G(() => vq.game.state.day), day);
    assert.equal(await G(() => vq.game.state.status), 'alive');
  });

  await step('main screen: keyboard — shortcuts (incl. R) and Tab/Enter on the buttons; focus is visible', async () => {
    await page.keyboard.press('KeyR');
    assert.equal(await panel(), 'RetirePanel');
    await page.click('[data-testid=retire-cancel]');
    assert.equal(await G(() => vq.game.state.status), 'alive', 'cancelling keeps playing');
    await page.focus('.topbar [data-a="year"]');
    await page.keyboard.press('Tab');                                    // keyboard focus → :focus-visible
    assert.equal(await G(() => document.activeElement.dataset.a), 'inv');
    const outline = await G(() => getComputedStyle(document.activeElement).outlineStyle);
    await page.keyboard.press('Enter');
    assert.equal(await panel(), 'InventoryPanel');
    await closeUi();
    assert.equal(outline, 'dashed', 'the design\'s dashed focus ring');
  });

  await step('main screen: fits 1920×1080, 1024×768 and 820×600 without covering the side panel', async () => {
    for (const [w, h] of [[1920, 1080], [1024, 768], [820, 600]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150);
      const r = await G(() => {
        const side = document.querySelector('.side').getBoundingClientRect();
        return [...document.querySelectorAll('.vq-nav .navbtn')].map(b => { const x = b.getBoundingClientRect(), hit = document.elementFromPoint(x.x + x.width / 2, x.y + x.height / 2); return { ok: x.right <= innerWidth + 0.5 && x.left >= side.right - 0.5 && b.contains(hit) }; });
      });
      assert.ok(r.every(x => x.ok), `${w}×${h}: all buttons on screen, right of the side panel, clickable`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await step('Summit desk: authoritative prices and KPIs for the in-game date; opening and browsing changes nothing', async () => {
    await fund(60000);
    const before = await snapshot();
    await G(() => vq.router.location('financial_tower'));
    await page.waitForSelector('.vq-desk .pixel-desk-modal');
    for (const t of ['portfolio', 'history', 'learn', 'market']) await page.click(`.vq-desk [data-a="tab"][data-t="${t}"]`);
    await page.click('.vq-desk [data-a="pick"][data-id="LUMEN"]');
    await page.click('.vq-desk [data-a="side"][data-t="sell"]'); await page.click('.vq-desk [data-a="side"][data-t="buy"]');
    await closeUi();
    await G(() => vq.router.location('financial_tower'));
    assert.equal(await snapshot(), before, 'no state change, no time passing');
    const want = await G(async () => { const m = await import('./src/sim/market.js'); const d = await import('./src/data/market.js'); return Object.keys(d.ASSETS).map(id => m.price(vq.game.state, id)); });
    const shown = await page.$$eval('.vq-desk [data-testid=asset-price]', els => els.map(e => e.textContent));
    assert.deepEqual(shown, want.map(inr));
    const date = await G(async () => (await import('./src/sim/util.js')).fmtDate(vq.game.state.day));
    assert.match(await page.textContent('[data-testid=desk-date]'), new RegExp(date));
    assert.match(await page.textContent('[data-testid=desk-params]'), /Proposed changes: none in force/);
    assert.doesNotMatch(await page.textContent('.vq-desk'), /\[[A-Z_0-9]+[:\]]/, 'no template placeholders left');
  });

  await step('Summit desk: deposit, buy (double click = one trade), sell; KPIs follow the ledger', async () => {
    await page.fill('.vq-desk [data-in="move"]', '20000'); await page.dispatchEvent('.vq-desk [data-in="move"]', 'change');
    await page.click('.vq-desk [data-a="deposit"]');
    await page.click('.vq-desk [data-a="pick"][data-id="SAGAR50"]');
    await page.fill('.vq-desk [data-in="qty"]', '10'); await page.dispatchEvent('.vq-desk [data-in="qty"]', 'change');
    await page.click('.vq-desk [data-a="review"]');
    assert.match(await page.textContent('.vq-desk .desk-confirm'), /Confirm buy/);
    await page.dblclick('.vq-desk [data-a="trade-confirm"]');
    assert.equal(await G(() => vq.game.state.brokerage.trades.length), 1, 'one trade for a double click');
    await page.click('.vq-desk [data-a="pick"][data-id="SAGAR50"]');   // the 2nd click of the double click may land on another row
    await page.click('.vq-desk [data-a="side"][data-t="sell"]');
    await page.fill('.vq-desk [data-in="qty"]', '4'); await page.dispatchEvent('.vq-desk [data-in="qty"]', 'change');
    await page.click('.vq-desk [data-a="review"]'); await page.click('.vq-desk [data-a="trade-confirm"]');
    const p = await G(async () => (await import('./src/sim/market.js')).portfolio(vq.game.state));
    assert.equal(p.rows[0].qty, 6);
    assert.equal(await page.textContent('[data-testid=kpi-total]'), inr(p.total));
    assert.equal(await page.textContent('[data-testid=kpi-cash]'), inr(p.cash));
    await page.click('.vq-desk [data-a="tab"][data-t="history"]');
    assert.equal(await page.locator('.vq-desk .desk-sheet tr').count(), 3, 'header + 2 trades');
    await page.click('.vq-desk [data-a="close"]');
    assert.equal(await panel(), null);
  });

  await step('Summit desk: the bulletin is the newspaper issue of the same month; with the model offline it stays the game\'s own text', async () => {
    const hist = await G(async () => { const m = await import('./src/sim/market.js'); return m.price(vq.game.state, 'SAGAR50', vq.game.state.day); });
    const day = await G(() => vq.game.state.day);
    await page.click('.topbar [data-a="month"]');
    await feed();
    await G(() => vq.router.news());                                  // the newspaper asks the (offline) model once
    await page.waitForFunction(() => vq.game.state.newspaper.issues.at(-1).aiStatus !== 'none');
    await closeUi();
    const issue = await G(() => vq.game.state.newspaper.issues.at(-1));
    assert.equal(issue.aiStatus, 'failed');
    await G(() => vq.router.location('financial_tower'));
    const news = page.locator('[data-testid=desk-news]');
    assert.equal(await news.getAttribute('data-issue'), issue.id);
    assert.match(await news.textContent(), /SIMULATION DATA/);
    const headline = await G(async () => { const m = await import('./src/sim/newspaper.js'); return m.renderIssue(vq.game.state.newspaper.issues.at(-1)).headline; });
    assert.ok((await news.textContent()).includes(headline));
    assert.equal(await G(d => import('./src/sim/market.js').then(m => m.price(vq.game.state, 'SAGAR50', d)), day), hist, 'past prices unchanged');
    await closeUi();
  });

  await step('property agent: live data in the supplied design; filters and sorting; opening changes nothing', async () => {
    await fund(6000000);
    const before = await snapshot();
    await G(() => vq.router.property());
    await page.waitForSelector('.backdrop .vq-agent .screen-container');
    const rows = await page.$$eval('.vq-agent [data-property]', els => els.map(e => [e.dataset.property, e.querySelector('[data-testid=asking]').textContent, e.querySelector('[data-testid=rent]').textContent]));
    const want = await G(async () => { const p = await import('./src/sim/property.js'); const d = await import('./src/data/properties.js'); return Object.keys(d.PROPERTIES).map(id => [id, p.buyCost(id, vq.game.state.day).price, p.marketRent(id, vq.game.state.day)]); });
    assert.equal(rows.length, 6);
    for (const [id, price, rent] of want) assert.deepEqual(rows.find(r => r[0] === id).slice(1), [inr(price), `${inr(rent)}/mo`], id);
    await page.click('.vq-agent [data-a="cat"][data-t="family"]');
    assert.deepEqual(await page.$$eval('.vq-agent [data-property]', els => els.map(e => e.dataset.property).sort()), ['home_family', 'home_starter']);
    await page.click('.vq-agent [data-a="cat"][data-t="all"]');
    await page.selectOption('.vq-agent [data-in="sort"]', 'price-asc');
    const order = await page.$$eval('.vq-agent [data-property]', els => els.map(e => e.dataset.property));
    assert.deepEqual(order, [...want].sort((a, b) => a[1] - b[1]).map(r => r[0]));
    for (const t of ['mine', 'reports', 'rules', 'market']) await page.click(`.vq-agent [data-a="tab"][data-t="${t}"]`);
    assert.match(await page.textContent('[data-testid=agent-home]'), /Elm Court/);
    assert.match(await page.textContent('[data-testid=market-hud]'), /City-wide housing market/);
    assert.equal(await snapshot(), before, 'browsing the agent never changes the save');
  });

  await step('property agent: rent, buy ×2 (double clicks), move in, let, stop letting, sell — each exactly once', async () => {
    const count = cat => G(c => vq.game.state.ledger.filter(e => e.category === c && e.status === 'ok').length, cat);
    await page.click('.vq-agent [data-a="rent"][data-id="home_apartment_plus"]');
    assert.match(await page.textContent('.vq-agent .agent-confirm'), /security deposit/);
    await page.dblclick('.vq-agent [data-a="rent-confirm"]');
    assert.equal(await G(() => vq.game.state.housing.propertyId), 'home_apartment_plus');
    assert.equal(await count('deposit_paid'), 1, 'deposit charged once');
    for (const id of ['home_starter', 'home_apartment']) { await page.click(`.vq-agent [data-a="buy"][data-id="${id}"]`); await page.dblclick('.vq-agent [data-a="buy-confirm"]'); }
    assert.deepEqual(await G(() => Object.keys(vq.game.state.properties).sort()), ['home_apartment', 'home_starter']);
    assert.equal(await G(() => new Set(vq.game.state.ledger.filter(e => e.category === 'property_buy').map(e => e.ref)).size), 2, 'two purchases, each paid once');
    await page.click('.vq-agent [data-a="tab"][data-t="mine"]');
    await page.click('.vq-agent [data-a="movein"][data-id="home_starter"]');
    assert.deepEqual(await G(() => vq.game.state.housing), { kind: 'own', propertyId: 'home_starter' });
    await page.click('.vq-agent [data-a="list"][data-id="home_apartment"]');
    assert.equal(await G(() => vq.game.state.properties.home_apartment.status), 'listed');
    await page.click('.vq-agent [data-a="unlist"][data-id="home_apartment"]');
    assert.equal(await G(() => vq.game.state.properties.home_apartment.status), 'vacant');
    await page.click('.vq-agent [data-a="sell"][data-id="home_apartment"]');
    assert.match(await page.textContent('[data-testid=sale-calc]'), /Selling fee/);
    await page.dblclick('.vq-agent [data-a="sell-confirm"]');
    assert.equal(await G(() => vq.game.state.propertyHistory.length), 1, 'sold once');
    assert.equal(await panel(), 'PropertyPanel', 'the full-screen design is not closed by a stray click');
  });

  await step('property agent: tenant management after a month; close with the home button and reopen', async () => {
    await page.click('.vq-agent [data-a="home"], .vq-agent .home-avatar-btn');
    assert.equal(await panel(), null);
    await G(() => vq.router.property());
    await page.click('.vq-agent [data-a="buy"][data-id="home_apartment"]'); await page.click('.vq-agent [data-a="buy-confirm"]');
    await page.click('.vq-agent [data-a="tab"][data-t="mine"]');
    await page.click('.vq-agent [data-a="list"][data-id="home_apartment"]');
    await closeUi();
    for (let i = 0; i < 4 && !(await G(() => vq.game.state.properties.home_apartment.tenant)); i++) { await page.click('.topbar [data-a="month"]'); await feed(); }
    const t = await G(() => vq.game.state.properties.home_apartment.tenant);
    assert.ok(t && t.deposit === t.rent * 2);
    await G(() => vq.router.property());
    await page.click('.vq-agent [data-a="tab"][data-t="mine"]');
    assert.match(await page.textContent('.vq-agent .agent-sheet'), /TENANT/);
    await closeUi();
    assert.equal(await panel(), null);
  });

  await step('academy: each course cover on its overview lesson only; the files load; narrow screens scale them', async () => {
    const covers = await G(async () => (await import('./src/data/academyImages.js')).COURSE_COVERS);
    for (const c of Object.values(covers)) {
      const r = await page.request.get(base + encodeURI('Assets/supplied-ui/round8/Imgs for finintial acadamy/' + c.file));
      assert.equal(r.status(), 200, c.file);
    }
    await G(() => vq.router.location('finance_academy'));
    await page.waitForSelector('.vq-courses');
    for (const id of Object.keys(covers)) {
      await page.click(`.vq-courses [data-a="open"][data-id="${id}"]`);
      const img = page.locator('[data-testid=course-cover] img');
      assert.equal(await img.count(), 1, `${id}: cover on the overview`);
      await page.waitForFunction(() => { const i = document.querySelector('[data-testid=course-cover] img'); return i.complete && i.naturalWidth > 0; });
      assert.equal(await img.evaluate(i => i.naturalWidth), covers[id].width);
      assert.equal(decodeURIComponent(await img.getAttribute('src')).endsWith(covers[id].file), true);
      assert.equal(await img.getAttribute('alt'), covers[id].alt);
      await page.click('.vq-lecture [data-a="next"]');
      assert.equal(await page.locator('[data-testid=course-cover]').count(), 0, `${id}: not on lesson 2`);
      await page.click('.vq-lecture [data-a="courses"]');
    }
    await page.setViewportSize({ width: 380, height: 700 });
    // the course-card screen (Round 5 design) does not fit 380 px; open the lecture directly to check the cover
    await G(() => { vq.ui.panel.onAction('open', { dataset: { id: 'core03' } }); vq.ui.render(); });
    await page.waitForFunction(() => { const i = document.querySelector('[data-testid=course-cover] img'); return i?.complete && i.naturalWidth > 0; });
    const fit = await G(() => { const i = document.querySelector('[data-testid=course-cover] img'), box = i.closest('.lesson-scroll').getBoundingClientRect(), r = i.getBoundingClientRect(); return { fits: r.width <= box.width + 0.5 && r.width > 50, square: Math.abs(r.width - r.height) < 2 }; });
    assert.deepEqual(fit, { fits: true, square: true });
    await page.setViewportSize({ width: 1280, height: 720 });
    await closeUi();
  });

  await step('academy: a missing cover file shows a caption and the lesson still works; progress is kept', async () => {
    await page.route('**/understanding%20investing.jpeg', r => r.fulfill({ status: 404, body: '' }));
    await G(() => vq.router.location('finance_academy'));
    await page.click('.vq-courses [data-a="open"][data-id="core03"]');
    await page.waitForSelector('[data-testid=course-cover].missing');
    assert.ok(await page.isVisible('[data-testid=course-cover] figcaption'));
    assert.match(await page.textContent('[data-testid=lesson-title]'), /Course Overview/i);
    await page.click('.vq-lecture [data-a="study"]');
    assert.equal(await G(async () => (await import('./src/sim/academy.js')).readRecord(vq.game.state, 'core03').studied[0] != null), true);
    await closeUi();
    await page.unroute('**/understanding%20investing.jpeg');
    broken.splice(0, broken.length, ...broken.filter(b => !b.includes('understanding%20investing')));   // the 404 was ours
  });

  await step('after a life ends only Life and News stay enabled', async () => {
    await G(() => import('./src/sim/lifeEnd.js').then(m => vq.game.act(s => m.finalizeLife(s, 'retired_manual'))));
    await page.waitForSelector('[data-testid=final-report]');
    const st = await G(() => Object.fromEntries([...document.querySelectorAll('.vq-nav .navbtn')].map(b => [b.dataset.a, b.disabled])));
    assert.deepEqual(Object.entries(st).filter(([, d]) => !d).map(([a]) => a), ['life', 'news']);
  });

  assert.deepEqual(broken, [], 'no broken asset paths');
  const outside = requests.filter(u => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:' + base));   // blob: = Phaser's in-memory textures
  assert.deepEqual(outside, [], 'no external requests (no financial APIs, fonts or images from the web)');
  assert.deepEqual(problems.filter(p => !/404/.test(p)), [], 'no console errors/warnings');
  console.log('\nround 8 smoke test passed');
} finally {
  await browser.close();
  server.close();
}
