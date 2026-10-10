// Driving: one physics car (the player's active vehicle), separate from walking.
// Controls while driving: WASD / arrows point where you want to go — the car turns toward that
// direction at its handling rate and accelerates toward its top speed; release to slow down;
// pressing the opposite way brakes first. Cars collide with buildings, props and fences
// (same Collision layer as walking) and can't drive onto grass, parks or gardens.
// The physics body (`sprite`, invisible; position = body's bottom centre) is separate from what
// you see (`view`): Tiny Cars hatchbacks swap between 8 real directional frames; top-down models
// are a single sprite rotated to the heading.
import { VEHICLES } from '../data/vehicles.js';
import { VEHICLE_ROWS, TOPCAR_FRAMES } from '../data/artIndex.js';
import { activeVehicle, tripFuelCost } from '../sim/vehicles.js';
import { spendable } from '../sim/ledger.js';

export const CAR_BODY = { w: 22, h: 16 };     // collider (rotation-independent); position = its bottom centre
const DEG = Math.PI / 180;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const dirOf = heading => (Math.round(heading / (Math.PI / 4)) + 8) % 8;
export const headingOf = dir => dir * Math.PI / 4;

export class DriveController {
  constructor(scene, carNav, solids, grassLayer, deliverySpot) {
    Object.assign(this, { scene, carNav, deliverySpot });
    this.sprite = scene.physics.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setVisible(false);
    this.sprite.body.setSize(CAR_BODY.w, CAR_BODY.h).setOffset((32 - CAR_BODY.w) / 2, 32 - CAR_BODY.h);
    this.sprite.body.enable = false;
    this.sprite.setCollideWorldBounds(true);
    this.view = scene.add.sprite(0, 0, 'vehicles', 0).setVisible(false);
    scene.physics.add.collider(this.sprite, solids);
    scene.physics.add.collider(this.sprite, grassLayer);
    this.driving = false; this.speed = 0; this.heading = Math.PI / 2; this.uid = null;
    this.distance = 0; this.stalled = false; this.stuckMs = 0;
  }

  get dir() { return dirOf(this.heading); }

  draw() {
    const s = this.sprite, v = this.view, m = this.model;
    if (!m) return;
    if (m.art === 'tiny') v.setTexture('vehicles', this.row * 8 + this.dir).setOrigin(0.5, 0.75).setRotation(0).setPosition(s.x, s.y);
    else v.setTexture('topcars', this.row).setOrigin(0.5, 0.5).setRotation(this.heading).setPosition(s.x, s.y - CAR_BODY.h / 2);
    v.setDepth(20 + s.y / 10000);
  }

  // Show the active vehicle where it's parked (or on the dealer's forecourt). Never moves a car you're driving.
  sync(state) {
    if (this.driving) return;
    const v = activeVehicle(state);
    if (!v) { this.uid = null; this.view.setVisible(false); return; }
    this.uid = v.uid;
    this.model = VEHICLES[v.model];
    this.row = this.model.art === 'tiny' ? VEHICLE_ROWS.indexOf(v.model) : TOPCAR_FRAMES.indexOf(v.model);
    const p = v.parked ?? { ...this.deliverySpot, dir: 2 };
    const spot = this.clearSpot(p.x, p.y);
    this.heading = headingOf(p.dir);
    this.sprite.setPosition(spot.x, spot.y);
    this.view.setVisible(true);
    this.draw();
  }

  // Nearest place the car's body fits (prevents cars being stuck inside something).
  clearSpot(x, y) {
    if (this.carNav.clearAt(x, y)) return { x, y };
    const c = this.carNav.nearestWalkable(this.carNav.cellOf(x, y), () => true, 30);
    return c === null ? { x, y } : this.carNav.centre(c);
  }

  near(px, py, r = 30) { return this.uid && this.view.visible && Math.hypot(this.sprite.x - px, this.sprite.y - py) < r; }

  enter() {
    const s = this.sprite, spot = this.clearSpot(s.x, s.y);
    s.body.enable = true;
    s.body.reset(spot.x, spot.y);
    this.driving = true; this.speed = 0; this.distance = 0; this.stalled = false; this.stuckMs = 0;
    this.last = { x: s.x, y: s.y };
  }

  // Returns { distance, parked } — the scene charges fuel and saves the parking spot.
  exit() {
    const s = this.sprite;
    s.setVelocity(0, 0);
    s.body.enable = false;
    this.driving = false; this.speed = 0;
    this.draw();
    return { distance: this.distance, parked: { x: Math.round(s.x), y: Math.round(s.y), dir: this.dir } };
  }

  update(dt, keys, state, vehicle) {
    const s = this.sprite, m = this.model, t = dt / 1000;
    if (!this.driving) return this.draw();
    // distance actually travelled (after collisions) → fuel
    const moved = Math.hypot(s.x - this.last.x, s.y - this.last.y);
    this.distance += moved;
    this.last = { x: s.x, y: s.y };
    if (!this.stalled && tripFuelCost(vehicle, this.distance) >= spendable(state)) this.stalled = true;

    const kx = (keys.D.isDown || keys.RIGHT.isDown) - (keys.A.isDown || keys.LEFT.isDown);
    const ky = (keys.S.isDown || keys.DOWN.isDown) - (keys.W.isDown || keys.UP.isDown);
    if ((kx || ky) && !this.stalled) {
      const diff = wrap(Math.atan2(ky, kx) - this.heading);
      if (Math.abs(diff) > 150 * DEG && this.speed > 15) this.speed = Math.max(0, this.speed - m.accel * 2.5 * t);   // brake before turning round
      else {
        const turn = m.turn * DEG * t;
        this.heading = wrap(this.heading + Math.max(-turn, Math.min(turn, diff)));
        const align = Math.max(0, Math.cos(diff));                                           // accelerate once pointing the right way
        this.speed = Math.min(m.maxSpeed, this.speed + m.accel * align * t);
      }
    } else this.speed = Math.max(0, this.speed - m.accel * 1.6 * t);                           // coast to a stop
    if (!s.body.blocked.none) this.speed *= 0.5;                                                // bumping into something
    // stuck: trying to move but going nowhere for a while → the scene shows a hint
    this.stuckMs = (kx || ky) && moved < 0.05 && !this.stalled ? this.stuckMs + dt : 0;
    s.setVelocity(Math.cos(this.heading) * this.speed, Math.sin(this.heading) * this.speed);
    this.draw();
  }
}
