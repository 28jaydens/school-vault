#!/usr/bin/env python3
"""Build the static School Vault website from the local Obsidian vault.

Usage:
    python tools/build_site.py --vault "C:/Users/28jay/Obsidian/School-Vault" --out .

Everything except .git, README.md and tools/ is regenerated in the output
folder. Requires: markdown, pyyaml.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import shutil
import sys
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import markdown
import yaml
from markdown.extensions.toc import slugify

SITE_URL = "https://28jaydens.github.io/school-vault/"
SITE_NAME = "School Vault"
SKIP_DIRS = {".obsidian", ".trash", ".git", "Excalidraw", "node_modules"}
SKIP_EXT = {".base"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"}
TODAY = dt.date.today()

CLASS_STYLE = {
    "AP Calculus BC": ("CALC", "#e0582a"),
    "AP Physics C (Mechanics, E&M)": ("PHYS", "#3b6fd6"),
    "AP Seminar": ("SEM", "#7c5cd6"),
    "AP US History": ("APUSH", "#b8862b"),
    "Honors Biology": ("BIO", "#1f9d6a"),
    "Honors Research in Chemistry": ("CHEM", "#d2457a"),
    "Honors World Literature": ("LIT", "#2b9fb3"),
    "Class of 2028 - Y1 College Meeting": ("Y1", "#6b7a90"),
    "Class Name": ("TPL", "#8a8f9c"),
}
FALLBACK_COLORS = ["#5b6ee1", "#20958c", "#d38b20", "#d45272", "#3d8bc9", "#2f9c62", "#9a6b46"]

CALLOUT_ALIASES = {
    "abstract": "summary", "tldr": "summary",
    "hint": "tip", "important": "tip",
    "caution": "warning", "attention": "warning",
    "error": "danger", "bug": "danger", "failure": "danger", "fail": "danger", "missing": "danger",
    "help": "question", "faq": "question",
    "check": "success", "done": "success",
    "cite": "quote",
}
CALLOUT_ICONS = {
    "note": '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    "summary": '<svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    "info": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    "tip": '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/></svg>',
    "success": '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
    "question": '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>',
    "warning": '<svg viewBox="0 0 24 24"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
    "danger": '<svg viewBox="0 0 24 24"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg>',
    "example": '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    "quote": '<svg viewBox="0 0 24 24"><path d="M3 21c3 0 7-1 7-8V5c0-1.3-1-2-2-2H4C3 3 2 4 2 5v6c0 1 1 2 2 2h4c0 3-2 4-5 4Z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.3-1-2-2-2h-4c-1 0-2 1-2 2v6c0 1 1 2 2 2h4c0 3-2 4-5 4Z"/></svg>',
}


# --------------------------------------------------------------------------- helpers
def esc(text: str) -> str:
    return html.escape(text, quote=True)


def url_of(rel: str) -> str:
    return quote(rel, safe="/()&',")


def rel_prefix(rel_html: str) -> str:
    depth = rel_html.count("/")
    return "../" * depth if depth else "./"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="replace")


def split_frontmatter(text: str):
    if text.startswith("---"):
        m = re.match(r"^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n?", text, re.S)
        if m:
            try:
                data = yaml.safe_load(m.group(1)) or {}
                if not isinstance(data, dict):
                    data = {}
            except yaml.YAMLError:
                data = {}
            return data, text[m.end():]
    return {}, text


def plain_text(md: str) -> str:
    t = re.sub(r"```.*?```", " ", md, flags=re.S)
    t = re.sub(r"%%.*?%%", " ", t, flags=re.S)
    t = re.sub(r"<!--.*?-->", " ", t, flags=re.S)
    t = re.sub(r"!\[\[[^\]]*\]\]", " ", t)
    t = re.sub(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", lambda m: m.group(2) or m.group(1), t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"\[!\w+\][-+]?", " ", t)
    t = re.sub(r"[#>*_`~=|\\-]+", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def display_name(folder: str) -> str:
    return re.sub(r"^\d{2}-", "", folder)


def class_style(name: str):
    if name in CLASS_STYLE:
        return CLASS_STYLE[name]
    abbr = "".join(w[0] for w in re.findall(r"[A-Za-z]+", name))[:4].upper() or "NOTE"
    color = FALLBACK_COLORS[sum(map(ord, name)) % len(FALLBACK_COLORS)]
    return abbr, color


def fmt_date(d) -> str:
    if isinstance(d, dt.datetime):
        d = d.date()
    if isinstance(d, dt.date):
        return d.strftime("%b %-d, %Y") if os.name != "nt" else d.strftime("%b %d, %Y").replace(" 0", " ")
    return str(d)


def to_date(value):
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        try:
            return dt.date.fromisoformat(value.strip()[:10])
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------- vault model
class Note:
    def __init__(self, vault: Path, path: Path):
        self.src = path
        self.rel = path.relative_to(vault).as_posix()            # 02-Classes/X/Note.md
        self.id = self.rel[:-3]                                   # 02-Classes/X/Note
        self.name = path.stem
        self.folder = PurePosixPath(self.rel).parent.as_posix()
        if self.folder == ".":
            self.folder = ""
        self.out_rel = self.id + ".html"
        self.url = url_of(self.out_rel)
        raw = read_text(path)
        self.meta, self.body = split_frontmatter(raw)
        m = re.search(r"^#\s+(.+?)\s*$", self.body, re.M)
        self.title = clean_inline(m.group(1)) if m else self.name
        self.h1_line = m.group(0) if m else None
        self.mtime = dt.datetime.fromtimestamp(path.stat().st_mtime).date()
        self.tags = normalize_tags(self.meta.get("tags"))
        for t in re.findall(r"(?<![\w/&#\[\]|(\"'=])#([A-Za-z][\w/-]*[\w])(?![\w/-]*\]\])", strip_code(self.body)):
            if t not in self.tags:
                self.tags.append(t)
        self.links: set[str] = set()      # outgoing note ids
        self.backlinks: set[str] = set()
        self.html = ""
        self.excerpt = plain_text(self.body)[:230].rstrip() + ("…" if len(plain_text(self.body)) > 230 else "")
        self.headings: list[tuple[int, str, str]] = []
        parts = self.id.split("/")
        self.top = parts[0] if len(parts) > 1 else ""
        self.class_name = parts[1] if len(parts) > 2 and parts[0] == "02-Classes" else None
        self.section = parts[2] if len(parts) > 3 and parts[0] == "02-Classes" else ("Overview" if self.class_name else None)
        self.words = len(plain_text(self.body).split())


def strip_code(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    return re.sub(r"`[^`]*`", " ", text)


def clean_inline(text: str) -> str:
    text = re.sub(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", lambda m: m.group(2) or m.group(1), text)
    text = re.sub(r"[*_`]+", "", text)
    return text.strip()


def normalize_tags(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        value = re.split(r"[,\s]+", value)
    out = []
    for v in value:
        if v is None:
            continue
        v = str(v).strip().lstrip("#")
        if v and v not in out:
            out.append(v)
    return out


class Vault:
    def __init__(self, root: Path):
        self.root = root
        self.notes: dict[str, Note] = {}
        self.by_name: dict[str, list[Note]] = {}
        self.files: dict[str, Path] = {}          # rel path -> abs (non-md assets)
        self.files_by_name: dict[str, list[str]] = {}
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
            for fn in sorted(filenames):
                p = Path(dirpath) / fn
                rel = p.relative_to(root).as_posix()
                if p.suffix.lower() == ".md":
                    n = Note(root, p)
                    self.notes[n.id] = n
                    self.by_name.setdefault(n.name.lower(), []).append(n)
                elif p.suffix.lower() not in SKIP_EXT and not fn.startswith("."):
                    self.files[rel] = p
                    self.files_by_name.setdefault(fn.lower(), []).append(rel)
        # Excalidraw drawings: not rendered, but their text labels are shown where they are embedded
        self.drawings: dict[str, dict] = {}
        ex = root / "Excalidraw"
        if ex.is_dir():
            for p in sorted(ex.glob("*.md")):
                txt = read_text(p)
                m = re.search(r"## Text Elements\r?\n(.*?)(?:\r?\n## |\r?\n%%|\Z)", txt, re.S)
                items: list[str] = []
                if m:
                    for chunk in re.split(r"\s*\^\w+\s*(?:\r?\n|$)", m.group(1)):
                        chunk = " ".join(l.strip() for l in chunk.strip().splitlines() if l.strip())
                        if chunk:
                            items.append(chunk)
                self.drawings[p.stem.lower()] = {"title": p.stem, "items": items}

    # ----- resolution
    def resolve_note(self, target: str, from_note: Note | None) -> Note | None:
        t = target.strip().replace("\\", "/")
        if t.lower().endswith(".md"):
            t = t[:-3]
        if not t:
            return from_note
        if t in self.notes:
            return self.notes[t]
        # path relative to vault root without extension, or relative to note folder
        if from_note and from_note.folder:
            cand = PurePosixPath(from_note.folder, t).as_posix()
            if cand in self.notes:
                return self.notes[cand]
        name = t.split("/")[-1].lower()
        cands = self.by_name.get(name, [])
        if not cands:
            return None
        if len(cands) == 1:
            return cands[0]
        if from_note:
            same_folder = [c for c in cands if c.folder == from_note.folder]
            if same_folder:
                return same_folder[0]
            if from_note.class_name:
                same_class = [c for c in cands if c.class_name == from_note.class_name]
                if same_class:
                    return same_class[0]
        # prefer a candidate whose full id ends with the given path
        for c in cands:
            if c.id.lower().endswith(t.lower()):
                return c
        return cands[0]

    def resolve_file(self, target: str, from_note: Note | None) -> str | None:
        t = target.strip().replace("\\", "/")
        if t in self.files:
            return t
        if from_note and from_note.folder:
            cand = PurePosixPath(from_note.folder, t).as_posix()
            if cand in self.files:
                return cand
        name = t.split("/")[-1].lower()
        cands = self.files_by_name.get(name, [])
        if not cands:
            return None
        if from_note:
            for c in cands:
                if c.startswith(from_note.folder + "/") or (from_note.class_name and f"/{from_note.class_name}/" in "/" + c):
                    return c
        return cands[0]


# --------------------------------------------------------------------------- markdown rendering
MD_EXTENSIONS = ["tables", "fenced_code", "sane_lists", "footnotes", "md_in_html", "attr_list"]


class Renderer:
    def __init__(self, vault: Vault):
        self.vault = vault

    def render(self, note: Note) -> str:
        body = note.body
        if note.h1_line:
            body = body.replace(note.h1_line, "", 1)
        body = re.sub(r"%%.*?%%", "", body, flags=re.S)
        body = re.sub(r"<!--\s*lockin:[^>]*-->", "", body)
        math_store: list[str] = []

        def stash_math(m):
            math_store.append(m.group(0))
            return f"\x00MATH{len(math_store) - 1}\x00"

        body = re.sub(r"\$\$.+?\$\$", stash_math, body, flags=re.S)
        body = re.sub(r"(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\w)", stash_math, body)

        body = self.convert_blocks(body, note)
        body = self.convert_inline(body, note)
        md = markdown.Markdown(extensions=MD_EXTENSIONS, extension_configs={"footnotes": {"PLACE_MARKER": "///Footnotes///"}})
        out = md.convert(body)
        out = self.postprocess(out, note)
        for i, chunk in enumerate(math_store):
            out = out.replace(f"\x00MATH{i}\x00", esc(chunk).replace("&#x27;", "'"))
        return out

    # ----- block level: callouts, code fences, dataview
    def convert_blocks(self, text: str, note: Note) -> str:
        lines = text.split("\n")
        out: list[str] = []
        i = 0
        in_fence = None
        while i < len(lines):
            line = lines[i]
            fence = re.match(r"^(\s*)(```+|~~~+)\s*([\w+-]*)", line)
            if in_fence is None and fence:
                lang = fence.group(3).lower()
                # collect fence
                j = i + 1
                while j < len(lines) and not re.match(r"^\s*" + re.escape(fence.group(2)) + r"\s*$", lines[j]):
                    j += 1
                block = lines[i + 1:j]
                if lang in ("dataview", "dataviewjs"):
                    out.append(self.dataview_block(note, lang, "\n".join(block)))
                elif lang == "mermaid":
                    out.append('\n<pre class="mermaid">' + esc("\n".join(block)) + "</pre>\n")
                else:
                    out.extend(lines[i:j + 1])
                i = j + 1
                continue
            m = re.match(r"^>\s?\[!([\w-]+)\]([-+]?)\s*(.*)$", line)
            if m:
                j = i + 1
                while j < len(lines) and (lines[j].startswith(">") or (lines[j].strip() == "" and j + 1 < len(lines) and lines[j + 1].startswith(">") and False)):
                    j += 1
                inner = [re.sub(r"^>\s?", "", l) for l in lines[i + 1:j]]
                out.append(self.callout(m.group(1), m.group(2), m.group(3), "\n".join(inner), note))
                i = j
                continue
            out.append(line)
            i += 1
        return "\n".join(out)

    def callout(self, kind: str, fold: str, title: str, inner: str, note: Note) -> str:
        kind = kind.lower()
        base = CALLOUT_ALIASES.get(kind, kind)
        if base not in CALLOUT_ICONS:
            base = "note"
        title_html = self.inline_html(title or kind.capitalize(), note)
        inner_md = self.convert_blocks(inner, note)
        inner_md = self.convert_inline(inner_md, note)
        inner_html = markdown.markdown(inner_md, extensions=MD_EXTENSIONS) if inner.strip() else ""
        inner_html = self.postprocess(inner_html, note)
        icon = CALLOUT_ICONS[base]
        if fold:
            open_attr = " open" if fold == "+" else ""
            return (f'\n<details class="callout" data-callout="{base}" data-kind="{esc(kind)}"{open_attr}>'
                    f'<summary class="callout-title"><span class="callout-icon">{icon}</span><span>{title_html}</span>'
                    f'<span class="callout-fold" aria-hidden="true"></span></summary>'
                    f'<div class="callout-content">{inner_html}</div></details>\n')
        return (f'\n<div class="callout" data-callout="{base}" data-kind="{esc(kind)}">'
                f'<div class="callout-title"><span class="callout-icon">{icon}</span><span>{title_html}</span></div>'
                f'<div class="callout-content">{inner_html}</div></div>\n')

    def inline_html(self, text: str, note: Note) -> str:
        text = self.convert_inline(text, note)
        h = markdown.markdown(text, extensions=["attr_list"])
        return re.sub(r"^<p>(.*)</p>$", r"\1", h.strip(), flags=re.S)

    def dataview_block(self, note: Note, lang: str, code: str) -> str:
        if note.meta.get("timeline_auto"):
            return self.auto_timeline(note)
        return ('\n<div class="dynamic-block"><strong>Dynamic Obsidian query</strong>'
                f'<span>This section is generated by the {esc(lang)} plugin inside Obsidian and is not rendered on the website.</span></div>\n')

    def auto_timeline(self, note: Note) -> str:
        folder = note.folder
        units = note.meta.get("units") or []
        events = []
        for other in self.vault.notes.values():
            if not other.folder.startswith(folder) or not other.meta.get("timeline"):
                continue
            unit = other.meta.get("unit") or 0
            for item in other.meta.get("timeline") or []:
                if not isinstance(item, dict):
                    continue
                date = str(item.get("date", ""))
                m = re.search(r"\d{3,4}", date)
                sort = item.get("sort", m.group(0) if m else 0)
                try:
                    sort = float(sort)
                except (TypeError, ValueError):
                    sort = 0.0
                events.append({"sort": sort, "date": date, "event": str(item.get("event", "")),
                               "theme": str(item.get("theme", "")), "unit": int(unit) if str(unit).isdigit() else 0,
                               "source": other})
        events.sort(key=lambda e: (e["sort"], e["event"]))
        opts = '<option value="0">All units</option>' + "".join(f'<option value="{u}">Unit {u}</option>' for u in units)
        rows = []
        for e in events:
            href = rel_href(note, e["source"])
            search = esc(f'{e["date"]} {e["event"]} {e["theme"]} unit {e["unit"]}'.lower())
            rows.append(f'<article class="timeline-event" data-timeline-unit="{e["unit"]}" data-timeline-search="{search}">'
                        f'<span class="timeline-dot" aria-hidden="true"></span><div class="timeline-event-main"><time>{esc(e["date"])}</time>'
                        f'<strong>{esc(e["event"])}</strong></div><div class="timeline-meta"><span>{esc(e["theme"])} · Unit {e["unit"]}</span>'
                        f'<a href="{href}">{esc(e["source"].title)}</a></div></article>')
        return (f'\n<section class="auto-timeline" data-timeline-count="{len(events)}"><div class="timeline-controls">'
                f'<input type="search" data-timeline-search-input placeholder="Search {len(events)} events…" aria-label="Search timeline events">'
                f'<select data-timeline-unit-filter aria-label="Filter timeline by unit">{opts}</select></div>'
                f'<div class="timeline-events">{"".join(rows)}</div></section>\n')

    # ----- inline level: wikilinks, embeds, highlights, tags
    def convert_inline(self, text: str, note: Note) -> str:
        # protect inline code and fenced code
        store: list[str] = []

        def stash(m):
            store.append(m.group(0))
            return f"\x00CODE{len(store) - 1}\x00"

        text = re.sub(r"```.*?```", stash, text, flags=re.S)
        text = re.sub(r"`[^`\n]+`", stash, text)

        # tags first, so the regex never sees hrefs produced by the link conversions below
        text = re.sub(r"(?<![\w/&#\x00\[\]|(\"'=])#([A-Za-z][\w/-]*[\w])(?![\w/-]*\]\])", lambda m: f'<span class="tag">#{esc(m.group(1))}</span>', text)
        text = re.sub(r"!\[\[([^\]]+)\]\]", lambda m: self.embed(m.group(1), note), text)
        text = re.sub(r"\[\[([^\]]+)\]\]", lambda m: self.wikilink(m.group(1), note), text)
        text = re.sub(r"==([^=\n]+)==", r"<mark>\1</mark>", text)
        text = re.sub(r"^(\s*[-*+]\s+)\[( |x|X|/|-)\]\s+", lambda m: m.group(1) + (
            '<input type="checkbox" disabled checked> ' if m.group(2).lower() in "x/-" and m.group(2) != " " else '<input type="checkbox" disabled> '), text, flags=re.M)
        for i, chunk in enumerate(store):
            text = text.replace(f"\x00CODE{i}\x00", chunk)
        return text

    def wikilink(self, raw: str, note: Note) -> str:
        raw = raw.replace("\|", "|")
        target, _, alias = raw.partition("|")
        page, _, anchor = target.partition("#")
        page = page.strip()
        if alias:
            label = alias.strip()
        elif page:
            label = page.split("/")[-1] + (f" › {anchor.lstrip('^')}" if anchor else "")
        else:
            label = anchor.lstrip("^")
        if not alias and page and page.endswith((".canvas", ".pdf", ".png", ".jpg", ".jpeg")):
            label = page.split("/")[-1]
        if page.lower().endswith((".canvas", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
            f = self.vault.resolve_file(page, note)
            if f:
                note.assets_used.add(f) if hasattr(note, "assets_used") else None
                kind = "canvas" if f.endswith(".canvas") else "file"
                return f'<a class="attachment {kind}" href="{rel_href_path(note, f)}" target="_blank" rel="noopener">{esc(label)}</a>'
            return f'<span class="broken-link" title="Not published">{esc(label)}</span>'
        target_note = self.vault.resolve_note(page, note) if page else note
        if not target_note:
            if page.split("/")[-1].lower() in self.vault.drawings:
                return f'<span class="drawing-link" title="Excalidraw drawing, open in Obsidian">{esc(label)}</span>'
            return f'<span class="broken-link" title="No note called {esc(page)}">{esc(label)}</span>'
        if target_note is not note:
            note.links.add(target_note.id)
        href = rel_href(note, target_note) if target_note is not note else ""
        if anchor:
            a = anchor.lstrip("^")
            href += "#" + (slugify(a, "-") if not anchor.startswith("^") else "block-" + slugify(a, "-"))
        return f'<a class="wikilink" href="{href}">{esc(label)}</a>'

    def embed(self, raw: str, note: Note) -> str:
        raw = raw.replace("\|", "|")
        target, _, extra = raw.partition("|")
        page, _, anchor = target.partition("#")
        page = page.strip()
        ext = Path(page).suffix.lower()
        if ext in IMAGE_EXT:
            f = self.vault.resolve_file(page, note)
            if not f:
                return f'<span class="broken-link">Missing image: {esc(page)}</span>'
            width = ""
            m = re.match(r"^\s*(\d+)(?:x(\d+))?\s*$", extra or "")
            alt = extra if extra and not m else Path(f).stem.replace("-", " ")
            if m:
                width = f' width="{m.group(1)}"'
            href = rel_href_path(note, f)
            return (f'<figure class="note-media"><a href="{href}" target="_blank" rel="noopener"><img src="{href}" alt="{esc(alt)}"{width} loading="lazy"></a>'
                    f'<figcaption>{esc(alt)}</figcaption></figure>')
        if ext in (".pdf", ".canvas", ".mp3", ".mp4", ".m4a", ".wav"):
            f = self.vault.resolve_file(page, note)
            if f:
                if ext == ".pdf":
                    return f'<div class="pdf-embed"><iframe src="{rel_href_path(note, f)}" title="{esc(page)}" loading="lazy"></iframe><a href="{rel_href_path(note, f)}" target="_blank" rel="noopener">Open {esc(Path(f).name)}</a></div>'
                return f'<p><a class="attachment" href="{rel_href_path(note, f)}" target="_blank" rel="noopener">{esc(Path(f).name)}</a></p>'
            return f'<span class="broken-link">Missing file: {esc(page)}</span>'
        # note embed → link card with excerpt
        tn = self.vault.resolve_note(page, note)
        if not tn:
            d = self.vault.drawings.get(page.split("/")[-1].lower())
            if d:
                items = "".join(f"<li>{esc(t)}</li>" for t in d["items"][:40])
                return (f'<div class="drawing-card"><div class="drawing-head"><span class="eyebrow">Excalidraw drawing</span>'
                        f'<strong>{esc(d["title"])}</strong><span>The sketch itself only renders inside Obsidian. These are its labels:</span></div>'
                        f'<ul class="drawing-labels">{items}</ul></div>')
            return f'<span class="broken-link">Missing note: {esc(page)}</span>'
        note.links.add(tn.id)
        href = rel_href(note, tn) + (("#" + slugify(anchor.lstrip("^"), "-")) if anchor else "")
        return (f'<a class="embed-card" href="{href}"><span class="embed-kicker">Embedded note</span><strong>{esc(tn.title)}</strong>'
                f'<span>{esc(tn.excerpt[:160])}</span></a>')

    # ----- post
    def postprocess(self, out: str, note: Note) -> str:
        out = re.sub(r'<li>(\s*)<input type="checkbox" disabled( checked)?>', lambda m: f'<li class="task{" done" if m.group(2) else ""}">{m.group(1)}<input type="checkbox" disabled{m.group(2) or ""}>', out)
        out = re.sub(r'<pre><code class="language-mermaid">(.*?)</code></pre>', r'<pre class="mermaid">\1</pre>', out, flags=re.S)
        out = re.sub(r"<table>", '<div class="table-wrap"><table>', out)
        out = out.replace("</table>", "</table></div>")
        out = re.sub(r'<a href="(https?://[^"]+)"', r'<a href="\1" target="_blank" rel="noopener"', out)
        # heading ids
        def heading(m):
            level, attrs, inner = m.group(1), m.group(2), m.group(3)
            text = re.sub(r"<[^>]+>", "", inner)
            slug = slugify(html.unescape(text), "-") or f"h-{len(note.headings)}"
            seen = {h[2] for h in note.headings}
            base, k = slug, 2
            while slug in seen:
                slug = f"{base}-{k}"
                k += 1
            note.headings.append((int(level), html.unescape(text), slug))
            return f'<h{level} id="{slug}"{attrs}>{inner}<a class="anchor" href="#{slug}" aria-label="Link to section">#</a></h{level}>'
        note.headings = []
        out = re.sub(r"<h([1-6])([^>]*)>(.*?)</h\1>", heading, out, flags=re.S)
        return out


def rel_href(from_note: Note, to_note: Note) -> str:
    return rel_prefix(from_note.out_rel) + to_note.url


def rel_href_path(from_note: Note, rel_file: str) -> str:
    return rel_prefix(from_note.out_rel) + url_of(rel_file)


# --------------------------------------------------------------------------- site assembly
class Site:
    def __init__(self, vault: Vault, out: Path):
        self.vault = vault
        self.out = out
        self.renderer = Renderer(vault)
        self.classes = self.collect_classes()
        self.nav_html_cache: dict[str, str] = {}

    # ----- data
    def collect_classes(self):
        classes = {}
        for n in self.vault.notes.values():
            if not n.class_name:
                continue
            c = classes.setdefault(n.class_name, {"name": n.class_name, "notes": [], "home": None})
            c["notes"].append(n)
        for c in classes.values():
            name = c["name"]
            abbr, color = class_style(name)
            c["abbr"], c["color"] = abbr, color
            c["slug"] = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            homes = [n for n in c["notes"] if n.name == f"{name} - Home"] or [n for n in c["notes"] if n.name == "_Home"]
            c["home"] = homes[0] if homes else sorted(c["notes"], key=lambda n: n.title)[0]
            c["count"] = len(c["notes"])
            c["latest"] = max(c["notes"], key=lambda n: n.mtime)
        return dict(sorted(classes.items(), key=lambda kv: kv[0]))

    def class_of(self, note: Note):
        return self.classes.get(note.class_name) if note.class_name else None

    # ----- rendering all notes
    def build(self):
        self.clean_output()
        for n in self.vault.notes.values():
            n.assets_used = set()
            n.html = self.renderer.render(n)
        for n in self.vault.notes.values():
            for t in n.links:
                self.vault.notes[t].backlinks.add(n.id)
        self.copy_assets()
        for n in self.vault.notes.values():
            self.write(n.out_rel, self.note_page(n))
        self.write("index.html", self.home_page())
        self.write("graph.html", self.graph_page())
        self.write("tags.html", self.tags_page())
        self.write_json("search-index.json", self.search_index())
        self.write_graphs()
        self.write("sitemap.xml", self.sitemap())
        self.write("robots.txt", f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.xml\n")
        self.write(".nojekyll", "")
        here = Path(__file__).parent
        for asset in ("site.css", "site.js", "graph.js"):
            shutil.copy(here / asset, self.out / asset)
        print(f"Built {len(self.vault.notes)} notes into {self.out}")

    def clean_output(self):
        keep = {".git", "README.md", "tools", "CNAME"}
        for child in self.out.iterdir():
            if child.name in keep:
                continue
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()

    def copy_assets(self):
        for rel, src in self.vault.files.items():
            if rel.startswith("Templates/"):
                continue
            dest = self.out / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)

    def write(self, rel: str, content: str):
        p = self.out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8", newline="\n")

    def write_json(self, rel: str, data):
        self.write(rel, json.dumps(data, ensure_ascii=False, separators=(",", ":")))

    # ----- shared chrome
    def shell(self, *, title: str, description: str, root: str, body_class: str, main: str, active_id: str | None,
              extra_head: str = "", breadcrumbs: str = "", aside: str = "") -> str:
        nav = self.nav_html(root, active_id)
        count = len(self.vault.notes)
        theme_script = ("<script>(function(){try{var t=localStorage.getItem('school-vault-theme');"
                        "if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}"
                        "document.documentElement.dataset.theme=t}catch(e){}})();</script>")
        return f"""<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} · {SITE_NAME}</title>
<meta name="description" content="{esc(description[:300])}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description[:200])}">
<meta property="og:site_name" content="{SITE_NAME}">
<link rel="icon" href="{root}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="{root}site.css">
{theme_script}{extra_head}
</head>
<body class="{body_class}">
<a class="skip-link" href="#content">Skip to content</a>
<div class="app-shell">
  <aside class="sidebar" id="sidebar" aria-label="Vault navigation">
    <div class="sidebar-top">
      <a class="brand" href="{root}index.html"><span class="brand-mark">SV</span><span><strong>{SITE_NAME}</strong><small>{count} notes · updated {fmt_date(TODAY)}</small></span></a>
      <button class="search-trigger" type="button" data-open-search><span class="search-trigger-icon">⌕</span><span>Search notes</span><kbd>Ctrl K</kbd></button>
    </div>
    <nav class="vault-nav">
      <a class="nav-top{' active' if active_id == '__home' else ''}" href="{root}index.html"><span class="nav-ico">⌂</span>Dashboard</a>
      <a class="nav-top{' active' if active_id == '__graph' else ''}" href="{root}graph.html"><span class="nav-ico">◎</span>Vault graph</a>
      <a class="nav-top{' active' if active_id == '__tags' else ''}" href="{root}tags.html"><span class="nav-ico">#</span>Tags</a>
      {nav}
    </nav>
    <div class="sidebar-footer">
      <span>Built from Obsidian</span>
      <button class="icon-button" type="button" data-theme-toggle aria-label="Toggle dark mode" title="Toggle theme"><span class="theme-ico"></span></button>
    </div>
  </aside>
  <div class="page-area">
    <header class="mobile-header"><button class="icon-button" type="button" data-menu-toggle aria-label="Open menu" aria-expanded="false">☰</button><a href="{root}index.html">{SITE_NAME}</a><button class="icon-button" type="button" data-open-search aria-label="Search">⌕</button></header>
    <main class="main-content" id="content">
      {breadcrumbs}
      <div class="content-grid{' has-aside' if aside else ''}">
        <div class="content-main">{main}</div>
        {aside}
      </div>
      <footer class="page-footer"><span>{SITE_NAME} · a public web edition of my Obsidian notes</span><span>Built {fmt_date(TODAY)}</span></footer>
    </main>
  </div>
</div>
<div class="scrim" data-menu-toggle></div>
<dialog class="search-dialog" id="search-dialog">
  <form method="dialog" class="search-box" onsubmit="return false">
    <div class="search-input-row"><span>⌕</span><input id="search-input" type="search" placeholder="Search all {count} notes…" autocomplete="off"><button value="close" aria-label="Close">Esc</button></div>
    <div id="search-results" class="search-results"><p class="search-help">Type a title, topic, class, or keyword. Use ↑ ↓ and Enter.</p></div>
  </form>
</dialog>
<script>window.SITE_ROOT="{root}";</script>
<script src="{root}site.js"></script>
<script src="{root}graph.js"></script>
<script>window.MathJax={{tex:{{inlineMath:[['$','$'],['\\\\(','\\\\)']]}},options:{{skipHtmlTags:['script','noscript','style','textarea','pre','code']}}}};</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js"></script>
<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";const dark=document.documentElement.dataset.theme==='dark';mermaid.initialize({{startOnLoad:true,theme:dark?'dark':'neutral',securityLevel:'loose',fontFamily:'Inter, system-ui, sans-serif'}});</script>
</body>
</html>
"""

    def nav_html(self, root: str, active_id: str | None) -> str:
        tree = {}
        for n in self.vault.notes.values():
            if n.folder.startswith("Templates"):
                continue
            parts = n.folder.split("/") if n.folder else []
            node = tree
            for p in parts:
                node = node.setdefault("__dirs", {}).setdefault(p, {})
            node.setdefault("__notes", []).append(n)
        active = self.vault.notes.get(active_id) if active_id else None
        active_parts = active.folder.split("/") if active and active.folder else []

        def sort_key(n: Note):
            name = n.name
            rank = 0 if name.endswith(" - Home") or name == "_Home" else 1 if name == "_Index" or name.endswith(("- Lecture Notes", "- Assignments", "- Readings", "- Exams & Reviews", "- Syllabus")) else 2
            return (rank, n.title.lower())

        def render(node, depth, path_parts):
            html_parts = []
            for n in sorted(node.get("__notes", []), key=sort_key):
                cls = "nav-note" + (" active" if active and n.id == active.id else "")
                html_parts.append(f'<a class="{cls}" href="{root}{n.url}">{esc(n.title)}</a>')
            for name, child in sorted(node.get("__dirs", {}).items()):
                parts = path_parts + [name]
                is_open = active_parts[:len(parts)] == parts
                is_class = depth == 1 and path_parts == ["02-Classes"]
                label = esc(display_name(name))
                dot = ""
                if is_class and name in self.classes:
                    c = self.classes[name]
                    dot = f'<span class="nav-dot" style="--c:{c["color"]}"></span>'
                html_parts.append(f'<details class="nav-group depth-{depth}"{" open" if is_open or depth == 0 else ""}><summary>{dot}{label}</summary><div class="nav-children">{render(child, depth + 1, parts)}</div></details>')
            return "".join(html_parts)

        return render(tree, 0, [])

    def crumbs(self, note: Note, root: str) -> str:
        parts = note.id.split("/")[:-1]
        items = [f'<a href="{root}index.html">Home</a>']
        acc = []
        for p in parts:
            acc.append(p)
            folder = "/".join(acc)
            index = self.folder_index(folder)
            label = esc(display_name(p))
            items.append(f'<a href="{root}{index.url}">{label}</a>' if index else f"<span>{label}</span>")
        items.append(f"<span class='current'>{esc(note.title)}</span>")
        return '<nav class="breadcrumbs" aria-label="Breadcrumb">' + '<span class="sep">/</span>'.join(items) + "</nav>"

    def folder_index(self, folder: str) -> Note | None:
        notes = [n for n in self.vault.notes.values() if n.folder == folder]
        for pref in ("_Home", "_Index"):
            for n in notes:
                if n.name == pref:
                    return n
        for n in notes:
            if n.name.endswith(" - Home"):
                return n
        for n in notes:
            if n.name == display_name(folder.split("/")[-1]) or n.name.endswith(("- Lecture Notes", "- Assignments", "- Readings", "- Exams & Reviews")):
                return n
        return None

    # ----- note page
    def note_page(self, n: Note) -> str:
        root = rel_prefix(n.out_rel)
        c = self.class_of(n)
        chips = []
        if c:
            chips.append(f'<a class="chip class-chip" style="--c:{c["color"]}" href="{root}{c["home"].url}"><span class="chip-dot"></span>{esc(c["name"])}</a>')
        for key in ("unit", "topic", "assessment", "status", "period"):
            v = n.meta.get(key)
            if v and isinstance(v, (str, int, float)):
                chips.append(f'<span class="chip muted-chip"><small>{key}</small>{esc(str(v))}</span>')
        d = to_date(n.meta.get("date"))
        if d:
            chips.append(f'<span class="chip muted-chip"><small>date</small>{fmt_date(d)}</span>')
        tag_chips = "".join(f'<a class="tag" href="{root}tags.html#tag-{esc(slugify(t, "-"))}">#{esc(t)}</a>' for t in n.tags)
        minutes = max(1, round(n.words / 200))
        meta_line = f'<div class="note-meta"><span>Updated {fmt_date(n.mtime)}</span><span>·</span><span>{n.words:,} words · {minutes} min read</span></div>'
        toc = self.toc_html(n)
        backlinks = sorted((self.vault.notes[b] for b in n.backlinks), key=lambda x: x.title.lower())
        bl_html = ""
        if backlinks:
            items = "".join(f'<li><a href="{rel_href(n, b)}"><strong>{esc(b.title)}</strong><span>{esc(b.folder.split("/")[-1] if b.folder else "Vault")}</span></a></li>' for b in backlinks)
            bl_html = f'<section class="backlinks"><h2>Linked from</h2><ul class="backlink-list">{items}</ul></section>'
        siblings = sorted((s for s in self.vault.notes.values() if s.folder == n.folder and s.id != n.id), key=lambda s: s.title.lower())
        prev_next = ""
        if siblings:
            ordered = sorted(siblings + [n], key=lambda s: s.title.lower())
            i = ordered.index(n)
            prev_html = f'<a class="pager-link prev" href="{rel_href(n, ordered[i-1])}"><small>Previous</small><span>{esc(ordered[i-1].title)}</span></a>' if i > 0 else '<span></span>'
            next_html = f'<a class="pager-link next" href="{rel_href(n, ordered[i+1])}"><small>Next</small><span>{esc(ordered[i+1].title)}</span></a>' if i < len(ordered) - 1 else '<span></span>'
            prev_next = f'<nav class="pager" aria-label="Notes in this folder">{prev_html}{next_html}</nav>'
        graph_url = f"{root}graphs/{c['slug']}.json" if c else f"{root}graphs/global-vault.json"
        graph = f"""<section class="graph-section">
  <div class="graph-heading"><div><span class="eyebrow">Connections</span><h2>Local graph</h2><p>Notes directly connected to this page. Drag, zoom, or click a node to open it.</p></div>
  <div class="graph-actions"><div class="graph-controls"><button type="button" data-graph-zoom="out" aria-label="Zoom out">−</button><button type="button" data-graph-reset>Reset</button><button type="button" data-graph-zoom="in" aria-label="Zoom in">+</button></div></div></div>
  <div class="knowledge-graph" data-graph-url="{graph_url}" data-focus="{esc(n.id)}" data-mode="local"><div class="graph-loading">Building graph…</div></div>
  <div class="graph-legend" aria-label="Graph legend"></div>
</section>"""
        eyebrow = esc(display_name(n.folder.split("/")[-1])) if n.folder else "Vault"
        main = f"""<article class="note">
  <header class="note-header">
    <div class="note-topline"><span class="eyebrow">{eyebrow}</span><div class="chips">{''.join(chips)}</div></div>
    <h1 class="note-title">{esc(n.title)}</h1>
    {meta_line}
    {f'<div class="tag-row">{tag_chips}</div>' if tag_chips else ''}
  </header>
  <div class="note-body">{n.html}</div>
</article>
{prev_next}
{bl_html}
{graph}"""
        aside = f'<aside class="toc" aria-label="On this page"><div class="toc-inner"><span class="toc-title">On this page</span>{toc}</div></aside>' if toc else ""
        return self.shell(title=n.title, description=n.excerpt, root=root, body_class="note-page", main=main, active_id=n.id,
                          breadcrumbs=self.crumbs(n, root), aside=aside)

    def toc_html(self, n: Note) -> str:
        hs = [h for h in n.headings if 2 <= h[0] <= 3]
        if len(hs) < 3:
            return ""
        items = "".join(f'<li class="lvl-{lvl}"><a href="#{slug}">{esc(text)}</a></li>' for lvl, text, slug in hs)
        return f"<ol class='toc-list'>{items}</ol>"

    # ----- home
    def home_page(self) -> str:
        root = "./"
        notes = list(self.vault.notes.values())
        cards = []
        for c in self.classes.values():
            if c["name"] == "Class Name":
                continue
            lectures = sum(1 for n in c["notes"] if n.section == "Lecture Notes")
            reviews = sum(1 for n in c["notes"] if n.section == "Exams & Reviews")
            cards.append(f"""<a class="course-card" style="--c:{c['color']}" href="{root}{c['home'].url}">
  <span class="course-abbr">{esc(c['abbr'])}</span>
  <strong>{esc(c['name'])}</strong>
  <span class="course-stats">{c['count']} notes · {lectures} lecture · {reviews} review</span>
  <span class="course-latest">Latest: {esc(c['latest'].title)}</span>
</a>""")
        upcoming = []
        for n in notes:
            d = to_date(n.meta.get("date"))
            if d and n.meta.get("assessment") and d >= TODAY:
                upcoming.append((d, n))
        upcoming.sort(key=lambda t: (t[0], t[1].title))
        up_html = "".join(
            f'<li><time datetime="{d.isoformat()}"><strong>{d.strftime("%d")}</strong><span>{d.strftime("%b")}</span></time>'
            f'<div><a href="{root}{n.url}">{esc(n.title)}</a><span>{esc(n.class_name or "")} · {esc(str(n.meta.get("assessment")))}{" · today" if d == TODAY else f" · in {(d - TODAY).days} days"}</span></div></li>'
            for d, n in upcoming[:8]) or '<li class="empty">No upcoming assessments with a date.</li>'
        recent = sorted((n for n in notes if not n.folder.startswith("Templates")), key=lambda n: (n.mtime, n.title), reverse=True)[:10]
        rec_html = "".join(
            f'<li><a href="{root}{n.url}"><strong>{esc(n.title)}</strong><span>{esc(n.class_name or display_name(n.top) or "Vault")}</span></a><time>{fmt_date(n.mtime)}</time></li>'
            for n in recent)
        hubs = [n for n in notes if "type/hub" in n.tags or n.name.endswith("Hub")]
        hub_html = "".join(f'<a class="pill" href="{root}{n.url}">{esc(n.title)}</a>' for n in sorted(hubs, key=lambda n: n.title))
        words = sum(n.words for n in notes)
        links = sum(len(n.links) for n in notes)
        home_note = self.vault.notes.get("00-Home")
        setup_note = self.vault.notes.get("Setup")
        main = f"""<section class="hero">
  <div class="hero-text">
    <span class="eyebrow">Student knowledge base</span>
    <h1>Notes that<br>connect.</h1>
    <p>A public web edition of my Obsidian school vault: lecture notes, lab write-ups, review hubs and timelines for every class, cross-linked and searchable.</p>
    <div class="hero-actions">
      <button class="btn primary" type="button" data-open-search>Search the vault <kbd>Ctrl K</kbd></button>
      <a class="btn" href="{root}graph.html">Explore the graph</a>
      {f'<a class="btn ghost" href="{root}{home_note.url}">Vault home note</a>' if home_note else ''}
    </div>
  </div>
  <dl class="hero-stats">
    <div><dt>Notes</dt><dd>{len(notes)}</dd></div>
    <div><dt>Classes</dt><dd>{sum(1 for c in self.classes if c != 'Class Name')}</dd></div>
    <div><dt>Links</dt><dd>{links:,}</dd></div>
    <div><dt>Words</dt><dd>{words/1000:.0f}k</dd></div>
  </dl>
</section>
<section class="home-section">
  <div class="section-heading"><h2>Classes</h2><span class="muted">Open a class home</span></div>
  <div class="course-grid">{''.join(cards)}</div>
</section>
<div class="home-columns">
  <section class="home-section">
    <div class="section-heading"><h2>Upcoming</h2><span class="muted">From review notes with a date</span></div>
    <ul class="upcoming-list">{up_html}</ul>
  </section>
  <section class="home-section">
    <div class="section-heading"><h2>Recently updated</h2></div>
    <ul class="recent-list">{rec_html}</ul>
  </section>
</div>
<section class="home-section">
  <div class="section-heading"><h2>Unit hubs</h2><span class="muted">Start pages for each unit</span></div>
  <div class="pill-row">{hub_html or '<span class="muted">No hubs yet.</span>'}</div>
</section>
<section class="home-section about">
  <div class="section-heading"><h2>About this site</h2></div>
  <p>Every page here is generated from a Markdown note in Obsidian. Wikilinks become real links, callouts keep their colours, Mermaid diagrams and LaTeX render in the browser, and each note ends with the notes that link to it and a local graph. {f'<a href="{root}{setup_note.url}">How the vault is organised →</a>' if setup_note else ''}</p>
</section>"""
        return self.shell(title="Dashboard", description="A public, searchable web edition of my Obsidian school vault.", root=root,
                          body_class="home-page", main=main, active_id="__home")

    def graph_page(self) -> str:
        root = "./"
        main = f"""<section class="graph-section global-graph-section">
  <div class="graph-heading"><div><span class="eyebrow">Connections</span><h1>School Vault graph</h1><p>Explore all {len(self.vault.notes)} notes across every subject. Drag nodes, pan, zoom, search, or select a note to open it.</p></div>
  <div class="graph-actions"><label class="graph-search"><span>Find a note</span><input type="search" data-graph-search placeholder="Search nodes…" autocomplete="off"></label><div class="graph-controls"><button type="button" data-graph-zoom="out" aria-label="Zoom out">−</button><button type="button" data-graph-reset>Reset</button><button type="button" data-graph-zoom="in" aria-label="Zoom in">+</button></div></div></div>
  <div class="knowledge-graph" data-graph-url="graphs/global-vault.json" data-focus="00-Home" data-mode="global"><div class="graph-loading">Building graph…</div></div>
  <div class="graph-legend" aria-label="Graph legend"></div>
</section>"""
        page = self.shell(title="Vault graph", description="Interactive graph of every note in the vault.", root=root,
                          body_class="graph-home", main=main, active_id="__graph")
        return page.replace('<main class="main-content" id="content">',
                            '<button class="graph-menu-button" type="button" data-menu-toggle aria-label="Open vault menu" aria-expanded="false">☰</button><main class="main-content" id="content">')

    def tags_page(self) -> str:
        root = "./"
        tags: dict[str, list[Note]] = {}
        for n in self.vault.notes.values():
            for t in n.tags:
                tags.setdefault(t, []).append(n)
        blocks = []
        for t in sorted(tags, key=lambda x: (-len(tags[x]), x)):
            items = "".join(f'<li><a href="{root}{n.url}">{esc(n.title)}</a><span>{esc(n.class_name or display_name(n.top) or "Vault")}</span></li>' for n in sorted(tags[t], key=lambda n: n.title.lower()))
            blocks.append(f'<section class="tag-block" id="tag-{esc(slugify(t, "-"))}"><h2><span class="tag">#{esc(t)}</span><small>{len(tags[t])}</small></h2><ul>{items}</ul></section>')
        cloud = "".join(f'<a class="pill" href="#tag-{esc(slugify(t, "-"))}">#{esc(t)} <small>{len(tags[t])}</small></a>' for t in sorted(tags, key=lambda x: (-len(tags[x]), x)))
        main = f'<article class="note"><header class="note-header"><span class="eyebrow">Index</span><h1 class="note-title">Tags</h1><p class="lede">{len(tags)} tags across {len(self.vault.notes)} notes.</p></header><div class="pill-row">{cloud}</div><div class="tag-blocks">{"".join(blocks)}</div></article>'
        return self.shell(title="Tags", description="Every tag in the vault.", root=root, body_class="tags-page", main=main, active_id="__tags")

    # ----- data files
    def search_index(self):
        out = []
        for n in self.vault.notes.values():
            out.append({"title": n.title, "url": n.url, "path": n.id, "excerpt": n.excerpt,
                        "tags": n.tags, "class": n.class_name or "", "headings": [h[1] for h in n.headings][:12]})
        return out

    def write_graphs(self):
        (self.out / "graphs").mkdir(exist_ok=True)
        # global
        nodes, edges = [], []
        for n in self.vault.notes.values():
            group = n.class_name or display_name(n.top) or "Vault"
            nodes.append({"id": n.id, "title": n.title, "url": n.url, "group": group,
                          "degree": len(n.links) + len(n.backlinks), "home": n.id == "00-Home"})
            for t in n.links:
                edges.append({"source": n.id, "target": t, "type": "link"})
            c = self.class_of(n)
            if c and c["home"].id != n.id and c["home"].id not in n.links:
                edges.append({"source": n.id, "target": c["home"].id, "type": "section"})
        self.write_json("graphs/global-vault.json", {"course": "School Vault", "home": "00-Home", "nodes": nodes, "edges": edges})
        for c in self.classes.values():
            ids = {n.id for n in c["notes"]}
            cnodes = [{"id": n.id, "title": n.title, "url": n.url, "group": n.section or "Overview",
                       "degree": len(n.links & ids) + len(n.backlinks & ids), "home": n.id == c["home"].id} for n in c["notes"]]
            cedges = []
            for n in c["notes"]:
                for t in n.links:
                    if t in ids:
                        cedges.append({"source": n.id, "target": t, "type": "link"})
                if n.id != c["home"].id and c["home"].id not in n.links:
                    cedges.append({"source": n.id, "target": c["home"].id, "type": "section"})
            self.write_json(f"graphs/{c['slug']}.json", {"course": c["name"], "home": c["home"].id, "nodes": cnodes, "edges": cedges})

    def sitemap(self) -> str:
        urls = ["index.html", "graph.html", "tags.html"] + [n.url for n in self.vault.notes.values()]
        body = "".join(f"<url><loc>{SITE_URL}{u}</loc><lastmod>{TODAY.isoformat()}</lastmod></url>" for u in urls)
        return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'


# --------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    vault = Vault(Path(args.vault).resolve())
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    site = Site(vault, out)
    site.build()
    favicon = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4f63d9"/>'
               '<circle cx="22" cy="24" r="6" fill="#fff"/><circle cx="44" cy="20" r="5" fill="#fff"/><circle cx="36" cy="44" r="7" fill="#fff"/>'
               '<path d="M22 24 44 20M22 24l14 20M44 20l-8 24" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>')
    (out / "favicon.svg").write_text(favicon, encoding="utf-8")
    broken = sum(n.html.count("broken-link") for n in vault.notes.values())
    print(f"Unresolved links: {broken}")


if __name__ == "__main__":
    sys.exit(main())
