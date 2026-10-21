import type { Data } from './types';
import { esc, index, numWord, blocName, pct, srcLabel, LETTERS, plural, surname } from './text';
export { srcLabel } from './text';

const nProbOf = (d: Data) => d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || '')).length;
const prettyDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const builtPT = (d: Data) => new Date(d.summary.generated).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short' });

/** the short methods block on the findings page: just enough to trust and reproduce the result */
export function methodsHtml(d: Data): string {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold; const B = S.bootstrap; const nProb = nProbOf(d);
  const vig = d.urls.find((u) => u.includes('acvote')) || '';
  const so = d.slateOverlap; const top = so?.council[0] ? ix.byId.get(so.council[0].t) : undefined;
  const zd = S.zeroDropped;
  const short: Record<string, string> = { xlsx: 'Spreadsheet (XLSX)', zip: 'Source snapshots (ZIP)' };
  const nodl = (S.downloads || []).map(([f, l]) => `<li><a href="/data/${esc(f)}" download>${esc(short[f.split('.').pop()!] || l)}</a></li>`).join('');
  return `
<h2 id="methods">Methods</h2>
<ul class="mlist">
<li><strong>Endorsement:</strong> a person or group named on a candidate’s endorsement page, an organization’s own list (the primary source) or a candidate statement in the <a href="${esc(vig)}" rel="noopener" target="_blank">county voter guide</a>, as of ${esc(prettyDate(S.accessDates[0]))}. Excluded: the guide’s “I refer to the following residents” lists${S.nUnverifiedLeads ? ` and ${S.nUnverifiedLeads} claims found only on aggregator sites` : ''}.</li>
${nProb ? `<li><strong>Probable:</strong> ${numWord(nProb)} ${plural(nProb, 'endorsement is', 'endorsements are')} probable, not confirmed (the graph’s panel says why), drawn in blue. Every result is also computed without them.</li>` : ''}
<li><strong>Coalitions:</strong> Louvain clustering, ${numWord(S.pools)} batches of ${S.runs.toLocaleString('en-US')} runs, input shuffled each run. Endorsers of a single candidate are set aside. Groups merge while their candidates land together at least ${pct(T)} of the time on average, and must match across both batches, with and without probable endorsements. Within ${Math.round((S.border ?? 0.05) * 100)} points of ${pct(T)} is borderline. The slate is one node, tied to its members by slate links.</li>
<li><strong>Spanning:</strong> how many coalitions an endorser’s picks reach; ties share a rank. Tested by ${B.resamples} re-runs that each delete ${pct(B.dropShare)} of endorsements and redo the clustering, by deleting each endorsement in turn, and without probable ones.</li>
<li><strong>Overlap:</strong> shared endorsers ÷ everyone on either list.${so && top ? ` ${esc(surname(top))} stays first in ${pct(so.top1Share)} of ${so.resamples.toLocaleString('en-US')} resamples of the slate’s endorsers.` : ''}</li>
<li><strong>Caveat:</strong> campaign pages are self-reported and range from zero to ${Math.max(...d.nodes.filter((n) => n.isTarget).map((n) => n.inDeg))} names, so long lists look more central. An endorsement is a public signal, not money or votes.</li>
</ul>
<h2 id="data">Data</h2>
<ul class="downloads">${nodl}<li><a href="/data/graph.json" download>Analysis (JSON)</a></li><li><a href="/data/METHODS.md" download>Full methods</a></li></ul>
<p class="small muted">${S.nZeroEndorsersDropped && zd ? `The endorsers table omits ${S.nZeroEndorsersDropped} names that endorse no one: ${zd.pamphletOnly} appear only in the excluded lists, ${zd.candidates} are candidates${zd.other ? `, ${zd.other} other` : ''}. ` : ''}Built ${esc(builtPT(d))} Pacific time.</p>`;
}

/** the long version, published as a download (plain Markdown) */
export function methodsMarkdown(d: Data): string {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold; const B = S.bootstrap; const nProb = nProbOf(d);
  const nm = (id: string) => ix.byId.get(id)?.name ?? id;
  const orgUrls = [...new Set(d.edges.flatMap((e) => e.src.filter((x) => x.pr).map((x) => d.urls[x.u])))];
  const orgs = [...new Set(orgUrls.map(srcLabel))].sort();
  const cites = Object.entries(S.edgeSourceTypeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k || 'unspecified'} (${v})`);
  const rc = Object.entries(S.rankCounts || {}).map(([k, v]) => `${v} “${k}”`);
  const typeList = Object.entries(S.typeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`);
  const dist = Object.entries(S.nCommunitiesDistribution).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k} groups: ${v.toLocaleString('en-US')} runs`);
  const pal = S.palette.minDeltaE;
  const nominators = d.edges.filter((e) => e.kind === 'member' && !/member/i.test(e.rel)).map((e) => nm(e.s));
  const parts = Object.entries(S.variantPartitions || {}).map(([k, p]) => `- ${k.startsWith('conf') ? 'Without probable endorsements' : 'All endorsements'}, batch ${+k.slice(-1) + 1}: ${p.map((g) => g.join(' + ')).join(' | ')}`);
  const cand = d.races.flatMap((r) => r.candidates.map((id) => { const n = ix.byId.get(id)!; return `| ${r.race} | ${n.name} | ${n.inDeg} | ${n.endorsementsPage || n.campaignUrl || '—'} |`; }));
  const wd = d.nodes.filter((n) => n.analysisEndorser);
  return `# Berkeley endorsements, November 2026: full methods

Generated ${builtPT(d)} Pacific time from the cleaned dataset. Every number below is computed from the published data.

## Sources

- Candidate campaign endorsement pages, candidate statements in the Alameda County Voter Information Guide, and the endorsement lists of ${orgs.length} organizations: ${orgs.join('; ')}.
- An organization’s own page is the primary source for its endorsements. Pages accessed ${S.accessDates.map(prettyDate).join(', ')}.
- The ${S.nEndorsementEdges} endorsements cite these source types: ${cites.join(', ')}. Aggregator pages only corroborate; they never create an endorsement on their own.
- Excluded: the voter guide’s “I refer to the following residents” lists (${S.nPamphletRefsExcluded ?? 'n/a'} references to ${S.nPamphletPeople ?? 'n/a'} people)${S.nUnverifiedLeads ? `; ${S.nUnverifiedLeads} unconfirmed aggregator or third-party claims (unverified_leads.csv)` : ''}; testimonials not in an endorsement list; website navigation text.
- Names were standardized. Actor types: ${typeList.join(', ')}. The printed title decides current versus former official.${rc.length ? ` Ranked-choice preferences printed by sources (${rc.join(', ')}) are kept as attributes; every endorsement counts equally.` : ''}
${nProb ? `- ${nProb} endorsements are rated probable: ${d.edges.filter((e) => /probable/i.test(e.conf || '')).map((e) => `${nm(e.s)} → ${nm(e.t)}`).join('; ')}.\n` : ''}- The ${ix.slate?.name ?? 'slate'} is one node; its ${ix.slateMembers.length} members${nominators.length ? ` and ${nominators.join(', ')} (which nominated the slate)` : ''} are tied to it by slate links, which count for clustering but are not endorsements.
${wd.length ? `- ${wd.map((n) => n.name).join(', ')} withdrew and ${wd.length > 1 ? 'are' : 'is'} analysed only as ${wd.length > 1 ? 'endorsers' : 'an endorser'}.\n` : ''}
## Coalitions

1. Network: undirected, unweighted. Endorsers with exactly one endorsement (${S.nSingle} of ${S.nEndorsers}) are removed, leaving ${S.nCore} actors and ${S.nCoreEdges} links.
2. Louvain community detection (networkx, resolution 1.0), ${S.pools} independent batches of ${S.runs.toLocaleString('en-US')} runs, node and edge order shuffled every run (${S.nRuns.toLocaleString('en-US')} runs in all). Number of groups found: ${dist.join('; ')}.
3. For each pair of candidates, the share of runs that put them in the same group (co-assignment).
4. Average-linkage agglomerative clustering on co-assignment, cut at ${pct(T)}: keep merging the two groups whose cross pairs have the highest mean co-assignment while that mean is at least ${pct(T)}. Deterministic given the matrix.
5. Steps 2–4 repeated without the ${nProb} probable endorsements. A coalition is reported only if it appears in all four partitions (2 batches × with/without probable endorsements):
${parts.join('\n')}
6. Borderline: a coalition whose weakest pair is within ${Math.round((S.border ?? 0.05) * 100)} points of ${pct(T)}.
7. An endorser is coloured with a coalition if it shares a group with that coalition’s candidates in at least ${pct(T)} of runs on average.

Coalitions: ${d.communities.map((c) => `${LETTERS[c.id]} = ${blocName(ix, c)} (mean ${pct(c.mean)}, ${pct(c.meanConf)} without probable; weakest pair ${nm(c.weakest.a)}–${nm(c.weakest.b)} ${pct(c.weakest.p)}${c.borderline ? ', borderline' : ''})`).join('; ')}.

Merges refused just below the cutoff: ${Object.entries(S.refusedMerges || {}).flatMap(([k, rs]) => rs.map((r, i) => (r ? `${r.set.join(' + ')} at ${(r.v * 100).toFixed(2)}% (${k === 'conf' ? 'without probable' : 'all'}, batch ${i + 1})` : ''))).filter(Boolean).join('; ')}.

## Endorsers who span coalitions

- Reach: the number of coalitions an endorser’s picks fall in; unattached candidates don’t count. Competition ranks (ties share a rank).
- Robustness: ${B.resamples} re-runs each deleting a random ${pct(B.dropShare)} of endorsements and redoing the clustering (${B.runsPerResample} shuffled Louvain runs, complete linkage at ${pct(T)}); leave-one-endorsement-out; and recomputation without probable endorsements. “Holds up” = top ${B.topK} in at least ${pct(B.robustShare)} of re-runs, top ${B.topK} after every single deletion, and top ${B.topK} without probable endorsements.
- Betweenness: share of shortest paths between pairs of actors that pass through an endorser, on the core network; same tests (${B.bcResamples} re-runs). It is less stable than reach, so the findings page uses reach; the graph’s panel shows both. Rankings with and without probable endorsements are in graph.json (rankBc, rankBcConf).

## Overlap

Jaccard similarity: shared endorsers ÷ endorsers of either candidate. The slate comparison resamples the slate’s endorsers ${d.slateOverlap?.resamples ?? ''} times; the share of resamples in which each council candidate ranks first is in graph.json (slateOverlap).

## Colour

Coalition colours were checked with a colour-vision-deficiency simulation (Machado et al., 2009). Minimum CIE76 ΔE between colours: ${pal.normal} typical, ${pal.deuteranopia} deuteranopia, ${pal.protanopia} protanopia, ${pal.tritanopia} tritanopia. Actor types use a separate palette and shapes.

## Candidates

| Race | Candidate | Endorsements | Source page |
|---|---|---|---|
${cand.join('\n')}

## Caveats

Campaign pages are self-reported, vary in length and change over time. An endorsement is a public signal, not money, votes or organizing. Name matching can merge two people with the same name or split one person listed under different names.
`;
}
