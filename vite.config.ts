import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTexts, esc } from './src/text';
import { methodsHtml, methodsMarkdown, referencesHtml } from './src/methods';
import type { Data } from './src/types';

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
      const findings = t.findings.map((f, i) => (f.startsWith('<p') ? f : `<p>${f}</p>`) + (i === 0 && t.strip ? t.strip : '')).join('\n');
      return html
        .replace(/%TITLE%/g, esc(t.title)).replace(/%DESC%/g, esc(t.description)).replace(/%HEADLINE%/g, esc(t.headline))
        .replace('<!--HEADLINE-->', esc(t.headline)).replace('<!--STATS-->', esc(t.statsLine))
        .replace('<!--FINDINGS-->', toGraphLinks(findings))
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
  build: { target: 'es2020', chunkSizeWarningLimit: 800, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), findings: resolve(__dirname, 'findings/index.html') } } },
});
