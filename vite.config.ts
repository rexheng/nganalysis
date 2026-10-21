import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { buildTexts, esc } from './src/text';
import { methodsHtml } from './src/methods';
import type { Data } from './src/types';

// Bake all data-driven prose and the static overview into the HTML at build time.
function bakeText(): Plugin {
  return {
    name: 'bake-text',
    transformIndexHtml(html) {
      const d: Data = JSON.parse(readFileSync(new URL('./public/data/graph.json', import.meta.url), 'utf-8'));
      const svg = (n: string) => readFileSync(new URL(`./src/generated/overview-${n}.svg`, import.meta.url), 'utf-8');
      const t = buildTexts(d);
      return html
        .replace(/%TITLE%/g, esc(t.title)).replace(/%DESC%/g, esc(t.description))
        .replace('<!--HEADLINE-->', esc(t.headline)).replace('<!--DEK-->', esc(t.dek)).replace('<!--STATS-->', esc(t.statsLine))
        .replace('<!--FINDINGS-->', t.findings.map((f) => `<li>${f}</li>`).join(''))
        .replace('<!--OVERVIEW_WIDE-->', svg('wide')).replace('<!--OVERVIEW_NARROW-->', svg('narrow'))
        .replace('<!--OVERVIEW_KEY-->', t.overviewKey).replace('<!--OVERVIEW_ALT-->', esc(t.overviewAlt))
        .replace('<!--GRAPH_SUMMARY-->', esc(t.graphSummary))
        .replace('<!--SEEDS-->', String(d.summary.seeds)).replace('<!--TPCT-->', `${Math.round(d.summary.robustThreshold * 100)}%`)
        .replace('<!--METHODS-->', methodsHtml(d));
    },
  };
}
export default defineConfig({ plugins: [bakeText()], base: '/', build: { target: 'es2020', chunkSizeWarningLimit: 800 } });
