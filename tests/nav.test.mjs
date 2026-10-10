import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NavGrid } from '../src/world/nav.js';

const map = JSON.parse(readFileSync(new URL('../maps/city.tmj', import.meta.url)));
const layer = n => map.layers.find(l => l.name === n);
const rects = layer('Collision').objects.map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }));
const nav = new NavGrid(map.width * 16, map.height * 16, rects);
const spawn = layer('Spawn').objects[0];

const pathIsClear = pts => pts.every((p, i) => i === 0 || nav.lineClear(pts[i - 1], p));

test('every entrance has a clear path from the spawn point', () => {
  for (const z of layer('Interactions').objects) {
    const r = nav.findPath(spawn.x, spawn.y, z.x + z.width / 2, z.y + z.height / 2);
    assert.ok(r, z.name);
    assert.ok(pathIsClear(r.points), `${z.name}: no segment crosses a collider`);
  }
});

test('clicking inside a building walks to the nearest reachable spot', () => {
  const r = nav.findPath(spawn.x, spawn.y, 33 * 16 + 8, 8 * 16);   // middle of the tower
  assert.ok(r.adjusted);
  const end = r.points.at(-1);
  assert.ok(nav.clearAt(end.x, end.y));
  const tower = { x: 30 * 16, y: 1 * 16, w: 8 * 16, h: 15 * 16 };
  const inside = end.x > tower.x && end.x < tower.x + tower.w && end.y > tower.y && end.y < tower.y + tower.h;
  assert.ok(!inside, 'ends outside the tower');
  assert.ok(Math.hypot(end.x - (33 * 16 + 8), end.y - 8 * 16) < 6 * 16, 'and close to where you clicked');
  assert.ok(pathIsClear(r.points));
});

test('paths route around obstacles instead of through them', () => {
  // from the plaza to behind the tower: the straight line crosses the building
  const from = { x: spawn.x, y: spawn.y }, to = { x: 33 * 16 + 8, y: 0 * 16 + 12 };
  assert.equal(nav.lineClear(from, to), false);
  const r = nav.findPath(from.x, from.y, to.x, to.y);
  assert.ok(r && r.points.length > 2);
  assert.ok(pathIsClear(r.points));
});

test('path is smoothed (few waypoints on open ground)', () => {
  const to = { x: spawn.x + 40, y: spawn.y - 16 };
  assert.ok(nav.lineClear(spawn, to));
  assert.equal(nav.findPath(spawn.x, spawn.y, to.x, to.y).points.length, 2, 'clear line → direct walk');
});

import { HOMES } from '../src/data/homes.js';
import { solidRects, pcSpot, doorSpot } from '../src/world/homeLayout.js';

test('in every home the computer can be reached from the door', () => {
  for (const [id, def] of Object.entries(HOMES)) {
    const g = new NavGrid(def.w * 16, def.h * 16, solidRects(def));
    const d = doorSpot(def), pc = pcSpot(def);
    assert.ok(g.clearAt(d.x, d.y), `${id}: door spot clear`);
    assert.ok(g.clearAt(pc.x, pc.y), `${id}: computer spot clear`);
    const r = g.findPath(d.x, d.y, pc.x, pc.y);
    assert.ok(r && !r.adjusted, `${id}: path door → computer`);
  }
});

test('home fixtures stay inside the walls', () => {
  for (const [id, def] of Object.entries(HOMES))
    for (const f of [...def.fixtures, { sprite: def.computer.desk, x: def.computer.x, y: def.computer.y }])
      assert.ok(f.x >= 1 && f.x + f.sprite[0].length <= def.w - 1 && f.y >= 1 && f.y + f.sprite.length <= def.h - 1, `${id}: fixture at ${f.x},${f.y}`);
});

test('a click in your own cell still yields a [start, goal] path', () => {
  const r = nav.findPath(spawn.x, spawn.y, spawn.x + 2, spawn.y - 1);
  assert.equal(r.points.length, 2);
  assert.deepEqual(r.points[0], { x: spawn.x, y: spawn.y });
});
