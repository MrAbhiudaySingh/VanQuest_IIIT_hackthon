// End-to-end test of the real game in headless Chromium: movement, click-to-move,
// collisions, shops, grocery plan, tipster, trading, academy, college, homes,
// persistence. Run: npm install && npx playwright install chromium && npm test
import { chromium } from 'playwright';
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
const boot = async () => {
  await page.waitForFunction(() => window.game?.scene?.getScene('City')?.player && window.vq, null, { timeout: 15000 });
  await page.evaluate(() => { vq.settings.passiveTime = false; vq.settings.randomEncounters = false; });
  await page.waitForTimeout(400);
};
const S = () => page.evaluate(() => {
  const c = game.scene.getScene('City'), p = c.player, v = c.cameras.main.worldView;
  return { x: p.x, y: p.y, anim: p.anims.currentAnim?.key, frame: p.frame.name, zone: c.activeZone?.id ?? null, path: !!c.ctrl.path,
           view: [v.x, v.y, v.width, v.height], speed: Math.hypot(p.body.velocity.x, p.body.velocity.y) };
});
const G = (expr, arg) => page.evaluate(expr, arg);
const wallet = () => G(() => vq.game.state.ledger.filter(e => e.account === 'wallet' && e.status === 'ok').reduce((s, e) => s + e.amount, 0));
const teleport = (x, y) => page.evaluate(([x, y]) => { const c = game.scene.getScene('City'); c.ctrl.stop(); c.player.setPosition(x, y); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, [x, y]);
const hold = async (keys, ms) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  const s = await S();
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(80);
  return s;
};
// click a world position in the city (asserts the canvas, not a UI element, is under it)
const clickWorld = async (wx, wy) => {
  // the camera eases after a teleport — wait until the target is comfortably on screen
  await page.waitForFunction(([wx, wy]) => { const v = game.scene.getScene('City').cameras.main.worldView;
    return wx > v.x + 30 && wx < v.right - 30 && wy > v.y + 40 && wy < v.bottom - 40; }, [wx, wy], { timeout: 3000 });
  const [x, y] = await page.evaluate(([wx, wy]) => {
    const cam = game.scene.getScene('City').cameras.main, r = game.canvas.getBoundingClientRect();
    return [r.left + (wx - cam.worldView.x) * cam.zoom * r.width / 960, r.top + (wy - cam.worldView.y) * cam.zoom * r.height / 540];
  }, [wx, wy]);
  assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [x, y]), 'CANVAS', `click target ${wx},${wy} is covered by UI`);
  await page.mouse.click(x, y);
};
const waitIdle = () => page.waitForFunction(() => !game.scene.getScene('City').ctrl.path, null, { timeout: 15000 });
const insideCollider = async () => {
  const hit = await G(() => {
    const c = game.scene.getScene('City'), b = c.player.body;
    const o = c.map.getObjectLayer('Collision').objects.find(o => b.x < o.x + o.width - 0.5 && b.right > o.x + 0.5 && b.y < o.y + o.height - 0.5 && b.bottom > o.y + 0.5);
    return o ? { body: [b.x, b.y, b.width, b.height], player: [c.player.x, c.player.y], rect: [o.x, o.y, o.width, o.height], path: c.ctrl.path?.pts } : null;
  });
  if (hit) console.log('\n  overlap:', JSON.stringify(hit));
  return !!hit;
};
const closeUi = () => page.keyboard.press('Escape');
const PLAZA = { x: 33 * 16 + 8, y: 17 * 16 + 12 };
const RENT = 3000;
// Fixtures for long runs: a well-stocked pantry (the Round 3 health rules would otherwise end the
// run during multi-month tests) and explicit test funds where a step needs money.
const stockPantry = () => G(() => vq.game.act(s => { for (const id of ['rice_5kg', 'atta_5kg', 'dal_1kg', 'oil_1l', 'milk_1l', 'veg_1kg']) s.pantry[id] = 60; }));
const addFunds = amount => G(a => vq.game.act(s => { s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: a, category: 'test', memo: 'test funds', status: 'ok' }); }), amount);

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await boot();
  await stockPantry();

  await step('keyboard: 4 directions, animation, idle, diagonal speed', async () => {
    for (const [key, dir, axis, sign] of [['KeyD', 'right', 'x', 1], ['KeyS', 'down', 'y', 1], ['KeyA', 'left', 'x', -1], ['KeyW', 'up', 'y', -1], ['ArrowRight', 'right', 'x', 1], ['ArrowLeft', 'left', 'x', -1]]) {
      await teleport(PLAZA.x, PLAZA.y);
      const a = await S();
      await page.keyboard.down(key);
      // hold until moved ≥ 24px (or 1.5 s) — tolerates a headless frame hitch
      await page.waitForFunction(([ax, k, sg, start]) => (game.scene.getScene('City').player[k] - start) * sg >= 24, [0, axis, sign, a[axis]], { timeout: 1500 }).catch(() => {});
      const mid = await S();
      await page.keyboard.up(key);
      await page.waitForTimeout(150);
      const b = await S();
      assert.ok((b[axis] - a[axis]) * sign > 20, `${key} moves ${dir}: ${JSON.stringify([a, mid, b])}`);
      assert.equal(mid.anim, `walk-${dir}`);
      assert.equal(b.anim, `idle-${dir}`);
    }
    await page.keyboard.down('KeyS');
    const frames = new Set();
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(40); frames.add((await S()).frame); }
    await page.keyboard.up('KeyS');
    assert.ok(frames.size >= 3, 'walk cycle animates');
    await teleport(PLAZA.x, PLAZA.y);
    assert.ok(Math.abs((await hold(['KeyD', 'KeyS'], 200)).speed - 80) < 0.5);
  });

  await step('collision: tower wall stops the player', async () => {
    await teleport(PLAZA.x, PLAZA.y + 16);
    await hold(['KeyW'], 1500);
    assert.ok(Math.abs((await S()).y - 262) < 1);
  });

  await step('click-to-move: routes around obstacles, never through colliders', async () => {
    // north of the produce stalls in Market Square → straight south is blocked by them
    const from = { x: 53 * 16 + 8, y: 8 * 16 + 10 }, to = { x: 53 * 16 + 8, y: 10 * 16 + 12 };
    await teleport(from.x, from.y);
    await page.waitForTimeout(500);
    assert.equal(await G(([a, b]) => game.scene.getScene('City').nav.lineClear(a, b), [from, to]), false, 'straight line is blocked');
    await clickWorld(to.x, to.y);
    await page.waitForTimeout(100);
    assert.equal(await G(() => game.scene.getScene('City').ctrl.path.pts.length > 2), true, 'multi-segment path');
    assert.equal(await G(() => game.scene.getScene('City').ctrl.marker.visible), true, 'destination marker shown');
    const anims = new Set();
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(60);
      assert.equal(await insideCollider(), false, 'player body never overlaps a collider');
      const s = await S(); if (s.path) anims.add(s.anim);
    }
    await waitIdle();
    const s = await S();
    assert.ok(Math.hypot(s.x - to.x, s.y - to.y) < 3, 'arrived at the clicked spot');
    assert.ok([...anims].every(a => a.startsWith('walk-')), 'walk animation while following');
    assert.ok(s.anim.startsWith('idle-'), 'idle on arrival');
    assert.equal(await G(() => game.scene.getScene('City').ctrl.marker.visible), false, 'marker cleared');
  });

  await step('click-to-move: new click replaces the destination immediately', async () => {
    await teleport(PLAZA.x, PLAZA.y);
    await clickWorld(PLAZA.x + 120, PLAZA.y);
    await page.waitForTimeout(250);
    await clickWorld(PLAZA.x - 120, PLAZA.y);
    await page.waitForTimeout(60);
    // (the camera is following, so the clicked world point can drift a few px)
    const goal = await G(() => game.scene.getScene('City').ctrl.path.goal);
    assert.ok(Math.abs(goal.x - (PLAZA.x - 120)) < 10, `goal switched (${goal.x})`);
    await waitIdle();
    assert.ok(Math.abs((await S()).x - goal.x) < 3, 'arrived at the new goal');
  });

  await step('click-to-move: keyboard interrupts instantly', async () => {
    await teleport(PLAZA.x, PLAZA.y);
    await clickWorld(PLAZA.x + 150, PLAZA.y);
    await page.waitForTimeout(200);
    const s = await hold(['KeyW'], 150);
    assert.equal(s.path, false, 'path cancelled');
    assert.equal(s.anim, 'walk-up');
  });

  await step('click-to-move: unreachable target → nearest reachable spot', async () => {
    await teleport(PLAZA.x, PLAZA.y);
    await clickWorld(33 * 16 + 8, 12 * 16);   // inside the tower facade
    await page.waitForTimeout(80);
    assert.equal(await G(() => game.scene.getScene('City').ctrl.path.adjusted), true);
    await waitIdle();
    assert.equal(await insideCollider(), false);
  });

  await step('entrance zones show banner + clickable prompt', async () => {
    const zones = await G(async () => {
      const c = game.scene.getScene('City'), h = game.scene.getScene('Hud'), out = [];
      for (const z of c.zones) { c.player.body.reset(z.rect.centerX, z.rect.centerY); await new Promise(r => setTimeout(r, 80)); out.push([z.id, c.activeZone?.id, h.bannerName.text, getComputedStyle(vq.hud.prompt).display]); }
      return out;
    });
    assert.equal(zones.length, 18);                 // Round 4 added Nidhi Bank
    for (const [id, active, , prompt] of zones) { assert.equal(active, id); assert.equal(prompt, 'block', `${id} prompt`); }
  });

  await step('shop: purchase, double-click is charged once, inventory updates', async () => {
    const w0 = await wallet();
    await teleport(52 * 16 + 8, 6 * 16 + 8);           // FreshCart entrance
    await page.waitForTimeout(150);
    await page.click('.prompt-btn');                    // mouse on the interaction prompt
    await page.waitForSelector('.backdrop .modal');
    await page.click('[data-a="c-inc"][data-id="eggs_12"]');
    await page.click('[data-a="c-inc"][data-id="eggs_12"]');
    await page.click('[data-a="review"]');
    await page.dblclick('[data-a="buy-confirm"]');
    const charges = await G(() => vq.game.state.ledger.filter(e => e.category === 'purchase').length);
    assert.equal(charges, 1, 'one charge');
    assert.equal(await wallet(), w0 - 2 * 84);
    assert.equal(await G(() => vq.game.state.pantry.eggs_12), 2);
    assert.match(await page.textContent('.msg.ok'), /Purchased 2× Eggs/);
  });

  await step('shop: insufficient funds is refused with a message', async () => {
    await closeUi();
    await G(() => vq.router.location('market_jewellery'));
    await page.click('[data-a="c-inc"][data-id="diamond_pendant"]');
    await page.click('[data-a="review"]');
    assert.equal(await page.isDisabled('[data-a="buy-confirm"]'), true);
    assert.match(await page.textContent('.confirm'), /short/);
    await closeUi();
    assert.equal(await G(() => vq.game.state.owned.diamond_pendant ?? 0), 0);
  });

  await step('keepers: clicking a shopkeeper walks over and opens their shop', async () => {
    await teleport(57 * 16, 10 * 16);
    const k = await G(() => { const s = game.scene.getScene('City').keepers.find(k => k.shop === 'market_clothing').sprite; return [s.x, s.y - 8]; });
    await clickWorld(k[0], k[1]);
    await page.waitForSelector('.backdrop .modal', { timeout: 8000 });
    assert.match(await page.textContent('.m-head h2'), /Thread & Co/);
    await closeUi();
  });

  await step('grocery plan: save (no charge), bill on the 1st, deliver, edit, pause', async () => {
    const w0 = await wallet();
    await G(() => vq.router.location('market_grocery'));
    await page.click('[data-a="tab"][data-t="plan"]');
    for (let i = 0; i < 10; i++) await page.click('[data-a="p-inc"][data-id="milk_1l"]');
    await page.click('[data-a="p-inc"][data-id="rice_5kg"]');
    await page.click('[data-a="plan-save"]');
    await page.click('[data-a="plan-save-confirm"]');
    assert.equal(await wallet(), w0, 'saving charges nothing');
    await closeUi();
    await page.click('[data-a="month"]');               // skip to the 1st via the HUD
    const st = await G(() => { const s = vq.game.state; return { plan: s.ledger.filter(e => e.category === 'grocery_plan'), sal: s.ledger.filter(e => e.category === 'salary'), milk: s.pantry.milk_1l }; });
    assert.equal(st.sal.length, 1, 'salary paid once');
    assert.equal(st.plan.length, 1, 'plan billed once');
    assert.equal(st.plan[0].amount, -(10 * 62 + 350 + 40));
    assert.ok(st.milk >= 9, 'milk delivered');
    assert.equal(await wallet(), w0 + 10000 - RENT - (10 * 62 + 350 + 40), 'salary − rent − plan');
    await G(() => vq.router.location('market_grocery'));
    await page.click('[data-a="tab"][data-t="plan"]');
    await page.click('[data-a="plan-pause"]');
    assert.equal(await G(() => vq.game.state.groceryPlan.status), 'paused');
    await page.click('[data-a="plan-resume"]');
    await closeUi();
  });

  await step('grocery plan: insufficient funds pauses it and charges nothing', async () => {
    await G(() => vq.game.act(s => { s.groceryPlan.items = { oil_1l: 99, rice_5kg: 99 }; }));
    const before = await wallet();
    await page.click('[data-a="month"]');
    assert.equal(await G(() => vq.game.state.groceryPlan.status), 'paused');
    assert.equal(await wallet(), before + 10000 - RENT, 'only salary and rent moved');
    assert.equal(await G(() => vq.game.state.ledger.filter(e => e.category === 'grocery_plan' && e.status === 'failed').length), 1);
    assert.ok(await page.locator('.toast.error').count() >= 1, 'player notified');
  });

  await step('tipster: approaches, questions, commits money, resolves into history', async () => {
    await teleport(60 * 16, 10 * 16);
    await G(() => game.scene.getScene('City').spawnTipster());
    await page.waitForFunction(() => vq.ui.isOpen, null, { timeout: 15000 });
    await page.click('[data-a="ask"][data-t="risks"]');
    const w0 = await wallet();
    await page.fill('[data-in="amt"]', '2000'); await page.dispatchEvent('[data-in="amt"]', 'change');
    await page.click('[data-a="invest"]');
    await page.click('[data-a="invest-confirm"]');
    assert.equal(await wallet(), w0 - 2000);
    await closeUi();
    const rec = await G(() => vq.game.state.encounters.log.at(-1));
    assert.equal(rec.status, 'invested');
    await G(() => vq.game.advance(31));
    const done = await G(() => vq.game.state.encounters.log.at(-1));
    assert.equal(done.status, 'resolved');
    assert.ok(await G(() => vq.game.state.events.some(e => e.type === 'encounter')));
  });

  await step('trading desk: deposit, buy, sell, consistent portfolio', async () => {
    await G(() => vq.router.location('financial_tower'));
    await page.fill('[data-in="move"]', '4000'); await page.dispatchEvent('[data-in="move"]', 'change');
    await page.click('[data-a="deposit"]');
    await page.click('[data-a="pick"][data-id="SAGAR50"]');
    await page.fill('[data-in="qty"]', '5'); await page.dispatchEvent('[data-in="qty"]', 'change');
    await page.click('[data-a="review"]');
    await page.click('[data-a="trade-confirm"]');
    await page.click('[data-a="side"][data-t="sell"]');
    await page.fill('[data-in="qty"]', '2'); await page.dispatchEvent('[data-in="qty"]', 'change');
    await page.click('[data-a="review"]');
    await page.click('[data-a="trade-confirm"]');
    const p = await G(async () => { const m = await import('./src/sim/market.js'); return m.portfolio(vq.game.state); });
    assert.equal(p.rows[0].qty, 3);
    assert.equal(p.total, p.cash + p.invested);
    await closeUi();
  });

  await step('academy: complete a lesson with feedback', async () => {
    await G(() => vq.router.location('finance_academy'));
    await page.click('[data-a="open"][data-id="scams"]');
    for (const [q, o] of [[0, 1], [1, 2], [2, 1]]) await page.click(`[data-a="pick"][data-q="${q}"][data-o="${o}"]`);
    await page.click('[data-a="submit"]');
    assert.match(await page.textContent('.msg.ok'), /3\/3/);
    assert.ok(await page.locator('.why').count() >= 3, 'explanations shown');
    await closeUi();
  });

  await step('college: enrol (tuition once), keep part-time salary', async () => {
    await addFunds(30000);
    const w0 = await wallet();
    await G(() => vq.router.location('college'));
    await page.click('[data-a="pick"][data-id="design"]');
    await page.click('[data-a="enrol"]');
    assert.equal(await wallet(), w0 - 25000);
    assert.equal(await G(() => vq.game.state.education.status), 'enrolled');
    assert.equal(await G(() => vq.game.state.job.salary), 10000);
    await closeUi();
  });

  await step('home: enter, use the computer (stable id), leave back to the city', async () => {
    await G(() => vq.router.location('home_apartment'));
    await page.waitForFunction(() => game.scene.isActive('Home'));
    await G(() => { const h = game.scene.getScene('Home'); h.player.setPosition(h.pcZone.centerX, h.pcZone.centerY + 2); });
    await page.waitForTimeout(150);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('.backdrop .modal');
    assert.match(await page.textContent('.backdrop .m-head'), /home_pc_apartment/);
    await closeUi();
    await G(() => game.scene.getScene('Home').leave());
    await page.waitForFunction(() => game.scene.isActive('City'));
    assert.equal((await S()).zone, 'home_apartment', 'back outside our own front door');
  });

  await step('persistence: reload keeps money, items, plan, portfolio, lessons', async () => {
    const before = await G(() => JSON.stringify(vq.game.state.ledger) + JSON.stringify(vq.game.state.pantry) + JSON.stringify(vq.game.state.groceryPlan) + JSON.stringify(vq.game.state.brokerage) + JSON.stringify(vq.game.state.academy));
    await page.reload();
    await boot();
    const after = await G(() => JSON.stringify(vq.game.state.ledger) + JSON.stringify(vq.game.state.pantry) + JSON.stringify(vq.game.state.groceryPlan) + JSON.stringify(vq.game.state.brokerage) + JSON.stringify(vq.game.state.academy));
    assert.equal(after, before);
    assert.equal(await page.textContent('[data-testid=wallet]'), await G(() => { const n = vq.game.state.ledger.filter(e => e.account === 'wallet' && e.status === 'ok').reduce((s, e) => s + e.amount, 0); return '₹' + n.toLocaleString('en-IN'); }), 'HUD shows the ledger balance');
  });

  await step('camera stays inside the map', async () => {
    await teleport(8, 8); await page.waitForTimeout(900);
    assert.deepEqual((await S()).view.slice(0, 2), [0, 0]);
    await teleport(1080, 798); await page.waitForTimeout(900);
    const v = (await S()).view;
    assert.deepEqual([v[0] + v[2], v[1] + v[3]], [1088, 800]);
  });

  assert.deepEqual(problems, [], 'no console errors/warnings');
  console.log('\nsmoke test passed');
} finally {
  await browser.close();
  server.close();
}
