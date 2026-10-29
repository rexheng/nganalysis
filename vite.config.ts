import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTexts, esc } from './src/text';
import { methodsHtml, methodsMarkdown, referencesHtml } from './src/methods';
import { writeupIntro, writeupAnalysis } from './src/writeup';
import type { Data } from './src/types';

// logo.dev publishable key: read from ../.env.local at build time only (gitignored, never committed or printed)
const logoKey = (() => {
  try { const m = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8').match(/^LOGODEV_PUBLISHABLE_KEY=["']?([^"'\r\n]+)/m); return m ? m[1].trim() : ''; }
  catch { return ''; }
})();

const load = (): Data => JSON.parse(readFileSync(new URL('./public/data/graph.json', import.meta.url), 'utf-8'));
// on the findings page, names link to the graph with the node selected
const toGraphLinks = (h: string) => h.replace(/<button class="nlink([^"]*)" data-node="([^"]+)">([\s\S]*?)<\/button>/g, '<a class="nlink$1" href="/?node=$2">$3</a>');

// Bake all data-driven prose and the static overview into the HTML at build time.
function bakeText(): Plugin {
  return {
    name: 'bake-text',
    transformIndexHtml(html) {
      const d = load();
      const svg = (n: string) => readFileSync(new URL(`./src/generated/overview-${n}.svg`, import.meta.url), 'utf-8');
      const t = buildTexts(d);
      return html
        .replace(/%TITLE%/g, esc(t.title)).replace(/%DESC%/g, esc(t.description)).replace(/%HEADLINE%/g, esc(t.headline))
        .replace('<!--HEADLINE-->', esc(t.headline)).replace('<!--STATS-->', esc(t.statsLine))
        .replace('<!--WRITEUP_INTRO-->', writeupIntro).replace('<!--WRITEUP_ANALYSIS-->', writeupAnalysis)
        .replace('<!--OVERVIEW_WIDE-->', svg('wide')).replace('<!--OVERVIEW_NARROW-->', svg('narrow'))
        .replace('<!--OVERVIEW_KEY-->', t.overviewKey).replace('<!--OVERVIEW_ALT-->', esc(t.overviewAlt))
        .replace('<!--GRAPH_SUMMARY-->', esc(t.graphSummary))
        .replace('<!--METHODS-->', toGraphLinks(methodsHtml(d)))
        .replace('<!--REFERENCES-->', referencesHtml(d));
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'data/METHODS.md', source: methodsMarkdown(load()) });
    },
  };
}
export default defineConfig({
  plugins: [bakeText()], base: '/',
  define: { 'import.meta.env.VITE_LOGODEV_KEY': JSON.stringify(logoKey) },
  build: { target: 'es2020', chunkSizeWarningLimit: 800, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), findings: resolve(__dirname, 'findings/index.html') } } },
});
