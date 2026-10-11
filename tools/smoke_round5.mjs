// End-to-end test of Round 5 in headless Chromium: every shop in the supplied stall design (real
// prices, art, balances, purchases, limits, duplicates, cash-then-savings, plan, clothing, furniture),
// the supplied course screens with the real course content and saved progress, and the new
// tenancy / sale / report screens; plus a real Round 4 save loading in the browser.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { serve } from './e2e_server.mjs';

const { server, url, base } = serve();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/GL|WebGL/.test(m.text()))) problems.push(m.text()); });
page.on('pageerror', e => problems.push(e.message));
let dialogAnswer = true;
page.on('dialog', d => (dialogAnswer ? d.accept() : d.dismiss()));

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  try { await fn(); } catch (e) { const shot = join(tmpdir(), 'vanquest-round5-failure.png'); await page.screenshot({ path: shot }).catch(() => {}); console.log(`FAILED (screenshot: ${shot})`); throw e; }
  console.log('ok');
};
const G = (fn, arg) => page.evaluate(fn, arg);
const boot = async () => {
  await page.waitForFunction(() => window.game?.scene?.getScene('City')?.traffic && window.vq, null, { timeout: 15000 });
  await G(() => { vq.settings.passiveTime = false; vq.settings.randomEncounters = false; });
  await page.waitForTimeout(300);
};
const bal = acc => G(a => vq.game.state.ledger.filter(e => e.account === a && e.status === 'ok').reduce((s, e) => s + e.amount, 0), acc);
const fund = (amount, salary, account = 'wallet') => G(([a, sal, acc]) => vq.game.act(s => {
  s.ledger.push({ id: s.nextId++, day: s.day, account: acc, amount: a, category: 'test', memo: 'test funds', status: 'ok' });
  if (sal != null) s.job.salary = sal;
  for (const id of ['rice_5kg', 'atta_5kg', 'dal_1kg', 'oil_1l', 'milk_1l', 'veg_1kg']) s.pantry[id] = 200;
}), [amount, salary, account]);
const closeUi = () => page.keyboard.press('Escape');
const num = n => n.toLocaleString('en-IN');
const SHOPS = ['market_grocery', 'market_general', 'market_clothing', 'market_electronics', 'market_jewellery', 'market_furniture'];

try {
  await page.goto(url);
  await G(() => localStorage.removeItem('vanquest.save.v1'));
  await page.reload(); await boot();

  await step('every shop uses the supplied stall components with real prices, art and balance; X returns to the game', async () => {
    const data = await G(async () => { const c = await import('./src/data/catalog.js'); return { shops: Object.fromEntries(Object.entries(c.SHOPS).map(([k, v]) => [k, v.items])), price: Object.fromEntries(Object.entries(c.ITEMS).map(([k, v]) => [k, v.price])) }; });
    for (const shop of SHOPS) {
      await G(s => vq.router.shop(s), shop);
      await page.waitForSelector('.backdrop .vq-store .market-stall');
      for (const part of ['.stall-awning', '.awning-sign-plaque', '.dialogue-banner-bar', '.timber-shelves-bay .shelves-grid', '.stall-counter-footer .wallet-badge', '.pixel-btn-wood-review', '.pixel-stall-close-btn'])
        assert.equal(await page.locator(`.vq-store ${part}`).count(), 1, `${shop}: ${part}`);
      const cards = await page.locator('.vq-store .shelf-compartment').evaluateAll(els => els.map(e => ({ id: e.dataset.item, price: e.querySelector('.shelf-price-num').textContent, art: !!e.querySelector('.pixel-item-graphic .spr'), decor: e.querySelectorAll('.decor-prop svg').length })));
      assert.deepEqual(cards.map(c => c.id), data.shops[shop], `${shop}: the shop's real stock, in order`);
      for (const c of cards) { assert.equal(c.price, num(data.price[c.id]), `${c.id} price`); assert.ok(c.art, `${c.id} has its sprite`); assert.equal(c.decor, 2, 'supplied shelf decor'); }
      assert.equal(await page.textContent('[data-testid=shop-balance]'), num(await G(() => vq.game.state.ledger.filter(e => ['wallet', 'bank'].includes(e.account) && e.status === 'ok').reduce((s, e) => s + e.amount, 0))));
      const font = await page.locator('.vq-store .stall-title').evaluate(e => getComputedStyle(e).fontFamily);
      assert.match(font, /Press Start 2P/, 'supplied pixel font');
      await page.click('.vq-store .pixel-stall-close-btn');
      assert.equal(await G(() => vq.ui.isOpen), false, `${shop}: closed`);
    }
    assert.ok(await G(() => game.scene.isActive('City')));
  });

  await step('purchase: double-click charged once; cash first, then savings; ledger, balance and inventory agree', async () => {
    await fund(1000 - await bal('wallet'), 30000); await fund(60000, null, 'bank');      // ₹1,000 cash, ₹60,000 savings
    const cash = await bal('wallet'), sav = await bal('bank');
    assert.equal(cash, 1000);
    await G(() => vq.router.shop('market_electronics'));
    await page.click('[data-item="smartphone"] [data-a="c-inc"]');
    assert.match(await page.textContent('.basket-counter-display'), /14,999/);
    await page.click('[data-a="review"]');
    await page.dblclick('[data-a="buy-confirm"]');
    const buys = await G(() => vq.game.state.ledger.filter(e => e.category === 'purchase' && e.memo.includes('Smartphone')));
    assert.equal(buys.length, 2, 'one purchase, split across cash and savings');
    assert.deepEqual([await bal('wallet'), await bal('bank')], [0, sav - (14999 - cash)]);
    assert.equal(await G(() => vq.game.state.owned.smartphone), 1);
    assert.match(await page.textContent('.vq-store [data-item="smartphone"] .shelf-owned-tally'), /YOU HAVE 1/);
    assert.match(await page.textContent('[data-testid=shop-say]'), /Purchased 1× Smartphone/);
    assert.equal(await page.textContent('[data-testid=shop-balance]'), num(sav - (14999 - cash)));
  });

  await step('purchase limits and insufficient funds are refused in the stall, nothing charged', async () => {
    const n = await G(() => vq.game.state.ledger.length);
    await page.click('[data-item="smartphone"] [data-a="c-inc"]');
    await page.click('[data-item="smartphone"] [data-a="c-inc"]');            // limit 2, you own 1
    assert.match(await page.textContent('[data-testid=shop-say]'), /Limit reached/);
    assert.equal(await page.inputValue('[data-item="smartphone"] .shelf-stepper-qty'), '1');
    await page.click('[data-a="clear"]');
    for (let i = 0; i < 2; i++) await page.click('[data-item="laptop"] [data-a="c-inc"]');
    await page.click('[data-a="review"]');
    assert.equal(await page.isDisabled('[data-a="buy-confirm"]'), true);
    assert.match(await page.textContent('#confirm'), /short/);
    await page.click('#confirm [data-a="cancel"]');
    assert.equal(await G(() => vq.game.state.ledger.length), n);
    await closeUi();
  });

  await step('clothing bought in the stall can be worn; furniture bought in the walk-in stall is placeable at home', async () => {
    await fund(200000);
    await G(() => vq.router.shop('market_clothing'));
    await page.click('[data-item="kurta"] [data-a="c-inc"]'); await page.click('[data-a="review"]'); await page.click('[data-a="buy-confirm"]');
    await closeUi();
    assert.equal(await G(async () => (await import('./src/sim/wardrobe.js')).equip(vq.game.state, 'kurta').ok), true);
    await G(() => vq.router.location('market_furniture'));
    await page.waitForFunction(() => game.scene.isActive('Home') && game.scene.getScene('Home').talkZone);
    await G(() => { const h = game.scene.getScene('Home'); h.player.setPosition(h.talkZone.centerX, h.talkZone.centerY); });
    await page.waitForTimeout(150); await page.keyboard.press('KeyE');
    await page.waitForSelector('.backdrop .vq-store');
    assert.match(await page.textContent('.vq-store .stall-title'), /Hearth/);
    await page.click('[data-item="plant"] [data-a="c-inc"]'); await page.click('[data-a="review"]'); await page.click('[data-a="buy-confirm"]');
    await closeUi();
    await G(() => game.scene.getScene('Home').leave());
    await page.waitForFunction(() => game.scene.isActive('City'));
    const placed = await G(async () => { const inv = await import('./src/sim/inventory.js'); const s = vq.game.state, f = s.furniture.find(x => x.itemId === 'plant'); return inv.placeFurniture(s, f.uid, 'home_apartment', 3, 3).ok; });
    assert.equal(placed, true, 'placeable in the current (rented) home');
  });

  await step('grocery plan through the stall tab: saved without a charge, billed once on the 1st', async () => {
    await G(() => vq.router.shop('market_grocery'));
    await page.click('.stall-tab[data-t="plan"]');
    for (let i = 0; i < 4; i++) await page.click('[data-a="p-inc"][data-id="milk_1l"]');
    const n = await G(() => vq.game.state.ledger.length);
    await page.click('[data-a="plan-save"]'); await page.click('[data-a="plan-save-confirm"]');
    assert.equal(await G(() => vq.game.state.ledger.length), n, 'saving charges nothing');
    assert.match(await page.textContent('[data-testid=plan-status]'), /ACTIVE/);
    await closeUi();
    await page.click('[data-a="month"]');
    assert.equal(await G(() => vq.game.state.ledger.filter(e => e.category === 'grocery_plan' && e.status === 'ok').length), 1);
  });

  await step('academy: the supplied course cards and lecture screen show the real courses; progress persists', async () => {
    await G(() => vq.game.act(s => { s.academy.lessons.budgeting = { attempts: 1, bestScore: 1, passed: true, completedDay: 0 }; }));
    await G(() => vq.router.location('finance_academy'));
    await page.waitForSelector('.vq-courses .course-cards-grid');
    const courses = await G(async () => (await import('./src/data/courses.js')).COURSES.map(c => ({ id: c.id, title: c.title, lessons: c.lessons.map(l => l.title), q: c.check.questions })));
    const titles = await page.locator('.vq-courses .course-card .course-title').allTextContents();
    assert.deepEqual(titles, courses.map(c => c.title.toUpperCase()));
    assert.match(await page.textContent('.vq-courses .legacy-note'), /Budgeting basics ✓/, 'earlier record shown');
    await page.click('[data-a="open"][data-id="core02"]');
    await page.waitForSelector('.vq-lecture .lecture-panel-left');
    assert.ok(await page.locator('.vq-lecture .advisor-box img[src$="advisor.svg"]').count() === 1, 'supplied advisor portrait');
    for (let i = 0; i < courses[1].lessons.length; i++) {
      assert.equal(await page.textContent('[data-testid=lesson-title]'), courses[1].lessons[i]);
      const study = page.locator('[data-a="study"]:not([disabled]), [data-a="reveal"]:not([disabled])');
      if (await study.count()) await study.first().click();
      await page.click('[data-a="next"]');
    }
    const q = courses[1].q;
    for (const [i, x] of q.entries()) await page.click(`[data-a="pick"][data-q="${i}"][data-o="${x.answer}"]`);
    await page.click('[data-a="submit"]');
    assert.match(await page.textContent('[data-testid=check-result]'), /PASSED/);
    assert.match(await page.textContent('[data-testid=advisor]'), /Course complete/);
    await page.click('[data-a="courses"]');
    assert.match(await page.locator('.course-card[data-course="core02"] [data-testid=course-status]').textContent(), /COMPLETED/);
    // an open-answer course: reveal, self-mark
    await page.click('[data-a="open"][data-id="core04"]');
    while (!/Knowledge check/.test(await page.textContent('[data-testid=lesson-title]'))) await page.click('[data-a="next"]');
    assert.equal(await page.isDisabled('[data-a="submit"]'), true);
    await page.fill('[data-in="open"][data-q="0"]', 'Do not share it — check with the bank myself.');
    await page.dispatchEvent('[data-in="open"][data-q="0"]', 'change');
    await page.click('[data-a="reveal-q"][data-q="0"]');
    assert.match(await page.textContent('.lesson-flow .answer'), new RegExp(courses[3].q[0].model.slice(0, 20)));
    await closeUi();
    await page.reload(); await boot();
    const rec = await G(() => vq.game.state.academy);
    assert.ok(rec.courses.core02.completedDay != null && rec.courses.core02.check.passed, 'saved');
    assert.deepEqual(rec.lessons.budgeting.passed, true, 'legacy record kept');
    await G(() => vq.router.location('finance_academy'));
    assert.match(await page.locator('.course-card[data-course="core02"] [data-testid=course-status]').textContent(), /COMPLETED/, 'persists after reload');
    await closeUi();
  });

  await step('renting shows and charges the deposit; letting out records the tenant deposit as a liability', async () => {
    await fund(6000000, 200000);
    await G(() => vq.router.property());
    await page.click('[data-a="rent"][data-id="home_apartment_plus"]');
    assert.match(await page.textContent('.confirm'), /security deposit/);
    await page.dblclick('[data-a="rent-confirm"]');
    const h = await G(() => vq.game.state.housing);
    assert.equal(h.deposit, h.rent * 2);
    assert.equal(await G(() => vq.game.state.ledger.filter(e => e.category === 'deposit_paid').length), 1, 'deposit charged once');
    await page.click('[data-a="buy"][data-id="home_family"]'); await page.click('[data-a="buy-confirm"]');
    await page.click('[data-a="tab"][data-t="mine"]'); await page.click('[data-a="list"][data-id="home_family"]');
    await closeUi();
    for (let i = 0; i < 3 && !(await G(() => vq.game.state.properties.home_family.tenant)); i++) await page.click('[data-a="month"]');
    const t = await G(() => vq.game.state.properties.home_family.tenant);
    assert.ok(t && t.deposit === t.rent * 2);
    await page.keyboard.press('KeyO');
    await page.waitForSelector('[data-testid=networth]');
    assert.match(await page.textContent('.backdrop'), /Tenants' deposits you hold/);
    const o = await G(async () => (await import('./src/sim/networth.js')).overview(vq.game.state));
    assert.equal(o.liabilities.tenantDeposits, t.deposit);
    await closeUi();
  });

  await step('selling shows the whole calculation (fee, deposit, loan payoff); the report separates cash flow and economic return', async () => {
    await G(() => vq.router.property({ tab: 'mine' }));
    await page.click('[data-a="tab"][data-t="mine"]');
    await page.click('[data-a="sell"][data-id="home_family"]');
    const calc = await page.textContent('[data-testid=sale-calc]');
    assert.match(calc, /Selling fee/); assert.match(calc, /Tenant's deposit, returned/); assert.match(calc, /Comes to you/);
    await page.dblclick('[data-a="sell-confirm"]');
    assert.equal(await G(() => vq.game.state.propertyHistory.length), 1, 'sold once');
    if (!(await G(() => vq.ui.isOpen))) await G(() => vq.router.property());   // the 2nd click may land outside the shrunken panel and close it
    await page.click('[data-a="tab"][data-t="reports"]');
    const card = page.locator('[data-report="home_family"]');
    assert.match(await card.textContent(), /SOLD — REALISED/);
    assert.match(await card.textContent(), /Economic return \(realised\)/);
    assert.match(await card.textContent(), /Cash flow — your pocket/);
    const r = await G(async () => { const m = await import('./src/sim/propertyReport.js'); return m.propertyReport(vq.game.state, vq.game.state.propertyHistory[0]); });
    assert.equal(r.cash.result, r.economic.profit);
    await closeUi();
  });

  await step('bank: the supplied Nidhi Bank design with real balances; deposit once (double-click); every tab inside the console', async () => {
    await G(() => vq.router.location('bank'));
    await page.waitForSelector('.vq-bank .bank-console-window');
    for (const part of ['.grand-entrance-plaque', '.hall-banner.banner-left', '.bank-clerk-booth', '.bank-console-header .bank-nav-cluster', '.bank-pillars-grid', '.bank-info-ribbon', '.bank-action-controls-bar', '.bank-ledger-viewport', '.bank-console-footer .chip-savings'])
      assert.equal(await page.locator(`.vq-bank ${part}`).count(), 1, part);
    assert.equal(await page.locator('.vq-bank .pillar-arch-card .arch-prop-sprite svg').count(), 5, 'five pillar counters with the template art');
    const sav0 = await bal('bank'), cash0 = await bal('wallet');
    assert.equal(await page.textContent('#pillar_savings .arch-val-num'), num(sav0));
    assert.equal(await page.textContent('[data-testid=bank-cash]'), num(cash0));
    await page.fill('.vq-bank [data-in="amount"]', '2500'); await page.dispatchEvent('.vq-bank [data-in="amount"]', 'change');
    await page.click('.vq-bank .pixel-btn-bank-deposit[data-a="deposit"]');
    await page.dblclick('.vq-bank #confirm [data-a="confirm"]');
    assert.deepEqual([await bal('bank'), await bal('wallet')], [sav0 + 2500, cash0 - 2500], 'deposited exactly once');
    assert.equal(await page.textContent('[data-testid=bank-savings]'), num(sav0 + 2500));
    assert.match(await page.locator('.vq-bank .ledger-row').first().textContent(), /\[DEPOSIT\].*2,500/);
    for (const t of ['fd', 'loans', 'credit', 'rules']) {
      await page.click(`.vq-bank .pixel-bank-tab[data-t="${t}"]`);
      assert.match(await page.getAttribute(`.vq-bank .pixel-bank-tab[data-t="${t}"]`, 'class'), /active/);
      assert.ok((await page.textContent('.vq-bank .bank-tab-body')).length > 50, `${t} tab has content`);
    }
    await page.click('.vq-bank .pixel-bank-close-btn');
    assert.equal(await G(() => vq.ui.isOpen), false);
  });

  await step('Vikram: the supplied encounter design; questions reveal answers; committing is confirmed and charged once', async () => {
    const open = id => G(async x => { const m = await import('./src/sim/encounters.js'); let r; vq.game.act(s => { r = m.startEncounter(s, x); }); vq.router.encounter(r.uid); return r.uid; }, id);
    const def = await G(async () => (await import('./src/data/encounters.js')).ENCOUNTERS.find(e => e.id === 'plantation_doubler'));
    await open('plantation_doubler');
    await page.waitForSelector('.vq-scam .pixel-dialogue-modal');
    assert.equal(await page.locator('.vq-scam .vikram-avatar-img[src$="vikram.svg"]').count(), 1, 'supplied portrait');
    assert.match(await page.textContent('.vq-scam .pitch-card'), new RegExp(def.pitch.slice(0, 30)));
    assert.equal(await page.locator('.vq-scam .inquiry-card').count(), 0, 'answers stay hidden until asked');
    await page.click('.vq-scam [data-a="ask"][data-t="investigate"]');
    assert.match(await page.textContent('.vq-scam .inquiry-card[data-topic="investigate"]'), new RegExp(def.answers.investigate.slice(0, 25)));
    assert.equal(await page.isDisabled('.vq-scam [data-a="ask"][data-t="investigate"]'), true);
    assert.match(await page.textContent('.vq-scam .offer-subtext'), /NOT GUARANTEED/);
    const money0 = await G(() => vq.game.state.ledger.filter(e => ['wallet', 'bank'].includes(e.account) && e.status === 'ok').reduce((s, e) => s + e.amount, 0));
    await page.fill('.vq-scam [data-in="amt"]', '2000'); await page.dispatchEvent('.vq-scam [data-in="amt"]', 'change');
    await page.click('.vq-scam [data-a="invest"]');
    await page.dblclick('.vq-scam [data-a="invest-confirm"]');
    const money1 = await G(() => vq.game.state.ledger.filter(e => ['wallet', 'bank'].includes(e.account) && e.status === 'ok').reduce((s, e) => s + e.amount, 0));
    assert.equal(money0 - money1, 2000, 'committed once');
    assert.match(await page.textContent('[data-testid=scam-outcome]'), /handed over ₹2,000/);
    await page.click('.vq-scam [data-a="close"]');
    await open('plantation_doubler');
    await page.waitForSelector('.vq-scam .pixel-dialogue-modal');
    await page.click('.vq-scam .pixel-btn-close');                     // walking away = declining
    assert.equal(await G(() => vq.game.state.encounters.log.at(-1).status), 'declined');
  });

  await step('a real Round 4 save loads in the browser: loan, tenant, academy record kept', async () => {
    const raw = readFileSync(new URL('../tests/fixtures/round4_save.json', import.meta.url), 'utf8');
    await G(r => localStorage.setItem('vanquest.save.v1', r), raw);
    await page.reload(); await boot();
    const s = await G(() => ({ v: vq.game.state.version, loans: vq.game.state.loans.length, tenant: !!vq.game.state.properties.home_apartment_plus.tenant, legacy: Object.keys(vq.game.state.academy.lessons) }));
    assert.deepEqual(s, { v: 5, loans: 1, tenant: true, legacy: ['budgeting'] });
    await G(() => vq.router.property({ tab: 'reports' }));
    await page.click('[data-a="tab"][data-t="reports"]');
    assert.ok(await page.locator('[data-report]').count() >= 2);
    await closeUi();
  });

  await step('title screen: the supplied design opens on load, blocks the game until you enter, then continues your save', async () => {
    await page.goto(base);                                              // no ?play: as a player opens it
    await page.waitForSelector('.vq-title .title-screen-container');
    for (const part of ['.scanlines', '.logo-wrapper .game-logo', '.logo-glow', '.pixel-btn-primary', '.bottom-bar .pixel-btn-exit'])
      assert.equal(await page.locator(`.vq-title ${part}`).count(), 1, part);
    await page.waitForFunction(() => document.querySelector('.vq-title .game-logo').complete);
    assert.ok(await G(() => document.querySelector('.vq-title .game-logo').naturalWidth) > 0, 'supplied logo loads');
    const bg = await G(() => getComputedStyle(document.querySelector('.vq-title')).backgroundImage);
    assert.match(bg, /Pixel-Art%20Campus/, 'supplied background');
    assert.ok(await G(async () => { const img = new Image(); img.src = getComputedStyle(document.querySelector('.vq-title')).backgroundImage.slice(5, -2); await img.decode(); return img.naturalWidth; }) > 0);
    assert.match(await page.textContent('.vq-title .title-resume'), /Continue/, 'a returning player sees their save');
    await page.waitForFunction(() => window.vq && game.scene.getScene('City')?.traffic);
    const day = await G(() => vq.game.state.day);
    await page.keyboard.press('Escape'); await page.keyboard.press('KeyI');
    assert.equal(await page.locator('.vq-title').count(), 1, 'Esc and game keys do nothing behind the title');
    dialogAnswer = false;
    await page.click('.vq-title [data-a="exit"]');                      // asks first; cancelling keeps you here
    dialogAnswer = true;
    assert.equal(await page.locator('.vq-title').count(), 1);
    await page.click('.vq-title [data-a="start"]');
    assert.equal(await G(() => vq.ui.isOpen), false, 'entered the game');
    assert.equal(await G(() => vq.game.state.day), day, 'the save continues where it was');
    await page.keyboard.press('KeyI');
    await page.waitForSelector('.backdrop .modal');
    assert.match(await page.textContent('.backdrop .m-head h2'), /Inventory/, 'game controls work after entering');
    await closeUi();
  });

  assert.deepEqual(problems, [], 'no console errors/warnings');
  console.log('\nround 5 smoke test passed');
} finally {
  await browser.close();
  server.close();
}
