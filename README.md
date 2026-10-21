# Berkeley endorsements 2026 — network graphic

Static site (Vite + TypeScript + sigma.js/graphology). All analysis is precomputed at build time.

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
