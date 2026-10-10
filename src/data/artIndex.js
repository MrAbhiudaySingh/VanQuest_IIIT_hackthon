// Row/column indexes into the sheets built by tools/make_round3_art.py (keep in sync).
export const VEHICLE_ROWS = ['used_hatch', 'hatch', 'hatch_plus', 'sedan', 'pickup', 'mpv', 'executive'];   // art/vanquest_vehicles.png
// art/vanquest_topcars.png (tools/make_round4_art.py): top-down sprites facing east, 64x24 frames
export const TOPCAR_FRAMES = ['sedan', 'pickup', 'mpv', 'executive', 'truck_box', 'truck_long'];
// art/vanquest_items32.png: 32x32 product icons
export const ICON32_ORDER = ['earphones', 'smartphone', 'laptop', 'desktop_pc', 'monitor', 'printer', 'router', 'smartwatch',
  'silver_chain', 'gold_earrings', 'gold_ring', 'luxury_watch', 'diamond_pendant'];

export const ITEM_ICON_ORDER = ['rice_5kg', 'atta_5kg', 'dal_1kg', 'veg_1kg', 'onion_1kg', 'potato_1kg', 'fruit_1kg', 'milk_1l',
  'curd_400g', 'bread', 'eggs_12', 'oil_1l', 'sugar_1kg', 'tea_250g', 'salt_1kg', 'soap', 'toothpaste', 'detergent_1kg',
  'dish_soap', 'notebook', 'umbrella', 'backpack'];

// Outfit rows: every top × bottom × shoes combination, in this nesting order.
export const OUTFIT_TOPS = [null, 'tshirt', 'kurta', 'formal_shirt', 'blazer', 'silk_saree'];
export const OUTFIT_BOTTOMS = [null, 'jeans'];
export const OUTFIT_SHOES = [null, 'sneakers'];
export const outfitRow = ({ top = null, bottom = null, feet = null } = {}) =>
  OUTFIT_TOPS.indexOf(top) * OUTFIT_BOTTOMS.length * OUTFIT_SHOES.length + OUTFIT_BOTTOMS.indexOf(bottom) * OUTFIT_SHOES.length + OUTFIT_SHOES.indexOf(feet);
