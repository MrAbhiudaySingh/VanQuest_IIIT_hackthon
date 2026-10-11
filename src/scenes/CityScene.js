import { LOCATIONS, DISTRICTS } from '../data/locations.js';
import { SHOPS } from '../data/catalog.js';
import { NavGrid } from '../world/nav.js';
import { createCharAnims, makePlayer, PlayerController, Walker, frameOf, applyOutfit } from '../world/actors.js';
import { DriveController, CAR_BODY } from '../world/driving.js';
import { Traffic, signalFor } from '../world/traffic.js';
import { game, ui, router, hud, settings, REAL_SECONDS_PER_DAY } from '../app.js';
import { canTrigger, startEncounter } from '../sim/encounters.js';
import { activeVehicle, canDrive, chargeFuel, findVehicle } from '../sim/vehicles.js';
import { homeId } from '../sim/property.js';
import { AGENT } from '../data/properties.js';
import { BANK } from '../data/banking.js';
import { VEHICLES } from '../data/vehicles.js';
import { VEHICLE_ROWS } from '../data/artIndex.js';
import { why } from '../ui/core.js';
import { KMH } from '../ui/dealershipPanel.js';

const TILE = 16;
const ZOOM = 2;

// Tile layers in draw order; anything in Foreground is drawn over characters.
const BELOW = ['Ground', 'Grass', 'Roads', 'Buildings', 'BuildingDetails', 'Props'];

const SIGN_STYLES = {
  plaque:   { bg: 0x1d2433, fg: '#f2f2f2', border: 0x0d1018 },
  street:   { bg: 0x2f6b4f, fg: '#ffffff', border: 0x173a2a },
  landmark: { bg: 0x10141f, fg: '#f5cf6b', border: 0xb8913a },
};

// Tipster can't approach here (tile rects): the financial block, home plots, the estate.
const SAFE_ZONES = [[21, 0, 24, 20], [0, 23, 45, 12], [48, 23, 20, 27]].map(([x, y, w, h]) => new Phaser.Geom.Rectangle(x * TILE, y * TILE, w * TILE, h * TILE));
const TIPSTER_CHAR = 2, TIPSTER_TINT = 0xffd9a0;
const ENCOUNTER_CHECK_MS = 15000, ENCOUNTER_MIN_GAP_MS = 60000;

export class CityScene extends Phaser.Scene {
  constructor() { super('City'); }

  preload() {
    this.load.tilemapTiledJSON('city', 'maps/city.tmj');
    this.load.image('kenney', 'Assets/kenney_rpgUrbanKit/Tilemap/tilemap_packed.png');
    this.load.image('extra', 'art/vanquest_extra.png');
    this.load.spritesheet('chars', 'Assets/kenney_rpgUrbanKit/Tilemap/tilemap_packed.png', { frameWidth: TILE, frameHeight: TILE });
    this.load.spritesheet('indoor', 'art/kenney_roguelike_indoor.png', { frameWidth: 16, frameHeight: 16, spacing: 1 });
    this.load.spritesheet('interior', 'art/vanquest_interior.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('outfits', 'art/player_outfits.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('vehicles', 'art/vanquest_vehicles.png', { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet('topcars', 'art/vanquest_topcars.png', { frameWidth: 64, frameHeight: 24 });
  }

  create() {
    const map = this.make.tilemap({ key: 'city' });
    const tilesets = [map.addTilesetImage('kenney_rpg_urban', 'kenney'), map.addTilesetImage('vanquest_extra', 'extra')];
    this.layers = Object.fromEntries(BELOW.map((name, i) => [name, map.createLayer(name, tilesets).setDepth(i)]));
    map.createLayer('Foreground', tilesets).setDepth(30);
    this.map = map;
    createCharAnims(this.anims);

    this.createSigns(map);
    const rects = map.getObjectLayer('Collision').objects.map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }));
    rects.push(...this.createDisplayCars(map));             // showroom cars are solid too
    this.nav = new NavGrid(map.widthInPixels, map.heightInPixels, rects);
    this.createPlayer(map);
    const solids = this.createColliders(rects);
    this.zones = this.readZones(map);
    this.createNpcs(map);
    this.animateWorld();
    this.createDriving(map, rects, solids);
    applyOutfit(this, this.player, game.state);
    game.on(state => { applyOutfit(this, this.player, state); this.drive.sync(state); });

    const w = map.widthInPixels, h = map.heightInPixels;
    this.physics.world.setBounds(0, 0, w, h);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, w, h).setZoom(ZOOM).startFollow(this.player, true, 0.15, 0.15).setRoundPixels(true);
    this.createMinimap(w, h);

    // enableCapture=false so typing in UI inputs (W, A, S, D, E…) works normally
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E,M,I,H,P,C,O,L,N,R', false);
    this.keys.E.on('down', () => !ui.isOpen && this.interact());
    this.keys.M.on('down', () => !ui.isOpen && this.minimap.setVisible(!this.minimap.visible));
    for (const [k, fn] of [['I', 'inventory'], ['H', 'history'], ['P', 'pantry'], ['C', 'wardrobe'], ['O', 'finances'], ['L', 'life'], ['N', 'news'], ['R', 'retire']]) this.keys[k].on('down', () => !ui.isOpen && router[fn]());
    this.ctrl = new PlayerController(this, this.player, this.nav, this.keys);
    this.input.on('pointerdown', p => this.onClick(p));
    this.events.on('path-blocked', () => ui.toast('Path blocked — try another spot.', 'warn', 2000));
    ui.onChange(open => { if (open) this.ctrl.stop(); });

    this.activeZone = null;
    this.dayTimer = 0;
    this.encounterTimer = 0;
    this.lastEncounterAt = -ENCOUNTER_MIN_GAP_MS;
    this.saveTimer = 0;
    this.events.on('wake', (_, data) => this.onWake(data));
    this.scene.launch('Hud');
  }

  // ---------------------------------------------------------------- player
  createPlayer(map) {
    const spawn = map.getObjectLayer('Spawn').objects.find(o => o.name === 'player_start');
    const saved = game.state.player;
    const start = saved && this.nav.clearAt(saved.x, saved.y) ? saved : spawn;
    this.player = makePlayer(this, start.x, start.y);
  }

  createColliders(rects) {
    const solids = this.physics.add.staticGroup();
    for (const o of rects) solids.add(this.add.zone(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h));
    this.physics.add.collider(this.player, solids);
    return solids;
  }

  onWake(data) {
    // back from a home interior: stand in front of that home's door
    const z = this.zones.find(z => z.id === data?.from);
    if (z) this.player.setVelocity(0, 0).setPosition(z.rect.centerX, z.rect.y + 10);
    this.ctrl.stop();
    this.activeZone = null;
    this.promptLabel = undefined;
    this.readyAt = this.time.now + 300;     // the E that left the building shouldn't re-enter it
  }

  // ---------------------------------------------------------------- signs
  createSigns(map) {
    for (const o of map.getObjectLayer('Signs').objects) {
      const style = SIGN_STYLES[o.properties?.find(p => p.name === 'style')?.value] ?? SIGN_STYLES.plaque;
      const cx = Math.round(o.x + o.width / 2), cy = Math.round(o.y + o.height / 2);
      const text = this.add.text(cx, cy, o.text.text, { fontFamily: 'KenneyMini', fontSize: '8px', color: style.fg }).setOrigin(0.5).setDepth(26);
      this.add.rectangle(cx, cy, Math.ceil(text.width) + 6, 10, style.bg).setStrokeStyle(1, style.border).setDepth(25);
    }
  }

  // ---------------------------------------------------------------- zones
  readZones(map) {
    const zones = map.getObjectLayer('Interactions').objects.map(o => {
      const prop = n => o.properties?.find(p => p.name === n)?.value;
      const id = prop('locationId'), loc = LOCATIONS[id];
      if (!loc) console.warn(`[city] map zone "${id}" has no entry in locations.js`);
      else if (prop('displayName') !== loc.name) console.warn(`[city] name mismatch for ${id}: map "${prop('displayName')}" vs code "${loc.name}"`);
      return { id, kind: 'entrance', rect: new Phaser.Geom.Rectangle(o.x, o.y, o.width, o.height) };
    });
    for (const id of Object.keys(LOCATIONS))
      if (!zones.some(z => z.id === id)) console.warn(`[city] location "${id}" has no entrance on the map`);
    return zones;
  }

  zoneLabel(z) {
    if (z.kind === 'keeper') { const k = SHOPS[z.id].keeper; return `Talk to ${k.name} (${k.role})`; }
    if (z.kind === 'agent' || z.kind === 'dealer' || z.kind === 'banker') return `Talk to ${z.name} (${z.role})`;
    if (z.kind === 'car') return `Get in your ${VEHICLES[activeVehicle(game.state).model].name}`;
    if (z.kind === 'driving') return 'Get out of the car';
    const loc = LOCATIONS[z.id];
    if (loc.kind === 'home') {
      const own = game.state.properties[z.id];
      if (z.id === homeId(game.state)) return 'Go home';
      if (own && ['let', 'listed'].includes(own.status)) return `Manage your tenancy at ${loc.name}`;
      return own ? `Enter ${loc.name} (yours, vacant)` : `${loc.name} — not yours`;
    }
    if (loc.kind === 'dealership') return 'Browse the showroom';
    if (loc.kind === 'bank') return 'Enter Nidhi Bank';
    if (loc.kind === 'school') return `Look at ${loc.name}`;
    if (loc.kind === 'investing') return 'Enter the trading desk';
    if (loc.kind === 'college') return 'Visit admissions';
    return `Enter ${loc.name}`;
  }

  interact(zone = this.activeZone) {
    if (ui.isOpen || game.state.status !== 'alive' || this.time.now < (this.readyAt ?? 0)) return;
    // getting in/out ignores a second toggle within 250 ms (a double keydown would undo it instantly)
    const toggle = fn => { if (this.time.now - (this.lastCarToggle ?? -1e9) < 250) return; this.lastCarToggle = this.time.now; fn(); };
    if (this.drive.driving) return toggle(() => this.exitCar());   // any interaction while driving = get out first
    if (zone?.kind === 'car') return toggle(() => this.enterCar());
    if (zone?.kind === 'agent') { this.ctrl.stop(); return router.property(); }
    if (zone?.kind === 'dealer') { this.ctrl.stop(); return router.dealership(); }
    if (zone?.kind === 'banker') { this.ctrl.stop(); return router.bank(); }
    if (zone?.id) { this.ctrl.stop(); return router.location(zone.id); }
  }

  // ---------------------------------------------------------------- driving
  createDriving(map, rects, solids) {
    const grass = this.layers.Grass;
    grass.setCollisionByExclusion([-1]);
    // a nav grid for the car's body: walls/props + every grass tile, so cars are never placed inside them
    const grassRects = grass.filterTiles(t => t.index !== -1).map(t => ({ x: t.pixelX, y: t.pixelY, w: 16, h: 16 }));
    this.carNav = new NavGrid(map.widthInPixels, map.heightInPixels, [...rects, ...grassRects], CAR_BODY);
    const d = map.getObjectLayer('NPCs').objects.find(o => o.type === 'car_delivery');
    this.drive = new DriveController(this, this.carNav, solids, grass, { x: d.x, y: d.y });
    this.drive.sync(game.state);
  }

  enterCar() {
    const v = activeVehicle(game.state), ok = canDrive(game.state, v);
    if (!ok.ok) return ui.toast(why(ok), 'warn', 2600);
    this.ctrl.stop();
    this.drive.enter();
    this.player.setVisible(false);
    this.player.body.enable = false;
    this.cameras.main.startFollow(this.drive.sprite, true, 0.15, 0.15);
    this.stuckHinted = false;
  }

  exitCar() {
    const { distance, parked } = this.drive.exit();
    const v = activeVehicle(game.state);
    game.act(s => { const car = findVehicle(s, v.uid); car.parked = parked; return chargeFuel(s, v.uid, distance); });
    // step out beside the car on a walkable spot
    const cx = this.drive.sprite.x, cy = this.drive.sprite.y;
    let spot = [[-22, 0], [22, 0], [0, 14], [0, -18], [-22, 14], [22, 14]].map(([dx, dy]) => ({ x: cx + dx, y: cy + dy })).find(p => this.nav.clearAt(p.x, p.y));
    if (!spot) { const c = this.nav.nearestWalkable(this.nav.cellOf(cx, cy), () => true, 20); spot = c === null ? { x: cx, y: cy } : this.nav.centre(c); }
    this.player.body.enable = true;
    this.player.setVisible(true).setVelocity(0, 0).setPosition(spot.x, spot.y);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    hud.setDriving(null);
  }

  // ---------------------------------------------------------------- click to move
  onClick(pointer) {
    if (ui.isOpen || !pointer.leftButtonDown() || game.state.status !== 'alive') return;
    if (this.drive.driving) return ui.toast('You\'re driving — steer with WASD/arrows. Press E to get out and walk.', 'info', 2200);
    const mm = this.minimap;
    const inMini = mm.visible && pointer.x >= mm.x && pointer.x < mm.x + mm.width && pointer.y >= mm.y && pointer.y < mm.y + mm.height;
    const pt = (inMini ? mm : this.cameras.main).getWorldPoint(pointer.x, pointer.y);
    // clicking a shopkeeper walks up to them and opens their shop
    // clicking a shopkeeper / the agent / the salesperson walks up to them and talks
    const hit = s => Math.abs(s.x - pt.x) < 9 && pt.y < s.y + 2 && pt.y > s.y - 17;
    const keeper = !inMini && this.keepers.find(k => hit(k.sprite));
    if (keeper && this.ctrl.goTo(keeper.stand.x, keeper.stand.y, () => router.location(keeper.shop))) return;
    const helper = !inMini && this.helpers.find(h => hit(h.sprite));
    if (helper && this.ctrl.goTo(helper.stand.x, helper.stand.y, () => this.interact(helper.zone))) return;
    // clicking your parked car walks to it and gets in
    if (!inMini && this.drive.near(pt.x, pt.y, 22)) {
      const c = this.drive.sprite;
      if (this.ctrl.goTo(c.x, c.y + 10, () => this.enterCar())) return;
    }
    const r = this.ctrl.goTo(pt.x, pt.y);
    if (!r) ui.toast("Can't find a way there.", 'warn', 2000);
    else if (r.adjusted) this.floatText(r.points.at(-1), 'nearest spot');
  }

  floatText({ x, y }, msg) {
    const t = this.add.text(x, y - 12, msg, { fontFamily: 'KenneyMini', fontSize: '8px', color: '#ffd28a' }).setOrigin(0.5).setDepth(40).setResolution(2);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- NPCs
  createNpcs(map) {
    const objs = map.getObjectLayer('NPCs').objects;
    const prop = (o, n) => o.properties?.find(p => p.name === n)?.value;
    const pois = objs.filter(o => o.type === 'poi').map(o => ({ x: o.x, y: o.y }));
    // property agent below the apartments, salesperson on the Roadstar forecourt
    const special = { agent: { ...AGENT, zone: 'agent' }, dealer: { name: 'Imran', role: 'Car sales', char: 4, zone: 'dealer' }, banker: { ...BANK.banker, zone: 'banker' } };
    this.helpers = objs.filter(o => special[o.type]).map(o => {
      const h = special[o.type];
      const sprite = this.add.sprite(o.x, o.y, 'chars', frameOf(h.char, 0, 'down')).setOrigin(0.5, 1).setDepth(20 + o.y / 10000);
      const label = this.add.text(o.x, o.y - 18, `${h.name} · ${h.role}`, { fontFamily: 'KenneyMini', fontSize: '8px', color: '#ffffff', backgroundColor: '#10141fcc', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 1).setDepth(35).setResolution(2).setAlpha(0);
      this.idleTurns(sprite, h.char, ['down', 'left', 'down', 'right']);
      return { sprite, label, stand: { x: o.x, y: o.y + 12 }, zone: { id: { dealer: 'car_dealership', banker: 'bank', agent: 'agent' }[o.type], kind: h.zone, name: h.name, role: h.role, rect: new Phaser.Geom.Rectangle(o.x - 18, o.y - 14, 36, 30) } };
    });
    this.keepers = objs.filter(o => o.type === 'shopkeeper').map(o => {
      const shop = prop(o, 'shop'), k = SHOPS[shop].keeper;
      const sprite = this.add.sprite(o.x, o.y, 'chars', frameOf(k.char, 0, 'down')).setOrigin(0.5, 1).setDepth(20 + o.y / 10000);
      const label = this.add.text(o.x, o.y - 18, `${k.name} · ${k.role}`, { fontFamily: 'KenneyMini', fontSize: '8px', color: '#ffffff', backgroundColor: '#10141fcc', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 1).setDepth(35).setResolution(2).setAlpha(0);
      // the spot the player walks to when clicking them: just in front
      const stand = { x: o.x, y: o.y + 12 };
      const keeper = { shop, sprite, label, char: k.char, stand, zone: { id: shop, kind: 'keeper', rect: new Phaser.Geom.Rectangle(o.x - 18, o.y - 14, 36, 30) } };
      this.idleTurns(keeper.sprite, k.char, ['down', 'left', 'right', 'down']);
      return keeper;
    });
    this.idlers = objs.filter(o => o.type === 'idler').map(o => {
      const char = +prop(o, 'char'), facing = prop(o, 'facing');
      const s = this.add.sprite(o.x, o.y, 'chars', frameOf(char, 0, facing)).setOrigin(0.5, 1).setDepth(20 + o.y / 10000);
      this.idleTurns(s, char, [facing, facing, 'down', facing]);
      return s;
    });
    this.walkers = [1, 2, 3, 4, 5, 3].map((char, i) => {
      const p = pois[(i * 3) % pois.length];
      return new Walker(this, this.nav, char, pois, p.x, p.y);
    });
    this.traffic = new Traffic(this, objs.filter(o => o.type === 'car_lane'), map.widthInPixels, map.heightInPixels);
    this.pois = pois;
  }

  // Showroom cars on the Roadstar forecourt (decorative but solid). Returns their collision rects.
  createDisplayCars(map) {
    return map.getObjectLayer('NPCs').objects.filter(o => o.type === 'display_car').map(o => {
      const model = o.properties.find(p => p.name === 'model').value;
      this.add.image(o.x, o.y, 'vehicles', VEHICLE_ROWS.indexOf(model) * 8 + 2).setOrigin(0.5, 0.75).setDepth(20 + o.y / 10000);
      return { x: o.x - CAR_BODY.w / 2, y: o.y - CAR_BODY.h, w: CAR_BODY.w, h: CAR_BODY.h };
    });
  }

  // NPCs "breathe": every few seconds they look around (Kenney chars have no idle cycle)
  idleTurns(sprite, char, facings) {
    let i = 0;
    this.time.addEvent({ delay: 2200 + Math.random() * 2000, loop: true, callback: () => {
      sprite.setFrame(frameOf(char, 0, facings[i++ % facings.length]));
    } });
  }

  animateWorld() {
    // traffic lights show the real signal: the light north of a junction = north–south traffic,
    // the one south of it = east–west (the Kenney tiles can't change colour, so a lamp is drawn on top)
    const props = this.layers.Props;
    this.lamps = props.filterTiles(t => t.index === 410).map(t => ({ axis: t.y < 20 ? 'v' : 'h',
      dot: this.add.rectangle(t.pixelX + 11, t.pixelY + 4, 3, 3, 0xff4040).setDepth(7) }));
    // fountains sparkle
    for (const t of props.filterTiles(t => t.index === 231)) {
      for (let k = 0; k < 3; k++) {
        const d = this.add.rectangle(t.pixelX + 5 + k * 3, t.pixelY + 8, 1, 1, 0xffffff).setDepth(6).setAlpha(0);
        this.tweens.add({ targets: d, y: t.pixelY + 3, alpha: { from: 0.9, to: 0 }, duration: 900, delay: k * 300, repeat: -1 });
      }
    }
  }

  // ---------------------------------------------------------------- tipster
  maybeEncounter(dt) {
    if ((this.encounterTimer += dt) < ENCOUNTER_CHECK_MS) return;
    this.encounterTimer = 0;
    const now = this.time.now;
    if (this.tipster || now - this.lastEncounterAt < ENCOUNTER_MIN_GAP_MS || !canTrigger(game.state)) return;
    if (SAFE_ZONES.some(r => r.contains(this.player.x, this.player.y)) || Math.random() < 0.4) return;
    this.spawnTipster();
  }

  spawnTipster() {
    // appear a few tiles away on a reachable spot, then walk up to the player
    const ang = Math.random() * Math.PI * 2, px = this.player.x + Math.cos(ang) * 110, py = this.player.y + Math.sin(ang) * 80;
    const c = this.nav.nearestWalkable(this.nav.cellOf(px, py), n => this.nav.comp[n] === this.nav.comp[this.nav.startCell(this.player.x, this.player.y)]);
    if (c === null) return;
    const at = this.nav.centre(c);
    const s = this.add.sprite(at.x, at.y, 'chars', frameOf(TIPSTER_CHAR, 0, 'down')).setOrigin(0.5, 1).setTint(TIPSTER_TINT);
    const bubble = this.add.text(at.x, at.y - 18, 'Psst! Got a minute?', { fontFamily: 'KenneyMini', fontSize: '8px', color: '#10141f', backgroundColor: '#fff3d6', padding: { x: 3, y: 2 } })
      .setOrigin(0.5, 1).setDepth(36).setResolution(2);
    this.tipster = { sprite: s, bubble, age: 0, repath: 0, facing: 'down', path: null };
    this.lastEncounterAt = this.time.now;
  }

  updateTipster(dt) {
    const t = this.tipster;
    if (!t) return;
    const s = t.sprite, p = this.player;
    t.age += dt;
    t.bubble.setPosition(s.x, s.y - 18);
    s.setDepth(20 + s.y / 10000);
    if (t.leaving) {
      t.bubble.setVisible(false);
      s.alpha -= dt / 1200;
      if (s.alpha <= 0) { s.destroy(); t.bubble.destroy(); this.tipster = null; }
      return;
    }
    if (t.age > 12000) { t.leaving = true; return; }   // player walked away
    if (Phaser.Math.Distance.Between(s.x, s.y, p.x, p.y) < 20 && !ui.isOpen) {
      s.setFrame(frameOf(TIPSTER_CHAR, 0, p.x < s.x ? 'left' : 'right'));
      this.ctrl.stop();
      const rec = game.act(st => startEncounter(st));
      router.encounter(rec.uid);
      t.leaving = true;
      return;
    }
    if ((t.repath -= dt) <= 0) { const r = this.nav.findPath(s.x, s.y, p.x, p.y); t.path = r && r.points.length > 1 ? { pts: r.points, i: 1 } : null; t.repath = 600; }
    if (!t.path || ui.isOpen) return;
    const w = t.path.pts[t.path.i];
    if (!w) return;
    const dx = w.x - s.x, dy = w.y - s.y, d = Math.hypot(dx, dy), step = 58 * dt / 1000;
    if (d <= step) { s.setPosition(w.x, w.y); t.path.i++; return; }
    s.x += dx / d * step; s.y += dy / d * step;
    t.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    s.anims.play(`c${TIPSTER_CHAR}-walk-${t.facing}`, true);
  }

  // ---------------------------------------------------------------- minimap
  createMinimap(w, h) {
    const mw = 180, mh = Math.round(mw * h / w);
    this.minimap = this.cameras.add(960 - mw - 10, 10, mw, mh).setZoom(mw / w).setBounds(0, 0, w, h).centerOn(w / 2, h / 2).setBackgroundColor(0x000000);
    this.minimap.setName('minimap');
    this.marker = this.add.circle(0, 0, 22, 0xff3b3b).setStrokeStyle(6, 0xffffff).setDepth(40);
    this.cameras.main.ignore(this.marker);
  }

  // ---------------------------------------------------------------- loop
  update(_, dt) {
    dt = Math.min(dt, 50);
    const dead = game.state.status !== 'alive', locked = ui.isOpen || dead, driving = this.drive.driving;
    this.ctrl.update(dt, locked || driving);
    if (driving) {
      const v = activeVehicle(game.state);
      if (locked) this.drive.sprite.setVelocity(0, 0); else this.drive.update(dt, this.keys, game.state, v);
      const c = this.drive.sprite;
      this.player.setPosition(c.x, c.y);                    // the player rides along (hidden)
      hud.setDriving({ name: VEHICLES[v.model].name, kmh: Math.round(this.drive.speed * KMH), stalled: this.drive.stalled });
      if (this.drive.stuckMs > 1500 && !this.stuckHinted) { this.stuckHinted = true; ui.toast('Stuck? Steer the opposite way to back off, or press E to get out.', 'info', 3000); }
    } else this.drive.update(dt, this.keys, game.state, null);
    this.marker.setPosition(this.player.x, this.player.y - 8);
    for (const w of this.walkers) if (!locked) w.update(dt);
    if (!locked) {
      const car = this.drive.view.visible ? { x: this.drive.sprite.x, y: this.drive.sprite.y - 8 } : null;   // your car, driven or parked
      this.traffic.update(dt, [this.player.visible ? this.player : null, car, ...this.walkers.map(w => w.sprite)]);
      for (const l of this.lamps) l.dot.setFillStyle(signalFor(l.axis, this.traffic.t) === 'green' ? 0x40ff70 : 0xff4040);
    }
    this.updateTipster(dt);

    // keepers show their name tag when you are close
    for (const k of [...this.keepers, ...this.helpers]) k.label.setAlpha(Phaser.Math.Distance.Between(k.sprite.x, k.sprite.y, this.player.x, this.player.y) < 56 ? 1 : 0);

    const px = this.player.x, py = this.player.y;
    // right next to your car, "get in" wins over a nearby door; otherwise doors/NPCs first
    const zone = driving ? { kind: 'driving', id: null }
      : this.drive.near(px, py, 18) ? { kind: 'car', id: null }
      : [...this.keepers, ...this.helpers].map(k => k.zone).find(z => z.rect.contains(px, py)) ?? this.zones.find(z => z.rect.contains(px, py))
        ?? (this.drive.near(px, py) ? { kind: 'car', id: null } : null);
    if (zone?.id !== this.activeZone?.id || zone?.kind !== this.activeZone?.kind) {
      this.activeZone = zone;
      const loc = zone && LOCATIONS[zone.id];
      this.events.emit('zone', loc ? { id: zone.id, name: loc.name, district: DISTRICTS[loc.district] } : null);
    }
    const label = !locked && zone ? this.zoneLabel(zone) : null;
    if (label !== this.promptLabel) hud.showPrompt(this.promptLabel = label, () => this.interact());

    if (locked) return;
    // passive time: one in-game day per REAL_SECONDS_PER_DAY of free roaming
    if (settings.passiveTime && (this.dayTimer += dt) >= REAL_SECONDS_PER_DAY * 1000) { this.dayTimer = 0; game.advance(1); }
    if (settings.randomEncounters && !driving) this.maybeEncounter(dt);
    if ((this.saveTimer += dt) > 4000 && !driving) { this.saveTimer = 0; game.state.player = { x: Math.round(px), y: Math.round(py) }; }
  }
}
