# Berkeley endorsements 2026 — network graphic

Network graphic of endorsements in Berkeley's 2026 local elections: who endorses whom, which coalitions form, and how stable they are. Static site (Vite + TypeScript + sigma.js/graphology) plus Python data scripts; all analysis is precomputed at build time.

Live: https://berkeley-endorsements-2026.vercel.app/

Build: `npm install && npm run build` (output in `dist/`). Regenerating the data needs Python with `requirements.txt` installed; see below.

```
# 1. data: reads ../clean/*.csv -> public/data/graph.json (+ copies CSV/XLSX for download)
../.venv/bin/python scripts/build-data.py          # needs networkx, numpy
# 2. site
npm install && npm run build                         # -> dist/
# 3. verify a URL (screenshots, console errors, click test)
../.venv/bin/python scripts/verify.py <url> ../shots
```

- `scripts/build-data.py` — graph model, Louvain (200 seeds, best modularity), betweenness, overlap, layout.
- `scripts/layout.py` — deterministic layout (ForceAtlas2 on the core graph + leaf clouds + collision relaxation).
- `src/text.ts`, `src/methods.ts` — all prose is generated from graph.json (baked into HTML at build by `vite.config.ts`).
- Pamphlet "I refer to the following residents" lists are never read as edges.

## Publishing safety
- `scripts/build-data.py` publishes only an explicit per-file column ALLOWLIST from `../clean/*.csv`; unknown columns are never passed through, and `clean/internal/` is never read. The XLSX is regenerated from the allowlisted tables.
- The build fails if any published file (graph.json, CSVs, XLSX, and after `vite build` everything in `dist/` via `scripts/check-published.py`) matches `/verify|uncertain|needs.?check|possibly same|\bRex\b|review [A-Z]-?\d|internal_notes/i`.
