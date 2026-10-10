// Pure layout maths for home interiors (shared by HomeScene and tests).
import { ITEMS } from '../data/catalog.js';
export const T = 16;

export const doorOf = def => ({ x: Math.floor(def.w / 2), y: def.h - 1 });

// Every drawn piece with its tile footprint. `flat` pieces (rugs) are walk-over.
export function pieces(def, placed = []) {
  const out = def.fixtures.map(f => ({ sprite: f.sprite, x: f.x, y: f.y, flat: !!f.flat, kind: 'fixture' }));
  if (def.computer) out.push({ sprite: def.computer.desk, x: def.computer.x, y: def.computer.y, flat: false, kind: 'desk' });
  for (const f of placed) out.push({ sprite: ITEMS[f.itemId].sprite, x: f.x, y: f.y, flat: !!ITEMS[f.itemId].flat, kind: 'furniture', uid: f.uid, itemId: f.itemId });
  return out;
}

// Solid rectangles in px: walls (with the door gap) + every non-flat piece.
export function solidRects(def, placed = []) {
  const { w: W, h: H } = def, door = doorOf(def);
  const tiles = [[0, 0, W, 2], [0, 0, 1, H], [W - 1, 0, 1, H], [0, H - 1, door.x, 1], [door.x + 1, H - 1, W - door.x - 1, 1]];
  for (const p of pieces(def, placed)) if (!p.flat) tiles.push([p.x, p.y, p.sprite[0].length, p.sprite.length]);
  return tiles.map(([x, y, w, h]) => ({ x: x * T, y: y * T, w: w * T, h: h * T }));
}

// Where the player stands to use the computer: the tile row just below the desk.
export const pcSpot = def => def.computer && ({ x: (def.computer.x + 1) * T, y: (def.computer.y + 2) * T - 2 });
export const doorSpot = def => ({ x: doorOf(def).x * T + 8, y: (def.h - 2) * T + 12 });
