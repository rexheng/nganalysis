import type { Data } from './types';
import { esc, index, numWord, listJoin, chip, blocName, pct, srcLabel, LETTERS, plural, cap } from './text';
export { srcLabel } from './text';

function candNote(d: Data, id: string, ix: ReturnType<typeof index>): string {
  const n = ix.byId.get(id)!;
  const notes = (n.notes || []).map((x) => (x.url ? `<a href="${esc(x.url)}" rel="noopener" target="_blank">${esc(x.text)}</a>` : esc(x.text)));
  const outs = (ix.out.get(id) || []).map((t) => ix.byId.get(t)!.name);
  if (outs.length) notes.push(`Also listed as an endorser of ${esc(listJoin(outs))}.`);
  return notes.join(' ');
}

export function methodsHtml(d: Data): string {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold; const B = S.bootstrap;
  const prettyDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const vig = d.urls.find((u) => u.includes('acvote')) || '';
  const orgUrls = [...new Set(d.edges.flatMap((e) => e.src.filter((x) => x.pr).map((x) => d.urls[x.u])))].sort();
  const orgLinks = orgUrls.map((u) => `<a href="${esc(u)}" rel="noopener" target="_blank">${esc(srcLabel(u))}</a>`);
  const nShots = d.edges.filter((e) => e.kind === 'endorsement' && e.src.some((x) => x.sh)).length;
  const nominators = d.edges.filter((e) => e.kind === 'member' && !/member/i.test(e.rel)).map((e) => ix.byId.get(e.s)!.name);
  const memberSet = new Set(ix.slateMembers);
  const endorsersOfSlate = new Set(ix.slate ? (ix.inn.get(ix.slate.id) || []) : []);
  const both = [...endorsersOfSlate].filter((s) => (ix.out.get(s) || []).some((t) => memberSet.has(t)));
  const partial = [...new Set(d.edges.filter((e) => e.kind === 'endorsement' && memberSet.has(e.t)).map((e) => e.s))]
    .filter((s) => { const ts = new Set(ix.out.get(s) || []); return ix.slateMembers.some((m) => !ts.has(m)); });
  const rows = d.races.flatMap((r) => r.candidates.map((id) => {
    const n = ix.byId.get(id)!;
    const page = n.endorsementsPage ? `<a href="${esc(n.endorsementsPage)}" rel="noopener" target="_blank">${esc(srcLabel(n.endorsementsPage))}</a>` : '—';
    return `<tr><td>${esc(r.race)}</td><td><button class="nlink" data-node="${esc(id)}">${esc(n.name)}</button></td><td class="num">${n.inDeg}</td><td>${page}</td><td class="note">${candNote(d, id, ix)}</td></tr>`;
  })).join('');
  const dist = Object.entries(S.nCommunitiesDistribution).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${numWord(+k)} groups in ${v} runs`);
  const cites = Object.entries(S.edgeSourceTypeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k || 'unspecified')} (${v.toLocaleString('en-US')})`);
  const pages = Object.entries(S.sourceTypeCounts).reduce((a, [, v]) => a + v, 0);
  const nTypes = Object.keys(S.typeCounts).length;
  const typeList = Object.entries(S.typeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k.toLowerCase())} (${v})`);
  const rel = S.relCounts;
  const blocs = d.communities.map((c) => `${chip(c.id)} ${esc(blocName(ix, c))}: weakest pair ${esc(ix.byId.get(c.weakest.a)!.name)} and ${esc(ix.byId.get(c.weakest.b)!.name)}, ${pct(c.weakest.p)}`).join('; ');
  const overrides = S.typeOverrides.map((o) => `${esc(ix.byId.get(o.id)?.name || o.id)} (listed as “${esc(o.was)}”)`);
  const pal = S.palette.minDeltaE;
  const nodl = (S.downloads || []).map(([f, l]) => `<a href="data/${esc(f)}" download>${esc(l)}</a>`).join(' ');
  return `
<h2 id="methods">Methodology and sources</h2>
<h3>How the data was collected</h3>
<p>For each candidate on the Nov. 3, 2026 ballot for Berkeley City Auditor, City Council (Districts 1, 4, 7 and 8), Rent Stabilization Board and School Board, we recorded every endorser listed on the candidate’s campaign endorsement page, plus explicit endorsement claims in the candidate statements of the <a href="${esc(vig)}" rel="noopener" target="_blank">Alameda County Voter Information Guide</a>${orgLinks.length ? `, plus the published endorsement lists of ${numWord(orgLinks.length)} organizations (${listJoin(orgLinks)})` : ''}. An organization’s own endorsement page is treated as the <strong>primary</strong> source for its endorsements and is listed first, tagged “primary,” wherever it appears. ${nShots ? `For ${nShots} ${plural(nShots, 'endorsement')} the organization’s page could only be checked in a browser; we link the live page and keep an archived screenshot. ` : ''}Pages were accessed on ${esc(prettyDate(S.accessDates[0]))}${S.accessDates.length > 1 ? ' – ' + esc(prettyDate(S.accessDates[S.accessDates.length - 1])) : ''}.</p>
<p>The ${S.nEndorsementEdges.toLocaleString('en-US')} endorsements cite ${pages} distinct source pages. Citations by type (an endorsement can cite several sources; slate-membership links are not counted): ${listJoin(cites)}. Candidate names come from the City of Berkeley’s <a href="https://berkeleyca.gov/sites/default/files/Notice%20of%20Candidates%20Nov%203%202026%20-%20WEB%20Version.pdf" rel="noopener" target="_blank">Notice of Candidates</a>. Every connection in the graphic links to the page it came from.</p>
<div class="table-wrap"><table class="src-table"><caption class="sr">Candidates, endorsement counts and source pages</caption><thead><tr><th scope="col">Race</th><th scope="col">Candidate</th><th scope="col" class="num">Endorse&shy;ments</th><th scope="col">Source page</th><th scope="col">Notes</th></tr></thead><tbody>${rows}</tbody></table></div>
<h3>What counts as an endorsement</h3>
<ul>
<li><strong>Every endorsement counts equally.</strong> The network is unweighted: an organization’s official endorsement and an individual’s name on a list are each one link. Ranked-choice preferences printed by the source (${rel['Ranked #1'] || 0} “#1” and ${rel['Ranked #2'] || 0} “#2”) are kept as attributes and shown in the side panel.</li>
<li><strong>The Rent Board slate is one node.</strong> Endorsements on the shared page of the ${esc(ix.slate?.name || '')} point to a single slate node. Its ${numWord(ix.slateMembers.length)} members${nominators.length ? ` (and ${esc(listJoin(nominators))}, which nominated the slate)` : ''} are tied to it by dashed structural links, which are not endorsements but are included when grouping candidates. ${partial.length ? `${partial.length} ${plural(partial.length, 'endorser')} that ${partial.length > 1 ? 'back' : 'backs'} only some members ${partial.length > 1 ? 'are' : 'is'} linked to those members individually. ` : ''}${both.length === 0 ? 'No endorser is linked to both the slate and one of its members, so slate support is never double-counted.' : `${both.length} endorsers are linked to both the slate and individual members.`}</li>
<li><strong>Excluded:</strong> the voter guide’s “I refer to the following residents” lists${S.nPamphletRefsExcluded ? ` (${S.nPamphletRefsExcluded.toLocaleString('en-US')} names)` : ''}, which are references rather than endorsements; ${S.nUnverifiedLeads ? `${S.nUnverifiedLeads} claims found only on aggregator sites or in third-party guides and not confirmed by a primary source (listed in the unverified-leads download, never drawn); ` : ''}testimonials that do not appear in an endorsement list; and website navigation text.</li>
<li><strong>Names were standardized</strong> (spelling and title variants of the same person or group were merged) and each actor has one of ${numWord(nTypes)} types: ${listJoin(typeList)}. Types follow the title printed beside the name; the printed title decides “current” versus “former” official.${overrides.length ? ` We display ${listJoin(overrides)} as a political/advocacy organization; ${overrides.length > 1 ? 'they are' : 'it is'} not a candidate or a slate on this ballot.` : ''}</li>
</ul>
<h3>How coalitions were found</h3>
<ul>
<li><strong>Clustering.</strong> We grouped the undirected network with the Louvain community-detection algorithm (networkx, resolution 1.0). Endorsers who back exactly one candidate (${S.nSingle} of ${S.nEndorsers}) cannot connect anyone, so they were set aside (${S.nCore} actors and ${S.nCoreEdges} links remain). Louvain is randomized: over ${S.seeds} runs it found ${listJoin(dist)}, so no single run is “the” answer. The best run’s modularity is ${S.modularity.toFixed(2)}, which indicates moderate structure.</li>
<li><strong>Robust coalitions.</strong> For every pair of candidates we counted the share of the ${S.seeds} runs that put them in the same group (the heatmap below). A <strong>robust coalition</strong> is a set of candidates in which <em>every</em> pair is grouped together in at least ${pct(T)} of runs (complete-linkage clustering at ${pct(T)}). There are ${numWord(S.nBlocs)}: ${blocs}. ${cap(numWord(S.nLoose))} candidates or slates meet that bar with no one and are shown as unattached. An endorser is colored with a coalition only if it lands with that coalition’s candidates in at least ${pct(T)} of runs on average; otherwise it is drawn white. Coalitions are lettered, not named: they describe who endorses whom, not ideology.</li>
<li><strong>Camps reached.</strong> For each endorser who backs two or more candidates, we count how many camps their picks reach, where a camp is a robust coalition or an unattached candidate (${S.nBlocs + S.nLoose} in all). This is the default bridge ranking. Ties are broken by the participation coefficient (how evenly picks are split across camps: 0 = all in one, approaching 1 = spread evenly) and then by number of picks. Ranks are shown as whole numbers; tied endorsers share a rank.</li>
<li><strong>Betweenness</strong>, a second ranking: if you trace the shortest chain of endorsements between every pair of actors, how often does it pass through this one? Candidates score high simply because all their endorsers connect through them, so they are ranked separately.</li>
<li><strong>Robustness of bridge rankings.</strong> We redid both rankings ${B.resamples} times (${B.bcResamples} for betweenness), each time deleting a random ${pct(B.dropShare)} of endorsements, and separately after deleting each single endorsement in turn. A bridge is shown as robust only if it stays in the top ${B.topK} in at least ${pct(B.robustShare)} of resamples <em>and</em> after every single-edge deletion; the rest are marked “less certain.”</li>
<li><strong>Overlap</strong> between two candidates is reported as Jaccard similarity (shared endorsers ÷ endorsers of either) because raw counts favor long lists; the share of the smaller list and raw counts are available as toggles.</li>
<li><strong>Color.</strong> Coalition colors were checked with a color-vision-deficiency simulation (Machado et al., 2009). The smallest difference between any two colors (CIE76 ΔE) is ${pal.normal} for typical vision, ${pal.deuteranopia} under deuteranopia, ${pal.protanopia} under protanopia and ${pal.tritanopia} under tritanopia. Large nodes also carry their coalition letter.</li>
</ul>
<h3>Caveats</h3>
<ul>
<li>Campaign pages are self-reported, differ greatly in length (from none to ${Math.max(...d.nodes.filter((n) => n.isTarget).map((n) => n.inDeg))} names) and change over time. Long lists make a candidate look more central; an absent list makes a candidate invisible here even if they have support.</li>
<li>An endorsement is a public signal, not a measure of money, votes or organizing.</li>
<li>Name matching is imperfect: two different people with the same name would be merged, and one person listed under different names may be split.</li>
</ul>
<h3>Download the data</h3>
<p class="downloads">${nodl} <a href="data/graph.json" download>Graph + analysis (JSON)</a></p>
<p class="small">Data built ${esc(new Date(S.generated).toUTCString())} from the cleaned dataset${S.validation ? `, which passed ${S.validation.passed.toLocaleString('en-US')} of ${S.validation.total.toLocaleString('en-US')} automated checks` : ''}. Public files omit internal editing notes. Coalition letters: ${d.communities.map((c) => `${LETTERS[c.id]} = ${esc(blocName(ix, c))}`).join('; ')}.</p>`;
}
