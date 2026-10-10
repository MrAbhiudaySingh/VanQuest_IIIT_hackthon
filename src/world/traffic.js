// Background traffic on the real road layout (lanes from the Tiled "NPCs" layer, `car_lane`).
//  • India drives on the left: southbound/eastbound in one lane, northbound/westbound in the other.
//  • Cars go straight through junctions (no turning), entering and leaving at the map edge.
//  • A shared signal cycle at the two Main Street junctions: north–south green, all red,
//    east–west green, all red. Cars stop at the junction edge on red and queue behind each other.
//  • They also stop for anyone (or the player's car) in the lane ahead. They never hit or push anyone;
//    after waiting 4 s for a person or a parked car they ease past, so nothing is ever stuck for good.
// Sprites: gameguy's CC0 top-down vehicles, one image rotated to the direction of travel.
import { TOPCAR_FRAMES } from '../data/artIndex.js';

const T = 16;
const JUNCTIONS = [{ x0: 18 * T, x1: 21 * T, y0: 20 * T, y1: 23 * T }, { x0: 45 * T, x1: 48 * T, y0: 20 * T, y1: 23 * T }];
const CYCLE = 12000;   // ms: 0–5.5 s N–S green · 0.5 s all red · 5.5 s E–W green · 0.5 s all red
const MODELS = ['sedan', 'pickup', 'mpv', 'truck_box', 'sedan', 'truck_long', 'pickup'];

export const signalFor = (axis, t) => {
  const p = t % CYCLE;
  if (axis === 'v') return p < 5500 ? 'green' : 'red';
  return p >= 6000 && p < 11500 ? 'green' : 'red';
};

export class Traffic {
  constructor(scene, laneObjs, mapW, mapH) {
    Object.assign(this, { scene, mapW, mapH });
    this.t = 0;
    this.lanes = laneObjs.map(o => {
      const p = n => o.properties.find(x => x.name === n).value;
      const axis = p('axis'), dir = +p('dir');
      // centre of the tile the marker sits in (markers may be anywhere inside it, e.g. after a Tiled edit)
      return { axis, dir, at: Math.floor((axis === 'v' ? o.x : o.y) / T) * T + T / 2 };
    });
    this.cars = [];
    this.lanes.forEach((lane, i) => { for (let k = 0; k < 2; k++) this.spawn(lane, -k * 420 - i * 90); });
  }

  spawn(lane, offset = 0) {
    const model = MODELS[(this.cars.length * 3 + Math.floor(Math.random() * 7)) % MODELS.length];
    const len = model === 'truck_long' ? 54 : model === 'truck_box' ? 38 : 28;
    const start = (lane.dir > 0 ? -len : (lane.axis === 'v' ? this.mapH : this.mapW) + len) - offset * lane.dir;
    const sprite = this.scene.add.image(0, 0, 'topcars', TOPCAR_FRAMES.indexOf(model)).setOrigin(0.5);
    const rot = lane.axis === 'v' ? (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane.dir > 0 ? 0 : Math.PI);
    sprite.setRotation(rot);
    const car = { lane, pos: start, len, speed: 48 + Math.random() * 16, sprite, waited: 0 };
    this.cars.push(car);
    this.place(car);
    return car;
  }

  place(c) {
    const { lane } = c;
    if (lane.axis === 'v') c.sprite.setPosition(lane.at, c.pos); else c.sprite.setPosition(c.pos, lane.at);
    c.sprite.setDepth(20 + c.sprite.y / 10000);
  }

  // Distance from this car's front to the next junction edge it will cross (or Infinity).
  toJunction(c) {
    const { lane } = c, front = c.pos + lane.dir * c.len / 2;
    let best = Infinity;
    for (const j of JUNCTIONS) {
      const [lo, hi] = lane.axis === 'v' ? [j.y0, j.y1] : [j.x0, j.x1];
      const edge = lane.dir > 0 ? lo : hi, d = (edge - front) * lane.dir;
      if (d >= -1 && d < best) best = d;
    }
    return best;
  }

  blocked(c, others) {
    const { lane } = c, front = c.pos + lane.dir * c.len / 2;
    // people (and the player's car) standing in the lane just ahead — wait, then ease past
    if (c.waited < 4000) for (const s of others) {
      if (!s || s.visible === false) continue;
      const across = lane.axis === 'v' ? s.x - lane.at : s.y - lane.at;
      const along = ((lane.axis === 'v' ? s.y : s.x) - front) * lane.dir;
      if (Math.abs(across) < 12 && along > -4 && along < 26) return 'person';
    }
    // the car ahead in the same lane
    for (const o of this.cars) {
      if (o === c || o.lane !== lane) continue;
      const gap = (o.pos - c.pos) * lane.dir - (o.len + c.len) / 2;
      if (gap > -c.len && gap < 10) return 'queue';
    }
    // red light at the junction ahead
    const d = this.toJunction(c);
    return d < 14 && signalFor(lane.axis, this.t) === 'red' ? 'signal' : null;
  }

  update(dt, others) {
    this.t += dt;
    for (const c of this.cars) {
      const why = this.blocked(c, others);
      c.waited = why === 'person' ? c.waited + dt : why ? c.waited : Math.max(0, c.waited - dt);
      if (!why) c.pos += c.lane.dir * c.speed * dt / 1000;
      const end = c.lane.axis === 'v' ? this.mapH : this.mapW;
      if ((c.lane.dir > 0 && c.pos - c.len > end + 20) || (c.lane.dir < 0 && c.pos + c.len < -20))
        c.pos = c.lane.dir > 0 ? -c.len - Math.random() * 300 : end + c.len + Math.random() * 300;
      this.place(c);
    }
  }
}
