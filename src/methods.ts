import type { Data } from './types';
import { esc, index, numWord, blocName, pct, pctCut, srcLabel, LETTERS, plural, surname, listJoin, marginLabel, weakPct, slateShares, nearMisses, intactRange, robustBridges } from './text';
export { srcLabel } from './text';

const nProbOf = (d: Data) => d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || '')).length;
const prettyDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const builtPT = (d: Data) => new Date(d.summary.generated).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short' });

/** the short methods block on the findings page: just enough to trust and reproduce the result */
/** the source note on a probable edge, in plain sentences (same facts, reordered) */
function probNote(n: string, many: boolean) {
  const m = n.match(/^Name appears on an unlabelled line directly below (.+?)'s (.+?) entry; aggregators that cite the \1 page read it as \2; not confirmed with \1\.?$/);
  if (m) return `On ${m[1]}’s page ${many ? 'each name sits' : 'the name sits'} on an unlabelled line just below its ${m[2]} entry. Aggregators read ${many ? 'them' : 'it'} as ${m[2]} ${many ? 'endorsements' : 'an endorsement'}; ${m[1]} has not confirmed.`;
  return (many ? n.replace(/^Name appears/, 'Each name appears') : n).replace(/'/g, '’');
}
export function methodsHtml(d: Data): string {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold; const B = S.bootstrap; const nProb = nProbOf(d);
  const vig = d.urls.find((u) => u.includes('acvote')) || '';
  const zd = S.zeroDropped;
  const nm = (id: string) => ix.byId.get(id)?.name ?? id;
  const probE = d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || ''));
  const notes = [...new Set(probE.map((e) => e.confNote || ''))].filter(Boolean);
  const bySrc = new Map<string, string[]>();
  for (const e of probE) { if (!bySrc.has(e.s)) bySrc.set(e.s, []); bySrc.get(e.s)!.push(nm(e.t)); }
  const probWho = [...bySrc.entries()].map(([s, ts]) => `${esc(nm(s))}’s endorsements of ${esc(listJoin(ts))}`).join('; ');
  const none = d.nodes.filter((n) => n.isTarget && n.type !== 'Slate' && !n.analysisEndorser && n.inDeg === 0 && !n.memberOf);
  const wd = d.nodes.filter((n) => n.analysisEndorser);
  const short: Record<string, string> = { xlsx: 'Spreadsheet (XLSX)', zip: 'Source snapshots (ZIP)' };
  const nodl = (S.downloads || []).map(([f, l]) => `<li><a href="/data/${esc(f)}" download>${esc(short[f.split('.').pop()!] || l)}</a></li>`).join('');
  const extra = [none.length ? `${listJoin(none.map((n) => esc(n.name)))} ${none.length === 1 ? 'has' : 'have'} no endorsements on record.` : '',
    ...wd.map((n) => `${esc(n.name)} withdrew and counts only as an endorser.`)].filter(Boolean).join(' ');
  return `
<h2 id="methods">Methods</h2>
<p>We counted ${S.nEndorsementEdges.toLocaleString('en-US')} endorsements by ${S.nEndorsers} people and groups of ${d.nodes.filter((n) => n.isTarget && n.type !== 'Slate' && !n.analysisEndorser).length} candidates and ${numWord(d.nodes.filter((n) => n.isTarget && n.type === 'Slate').length)} ${plural(d.nodes.filter((n) => n.isTarget && n.type === 'Slate').length, 'slate')}.</p>
<ul class="mlist">
<li><strong>Endorsement:</strong> a name on a candidate’s endorsement page, on an organization’s own list or in a candidate statement in the <a href="${esc(vig)}" rel="noopener" target="_blank">county voter guide</a>, as of ${esc(prettyDate(S.accessDates[0]))}. Where an organization publishes its own list, that list is the source. Excluded: the guide’s “I refer to the following residents” lists${S.nUnverifiedLeads ? ` and ${S.nUnverifiedLeads} claims found only on aggregator sites` : ''}.</li>
${nProb ? `<li><strong>Probable:</strong> ${probWho}. ${notes.length === 1 ? esc(probNote(notes[0], probE.length > 1)) : ''} Every result is also computed without them; both graphics draw them in blue.</li>` : ''}
<li><strong>Coalitions:</strong> Louvain clustering (networkx), run ${S.nRuns.toLocaleString('en-US')} times on shuffled input; endorsers of a single candidate are left out.${S.poolsMinAgree ? ` Either half of the runs gives the same groups.` : ''}${ix.slate ? ` The slate counts as one participant, linked to its ${numWord(ix.slateMembers.length)} members.` : ''}</li>
<li><strong>Spanning:</strong> the number of coalitions in which an endorser backs a candidate; ties share a rank. Tested by ${B.resamples} reruns that each drop a random ${pct(B.dropShare)} of endorsements, by dropping each endorsement in turn, and without the probable ones.${(() => { const r = robustBridges(d); return r.length ? ` All ${numWord(r.length)} stay in the top ${B.topK} in at least ${Math.floor(Math.min(...r.map((b) => b.topReach)) * 100)}% of reruns, after any single deletion, and without the probable endorsements.` : ''; })()}</li>
<li><strong>Caveat:</strong> campaign pages are self-reported and range from zero to ${Math.max(...d.nodes.filter((n) => n.isTarget).map((n) => n.inDeg))} names, so long lists look more central. An endorsement is a public signal, not money or votes.</li>
</ul>
<h2 id="data">Data</h2>
<ul class="downloads">${nodl}<li><a href="/data/graph.json" download>Analysis (JSON)</a></li><li><a href="/data/METHODS.md" download>Full methods</a></li></ul>
<p class="small muted">${extra ? `${extra} ` : ''}${S.nZeroEndorsersDropped && zd ? `The endorsers table omits ${S.nZeroEndorsersDropped} names that endorse no one: ${zd.pamphletOnly} appear only in the excluded lists, ${zd.candidates} are candidates${zd.other ? `, ${zd.other} other` : ''}. ` : ''}Built ${esc(builtPT(d))} Pacific time.</p>`;
}

/** the long version, published as a download (plain Markdown) */
export function methodsMarkdown(d: Data): string {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold; const B = S.bootstrap; const nProb = nProbOf(d);
  const nm = (id: string) => ix.byId.get(id)?.name ?? id;
  const orgUrls = [...new Set(d.edges.flatMap((e) => e.src.filter((x) => x.pr).map((x) => d.urls[x.u])))];
  const labels = [...new Set(orgUrls.map(srcLabel))].sort();
  const orgs = labels.filter((l) => !/^Wayback Machine copy/i.test(l)); const archived = labels.filter((l) => /^Wayback Machine copy/i.test(l));
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

- Candidate campaign endorsement pages, candidate statements in the Alameda County Voter Information Guide, and the endorsement lists of ${orgs.length} organizations: ${orgs.join('; ')}.${archived.length ? ` For ${archived.length} of them an archived copy is also cited: ${archived.join('; ')}.` : ''}
- An organization’s own page is the primary source for its endorsements. Pages accessed ${S.accessDates.map(prettyDate).join(', ')}.
- edge_sources.csv: snapshot_path gives the file’s path inside source_snapshots.zip and is blank for captures not in the archive; snapshot_sha256 is kept for every capture.
- The ${S.nEndorsementEdges} endorsements cite these source types: ${cites.join(', ')}. Aggregator pages only corroborate; they never create an endorsement on their own.
- Excluded: the voter guide’s “I refer to the following residents” lists (${S.nPamphletRefsExcluded ?? 'n/a'} references to ${S.nPamphletPeople ?? 'n/a'} people)${S.nUnverifiedLeads ? `; ${S.nUnverifiedLeads} unconfirmed aggregator or third-party claims (unverified_leads.csv)` : ''}; testimonials not in an endorsement list; website navigation text.
- Names were standardized. Actor types: ${typeList.join(', ')}. The printed title decides current versus former official.${rc.length ? ` Ranked-choice preferences printed by sources (${rc.join(', ')}) are kept as attributes; every endorsement counts equally.` : ''}
${nProb ? `- ${nProb} endorsements are rated probable: ${d.edges.filter((e) => /probable/i.test(e.conf || '')).map((e) => `${nm(e.s)} → ${nm(e.t)}`).join('; ')}.\n` : ''}- The ${ix.slate?.name ?? 'slate'} counts as one participant; its ${ix.slateMembers.length} members${nominators.length ? ` and ${nominators.join(', ')} (which nominated the slate)` : ''} are tied to it by slate links, which count for clustering but are not endorsements.
${wd.length ? `- ${wd.map((n) => n.name).join(', ')} withdrew and ${wd.length > 1 ? 'are' : 'is'} analysed only as ${wd.length > 1 ? 'endorsers' : 'an endorser'}.\n` : ''}
## Coalitions

1. Network: undirected, unweighted. Endorsers with exactly one endorsement (${S.nSingle} of ${S.nEndorsers}) are removed, leaving ${S.nCore} actors and ${S.nCoreEdges} links.
2. Louvain community detection (networkx, resolution 1.0), ${S.pools} independent batches of ${S.runs.toLocaleString('en-US')} runs, node and edge order shuffled every run (${S.nRuns.toLocaleString('en-US')} runs in all). Number of groups found: ${dist.join('; ')}.
3. For each pair of candidates, the share of runs that put them in the same group (co-assignment).
4. Complete-linkage agglomerative clustering on the pairwise minimum of two co-assignment matrices, one with all endorsements and one without the ${nProb} probable endorsements (step 2 repeated on that network), cut at ${pct(T)}: keep merging the two groups whose weakest cross pair is highest while that pair is at least ${pct(T)}. So every pair of candidates inside a coalition lands together in at least ${pct(T)} of runs with and without the probable endorsements. One rule decides membership and the margin label. Deterministic given the matrices.${S.poolsMinAgree !== undefined ? ` Applying the same rule to each batch of ${S.runs.toLocaleString('en-US')} runs separately ${S.poolsMinAgree ? 'gives the same coalitions' : 'does not give the same coalitions'}.` : ''}
5. Margin: “stable” if a coalition’s weakest pair (the lower of the two values) is at least ${pct(T + (S.border ?? 0.05))}; “thin margin” if it is between ${pct(T)} and ${pct(T + (S.border ?? 0.05))}. A near-miss is an unattached candidate whose weakest pair with some coalition is between ${pct(T - (S.border ?? 0.05))} and ${pct(T)}.
6. An endorser is coloured with a coalition if it shares a group with that coalition’s candidates in at least ${pct(T)} of runs on average (endorsers are not part of the coalition rule above).
7. For reference, complete linkage on each matrix alone (2 batches × with/without probable endorsements) gives:
${parts.join('\n')}

Coalitions: ${d.communities.map((c) => `${LETTERS[c.id]} = ${blocName(ix, c)} (weakest pair ${nm(c.weakest.a)}–${nm(c.weakest.b)}: ${pctCut(c.weakest.pPooled, T + (S.border ?? 0.05))} with all endorsements, ${pctCut(c.weakest.pConf, T + (S.border ?? 0.05))} without probable; ${marginLabel(d, c)})`).join('; ')}.

Near-misses: ${nearMisses(d).map((x) => `${nm(x.l.id)} with ${LETTERS[x.c]} (weakest pair ${pctCut(x.l.nearMin!, T)} with all endorsements, ${pctCut(x.l.nearMinConf!, T)} without probable)`).join('; ') || 'none'}.${S.minRefused ? ` First merge refused under the rule: ${S.minRefused.set.join(' + ')} at ${(S.minRefused.v * 100).toFixed(2)}%.` : ''}

Fragility: ${B.resamples} reruns, each dropping a random ${pct(B.dropShare)} of endorsements (probable ones included in the draw) and redoing ${B.runsPerResample} shuffled Louvain runs with and ${B.runsPerResample} without the probable endorsements, then the same rule as step 4 (complete linkage at ${pct(T)} on the pairwise minimum). Number of coalitions found: ${Object.entries(S.bootGroups).map(([k, v]) => `${k}: ${v}`).join(', ')}. Each coalition survived intact (same candidates, nobody added) in: ${d.communities.map((c) => `${LETTERS[c.id]} ${c.intact ?? 0} (95% Wilson range ${intactRange(c)})`).join(', ')} of ${B.resamples}; all ${d.communities.length} intact together in ${S.bootIntactAll ?? 'n/a'}.

## Endorsers who span coalitions

- Reach: the number of coalitions an endorser’s picks fall in; unattached candidates don’t count. Competition ranks (ties share a rank).
- Robustness: ${B.resamples} re-runs each deleting a random ${pct(B.dropShare)} of endorsements and redoing the clustering (${B.runsPerResample} shuffled Louvain runs, complete linkage at ${pct(T)}); leave-one-endorsement-out; and recomputation without probable endorsements. “Holds up” = top ${B.topK} in at least ${pct(B.robustShare)} of re-runs, top ${B.topK} after every single deletion, and top ${B.topK} without probable endorsements.
- Betweenness: share of shortest paths between pairs of actors that pass through an endorser, on the core network; same tests (${B.bcResamples} re-runs). It is less stable than reach, so the findings page uses reach; the graph’s panel shows both. Rankings with and without probable endorsements are in graph.json (rankBc, rankBcConf).

## Overlap

The findings page and the overlap matrix use raw counts of shared endorsers. graph.json also gives Jaccard similarity (shared endorsers ÷ endorsers of either candidate).${d.slateOverlap ? ` By Jaccard, the council candidate closest to the slate is ${nm(d.slateOverlap.council[0].t)} (${d.slateOverlap.council[0].j}); it stays first in ${pct(d.slateOverlap.top1Share)} of ${d.slateOverlap.resamples.toLocaleString('en-US')} bootstrap resamples of all endorsers (drawn with replacement, every list recomputed).` : ''}${d.slateOverlap?.nOthersMulti ? `\n\nBase rate: of the ${d.slateOverlap.nOthersMulti} endorsers who back two or more candidates but not the slate, the share backing each council candidate: ${d.slateOverlap.council.map((c) => `${nm(c.t)} ${pct(c.base ?? 0)}`).join(', ')}.` : ''}${d.slateOverlap?.leadBoot ? ` Resampling the slate's own backers ${d.slateOverlap.leadBoot.resamples.toLocaleString('en-US')} times (with replacement): ${nm(d.slateOverlap.leadBoot.a)} has more of them than ${nm(d.slateOverlap.leadBoot.b)} in ${pct(d.slateOverlap.leadBoot.aLeads)}, ties in ${pct(d.slateOverlap.leadBoot.tie)}; ${nm(d.slateOverlap.leadBoot.a)} has a majority in ${pct(d.slateOverlap.leadBoot.aMajority)}, ${nm(d.slateOverlap.leadBoot.b)} in ${pct(d.slateOverlap.leadBoot.bMajority)}.` : ''}

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
