"""Round 3 art: builds three sheets from downloaded CC0 packs + small original drawings.

    python3 tools/make_round3_art.py      (run from the project root)

  art/vanquest_vehicles.png   one row per vehicle model, 8 frames of 48x48, frame index =
                              direction 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE.
                              Tiny Cars (8 real directions) + isaiah658 car/truck/van (4 real
                              directions; diagonals reuse the nearest side view — see VEHICLE_DIRS).
  art/vanquest_items.png      16x16 icons for groceries & household goods (isaiah658 produce +
                              original drawings for packaged goods), order = ITEM_ICONS.
  art/player_outfits.png      the player character (Kenney char 0) palette-swapped for every
                              top × bottom × shoes combination. Row = outfit index (see OUTFITS),
                              12 frames per row in the original Kenney layout (anim row × facing).
The index tables are mirrored in src/data/artIndex.js — keep them in sync.
"""
from PIL import Image, ImageDraw

TINY = "Assets/tiny-cars-cc0/32x32/{}32a.png"
ISA = "Assets/isaiah658-pixel-pack-1/Vehicles/{}-{}-{}.png"
ISA_FOOD = "Assets/isaiah658-pixel-pack-1/Food/{}.png"
KENNEY = "Assets/kenney_rpgUrbanKit/Tilemap/tilemap_packed.png"

# ------------------------------------------------------------------ vehicles
# model id → ("tiny", colour) | ("isa", body, colour)
VEHICLES = [
    ("used_hatch", ("tiny", "white")),
    ("hatch", ("tiny", "yellow")),
    ("hatch_plus", ("tiny", "blue")),
    ("sedan", ("isa", "car", "blue")),
    ("pickup", ("isa", "truck", "green")),
    ("mpv", ("isa", "van", "red")),
    ("executive", ("isa", "car", "black")),
]
TINY_FRAME = {0: 5, 1: 6, 2: 7, 3: 0, 4: 1, 5: 2, 6: 3, 7: 4}            # our dir → Tiny Cars frame
ISA_VIEW = {0: "side2", 2: "front", 4: "side1", 6: "back"}                # isaiah658 has 4 views
VEHICLE_DIRS = {"tiny": 8, "isa": 4}


def vehicle_sheet():
    sheet = Image.new("RGBA", (8 * 48, len(VEHICLES) * 48), (0, 0, 0, 0))
    for row, (_, src) in enumerate(VEHICLES):
        for d in range(8):
            if src[0] == "tiny":
                im = Image.open(TINY.format(src[1])).convert("RGBA").crop((TINY_FRAME[d] * 32, 0, TINY_FRAME[d] * 32 + 32, 32))
            else:
                cardinal = (round(d / 2) * 2) % 8                           # nearest real view
                im = Image.open(ISA.format(src[1], src[2], ISA_VIEW[cardinal])).convert("RGBA")
            sheet.alpha_composite(im, (d * 48 + (48 - im.width) // 2, row * 48 + (48 - im.height) // 2))
    sheet.save("art/vanquest_vehicles.png")


# ------------------------------------------------------------------ item icons
def sack(base, band, mark):
    def f(d):
        d.polygon([(4, 3), (11, 3), (13, 14), (2, 14)], fill=base, outline=(90, 80, 70))
        d.rectangle((4, 2, 11, 3), fill=(120, 100, 80))
        d.rectangle((3, 8, 12, 10), fill=band)
        d.point((7, 9), fill=mark); d.point((8, 9), fill=mark)
    return f


def box(base, top, label):
    def f(d):
        d.rectangle((3, 4, 12, 14), fill=base, outline=(60, 50, 50)); d.rectangle((3, 4, 12, 6), fill=top)
        d.rectangle((5, 8, 10, 11), fill=label)
    return f


def bottle(body, cap, label):
    def f(d):
        d.rectangle((6, 1, 9, 3), fill=cap); d.rectangle((5, 4, 10, 14), fill=body, outline=(60, 60, 70))
        d.rectangle((5, 8, 10, 11), fill=label)
    return f


def draw_bread(d):
    d.rounded_rectangle((2, 5, 13, 13), 3, fill=(205, 140, 70), outline=(120, 70, 30)); d.line((5, 6, 5, 12), fill=(170, 105, 50)); d.line((9, 6, 9, 12), fill=(170, 105, 50))


def draw_eggs(d):
    d.rectangle((1, 9, 14, 13), fill=(170, 150, 120), outline=(110, 95, 75))
    for x in (3, 7, 11):
        d.ellipse((x - 2, 4, x + 2, 10), fill=(250, 245, 230), outline=(190, 180, 160))


def draw_curd(d):
    d.polygon([(3, 5), (12, 5), (11, 14), (4, 14)], fill=(245, 245, 245), outline=(150, 150, 160)); d.rectangle((2, 3, 13, 5), fill=(70, 140, 220))


def draw_milk(d):
    d.polygon([(4, 5), (11, 5), (12, 14), (3, 14)], fill=(240, 244, 250), outline=(120, 130, 150)); d.polygon([(4, 5), (7, 2), (8, 2), (11, 5)], fill=(60, 120, 210))
    d.rectangle((5, 9, 10, 11), fill=(60, 120, 210))


def draw_soap(d):
    d.rounded_rectangle((2, 6, 13, 12), 2, fill=(250, 170, 190), outline=(170, 90, 110)); d.point((5, 8), fill=(255, 230, 235)); d.point((9, 9), fill=(255, 230, 235))


def draw_toothpaste(d):
    d.polygon([(2, 7), (11, 5), (11, 11), (2, 9)], fill=(240, 240, 250), outline=(90, 90, 120)); d.rectangle((11, 6, 13, 10), fill=(220, 40, 60)); d.line((4, 8, 9, 7), fill=(220, 40, 60))


def draw_notebook(d):
    d.rectangle((3, 2, 12, 14), fill=(70, 110, 190), outline=(30, 50, 100)); d.line((5, 2, 5, 14), fill=(30, 50, 100)); d.rectangle((7, 5, 11, 7), fill=(240, 240, 240))


def draw_umbrella(d):
    d.pieslice((1, 2, 14, 14), 180, 360, fill=(40, 60, 120), outline=(20, 30, 70)); d.line((7, 8, 7, 14), fill=(60, 50, 40)); d.point((6, 14), fill=(60, 50, 40))


def draw_backpack(d):
    d.rounded_rectangle((3, 3, 12, 14), 3, fill=(200, 70, 50), outline=(110, 35, 25)); d.rectangle((5, 9, 10, 13), fill=(170, 55, 40)); d.arc((5, 0, 10, 6), 180, 360, fill=(110, 35, 25))


def isa(name):
    return lambda: Image.open(ISA_FOOD.format(name)).convert("RGBA")


ITEM_ICONS = [  # (item id, isaiah658 sprite name | drawing function)
    ("rice_5kg", sack((245, 245, 235), (70, 120, 200), (250, 250, 250))),
    ("atta_5kg", sack((225, 200, 150), (200, 90, 40), (250, 220, 120))),
    ("dal_1kg", box((240, 200, 60), (200, 150, 30), (240, 160, 40))),
    ("veg_1kg", isa("cabbage")),
    ("onion_1kg", isa("onion")),
    ("potato_1kg", isa("potato")),
    ("fruit_1kg", isa("red-apple")),
    ("milk_1l", draw_milk),
    ("curd_400g", draw_curd),
    ("bread", draw_bread),
    ("eggs_12", draw_eggs),
    ("oil_1l", bottle((240, 200, 50), (200, 60, 40), (230, 120, 40))),
    ("sugar_1kg", box((250, 250, 250), (230, 120, 160), (240, 180, 200))),
    ("tea_250g", box((50, 120, 70), (30, 80, 45), (230, 200, 90))),
    ("salt_1kg", bottle((60, 110, 200), (230, 230, 240), (240, 240, 250))),
    ("soap", draw_soap),
    ("toothpaste", draw_toothpaste),
    ("detergent_1kg", box((240, 120, 40), (60, 120, 220), (250, 250, 250))),
    ("dish_soap", bottle((90, 200, 110), (240, 240, 240), (230, 250, 230))),
    ("notebook", draw_notebook),
    ("umbrella", draw_umbrella),
    ("backpack", draw_backpack),
]


def item_sheet():
    sheet = Image.new("RGBA", (16 * len(ITEM_ICONS), 16), (0, 0, 0, 0))
    for i, (_, src) in enumerate(ITEM_ICONS):
        if src.__code__.co_argcount == 0:
            im = src()
        else:
            im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); src(ImageDraw.Draw(im))
        sheet.alpha_composite(im, (i * 16, 0))
    sheet.save("art/vanquest_items.png")


# ------------------------------------------------------------------ outfits
SHIRT = [(66, 163, 121), (54, 144, 105)]          # Kenney char 0: green tee (light, shade)
TROUSERS = [(214, 212, 170), (197, 185, 147)]     # khaki (light, shade)
SHOE = (220, 134, 82)                             # same orange as the hair → only rows ≥ 13
TOPS = {  # top item id → (light, shade); None = default green tee
    None: None, "tshirt": [(238, 238, 238), (206, 206, 214)], "kurta": [(240, 170, 60), (214, 140, 40)],
    "formal_shirt": [(152, 192, 236), (120, 160, 210)], "blazer": [(48, 58, 98), (34, 42, 74)],
    "silk_saree": [(204, 42, 122), (168, 26, 96)],
}
BOTTOMS = {None: None, "jeans": [(72, 102, 172), (56, 82, 142)]}
SHOES = {None: None, "sneakers": (242, 242, 246)}
OUTFITS = [(t, b, s) for t in TOPS for b in BOTTOMS for s in SHOES]   # row order


def outfit_sheet():
    src = Image.open(KENNEY).convert("RGBA")
    base = Image.new("RGBA", (12 * 16, 16), (0, 0, 0, 0))
    for r in range(3):
        for c in range(4):
            base.paste(src.crop(((23 + c) * 16, r * 16, (24 + c) * 16, (r + 1) * 16)), ((r * 4 + c) * 16, 0))
    sheet = Image.new("RGBA", (12 * 16, 16 * len(OUTFITS)), (0, 0, 0, 0))
    for row, (top, bottom, shoes) in enumerate(OUTFITS):
        im = base.copy(); px = im.load()
        # a saree is one garment: it recolours the trousers too (colour-only representation)
        lower = TOPS[top] if top == "silk_saree" else BOTTOMS[bottom]
        for y in range(16):
            for x in range(im.width):
                p = px[x, y]
                if p[3] == 0:
                    continue
                rgb = p[:3]
                if TOPS[top] and rgb in SHIRT:
                    px[x, y] = (*TOPS[top][SHIRT.index(rgb)], 255)
                elif lower and rgb in TROUSERS:
                    px[x, y] = (*lower[TROUSERS.index(rgb)], 255)
                elif SHOES[shoes] and rgb == SHOE and y >= 13:
                    px[x, y] = (*SHOES[shoes], 255)
        sheet.paste(im, (0, row * 16))
    sheet.save("art/player_outfits.png")


if __name__ == "__main__":
    vehicle_sheet(); item_sheet(); outfit_sheet()
    print("vehicles:", [v[0] for v in VEHICLES])
    print("items:", [i[0] for i in ITEM_ICONS])
    print("outfits:", len(OUTFITS))
