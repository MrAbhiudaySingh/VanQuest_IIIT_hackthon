// Interior layouts for every home type, keyed by the location id used on the city map.
// Rooms are drawn by HomeScene from these definitions (tile coords inside the room).
//   w, h      room size in tiles (walls included: row 0-1 is the back wall)
//   floor     floor style in art/vanquest_interior.png
//   fixtures  built-in furniture (not movable): { sprite: [[tileIds]], x, y, flat? }
//   computer  every home has one: stable id + position + device type
// Fixture/furniture sprite ids refer to art/kenney_roguelike_indoor.png.
const BED = [[170], [224]], DBED = [[201, 202], [226, 227]], SOFA = [[8, 9]], KITCHEN = [[324, 325, 329, 331]];
const KITCHEN_L = [[324, 325, 326, 329, 330, 331, 332]], FRIDGE = [[443]], STOVE = [[392]];
const TABLE = [[0, 1, 2], [27, 28, 29]], RTABLE = [[3, 4], [30, 31]], DESK = [[112, 114]], PLANT = [[16]], PIANO = [[239, 240]];
const SHELF = [[479]], WARDROBE = [[266, 267], [293, 294]], CHAIR = [[54]], ARM = [[257]], RUG = [[394, 395, 396]], SPEAKER = [[446], [473]];

export const HOMES = {
  home_apartment: {
    title: 'Elm Court — Flat 2B', w: 9, h: 7, floor: 'carpet',
    fixtures: [{ sprite: KITCHEN, x: 1, y: 2 }, { sprite: FRIDGE, x: 5, y: 2 }, { sprite: BED, x: 7, y: 2 }],
    computer: { id: 'home_pc_apartment', device: 'laptop', x: 1, y: 4, desk: DESK },
  },
  home_apartment_plus: {
    title: 'Lakeview Residences — Flat 4A', w: 11, h: 8, floor: 'wood',
    fixtures: [{ sprite: KITCHEN, x: 1, y: 2 }, { sprite: FRIDGE, x: 5, y: 2 }, { sprite: DBED, x: 8, y: 2 }, { sprite: SOFA, x: 5, y: 5 }, { sprite: PLANT, x: 9, y: 6 }],
    computer: { id: 'home_pc_apartment_plus', device: 'laptop', x: 1, y: 5, desk: DESK },
  },
  home_starter: {
    title: '12 Elm St — Starter Home', w: 10, h: 8, floor: 'lino',
    fixtures: [{ sprite: KITCHEN, x: 1, y: 2 }, { sprite: FRIDGE, x: 5, y: 2 }, { sprite: BED, x: 8, y: 2 }, { sprite: CHAIR, x: 3, y: 4 }],
    computer: { id: 'home_pc_starter', device: 'laptop', x: 1, y: 5, desk: DESK },
  },
  home_family: {
    title: '18 Elm St — Family Home', w: 13, h: 9, floor: 'wood',
    fixtures: [{ sprite: KITCHEN_L, x: 1, y: 2 }, { sprite: FRIDGE, x: 8, y: 2 }, { sprite: STOVE, x: 9, y: 2 }, { sprite: DBED, x: 10, y: 2 },
      { sprite: SOFA, x: 5, y: 6 }, { sprite: PLANT, x: 11, y: 7 }],
    computer: { id: 'home_pc_family', device: 'desktop', x: 1, y: 6, desk: DESK },
  },
  home_large: {
    title: '24 Elm St — Large House', w: 16, h: 11, floor: 'parquet',
    fixtures: [{ sprite: KITCHEN_L, x: 1, y: 2 }, { sprite: FRIDGE, x: 8, y: 2 }, { sprite: STOVE, x: 9, y: 2 }, { sprite: DBED, x: 13, y: 2 },
      { sprite: WARDROBE, x: 11, y: 1 }, { sprite: TABLE, x: 2, y: 5 }, { sprite: SOFA, x: 8, y: 8 }, { sprite: SHELF, x: 14, y: 6 }, { sprite: PLANT, x: 14, y: 9 }],
    computer: { id: 'home_pc_large', device: 'desktop', x: 1, y: 8, desk: DESK },
  },
  home_luxury: {
    title: 'Willowbrook Estate', w: 20, h: 13, floor: 'marble',
    fixtures: [{ sprite: KITCHEN_L, x: 1, y: 2 }, { sprite: FRIDGE, x: 8, y: 2 }, { sprite: STOVE, x: 9, y: 2 }, { sprite: PIANO, x: 12, y: 2 },
      { sprite: DBED, x: 17, y: 2 }, { sprite: WARDROBE, x: 15, y: 1 }, { sprite: RTABLE, x: 3, y: 6 }, { sprite: SOFA, x: 10, y: 8 }, { sprite: ARM, x: 12, y: 8 },
      { sprite: RUG, x: 9, y: 10, flat: true }, { sprite: SPEAKER, x: 8, y: 7 }, { sprite: SPEAKER, x: 13, y: 7 }, { sprite: PLANT, x: 18, y: 6 }, { sprite: PLANT, x: 1, y: 11 }, { sprite: SHELF, x: 18, y: 9 }],
    computer: { id: 'home_pc_luxury', device: 'desktop', x: 4, y: 10, desk: DESK },
  },
};

// Walk-in shop interiors (same renderer as homes). keeper = shopkeeper behind the counter;
// the player talks to them from `talk` (the tile in front of the counter).
export const SHOWROOMS = {
  market_furniture: {
    title: 'Hearth Home & Furniture — showroom', w: 14, h: 9, floor: 'parquet',
    fixtures: [{ sprite: DBED, x: 1, y: 2 }, { sprite: BED, x: 4, y: 2 }, { sprite: WARDROBE, x: 6, y: 1 }, { sprite: SHELF, x: 9, y: 2 },
      { sprite: SOFA, x: 11, y: 2 }, { sprite: ARM, x: 12, y: 4 }, { sprite: TABLE, x: 1, y: 5 }, { sprite: CHAIR, x: 4, y: 5 },
      { sprite: RUG, x: 6, y: 4, flat: true }, { sprite: PLANT, x: 12, y: 7 }, { sprite: PLANT, x: 1, y: 7 },
      { sprite: [[324, 325, 326]], x: 8, y: 6 }],                               // the counter
    keeper: { x: 9, y: 5, char: 3, name: 'Farah', role: 'Furniture consultant', shop: 'market_furniture' },
    talk: { x: 9, y: 7 },
  },
};
