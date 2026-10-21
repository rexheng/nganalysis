// Shared, data-driven prose. Every number, name and claim in here is computed from graph.json.
import type { Data, GNode, Community } from './types';

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
  headline: string; findings: string[]; title: string; description: string; statsLine: string;
  overviewAlt: string; overviewKey: string; graphSummary: string;
}

/** percent, with one decimal when rounding would hide that a value sits just under the cutoff */
export const pctCut = (p: number, cut: number) => (p < cut && Math.round(p * 100) >= Math.round(cut * 100) ? `${(Math.floor(p * 1000) / 10).toFixed(1)}%` : pct(p));
const nProbOf = (d: Data) => d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || '')).length;
/** a share with and without the probable endorsements, as one number or a range */
export const pairPct = (p: number, pc: number, cut: number) => {
  const lo = Math.min(p, pc), hi = Math.max(p, pc);
  return pctCut(lo, cut) === pctCut(hi, cut) ? pctCut(lo, cut) : `${pctCut(lo, cut).replace('%', '')}–${pctCut(hi, cut)}`;
};

export function buildTexts(d: Data): Texts {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold; const BD = S.border ?? 0.05;
  const N = (id: string) => ix.byId.get(id)!;
  const nRaces = d.races.filter((r) => r.candidates.length).length;
  const nProb = nProbOf(d);
  const findings: string[] = [];
  const nameRace = (n: GNode) => `${nlink(n)}${n.race && n.type !== 'Slate' ? ` (${esc(raceShort(n.race))})` : ''}`;
  /** "School Board’s A, B and C" for shared races, "X (D7)" otherwise */
  const byRace = (ids: string[]) => {
    const g = new Map<string, GNode[]>();
    for (const id of ids) { const n = N(id); const r = n.race || ''; if (!g.has(r)) g.set(r, []); g.get(r)!.push(n); }
    return listJoin([...g.entries()].map(([r, ns]) => (ns.length > 1 && r ? `${esc(r)}’s ${listJoin(ns.map((n) => nlink(n)))}` : listJoin(ns.map(nameRace)))));
  };
  const memberBloc = ix.slateMembers.length ? N(ix.slateMembers[0]).community : -1;

  // ---- headline: measured overlap of the slate's endorser list with each council candidate's (no clustering) ----
  const so = d.slateOverlap;
  const topCouncil = so ? so.council.slice(0, 3).map((c) => ({ ...c, n_: N(c.t) })) : [];
  const headline = so && topCouncil.length ? `Rent Board slate’s backers overlap most with ${topCouncil[0].n_.name}’s` : 'Berkeley endorsement network, November 2026';

  // ---- 1. the slate ----
  if (so && ix.slate && topCouncil.length) {
    const sl = ix.slate; const [a, ...rest] = topCouncil;
    const s = `<strong>The slate.</strong> ${so.nSlateEndorsers} people and groups endorse the ${esc(sl.name)} as a whole. ${a.n} of them also endorse ${nameRace(a.n_)}: ${pct(a.j)} of everyone on either list.${rest.length ? ` Next: ${rest.map((c) => `${nameRace(c.n_)}, ${pct(c.j)}`).join('; ')}.` : ''}`;
    findings.push(s + sourcesLine(d, [sl, a.n_].flatMap(pageSrc)));
    if (memberBloc >= 0) {
      const c = d.communities[memberBloc];
      const others = c.targets.map(N).filter((n) => !n.memberOf);
      const mem = ix.slateMembers.map(N);
      const maxIn = Math.max(...mem.map((m) => m.inDeg));
      const zero = mem.filter((m) => m.inDeg === 0);
      const endorseOther = others.length ? mem.filter((m) => (ix.out.get(m.id) || []).includes(others[0].id)) : [];
      const npm = d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || '') && ix.slateMembers.includes(e.t)).length;
      let m = `<strong>The slate’s ${numWord(mem.length)} members</strong> cluster elsewhere: ${others.length ? `with ${listJoin(others.map(nameRace))}, as coalition ${chip(memberBloc)}` : `as coalition ${chip(memberBloc)}`}.`;
      if (others.length && endorseOther.length) m += ` That rests on their own picks: ${endorseOther.length === mem.length ? `all ${numWord(mem.length)}` : `${numWord(endorseOther.length)} of the ${numWord(mem.length)}`} endorse ${esc(surname(others[0]))}, and none has more than ${numWord(maxIn)} ${plural(maxIn, 'endorser')}${npm ? ` (${numWord(npm)} of them probable)` : ''}${zero.length ? `; ${listJoin(zero.map((z) => esc(z.name)))} ${zero.length === 1 ? 'has' : 'have'} none` : ''}.`;
      if (sl.community < 0) {
        const vs = d.variants.filter((v) => v.members.includes(sl.id));
        const where = (w: string[]) => {
          const conf = w.filter((k) => k.startsWith('conf')).length, all = w.length - conf;
          if (conf === S.pools && !all) return 'Without the probable endorsements';
          if (all === S.pools && !conf) return 'With all endorsements';
          if (w.length === 1) return `In one of ${numWord(S.pools)} batches${conf ? ' without the probable endorsements' : ''}`;
          return `In ${numWord(w.length)} of ${numWord(S.pools * 2)} checks`;
        };
        const who = (v: typeof vs[number]) => {
          const ms = v.members.filter((x) => x !== sl.id);
          return c.targets.every((x) => ms.includes(x)) && ms.length === c.targets.length ? 'its members' : listJoin(ms.map((x) => esc(surname(N(x)))));
        };
        m += vs.length ? ` The slate page itself moves: ${listJoin(vs.map((v) => `${where(v.where).replace(/^./, (x) => x.toLowerCase())} it joins ${who(v)}`))}. We leave it unattached.` : ' The slate page itself fits no coalition.';
      }
      findings.push(m);
    }
  }

  // ---- 2. coalitions ----
  {
    const items = d.communities.map((c) => `${chip(c.id)} ${byRace(c.targets)}: ${pct(Math.min(c.mean, c.meanConf))}${c.borderline ? ', borderline' : ''}`);
    let s = `<p><strong>${cap(numWord(S.nBlocs))} ${plural(S.nBlocs, 'coalition')}.</strong> A clustering program sorts the network into groups so that most endorsements fall inside one. Its answer shifts between runs, so we ran it ${S.nRuns.toLocaleString('en-US')} times and counted how often each pair of candidates landed together. A coalition is a set that lands together at least ${pct(T)} of the time, on average, in every check:</p><ul class="coal-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    let bl = '';
    for (const c of d.communities.filter((x) => x.borderline)) {
      const w = c.weakest;
      bl += `${chip(c.id)} is borderline: ${esc(surname(N(w.a)))} and ${esc(surname(N(w.b)))} land together only ${pct(w.p)} of the time${w.pConf < w.pPooled - 0.005 ? ' without the probable endorsements' : ''}. `;
    }
    findings.push(s + (bl ? `<p>${bl.trim()}</p>` : ''));
  }

  // ---- 3. unattached candidates ----
  {
    const loose = d.loose.filter((l) => N(l.id).type !== 'Slate');
    const near = loose.filter((l) => Math.max(l.best, l.bestConf) >= T - BD);
    const far = loose.filter((l) => !near.includes(l));
    const parts: string[] = [];
    for (const l of near) {
      const top = l.partners.filter((p) => Math.max(p.p, p.pConf) >= Math.max(l.best, l.bestConf) - 0.01 && N(p.t).type !== 'Slate');
      if (top.length) parts.push(`${nlink(N(l.id))} with ${listJoin(top.map((p) => esc(surname(N(p.t)))))}, ${pairPct(Math.min(...top.map((p) => p.p)), Math.min(...top.map((p) => p.pConf)), T)}`);
    }
    let s = `<strong>${cap(numWord(loose.length))} ${plural(loose.length, 'candidate')}</strong> with endorsements fit no coalition.`;
    if (parts.length) s += ` Closest: ${semiJoin(parts)}.`;
    if (far.length) s += ` ${cap(listJoin(far.map((l) => nlink(N(l.id)))))} never ${far.length === 1 ? 'tops' : 'top'} ${pct(Math.max(...far.map((l) => Math.max(l.best, l.bestConf))))} with anyone.`;
    const none = d.nodes.filter((n) => n.isTarget && n.type !== 'Slate' && !n.analysisEndorser && n.inDeg === 0 && !n.memberOf);
    if (none.length) s += ` ${cap(listJoin(none.map(nameRace)))} ${none.length === 1 ? 'has' : 'have'} no endorsements on record.`;
    for (const w of d.nodes.filter((n) => n.analysisEndorser)) s += ` ${nameRace(w)} withdrew and counts only as an endorser.`;
    findings.push(s);
  }

  // ---- 4. endorsers who span coalitions ----
  const rob = robustBridges(d);
  const K = S.bootstrap.topK;
  if (rob.length) {
    const tiers = new Map<number, typeof rob>();
    for (const b of rob) { if (!tiers.has(b.reach)) tiers.set(b.reach, []); tiers.get(b.reach)!.push(b); }
    const ts = [...tiers.entries()].sort((a, b) => b[0] - a[0]);
    const nm = (b: typeof rob[number]) => nlink(N(b.id), undefined, 'strong');
    const tierTxt = ([r, bs]: [number, typeof rob], first: boolean) => bs.length === 1
      ? `${nm(bs[0])} backs candidates in ${numWord(r)}${first ? ` of the ${numWord(S.nBlocs)} coalitions` : ''}`
      : `${listJoin(bs.map(nm))} each reach ${numWord(r)}${first ? ` of the ${numWord(S.nBlocs)} coalitions` : ''}`;
    let s = `<strong>Endorsers who span coalitions.</strong> ${cap(tierTxt(ts[0], true))}.${ts.length > 1 ? ` ${cap(ts.slice(1).map((t) => tierTxt(t, false)).join('. '))}.` : ''}`;
    s += ` ${rob.length === 1 ? 'It stays' : `All ${numWord(rob.length)} stay`} in the top ${K} under every robustness test in the methods.`;
    findings.push(s + sourcesLine(d, primaryFirst(d, (e) => e.kind === 'endorsement' && ts[0][1].some((b) => b.id === e.s), 2)));
  }

  // ---- overview figure key + alt ----
  const ringed = rob.slice(0, 10);
  const tieTop = rob.filter((b) => b.reach === rob[0]?.reach).length;
  const overviewKey = `<ul class="okey">${d.communities.map((c) => `<li>${chip(c.id)} <span>${esc(blocName(ix, c))}</span> <span class="muted">${pct(Math.min(c.mean, c.meanConf))}${c.borderline ? ' · borderline' : ''}</span></li>`).join('')}
    <li><span class="chip none">–</span> <span>No coalition</span></li></ul>
    <p class="small"><strong>Rings: endorsers who span the most coalitions</strong>${tieTop > 1 ? ` (1–${tieTop} tie)` : ''}</p>
    <ol class="obr">${ringed.map((b, i) => `<li><span class="ring">${i + 1}</span> ${esc(N(b.id).name)} <span class="muted">· ${b.reach} of ${S.nBlocs}</span></li>`).join('')}</ol>
    <p class="small muted">One-candidate endorsers omitted. Dotted: probable endorsement. Dashed: slate link.</p>`;
  const overviewAlt = `Network diagram of the ${S.nCore} most connected candidates and endorsers. Outlines mark ${numWord(S.nBlocs)} coalitions: ${d.communities.map((c) => `${LETTERS[c.id]}, ${blocName(ix, c)}`).join('; ')}. White dots fit no coalition, including ${listJoin(d.loose.map((l) => N(l.id).name))}. Numbered rings: ${listJoin(ringed.map((b, i) => `${i + 1}, ${N(b.id).name} (${b.reach} of ${S.nBlocs})`))}.`;
  const graphSummary = `Interactive network of ${S.nNodes} candidates and endorsers and ${S.nEndorsementEdges} endorsements${nProb ? ` (${nProb} probable)` : ''}. ${overviewAlt} Use search or the side panel to explore by keyboard.`;
  const statsLine = `${S.nEndorsementEdges.toLocaleString('en-US')} endorsements${nProb ? ` (${nProb} probable)` : ''} · ${S.nEndorsers} endorsers · ${S.nCandidates} candidates + 1 slate · ${nRaces} races`;
  return {
    headline, findings, statsLine, overviewAlt, overviewKey, graphSummary,
    title: 'Who backs whom in Berkeley’s November 2026 election | The Daily Californian',
    description: `${headline}. An interactive network of endorsements in Berkeley’s November 2026 election.`,
  };
}
