import type { Data } from './types';
import { esc, index, numWord, commName, LETTERS, commColor, listJoin } from './text';

export const srcLabel = (u: string) => {
  if (u.includes('acvote.alamedacountyca.gov')) return 'County voter guide (PDF)';
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
};

function candNote(d: Data, id: string): string {
  const ix = index(d); const n = ix.byId.get(id)!; const notes: string[] = [];
  const raw = n.candNotes || '';
  const scanner = raw.match(/https:\/\/www\.berkeleyscanner\.com\/[^\s)]+/);
  if (scanner) notes.push(`<a href="${esc(scanner[0])}" rel="noopener" target="_blank">In a Berkeley Scanner candidate questionnaire</a>, he said he “did not seek” endorsements from “the existing political establishment.”`);
  if (/partial list/i.test(raw)) notes.push('Campaign page describes its list as partial.');
  if (/JS SPA/.test(raw)) notes.push('Page renders in JavaScript; names were extracted from the site code.');
  if (/Wix layout jumbled/.test(raw)) notes.push('Page layout scrambles some name/title pairings; titles may be imperfect.');
  if (/and more!/.test(raw)) notes.push('Page ends “and more!”, so the list is incomplete.');
  if (/NationBuilder/.test(raw)) notes.push('Endorsements page is on the site cited in her voter-guide statement.');
  if (n.name.includes('slate')) notes.push(`Shared page for the slate’s ${numWord(ix.slateMembers.length)} candidates.`);
  if (!n.endorsementsPage && !n.name.includes('slate')) notes.push('No campaign endorsement page found.');
  if (n.inDeg === 0) notes.push('No endorsements recorded.');
  const outs = (ix.out.get(id) || []).filter((t) => !(n.name.includes('slate'))).map((t) => ix.byId.get(t)!.name);
  if (outs.length) notes.push(`Also listed as an endorser of ${esc(listJoin(outs))}.`);
  return notes.join(' ');
}

export function methodsHtml(d: Data): string {
  const ix = index(d); const S = d.summary;
  const date = S.accessDates.length === 1 ? S.accessDates[0] : `${S.accessDates[0]} to ${S.accessDates[S.accessDates.length - 1]}`;
  const prettyDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const vig = d.urls.find((u) => u.includes('acvote')) || '';
  const rows = d.races.flatMap((r) => r.candidates.map((id) => {
    const n = ix.byId.get(id)!;
    const page = n.endorsementsPage ? `<a href="${esc(n.endorsementsPage)}" rel="noopener" target="_blank">${esc(srcLabel(n.endorsementsPage))}</a>` : '—';
    return `<tr><td>${esc(r.race)}</td><td><button class="nlink" data-node="${esc(id)}">${esc(n.name)}</button></td><td class="num">${n.inDeg}</td><td>${page}</td><td class="note">${candNote(d, id)}</td></tr>`;
  })).join('');
  const dist = Object.entries(S.nCommunitiesDistribution).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${numWord(+k)} groups in ${v} runs`).join(', ');
  const stab = d.communities.map((c) => `<span class="chip" style="--c:${commColor(c.id)}">${LETTERS[c.id]}</span> ${c.stability == null ? 'n/a' : Math.round(c.stability * 100) + '%'}`).join(' &nbsp; ');
  const rel = S.relCounts;
  return `
<h2 id="methods">Methodology and sources</h2>
<h3>How the data was collected</h3>
<p>For each candidate on the Nov. 3, 2026 ballot for Berkeley City Auditor, City Council (Districts 1, 4, 7 and 8), Rent Stabilization Board and School Board, we recorded every endorser listed on the candidate’s campaign endorsement page, plus explicit endorsement claims in the candidate statements of the <a href="${esc(vig)}" rel="noopener" target="_blank">Alameda County Voter Information Guide</a> (statement item 9). Pages were accessed on ${esc(prettyDate(S.accessDates[0]))}${S.accessDates.length > 1 ? ' – ' + esc(prettyDate(S.accessDates[S.accessDates.length - 1])) : ''}. Candidate names come from the City of Berkeley’s <a href="https://berkeleyca.gov/sites/default/files/Notice%20of%20Candidates%20Nov%203%202026%20-%20WEB%20Version.pdf" rel="noopener" target="_blank">Notice of Candidates</a>. Every connection in the graphic links to the page it came from; click any person or group to see them.</p>
<div class="table-wrap"><table class="src-table"><thead><tr><th>Race</th><th>Candidate</th><th class="num">Endorse&shy;ments</th><th>Source page</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>
<h3>What counts as an endorsement</h3>
<ul>
<li><strong>Every endorsement counts equally.</strong> The network is unweighted: an organization’s official endorsement and an individual’s name on a list are each one link. The type of endorser, and whether the source printed a ranked-choice preference (${rel['Ranked #1'] || 0} “#1” and ${rel['Ranked #2'] || 0} “#2” rankings), are kept as attributes and shown when you click a node.</li>
<li><strong>The Rent Board slate is one node.</strong> Endorsements on the shared page of the ${esc(ix.slate?.name || '')} point to a single slate node, which links to its ${numWord(ix.slateMembers.length)} members. Endorsements a member names in her or his own voter-guide statement point to that member.</li>
<li><strong>Excluded:</strong> the voter guide’s “I refer to the following residents” lists${S.nPamphletRefsExcluded ? ` (${S.nPamphletRefsExcluded.toLocaleString('en-US')} names)` : ''}, which are references rather than endorsements; groups named only as sponsors of the Berkeley Tenants Convention on the slate’s page; and website navigation text picked up while collecting.</li>
<li><strong>Names were standardized</strong> (e.g. spelling and title variants of the same person or group were merged) and each endorser was classified as one of eight actor types. Types are based on the title printed beside the name; an elected official’s title as printed decides “current” versus “former.” Endorsers who are themselves candidates in these races are shown as candidates.</li>
<li>${S.nNeedsCheck} of ${S.nEdges} records carry a reviewer flag (e.g. uncertain name/title pairing, two people listed as one entry, conflicting rank across sources). The flag text is shown in the side panel and in the downloadable data.</li>
</ul>
<h3>How the coalitions and bridges were computed</h3>
<ul>
<li><strong>Coalitions</strong> come from the Louvain community-detection algorithm (networkx, resolution 1.0) run on the undirected network. Endorsers who back exactly one candidate (${S.nSingle} of ${S.nEndorsers}) were set aside for the calculation, since they cannot connect anyone, and then assigned to their candidate’s coalition. Louvain is randomized, so we ran it ${S.seeds} times and kept the partition with the highest modularity (${S.modularity.toFixed(2)}; values above about 0.3 are commonly read as meaningful structure). Across runs the algorithm found ${dist}.</li>
<li><strong>Stability.</strong> For each coalition, the share of runs in which its candidates landed together: ${stab}. Lower numbers mean the boundary is soft.</li>
<li>Coalitions are labelled with letters on purpose. They describe who endorses whom, not ideology, and an endorser’s coalition is only where the algorithm placed them; many endorse across lines.</li>
<li><strong>Bridges</strong> are ranked by betweenness centrality: the share of shortest paths between all pairs of actors that pass through a given actor, computed on the same network (${S.nCore} actors, ${S.nCoreEdges} links). A high score means the actor sits between groups that are otherwise far apart. Candidates naturally score high because they are hubs, so the bridge list ranks endorsers separately.</li>
<li><strong>Overlap</strong> between two candidates is the number of endorsers who back both.</li>
</ul>
<h3>Caveats</h3>
<ul>
<li>Campaign pages are self-reported, differ greatly in length (from none to ${Math.max(...d.nodes.filter((n) => n.isTarget).map((n) => n.inDeg))} names) and change over time. Long lists make a candidate look more central; an absent list makes a candidate invisible here even if they have support.</li>
<li>An endorsement is a public signal, not a measure of money, votes or organizing.</li>
<li>Name matching is imperfect: two different people with the same name would be merged, and one person listed under different names may be split.</li>
</ul>
<h3>Download the data</h3>
<p class="downloads"><a href="data/berkeley_endorsements_2026.xlsx" download>Spreadsheet (XLSX, all tabs)</a> <a href="data/endorsements.csv" download>endorsements.csv</a> <a href="data/endorsers.csv" download>endorsers.csv</a> <a href="data/candidates.csv" download>candidates.csv</a> <a href="data/validation_report.md" download>Validation report</a> <a href="data/graph.json" download>Graph + analysis (JSON)</a></p>
<p class="small">Data last built ${esc(new Date(S.generated).toUTCString())} from the cleaned dataset. Coalition labels: ${d.communities.map((c) => commName(c.id)).join(', ')}.</p>`;
}
