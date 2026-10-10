// Characters shared by CityScene and HomeScene: animations, the player controller
// (keyboard + click-to-move on a NavGrid), and simple wandering NPCs.
import { outfitRow } from '../data/artIndex.js';
import { equipped } from '../sim/wardrobe.js';

export const SPEED = 80;           // player px/s (keyboard and click-to-move)
export const PLAYER_CHAR = 0;      // Kenney character 0; NPCs use 1..5
const COL = { left: 23, down: 24, up: 25, right: 26 };
export const frameOf = (char, row, dir) => (char * 3 + row) * 27 + COL[dir];

export function createCharAnims(anims) {
  if (anims.exists('idle-down')) return;
  for (let c = 0; c < 6; c++) for (const dir of Object.keys(COL)) {
    anims.create({ key: `c${c}-idle-${dir}`, frames: [{ key: 'chars', frame: frameOf(c, 0, dir) }] });
    anims.create({ key: `c${c}-walk-${dir}`, frameRate: 8, repeat: -1, frames: [1, 0, 2, 0].map(r => ({ key: 'chars', frame: frameOf(c, r, dir) })) });
  }
  setPlayerAnims(anims, 0);
}

// The player's anims (`idle-<dir>`, `walk-<dir>`) come from art/player_outfits.png: one row per outfit,
// 12 frames in Kenney order (anim row × facing). Re-created when the outfit changes.
const DIR_INDEX = { left: 0, down: 1, up: 2, right: 3 };
function setPlayerAnims(anims, row) {
  if (anims.outfitRow === row) return;
  anims.outfitRow = row;
  for (const dir of Object.keys(DIR_INDEX)) {
    const f = r => ({ key: 'outfits', frame: row * 12 + r * 4 + DIR_INDEX[dir] });
    anims.remove(`idle-${dir}`); anims.remove(`walk-${dir}`);
    anims.create({ key: `idle-${dir}`, frames: [f(0)] });
    anims.create({ key: `walk-${dir}`, frameRate: 8, repeat: -1, frames: [1, 0, 2, 0].map(f) });
  }
}

export function applyOutfit(scene, sprite, state) {
  const row = outfitRow(equipped(state));
  if (scene.anims.outfitRow === row && sprite.texture.key === 'outfits') return;
  setPlayerAnims(scene.anims, row);
  const key = sprite.anims.currentAnim?.key ?? 'idle-down';
  sprite.setTexture('outfits', row * 12 + 1);
  sprite.anims.play(key, false);
}

// Facing with hysteresis: only switch axis when the other axis clearly dominates,
// so diagonal path segments don't flicker between two animations.
export function facingFrom(vx, vy, prev) {
  const ax = Math.abs(vx), ay = Math.abs(vy);
  if (ax > ay * 1.25) return vx < 0 ? 'left' : 'right';
  if (ay > ax * 1.25) return vy < 0 ? 'up' : 'down';
  if (!prev) return ax >= ay ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
  // ambiguous diagonal: keep the current facing if it still points along the motion
  const ok = { left: vx < 0, right: vx > 0, up: vy < 0, down: vy > 0 }[prev];
  return ok ? prev : ax >= ay ? (vx < 0 ? 'left' : 'right') : (vy < 0 ? 'up' : 'down');
}

export function makePlayer(scene, x, y) {
  const p = scene.physics.add.sprite(x, y, 'chars', frameOf(PLAYER_CHAR, 0, 'down')).setOrigin(0.5, 1).setDepth(20);
  p.body.setSize(10, 6).setOffset(3, 10);
  p.setCollideWorldBounds(true);
  return p;
}

// Drives the player from keyboard or a path. Keyboard always wins and cancels a path.
export class PlayerController {
  constructor(scene, sprite, nav, keys) {
    Object.assign(this, { scene, sprite, nav, keys });
    this.facing = 'down';
    this.path = null;
    this.marker = scene.add.ellipse(0, 0, 10, 5).setStrokeStyle(1.5, 0xffe08a).setFillStyle(0xffe08a, 0.25).setDepth(15).setVisible(false);
    scene.tweens.add({ targets: this.marker, scale: 1.35, alpha: 0.55, yoyo: true, repeat: -1, duration: 500 });
  }

  // Returns false if nothing reachable. onArrive runs once on reaching the end.
  goTo(x, y, onArrive = null) {
    const r = this.nav.findPath(this.sprite.x, this.sprite.y, x, y);
    if (!r) { this.stop(); return false; }
    this.path = { pts: r.points, i: 1, onArrive, goal: { x, y }, adjusted: r.adjusted, repaths: 0, best: Infinity, since: 0 };
    const end = r.points.at(-1);
    this.marker.setPosition(end.x, end.y - 1).setVisible(true).setStrokeStyle(1.5, r.adjusted ? 0xffa25c : 0xffe08a);
    return r;
  }

  stop() {
    this.path = null;
    this.marker.setVisible(false);
    this.sprite.setVelocity(0, 0);
  }

  update(dt, locked) {
    const s = this.sprite, k = this.keys;
    if (locked) { this.stop(); return this.anim(0, 0); }
    const kx = (k.D.isDown || k.RIGHT.isDown) - (k.A.isDown || k.LEFT.isDown);
    const ky = (k.S.isDown || k.DOWN.isDown) - (k.W.isDown || k.UP.isDown);
    if (kx || ky) {
      if (this.path) this.stop();
      const v = new Phaser.Math.Vector2(kx, ky).normalize().scale(SPEED);   // diagonal = same speed
      s.setVelocity(v.x, v.y);
      this.facing = kx ? (kx < 0 ? 'left' : 'right') : (ky < 0 ? 'up' : 'down');
      return this.anim(v.x, v.y);
    }
    if (!this.path) { s.setVelocity(0, 0); return this.anim(0, 0); }
    return this.follow(dt);
  }

  follow(dt) {
    const s = this.sprite, P = this.path;
    let tgt = P.pts[P.i];
    let dx = tgt.x - s.x, dy = tgt.y - s.y, d = Math.hypot(dx, dy);
    const step = SPEED * dt / 1000;
    // close enough to this waypoint → snap (avoids overshoot jitter) and move on
    while (d <= Math.max(step, 0.75)) {
      if (P.i === P.pts.length - 1) {
        // snap the sprite; physics re-syncs the body (with its offset) next step
        s.setVelocity(0, 0).setPosition(tgt.x, tgt.y);
        const cb = P.onArrive;
        this.stop();
        cb?.();
        return this.anim(0, 0);
      }
      P.i++; P.best = Infinity; P.since = 0;
      tgt = P.pts[P.i]; dx = tgt.x - s.x; dy = tgt.y - s.y; d = Math.hypot(dx, dy);
    }
    // stuck detection: no progress toward the waypoint for 350 ms → recompute
    if (d < P.best - 0.5) { P.best = d; P.since = 0; } else if ((P.since += dt) > 350) {
      if (++P.repaths > 3) { this.stop(); this.scene.events.emit('path-blocked'); return this.anim(0, 0); }
      const { goal, onArrive, repaths } = P;
      if (!this.goTo(goal.x, goal.y, onArrive)) return this.anim(0, 0);
      this.path.repaths = repaths;
      return this.anim(0, 0);
    }
    const vx = dx / d * SPEED, vy = dy / d * SPEED;
    s.setVelocity(vx, vy);
    this.facing = facingFrom(vx, vy, this.facing);
    return this.anim(vx, vy);
  }

  anim(vx, vy) {
    this.sprite.anims.play(`${vx || vy ? 'walk' : 'idle'}-${this.facing}`, true);
    this.sprite.setDepth(20 + this.sprite.y / 10000);
  }
}

// An NPC that strolls between points of interest using the same nav grid.
export class Walker {
  constructor(scene, nav, char, pois, x, y, speed = 34) {
    Object.assign(this, { scene, nav, char, pois, speed });
    this.sprite = scene.add.sprite(x, y, 'chars', frameOf(char, 0, 'down')).setOrigin(0.5, 1);
    this.facing = 'down';
    this.wait = 500 + Math.random() * 3000;
    this.path = null;
  }
  update(dt) {
    const s = this.sprite;
    s.setDepth(20 + s.y / 10000);
    if (!this.path) {
      if ((this.wait -= dt) > 0) return s.anims.play(`c${this.char}-idle-${this.facing}`, true);
      const p = this.pois[Math.floor(Math.random() * this.pois.length)];
      const r = this.nav.findPath(s.x, s.y, p.x + (Math.random() * 10 - 5), p.y);
      this.path = r && r.points.length > 1 ? { pts: r.points, i: 1 } : null;   // already there → stay idle
      this.wait = 2000 + Math.random() * 5000;
      return;
    }
    const t = this.path.pts[this.path.i];
    const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy), step = this.speed * dt / 1000;
    if (d <= step) {
      s.setPosition(t.x, t.y);
      if (++this.path.i >= this.path.pts.length) this.path = null;
      return;
    }
    s.x += dx / d * step; s.y += dy / d * step;
    this.facing = facingFrom(dx, dy, this.facing);
    s.anims.play(`c${this.char}-walk-${this.facing}`, true);
  }
}
