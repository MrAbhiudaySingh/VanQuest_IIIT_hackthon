// End-to-end test of the Round 3 journeys in headless Chromium: dealership, driving & collisions,
// property agent (rent / buy / move / let / sell), furniture showroom → placement, clothing,
// side panel, pantry, one-year skip, death & restart, and loading a real Round 2 save.
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
  await page.waitForFunction(() => window.game?.scene?.getScene('City')?.drive && window.vq, null, { timeout: 15000 });
  await G(() => { vq.settings.passiveTime = false; vq.settings.randomEncounters = false; });
  await page.waitForTimeout(300);
};
const wallet = () => G(() => vq.game.state.ledger.filter(e => e.account === 'wallet' && e.status === 'ok').reduce((s, e) => s + e.amount, 0));
const addFunds = amount => G(a => vq.game.act(s => { s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: a, category: 'test', memo: 'test funds', status: 'ok' }); }), amount);
const stockPantry = () => G(() => vq.game.act(s => { for (const id of ['rice_5kg', 'atta_5kg', 'dal_1kg', 'oil_1l', 'milk_1l', 'veg_1kg']) s.pantry[id] = 60; }));
const city = fn => G(fn);
const placePlayer = (x, y) => G(([x, y]) => { const c = game.scene.getScene('City'); c.ctrl.stop(); c.player.setPosition(x, y); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, [x, y]);
// (Round 4: the physics body `sprite` is invisible; what you see is `view`, and `dir` is the 0–7 direction)
const car = () => G(() => { const d = game.scene.getScene('City').drive; return { x: d.sprite.x, y: d.sprite.y, speed: d.speed, driving: d.driving, visible: d.view.visible, frame: d.dir }; });
const closeUi = () => page.keyboard.press('Escape');
const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); const c = await car(); await page.keyboard.up(key); return c; };
const inHome = () => G(() => game.scene.isActive('Home'));
const zoneOf = id => G(i => { const z = game.scene.getScene('City').zones.find(z => z.id === i); return [z.rect.centerX, z.rect.centerY]; }, id);
// every route into an interior: E at the door, the router, and starting the scene directly
const tryAllRoutes = async id => {
  const [x, y] = await zoneOf(id);
  await placePlayer(x, y); await page.waitForTimeout(150);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  const viaKey = await inHome();
  await closeUi();
  await G(i => vq.router.location(i), id); await page.waitForTimeout(300);
  const viaRouter = await inHome();
  await closeUi();
  await G(i => { game.scene.getScene('City').scene.sleep(); game.scene.run('Home', { homeId: i }); }, id);
  await page.waitForTimeout(400);
  const direct = await inHome();
  const cityBack = await G(() => game.scene.isActive('City'));
  return { viaKey, viaRouter, direct, cityBack };
};
const freshGame = async () => {
  await G(() => { localStorage.removeItem('vanquest.save.v1'); });
  await page.reload(); await boot(); await stockPantry();
};
const enterCar = async () => {
  // stand right beside the car on a walkable spot
  const spot = await G(() => {
    const c = game.scene.getScene('City'), d = c.drive.sprite;
    // within 18 px of the car "get in" takes priority over doors, so just be close and walkable
    return [[0, 12], [-14, 6], [14, 6], [0, -12], [-16, 0], [16, 0]].map(([dx, dy]) => ({ x: d.x + dx, y: d.y + dy })).find(p => c.nav.clearAt(p.x, p.y));
  });
  await placePlayer(spot.x, spot.y);
  await page.waitForTimeout(300);                 // getting in/out is debounced (250 ms)
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => game.scene.getScene('City').drive.driving, null, { timeout: 3000 });
};
const exitCar = async () => { await page.waitForTimeout(300); await page.keyboard.press('KeyE'); await page.waitForFunction(() => !game.scene.getScene('City').drive.driving); };
// a long straight run: drive the active car to the main street and measure top speed heading east
const topSpeed = async () => {
  await G(() => { const d = game.scene.getScene('City').drive; d.sprite.body.reset(5 * 16, 21 * 16 + 8); d.heading = 0; d.speed = 0; d.last = { x: d.sprite.x, y: d.sprite.y }; });
  let best = 0;
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 14; i++) { await page.waitForTimeout(150); best = Math.max(best, (await car()).speed); }
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(600);
  return best;
};

try {
  await page.goto(url);
  await freshGame();

  await step('start: renting the cheapest flat, side panel shows real state', async () => {
    assert.match(await page.textContent('[data-testid=home]'), /Elm Court Flat 2B.*Renting · ₹3,000/s);
    assert.equal(await page.textContent('[data-testid=wallet]'), '₹' + (await wallet()).toLocaleString('en-IN'));
    assert.equal(await page.textContent('[data-testid=health]'), '100/100');
    assert.equal(await G(() => Object.keys(vq.game.state.properties).length), 0);
  });

  await step('access: other homes refuse every entry route; your rented flat opens and takes furniture', async () => {
    for (const id of ['home_luxury', 'home_starter', 'home_apartment_plus']) {
      assert.deepEqual(await tryAllRoutes(id), { viaKey: false, viaRouter: false, direct: false, cityBack: true }, id);
    }
    assert.ok(await page.locator('.toast', { hasText: "You don't own or rent this property." }).count() >= 1, 'clear message');
    await G(() => vq.game.act(s => { s.ledger.push({ id: s.nextId++, day: s.day, account: 'wallet', amount: 20000, category: 'test', memo: 'test funds', status: 'ok' }); }));
    await G(() => vq.router.location('market_furniture'));
    await page.waitForFunction(() => game.scene.getScene('Home').talkZone);
    await G(() => { const h = game.scene.getScene('Home'); h.player.setPosition(h.talkZone.centerX, h.talkZone.centerY); });
    await page.waitForTimeout(150); await page.keyboard.press('KeyE');
    await page.click('[data-a="c-inc"][data-id="bookshelf"]'); await page.click('[data-a="review"]'); await page.click('[data-a="buy-confirm"]');
    await closeUi();
    await G(() => game.scene.getScene('Home').leave()); await page.waitForFunction(() => game.scene.isActive('City'));
    const [x, y] = await zoneOf('home_apartment');
    await placePlayer(x, y); await page.waitForTimeout(150);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => game.scene.isActive('Home') && game.scene.getScene('Home').homeId === 'home_apartment');
    await page.waitForTimeout(500);
    assert.equal(await inHome(), true, 'the E that opened the door does not walk you straight back out');
    assert.match(await G(() => game.scene.getScene('Home').title.text), /YOUR HOME/);
    await page.waitForTimeout(200);
    await page.keyboard.press('KeyF');
    await page.click('.furniture-editor [data-a="place"]');
    const [cx, cy] = await G(() => { const h = game.scene.getScene('Home'), cam = h.cameras.main, r = game.canvas.getBoundingClientRect();
      const wx = 4 * 16 + 8, wy = 4 * 16 + 8; return [r.left + (wx - cam.worldView.x) * cam.zoom * r.width / 960, r.top + (wy - cam.worldView.y) * cam.zoom * r.height / 540]; });
    await page.mouse.move(cx, cy); await page.mouse.click(cx, cy);
    await page.keyboard.press('KeyF');
    await G(() => game.scene.getScene('Home').leave()); await page.waitForFunction(() => game.scene.isActive('City'));
    await page.reload(); await boot();
    assert.deepEqual(await G(() => vq.game.state.furniture.map(f => [f.itemId, f.home, f.x, f.y])), [['bookshelf', 'home_apartment', 4, 4]], 'placed in the rented flat, kept after reload');
  });

  await step('dealership: insufficient funds refused; buy charges once (double-click); car appears on the forecourt', async () => {
    await G(() => vq.router.dealership());
    await page.click('[data-a="buy"][data-id="used_hatch"]');
    assert.equal(await page.isDisabled('[data-a="buy-confirm"]'), true);
    assert.match(await page.textContent('.confirm'), /short/);
    await closeUi();
    await addFunds(3000000);
    const w0 = await wallet();
    await G(() => vq.router.dealership());
    await page.click('[data-a="buy"][data-id="used_hatch"]');
    await page.dblclick('[data-a="buy-confirm"]');
    assert.equal(await G(() => vq.game.state.ledger.filter(e => e.category === 'vehicle_buy').length), 1);
    assert.equal(await wallet(), w0 - 180000);
    assert.equal(await page.isDisabled('[data-a="buy"][data-id="used_hatch"]'), true, 'cannot buy the same model twice');
    await closeUi();
    const c = await car();
    assert.ok(c.visible && c.x > 36 * 16 && c.x < 44 * 16 && c.y > 44 * 16, `parked on the forecourt (${c.x},${c.y})`);
  });

  await step('driving: enter with E, steer, collide with the showroom wall, exit beside the car', async () => {
    await enterCar();
    assert.equal(await G(() => game.scene.getScene('City').player.visible), false);
    await page.waitForFunction(() => /DRIVING/.test(document.querySelector('.driving-badge').textContent), null, { timeout: 2000 });
    // north = turn round (it was parked facing south) and drive straight into the showroom.
    // The car's position is its body's bottom edge; the wall ends at y = 44 tiles → body bottom at 704 + 16.
    const after = await hold('KeyW', 3000);
    assert.ok(Math.abs(after.y - (44 * 16 + 16)) < 2, `stopped at the wall, body bottom ${after.y}`);
    assert.equal(after.frame % 8, 6, 'facing north');
    await page.click('canvas', { position: { x: 700, y: 400 } });
    assert.equal((await car()).driving, true, 'clicks don\'t make you walk while driving');
    await exitCar();
    const p = await G(() => { const c = game.scene.getScene('City'); return { x: c.player.x, y: c.player.y, visible: c.player.visible, clear: c.nav.clearAt(c.player.x, c.player.y) }; });
    assert.ok(p.visible && p.clear, 'out of the car, on a walkable spot');
    assert.ok(await G(() => !!vq.game.state.vehicles[0].parked), 'parking spot saved');
  });

  await step('driving: better cars are genuinely faster (measured on Main Street)', async () => {
    await enterCar();
    const slow = await topSpeed();
    await exitCar();
    await G(() => vq.router.dealership());
    await page.click('[data-a="buy"][data-id="executive"]'); await page.click('[data-a="buy-confirm"]');
    await page.click('[data-a="tab"][data-t="garage"]');
    const exec = await G(() => vq.game.state.vehicles.find(v => v.model === 'executive').uid);
    await page.click(`[data-a="activate"][data-id="${exec}"]`);
    await closeUi();
    await enterCar();
    const fast = await topSpeed();
    await exitCar();
    assert.ok(slow > 100 && slow <= 120.5, `used hatch tops out at its max (${slow.toFixed(1)})`);
    assert.ok(fast > slow + 40, `executive is much faster (${fast.toFixed(1)} vs ${slow.toFixed(1)})`);
    assert.ok(await G(() => vq.game.state.ledger.some(e => e.category === 'fuel')), 'fuel charged for the distance driven');
  });

  await step('driving: grass is off-limits and you cannot drive into the park', async () => {
    await enterCar();
    await G(() => { const d = game.scene.getScene('City').drive; d.sprite.body.reset(33 * 16, 38 * 16 + 4); d.heading = Math.PI / 2; d.speed = 0; });
    await hold('KeyS', 1200);                                     // south into Elm Park's grass
    const c = await car();
    assert.ok(c.y <= 39 * 16 + 1, `stopped at the park edge (${c.y})`);
    await exitCar();
  });

  await step('vehicle ownership persists across reload; selling credits the buy-back once', async () => {
    const before = await G(() => JSON.stringify(vq.game.state.vehicles));
    await page.reload(); await boot();
    assert.equal(await G(() => JSON.stringify(vq.game.state.vehicles)), before);
    const w0 = await wallet();
    const used = await G(() => vq.game.state.vehicles.find(v => v.model === 'used_hatch').uid);
    await G(() => vq.router.dealership());
    await page.click('[data-a="tab"][data-t="garage"]');
    await page.click(`[data-a="sell"][data-id="${used}"]`);
    await page.dblclick('[data-a="sell-confirm"]');
    assert.equal(await G(() => vq.game.state.ledger.filter(e => e.category === 'vehicle_sell').length), 1);
    assert.equal(await wallet(), w0 + Math.round(180000 * 0.85));
    assert.equal(await G(() => vq.game.state.vehicles.some(v => v.model === 'used_hatch')), false);
    await closeUi();
  });

  await step('property agent: rent Lakeview, buy two homes, move in, let one out; rent paid once a month', async () => {
    await addFunds(4000000);
    const agent = await G(() => { const h = game.scene.getScene('City').helpers.find(h => h.zone.kind === 'agent'); return [h.sprite.x, h.sprite.y]; });
    await placePlayer(agent[0], agent[1] + 14);
    await page.waitForTimeout(150);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('.backdrop .modal');
    assert.match(await page.textContent('.backdrop .m-head h2'), /Lakshmi/);
    await page.click('[data-a="rent"][data-id="home_apartment_plus"]');
    await page.click('[data-a="rent-confirm"]');
    assert.equal(await G(() => vq.game.state.housing.propertyId), 'home_apartment_plus');
    await page.click('[data-a="buy"][data-id="home_starter"]');
    await page.click('[data-a="buy-confirm"]');
    await page.click('[data-a="buy"][data-id="home_apartment"]');
    await page.click('[data-a="buy-confirm"]');
    await page.click('[data-a="tab"][data-t="mine"]');
    await page.click('[data-a="movein"][data-id="home_starter"]');
    assert.deepEqual(await G(() => vq.game.state.housing), { kind: 'own', propertyId: 'home_starter' });
    await page.click('[data-a="list"][data-id="home_apartment"]');
    assert.equal(await page.isVisible('[data-a="sell"][data-id="home_starter"]'), false, 'no sell button for your home');
    await closeUi();
    await page.click('[data-a="month"]');                      // to the 1st: tenant pays once, upkeep on both
    const s = await G(() => { const s = vq.game.state; return { inc: s.ledger.filter(e => e.category === 'rent_income' && e.day === s.day).length, up: s.ledger.filter(e => e.category === 'upkeep' && e.day === s.day).length, rent: s.ledger.filter(e => e.category === 'rent' && e.day === s.day).length }; });
    assert.deepEqual(s, { inc: 1, up: 2, rent: 0 });
    assert.match(await page.textContent('[data-testid=home]'), /12 Elm St.*Owned/s);
    // the bookshelf from the rented flat was packed into storage on moving out — not lost
    assert.deepEqual(await G(() => vq.game.state.furniture.map(f => [f.itemId, f.home])), [['bookshelf', null]]);
    // Elm Court is now let: every route is refused; the door offers tenancy management instead
    const let_ = await tryAllRoutes('home_apartment');
    assert.deepEqual(let_, { viaKey: false, viaRouter: false, direct: false, cityBack: true });
    const [x, y] = await zoneOf('home_apartment');
    await placePlayer(x, y); await page.waitForTimeout(150);
    assert.match(await page.textContent('.prompt-btn'), /Manage your tenancy/);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('.backdrop .modal');
    assert.match(await page.textContent('.backdrop'), /Let to a tenant/);
    await closeUi();
    // Lakeview (the rental we left) is closed to us now
    assert.equal((await tryAllRoutes('home_apartment_plus')).direct, false);
  });

  await step('furniture showroom: walk in, talk to Farah, buy with art, go home and place it; survives reload', async () => {
    await G(() => vq.router.location('market_furniture'));
    await page.waitForFunction(() => game.scene.isActive('Home') && game.scene.getScene('Home').talkZone);
    await G(() => { const h = game.scene.getScene('Home'); h.player.setPosition(h.talkZone.centerX, h.talkZone.centerY); });
    await page.waitForTimeout(150);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('.backdrop .modal');
    assert.ok(await page.locator('.backdrop .card .thumb .spr').count() > 10, 'furniture cards show sprites');
    await page.click('[data-a="c-inc"][data-id="plant"]');
    await page.click('[data-a="review"]'); await page.click('[data-a="buy-confirm"]');
    await closeUi();
    await G(() => game.scene.getScene('Home').leave());
    await page.waitForFunction(() => game.scene.isActive('City'));
    await G(() => vq.router.location('home_starter'));
    await page.waitForFunction(() => game.scene.isActive('Home') && game.scene.getScene('Home').homeId === 'home_starter');
    await page.waitForTimeout(400);
    await page.keyboard.press('KeyF');
    const plantUid = await G(() => vq.game.state.furniture.find(f => f.itemId === 'plant').uid);
    await page.click(`.furniture-editor [data-a="place"][data-uid="${plantUid}"]`);
    const [x, y] = await G(() => { const h = game.scene.getScene('Home'), cam = h.cameras.main, r = game.canvas.getBoundingClientRect();
      const wx = 6 * 16 + 8, wy = 5 * 16 + 8; return [r.left + (wx - cam.worldView.x) * cam.zoom * r.width / 960, r.top + (wy - cam.worldView.y) * cam.zoom * r.height / 540]; });
    await page.mouse.move(x, y); await page.mouse.click(x, y);
    const placed = await G(() => vq.game.state.furniture.filter(f => f.home === 'home_starter').map(f => [f.itemId, f.x, f.y]));
    assert.deepEqual(placed, [['plant', 6, 5]]);
    await page.keyboard.press('KeyF');
    await page.reload(); await boot();
    assert.deepEqual(await G(() => vq.game.state.furniture.filter(f => f.home === 'home_starter').map(f => [f.itemId, f.x, f.y])), [['plant', 6, 5]]);
    assert.equal(await G(() => vq.game.state.furniture.length), 2, 'bookshelf (in storage) + plant — no duplicates');
  });

  await step('clothing: shop shows art, equip only what you own, the sprite changes, persists', async () => {
    await G(() => vq.router.location('market_clothing'));
    assert.ok(await page.locator('.backdrop .card .thumb .spr').count() >= 7);
    await page.click('[data-a="c-inc"][data-id="kurta"]'); await page.click('[data-a="review"]'); await page.click('[data-a="buy-confirm"]');
    await closeUi();
    assert.equal(await G(async () => (await import('./src/sim/wardrobe.js')).equip(vq.game.state, 'blazer').reason), 'not_owned');
    await page.keyboard.press('KeyC');
    await page.click('[data-a="on"][data-id="kurta"]');
    await closeUi();
    const row = await G(async () => (await import('./src/data/artIndex.js')).outfitRow({ top: 'kurta' }));
    const frame = await G(() => game.scene.getScene('City').player.frame.name);
    assert.ok(frame >= row * 12 && frame < row * 12 + 12, `player drawn with the kurta outfit row (${frame})`);
    await page.reload(); await boot();
    assert.equal(await G(() => vq.game.state.wardrobe.top), 'kurta');
  });

  await step('pantry panel: icons, stock, days left; side panel feed shows purchases', async () => {
    await page.keyboard.press('KeyP');
    await page.waitForSelector('.backdrop .modal');
    assert.ok(await page.locator('.backdrop td.icon-cell .spr').count() >= 15);
    assert.match(await page.textContent('.backdrop .msg'), /keeps you fed for/);
    await closeUi();
    assert.match(await page.textContent('.side .feed'), /Potted plant|kurta/);
  });

  await step('one-year skip: confirmation, 12 salaries, summary matches the ledger', async () => {
    await G(() => vq.game.act(s => { for (const id of Object.keys(s.pantry)) s.pantry[id] = 400; }));
    const before = await G(() => ({ day: vq.game.state.day, n: vq.game.state.ledger.length }));
    await page.click('[data-a="year"]');
    assert.match(await page.textContent('.backdrop'), /Skip 1 year\?/);
    await page.click('[data-a="go"]');
    await page.waitForSelector('text=Your year in review');
    const s = await G(n => { const s = vq.game.state, e = s.ledger.slice(n); return { day: s.day, sal: e.filter(x => x.category === 'salary').length, inc: e.filter(x => x.category === 'rent_income').length, alive: s.status }; }, before.n);
    assert.equal(s.sal, 12); assert.equal(s.inc, 12); assert.equal(s.alive, 'alive');
    assert.ok(s.day - before.day >= 365);
    await page.click('[data-a="close"]');
  });

  await step('severe deprivation ends the run with an explanation; restart keeps unrelated data', async () => {
    await G(() => localStorage.setItem('someone.elses.data', 'keep me'));
    await G(() => vq.game.act(s => { s.pantry = {}; s.groceryPlan = null; }));
    await page.click('[data-a="year"]');
    await page.click('[data-a="go"]');
    await page.waitForSelector('text=Your year ended early');
    await page.click('[data-a="close"]');
    await page.waitForSelector('text=This life has ended');
    assert.equal(await page.isVisible('.backdrop .m-close'), false, 'the end screen can\'t be dismissed');
    assert.match(await page.textContent('.backdrop'), /Days without enough food/);
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('text=This life has ended'), true);
    await Promise.all([page.waitForNavigation(), page.click('[data-a="restart"]')]);
    await boot();
    assert.equal(await G(() => [vq.game.state.status, vq.game.state.day].join()), 'alive,0');
    assert.equal(await G(() => localStorage.getItem('someone.elses.data')), 'keep me');
  });

  await step('a real Round 2 save loads, migrates and plays', async () => {
    const raw = readFileSync(new URL('../tests/fixtures/round2_save.json', import.meta.url), 'utf8');
    await G(r => localStorage.setItem('vanquest.save.v1', r), raw);
    await page.reload(); await boot();
    const s = await G(() => ({ v: vq.game.state.version, h: vq.game.state.housing.kind, f: vq.game.state.furniture.length, l: Object.keys(vq.game.state.academy.lessons) }));
    assert.deepEqual(s, { v: 3, h: 'rent', f: 2, l: ['budgeting'] });   // migrated through to save v3 (Round 4)
    await G(() => vq.router.location('home_apartment'));
    await page.waitForFunction(() => game.scene.isActive('Home'));
    assert.equal(await G(() => game.scene.getScene('Home').placed.length), 1, 'the Round 2 plant is still placed in the flat');
    await G(() => game.scene.getScene('Home').leave());
  });

  await step('interrupted interactions: closing a confirm charges nothing', async () => {
    await addFunds(100000);
    const w0 = await wallet();
    await G(() => vq.router.dealership());
    await page.click('[data-a="buy"][data-id="hatch"]');
    await closeUi();
    assert.equal(await wallet(), w0);
    assert.equal(await G(() => vq.game.state.vehicles.length), 0);
  });

  assert.deepEqual(problems, [], 'no console errors/warnings');
  console.log('\nround 3 smoke test passed');
} finally {
  await browser.close();
  server.close();
}
