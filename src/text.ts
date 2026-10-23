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

/** two letters for an avatar without a photo: first and last name ("Igor A. Tregub" -> "IT") */
export const initials = (n: GNode) => { const w = n.name.replace(/[“"][^”"]*[”"]/g, ' ').replace(/[^\p{L}\s'’-]/gu, ' ').trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
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

/** source lines prefer primary pages (an organization's own list) */
export function primaryFirst(d: Data, filter: (e: Data['edges'][number]) => boolean, k = 3) {
  const all = keySources(d, filter, 50); const pr = all.filter((x) => x.pr);
  return (pr.length ? pr : all).slice(0, k);
}

export interface Texts {
  headline: string; findings: string[]; title: string; description: string; statsLine: string;
  overviewAlt: string; overviewKey: string; graphSummary: string; strip: string;
}

/** percent, with one decimal when rounding would hide that a value sits just under the cutoff */
export const pctCut = (p: number, cut: number) => (p < cut && Math.round(p * 100) >= Math.round(cut * 100) ? `${(Math.floor(p * 1000) / 10).toFixed(1)}%` : pct(p));
/** "clear margin" or "thin margin": does the weakest pair clear the cutoff by the border? */
export const marginLabel = (d: Data, c: Community) => (c.weakest.p < d.summary.robustThreshold + (d.summary.border ?? 0.05) ? 'thin margin' : 'clear margin');
export const weakPct = (d: Data, c: Community) => pctCut(c.weakest.p, d.summary.robustThreshold + (d.summary.border ?? 0.05));
/** data survival as a 95% range over the 10%-drop resamples, e.g. "51–65%" */
export const intactRange = (c: Community) => {
  if (c.intactLo === undefined || c.intactHi === undefined) return '';
  const lo = Math.floor(c.intactLo * 100), hi = Math.ceil(c.intactHi * 100);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
};
/** the one note worth adding to a coalition's survival figure: who most often joins it, or that it often splits */
export function intactNote(d: Data, ix: Ix, c: Community) {
  const B = c.boots || 0; if (!B) return '';
  const j = (c.joiners || [])[0];
  const sp = (c.split || 0) / B, jn = j ? j.n / B : 0;
  if (Math.max(sp, jn) < 0.25) return '';
  if (sp > jn && (sp < 0.5 || (c.intact ?? 0) / B < 0.05)) return '';   // 'often splits' only when it adds to the survival figure
  const jname = (t: string) => { const n = ix.byId.get(t)!; return n.type === 'Slate' ? 'the slate' : surname(n); };
  const j2 = (c.joiners || [])[1];
  if (jn >= sp && j) return `${jname(j.t)}${j2 && j2.n >= 0.5 * j.n ? ` or ${jname(j2.t)}` : ''} often joins`;
  return 'often splits';
}
/** survival in plain words (the 95% interval lives in METHODS.md): "about half the tries", "70%", "1 try in 10" */
export function intactWords(c: Community, firstSmall: boolean) {
  const B = c.boots || 0; if (!B || c.intact === undefined) return '';
  const sh = c.intact / B, r = Math.round(sh * 100);
  if (sh >= 0.45 && sh <= 0.55) return 'about half the tries';
  if (sh >= 0.05 && sh < 0.25) return `1 ${firstSmall ? 'try ' : ''}in ${Math.round(1 / sh)}`;
  return `${r}%`;
}
/** shared endorsers between the slate and every other candidate, by raw count */
export function slateShares(d: Data, ix: Ix) {
  const sl = ix.slate; if (!sl) return null;
  const sE = new Set(ix.inn.get(sl.id) || []);
  const rows = d.nodes.filter((n) => n.isTarget && n.id !== sl.id && !n.analysisEndorser)
    .map((n) => ({ n, k: new Set((ix.inn.get(n.id) || []).filter((x) => sE.has(x))).size }))
    .filter((x) => x.k > 0).sort((a, b) => b.k - a.k || a.n.name.localeCompare(b.n.name));
  return { sl, nS: sE.size, rows };
}
/** loose candidates whose weakest pair with some coalition is within the border below the cutoff */
export function nearMisses(d: Data) {
  const T = d.summary.robustThreshold, BD = d.summary.border ?? 0.05;
  return d.loose.filter((l) => l.nearBloc !== undefined && l.nearMin! >= T - BD)
    .map((l) => ({ l, v: l.nearMin!, c: l.nearBloc! })).sort((a, b) => b.v - a.v);
}

export function buildTexts(d: Data): Texts {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold;
  const N = (id: string) => ix.byId.get(id)!;
  const nRaces = d.races.filter((r) => r.candidates.length).length;
  const findings: string[] = [];
  const nameRace = (n: GNode) => `${nlink(n)}${n.race && n.type !== 'Slate' ? ` (${esc(raceShort(n.race))})` : ''}`;
  const memberBloc = ix.slateMembers.length ? N(ix.slateMembers[0]).community : -1;
  const sameBloc = ix.slateMembers.every((m) => N(m).community === memberBloc);
  const so = d.slateOverlap;

  // ---- headline + lede: raw counts of shared backers (no clustering), with the base rate ----
  const sh = slateShares(d, ix);
  const top3 = sh ? sh.rows.slice(0, 3) : [];
  const slRace = sh?.sl.race || '';
  let headline = 'Berkeley endorsement network, November 2026';
  let strip = '';
  if (sh && top3.length) {
    const [a, b] = top3;
    const lb = so?.leadBoot;
    const aSure = !b || b.k < a.k && (!lb || lb.a !== a.n.id || lb.aLeads >= 0.95);
    const maj = (r?: typeof a) => !!r && r.k * 2 > sh.nS;
    if (maj(a) && (aSure || !maj(b))) headline = `Most of the ${slRace} slate’s backers also back ${a.n.name}`;
    else if (maj(a) && maj(b)) headline = `Most of the ${slRace} slate’s backers also back ${a.n.name} and ${b.n.name}`;
    else if (aSure) headline = `The ${slRace} slate shares the most backers with ${a.n.name}`;
    let p = `Of the ${nlink(sh.sl, 'slate’s')} ${sh.nS} backers, ${listJoin(top3.map((r, i) => `${r.k}${i === 0 ? ' also back' : ''} ${nlink(r.n)}`))}.`;
    const base = top3.map((r) => so?.council.find((c) => c.t === r.n.id));
    if (so && base.every((b) => b && b.base !== undefined)) {
      p += ` Among other multi-candidate endorsers, ${listJoin(top3.map((r, i) => `${pct(base[i]!.base ?? 0)}${i === 0 ? ' back' : ''} ${esc(surname(r.n))}`))}.`;
      // the candidate whose list is shortest yet most drawn from the slate's
      const rows = top3.map((r, i) => ({ r, c: base[i]! }));
      const g = rows.slice().sort((x, y) => x.c.nList - y.c.nList)[0];
      if (g && g.r.k * 2 > g.c.nList && rows.every((x) => x === g || x.c.nList > g.c.nList)) p += ` ${esc(surname(g.r.n))} has only ${g.c.nList} backers, but ${g.r.k} of them also back the slate.`;
    }
    findings.push(p);
    // headline graphic: of the slate's backers, how many back each council candidate; tick = base rate
    if (so) {
      const rowsC = so.council.slice().sort((x, y) => y.n - x.n || N(x.t).name.localeCompare(N(y.t).name));
      const hl = new Set(top3.filter((r) => headline.includes(r.n.name)).map((r) => r.n.id));   // bars for the candidates the headline names
      const W = (v: number) => `${((100 * v) / sh.nS).toFixed(2)}%`;
      strip = `<figure class="strip" aria-labelledby="strip-cap"><div class="strip-rows" role="img" aria-label="${esc(rowsC.map((c) => `${N(c.t).name}: ${c.n} of ${sh.nS}; other endorsers ${pct(c.base ?? 0)}`).join('. '))}">${rowsC.map((c) => `<div class="srow${hl.has(c.t) ? ' hl' : ''}" aria-hidden="true"><span class="sname">${esc(surname(N(c.t)))}</span><span class="sbar"><i style="width:${W(c.n)}"></i>${c.base !== undefined ? `<b style="left:${W(c.base * sh.nS)}"></b>` : ''}<span class="snum" style="left:${W(c.n)}">${c.n}</span></span></div>`).join('')}</div><figcaption id="strip-cap">Bars: how many of the slate’s ${sh.nS} backers also back each council candidate. Ticks: the share of other multi-candidate endorsers who do.</figcaption></figure>`;
    }
  }

  // ---- the slate's members ----
  if (sh && memberBloc >= 0 && sameBloc) {
    const c = d.communities[memberBloc];
    const others = c.targets.map(N).filter((n) => !n.memberOf);
    const mem = ix.slateMembers.map(N);
    const nBack = new Set(mem.flatMap((m) => ix.inn.get(m.id) || [])).size;
    const nIn = mem.reduce((acc, m) => acc + m.inDeg, 0);
    const least = d.communities.every((x) => x.id === c.id || (x.intactShare ?? 1) > (c.intactShare ?? 0));
    let m = `In our clustering, the slate’s ${numWord(mem.length)} members group with ${listJoin(others.map((n) => nlink(n)))} as coalition ${chip(memberBloc)}.`;
    void least;
    const endorsesAll = others.length === 1 && mem.every((mm) => (ix.out.get(mm.id) || []).includes(others[0].id));
    if (endorsesAll) m += ` Each member endorses ${esc(surname(others[0]))}.`;
    if (others.length && nIn <= 2 * mem.length) {
      const backs = [...new Set(mem.flatMap((mm) => ix.inn.get(mm.id) || []))].map(N).sort((x, y) => x.name.localeCompare(y.name));
      m += ` Only ${listJoin(backs.map((n, i) => `${i === 0 && !/^(Individual|Current elected official|Former elected official|Candidate)/.test(n.type) ? 'the ' : ''}${nlink(n)}`))} endorse${backs.length === 1 ? 's' : ''} members individually.`;
    }
    findings.push(m);
  } else if (sh && ix.slateMembers.length) {
    // the slate's members split across coalitions: say where the slate page and each member land
    const by = new Map<number, GNode[]>();
    for (const m of ix.slateMembers.map(N)) { if (!by.has(m.community)) by.set(m.community, []); by.get(m.community)!.push(m); }
    const sc = sh.sl.community;
    const parts = [...by.entries()].sort((x, y) => (y[0] === sc ? 1 : 0) - (x[0] === sc ? 1 : 0) || x[0] - y[0]).map(([c, ms]) => {
      const outsiders = c >= 0 ? d.communities[c].targets.map(N).filter((n) => !n.memberOf && n.type !== 'Slate') : [];
      const who = listJoin(ms.map((m) => nlink(m, surname(m))));
      if (c < 0) return `${who} ${ms.length === 1 ? 'fits' : 'fit'} no coalition`;
      if (c === sc) return `the slate page, ${who}${outsiders.length ? ` group with ${listJoin(outsiders.map((n) => nlink(n)))}` : ''} as coalition ${chip(c)}`;
      return `${who} form${ms.length === 1 ? 's' : ''} coalition ${chip(c)}${outsiders.length ? ` with ${listJoin(outsiders.map((n) => nlink(n)))}` : ''}`;
    });
    findings.push(`In our clustering, the slate splits: ${parts.join('; ')}.`);
  }

  // ---- coalitions ----
  {
    let small = true;
    const items = d.communities.map((c) => {
      const note = intactNote(d, ix, c); const sh = (c.intact ?? 0) / (c.boots || 1);
      const w = intactWords(c, small); if (sh >= 0.05 && sh < 0.25) small = false;
      return `${chip(c.id)} ${listJoin(c.targets.map((t) => nlink(N(t), surname(N(t)))))}: ${weakPct(d, c)}, ${marginLabel(d, c)}; intact in ${w}${note ? ` (${esc(note)})` : ''}`;
    });
    const bg = Object.entries(S.bootGroups || {}).map(([k, v]) => [+k, v] as [number, number]);
    const nb = bg.reduce((acc, x) => acc + x[1], 0);
    let frag = '';
    if (nb) {
      const all = S.bootIntactAll ?? 0;
      const surv = all === 0 ? `all ${numWord(S.nBlocs)} groups survive together in none of them` : all / nb <= 0.02 ? `the ${numWord(S.nBlocs)} groups almost never all survive` : `all ${numWord(S.nBlocs)} groups survive together in ${all} of them`;
      frag = ` Drop a random tenth of the endorsements and redo the clustering ${nb} times: ${surv}.`;
    }
    findings.push(`<p><strong>${cap(numWord(S.nBlocs))} ${plural(S.nBlocs, 'coalition')}.</strong> A clustering program sorts the network into groups so that most endorsements fall inside one; we ran it ${S.nRuns.toLocaleString('en-US')} times. A coalition is a set of candidates in which every pair is grouped together at least ${pct(T)} of the time. Each figure is the group’s weakest pair; under ${pct(T + (S.border ?? 0.05))} is a thin margin.${frag}</p><ul class="coal-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`);
    // every unattached candidate is named: near-misses first, then the closest of the rest, then the others' ceiling
    const nm = nearMisses(d);
    const tail: string[] = [];
    const nmIds = new Set(nm.map((x) => x.l.id));
    const BD = T + (S.border ?? 0.05);
    const looseC = d.loose.filter((l) => N(l.id).type !== 'Slate');
    const zeroEnd = d.nodes.some((n) => n.isTarget && n.type !== 'Slate' && !n.analysisEndorser && n.inDeg === 0 && !n.memberOf);
    const best = (l: typeof d.loose[number]) => l.partners.slice().sort((x, y) => y.p - x.p)[0];   // most similarly endorsed candidate
    const far = looseC.filter((l) => !nmIds.has(l.id)).map((l) => ({ l, p: best(l) })).filter((x) => x.p)
      .sort((x, y) => y.p!.p - x.p!.p);
    if (looseC.length) {
      const parts: string[] = [];
      for (const x of nm) if (N(x.l.id).type !== 'Slate') parts.push(`${nlink(N(x.l.id))} falls just short of ${chip(x.c)} (${pctCut(x.v, T)})`);
      if (far.length) { const f0 = far[0]; parts.push(`${nlink(N(f0.l.id))} is grouped with ${esc(surname(N(f0.p!.t)))} in ${pct(f0.p!.p)} of runs`); }
      const rest = far.slice(1);
      if (rest.length) { const mx = Math.max(...rest.map((x) => x.p!.p)); parts.push(`${listJoin(rest.map((x) => nlink(N(x.l.id))))} never pass${rest.length === 1 ? 'es' : ''} ${Math.ceil(mx * 100 - 1e-9)}%`); }
      tail.push(`${cap(numWord(looseC.length))}${zeroEnd ? ' endorsed' : ''} ${plural(looseC.length, 'candidate fits', 'candidates fit')} no coalition.${parts.length ? ` ${cap(listJoin(parts))}.` : ''}`);
    }
    const slNm = nm.find((x) => N(x.l.id).type === 'Slate');
    if (slNm) tail.push(`The slate itself falls just short of ${chip(slNm.c)} (${pctCut(slNm.v, T)}).`);
    void BD;
    if (tail.length) findings.push(tail.join(' '));
  }

  // ---- overview figure key + alt ----
  const overviewKey = `<p class="small">Letters: coalitions; white: none. Dashed: slate link.</p>`;
  const overviewAlt = `Network diagram of the ${S.nCore} most connected candidates and endorsers. Outlines mark ${numWord(S.nBlocs)} coalitions: ${d.communities.map((c) => `${LETTERS[c.id]}, ${blocName(ix, c)}`).join('; ')}. White dots fit no coalition, including ${listJoin(d.loose.map((l) => N(l.id).name))}.`;
  const graphSummary = `Interactive network of ${S.nNodes} candidates and endorsers and ${S.nEndorsementEdges} endorsements. ${overviewAlt} Use search or the side panel to explore by keyboard.`;
  const nCand = d.nodes.filter((n) => n.isTarget && n.type !== 'Slate' && !n.analysisEndorser).length;
  const nSlates = d.nodes.filter((n) => n.isTarget && n.type === 'Slate').length;
  const statsLine = `${S.nEndorsementEdges.toLocaleString('en-US')} endorsements · ${S.nEndorsers} endorsers · ${nRaces} races`;
  return {
    headline, findings, statsLine, overviewAlt, overviewKey, graphSummary, strip,
    title: 'Who backs whom in Berkeley’s November 2026 election | The Daily Californian',
    description: `${headline}. An interactive network of endorsements in Berkeley’s November 2026 election.`,
  };
}
