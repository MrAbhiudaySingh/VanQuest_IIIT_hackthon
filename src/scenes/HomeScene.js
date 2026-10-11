// Interiors, built from src/data/homes.js: every home (with its computer, stable id) and the
// walk-in furniture showroom (SHOWROOMS, with Farah behind the counter).
// Access (sim/property.js canEnter) is enforced HERE, not only by the router: a home you don't
// own or rent — or one with a tenant — refuses to load and sends you back outside.
// Inside, you can arrange furniture (F) and use the computer.
import { HOMES, SHOWROOMS } from '../data/homes.js';
import { ITEMS } from '../data/catalog.js';
import { NavGrid } from '../world/nav.js';
import { makePlayer, PlayerController, frameOf, applyOutfit } from '../world/actors.js';
import { game, ui, router, hud } from '../app.js';
import { furnitureIn, furnitureStored, placeFurniture, storeFurniture } from '../sim/inventory.js';
import { canFurnish, canEnter, homeId as currentHome } from '../sim/property.js';
import { esc, why } from '../ui/core.js';
import { pieces, solidRects, pcSpot, doorSpot, doorOf } from '../world/homeLayout.js';

const T = 16;   // keep in sync with homeLayout.T
const INTERIOR = { wallTop: 0, wall: 1, wallBase: 2, floor: { carpet: 3, lino: 4, wood: 5, parquet: 6, marble: 7 }, mat: 8, window: 9, monitor: 10, laptop: 11 };

export class HomeScene extends Phaser.Scene {
  constructor() { super('Home'); }

  init(data) {
    this.shopId = data.shopId ?? null;
    this.homeId = data.homeId ?? null;
    this.placeId = this.shopId ?? this.homeId;           // what the city door belongs to
    this.def = this.shopId ? SHOWROOMS[this.shopId] : HOMES[this.homeId];
    this.editing = null;   // { uid } while placing a stored piece
    // scene instances are reused between visits — drop objects from the last visit
    this.solidGroup = null; this.ctrl = null; this.player = null; this.ghost = null; this.keeper = null;
  }

  // Live rules (they can change while you're inside, e.g. after buying the place).
  get canEdit() { return !!this.homeId && canFurnish(game.state, this.homeId); }
  get livesHere() { return !!this.homeId && currentHome(game.state) === this.homeId; }

  create() {
    if (this.homeId) {
      const a = canEnter(game.state, this.homeId);
      if (!a.ok) { this.refused = true; ui.toast(why(a), 'warn'); return this.time.delayedCall(0, () => this.leave()); }
    }
    this.refused = false;
    this.readyAt = this.time.now + 300;
    const d = this.def, W = d.w, H = d.h;
    this.door = doorOf(d);
    this.drawRoom();
    this.room = this.add.layer();           // fixtures + furniture + computer (rebuilt on edits)
    this.buildContents();

    const ds = doorSpot(d);
    this.player = makePlayer(this, ds.x, ds.y);
    applyOutfit(this, this.player, game.state);
    if (d.keeper) {
      const k = d.keeper;
      this.keeper = this.add.sprite(k.x * T + 8, k.y * T + 14, 'chars', frameOf(k.char, 0, 'down')).setOrigin(0.5, 1).setDepth(5 + k.y / 100 + 0.005);
      this.add.text(k.x * T + 8, k.y * T - 4, `${k.name} · ${k.role}`, { fontFamily: 'KenneyMini', fontSize: '8px', color: '#ffffff', backgroundColor: '#10141fcc', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 1).setResolution(4).setDepth(50);
      this.talkZone = new Phaser.Geom.Rectangle(d.talk.x * T - 8, d.talk.y * T - 4, 32, 22);
    }
    this.physics.world.setBounds(0, 0, W * T, H * T);
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E,F,I,H,P,C,O,L,N,R', false);
    this.physics.add.collider(this.player, this.solidGroup);
    this.ctrl = new PlayerController(this, this.player, this.nav, this.keys);
    this.keys.E.on('down', () => !ui.isOpen && this.interact());
    this.keys.F.on('down', () => !ui.isOpen && this.toggleEditor());
    for (const [k, fn] of [['I', 'inventory'], ['H', 'history'], ['P', 'pantry'], ['C', 'wardrobe'], ['O', 'finances'], ['L', 'life'], ['N', 'news'], ['R', 'retire']]) this.keys[k].on('down', () => !ui.isOpen && router[fn]());
    this.input.on('pointerdown', p => this.onClick(p));
    this.input.on('pointermove', p => this.onMove(p));

    const cam = this.cameras.main;
    const zoom = Math.max(1, Math.min(3, Math.floor(Math.min(960 / (W * T), 500 / (H * T + 40)))));   // whole-number zoom keeps pixels crisp
    cam.setZoom(zoom).setRoundPixels(true).setBackgroundColor('#0b0d13');
    // small rooms sit centred on screen; big ones scroll with the player
    if (W * T * zoom <= 960 && (H * T + 40) * zoom <= 540) cam.centerOn(W * T / 2, (H * T - 30) / 2);
    else cam.setBounds(0, -40, W * T, H * T + 40).startFollow(this.player, true, 0.2, 0.2);
    this.title = this.add.text(W * T / 2, -6, this.titleText(), { fontFamily: 'KenneyMini', fontSize: '8px', color: '#f5cf6b' }).setOrigin(0.5, 1).setResolution(4).setDepth(50);
    this.panel = this.makeEditorPanel();
    const offUi = ui.onChange(open => open && this.ctrl.stop());
    const offGame = game.on(state => { applyOutfit(this, this.player, state); this.title.setText(this.titleText()); });
    this.events.once('shutdown', () => { offUi(); offGame(); this.panel.remove(); hud.showPrompt(null); });
    this.promptLabel = undefined;
  }

  titleText() {
    if (this.shopId) return this.def.title;
    if (this.livesHere) return `${this.def.title}  —  YOUR HOME`;
    return `${this.def.title}  —  YOU OWN THIS (VACANT)`;
  }

  // ---------------------------------------------------------------- room
  drawRoom() {
    const d = this.def, W = d.w, H = d.h, img = (x, y, f, key = 'interior') => this.add.image(x * T, y * T, key, f).setOrigin(0).setDepth(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = x === 0 || x === W - 1 || y === 0 || y === H - 1;
      if (y === H - 1 && x === this.door.x) img(x, y, INTERIOR.mat);
      else if (edge) img(x, y, INTERIOR.wallTop);
      else if (y === 1) img(x, y, x % 4 === 2 && x < W - 2 ? INTERIOR.window : INTERIOR.wallBase);
      else img(x, y, INTERIOR.floor[d.floor]);
    }
  }

  // Draw fixtures, desk + computer and placed furniture; rebuild collision and nav.
  buildContents() {
    this.room.removeAll(true);
    const d = this.def, placedRaw = this.homeId ? furnitureIn(game.state, this.homeId) : [];
    this.occupied = new Set();
    for (const p of pieces(d, placedRaw)) {
      p.sprite.forEach((row, r) => row.forEach((f, c) => {
        this.room.add(this.add.image((p.x + c) * T, (p.y + r) * T, 'indoor', f).setOrigin(0).setDepth(p.flat ? 1 : 5 + (p.y + r) / 100));
        if (!p.flat) this.occupied.add(`${p.x + c},${p.y + r}`);
      }));
    }
    const pc = d.computer;
    if (pc) {
      this.room.add(this.add.image(pc.x * T, pc.y * T - 6, 'interior', pc.device === 'laptop' ? INTERIOR.laptop : INTERIOR.monitor).setOrigin(0).setDepth(6));
      const spot = pcSpot(d);
      this.pcZone = new Phaser.Geom.Rectangle(spot.x - 14, spot.y - 14, 28, 18);
    } else this.pcZone = new Phaser.Geom.Rectangle(-99, -99, 0, 0);
    const ds = doorSpot(d);
    this.doorZone = new Phaser.Geom.Rectangle(ds.x - 12, ds.y - 12, 24, 30);
    this.placed = placedRaw.map(f => ({ ...f, w: ITEMS[f.itemId].sprite[0].length, h: ITEMS[f.itemId].sprite.length }));
    this.solidRects = solidRects(d, placedRaw);
    this.nav = new NavGrid(d.w * T, d.h * T, this.solidRects);
    if (this.ctrl) this.ctrl.nav = this.nav;
    this.solidGroup ??= this.physics.add.staticGroup();
    this.solidGroup.clear(true, true);
    for (const r of this.solidRects) this.solidGroup.add(this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h));
  }

  // ---------------------------------------------------------------- interaction
  zone() {
    const p = this.player;
    if (this.talkZone?.contains(p.x, p.y)) return { kind: 'keeper', label: `Talk to ${this.def.keeper.name} (${this.def.keeper.role})` };
    if (this.pcZone.contains(p.x, p.y)) return { kind: 'pc', label: `Use ${this.def.computer.device}` };
    if (this.doorZone.contains(p.x, p.y)) return { kind: 'door', label: 'Leave' };
    return null;
  }

  interact() {
    // the E press that opened the door also reaches this scene — ignore it (you spawn on the exit mat)
    if (this.time.now < this.readyAt) return;
    const z = this.zone();
    if (z?.kind === 'door') return this.leave();
    if (z?.kind === 'keeper') { this.ctrl.stop(); return router.shop(this.def.keeper.shop); }
    if (z?.kind === 'pc') {
      this.ctrl.stop();
      router.computer(this.def.computer, this.def);
    }
  }

  leave() {
    if (!this.refused) this.stopEditing();
    this.scene.stop();
    this.scene.wake('City', { from: this.placeId });
  }

  onClick(pointer) {
    if (ui.isOpen) return;
    const pt = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tx = Math.floor(pt.x / T), ty = Math.floor(pt.y / T);
    if (this.editing) return this.tryPlace(tx, ty);
    if (this.panel.dataset.open === '1') {      // arrange mode: click a placed piece to store it
      const f = this.placed.find(f => tx >= f.x && tx < f.x + f.w && ty >= f.y && ty < f.y + f.h);
      if (f) { game.act(s => storeFurniture(s, f.uid)); this.buildContents(); this.renderPanel(); ui.toast(`${ITEMS[f.itemId].name} moved to storage.`, 'ok', 1800); }
      return;
    }
    // click the shopkeeper / desk / door → walk there and use it
    const k = this.def.keeper, pc = this.def.computer;
    if (k && Math.abs(tx - k.x) <= 1 && ty >= k.y - 1 && ty <= k.y + 1) return this.ctrl.goTo(this.def.talk.x * T + 8, this.def.talk.y * T + 10, () => this.interact());
    if (pc && tx >= pc.x && tx < pc.x + 2 && ty >= pc.y - 1 && ty <= pc.y) return this.ctrl.goTo(pcSpot(this.def).x, pcSpot(this.def).y, () => this.interact());
    if (tx === this.door.x && ty >= this.def.h - 2) return this.ctrl.goTo(doorSpot(this.def).x, doorSpot(this.def).y, () => this.leave());
    if (!this.ctrl.goTo(pt.x, pt.y)) ui.toast("Can't reach that spot.", 'warn', 1500);
  }

  // ---------------------------------------------------------------- furniture editor
  makeEditorPanel() {
    const el = document.createElement('div');
    el.className = 'modal narrow furniture-editor';
    Object.assign(el.style, { position: 'absolute', right: '10px', top: '60px', width: '280px', maxHeight: '70%', pointerEvents: 'auto', display: 'none' });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'done') this.toggleEditor();
      if (b.dataset.a === 'place') { this.editing = { uid: b.dataset.uid }; this.makeGhost(); this.renderPanel(); }
      if (b.dataset.a === 'cancel') { this.stopEditing(); this.renderPanel(); }
    });
    document.getElementById('ui').append(el);
    return el;
  }

  toggleEditor() {
    if (this.shopId) return;
    if (!this.canEdit) return ui.toast('You can arrange furniture only in your own home or a vacant property you own.', 'info');
    const open = this.panel.dataset.open !== '1';
    this.panel.dataset.open = open ? '1' : '0';
    this.panel.style.display = open ? 'flex' : 'none';
    if (!open) this.stopEditing();
    this.ctrl.stop();
    this.renderPanel();
  }

  renderPanel() {
    if (this.panel.dataset.open !== '1') return;
    const stored = furnitureStored(game.state);
    const list = stored.length ? stored.map(f => `<div class="row between" style="margin:4px 0"><span>${esc(ITEMS[f.itemId].name)}</span>
        <button class="btn sm ${this.editing?.uid === f.uid ? 'primary' : ''}" data-a="place" data-uid="${f.uid}">${this.editing?.uid === f.uid ? 'Placing…' : 'Place'}</button></div>`).join('')
      : '<div class="empty">No furniture in storage. Buy some at Hearth Home & Furniture.</div>';
    this.panel.innerHTML = `<div class="m-head"><h2 style="font-size:16px">Arrange furniture</h2><div class="spacer"></div><button class="m-close" data-a="done">X</button></div>
      <div class="m-body"><p class="muted">${this.editing ? 'Click a free floor tile to place it (green = fits).' : 'Pick a piece from storage, or click a placed piece to put it back in storage.'}</p>${list}
      ${this.editing ? '<button class="btn" data-a="cancel">Cancel placing</button>' : ''}</div>`;
  }

  makeGhost() {
    this.ghost?.destroy();
    const it = ITEMS[game.state.furniture.find(f => f.uid === this.editing.uid).itemId];
    this.ghost = this.add.container(0, 0, it.sprite.flatMap((row, r) => row.map((f, c) => this.add.image(c * T, r * T, 'indoor', f).setOrigin(0)))).setDepth(40).setAlpha(0.75);
    this.ghost.item = it;
  }

  fits(tx, ty, it) {
    const w = it.sprite[0].length, h = it.sprite.length, pt = { x: Math.floor(this.player.x / T), y: Math.floor((this.player.y - 1) / T) };
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) {
      if (x < 1 || y < 2 || x > this.def.w - 2 || y > this.def.h - 2) return false;      // inside the floor
      if (x === this.door.x && y === this.def.h - 2) return false;                         // keep the door clear
      if (!it.flat && (this.occupied.has(`${x},${y}`) || (x === pt.x && y === pt.y))) return false;
    }
    if (!it.flat && this.pcZone.contains(tx * T + 8, ty * T + 8)) return false;              // keep the computer usable
    return true;
  }

  onMove(pointer) {
    if (!this.ghost) return;
    const pt = this.cameras.main.getWorldPoint(pointer.x, pointer.y), tx = Math.floor(pt.x / T), ty = Math.floor(pt.y / T);
    this.ghost.setPosition(tx * T, ty * T);
    this.ghost.list.forEach(i => i.setTint(this.fits(tx, ty, this.ghost.item) ? 0x9dffb0 : 0xff8080));
  }

  tryPlace(tx, ty) {
    if (!this.fits(tx, ty, this.ghost.item)) return ui.toast("It doesn't fit there.", 'warn', 1500);
    const uid = this.editing.uid;
    const r = game.act(s => placeFurniture(s, uid, this.homeId, tx, ty));
    if (!r.ok) ui.toast('You can\'t place furniture here.', 'warn');
    this.stopEditing();
    this.buildContents();
    this.renderPanel();
  }

  stopEditing() { this.editing = null; this.ghost?.destroy(); this.ghost = null; }

  update(_, dt) {
    if (this.refused) return;
    // access can change while inside (e.g. you list this place for rent) → step outside
    if (this.homeId && !canEnter(game.state, this.homeId).ok) { ui.toast(why(canEnter(game.state, this.homeId)), 'info'); this.refused = true; return this.leave(); }
    const locked = ui.isOpen || this.panel.dataset.open === '1';
    this.ctrl.update(Math.min(dt, 50), locked);
    const label = locked ? null : this.zone()?.label ?? null;
    if (label !== this.promptLabel) hud.showPrompt(this.promptLabel = label, () => this.interact());
  }
}
