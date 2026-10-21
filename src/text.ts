// Shared, data-driven prose. Every number, name and claim in here is computed from graph.json.
import type { Data, GNode, Community, Ambig } from './types';

export const LETTERS = 'ABCDEFGHIJKLMNOP';
let PAL: string[] = ['#D55E00', '#332288', '#44AA99', '#661100', '#DDCC77', '#AA4499', '#117733'];
export const NONE = '#ffffff';           // in no robust coalition (drawn with an outline)
export const commColor = (c: number) => (c < 0 ? NONE : PAL[c % PAL.length]);
export const SLATE = 'Berkeley Right to Housing slate';

// actor types: a categorical palette kept separate from the coalition hues (+ shapes in text)
export const TYPE_ORDER = ['Candidate', 'Candidate (withdrawn)', 'Slate', 'Political party', 'Democratic club', 'Political/advocacy org', 'Union',
  'Current elected official', 'Former elected official', 'Individual'];
export const TYPE_SHAPE: Record<string, string> = {
  'Candidate': '●', 'Candidate (withdrawn)': '○', 'Slate': '◆', 'Political party': '⬟', 'Democratic club': '■', 'Political/advocacy org': '▲', 'Union': '▼',
  'Current elected official': '★', 'Former elected official': '☆', 'Individual': '•',
};
export const TYPE_RAMP: Record<string, string> = {
  'Candidate': '#1b1b1b', 'Candidate (withdrawn)': '#8c8c8c', 'Slate': '#1b1b1b', 'Political party': '#56B4E9', 'Democratic club': '#0072B2', 'Political/advocacy org': '#E69F00',
  'Union': '#009E73', 'Current elected official': '#CC79A7', 'Former elected official': '#7B3294', 'Individual': '#b8b8b8',
};

export const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function listJoin(a: string[], conj = 'and'): string {
  if (a.length <= 1) return a.join('');
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, ${conj} ${a[a.length - 1]}`;
}
export const semiJoin = (a: string[]) => (a.length <= 2 ? a.join(a.length === 2 ? '; and ' : '') : `${a.slice(0, -1).join('; ')}; and ${a[a.length - 1]}`);
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const numWord = (n: number) => (n >= 0 && n < NUM.length ? NUM[n] : String(n));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const pct = (p: number) => (p > 0 && p < 0.005 ? "<1%" : p < 1 && p >= 0.995 ? ">99%" : `${Math.round(p * 100)}%`);
export const plural = (n: number, one: string, many = one + 's') => (n === 1 ? one : many);

function lum(h: string) {
  const c = (x: number) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(parseInt(h.slice(1, 3), 16)) + 0.7152 * c(parseInt(h.slice(3, 5), 16)) + 0.0722 * c(parseInt(h.slice(5, 7), 16));
}
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const onColor = (bg: string) => (contrast('#ffffff', bg) >= 4.5 ? '#ffffff' : '#111111');

let LABELS = new Map<string, string>();
/** reader-facing name of a source page: the organization, the candidate's campaign site, or the county voter guide */
export const srcLabel = (u: string) => {
  const l = LABELS.get(u); if (l) return l;
  if (u.includes('acvote.alamedacountyca.gov')) return 'Alameda County voter guide';
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
};
export const srcHref = (u: string, pg?: string) => (pg && /\.pdf$/i.test(u) ? `${u}#page=${encodeURIComponent(pg)}` : u);

export function index(d: Data) {
  if (d.summary.palette?.colors?.length) PAL = d.summary.palette.colors;
  if (d.urlLabels) LABELS = new Map(d.urls.map((u, i) => [u, d.urlLabels[i]]));
  const byId = new Map<string, GNode>(d.nodes.map((n) => [n.id, n]));
  const byName = new Map<string, GNode>(d.nodes.map((n) => [n.name, n]));
  const out = new Map<string, string[]>(); const inn = new Map<string, string[]>();
  for (const e of d.edges) {
    if (e.kind === 'member') continue;
    if (!out.has(e.s)) out.set(e.s, []); out.get(e.s)!.push(e.t);
    if (!inn.has(e.t)) inn.set(e.t, []); inn.get(e.t)!.push(e.s);
  }
  const slate = d.nodes.find((n) => n.type === 'Slate' && n.isTarget);
  const slateMembers = d.nodes.filter((n) => slate && n.memberOf === slate.id).map((n) => n.id);
  const together = (a: string, b: string) => (a === b ? 1 : d.pairTogether[`${a}|${b}`] ?? d.pairTogether[`${b}|${a}`] ?? 0);
  return { byId, byName, out, inn, slate, slateMembers, together };
}
export type Ix = ReturnType<typeof index>;

export const surname = (n: GNode) => (n.type === 'Slate' ? 'the slate' : n.name.replace(/[“"][^”"]*[”"]\s*/, '').trim().split(/\s+/).pop()!);
export const shortName = (n: GNode) => (n.type === 'Slate' ? n.name.replace(/^Berkeley /, '') : n.name.replace(/ [“"][^”"]*[”"]/, ''));
export const raceShort = (r?: string) => (r || '').replace('Council ', '');

/** "Shanoski–Park–Brown" or "Micael + 5 slate members" */
export function blocName(ix: Ix, c: Community) {
  const anchors = c.anchors.map((a) => ix.byId.get(a)!);
  const mem = c.targets.filter((t) => ix.byId.get(t)!.memberOf).length;
  const base = anchors.map(surname).join('–');
  return mem ? `${base}${base ? ' + ' : ''}${mem} slate ${plural(mem, 'member')}` : base;
}
export const commName = (ix: Ix, d: Data, c: number) => (c < 0 ? 'No robust coalition' : `${LETTERS[c]} · ${blocName(ix, d.communities[c])}`);
export const chip = (c: number, title = '') =>
  c >= 0 ? `<span class="chip" style="--c:${commColor(c)};--t:${onColor(commColor(c))}"${title ? ` title="${esc(title)}"` : ''}>${LETTERS[c]}</span>`
    : `<span class="chip none"${title ? ` title="${esc(title)}"` : ''} aria-label="no robust coalition">–</span>`;
export const nlink = (n: GNode, label?: string, cls = '') => `<button class="nlink ${cls}" data-node="${esc(n.id)}">${esc(label ?? n.name)}</button>`;
export const typeGlyph = (t: string) => `<span class="tg" aria-hidden="true" title="${esc(t)}">${TYPE_SHAPE[t] || '•'}</span>`;

/** analysis camp of a target: its robust coalition (unattached candidates are not camps) */
export const campOf = (n: GNode) => (n.community >= 0 ? `b${n.community}` : `t${n.id}`);
export const nCamps = (d: Data) => d.summary.nBlocs;

export function campHtml(ix: Ix, d: Data, key: string, html = true) {
  if (key.startsWith('b')) { const c = +key.slice(1); return html ? chip(c, commName(ix, d, c)) : `coalition ${LETTERS[c]}`; }
  return html ? `<span class="chip none" title="not in a robust coalition">–</span>` : 'no coalition';
}

export function bridgeSentence(ix: Ix, d: Data, id: string, html = true): string {
  const outs = (ix.out.get(id) || []).map((t) => ix.byId.get(t)!);
  const groups = new Map<string, GNode[]>();
  for (const t of outs) { const k = campOf(t); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(t); }
  const parts = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, ts]) => {
    const names = listJoin(ts.map((t) => (html ? nlink(t) : t.name)));
    return html ? `${names} ${campHtml(ix, d, k)}` : `${names} (${campHtml(ix, d, k, false)})`;
  });
  if (!parts.length) return '';
  const nb = [...groups.keys()].filter((k) => k.startsWith('b')).length;
  return `Endorses ${parts.join('; ')}${nb >= 1 ? ` (${numWord(nb)} of the ${numWord(nCamps(d))} coalitions)` : ''}.`;
}

/** up to k distinct sources behind a set of edges, primary (org's own page) first */
export function keySources(d: Data, filter: (e: Data['edges'][number]) => boolean, k = 3) {
  const seen = new Map<string, { u: string; pg?: string; pr: boolean; n: number }>();
  for (const e of d.edges) if (filter(e)) for (const x of e.src) {
    const u = d.urls[x.u]; const key = u + (x.pg || '');
    const cur = seen.get(key) || { u, pg: x.pg, pr: !!x.pr, n: 0 }; cur.n++; seen.set(key, cur);
  }
  return [...seen.values()].sort((a, b) => Number(b.pr) - Number(a.pr) || b.n - a.n).slice(0, k);
}
export function sourcesLine(d: Data, srcs: { u: string; pg?: string; pr: boolean }[]) {
  if (!srcs.length) return '';
  const uniq = new Map<string, { u: string; pg?: string; pr: boolean }>();
  for (const s of srcs) if (!uniq.has(s.u + (s.pg || ''))) uniq.set(s.u + (s.pg || ''), s);
  return ` <span class="fsrc">Sources: ${[...uniq.values()].map((s) => `<a href="${esc(srcHref(s.u, s.pg))}" target="_blank" rel="noopener">${esc(srcLabel(s.u))}${s.pg ? ` p.&nbsp;${esc(s.pg)}` : ''}</a>${s.pr ? ' <span class="prim">primary</span>' : ''}`).join(', ')}</span>`;
}
const pageSrc = (n: GNode) => (n.endorsementsPage || n.campaignUrl ? [{ u: (n.endorsementsPage || n.campaignUrl)!, pr: false }] : []);

export function robustBridges(d: Data) {
  return d.bridges.filter((b) => b.robustReach).sort((a, b) => a.rankReach - b.rankReach || b.deg - a.deg || a.id.localeCompare(b.id));
}
/** source lines prefer primary pages (an organization's own list) */
export function primaryFirst(d: Data, filter: (e: Data['edges'][number]) => boolean, k = 3) {
  const all = keySources(d, filter, 50); const pr = all.filter((x) => x.pr);
  return (pr.length ? pr : all).slice(0, k);
}

export interface Texts {
  headline: string; dek: string; findings: string[]; title: string; description: string; statsLine: string;
  overviewAlt: string; overviewKey: string; graphSummary: string;
}

const pctRange = (a: number, b: number) => (Math.round(a * 100) === Math.round(b * 100) ? pct(a) : `${Math.round(Math.min(a, b) * 100)}%–${pct(Math.max(a, b))}`);

export function buildTexts(d: Data): Texts {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold; const BD = S.border ?? 0.05;
  const N = (id: string) => ix.byId.get(id)!;
  const nRaces = d.races.filter((r) => r.candidates.length).length;
  const findings: string[] = [];
  const nameRace = (n: GNode) => `${nlink(n)}${n.race && n.type !== 'Slate' ? ` (${esc(raceShort(n.race))})` : ''}`;
  const memberBloc = ix.slateMembers.length ? N(ix.slateMembers[0]).community : -1;
  const runsTxt = `${S.batches} independent batches of ${S.runs.toLocaleString('en-US')} runs`;
  const blocPct = (c: Community) => `${c.targets.length > 2 && c.weakest.p < 1 ? 'at least ' : ''}${pct(c.weakest.p)}`;

  // ---- headline: the slate page's endorser overlap with council candidates (no clustering involved) ----
  const so = d.slateOverlap;
  let headK = 0;
  if (so) for (const k of [1, 2, 3]) if ((so.topKShare[String(k)] ?? 0) >= 0.95) { headK = k; break; }
  const topCouncil = so ? so.council.slice(0, 3).map((c) => ({ ...c, n_: N(c.t) })) : [];
  const headline = so && headK
    ? `Rent Board slate’s backers overlap most with ${plural(headK, 'council candidate')} ${listJoin(topCouncil.slice(0, headK).map((c) => c.n_.name))}`
    : so ? `Rent Board slate’s backers overlap with council candidates ${listJoin(topCouncil.map((c) => surname(c.n_)))}`
      : 'Berkeley endorsement network, November 2026';

  // ---- finding 1: the slate ----
  if (so && ix.slate) {
    const sl = ix.slate;
    const items = topCouncil.map((c) => `${nameRace(c.n_)}: ${c.n} shared, ${pct(c.j)} of the two lists combined`);
    let s = `<strong>The Rent Board slate.</strong> ${so.nSlateEndorsers} people and groups endorse the ${esc(sl.name)} as a whole. Measured as a share of the combined lists, their names overlap most with ${semiJoin(items)}.`;
    s += so.top1Share >= 0.95 ? ` ${esc(topCouncil[0].n_.name)} stays first when the endorsers are resampled ${so.resamples.toLocaleString('en-US')} times.`
      : ` ${esc(topCouncil[0].n_.name)} stays first in ${pct(so.top1Share)} of ${so.resamples.toLocaleString('en-US')} resamples of the endorsers${headK >= 2 ? '' : `, and the order of ${esc(surname(topCouncil[1].n_))} and ${esc(surname(topCouncil[2].n_))} is not settled`}.`;
    if (memberBloc >= 0) {
      const c = d.communities[memberBloc];
      const others = c.targets.map(N).filter((n) => !n.memberOf);
      const mem = ix.slateMembers.map(N);
      const inDegs = mem.map((m) => m.inDeg);
      const zero = mem.filter((m) => m.inDeg === 0);
      const endorseOther = others.length ? mem.filter((m) => (ix.out.get(m.id) || []).includes(others[0].id)) : [];
      s += ` The slate’s ${numWord(mem.length)} members are a different story: ${others.length ? `with ${listJoin(others.map(nameRace))} they form coalition ${chip(memberBloc)}` : `they form coalition ${chip(memberBloc)}`} (every pair together in ${blocPct(c)} of runs).`;
      if (others.length && endorseOther.length) s += ` That grouping rests largely on the members’ own ties: ${endorseOther.length === mem.length ? `all ${numWord(mem.length)}` : `${numWord(endorseOther.length)} of the ${numWord(mem.length)}`} endorse ${esc(surname(others[0]))}, and each has ${Math.min(...inDegs)}–${Math.max(...inDegs)} endorsers of their own${(() => { const np = d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || '') && ix.slateMembers.includes(e.t)).length; return np ? `, counting ${numWord(np)} ${plural(np, 'endorsement')} rated “probable”` : ''; })()}${zero.length ? ` (${listJoin(zero.map((z) => esc(z.name)))} ${zero.length === 1 ? 'has' : 'have'} none)` : ''}.`;
      if (sl.community < 0) {
        const withMembers = mem.map((m) => ix.together(sl.id, m.id));
        const best = d.loose.find((l) => l.id === sl.id)?.partners.filter((p) => !N(p.t).memberOf)[0];
        s += ` The slate page itself belongs to no coalition${best ? `: it is grouped with ${esc(N(best.t).name)} in ${pct(best.p)} of runs` : ''} and with its own members in ${pctRange(Math.min(...withMembers), Math.max(...withMembers))}.`;
      }
    }
    const rbOthers = d.races.find((r) => r.race === 'Rent Board')?.candidates.map(N).filter((n) => n.type !== 'Slate' && !n.memberOf) || [];
    for (const n of rbOthers) {
      if (n.community >= 0) {
        const c = d.communities[n.community]; const mates = c.targets.filter((t) => t !== n.id).map(N);
        s += ` ${chip(n.community)} ${nlink(n)}, the Rent Board candidate not on the slate, is grouped with ${listJoin(mates.map(nameRace))} in ${blocPct(c)} of runs.`;
      } else if (n.inDeg > 0) s += ` ${nlink(n)}, the Rent Board candidate not on the slate, belongs to no coalition.`;
    }
    const srcs = [sl, ...topCouncil.map((c) => c.n_)].flatMap(pageSrc);
    findings.push(s + sourcesLine(d, srcs));
  }

  // ---- finding 2: the coalitions and the unattached ----
  {
    const others = d.communities.filter((c) => c.id !== memberBloc && !c.targets.some((t) => N(t).race === 'Rent Board' && !N(t).memberOf));
    const parts = others.map((c) => `${chip(c.id)} ${listJoin(c.targets.map((t) => nameRace(N(t))))}, ${c.targets.length > 2 ? 'every pair ' : ''}together in ${blocPct(c)} of runs${c.borderline ? ' (borderline)' : ''}`);
    let s = `<strong>The coalitions.</strong> We ran a standard community-detection method (Louvain) in ${runsTxt}, shuffling the input order each time, and kept only groups of candidates that every batch puts together in at least ${pct(T)} of runs. ${cap(numWord(S.nBlocs))} ${plural(S.nBlocs, 'group passes', 'groups pass')}.${parts.length ? ` Besides the two above: ${semiJoin(parts)}.` : ''}`;
    // ambiguous members (also tied to someone outside their coalition at or near the bar)
    for (const c of d.communities) {
      const outsiders = new Map<string, Ambig[]>();
      for (const a of c.ambiguous) { if (N(a.o).memberOf || N(a.o).type === 'Slate') continue; if (!outsiders.has(a.o)) outsiders.set(a.o, []); outsiders.get(a.o)!.push(a); }
      for (const [o, as] of outsiders) {
        if (as.length < c.targets.length) continue;   // only when tied to every member
        const ps = as.map((a) => a.p);
        const lo = d.loose.find((l) => l.id === o);
        const elsewhere = lo?.partners.filter((p) => !c.targets.includes(p.t) && p.p >= T) || [];
        s += ` ${nlink(N(o))} is grouped with ${listJoin(c.targets.map((t) => esc(surname(N(t)))))} in ${pctRange(Math.min(...ps), Math.max(...ps))} of runs${Math.max(...ps) < T + BD ? ' (borderline)' : ''}${elsewhere.length ? ` and with ${listJoin(elsewhere.map((p) => `${esc(N(p.t).name)} in ${pct(p.p)}`))}` : ''}, so ${esc(surname(N(o)))}’s place is not settled.`;
      }
    }
    // unattached candidates (excluding the slate page and anyone already discussed)
    const discussed = new Set<string>(d.communities.flatMap((c) => c.ambiguous.filter((a) => !N(a.o).memberOf).map((a) => a.o)));
    const loose = d.loose.filter((l) => N(l.id).type !== 'Slate');
    const near: string[] = []; const far: typeof loose = [];
    for (const l of loose) {
      if (discussed.has(l.id)) continue;
      const top = l.partners.filter((p) => Math.abs(p.p - l.best) <= 0.01 && N(p.t).type !== 'Slate');
      if (l.best >= T - BD && top.length) near.push(`${nlink(N(l.id))} is grouped with ${listJoin(top.map((p) => esc(N(p.t).name)))} in ${pct(l.best)} of runs${l.best < T ? `, just short of the ${pct(T)} bar` : ', but not consistently enough across batches'}`);
      else far.push(l);
    }
    if (near.length) s += ` ${cap(semiJoin(near))}.`;
    if (far.length) s += ` ${cap(listJoin(far.map((l) => nlink(N(l.id)))))} ${far.length === 1 ? 'is' : 'are'} not grouped with any candidate in more than ${pct(Math.max(...far.map((l) => l.best)))} of runs.`;
    const wd = d.nodes.filter((n) => n.analysisEndorser);
    for (const w of wd) s += ` ${nlink(w)}, who withdrew and has no endorsers, is treated as an endorser here (endorsing ${listJoin((ix.out.get(w.id) || []).map((t) => esc(N(t).name)))}).`;
    findings.push(s + sourcesLine(d, others.flatMap((c) => c.targets.map(N)).flatMap(pageSrc).slice(0, 4)));
  }

  // ---- finding 3: endorsers who span coalitions ----
  const rob = robustBridges(d);
  const K = S.bootstrap.topK;
  if (rob.length) {
    const tiers = new Map<number, typeof rob>();
    for (const b of rob) { if (!tiers.has(b.reach)) tiers.set(b.reach, []); tiers.get(b.reach)!.push(b); }
    const ts = [...tiers.entries()].sort((a, b) => b[0] - a[0]);
    const [r1, t1] = ts[0];
    const nm = (b: typeof rob[number]) => nlink(N(b.id), undefined, 'strong');
    let s = `<strong>Endorsers who span coalitions.</strong> Counting how many of the ${numWord(S.nBlocs)} coalitions an endorser’s picks reach (unattached candidates don’t count), ${t1.length > 1 ? `${numWord(t1.length)} endorsers tie at the top: ${listJoin(t1.map(nm))} each back` : `${nm(t1[0])} leads, backing`} candidates in ${numWord(r1)} of the ${numWord(S.nBlocs)}.`;
    if (ts.length > 1) s += ` ${cap(listJoin(ts.slice(1).map(([r, bs]) => `${listJoin(bs.map(nm))} ${bs.length === 1 ? 'reaches' : 'reach'} ${numWord(r)}`)))}.`;
    s += ` ${rob.length === 1 ? 'This ranking holds' : 'These rankings hold'} up: each stays in the top ${K} in at least ${pct(S.bootstrap.robustShare)} of ${S.bootstrap.resamples} re-runs that drop a random ${pct(S.bootstrap.dropShare)} of endorsements and redo the clustering from scratch, after removing any single endorsement, and when the ${numWord(d.edges.filter((e) => /probable/i.test(e.conf || '')).length)} endorsements rated “probable” are left out.`;
    const crossShare = S.nMulti ? S.nCrossers / S.nMulti : 0;
    if (S.nMulti) s += ` Among endorsers (not candidates) who back two or more coalition candidates, ${S.nCrossers} of ${S.nMulti} (${pct(crossShare)}) cross coalition lines${crossShare > 0.5 && crossShare < 0.6 ? ' — just over half' : ''}.`;
    // betweenness, as a caveat
    const bcTop = d.bridges.filter((b) => b.rankBc !== null && b.rankBc <= K).sort((a, b) => a.rankBc! - b.rankBc!);
    const bcRob = bcTop.filter((b) => b.robustBc); const bcFrag = bcTop.filter((b) => !b.robustBc && (b.bcLooWorst ?? 1e9) > K);
    if (bcRob.length || bcFrag.length) {
      s += ` A second measure, betweenness (how often an endorser sits on the shortest chain between two others), is less stable: ${bcRob.length ? `only ${listJoin(bcRob.map((b) => esc(N(b.id).name)))} ${bcRob.length === 1 ? 'stays' : 'stay'} in its top ${K} after any single endorsement is removed and without the endorsements rated “probable”` : `no endorser stays in its top ${K} after every single removal`}.`;
      const pd = bcTop.filter((b) => b.rankBcConf != null && b.rankBcConf !== b.rankBc && d.edges.some((e) => e.s === b.id && /probable/i.test(e.conf || '')));
      if (pd.length) s += ` ${cap(listJoin(pd.map((b) => { const k = d.edges.filter((e) => e.s === b.id && /probable/i.test(e.conf || '')).length; return `${esc(N(b.id).name)} ranks #${b.rankBc}, or #${b.rankBcConf} excluding its ${numWord(k)} probable ${plural(k, 'endorsement')}${!b.robustBc && b.bcLooWorstConf && b.bcLooWorstConf > K ? ` (and #${b.bcLooWorstConf} if one more endorsement is then removed)` : ''}`; })))}.`;
      const worstT = (b: typeof bcTop[number]) => (b.bcLooEdge ? b.bcLooEdge.find((x) => x !== b.id) : undefined);
      const ex = bcFrag.filter((b) => !N(b.id).type.includes('Individual') && worstT(b)).slice(0, 2);
      if (ex.length) s += ` For example, ${listJoin(ex.map((b) => `${esc(N(b.id).name)} falls from #${b.rankBc} to ${b.bcLooWorst ? '#' + b.bcLooWorst : 'unranked'} without its endorsement of ${esc(N(worstT(b)!).name)}`))}${ex.some((b) => b.robustReach) ? '' : ''}.`;
      const both = bcTop.filter((b) => !b.robustBc && b.robustReach);
      if (both.length) s += ` (${listJoin(both.map((b) => esc(N(b.id).name)))} ${both.length === 1 ? 'holds' : 'hold'} up on the coalition count, just not on betweenness.)`;
      const hubs = new Map<string, string[]>();
      for (const b of bcFrag) { const t = worstT(b); if (t && N(t).isTarget) { if (!hubs.has(t)) hubs.set(t, []); hubs.get(t)!.push(b.id); } }
      const hub = [...hubs.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      if (hub && hub[1].length >= 2) {
        const en = ix.inn.get(hub[0]) || []; const solo = en.filter((x) => (ix.out.get(x) || []).length === 1).length;
        s += ` ${cap(numWord(hub[1].length))} of the ${numWord(bcFrag.length)} drop-outs (${listJoin(hub[1].map((x) => esc(N(x).name)))}) hinge on an endorsement of ${esc(N(hub[0]).name)}, ${solo} of whose ${en.length} endorsers back no one else; that inflates betweenness and is a quirk of the measure, not a finding.`;
      }
    }
    const srcs = primaryFirst(d, (e) => e.kind === 'endorsement' && t1.some((b) => b.id === e.s), 3);
    findings.push(s + sourcesLine(d, srcs));
  }

  // ---- finding 4: normalized overlap across races ----
  const raceOf = (id: string) => N(id).race;
  const cross = d.overlap.filter((o) => raceOf(o.a) && raceOf(o.b) && raceOf(o.a) !== raceOf(o.b) && !N(o.a).memberOf && !N(o.b).memberOf && N(o.a).type !== 'Slate' && N(o.b).type !== 'Slate');
  const byJ = cross.slice().sort((a, b) => b.j - a.j).slice(0, 2);
  if (byJ.length) {
    const fmt = (o: typeof byJ[number]) => `${nameRace(N(o.a))} and ${nameRace(N(o.b))} (${o.n} shared endorsers, ${pct(o.j)} of their combined lists)`;
    let s = `<strong>Across races,</strong> the most similar endorser lists belong to ${semiJoin(byJ.map(fmt))}.`;
    const longest = d.nodes.filter((n) => n.isTarget).sort((a, b) => b.inDeg - a.inDeg)[0];
    const byN = cross.slice().sort((a, b) => b.n - a.n).slice(0, 5);
    const k = byN.filter((o) => o.a === longest.id || o.b === longest.id).length;
    if (k >= 3) s += ` By raw counts, ${esc(longest.name)} would dominate: ${k === byN.length ? `all ${numWord(k)}` : `${numWord(k)} of the ${numWord(byN.length)}`} cross-race pairs with the most shared names include ${esc(surname(longest))}, whose list is the longest (${longest.inDeg} names). That is why we compare shares, not counts.`;
    findings.push(s + sourcesLine(d, byJ.flatMap((o) => [N(o.a), N(o.b)]).flatMap(pageSrc)));
  }

  // ---- dek ----
  const top = rob.length ? rob.filter((b) => b.reach === rob[0].reach) : [];
  const nLooseCands = d.loose.filter((l) => N(l.id).type !== 'Slate').length;
  const nBorder = d.communities.filter((c) => c.borderline).length;
  const art = (n: GNode) => (/official|Individual|Candidate/.test(n.type) || /^the /i.test(n.name) ? '' : 'the ');
  const topNames = top.map((b) => `${art(N(b.id))}${N(b.id).name}`);
  const nProb = d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || '')).length;
  const probTxt = nProb ? ` (${numWord(nProb)} rated “probable”)` : '';
  const dek = `We mapped ${S.nEndorsementEdges.toLocaleString('en-US')} endorsements${probTxt} from ${S.nEndorsers.toLocaleString('en-US')} people and groups in ${numWord(nRaces)} races. ${cap(numWord(S.nBlocs))} groups of candidates hold together consistently across ${S.nRuns.toLocaleString('en-US')} clustering runs${nBorder ? ` (${numWord(nBorder)} only borderline)` : ''}; ${numWord(nLooseCands)} candidates fit none of them.${top.length ? ` ${top.length > 1 ? `${cap(listJoin(topNames.slice(0, 5)))}${top.length > 5 ? ` and ${top.length - 5} others` : ''} tie for endorsing across the most coalitions (${numWord(top[0].reach)} of ${numWord(S.nBlocs)})` : `${cap(topNames[0])} endorses across the most coalitions (${numWord(top[0].reach)} of ${numWord(S.nBlocs)})`}.` : ''}`;

  // ---- overview figure key + alt ----
  const ringed = rob.slice(0, 10);
  const slateNote = ix.slate && ix.slate.community < 0 && memberBloc >= 0
    ? ` The slate page is drawn outside coalition ${LETTERS[memberBloc]}: its endorsers overlap most with ${esc(topCouncil[0]?.n_.name ?? '')}’s, while its members cluster with ${listJoin(d.communities[memberBloc].targets.map(N).filter((n) => !n.memberOf).map((n) => esc(surname(n))))}.` : '';
  const overviewKey = `<ul class="okey">${d.communities.map((c) => `<li>${chip(c.id)} <span>${esc(blocName(ix, c))}</span> <span class="muted">${c.targets.length > 2 && c.weakest.p < 1 ? '≥' : ''}${pct(c.weakest.p)}${c.borderline ? ' · borderline' : ''}</span></li>`).join('')}
    <li><span class="chip none">–</span> <span>No coalition</span></li></ul>
    <p class="small"><strong>Rings: endorsers who span the most coalitions</strong>${top.length > 1 ? ` (1–${top.length} tie)` : ''}</p>
    <ol class="obr">${ringed.map((b, i) => `<li><span class="ring">${i + 1}</span> ${esc(N(b.id).name)} <span class="muted">· ${b.reach} of ${S.nBlocs}</span></li>`).join('')}</ol>
    <p class="small muted">Outlines enclose each coalition’s candidates; % = the weakest pair’s co-grouping, lowest across ${S.batches} batches of runs. One-candidate endorsers are omitted; lines are endorsements (dotted: ${numWord(d.edges.filter((e) => /probable/i.test(e.conf || '')).length)} rated “probable”; dashed: slate links).${slateNote}</p>`;
  const overviewAlt = `Network diagram of the ${S.nCore} most connected candidates and endorsers. Outlines mark ${numWord(S.nBlocs)} coalitions: ${d.communities.map((c) => `${LETTERS[c.id]}, ${blocName(ix, c)}`).join('; ')}. White dots are actors in no coalition, including ${listJoin(d.loose.map((l) => N(l.id).name))}. Numbered rings mark the endorsers who span the most coalitions: ${listJoin(ringed.map((b, i) => `${i + 1}, ${N(b.id).name} (${b.reach} of ${S.nBlocs})`))}.`;
  const graphSummary = `Interactive network: ${S.nNodes} actors and ${S.nEndorsementEdges} endorsements${probTxt}. ${overviewAlt} Use search or the lists beside the graph to explore by keyboard.`;
  const statsLine = `${S.nEndorsementEdges.toLocaleString('en-US')} endorsements${nProb ? ` (${nProb} probable)` : ''} · ${S.nEndorsers} endorsers · ${S.nCandidates} candidates + 1 slate · ${nRaces} races`;
  return {
    headline, dek, findings, statsLine, overviewAlt, overviewKey, graphSummary,
    title: 'Who backs whom in Berkeley’s November 2026 election | The Daily Californian',
    description: `${headline}. An interactive network of endorsements in the November 2026 Berkeley local election.`,
  };
}
