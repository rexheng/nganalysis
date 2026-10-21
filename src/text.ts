// Shared, data-driven prose. Every number, name and claim in here is computed from graph.json.
import type { Data, GNode, Community } from './types';

export const LETTERS = 'ABCDEFGHIJKLMNOP';
let PAL: string[] = ['#E69F00', '#332288', '#44AA99', '#882255', '#56B4E9', '#117733', '#0072B2'];
export const NONE = '#ffffff';           // in no robust coalition (drawn with an outline)
export const commColor = (c: number) => (c < 0 ? NONE : PAL[c % PAL.length]);
export const SLATE = 'Berkeley Right to Housing slate';

// actor types: a single-hue ramp (canvas) + shapes (text), never the coalition hues
export const TYPE_ORDER = ['Candidate', 'Candidate (withdrawn)', 'Slate', 'Democratic club', 'Political/advocacy org', 'Union',
  'Current elected official', 'Former elected official', 'Individual'];
export const TYPE_SHAPE: Record<string, string> = {
  'Candidate': '●', 'Candidate (withdrawn)': '○', 'Slate': '◆', 'Democratic club': '■', 'Political/advocacy org': '▲', 'Union': '▼',
  'Current elected official': '★', 'Former elected official': '☆', 'Individual': '•',
};
export const TYPE_RAMP: Record<string, string> = {
  'Candidate': '#1b1b1b', 'Candidate (withdrawn)': '#4a4a4a', 'Slate': '#1b1b1b', 'Democratic club': '#08306b', 'Political/advocacy org': '#2171b5',
  'Union': '#4292c6', 'Current elected official': '#6baed6', 'Former elected official': '#9ecae1', 'Individual': '#c6dbef',
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
export const pct = (p: number) => `${Math.round(p * 100)}%`;
export const plural = (n: number, one: string, many = one + 's') => (n === 1 ? one : many);

function lum(h: string) {
  const c = (x: number) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(parseInt(h.slice(1, 3), 16)) + 0.7152 * c(parseInt(h.slice(3, 5), 16)) + 0.0722 * c(parseInt(h.slice(5, 7), 16));
}
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const onColor = (bg: string) => (contrast('#ffffff', bg) >= 4.5 ? '#ffffff' : '#111111');

export const srcLabel = (u: string) => {
  if (u.includes('acvote.alamedacountyca.gov')) return 'County voter guide (PDF)';
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; }
};
export const srcHref = (u: string, pg?: string) => (pg && /\.pdf$/i.test(u) ? `${u}#page=${encodeURIComponent(pg)}` : u);

export function index(d: Data) {
  if (d.summary.palette?.colors?.length) PAL = d.summary.palette.colors;
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

export const surname = (n: GNode) => (n.type === 'Slate' ? 'the slate' : n.name.replace(/"[^"]*"\s*/, '').trim().split(/\s+/).pop()!);
export const shortName = (n: GNode) => (n.type === 'Slate' ? n.name.replace(/^Berkeley /, '') : n.name.replace(/ "[^"]*"/, ''));
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

/** analysis camp of a target: its robust coalition, or the candidate on its own */
export const campOf = (n: GNode) => (n.community >= 0 ? `b${n.community}` : `t${n.id}`);
export const nCamps = (d: Data) => d.summary.nBlocs + d.summary.nLoose;

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
  return `Endorses ${parts.join('; ')}${groups.size >= 2 ? ` — ${numWord(groups.size)} of ${numWord(nCamps(d))} camps` : ''}.`;
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
  return d.bridges.filter((b) => b.robustReach).sort((a, b) => a.rankReach - b.rankReach || a.id.localeCompare(b.id));
}

export interface Texts {
  headline: string; dek: string; findings: string[]; title: string; description: string; statsLine: string;
  overviewAlt: string; overviewKey: string; graphSummary: string;
}

export function buildTexts(d: Data): Texts {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold;
  const N = (id: string) => ix.byId.get(id)!;
  const nRaces = d.races.filter((r) => r.candidates.length).length;
  const isCouncil = (n: GNode) => (n.race || '').startsWith('Council');
  const findings: string[] = [];
  const memberBloc = ix.slateMembers.length ? N(ix.slateMembers[0]).community : -1;

  // ---- Rent Board finding ----
  const rb: string[] = []; const rbSrc: GNode[] = [];
  const allies = new Map<string, number>();   // council candidate -> strongest co-grouping with the slate or its members
  if (ix.slate) {
    rbSrc.push(ix.slate);
    for (const t of d.coTargets) {
      const n = N(t); if (!isCouncil(n)) continue;
      const pS = ix.together(ix.slate.id, t);
      const pM = ix.slateMembers.length ? Math.min(...ix.slateMembers.map((m) => ix.together(m, t))) : 0;
      const p = Math.max(pS, pM);
      if (p >= T) allies.set(t, p);
    }
    if (memberBloc >= 0) {
      const c = d.communities[memberBloc];
      const council = c.targets.map(N).filter(isCouncil);
      council.forEach((n) => rbSrc.push(n));
      rb.push(`${chip(memberBloc)} The slate’s ${numWord(ix.slateMembers.length)} members${council.length ? ` and ${plural(council.length, 'council candidate')} ${listJoin(council.map((n) => `${nlink(n)} (${raceShort(n.race)})`))}` : ''} form a robust coalition: every pair is grouped together in at least ${pct(c.weakest.p)} of runs.`);
    }
    const sl = d.loose.find((l) => l.id === ix.slate!.id);
    if (sl) {
      const ps = sl.partners.filter((p) => p.p >= T && !N(p.t).memberOf);
      const psm = sl.partners.filter((p) => p.p >= T && N(p.t).memberOf);
      ps.forEach((p) => rbSrc.push(N(p.t)));
      const items = [...ps.map((p) => `${nlink(N(p.t))}${N(p.t).race ? ` (${raceShort(N(p.t).race)})` : ''} in ${pct(p.p)} of runs`),
        ...psm.map((p) => `slate member ${esc(N(p.t).name)} in ${pct(p.p)}`)];
      rb.push(`Endorsers listed for the slate as a whole are less settled. The slate page is grouped with ${listJoin(items)}, but not with every member of coalition ${LETTERS[memberBloc] ?? ''} in ${pct(T)} of runs.`);
    } else if (ix.slate.community >= 0 && ix.slate.community !== memberBloc) {
      rb.push(`The slate page sits in coalition ${chip(ix.slate.community)}.`);
    }
  }
  const otherRb = d.races.find((r) => r.race === 'Rent Board')?.candidates.map(N).filter((n) => n.type !== 'Slate' && !n.memberOf) || [];
  for (const n of otherRb) {
    rbSrc.push(n);
    if (n.community >= 0) {
      const c = d.communities[n.community]; const mates = c.targets.filter((t) => t !== n.id).map(N);
      mates.forEach((m) => rbSrc.push(m));
      rb.push(`${chip(n.community)} ${nlink(n)}, the Rent Board candidate not on the slate, shares a coalition with ${listJoin(mates.map((m) => `${nlink(m)}${m.race ? ` (${raceShort(m.race)})` : ''}`))}, together in ${c.targets.length > 2 ? 'at least ' : ''}${pct(c.weakest.p)} of runs.`);
    } else if (n.inDeg > 0) rb.push(`${nlink(n)}, the Rent Board candidate not on the slate, belongs to no robust coalition.`);
  }
  if (rb.length) findings.push(`<strong>Rent Board and council.</strong> ${rb.join(' ')}${sourcesLine(d, rbSrc.flatMap(pageSrc))}`);

  // ---- other coalitions + loose candidates ----
  const others = d.communities.filter((c) => c.id !== memberBloc && !c.targets.some((t) => otherRb.some((o) => o.id === t)));
  const looseNotSlate = d.loose.filter((l) => N(l.id).type !== 'Slate');
  if (others.length || looseNotSlate.length) {
    const parts = others.map((c) => `${chip(c.id)} ${listJoin(c.targets.map((t) => `${nlink(N(t))} (${raceShort(N(t).race)})`))}, ${c.targets.length > 2 ? 'every pair ' : ''}together in ${c.targets.length > 2 ? 'at least ' : ''}${pct(c.weakest.p)} of runs`);
    let s = `<strong>The other robust coalitions:</strong> ${semiJoin(parts)}.`;
    if (looseNotSlate.length) {
      const seenP = new Set<string>(); const bits: string[] = [];
      for (const l of looseNotSlate) {
        const p = l.partners[0]; const key = [l.id, p.t].sort().join('|');
        if (seenP.has(key)) continue; seenP.add(key);
        bits.push(`${esc(surname(N(l.id)))}’s most frequent partner, ${esc(N(p.t).name)}, is grouped with ${esc(surname(N(l.id)))} in ${pct(p.p)} of runs`);
      }
      s += ` ${cap(listJoin(looseNotSlate.map((l) => nlink(N(l.id)))))} ${looseNotSlate.length === 1 ? 'belongs' : 'belong'} to no robust coalition. ${cap(semiJoin(bits))}.`;
    }
    findings.push(s + sourcesLine(d, [...others.flatMap((c) => c.targets.map(N)), ...looseNotSlate.map((l) => N(l.id))].flatMap(pageSrc).slice(0, 4)));
  }

  // ---- candidates in the same race ----
  const rivalBits: string[] = []; const rivalSrc: GNode[] = [];
  for (const r of d.races) {
    const cs = r.candidates.map(N).filter((n) => d.coTargets.includes(n.id) && !n.memberOf && n.type !== 'Slate');
    const rb2: string[] = [];
    const wdEnd = new Map<GNode, GNode[]>();
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j]; const p = ix.together(a.id, b.id);
      const sameBloc = a.community >= 0 && a.community === b.community;
      const ab = (ix.out.get(a.id) || []).includes(b.id), ba = (ix.out.get(b.id) || []).includes(a.id);
      const wd = [a, b].find((n) => n.type === 'Candidate (withdrawn)');
      if (wd && (ab || ba) && (wd === a ? ab : ba)) {
        const other = wd === a ? b : a;
        if (!wdEnd.has(wd)) wdEnd.set(wd, []); wdEnd.get(wd)!.push(other); rivalSrc.push(wd, other);
      } else if (sameBloc && !wd && !/school|rent/i.test(r.race)) {
        rb2.push(`${nlink(a)} and ${nlink(b)}, running against each other for one seat, sit in the same coalition ${chip(a.community)}, grouped together in ${pct(p)} of runs${ab || ba ? ` (${esc((ab ? a : b).name)} endorses ${esc((ab ? b : a).name)})` : ''}`);
        rivalSrc.push(a, b);
      } else if (!sameBloc && p >= 0.5) {
        rb2.push(`${nlink(a)} and ${nlink(b)} are grouped together in ${pct(p)} of runs${p < T ? `, short of the ${pct(T)} bar for a robust coalition` : ''}${ab || ba ? ` (${esc((ab ? a : b).name)} endorses ${esc((ab ? b : a).name)})` : ''}`);
        rivalSrc.push(a, b);
      }
    }
    for (const [wd, os] of wdEnd) {
      const same = os.every((o) => o.community >= 0 && o.community === wd.community);
      rb2.unshift(`${nlink(wd)}, who has withdrawn, endorses ${listJoin(os.map((o) => nlink(o)))}${same ? `, and ${os.length === 1 ? 'the two form' : 'all of them are in'} coalition ${chip(wd.community)}` : ''}`);
    }
    if (rb2.length) rivalBits.push(`in ${esc(r.race)}, ${rb2.length > 1 ? semiJoin(rb2) : rb2[0]}`);
  }
  if (rivalBits.length) findings.push(`<strong>Candidates in the same race.</strong> ${cap(semiJoin(rivalBits))}.${sourcesLine(d, rivalSrc.flatMap(pageSrc).slice(0, 4))}`);

  // ---- bridges (robust only) ----
  const rob = robustBridges(d);
  const K = S.bootstrap.topK; const share = pct(S.bootstrap.robustShare);
  const bcTop = d.bridges.filter((b) => b.rankBc !== null && b.rankBc <= K).sort((a, b) => a.rankBc! - b.rankBc!);
  const bcRob = bcTop.filter((b) => b.robustBc); const bcFrag = bcTop.filter((b) => !b.robustBc && (b.bcLooWorst ?? 1e9) > K);
  if (rob.length) {
    const items = rob.map((b) => `${nlink(N(b.id), undefined, 'strong')} (${b.reach} of ${nCamps(d)} camps)`);
    let s = `<strong>The bridges that hold up.</strong> Counting how many camps (${numWord(S.nBlocs)} coalitions plus ${numWord(S.nLoose)} unattached candidates or slates) an endorser’s picks reach, ${numWord(rob.length)} ${plural(rob.length, 'endorser stays', 'endorsers stay')} in the top ${K} in at least ${share} of ${S.bootstrap.resamples} resamples and after removing any single endorsement: ${listJoin(items)}.`;
    if (bcRob.length || bcFrag.length) s += ` By the betweenness measure, ${bcRob.length ? `only ${listJoin(bcRob.map((b) => esc(N(b.id).name)))} ${bcRob.length === 1 ? 'passes' : 'pass'} the same test` : 'no endorser passes the same test'}${bcFrag.length ? `; ${listJoin(bcFrag.map((b) => esc(N(b.id).name)))} ${bcFrag.length === 1 ? 'drops' : 'drop'} out of the top ${K} when a single edge is removed, so we do not headline ${bcFrag.length === 1 ? 'it' : 'them'}` : ''}.`;
    // which single candidate do the fragile betweenness ranks hinge on? (computed: the candidate whose removal-of-edge knocks the most top-K bridges out)
    const hingeCount = new Map<string, number>();
    for (const b of bcTop) for (const o of b.bcLooOut ?? []) hingeCount.set(o.t, (hingeCount.get(o.t) ?? 0) + 1);
    const outsOf = new Map<string, Set<string>>();
    for (const e of d.edges) if (e.kind === 'endorsement') { if (!outsOf.has(e.s)) outsOf.set(e.s, new Set()); outsOf.get(e.s)!.add(e.t); }
    const uniq = (t: string) => { const en = d.edges.filter((e) => e.kind === 'endorsement' && e.t === t).map((e) => e.s); return { n: en.length, u: en.filter((x) => outsOf.get(x)!.size === 1).length }; };
    const hinges = [...hingeCount.entries()].filter(([, c]) => c >= 2).map(([t]) => ({ t, ...uniq(t) })).filter((h) => h.u / h.n >= 0.5).sort((a, b) => b.u / b.n - a.u / a.n);
    if (hinges.length) {
      const h = hinges[0];
      const hit = bcTop.filter((b) => (b.bcLooOut ?? []).some((o) => o.t === h.t)).map((b) => { const o = b.bcLooOut!.find((x) => x.t === h.t)!; return `${esc(N(b.id).name)} from #${b.rankBc} to ${o.rank ? '#' + o.rank : 'zero'}`; });
      s += ` Much of that fragility runs through ${nlink(N(h.t))}: ${h.u} of ${h.n} people and groups endorsing ${esc(surname(N(h.t)))} back no other candidate, so any endorser who also links ${esc(surname(N(h.t)))} to other camps sits on many shortest paths. Removing a single endorsement of ${esc(surname(N(h.t)))} drops the betweenness rank of ${listJoin(hit)}.`;
    }
    const srcs = keySources(d, (e) => e.kind === 'endorsement' && rob.slice(0, 3).some((b) => b.id === e.s), 3);
    findings.push(s + sourcesLine(d, srcs));
  }

  // ---- normalized overlap ----
  const raceOf = (id: string) => N(id).race;
  const cross = d.overlap.filter((o) => raceOf(o.a) && raceOf(o.b) && raceOf(o.a) !== raceOf(o.b) && !N(o.a).memberOf && !N(o.b).memberOf);
  const byJ = cross.slice().sort((a, b) => b.j - a.j).slice(0, 2);
  if (byJ.length) {
    const fmt = (o: typeof byJ[number]) => `${nlink(N(o.a))} (${raceShort(raceOf(o.a))}) and ${nlink(N(o.b))} (${raceShort(raceOf(o.b))}): ${o.n} shared endorsers, ${pct(o.j)} of their combined lists`;
    let s = `<strong>Across races, the most similar endorser lists</strong> belong to ${semiJoin(byJ.map(fmt))}.`;
    const longest = d.nodes.filter((n) => n.isTarget).sort((a, b) => b.inDeg - a.inDeg)[0];
    const byN = cross.slice().sort((a, b) => b.n - a.n).slice(0, 5);
    const k = byN.filter((o) => o.a === longest.id || o.b === longest.id).length;
    if (k >= 3) s += ` Raw counts point elsewhere: ${esc(longest.name)} appears in ${k === byN.length ? `all ${numWord(k)}` : `${numWord(k)} of the ${numWord(byN.length)}`} cross-race pairs with the most shared names, because that list is the longest (${longest.inDeg} names). We compare lists by share (Jaccard similarity), not raw counts.`;
    findings.push(s + sourcesLine(d, byJ.flatMap((o) => [N(o.a), N(o.b)]).flatMap(pageSrc)));
  }

  // ---- headline / dek ----
  const allyNames = [...allies.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => N(t));
  const topB = rob[0] ? N(rob[0].id) : null;
  const art = (n: GNode) => (/official|Individual|Candidate/.test(n.type) || /^the /i.test(n.name) ? '' : 'the ');
  const headline = allyNames.length
    ? `Berkeley’s Rent Board slate travels with ${plural(allyNames.length, 'council candidate')} ${listJoin(allyNames.map(surname))}`
    : 'Berkeley’s Rent Board slate stands apart from the council races';
  const dek = `We mapped ${S.nEndorsementEdges.toLocaleString('en-US')} endorsements from ${S.nEndorsers.toLocaleString('en-US')} people and groups in ${numWord(nRaces)} races. ${cap(numWord(S.nBlocs))} groups of candidates hold together in at least ${pct(T)} of ${S.seeds} clustering runs${topB ? `, and ${art(topB)}${topB.name} ${d.bridges.every((b) => b.id === topB.id || b.reach < rob[0].reach) ? 'reaches more camps than any other endorser' : 'ties for reaching the most camps'}` : ''}. Crossing camps is the norm: ${S.nCrossers} of ${S.nMulti} endorsers who back several candidates (${pct(S.nCrossers / S.nMulti)}) do it.`;

  // ---- overview figure key + alt ----
  const top3 = rob.slice(0, 3);
  const overviewKey = `<ul class="okey">${d.communities.map((c) => `<li>${chip(c.id)} <span>${esc(blocName(ix, c))}</span> <span class="muted">${c.targets.length > 2 && c.weakest.p < 1 ? "≥" : ""}${pct(c.weakest.p)}</span></li>`).join('')}
    <li><span class="chip none">–</span> <span>No robust coalition</span></li></ul>
    <ol class="obr">${top3.map((b) => `<li><span class="ring">${b.rankReach}</span> ${esc(N(b.id).name)} <span class="muted">· ${b.reach} of ${nCamps(d)} camps</span></li>`).join('')}</ol>
    <p class="small muted">Outlines enclose each robust coalition’s candidates; % = weakest pair’s co-grouping across ${S.seeds} runs. Rings: top bridges that hold up under resampling. One-candidate endorsers are omitted; lines are endorsements.</p>`;
  const overviewAlt = `Network diagram of the ${S.nCore} most connected candidates and endorsers. Outlines mark ${numWord(S.nBlocs)} robust coalitions: ${d.communities.map((c) => `${LETTERS[c.id]}, ${blocName(ix, c)}`).join('; ')}. White dots are actors in no robust coalition, including ${listJoin(d.loose.map((l) => N(l.id).name))}. Rings mark the top bridges: ${listJoin(top3.map((b) => `${N(b.id).name}, reaching ${b.reach} of ${nCamps(d)} camps`))}.`;
  const graphSummary = `Interactive network: ${S.nNodes} actors and ${S.nEndorsementEdges} endorsements. ${overviewAlt} Use search or the lists beside the graph to explore by keyboard.`;
  const statsLine = `${S.nEndorsementEdges.toLocaleString('en-US')} endorsements · ${S.nEndorsers} endorsers · ${S.nCandidates} candidates + 1 slate · ${nRaces} races`;
  return {
    headline, dek, findings, statsLine, overviewAlt, overviewKey, graphSummary,
    title: 'Who bridges Berkeley’s endorsement camps? | The Daily Californian',
    description: `${headline}. ${topB ? `${cap(art(topB))}${topB.name} spans the most camps. ` : ''}An interactive network of endorsements in the November 2026 Berkeley local election.`,
  };
}
