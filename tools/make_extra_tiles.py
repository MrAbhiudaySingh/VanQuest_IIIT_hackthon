"""Builds art/vanquest_extra.png: recoloured copies of Kenney RPG Urban tiles (CC0).

Kenney ships only red/orange brick and green awnings; these recolours give the
tower, luxury estate and shops their own identity. Run from the project root:
    python3 tools/make_extra_tiles.py
The index order below is relied on by tools/build_city.py (EXTRA dict).
"""
import colorsys
from PIL import Image

SRC = "Assets/kenney_rpgUrbanKit/Tilemap/tilemap_packed.png"
OUT = "art/vanquest_extra.png"
COLS = 16

WALL = [20, 21, 22, 74, 75, 76, 101, 102, 103, 47, 48, 49]   # plain brick 9-slice + band
WALL_P = [17, 18, 19, 71, 72, 73, 98, 99, 100, 44, 45, 46]  # pillared brick 9-slice + band
AWNING = [328, 329, 330, 331, 332]


def recolour(tile, fn):
    px = tile.load()
    for y in range(16):
        for x in range(16):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            h, s, v = fn(h, s, v)
            r, g, b = colorsys.hsv_to_rgb(h % 1, min(1, s), min(1, v))
            px[x, y] = (round(r * 255), round(g * 255), round(b * 255), a)
    return tile


slate = lambda h, s, v: (0.60, s * 0.40, v * 0.62)
cream = lambda h, s, v: (0.11, s * 0.28, v * 1.18 + 0.08)
hue = lambda target: (lambda h, s, v: (target, s, v))

# (name, source tiles, transform) — order defines tile ids in the sheet
GROUPS = [
    ("slate", WALL, slate),
    ("cream", WALL_P, cream),
    ("awning_red", AWNING, hue(0.99)),
    ("awning_blue", AWNING, hue(0.60)),
    ("awning_purple", AWNING, hue(0.78)),
    ("awning_gold", AWNING, lambda h, s, v: (0.12, s * 0.9, v * 1.1)),
    ("slate_p", WALL_P, slate),
]

if __name__ == "__main__":
    src = Image.open(SRC).convert("RGBA")
    tiles = []
    for _, ids, fn in GROUPS:
        for i in ids:
            c, r = i % 27, i // 27
            tiles.append(recolour(src.crop((c * 16, r * 16, c * 16 + 16, r * 16 + 16)), fn))
    rows = -(-len(tiles) // COLS)
    sheet = Image.new("RGBA", (COLS * 16, rows * 16), (0, 0, 0, 0))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % COLS) * 16, (k // COLS) * 16))
    sheet.save(OUT)
    print(f"{OUT}: {len(tiles)} tiles, {COLS}x{rows}")


# ---------------------------------------------------------------------------
# art/vanquest_interior.png — original pixel art for home interiors (CC0, ours):
# walls, five floor styles, exit mat, window, and the home computer / laptop.
# Index order is relied on by src/scenes/HomeScene.js (INTERIOR dict).
# ---------------------------------------------------------------------------
from PIL import ImageDraw  # noqa: E402

INTERIOR_OUT = "art/vanquest_interior.png"


def _tile(fn):
    t = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    fn(ImageDraw.Draw(t))
    return t


def _wall_top(d):
    d.rectangle((0, 0, 15, 15), fill=(58, 52, 64)); d.line((0, 15, 15, 15), fill=(40, 36, 46))


def _wall_face(d):
    d.rectangle((0, 0, 15, 15), fill=(222, 206, 176))
    d.line((0, 0, 15, 0), fill=(190, 172, 142))
    for x in (3, 11):
        d.point((x, 6), fill=(212, 196, 166)); d.point((x + 2, 11), fill=(212, 196, 166))


def _wall_base(d):
    _wall_face(d); d.rectangle((0, 12, 15, 15), fill=(150, 112, 78)); d.line((0, 12, 15, 12), fill=(122, 88, 60))


def _floor(base, line, kind):
    def f(d):
        d.rectangle((0, 0, 15, 15), fill=base)
        if kind == "planks":
            for y in (3, 7, 11, 15): d.line((0, y, 15, y), fill=line)
            d.line((6, 0, 6, 3), fill=line); d.line((12, 4, 12, 7), fill=line); d.line((3, 8, 3, 11), fill=line); d.line((9, 12, 9, 15), fill=line)
        elif kind == "parquet":
            for i in range(0, 16, 4):   # basket weave: vertical strips on top, horizontal below
                d.line((i, 0, i, 7), fill=line)
                d.line((0, 8 + i // 2, 15, 8 + i // 2), fill=line)
            d.line((0, 15, 15, 15), fill=line)
        elif kind == "tiles":
            d.line((0, 15, 15, 15), fill=line); d.line((15, 0, 15, 15), fill=line); d.point((5, 9), fill=line); d.point((10, 4), fill=line)
        elif kind == "marble":
            d.line((0, 15, 15, 15), fill=line); d.line((15, 0, 15, 15), fill=line)
            d.line((2, 3, 7, 6), fill=(214, 214, 222)); d.line((8, 10, 13, 12), fill=(214, 214, 222))
        elif kind == "carpet":
            for y in range(1, 16, 4):
                for x in range((y // 4) % 2 * 2, 16, 4): d.point((x, y), fill=line)
    return f


def _mat(d):
    d.rectangle((1, 3, 14, 13), fill=(120, 72, 52)); d.rectangle((2, 4, 13, 12), outline=(160, 104, 70))


def _window(d):
    _wall_face(d); d.rectangle((3, 2, 12, 10), fill=(250, 250, 250)); d.rectangle((4, 3, 11, 9), fill=(150, 200, 230))
    d.line((8, 3, 8, 9), fill=(250, 250, 250)); d.line((4, 6, 11, 6), fill=(250, 250, 250))


def _monitor(d):  # desktop monitor + keyboard, sits on a desk tile
    d.rectangle((3, 0, 12, 7), fill=(40, 42, 52)); d.rectangle((4, 1, 11, 6), fill=(80, 170, 230))
    d.line((5, 2, 8, 2), fill=(200, 235, 255)); d.rectangle((7, 8, 8, 9), fill=(40, 42, 52))
    d.rectangle((3, 11, 12, 13), fill=(70, 72, 84)); d.line((4, 12, 11, 12), fill=(150, 150, 165))


def _laptop(d):
    d.rectangle((3, 2, 12, 8), fill=(60, 62, 74)); d.rectangle((4, 3, 11, 7), fill=(90, 190, 140))
    d.polygon([(2, 9), (13, 9), (14, 12), (1, 12)], fill=(150, 152, 165)); d.line((3, 10, 12, 10), fill=(110, 112, 125))


INTERIOR_TILES = [
    _wall_top, _wall_face, _wall_base,
    _floor((176, 160, 196), (156, 140, 178), "carpet"),     # 3 carpet (apartment)
    _floor((196, 196, 184), (170, 170, 158), "tiles"),      # 4 lino (starter)
    _floor((170, 118, 72), (142, 96, 58), "planks"),        # 5 wood (family)
    _floor((184, 132, 84), (150, 104, 64), "parquet"),      # 6 parquet (large)
    _floor((236, 236, 240), (206, 206, 214), "marble"),     # 7 marble (luxury)
    _mat, _window, _monitor, _laptop,
]

if __name__ == "__main__":
    sheet = Image.new("RGBA", (COLS * 16, 16), (0, 0, 0, 0))
    for k, fn in enumerate(INTERIOR_TILES):
        sheet.paste(_tile(fn), (k * 16, 0))
    sheet.save(INTERIOR_OUT)
    print(f"{INTERIOR_OUT}: {len(INTERIOR_TILES)} tiles")
