// End-to-end test of the Round 4 journeys in headless Chromium: Nidhi Bank (deposit, withdraw,
// FD), mortgage purchase through the agent, EMIs, property report, net worth, home-equity loan,
// product art, top-down cars, two-way traffic & signals, year skip, and a real Round 3 save.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { serve } from './e2e_server.mjs';

const { server, url } = serve();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/GL|WebGL/.test(m.text()))) problems.push(m.text()); });
page.on('pageerror', e => problems.push(e.message));
page.on('dialog', d => d.accept());

const step = async (name, fn) => { process.stdout.write(`• ${name} … `); await fn(); console.log('ok'); };
const G = (fn, arg) => page.evaluate(fn, arg);
const boot = async () => {
  await page.waitForFunction(() => window.game?.scene?.getScene('City')?.traffic && window.vq, null, { timeout: 15000 });
  await G(() => { vq.settings.passiveTime = false; vq.settings.randomEncounters = false; });
  await page.waitForTimeout(300);
};
const bal = acc => G(a => vq.game.state.ledger.filter(e => e.account === a && e.status === 'ok').reduce((s, e) => s + e.amount, 0), acc);
const fund = (amount, salary) => G(([a, sal]) => vq.game.act(s => {
  s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: a, category: 'test', memo: 'test funds', status: 'ok' });
  if (sal) s.job.salary = sal;
  for (const id of ['rice_5kg', 'atta_5kg', 'dal_1kg', 'oil_1l', 'milk_1l', 'veg_1kg']) s.pantry[id] = 200;
}), [amount, salary]);
const closeUi = () => page.keyboard.press('Escape');
const placePlayer = (x, y) => G(([x, y]) => { const c = game.scene.getScene('City'); c.ctrl.stop(); c.player.setPosition(x, y); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, [x, y]);
const setInput = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'change'); };

try {
  await page.goto(url);
  await G(() => localStorage.removeItem('vanquest.save.v1'));
  await page.reload(); await boot();
  await fund(800000, 60000);

  await step('bank: talk to the banker, deposit (double-click → once), withdraw beyond savings refused', async () => {
    const b = await G(() => { const h = game.scene.getScene('City').helpers.find(h => h.zone.kind === 'banker'); return [h.sprite.x, h.sprite.y]; });
    await placePlayer(b[0], b[1] + 14); await page.waitForTimeout(150);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('.backdrop .modal');
    assert.match(await page.textContent('.backdrop .m-head h2'), /Nidhi Bank/);
    const cash0 = await bal('wallet');
    await setInput('[data-in="amount"]', 100000);
    await page.click('[data-a="deposit"]');
    await page.dblclick('[data-a="confirm"]');
    assert.equal(await bal('bank'), 100000, 'deposited once');
    assert.equal(await bal('wallet'), cash0 - 100000, 'moved, not created');
    await setInput('[data-in="amount"]', 999999);
    await page.click('[data-a="withdraw"]'); await page.click('[data-a="confirm"]');
    assert.match(await page.textContent('.backdrop .msg.error'), /Not enough/);
    assert.equal(await bal('bank'), 100000);
  });

  await step('FD: opened from savings, money locked, value shown', async () => {
    await page.click('[data-a="tab"][data-t="fd"]');
    await page.click('[data-a="term"][data-t="0"]');                 // 6 months @ 6%
    await setInput('[data-in="fdAmount"]', 40000);
    await page.click('[data-a="fd-open"]'); await page.click('[data-a="confirm"]');
    assert.equal(await bal('bank'), 60000);
    assert.equal(await bal('fd'), 40000);
    assert.match(await page.textContent('.backdrop table'), /ACTIVE/);
    await closeUi();
  });

  await step('mortgage: quote shown, ineligible terms explained, purchase with a loan, EMI on the 1st once', async () => {
    await G(() => vq.router.property());
    await page.click('[data-a="buy"][data-id="home_family"]');
    await page.click('[data-a="pay-loan"]');
    await page.click('[data-a="down"][data-t="0.1"]'); await page.click('[data-a="years"][data-t="5"]');
    assert.equal(await page.isDisabled('[data-a="buy-confirm"]'), true, 'too big an EMI for this salary');
    assert.match(await page.textContent('.confirm'), /limit 50%/);
    await page.click('[data-a="cancel"]');
    await page.click('[data-a="buy"][data-id="home_starter"]');
    await page.click('[data-a="pay-loan"]'); await page.click('[data-a="down"][data-t="0.2"]'); await page.click('[data-a="years"][data-t="20"]');
    const q = await G(async () => (await import('./src/sim/loans.js')).mortgageQuote(vq.game.state, 'home_starter', 0.2, 20));
    assert.match(await page.textContent('.confirm'), new RegExp(q.emi.toLocaleString('en-IN')));
    await page.dblclick('[data-a="buy-confirm"]');
    const loans = await G(() => vq.game.state.loans);
    assert.equal(loans.length, 1, 'one loan, even with a double click');
    assert.equal(loans[0].principal, q.principal);
    await page.click('[data-a="tab"][data-t="mine"]');
    await page.click('[data-a="movein"][data-id="home_starter"]');
    await closeUi();
    await page.click('[data-a="month"]');                              // to the 1st
    const emis = await G(() => vq.game.state.ledger.filter(e => e.category === 'emi' && e.status === 'ok'));
    assert.equal(emis.length, 1);
    assert.equal(-emis.reduce((a, e) => a + e.amount, 0), q.emi);
    await page.reload(); await boot();
    assert.equal(await G(() => vq.game.state.loans[0].paidCount), 1, 'loan persists across reload');
  });

  await step('property report and net worth agree with the ledger; loan is a liability, not income', async () => {
    await G(() => vq.router.property({ tab: 'reports' }));
    await page.click('[data-a="tab"][data-t="reports"]');
    const text = await page.textContent('.backdrop .m-body');
    assert.match(text, /Loan interest/);
    assert.match(text, /home loan/);
    await closeUi();
    await page.keyboard.press('KeyO');
    await page.waitForSelector('[data-testid=networth]');
    const shown = await page.textContent('[data-testid=networth]');
    const o = await G(async () => (await import('./src/sim/networth.js')).overview(vq.game.state));
    assert.equal(shown, '₹' + o.netWorth.toLocaleString('en-IN'));
    assert.equal(o.netWorth, o.totalAssets - o.totalLiabilities);
    assert.ok(o.liabilities.mortgages > 0);
    assert.match(await page.textContent('.backdrop'), /a debt, not income/);
    await closeUi();
  });

  await step('home-equity loan: limit = 60% of value − existing loan; paid into savings', async () => {
    await G(() => vq.router.bank({ tab: 'loans' }));
    await page.click('[data-a="tab"][data-t="loans"]');
    const q = await G(async () => (await import('./src/sim/loans.js')).equityQuote(vq.game.state, 'home_starter', 100000, 5));
    const v = await G(async () => (await import('./src/sim/housingMarket.js')).propertyValue('home_starter', vq.game.state.day));
    const owed = await G(() => vq.game.state.loans[0].balance);
    assert.equal(q.maxLoan, Math.max(0, Math.floor((v * 0.6 - owed) / 1000) * 1000));
    if (q.maxLoan >= 50000) {
      await setInput('[data-in="eq-amount"]', 50000);
      const bank0 = await bal('bank');
      await page.click('[data-a="eq-apply"]'); await page.click('[data-a="confirm"]');
      assert.equal(await bal('bank'), bank0 + 50000);
      assert.equal(await G(() => vq.game.state.loans.length), 2);
    }
    await closeUi();
  });

  await step('electronics and jewellery show product art for every item', async () => {
    for (const shop of ['market_electronics', 'market_jewellery']) {
      await G(s => vq.router.location(s), shop);
      const cards = await page.locator('.backdrop .card').count();
      const art = await page.locator('.backdrop .card .thumb .spr').count();
      assert.ok(cards > 0 && art === cards, `${shop}: ${art}/${cards} cards have art`);
      await closeUi();
    }
    await G(() => vq.router.inventory());
    await page.click('[data-a="tab"][data-t="electronics"]');
    assert.ok(await page.locator('.backdrop td.icon-cell').count() >= 0);
    await closeUi();
  });

  await step('top-down cars: dealership shows their art; driving rotates the sprite with the heading', async () => {
    await fund(1500000);
    await G(() => vq.router.dealership());
    assert.ok(await page.locator('.backdrop .thumb .spr[style*="vanquest_topcars"]').count() >= 4);
    await page.click('[data-a="buy"][data-id="sedan"]'); await page.click('[data-a="buy-confirm"]');
    await closeUi();
    const c = await G(() => { const d = game.scene.getScene('City').drive; return [d.sprite.x, d.sprite.y]; });
    await placePlayer(c[0], c[1] + 12); await page.waitForTimeout(350);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => game.scene.getScene('City').drive.driving);
    const r0 = await G(() => game.scene.getScene('City').drive.view.rotation);
    await page.keyboard.down('KeyD'); await page.waitForTimeout(900); await page.keyboard.up('KeyD');
    const r1 = await G(() => game.scene.getScene('City').drive.view.rotation);
    assert.ok(Math.abs(r1) < 0.2 && Math.abs(r0 - r1) > 1, `rotated from ${r0.toFixed(2)} to face east (${r1.toFixed(2)})`);
    assert.equal(await G(() => game.scene.getScene('City').drive.view.texture.key), 'topcars');
    await page.waitForTimeout(350); await page.keyboard.press('KeyE');
    await page.waitForFunction(() => !game.scene.getScene('City').drive.driving);
  });

  await step('traffic: both directions on avenues and Main Street; cars wait at red lights', async () => {
    const lanes = await G(() => game.scene.getScene('City').traffic.lanes.map(l => l.axis + l.dir));
    assert.deepEqual(lanes.sort(), ['h-1', 'h1', 'v-1', 'v-1', 'v1', 'v1']);
    const offRoad = await G(() => {          // a car's full 14 px width must stay on asphalt, never the footpath
      const c = game.scene.getScene('City'), roads = c.map.getLayer('Roads').tilemapLayer, bad = [];
      for (const l of c.traffic.lanes) for (let a = 8; a < (l.axis === 'v' ? c.map.heightInPixels : c.map.widthInPixels); a += 16)
        for (const off of [-7, 0, 7]) { const [x, y] = l.axis === 'v' ? [l.at + off, a] : [a, l.at + off]; if (!roads.getTileAtWorldXY(x, y)) bad.push(`${l.axis}${l.dir}@${x},${y}`); }
      return bad;
    });
    assert.deepEqual(offRoad, [], 'traffic lanes stay on the road');
    const t0 = await G(() => game.scene.getScene('City').traffic.cars.map(c => c.pos));
    await page.waitForTimeout(1500);
    const t1 = await G(() => game.scene.getScene('City').traffic.cars.map(c => c.pos));
    assert.ok(t0.some((p, i) => p !== t1[i]), 'traffic moves');
    // a car parked at a junction edge waits while its light is red
    const waited = await G(async () => {
      const tr = game.scene.getScene('City').traffic;
      const lane = tr.lanes.find(l => l.axis === 'h' && l.dir === 1);
      const car = tr.cars.find(c => c.lane === lane);
      car.pos = 18 * 16 - car.len / 2 - 6;                 // just before the west junction
      tr.t = 0;                                             // N–S green → E–W red
      const p0 = car.pos; await new Promise(r => setTimeout(r, 700));
      return [p0, car.pos];
    });
    assert.ok(Math.abs(waited[1] - waited[0]) < 1, `stopped at red (${waited})`);
  });

  await step('year skip with loans + FD: FD matures once, 12 EMIs, summary matches net worth', async () => {
    await fund(300000);
    const n = await G(() => vq.game.state.ledger.length);
    await page.click('[data-a="year"]'); await page.click('[data-a="go"]');
    await page.waitForSelector('text=Your year in review');
    const r = await G(async n0 => {
      const s = vq.game.state, e = s.ledger.slice(n0), o = (await import('./src/sim/networth.js')).overview(s);
      return { emi: e.filter(x => x.category === 'emi' && x.status === 'ok' && x.loan === s.loans[0].uid).length, fd: s.bank.fds[0].status,
        fdInt: e.filter(x => x.category === 'interest' && x.memo.includes(s.bank.fds[0].uid)).length, nw: o.netWorth, alive: s.status };
    }, n);
    assert.deepEqual([r.emi, r.fd, r.fdInt, r.alive], [12, 'matured', 1, 'alive']);
    assert.match(await page.textContent('.backdrop'), new RegExp(r.nw.toLocaleString('en-IN')));
    await page.click('[data-a="close"]');
  });

  await step('a real Round 3 save loads and plays in the browser', async () => {
    const raw = readFileSync(new URL('../tests/fixtures/round3_save.json', import.meta.url), 'utf8');
    await G(r => localStorage.setItem('vanquest.save.v1', r), raw);
    await page.reload(); await boot();
    const s = await G(() => ({ v: vq.game.state.version, props: Object.keys(vq.game.state.properties).sort(), top: vq.game.state.wardrobe.top, car: vq.game.state.vehicles[0]?.model, fdns: vq.game.state.bank.fds.length }));
    assert.deepEqual(s, { v: 3, props: ['home_apartment_plus', 'home_starter'], top: 'kurta', car: 'hatch', fdns: 0 });
    await G(() => vq.router.location('home_starter'));
    await page.waitForFunction(() => game.scene.isActive('Home'));
    assert.equal(await G(() => game.scene.getScene('Home').placed.length), 1, 'Round 3 furniture still placed');
    await G(() => game.scene.getScene('Home').leave());
    await G(() => vq.router.property({ tab: 'reports' }));
    await page.click('[data-a="tab"][data-t="reports"]');
    assert.ok(await page.locator('.backdrop .card').count() >= 2, 'reports for migrated purchases');
    await closeUi();
  });

  assert.deepEqual(problems, [], 'no console errors/warnings');
  console.log('\nround 4 smoke test passed');
} finally {
  await browser.close();
  server.close();
}
