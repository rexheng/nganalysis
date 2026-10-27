import type { Data } from './types';
import { esc, index, numWord, pct, srcLabel, plural, listJoin } from './text';
export { srcLabel } from './text';

const prettyDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const builtPT = (d: Data) => new Date(d.summary.generated).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'long', timeStyle: 'short' });

/** the short methods block on the findings page: just enough to trust and reproduce the result */
export function methodsHtml(d: Data): string {
  const ix = index(d); const S = d.summary;
  const vig = d.urls.find((u) => u.includes('acvote')) || '';
  const zd = S.zeroDropped;
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
<li><strong>Endorsement:</strong> a name on a candidate’s endorsement page, on an organization’s own list or in a candidate statement in the <a href="${esc(vig)}" rel="noopener" target="_blank">county voter guide</a>, as of ${esc(prettyDate(S.accessDates[0]))}. Where an organization publishes its own list, that list is the source. Excluded: the guide’s “I refer to the following residents” lists${S.nUnverifiedLeads ? ` and ${S.nUnverifiedLeads} claims no primary source confirms` : ''}.</li>
<li><strong>Similarly endorsed:</strong> a standard clustering program (Louvain, networkx) sorted the group endorsement network into groups ${S.nRuns.toLocaleString('en-US')} times on shuffled input, leaving out endorsers of a single candidate. The percent for two candidates is the share of runs that put them in the same group.${ix.slate ? ` The slate counts as one participant, linked to its ${numWord(ix.slateMembers.length)} members.` : ''}</li>
<li><strong>Caveat:</strong> campaign pages are self-reported and range from zero to ${Math.max(...d.nodes.filter((n) => n.isTarget).map((n) => n.inDeg))} names, so long lists look more central. An endorsement is a public signal, not money or votes.</li>
</ul>
<h2 id="data">Data</h2>
<ul class="downloads">${nodl}<li><a href="/data/graph.json" download>Analysis (JSON)</a></li><li><a href="/data/METHODS.md" download>Full methods</a></li></ul>
<p class="small muted">${extra ? `${extra} ` : ''}${S.nZeroEndorsersDropped && zd ? `The endorsers table omits ${S.nZeroEndorsersDropped} names that endorse no one: ${zd.pamphletOnly} appear only in the excluded lists, ${zd.candidates} are candidates${zd.other ? `, ${zd.other} other` : ''}. ` : ''}Built ${esc(builtPT(d))} Pacific time.</p>`;
}

/** the long version, published as a download (plain Markdown) */
export function methodsMarkdown(d: Data): string {
  const ix = index(d); const S = d.summary;
  const nm = (id: string) => ix.byId.get(id)?.name ?? id;
  const orgUrls = [...new Set(d.edges.flatMap((e) => e.src.filter((x) => x.pr).map((x) => d.urls[x.u])))];
  const labels = [...new Set(orgUrls.map(srcLabel))].sort();
  const orgs = labels.filter((l) => !/^Wayback Machine copy/i.test(l)); const archived = labels.filter((l) => /^Wayback Machine copy/i.test(l));
  const cites = Object.entries(S.edgeSourceTypeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k || 'unspecified'} (${v})`);
  const rc = Object.entries(S.rankCounts || {}).map(([k, v]) => `${v} “${k}”`);
  const typeList = Object.entries(S.typeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`);
  const nominators = d.edges.filter((e) => e.kind === 'member' && !/member/i.test(e.rel)).map((e) => nm(e.s));
  const cand = d.races.flatMap((r) => r.candidates.map((id) => { const n = ix.byId.get(id)!; return `| ${r.race} | ${n.name} | ${n.inDeg} | ${n.endorsementsPage || n.campaignUrl || '—'} |`; }));
  const wd = d.nodes.filter((n) => n.analysisEndorser);
  return `# Berkeley endorsements, November 2026: full methods

Generated ${builtPT(d)} Pacific time from the cleaned dataset. Every number below is computed from the published data.

## Sources

- Candidate campaign endorsement pages, candidate statements in the Alameda County Voter Information Guide, and the endorsement lists of ${orgs.length} organizations: ${orgs.join('; ')}.${archived.length ? ` For ${archived.length} of them an archived copy is also cited: ${archived.join('; ')}.` : ''}
- An organization’s own page is the primary source for its endorsements. Pages accessed ${S.accessDates.map(prettyDate).join(', ')}.
- edge_sources.csv: snapshot_path gives the file’s path inside source_snapshots.zip and is blank for captures not in the archive; snapshot_sha256 is kept for every capture.
- The ${S.nEndorsementEdges} endorsements cite these source types: ${cites.join(', ')}. Aggregator pages only corroborate; they never create an endorsement on their own.
- Excluded: the voter guide’s “I refer to the following residents” lists (${S.nPamphletRefsExcluded ?? 'n/a'} references to ${S.nPamphletPeople ?? 'n/a'} people)${S.nUnverifiedLeads ? `; ${S.nUnverifiedLeads} claims that no primary source confirms (unverified_leads.csv)${S.nUnlabelledMoved ? `, including ${S.nUnlabelledMoved} names on an unlabelled line of an organization’s page` : ''}` : ''}; testimonials not in an endorsement list; website navigation text. Only confirmed endorsements are drawn or analysed.
- Names were standardized. Actor types: ${typeList.join(', ')}. The printed title decides current versus former official.${rc.length ? ` Ranked-choice preferences printed by sources (${rc.join(', ')}) are kept as attributes; every endorsement counts equally.` : ''}
- Every endorsement cites at least one source with a URL and an access date; the numbered reference list on the findings page gives one entry per source document (${d.refs.length} in all).
- The ${ix.slate?.name ?? 'slate'} counts as one participant; its ${ix.slateMembers.length} members${nominators.length ? ` and ${nominators.join(', ')} (which nominated the slate)` : ''} are tied to it by slate links, which count in the similarity measure but are not endorsements.
${wd.length ? `- ${wd.map((n) => n.name).join(', ')} withdrew and ${wd.length > 1 ? 'are' : 'is'} analysed only as ${wd.length > 1 ? 'endorsers' : 'an endorser'}.\n` : ''}
## Similarly endorsed candidates

1. Network: undirected, unweighted, groups only. Groups with exactly one endorsement (${S.nGroupSingle} of ${S.nGroupEndorsers}) are removed, leaving ${S.nCore} actors and ${S.nCoreEdges} links.
2. Louvain clustering (networkx, resolution 1.0), ${S.pools} independent batches of ${S.runs.toLocaleString('en-US')} runs, node and edge order shuffled every run (${S.nRuns.toLocaleString('en-US')} runs in all).
3. For each pair of candidates, the share of runs that put them in the same group. A candidate's panel lists the three candidates with the highest shares. The groups themselves are not reported: they vary from run to run.

## Shared endorsers

The findings page uses raw counts of shared endorsers. graph.json (slateOverlap) also gives Jaccard similarity (shared endorsers ÷ endorsers of either candidate).${d.slateOverlap ? ` By Jaccard, the council candidate closest to the slate is ${nm(d.slateOverlap.council[0].t)} (${d.slateOverlap.council[0].j}); it stays first in ${pct(d.slateOverlap.top1Share)} of ${d.slateOverlap.resamples.toLocaleString('en-US')} bootstrap resamples of all endorsers (drawn with replacement, every list recomputed).` : ''}${d.slateOverlap?.nOthersMulti ? `\n\nBase rate: of the ${d.slateOverlap.nOthersMulti} endorsers who back two or more candidates but not the slate, the share backing each council candidate: ${d.slateOverlap.council.map((c) => `${nm(c.t)} ${pct(c.base ?? 0)}`).join(', ')}.` : ''}${d.slateOverlap?.leadBoot ? ` Resampling the slate's own backers ${d.slateOverlap.leadBoot.resamples.toLocaleString('en-US')} times (with replacement): ${nm(d.slateOverlap.leadBoot.a)} has more of them than ${nm(d.slateOverlap.leadBoot.b)} in ${pct(d.slateOverlap.leadBoot.aLeads)}, ties in ${pct(d.slateOverlap.leadBoot.tie)}; ${nm(d.slateOverlap.leadBoot.a)} has a majority in ${pct(d.slateOverlap.leadBoot.aMajority)}, ${nm(d.slateOverlap.leadBoot.b)} in ${pct(d.slateOverlap.leadBoot.bMajority)}.` : ''}

## Colour

Candidates are coloured by race and outlined; endorsers are coloured by type: unions, clubs and parties, and advocacy groups.

## Candidates

| Race | Candidate | Endorsements | Source page |
|---|---|---|---|
${cand.join('\n')}

## Caveats

Campaign pages are self-reported, vary in length and change over time. An endorsement is a public signal, not money, votes or organizing. Name matching can merge two people with the same name or split one person listed under different names.
`;
}

/** the full numbered reference list for the findings page: one entry per source document */
export function referencesHtml(d: Data) {
  const when = (at: string[]) => {
    if (!at.length) return 'Access date not recorded; corroborating source only.';
    const ds = [...new Set(at)].sort();
    return `Accessed ${ds.length === 1 ? prettyDate(ds[0]) : `${prettyDate(ds[0])} to ${prettyDate(ds[ds.length - 1])}`}.`;
  };
  return `<h2 id="refs">References</h2>
<ol class="reflist">${d.refs.map((r) => `<li id="ref-${r.n}"><span class="rt">${esc(r.title)}</span>. <a href="${esc(r.url)}" rel="noopener" target="_blank">${esc(r.url.replace(/^https?:\/\//, ''))}</a>. <span class="acc">${when(r.at)}</span></li>`).join('')}</ol>
<p class="credit-logo"><a href="https://logo.dev">Logos provided by Logo.dev</a></p>`;
}
