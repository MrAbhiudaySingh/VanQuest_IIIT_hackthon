"""Round 4 art (run from the project root):  python3 tools/make_round4_art.py

  art/vanquest_items32.png  32x32 product icons for electronics and jewellery, order = ICONS32.
                            Jewellery from the CC0 Jewelry Icons collection (Dungeon Crawl Stone Soup,
                            HomoHikka); electronics, earrings and the watch are original drawings
                            (no colour CC0 electronics pack was found) drawn at 16px and doubled.
  art/vanquest_topcars.png  gameguy's CC0 top-down cars, halved to fit 16px lanes and turned to face
                            EAST (heading 0); the game rotates them to the driving direction.
                            One 64x24 frame per entry in TOPCARS.
Index orders are mirrored in src/data/artIndex.js.
"""
from PIL import Image, ImageDraw

JEW = "Assets/cc0-jewelry-icons/"
CARS = "Assets/gameguy-top-view-cars/"


def drawn(fn):
    def make():
        im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); fn(ImageDraw.Draw(im))
        return im.resize((32, 32), Image.NEAREST)
    return make


def png(path):
    return lambda: Image.open(path).convert("RGBA")


OUT, DARK, SCREEN, GLINT = (36, 38, 48), (62, 66, 80), (88, 176, 236), (200, 236, 255)


def earphones(d):
    d.arc((3, 1, 12, 10), 200, 340, fill=OUT); d.line((4, 6, 4, 11), fill=OUT); d.line((11, 6, 11, 11), fill=OUT)
    d.ellipse((2, 10, 6, 14), fill=(240, 240, 245), outline=OUT); d.ellipse((9, 10, 13, 14), fill=(240, 240, 245), outline=OUT)


def smartphone(d):
    d.rounded_rectangle((4, 1, 11, 14), 1, fill=DARK, outline=OUT); d.rectangle((5, 3, 10, 11), fill=SCREEN)
    d.line((6, 4, 8, 4), fill=GLINT); d.point((7, 13), fill=(150, 150, 160))


def laptop(d):
    d.rectangle((3, 3, 12, 10), fill=DARK, outline=OUT); d.rectangle((4, 4, 11, 9), fill=SCREEN); d.line((5, 5, 7, 5), fill=GLINT)
    d.polygon([(1, 11), (14, 11), (15, 14), (0, 14)], fill=(170, 172, 184), outline=OUT); d.line((5, 12, 10, 12), fill=(120, 122, 134))


def desktop_pc(d):
    d.rectangle((1, 2, 10, 9), fill=DARK, outline=OUT); d.rectangle((2, 3, 9, 8), fill=SCREEN); d.line((5, 10, 6, 11), fill=OUT)
    d.rectangle((3, 12, 9, 13), fill=(120, 122, 134)); d.rectangle((11, 3, 14, 13), fill=(70, 74, 90), outline=OUT); d.point((12, 5), fill=(110, 230, 140))


def monitor(d):
    d.rectangle((1, 2, 14, 10), fill=DARK, outline=OUT); d.rectangle((2, 3, 13, 9), fill=SCREEN); d.line((3, 4, 6, 4), fill=GLINT)
    d.rectangle((7, 11, 8, 12), fill=OUT); d.rectangle((4, 13, 11, 14), fill=(120, 122, 134))


def printer(d):
    d.rectangle((4, 2, 11, 6), fill=(245, 245, 245), outline=(150, 150, 160)); d.rectangle((1, 6, 14, 12), fill=(170, 172, 184), outline=OUT)
    d.rectangle((4, 11, 11, 14), fill=(250, 250, 250), outline=(150, 150, 160)); d.point((12, 8), fill=(110, 230, 140))


def router(d):
    d.line((4, 2, 4, 7), fill=OUT); d.line((11, 2, 11, 7), fill=OUT); d.rounded_rectangle((1, 7, 14, 12), 2, fill=(240, 240, 245), outline=OUT)
    for x in (4, 6, 8): d.point((x, 10), fill=(110, 230, 140))


def smartwatch(d):
    d.rectangle((5, 0, 10, 3), fill=(40, 40, 50)); d.rectangle((5, 12, 10, 15), fill=(40, 40, 50))
    d.rounded_rectangle((3, 3, 12, 12), 2, fill=DARK, outline=OUT); d.rectangle((5, 5, 10, 10), fill=(30, 120, 90)); d.line((6, 7, 9, 7), fill=(170, 255, 210))


def earrings(d):
    for x in (2, 9):
        d.point((x + 2, 1), fill=(150, 110, 30)); d.ellipse((x, 3, x + 5, 10), outline=(240, 190, 60)); d.ellipse((x + 1, 4, x + 4, 9), outline=(200, 150, 40))
        d.point((x + 2, 10), fill=(255, 230, 140))


def watch(d):
    d.rectangle((5, 0, 10, 3), fill=(120, 80, 40)); d.rectangle((5, 12, 10, 15), fill=(120, 80, 40))
    d.ellipse((2, 2, 13, 13), fill=(230, 190, 80), outline=(140, 100, 30)); d.ellipse((4, 4, 11, 11), fill=(250, 248, 240))
    d.line((7, 7, 7, 5), fill=OUT); d.line((7, 7, 9, 8), fill=OUT); d.point((14, 7), fill=(140, 100, 30))


ICONS32 = [
    ("earphones", drawn(earphones)), ("smartphone", drawn(smartphone)), ("laptop", drawn(laptop)), ("desktop_pc", drawn(desktop_pc)),
    ("monitor", drawn(monitor)), ("printer", drawn(printer)), ("router", drawn(router)), ("smartwatch", drawn(smartwatch)),
    ("silver_chain", png(JEW + "jewelry-dcss_0/32x32/amulet/cameo_blue.png")),
    ("gold_earrings", drawn(earrings)),
    ("gold_ring", png(JEW + "jewelry-dcss_0/32x32/ring/ring_08_gold.png")),
    ("luxury_watch", drawn(watch)),
    ("diamond_pendant", png(JEW + "jewelry-dcss_0/32x32/amulet/crystal_white.png")),
]


def items32():
    sheet = Image.new("RGBA", (32 * len(ICONS32), 32), (0, 0, 0, 0))
    for i, (_, make) in enumerate(ICONS32):
        im = make(); sheet.alpha_composite(im, (i * 32 + (32 - im.width) // 2, (32 - im.height) // 2))
    sheet.save("art/vanquest_items32.png")


# ------------------------------------------------------------------ top-down cars
def recolour_black(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and r > 150 and g < 90 and b < 90:          # the red body → glossy black
                px[x, y] = (34 + (r - 150) // 6, 36, 44, a)
    return im


TOPCARS = [  # (id, file, transform)
    ("sedan", "car-truck1_1.png", None),
    ("pickup", "car-truck2_1.png", None),
    ("mpv", "car-truck3.png", None),
    ("executive", "car-truck1_1.png", recolour_black),   # a recolour of the sedan — documented
    ("truck_box", "car-truck4.png", None),
    ("truck_long", "car-truck5.png", None),
]
FRAME = (64, 24)


def topcars():
    sheet = Image.new("RGBA", (FRAME[0] * len(TOPCARS), FRAME[1]), (0, 0, 0, 0))
    for i, (_, f, fn) in enumerate(TOPCARS):
        im = Image.open(CARS + f).convert("RGBA")
        if fn: im = fn(im)
        im = im.resize((im.width // 2, im.height // 2), Image.NEAREST).rotate(-90, expand=True)   # nose (top) → east
        sheet.alpha_composite(im, (i * FRAME[0] + (FRAME[0] - im.width) // 2, (FRAME[1] - im.height) // 2))
    sheet.save("art/vanquest_topcars.png")


if __name__ == "__main__":
    items32(); topcars()
    print("items32:", [i[0] for i in ICONS32]); print("topcars:", [c[0] for c in TOPCARS])
