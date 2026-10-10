// Clothing equipment: one item per slot (top / bottom / feet), owned items only.
// The player sprite shows the outfit by recolouring the Kenney character (see art/player_outfits.png).
import { ITEMS } from '../data/catalog.js';

export const SLOTS = ['top', 'bottom', 'feet'];

export function equip(state, id) {
  const it = ITEMS[id];
  if (!it || it.kind !== 'clothing') return { ok: false, reason: 'not_clothing' };
  if (!(state.owned[id] > 0)) return { ok: false, reason: 'not_owned' };
  state.wardrobe[it.slot] = id;
  return { ok: true, slot: it.slot };
}

export function unequip(state, slot) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: 'bad_slot' };
  state.wardrobe[slot] = null;
  return { ok: true };
}

// Defensive: never show something you don't own (e.g. after a save edit).
export const equipped = state => Object.fromEntries(SLOTS.map(s => [s, state.wardrobe[s] && state.owned[state.wardrobe[s]] > 0 ? state.wardrobe[s] : null]));
