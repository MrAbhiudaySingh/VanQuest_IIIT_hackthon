"""Generates maps/city.tmj (Tiled JSON) — the Round 1 city.

This is a one-shot bootstrap: after it runs, edit maps/city.tmj in Tiled.
Re-running OVERWRITES manual Tiled edits. Run from the project root:
    python3 tools/make_extra_tiles.py && python3 tools/build_city.py

Coordinates are in tiles. Buildings are drawn in 3/4 view: a roof block on
top of a facade, with doors on the bottom facade row facing south.
"""
import json

W, H = 68, 50
T = 16
EXTRA_FIRST = 487  # firstgid of art/vanquest_extra.png (Kenney sheet has 486 tiles)

LAYERS = ["Ground", "Grass", "Roads", "Buildings", "BuildingDetails", "Props", "Foreground"]
grid = {name: [0] * (W * H) for name in LAYERS}
collision, zones, signs, spawn = [], [], [], []


def k(i):  # Kenney tile index -> gid
    return i + 1


def e(i):  # extra tile index -> gid
    return EXTRA_FIRST + i


def put(layer, x, y, gid):
    if 0 <= x < W and 0 <= y < H:
        grid[layer][y * W + x] = gid


def fill(layer, x, y, w, h, gid):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            put(layer, xx, yy, gid)


def nine(layer, x, y, w, h, s):
    """9-slice fill; s = 9 gids (TL,T,TR,ML,M,MR,BL,B,BR)."""
    for yy in range(h):
        row = 0 if yy == 0 else 2 if yy == h - 1 else 1
        for xx in range(w):
            col = 0 if xx == 0 else 2 if xx == w - 1 else 1
            put(layer, x + xx, y + yy, s[row * 3 + col])


def solid(x, y, w=1, h=1, pad=(0, 0, 0, 0)):
    """Collision rect in tiles; pad = (left, top, right, bottom) inset in px."""
    l, t, r, b = pad
    collision.append((x * T + l, y * T + t, w * T - l - r, h * T - t - b))


def K9(*ids):
    return [k(i) for i in ids]


# ---- tile vocab (Kenney RPG Urban Pack, tilemap_packed.png) ---------------
SIDEWALK = K9(8, 9, 10, 35, 36, 37, 62, 63, 64)
PLAZA = K9(11, 12, 13, 38, 39, 40, 65, 66, 67)
GRASS = K9(0, 1, 2, 27, 28, 29, 54, 55, 56)
WATER = K9(170, 171, 172, 197, 198, 199, 224, 225, 226)
ROOF_TAN = K9(81, 82, 83, 108, 109, 110, 135, 136, 137)
ROOF_GREY = K9(89, 90, 91, 116, 117, 118, 143, 144, 145)

# walls: 9 gids + 3 band gids
RED = K9(20, 21, 22, 74, 75, 76, 101, 102, 103, 47, 48, 49)
RED_P = K9(17, 18, 19, 71, 72, 73, 98, 99, 100, 44, 45, 46)
ORANGE = K9(128, 129, 130, 182, 183, 184, 209, 210, 211, 155, 156, 157)
ORANGE_P = K9(125, 126, 127, 179, 180, 181, 206, 207, 208, 152, 153, 154)
SLATE = [e(i) for i in range(0, 12)]
CREAM_P = [e(i) for i in range(12, 24)]
SLATE_P = [e(i) for i in range(44, 56)]
AWN_GREEN = K9(328, 329, 330)
AWN_RED = [e(24), e(25), e(26)]
AWN_BLUE = [e(29), e(30), e(31)]
AWN_PURPLE = [e(34), e(35), e(36)]
AWN_GOLD = [e(39), e(40), e(41)]

ASPHALT, DASH_H, DASH_V = k(440), k(433), k(462)
ZEBRA_V, ZEBRA_H = k(435), k(432)  # bars for crossing a horizontal / vertical road

WIN_ARCH, WIN_ARCH2, WIN_SMALL, WIN_SQ, WIN_WIDE = k(336), k(337), k(335), k(364), k(390)
WIN_G_SQ, WIN_G_SQ2, WIN_G_ARCH, WIN_G_WIDE = k(444), k(445), k(417), k(471)
GLASS_TOP, GLASS_MID, GLASS_BOT = k(419), k(446), k(473)
TALL_TOP, TALL_MID, TALL_BOT = k(338), k(365), k(392)
SHOP_WIN = K9(359, 360, 361)
SHOP_WIN2 = K9(386, 387, 388)
DOOR_HOUSE, DOOR_WOOD2, DOOR_WHITE2, DOOR_DARK2, DOOR_GLASS = k(283), k(284), k(285), k(312), k(255)
DOOR_SHOP = k(414)
BIG_DOOR_L, BIG_DOOR_R = k(412), k(413)


def wall(x, y, w, h, s, bands=()):
    for yy in range(h):
        row = 0 if yy == 0 else 2 if yy == h - 1 else 1
        for xx in range(w):
            col = 0 if xx == 0 else 2 if xx == w - 1 else 1
            g = s[9 + col] if yy in bands else s[row * 3 + col]
            put("Buildings", x + xx, y + yy, g)


def building(x, y, w, roof_h, fac_h, roof, walls, bands=()):
    """Draws roof + facade; whole footprint is solid. Returns facade top row."""
    nine("Buildings", x, y, w, roof_h, roof)
    wall(x, y + roof_h, w, fac_h, walls, bands)
    solid(x, y, w, roof_h + fac_h)
    return y + roof_h


def detail(x, y, gid):
    put("BuildingDetails", x, y, gid)


def entrance(loc_id, name, door_x, door_y, w=1):
    """Interaction zone: the tiles directly in front of (south of) the door."""
    zones.append(dict(id=loc_id, name=name, x=(door_x - 1) * T, y=(door_y + 1) * T,
                      w=(w + 2) * T, h=2 * T))


def sign(text, x, y, w, style="plaque"):
    """In-world signboard centred on tile row y, spanning w tiles from x."""
    signs.append(dict(text=text, x=x * T, y=y * T + 3, w=w * T, h=10, style=style))


# ---- props ----------------------------------------------------------------
def tree(x, y, kind="teal"):
    top, base = {"teal": (232, 259), "teal2": (233, 260), "orange": (313, 340), "orange2": (314, 341)}[kind]
    put("Foreground", x, y - 1, k(top))
    put("Props", x, y, k(base))
    solid(x, y, pad=(3, 4, 3, 0))


def bush(x, y, kind=292):
    put("Props", x, y, k(kind))
    solid(x, y, pad=(2, 4, 2, 0))


def lamp(x, y):
    put("Foreground", x, y - 1, k(165))
    put("Props", x, y, k(192))
    solid(x, y, pad=(5, 8, 5, 0))


def prop(x, y, tile, pad=(1, 4, 1, 0)):
    put("Props", x, y, k(tile))
    solid(x, y, pad=pad)


def fence_row(x, y, w, gaps=(), kind="wood"):
    a, m, b = (382, 383, 384) if kind == "wood" else (355, 356, 357)
    for xx in range(x, x + w):
        if xx in gaps:
            continue
        g = a if xx == x or xx - 1 in gaps else b if xx == x + w - 1 or xx + 1 in gaps else m
        put("Props", xx, y, k(g))
        solid(xx, y, pad=(0, 6, 0, 2))


def hedge_col(x, y, h):
    for yy in range(y, y + h):
        bush(x, yy, 292 if yy % 2 else 265)


# ===========================================================================
# GROUND: sidewalk blocks + roads
# ===========================================================================
fill("Ground", 0, 0, W, H, k(36))
BLOCKS = {  # x, y, w, h (including kerb ring)
    "A1": (0, 0, 18, 20), "B1": (21, 0, 24, 20), "C1": (48, 0, 20, 20),
    "A2n": (0, 23, 18, 12), "B2n": (21, 23, 24, 12),
    "A2s": (0, 38, 18, 12), "B2s": (21, 38, 24, 12), "C2": (48, 23, 20, 27),
}
for bx, by, bw, bh in BLOCKS.values():
    nine("Ground", bx, by, bw, bh, SIDEWALK)


def road_h(y, x0, x1):
    fill("Roads", x0, y, x1 - x0, 3, ASPHALT)
    fill("Roads", x0, y + 1, x1 - x0, 1, DASH_H)


def road_v(x, y0, y1):
    fill("Roads", x, y0, 3, y1 - y0, ASPHALT)
    fill("Roads", x + 1, y0, 1, y1 - y0, DASH_V)


road_v(18, 0, H)
road_v(45, 0, H)
road_h(20, 0, W)
road_h(35, 0, 45)        # Elm Street (residential), dead-ends at the estate gate
fill("Roads", 18, 20, 3, 3, ASPHALT)
fill("Roads", 45, 20, 3, 3, ASPHALT)
fill("Roads", 18, 35, 3, 3, ASPHALT)
fill("Roads", 45, 35, 3, 3, ASPHALT)
for cx in (16, 22, 43, 49):          # zebra crossings over the main street
    fill("Roads", cx, 20, 2, 3, ZEBRA_V)
for cy in (18, 23):                    # over the avenues
    fill("Roads", 18, cy, 3, 1, ZEBRA_H)
    fill("Roads", 45, cy, 3, 1, ZEBRA_H)
fill("Roads", 18, 33, 3, 1, ZEBRA_H)

# ===========================================================================
# EDUCATION DISTRICT (block A1)
# ===========================================================================
# Ashford College — wide red-brick hall with arched windows
f = building(1, 1, 12, 3, 5, ROOF_TAN, RED_P, bands=(2,))
for xx in (2, 3, 5, 8, 10, 11):
    detail(xx, f + 1, WIN_ARCH)
    detail(xx, f + 3, WIN_ARCH2)
detail(6, f + 4, DOOR_WHITE2)
detail(7, f + 4, DOOR_WHITE2)
prop(4, 2, 333)  # rooftop AC
sign("ASHFORD COLLEGE", 3, f, 8)
entrance("college", "Ashford College", 6, f + 4, 2)
# college lawn
nine("Grass", 13, 1, 4, 8, GRASS)
tree(14, 3); tree(16, 5, "teal2"); tree(14, 7); bush(16, 8, 238)

# quad between college and school (path left open in front of both doors)
nine("Grass", 1, 10, 4, 2, GRASS)
nine("Grass", 9, 10, 8, 2, GRASS)
lamp(5, 11); lamp(8, 11); prop(12, 11, 381, (0, 6, 0, 2)); tree(15, 11, "orange")

# Riverside High School — orange brick, grey roof
f = building(1, 13, 10, 2, 4, ROOF_GREY, ORANGE_P, bands=(1,))
for xx in (2, 3, 4, 7, 8, 9):
    detail(xx, f + 0, WIN_SQ)
    detail(xx, f + 2, WIN_SQ)
detail(5, f + 3, DOOR_WOOD2)
detail(6, f + 3, DOOR_WOOD2)
sign("RIVERSIDE HIGH", 2, f + 1, 8)
entrance("school", "Riverside High School", 5, f + 3, 2)
# schoolyard
fill("Grass", 12, 13, 5, 6, k(28))
nine("Grass", 12, 13, 5, 6, GRASS)
fence_row(12, 13, 5, kind="metal")
prop(13, 16, 270, (0, 6, 0, 3)); prop(15, 16, 271, (0, 6, 0, 3)); tree(16, 18, "teal2")

# ===========================================================================
# FINANCIAL DISTRICT (block B1)
# ===========================================================================
# Compound Financial Academy — classical red brick, green awning
nine("Grass", 22, 1, 7, 6, GRASS)
tree(23, 3, "teal2"); tree(27, 3); bush(25, 5, 238); tree(23, 6); tree(27, 6, "teal2")
f = building(22, 8, 7, 3, 5, ROOF_TAN, RED_P, bands=(2,))
for xx in (23, 24, 26, 27):
    detail(xx, f + 1, WIN_ARCH)
    detail(xx, f + 3, WIN_SQ)
detail(25, f + 1, WIN_ARCH2)
detail(25, f + 4, DOOR_WHITE2)
for xx, g in zip((24, 25, 26), AWN_GREEN):
    put("BuildingDetails", xx, f + 3, g)
sign("FINANCIAL ACADEMY", 22, f, 7)
entrance("finance_academy", "Compound Financial Academy", 25, f + 4)

# Summit Financial Tower — 8 wide, 15 tall, slate glass; the landmark
f = building(30, 1, 8, 4, 11, ROOF_GREY, SLATE_P, bands=(9,))
nine("BuildingDetails", 32, 2, 4, 2, K9(437, 437, 438, 437, 437, 438, 464, 464, 465))  # helipad ring
put("BuildingDetails", 32, 2, k(437)); put("BuildingDetails", 33, 2, k(438))
put("BuildingDetails", 32, 3, k(464)); put("BuildingDetails", 33, 3, k(465))
put("BuildingDetails", 34, 2, k(333)); put("BuildingDetails", 35, 3, k(334))
for xx in range(31, 37):
    put("BuildingDetails", xx, f, GLASS_TOP)
    for yy in range(f + 1, f + 8):
        put("BuildingDetails", xx, yy, GLASS_MID)
    put("BuildingDetails", xx, f + 8, GLASS_BOT)
for xx, g in zip((31, 32), SHOP_WIN2[:2]):
    detail(xx, f + 10, g)
for xx, g in zip((35, 36), SHOP_WIN2[1:]):
    detail(xx, f + 10, g)
detail(33, f + 10, BIG_DOOR_L)
detail(34, f + 10, BIG_DOOR_R)
sign("SUMMIT FINANCIAL", 30, f + 9, 8, style="landmark")
entrance("financial_tower", "Summit Financial Tower", 33, f + 10, 2)

# Round 3 removed the Northgate office; Round 4 puts a compact bank on the lower part of that plot
# (the garden keeps its upper half). Nidhi Bank: cream stone, gold awning, door onto the tower plaza.
nine("Grass", 39, 1, 5, 6, GRASS)
for xx, yy, kind in ((40, 3, "orange2"), (42, 3, "orange")):
    tree(xx, yy, kind)
prop(42, 6, 381, (0, 6, 0, 2))
f = building(39, 8, 5, 3, 5, ROOF_GREY, CREAM_P, bands=(2,))
for xx in (40, 42):
    detail(xx, f + 1, WIN_ARCH); detail(xx, f + 3, WIN_SQ)
detail(41, f + 1, WIN_ARCH2)
for xx, g in zip((40, 41, 42), AWN_GOLD):
    detail(xx, f + 3, g)
detail(41, f + 4, DOOR_WHITE2)
put("BuildingDetails", 40, 9, k(334))
sign("NIDHI BANK", 39, f, 5, style="landmark")
entrance("bank", "Nidhi Bank", 41, f + 4)

# plaza in front of the tower
nine("Ground", 22, 16, 22, 3, PLAZA)
for xx in (23, 29, 38, 42):
    lamp(xx, 17)
prop(27, 17, 381, (0, 6, 0, 2)); prop(40, 17, 381, (0, 6, 0, 2))
prop(28, 18, 253)
put("Props", 31, 18, k(230)); solid(31, 18, pad=(1, 3, 1, 1))  # fountain basins
put("Props", 36, 18, k(230)); solid(36, 18, pad=(1, 3, 1, 1))
spawn.append((33 * T + 8, 18 * T + 12))

# ===========================================================================
# MARKETPLACE (block C1)
# ===========================================================================
SHOPS_N = [  # id, name, sign, x, walls, awning, roof
    ("market_grocery", "FreshCart Grocery", "FRESHCART", 49, RED, AWN_GREEN, ROOF_TAN),
    ("market_clothing", "Thread & Co. Clothing", "THREAD & CO.", 55, ORANGE, AWN_PURPLE, ROOF_GREY),
    ("market_electronics", "Voltline Electronics", "VOLTLINE", 61, SLATE, AWN_BLUE, ROOF_TAN),
]
SHOPS_S = [
    ("market_furniture", "Hearth Home & Furniture", "HEARTH HOME", 49, ORANGE_P, AWN_RED, ROOF_TAN),
    ("market_jewellery", "Aurum Jewellers", "AURUM", 61, CREAM_P, AWN_GOLD, ROOF_GREY),
]


def shop(loc_id, name, label, x, y, w, walls, awning, roof):
    f = building(x, y, w, 2, 3, roof, walls)
    detail(x + 1, f, WIN_G_WIDE); detail(x + w - 2, f, WIN_G_WIDE)
    for xx in range(x + 1, x + w - 1):
        g = awning[0] if xx == x + 1 else awning[2] if xx == x + w - 2 else awning[1]
        detail(xx, f + 1, g)
    door = x + w // 2
    for xx in range(x + 1, x + w - 1):
        if xx != door:
            detail(xx, f + 2, SHOP_WIN[0] if xx == x + 1 else SHOP_WIN[2] if xx == x + w - 2 else SHOP_WIN[1])
    detail(door, f + 2, DOOR_SHOP)
    sign(label, x, f, w)
    entrance(loc_id, name, door, f + 2)
    return door, f + 2


for loc_id, name, label, x, walls, awn, roof in SHOPS_N:
    shop(loc_id, name, label, x, 1, 6, walls, awn, roof)
for loc_id, name, label, x, walls, awn, roof in SHOPS_S:
    shop(loc_id, name, label, x, 13, 6, walls, awn, roof)

# market square
nine("Ground", 49, 7, 18, 5, PLAZA)
for xx, t in ((52, 277), (53, 304), (54, 276)):
    prop(xx, 9, t, (0, 3, 0, 0))                 # produce stalls near the grocer
for xx in (50, 56, 62, 66):
    lamp(xx, 11)
prop(59, 10, 381, (0, 6, 0, 2)); prop(64, 9, 270, (0, 6, 0, 3))
tree(57, 11, "orange"); tree(60, 11, "orange2")
put("Props", 63, 7, k(230)); solid(63, 7, pad=(1, 3, 1, 1))
prop(66, 7, 253)
# gateway from Main Street into the square
nine("Ground", 55, 13, 6, 6, PLAZA)
lamp(55, 14); lamp(60, 14)
sign("MARKET SQUARE", 56, 12, 4, style="street")

# ===========================================================================
# RESIDENTIAL — Elm Street (blocks A2n, B2n, C2) + apartments (A2s)
# ===========================================================================
HOMES = []

# 1) Starter home — 4x4 box on a narrow plot
nine("Grass", 1, 27, 6, 7, GRASS)
f = building(2, 28, 4, 2, 2, ROOF_TAN, ORANGE)
detail(3, f + 1, DOOR_HOUSE); detail(4, f, WIN_SMALL); detail(2, f + 1, WIN_SMALL)
fence_row(1, 33, 6, gaps=(3,))
bush(6, 31, 238)
sign("12 ELM ST", 2, f - 1, 4, style="street")
entrance("home_starter", "Starter Home · 12 Elm St", 3, f + 1)

# 2) Family home — 6 wide, two windows a side, front yard and tree
nine("Grass", 8, 24, 9, 10, GRASS)
f = building(9, 25, 6, 3, 3, ROOF_TAN, RED, bands=(1,))
for xx in (10, 13):
    detail(xx, f, WIN_SQ); detail(xx, f + 2, WIN_SQ)
detail(11, f + 2, DOOR_HOUSE); detail(12, f + 2, WIN_SMALL)
prop(14, 26, 334)
tree(16, 27, "teal2"); bush(15, 32, 238); bush(8, 32, 238)
fence_row(8, 33, 9, gaps=(11,))
sign("18 ELM ST", 9, f - 1, 6, style="street")
entrance("home_family", "Family Home · 18 Elm St", 11, f + 2)

# 3) Large house — 8 wide two-storey, garden, driveway with parked car
nine("Grass", 22, 24, 15, 10, GRASS)
f = building(24, 25, 8, 3, 4, ROOF_GREY, RED_P, bands=(1,))
for xx in (25, 26, 29, 30):
    detail(xx, f, WIN_ARCH); detail(xx, f + 2, WIN_SQ)
detail(27, f + 3, DOOR_WOOD2); detail(28, f + 3, DOOR_WOOD2)
fill("Grass", 33, 29, 2, 5, 0)                 # driveway cut out of the lawn
fill("Roads", 33, 29, 2, 5, ASPHALT)
put("Props", 33, 30, k(449)); put("Props", 33, 31, k(476)); solid(33, 30, 1, 2, (1, 2, 1, 0))
for xx, yy, kind in ((22, 26, "orange"), (22, 30, "teal"), (35, 26, "teal2"), (36, 31, "orange2")):
    tree(xx, yy, kind)
bush(32, 26, 238)
fence_row(22, 33, 15, gaps=(27, 28, 33, 34))
sign("24 ELM ST", 25, f - 1, 6, style="street")
entrance("home_large", "Large House · 24 Elm St", 27, f + 3, 2)

# pocket park
nine("Grass", 38, 24, 6, 10, GRASS)
nine("Grass", 39, 26, 3, 3, WATER)
solid(39, 26, 3, 3, (2, 2, 2, 2))
tree(43, 25, "orange"); tree(38, 30, "teal"); tree(43, 31, "teal2")
prop(40, 31, 381, (0, 6, 0, 2))

# 4) Willowbrook Estate — whole SE block: fenced, gated, mansion + pool
fill("Grass", 49, 24, 18, 25, k(28))
nine("Grass", 49, 24, 18, 25, GRASS)
fence_row(49, 24, 18, kind="metal")
fence_row(49, 48, 18, kind="metal")
hedge_col(49, 25, 10); hedge_col(49, 38, 10)   # gate gap at y35..37 facing Elm St
hedge_col(66, 25, 23)
fill("Grass", 49, 35, 15, 3, 0)                # gated driveway + forecourt
nine("Ground", 49, 35, 15, 3, PLAZA)
lamp(50, 34); lamp(50, 38)
f = building(52, 26, 12, 4, 5, ROOF_GREY, CREAM_P, bands=(2,))
put("BuildingDetails", 54, 27, k(333)); put("BuildingDetails", 61, 28, k(334))
for xx in (53, 55, 60, 62):
    detail(xx, f, TALL_TOP); detail(xx, f + 1, TALL_MID); detail(xx, f + 2, TALL_MID)
    detail(xx, f + 3, TALL_MID); detail(xx, f + 4, TALL_BOT)
for xx in (54, 61):
    detail(xx, f + 1, WIN_ARCH); detail(xx, f + 3, WIN_ARCH2)
detail(57, f + 4, DOOR_WHITE2); detail(58, f + 4, DOOR_WHITE2)
detail(56, f + 1, WIN_SQ); detail(59, f + 1, WIN_SQ)
for xx, g in zip((56, 57, 58, 59), (AWN_GOLD[0], AWN_GOLD[1], AWN_GOLD[1], AWN_GOLD[2])):
    detail(xx, f + 3, g)
sign("WILLOWBROOK ESTATE", 53, f - 1, 10, style="landmark")
entrance("home_luxury", "Willowbrook Estate", 57, f + 4, 2)
# fountain
put("Props", 63, 36, k(230)); solid(63, 36, pad=(1, 3, 1, 1))
# pool terrace
fill("Grass", 54, 39, 11, 7, 0)
nine("Ground", 54, 39, 11, 7, PLAZA)
nine("Props", 55, 40, 9, 4, WATER)
solid(55, 40, 9, 4, (2, 2, 2, 2))
for xx in (55, 57, 59):
    prop(xx, 45, 327, (2, 6, 2, 1))
tree(51, 41, "teal"); tree(51, 45, "teal2"); tree(64, 46, "orange"); tree(53, 47, "orange2")

# Elm Court Apartments (south side) — 3-storey red brick
f = building(1, 39, 9, 2, 7, ROOF_TAN, RED, bands=(1, 3, 5))
for xx in (2, 3, 5, 7, 8):
    for yy in (f, f + 2, f + 4):
        detail(xx, yy, WIN_SQ)
detail(5, f + 6, DOOR_GLASS); detail(4, f + 6, WIN_SMALL); detail(6, f + 6, WIN_SMALL)
prop(3, 40, 333)
sign("ELM COURT", 2, f + 5, 7, style="street")
entrance("home_apartment", "Elm Court Flat 2B", 5, f + 6)

# Corner Convenience — small red-awning shop
f = building(11, 42, 6, 2, 3, ROOF_TAN, RED_P)
for xx in range(12, 16):
    detail(xx, f + 1, AWN_RED[0] if xx == 12 else AWN_RED[2] if xx == 15 else AWN_RED[1])
detail(12, f + 2, SHOP_WIN[0]); detail(13, f + 2, SHOP_WIN[2]); detail(15, f + 2, SHOP_WIN[2])
detail(14, f + 2, DOOR_SHOP)
sign("CORNER STORE", 11, f, 6)
entrance("market_general", "Corner Convenience", 14, f + 2)
prop(11, 48, 251); prop(16, 48, 305)
nine("Grass", 11, 39, 6, 2, GRASS)
tree(12, 40, "teal2"); tree(15, 40, "orange")

# Lakeview Residences (Round 3) — the "better apartment": 3-storey cream block by the park
f = building(22, 39, 7, 2, 6, ROOF_GREY, CREAM_P, bands=(1, 3))
for xx in (23, 24, 26, 27):
    for yy in (f, f + 2, f + 4):
        detail(xx, yy, WIN_ARCH if yy == f else WIN_SQ)
detail(25, f + 5, DOOR_WHITE2); detail(25, f + 2, WIN_SQ)
for xx, g in zip((24, 25, 26), AWN_BLUE):
    detail(xx, f + 4, g)
sign("LAKEVIEW", 22, f + 1, 7, style="street")
entrance("home_apartment_plus", "Lakeview Residences 4A", 25, f + 5)
tree(29, 46, "teal2")

# Elm Park (south-centre): a small green with a pond between the flats and the dealership
nine("Grass", 30, 39, 7, 10, GRASS)
nine("Props", 31, 41, 5, 4, WATER)
solid(31, 41, 5, 4, (2, 2, 2, 2))
for xx, yy, kind in ((30, 47, "orange"), (36, 40, "teal"), (36, 47, "orange2")):
    tree(xx, yy, kind)
prop(33, 47, 381, (0, 6, 0, 2)); lamp(30, 44)
sign("ELM PARK", 31, 39, 4, style="street")

# Roadstar Motors (Round 3) — glass showroom with a forecourt opening onto the avenue
f = building(37, 39, 7, 2, 3, ROOF_GREY, SLATE)
for xx, g in zip((38, 39, 41, 42), (SHOP_WIN2[0], SHOP_WIN2[1], SHOP_WIN2[1], SHOP_WIN2[2])):
    detail(xx, f + 2, g)
detail(40, f + 2, BIG_DOOR_L)
for xx in range(38, 43):
    detail(xx, f + 1, AWN_BLUE[0] if xx == 38 else AWN_BLUE[2] if xx == 42 else AWN_BLUE[1])
sign("ROADSTAR MOTORS", 37, f, 7, style="landmark")
entrance("car_dealership", "Roadstar Motors", 40, f + 2)
fill("Roads", 37, 44, 7, 5, ASPHALT)                      # forecourt (drivable)
for xx in (38, 42):
    put("Roads", xx, 48, k(442))                           # "P" bays

# street furniture along Main Street / avenues
# parked vehicles stay in the west lanes (x18 / x45); the east lanes (x20 / x47)
# carry moving southbound traffic (India drives on the left), spawned by CityScene.
# (Round 4: the parked cars that sat in the avenue lanes were removed — traffic now uses them)
for xx, yy in ((16, 19), (23, 19), (44, 19), (48, 19), (17, 23), (22, 23), (44, 23), (16, 34), (23, 34)):
    lamp(xx, yy)
TRAFFIC_LIGHTS = [(17, 19), (21, 23), (43, 19), (48, 23)]       # animated by CityScene (tiles 408/409/411)
for xx, yy in TRAFFIC_LIGHTS:
    prop(xx, yy, 409, (5, 8, 5, 0))
# planters, bins, hydrants and a bus stop along Main Street
for xx in (2, 9, 26, 40, 56, 66):
    prop(xx, 19, 286, (3, 4, 3, 0))
for xx in (4, 30, 36, 58, 64):
    prop(xx, 23, 287, (3, 4, 3, 0))
prop(24, 19, 279, (3, 6, 3, 0)); prop(47 + 3, 19, 279, (3, 6, 3, 0)); prop(14, 23, 251, (4, 7, 4, 0))
put("Foreground", 12, 18, k(188)); prop(12, 19, 195, (5, 6, 5, 0))   # bus stop sign
prop(13, 19, 270, (0, 6, 0, 3))                                         # bus stop bench

# shop identities on the street
for i, t in enumerate((243, 244, 245, 246, 247)):                       # clothes rail outside Thread & Co.
    put("Props", 56 + i, 7, k(t))
solid(56, 7, 5, 1, (0, 6, 0, 2))
prop(49, 18, 327, (2, 6, 2, 1)); prop(50, 18, 354, (2, 6, 2, 1))       # furniture on display
for i, t in enumerate((216, 218, 220)):                                 # velvet rope at Aurum
    put("Props", 60 + i, 18, k(t))
solid(60, 18, 3, 1, (0, 6, 0, 3))
prop(31, 16, 286, (3, 4, 3, 0)); prop(36, 16, 286, (3, 4, 3, 0))       # tower entrance planters
for xx in (5, 13, 30):                                                  # mailboxes at the homes
    prop(xx, 34, 305, (3, 6, 3, 0))

# map edges: Main Street and the avenues run off the map (traffic enters and leaves there; the
# world bounds keep the player in). Only dead-end Elm Street keeps its barrier.
for i, t in enumerate((248, 249, 248)):
    prop(0, 35 + i, t, (0, 4, 0, 0))

# ===========================================================================
# NPCs (object layer "NPCs", editable in Tiled)
#   shopkeeper: stands beside a shop door (property shop = location id)
#   idler:      stands still, turns now and then (properties char, facing)
#   poi:        places ambient walkers stroll between
#   car_lane:   a traffic lane (axis v/h, dir ±1) — its tile column/row
#   agent / dealer / banker: the property agent, the car salesperson and the bank officer
#   display_car / car_delivery: showroom cars and the spot where bought cars are parked
# ===========================================================================
def clear_tile(tx, ty, avoid_zones=True):
    fx, fy = tx * T + 8, ty * T + 12
    l, r, t_, b = fx - 5, fx + 5, fy - 6, fy
    if not (0 < l and r < W * T and 0 < t_ and b < H * T):
        return False
    if any(l < x + w and r > x and t_ < y + h and b > y for x, y, w, h in collision):
        return False
    return not avoid_zones or not any(z["x"] <= fx < z["x"] + z["w"] and z["y"] <= fy < z["y"] + z["h"] for z in zones)


npcs = []
for z in zones:
    if not z["id"].startswith("market_") or z["id"] == "market_furniture":   # Farah works inside the shop
        continue
    dx, dy = z["x"] // T + 1, z["y"] // T - 1            # door tile
    for ox, oy in ((2, 1), (-2, 1), (2, 2), (-2, 2), (3, 1), (-3, 1)):
        if clear_tile(dx + ox, dy + oy):
            npcs.append(dict(type="shopkeeper", x=dx + ox, y=dy + oy, props={"shop": z["id"]}))
            break
    else:
        raise SystemExit(f"no free spot for {z['id']} shopkeeper")
for x, y, char, facing in ((25, 18, 3, "right"), (26, 18, 4, "left"), (61, 9, 1, "right"), (62, 9, 5, "left"),
                           (34, 46, 2, "right"), (35, 46, 0, "left")):
    assert clear_tile(x, y), (x, y)
    npcs.append(dict(type="idler", x=x, y=y, props={"char": str(char), "facing": facing}))
POIS = [(6, 19), (11, 19), (29, 18), (40, 18), (52, 6), (60, 10), (57, 18), (10, 34), (27, 34),
        (3, 48), (14, 48), (33, 46), (28, 48), (33, 23), (55, 23), (8, 9), (16, 12)]
for x, y in POIS:
    if not clear_tile(x, y, avoid_zones=False):
        raise SystemExit(f"poi {(x, y)} blocked")
    npcs.append(dict(type="poi", x=x, y=y, props={}))
# traffic lanes (India drives on the left): southbound x20/x47, northbound x18/x45,
# eastbound y20, westbound y22. Each object marks the lane's centre line.
for axis, at, d in (("v", 20, 1), ("v", 18, -1), ("v", 47, 1), ("v", 45, -1), ("h", 20, 1), ("h", 22, -1)):
    npcs.append(dict(type="car_lane", x=at if axis == "v" else 0, y=0 if axis == "v" else at, props={"axis": axis, "dir": str(d)}))
# property agent right below the apartment blocks; car salesperson on the forecourt
for kind, x, y in (("agent", 8, 48), ("dealer", 42, 45), ("banker", 43, 17)):
    assert clear_tile(x, y), (kind, x, y)
    npcs.append(dict(type=kind, x=x, y=y, props={}))
# showroom display cars (decorative sprites) and where a newly bought car is parked
for model, x, y in (("hatch", 38, 46),):            # west side; the east side stays clear for driving out
    npcs.append(dict(type="display_car", x=x, y=y, props={"model": model}))
npcs.append(dict(type="car_delivery", x=40, y=48, props={}))

# ===========================================================================
# write Tiled JSON
# ===========================================================================
oid = [1]


def obj(**kw):
    o = dict(id=oid[0], name="", type="", rotation=0, visible=True)
    o.update(kw)
    oid[0] += 1
    return o


def props(**kv):
    return [dict(name=n, type="string", value=v) for n, v in kv.items()]


layers, lid = [], 1
for name in LAYERS:
    layers.append(dict(id=lid, name=name, type="tilelayer", width=W, height=H, x=0, y=0,
                       opacity=1, visible=True, data=grid[name]))
    lid += 1
layers.append(dict(id=lid, name="Collision", type="objectgroup", draworder="topdown",
                   opacity=0.5, visible=False, x=0, y=0, color="#ff3030",
                   objects=[obj(x=x, y=y, width=w, height=h) for x, y, w, h in collision]))
lid += 1
layers.append(dict(id=lid, name="Interactions", type="objectgroup", draworder="topdown",
                   opacity=0.6, visible=True, x=0, y=0, color="#30a0ff",
                   objects=[obj(name=z["id"], type="entrance", x=z["x"], y=z["y"], width=z["w"], height=z["h"],
                                properties=props(locationId=z["id"], displayName=z["name"])) for z in zones]))
lid += 1
layers.append(dict(id=lid, name="Signs", type="objectgroup", draworder="topdown",
                   opacity=1, visible=True, x=0, y=0,
                   objects=[obj(name=s["text"], type="sign", x=s["x"], y=s["y"], width=s["w"], height=s["h"],
                                text=dict(text=s["text"], halign="center", valign="center", pixelsize=8,
                                          color="#ffffff", wrap=False),
                                properties=props(style=s["style"])) for s in signs]))
lid += 1
layers.append(dict(id=lid, name="NPCs", type="objectgroup", draworder="topdown",
                   opacity=1, visible=True, x=0, y=0, color="#40d070",
                   objects=[obj(name=n["props"].get("shop", n["type"]), type=n["type"], point=True,
                                x=n["x"] * T + 8, y=n["y"] * T + 12, width=0, height=0,
                                properties=props(**n["props"])) for n in npcs]))
lid += 1
layers.append(dict(id=lid, name="Spawn", type="objectgroup", draworder="topdown",
                   opacity=1, visible=True, x=0, y=0,
                   objects=[obj(name="player_start", type="spawn", point=True, x=x, y=y, width=0, height=0)
                            for x, y in spawn]))
lid += 1

tmj = dict(
    type="map", version="1.10", tiledversion="1.12.2", orientation="orthogonal", renderorder="right-down",
    width=W, height=H, tilewidth=T, tileheight=T, infinite=False, compressionlevel=-1,
    nextlayerid=lid, nextobjectid=oid[0], layers=layers,
    tilesets=[
        dict(firstgid=1, name="kenney_rpg_urban", image="../Assets/kenney_rpgUrbanKit/Tilemap/tilemap_packed.png",
             imagewidth=432, imageheight=288, tilewidth=T, tileheight=T, tilecount=486, columns=27,
             margin=0, spacing=0),
        dict(firstgid=EXTRA_FIRST, name="vanquest_extra", image="../art/vanquest_extra.png",
             imagewidth=256, imageheight=64, tilewidth=T, tileheight=T, tilecount=64, columns=16,
             margin=0, spacing=0),
    ],
)
with open("maps/city.tmj", "w") as fh:
    json.dump(tmj, fh, separators=(",", ":"))
print(f"maps/city.tmj: {W}x{H}, {len(collision)} colliders, {len(zones)} entrances, {len(signs)} signs")
