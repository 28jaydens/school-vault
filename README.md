# School Vault

A public, searchable web edition of my Obsidian school notes: https://28jaydens.github.io/school-vault/

Everything in this repository except `tools/` and this file is generated from the local Obsidian vault. Obsidian configuration, Excalidraw drawings and `.base` files are excluded.

## Rebuilding the site

```bash
pip install markdown pyyaml
python tools/build_site.py --vault "C:/Users/28jay/Obsidian/School-Vault" --out .
git add -A && git commit -m "Rebuild site" && git push
```

The generator (`tools/build_site.py`) renders every Markdown note to HTML and produces:

- a dashboard home page with class cards, upcoming assessments and recent notes
- Obsidian wikilinks, embeds, callouts (including foldable ones), tags, tasks, highlights
- Mermaid diagrams and LaTeX math rendered in the browser
- a table of contents, backlinks and a local graph on every note
- `graph.html`, the full-vault graph, and `tags.html`
- `search-index.json` for the Ctrl K search, plus a sitemap

Styles live in `tools/site.css`, behaviour in `tools/site.js`, and the graph renderer in `tools/graph.js`; they are copied to the site root on every build.
