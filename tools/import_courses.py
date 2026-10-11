"""Import the supplied VanQuest Core Course documents (Assets/supplied-ui/*.docx) into the game.

The .docx files are the source of truth. Every paragraph, list, table, question and answer is
copied verbatim into src/data/courses.js; nothing is written, reworded or invented here. The only
thing this tool adds is structure, read from the documents' own styles:
  Heading 1 "Topic N — …"                      → a lesson (topic)
  Heading 1 overview / safety rule / core rule → an introductory lesson
  Heading 1 "Practical activity" / "Integrated …" → an activity lesson; blocks under an
                                                    "…answer guide" Heading 2 become `guide`
  Heading 1 "Knowledge check"                  → the course assessment:
      "N. question" + "A./B./C." options + "Answer key: 1-B, …"  → multiple choice
      "N. question" + "Answer: …"                                 → open answer with model answer
  "Learning objectives" / "Learning Outcomes"  → objectives;  "Glossary" table → glossary
  facilitator / game-design notes, sources, reflection → kept as reference sections
It fails loudly if a document doesn't match these patterns instead of guessing.

Run after the course documents change:   python3 -I tools/import_courses.py
"""
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Assets" / "supplied-ui"
OUT = ROOT / "src" / "data" / "courses.js"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def text_of(el):
    out = []
    for node in el.iter():
        if node.tag == W + "t":
            out.append(node.text or "")
        elif node.tag == W + "br":
            out.append("\n")
        elif node.tag == W + "tab":
            out.append("\t")
    return "".join(out).strip()


def style_of(p):
    s = p.find(f"{W}pPr/{W}pStyle")
    return s.get(W + "val") if s is not None else "Normal"


def raw_blocks(path):
    """The document body as a flat list of (style, text) / ('table', rows, head)."""
    body = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml")).find(W + "body")
    out = []
    for el in body:
        if el.tag == W + "p":
            t = text_of(el)
            if t:
                out.append({"style": style_of(el), "text": t})
        elif el.tag == W + "tbl":
            rows, shaded = [], []
            for tr in el.findall(W + "tr"):
                cells = tr.findall(W + "tc")
                rows.append([" ".join(text_of(p) for p in c.findall(W + "p")).strip() for c in cells])
                shaded.append(any(c.find(f"{W}tcPr/{W}shd") is not None for c in cells))
            # a header row is shaded differently from the body in these documents
            head = len(rows) > 1 and shaded[0] and not all(shaded[1:])
            out.append({"style": "table", "rows": rows, "head": head})
    return out


def to_blocks(items):
    """Group raw paragraphs into renderable blocks: h, p, ul, ol, table, callout."""
    blocks = []
    for it in items:
        st = it["style"]
        if st == "table":
            if all(len(r) == 1 for r in it["rows"]) and len(it["rows"]) == 1:
                blocks.append({"t": "callout", "text": it["rows"][0][0]})
            else:
                blocks.append({"t": "table", "rows": it["rows"], "head": it["head"]})
        elif st.startswith("Heading"):
            blocks.append({"t": "h", "text": it["text"]})
        elif st in ("ListBullet", "ListNumber"):
            kind = "ul" if st == "ListBullet" else "ol"
            if blocks and blocks[-1]["t"] == kind:
                blocks[-1]["items"].append(it["text"])
            else:
                blocks.append({"t": kind, "items": [it["text"]]})
        else:
            b = {"t": "p", "text": it["text"]}
            if re.match(r"(Suggested answer|Answer guide)\s*:", it["text"]):
                b["reveal"] = True            # an inline answer: hidden until the learner asks
            blocks.append(b)
    return blocks


def classify(h):
    if re.match(r"Topic \d+", h): return "topic"
    if re.fullmatch(r"Course overview", h, re.I): return "overview"
    if re.fullmatch(r"Learning objectives", h, re.I): return "objectives"
    if re.fullmatch(r"Knowledge check", h, re.I): return "check"
    if re.fullmatch(r"Glossary", h, re.I): return "glossary"
    if re.match(r"(Practical activity|Integrated )", h): return "activity"
    if re.match(r"End-of-Course Reflection", h, re.I): return "reflection"
    if re.match(r"(Facilitator|VanQuest Game Design)", h): return "teacher"
    if re.match(r"(Sources|Source Notes|Alignment|Relationship to Vanguard|How Vanguard)", h): return "sources"
    if re.match(r"(Important Learning and Safety Rule|The Core Rule)", h): return "intro"
    raise SystemExit(f"Unrecognised section heading: {h!r} — extend classify() rather than guessing")


def parse_check(items, name):
    qs, key, cur = [], {}, None
    for it in items:
        t = it.get("text", "")
        m = re.match(r"(\d+)\.\s+(.*)", t, re.S)
        if it["style"] == "Normal" and m:
            cur = {"n": int(m.group(1)), "q": m.group(2).strip(), "options": []}
            qs.append(cur)
        elif it["style"] == "ListBullet" and cur is not None and re.match(r"[A-Z]\.\s", t):
            cur["options"].append({"key": t[0], "text": t[3:].strip()})
        elif t.startswith("Answer key:"):
            key = dict(re.findall(r"(\d+)-([A-Z])", t))
        elif t.startswith("Answer:") and cur is not None:
            cur["model"] = t[len("Answer:"):].strip()
        else:
            raise SystemExit(f"{name}: unexpected knowledge-check line {t!r}")
    if all(q["options"] for q in qs):
        for q in qs:
            k = key.get(str(q["n"]))
            if not k or k not in [o["key"] for o in q["options"]]:
                raise SystemExit(f"{name}: no valid answer-key entry for question {q['n']}")
            q["answer"] = k
            del q["n"]
        return {"type": "choice", "questions": qs}
    if all("model" in q and not q["options"] for q in qs):
        for q in qs:
            del q["options"], q["n"]
        return {"type": "open", "questions": qs}
    raise SystemExit(f"{name}: mixed or incomplete knowledge check")


def parse_course(path):
    items = raw_blocks(path)
    name = path.name
    first_h1 = next(i for i, x in enumerate(items) if x["style"] == "Heading1")
    head, rest = items[:first_h1], items[first_h1:]
    title = next(x["text"] for x in head if x["style"] == "Title")
    m = re.search(r"(\d+)", name)
    course = {"id": f"core{m.group(1)}", "number": int(m.group(1)), "source": name,
              "title": re.sub(r"^Core Course \d+\n", "", title).replace("\n", " "),
              "fullTitle": title.replace("\n", " "),          # exactly as the document's title reads
              "header": to_blocks([x for x in head if x["style"] != "Title"]),
              "objectives": [], "lessons": [], "reference": [], "glossary": [], "check": None}
    # split the body into Heading-1 sections
    sections, cur = [], None
    for x in rest:
        if x["style"] == "Heading1":
            cur = {"heading": x["text"], "items": []}
            sections.append(cur)
        else:
            cur["items"].append(x)
    for sec in sections:
        kind, h, its = classify(sec["heading"]), sec["heading"], sec["items"]
        if kind == "overview":
            # Courses 3–4 keep their learning outcomes as a Heading-2 list inside the overview
            k = next((i for i, x in enumerate(its) if x["style"] == "Heading2" and re.match(r"Learning (Outcomes|objectives)", x["text"], re.I)), None)
            if k is not None:
                tail = its[k + 1:]
                course["objectives"] = [x["text"] for x in tail if x["style"] == "ListBullet"]
                its = its[:k]
            course["lessons"].append({"kind": "intro", "title": h, "blocks": to_blocks(its)})
        elif kind == "objectives":
            course["objectives"] = [x["text"] for x in its if x["style"] == "ListBullet"]
        elif kind in ("topic", "intro"):
            course["lessons"].append({"kind": kind, "title": h, "blocks": to_blocks(its)})
        elif kind == "activity":
            k = next((i for i, x in enumerate(its) if x["style"] == "Heading2" and re.search(r"answer guide", x["text"], re.I)), None)
            lesson = {"kind": "activity", "title": h, "blocks": to_blocks(its if k is None else its[:k])}
            if k is not None:
                lesson["guideTitle"] = its[k]["text"]
                lesson["guide"] = to_blocks(its[k + 1:])
            course["lessons"].append(lesson)
        elif kind == "check":
            course["check"] = parse_check(its, name)
        elif kind == "glossary":
            tbl = next(x for x in its if x["style"] == "table")
            course["glossary"] = [{"term": r[0], "def": r[1]} for r in tbl["rows"][1:]]
        else:
            course["reference"].append({"kind": kind, "title": h, "blocks": to_blocks(its)})
    for need in ("objectives", "lessons", "glossary", "check"):
        if not course[need]:
            raise SystemExit(f"{name}: missing {need}")
    return course


def main():
    files = sorted(SRC.glob("VanQuest_Core_Course_*.docx"))
    if not files:
        raise SystemExit(f"No course documents found in {SRC}")
    courses = [parse_course(f) for f in files]
    js = ("// GENERATED by tools/import_courses.py from the supplied course documents in Assets/supplied-ui/.\n"
          "// Verbatim content — do not edit by hand; edit the .docx and re-run the importer.\n"
          f"export const COURSES = {json.dumps(courses, ensure_ascii=False, indent=1)};\n")
    OUT.write_text(js, encoding="utf-8")
    for c in courses:
        print(f"{c['source']}: {c['title']!r} — {len(c['lessons'])} lessons, {len(c['objectives'])} objectives, "
              f"{len(c['check']['questions'])} {c['check']['type']} questions, {len(c['glossary'])} glossary terms, {len(c['reference'])} reference sections")


if __name__ == "__main__":
    sys.exit(main())
