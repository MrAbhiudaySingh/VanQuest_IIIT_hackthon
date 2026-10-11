"""Scope the supplied UI stylesheets (Assets/supplied-ui/) so they can live inside the game page.

The supplied designs are stand-alone pages: their CSS styles :root, html, body and `*`. Inside the
game those rules would restyle everything, so this tool rewrites only the selectors — every
declaration (colours, spacing, fonts, borders, sizes) is copied unchanged:
  :root                      → .scope              (design tokens live on the overlay root)
  html, body.<page-class>    → .scope              (the page body becomes the overlay root)
  *                          → .scope, .scope *    (the pixel-square reset, inside the overlay only)
  anything else              → .scope <selector>
  @media blocks are scoped the same way inside; @keyframes blocks are copied unchanged.
  Relative url(...) references (e.g. a background image next to the stylesheet) are re-pointed at the
  same file in Assets/supplied-ui/, so they still load from the generated copy.
  Google-Fonts <link>s are replaced by the local
  @font-face rules in src/ui/skins/fonts.css (no network needed).

Run after updating a supplied design:   python3 tools/scope_supplied_css.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Assets" / "supplied-ui"
OUT = ROOT / "src" / "ui" / "skins"
JOBS = [  # (source stylesheet, scope class, output name)
    (SRC / "Store" / "Store" / "style.css", ".vq-store", "store.css"),
    (SRC / "vanguard (2)" / "vanguard" / "course cards" / "style.css", ".vq-courses", "courses.css"),
    (SRC / "vanguard (2)" / "vanguard" / "lecture ui" / "style.css", ".vq-lecture", "lecture.css"),
    (SRC / "part 2" / "Bank" / "Bank" / "style.css", ".vq-bank", "bank.css"),
    (SRC / "part 2" / "Vikram" / "style.css", ".vq-scam", "scammer.css"),
    (SRC / "vanguard (2)" / "vanguard" / "title screen" / "style.css", ".vq-title", "title.css"),
    # Round 7: these two designs keep their CSS in an inline <style> block of index.html
    (SRC / "journey" / "index.html", ".vq-journey", "journey.css"),
    (SRC / "achievements" / "index.html", ".vq-ach", "achievements.css"),
    # Round 8: main-screen navigation (inline <style>), Summit trading desk, property agent
    (SRC / "round8" / "main screen buttons" / "index.html", ".vq-nav", "nav.css"),
    (SRC / "round8" / "summit financial" / "style.css", ".vq-desk", "desk.css"),
    (SRC / "round8" / "property agent panel ui" / "styles.css", ".vq-agent", "agent.css"),
]


def scope_selector(sel, scope):
    sel = sel.strip()
    if sel == ":root":
        return [scope]
    if sel == "*":
        return [scope, f"{scope} *"]
    if sel == "html" or re.fullmatch(r"body(\.[\w-]+)?", sel):
        return [scope]
    return [f"{scope} {sel}"]


def scope_css(css, scope):
    out, i, n = [], 0, len(css)
    while i < n:
        ws = len(css[i:]) - len(css[i:].lstrip())
        if ws:                                            # keep whitespace as it is
            out.append(css[i:i + ws]); i += ws; continue
        if css.startswith("/*", i):                       # keep comments as they are (never part of a selector)
            j = css.index("*/", i) + 2
            out.append(css[i:j]); i = j; continue
        j = css.find("{", i)
        if j < 0:
            out.append(css[i:]); break
        head = css[i:j]
        lead = head[: len(head) - len(head.lstrip())]
        if head.strip().startswith("@keyframes"):         # animation steps are not selectors
            depth, k = 1, j + 1
            while depth:
                depth += {"{": 1, "}": -1}.get(css[k], 0); k += 1
            out.append(css[i:k]); i = k; continue
        if head.strip().startswith("@media"):
            depth, k = 1, j + 1                           # find the matching close brace
            while depth:
                depth += {"{": 1, "}": -1}.get(css[k], 0); k += 1
            out.append(f"{lead}{head.strip()} {{{scope_css(css[j + 1:k - 1], scope)}}}")
            i = k; continue
        k = css.index("}", j)
        sels = []
        for s in head.split(","):
            for x in scope_selector(s, scope):
                if x not in sels:
                    sels.append(x)
        out.append(f"{lead}{(',' + chr(10)).join(sels)} {css[j:k + 1]}")
        i = k + 1
    return "".join(out)


def repoint_urls(css, src):
    from urllib.parse import quote
    import os
    rel = os.path.relpath(src.parent, OUT).replace(os.sep, "/")
    def fix(m):
        u = m.group(2)
        if re.match(r"^(data:|https?:|/)", u):
            return m.group(0)
        return f'url("{quote(rel + "/" + u.lstrip("./"))}")'
    return re.sub(r"url\((['\"]?)([^)'\"]+)\1\)", fix, css)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for src, scope, name in JOBS:
        css = src.read_text(encoding="utf-8")
        if src.suffix == ".html":                         # a stand-alone page: take its <style> block
            css = re.search(r"<style>(.*?)</style>", css, re.S).group(1)
        css = re.sub(r"@import[^;]+;", "", css)              # web fonts are local (fonts.css); no network
        rel = src.relative_to(ROOT).as_posix()
        banner = f"/* GENERATED by tools/scope_supplied_css.py from {rel} — selectors scoped to {scope};\n   declarations unchanged. Edit the source design and re-run, not this file. */\n"
        (OUT / name).write_text(banner + repoint_urls(scope_css(css, scope), src), encoding="utf-8")
        print(f"{name}: {rel} -> {scope}")


if __name__ == "__main__":
    main()
