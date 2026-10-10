// Pixel-art thumbnails for DOM panels, cut from the same sheets the game uses (CSS sprites).
import { ITEMS } from '../data/catalog.js';
import { VEHICLE_ROWS, ITEM_ICON_ORDER, ICON32_ORDER, TOPCAR_FRAMES, outfitRow } from '../data/artIndex.js';
import { VEHICLES } from '../data/vehicles.js';

const px = (sheet, sx, sy, w, h, scale, sheetW, sheetH) =>
  `<span class="spr" style="width:${w * scale}px;height:${h * scale}px;background-image:url(${sheet});background-position:-${sx * scale}px -${sy * scale}px;background-size:${sheetW * scale}px ${sheetH * scale}px"></span>`;

// The same art the car drives with: Tiny Cars side frame, or the top-down sprite (facing east).
export const vehicleImg = (model, scale = 2, dir = 0) => VEHICLES[model]?.art === 'top'
  ? px('art/vanquest_topcars.png', TOPCAR_FRAMES.indexOf(model) * 64, 0, 64, 24, scale, TOPCAR_FRAMES.length * 64, 24)
  : px('art/vanquest_vehicles.png', dir * 48, VEHICLE_ROWS.indexOf(model) * 48, 48, 48, scale, 384, VEHICLE_ROWS.length * 48);

const INDOOR_W = 458, INDOOR_H = 305;   // art/kenney_roguelike_indoor.png (16px tiles, 1px spacing)
export function furnitureImg(sprite, scale = 2) {
  const rows = sprite.map(row => `<span style="display:flex">${row.map(t => px('art/kenney_roguelike_indoor.png', (t % 27) * 17, Math.floor(t / 27) * 17, 16, 16, scale, INDOOR_W, INDOOR_H)).join('')}</span>`).join('');
  return `<span class="spr-group">${rows}</span>`;
}

// What an outfit looks like on the player (front-facing idle frame).
export const outfitImg = (outfit, scale = 3) => px('art/player_outfits.png', 16, outfitRow(outfit) * 16, 16, 16, scale, 192, 24 * 16);

// Picture for any catalogue item (every item in the catalogue now has one).
export function itemIcon(id, scale = 2) {
  const it = ITEMS[id];
  const i = ITEM_ICON_ORDER.indexOf(id);
  if (i >= 0) return px('art/vanquest_items.png', i * 16, 0, 16, 16, scale, ITEM_ICON_ORDER.length * 16, 16);
  const j = ICON32_ORDER.indexOf(id);          // electronics & jewellery (32px art)
  if (j >= 0) return px('art/vanquest_items32.png', j * 32, 0, 32, 32, scale / 2, ICON32_ORDER.length * 32, 32);
  if (it.kind === 'furniture') return furnitureImg(it.sprite, scale);
  if (it.kind === 'clothing') return outfitImg({ [it.slot]: id }, scale + 1);
  return '';
}
