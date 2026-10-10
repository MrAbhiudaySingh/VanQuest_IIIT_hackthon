// Everything the player can buy. Prices in whole rupees (fictional prototype values).
//
// kind decides where an item goes after purchase:
//   'grocery'   → household pantry, eaten over time (usePerDay units/day)
//   'household' → pantry, used up over time (soap, detergent…)
//   'clothing' → owned once each, equippable in its `slot` (top / bottom / feet)
//   'personal' | 'electronics' | 'jewellery' → owned possessions (counts)
//   'furniture' → individual furniture pieces that can be placed in the home
// limit: max you can own at once (prevents accidental duplicates of big items).
// sprite (furniture only): tile ids in art/kenney_roguelike_indoor.png, rows top→bottom.

const g = (id, name, price, unit, usePerDay, kcal) => ({ id, name, price, unit, usePerDay, kcal, kind: 'grocery', category: 'Groceries' });
const h = (id, name, price, unit, usePerDay) => ({ id, name, price, unit, usePerDay, kind: 'household', category: 'Household supplies' });
const own = (kind, category) => (id, name, price, extra = {}) => ({ id, name, price, kind, category, ...extra });
const cloth = (id, name, price, slot, extra = {}) => ({ id, name, price, kind: 'clothing', category: 'Clothing', slot, limit: 1, ...extra });
const tech = own('electronics', 'Electronics');
const jewel = own('jewellery', 'Jewellery & luxury');
const furn = (id, name, price, sprite, extra = {}) => ({ id, name, price, kind: 'furniture', category: 'Furniture & decor', sprite, ...extra });

export const ITEMS = Object.fromEntries([
  // Groceries — usePerDay is for a one-person household (units/day); kcal per unit.
// A full daily basket provides ~3,100 kcal; the body needs 2,000 kcal/day (see sim/health.js).
  g('rice_5kg', 'Basmati rice (5 kg)', 350, 'bag', 0.04, 17500),
  g('atta_5kg', 'Wheat flour / atta (5 kg)', 280, 'bag', 0.05, 17000),
  g('dal_1kg', 'Toor dal (1 kg)', 160, 'pack', 0.07, 3400),
  g('veg_1kg', 'Fresh vegetables (1 kg)', 60, 'kg', 0.4, 300),
  g('onion_1kg', 'Onions (1 kg)', 40, 'kg', 0.1, 400),
  g('potato_1kg', 'Potatoes (1 kg)', 35, 'kg', 0.1, 770),
  g('fruit_1kg', 'Seasonal fruit (1 kg)', 120, 'kg', 0.15, 600),
  g('milk_1l', 'Milk (1 L)', 62, 'litre', 0.5, 620),
  g('curd_400g', 'Curd (400 g)', 45, 'tub', 0.2, 250),
  g('bread', 'Bread loaf', 45, 'loaf', 0.15, 1000),
  g('eggs_12', 'Eggs (12)', 84, 'tray', 0.08, 840),
  g('oil_1l', 'Cooking oil (1 L)', 180, 'bottle', 0.04, 8800),
  g('sugar_1kg', 'Sugar (1 kg)', 48, 'pack', 0.03, 3870),
  g('tea_250g', 'Tea leaves (250 g)', 140, 'pack', 0.02, 0),
  g('salt_1kg', 'Iodised salt (1 kg)', 28, 'pack', 0.01, 0),
  // Household supplies
  h('soap', 'Bath soap', 45, 'bar', 0.05),
  h('toothpaste', 'Toothpaste', 95, 'tube', 0.03),
  h('detergent_1kg', 'Detergent powder (1 kg)', 180, 'pack', 0.03),
  h('dish_soap', 'Dishwash liquid', 110, 'bottle', 0.03),
  // Personal items at the convenience store
  own('personal', 'Personal items')('notebook', 'Notebook', 60),
  own('personal', 'Personal items')('umbrella', 'Umbrella', 349, { limit: 3 }),
  own('personal', 'Personal items')('backpack', 'Backpack', 899, { limit: 2 }),
  // Clothing
  cloth('tshirt', 'Cotton T-shirt', 399, 'top'),
  cloth('jeans', 'Denim jeans', 1299, 'bottom'),
  cloth('kurta', 'Cotton kurta', 899, 'top'),
  cloth('formal_shirt', 'Formal shirt', 1199, 'top'),
  cloth('sneakers', 'Sneakers', 1999, 'feet'),
  cloth('blazer', 'Tailored blazer', 6999, 'top', { premium: true }),
  cloth('silk_saree', 'Silk saree', 12999, 'top', { premium: true }),
  // Electronics
  tech('earphones', 'Wired earphones', 999, { limit: 3 }),
  tech('smartphone', 'Smartphone', 14999, { limit: 2 }),
  tech('laptop', 'Laptop', 45999, { limit: 2 }),
  tech('desktop_pc', 'Desktop computer', 38000, { limit: 2 }),
  tech('monitor', '24" monitor', 9999, { limit: 3 }),
  tech('printer', 'Inkjet printer', 7499, { limit: 1 }),
  tech('router', 'Wi-Fi router', 1899, { limit: 1 }),
  tech('smartwatch', 'Smartwatch', 3499, { limit: 2 }),
  // Furniture & decor (placeable)
  furn('bed_single', 'Single bed', 8999, [[170], [224]], { limit: 2 }),
  furn('bed_double', 'Double bed', 18999, [[201, 202], [226, 227]], { limit: 2 }),
  furn('study_desk', 'Study desk', 4499, [[112, 114]]),
  furn('office_chair', 'Office chair', 3999, [[216]]),
  furn('dining_chair', 'Dining chair', 1499, [[54]]),
  furn('sofa', 'Two-seat sofa', 21999, [[8, 9]], { limit: 2 }),
  furn('armchair', 'Armchair', 6499, [[257]]),
  furn('coffee_table', 'Coffee table', 3499, [[32]]),
  furn('dining_table', 'Dining table', 9999, [[0, 1, 2], [27, 28, 29]], { limit: 1 }),
  furn('wardrobe', 'Wardrobe', 12999, [[266, 267], [293, 294]], { limit: 2 }),
  furn('bookshelf', 'Bookshelf', 4999, [[479]]),
  furn('floor_lamp', 'Floor lamp', 1799, [[127], [154]]),
  furn('plant', 'Potted plant', 599, [[16]]),
  furn('rug', 'Woven rug', 2499, [[394, 395, 396]], { flat: true }),
  furn('wall_mirror', 'Standing mirror', 2999, [[400], [427]]),
  // Jewellery & luxury (optional)
  jewel('silver_chain', 'Silver chain', 3500),
  jewel('gold_earrings', 'Gold earrings', 28000),
  jewel('gold_ring', 'Gold ring', 45000),
  jewel('luxury_watch', 'Luxury watch', 120000, { limit: 2 }),
  jewel('diamond_pendant', 'Diamond pendant', 250000),
].map(i => [i.id, i]));

// Which shop sells what, plus each shopkeeper's identity and lines.
export const SHOPS = {
  market_grocery: {
    items: ['rice_5kg', 'atta_5kg', 'dal_1kg', 'veg_1kg', 'onion_1kg', 'potato_1kg', 'fruit_1kg', 'milk_1l', 'curd_400g', 'bread', 'eggs_12', 'oil_1l', 'sugar_1kg', 'tea_250g', 'salt_1kg'],
    groceryPlan: true,
    keeper: { name: 'Meera', role: 'Grocer', char: 1 },
    lines: ['Fresh sabzi came in this morning!', 'Tired of shopping every week? Ask me about a monthly grocery plan.', 'Atta and dal are cheaper by the bag — check the unit price.'],
  },
  market_clothing: {
    items: ['tshirt', 'jeans', 'kurta', 'formal_shirt', 'sneakers', 'blazer', 'silk_saree'],
    keeper: { name: 'Arjun', role: 'Tailor & clothier', char: 4 },
    lines: ['Basics first — a good shirt for interviews goes a long way.', 'The premium rack is lovely, but only if it fits your budget.'],
  },
  market_electronics: {
    items: ['earphones', 'smartphone', 'laptop', 'desktop_pc', 'monitor', 'printer', 'router', 'smartwatch'],
    keeper: { name: 'Kabir', role: 'Electronics specialist', char: 5 },
    lines: ['Need a laptop for college? I can show you something reliable.', 'Buy for what you need today, not the spec sheet.'],
  },
  market_furniture: {
    items: ['bed_single', 'bed_double', 'study_desk', 'office_chair', 'dining_chair', 'sofa', 'armchair', 'coffee_table', 'dining_table', 'wardrobe', 'bookshelf', 'floor_lamp', 'plant', 'rug', 'wall_mirror'],
    keeper: { name: 'Farah', role: 'Furniture consultant', char: 3 },
    lines: ['Everything you buy here can be arranged in your home.', 'Measure your room first — a big sofa in a small flat is a squeeze!'],
  },
  market_jewellery: {
    items: ['silver_chain', 'gold_earrings', 'gold_ring', 'luxury_watch', 'diamond_pendant'],
    keeper: { name: 'Mr. Iyer', role: 'Jeweller', char: 2 },
    lines: ['Luxury is a choice, not a necessity. Take your time.', 'Jewellery keeps sentimental value — resale value is another matter.'],
  },
  market_general: {
    items: ['bread', 'milk_1l', 'eggs_12', 'soap', 'toothpaste', 'detergent_1kg', 'dish_soap', 'notebook', 'umbrella', 'backpack'],
    keeper: { name: 'Ravi', role: 'Shop owner', char: 5 },
    lines: ['Open late! Milk, bread and the little things.', 'Out of soap again? Happens to everyone.'],
  },
};

export const GROCERY_DELIVERY_FEE = 40; // ₹ per monthly delivery; collection is free
