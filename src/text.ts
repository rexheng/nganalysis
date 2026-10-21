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
  const a = pctCut(lo, cut), b = pctCut(hi, cut);
  const ar = a.replace(/[<>]/g, ''), br = b.replace(/[<>]/g, '');
  return ar === br ? ar : `${ar.replace('%', '')}–${br}`;
};

/** "stable" or "thin margin": the weakest pair (lower of with/without probable) clears the cutoff by less than the border */
export const marginLabel = (d: Data, c: Community) => (c.weakest.p < d.summary.robustThreshold + (d.summary.border ?? 0.05) ? 'thin margin' : 'stable');
export const weakPct = (d: Data, c: Community) => pctCut(c.weakest.p, d.summary.robustThreshold + (d.summary.border ?? 0.05));
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
  return d.loose.filter((l) => l.nearBloc !== undefined && Math.min(l.nearMin!, l.nearMinConf!) >= T - BD)
    .map((l) => ({ l, v: Math.min(l.nearMin!, l.nearMinConf!), c: l.nearBloc! })).sort((a, b) => b.v - a.v);
}

export function buildTexts(d: Data): Texts {
  const ix = index(d); const S = d.summary; const T = S.robustThreshold;
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
  const sameBloc = ix.slateMembers.every((m) => N(m).community === memberBloc);

  // ---- headline + lede: raw counts of shared backers (no clustering) ----
  const sh = slateShares(d, ix);
  const top3 = sh ? sh.rows.slice(0, 3) : [];
  const slRace = sh?.sl.race || '';
  let headline = 'Berkeley endorsement network, November 2026';
  if (sh && top3.length) {
    const lead = top3[0];
    const tie = sh.rows.filter((r) => r.k === lead.k).length > 1;
    if (!tie) headline = lead.k * 2 > sh.nS ? `Most of the ${slRace} slate’s backers also back ${lead.n.name}` : `The ${slRace} slate shares the most backers with ${lead.n.name}`;
    findings.push(`Of the ${sh.nS} people and groups who back the ${nlink(sh.sl)}${slRace ? ` for ${esc(slRace)}` : ''}, ${listJoin(top3.map((r, i) => `${r.k}${i === 0 ? ' also back' : ''} ${nameRace(r.n)}`))}.`);
  }

  // ---- the slate's members ----
  if (sh && memberBloc >= 0 && sameBloc) {
    const c = d.communities[memberBloc];
    const others = c.targets.map(N).filter((n) => !n.memberOf);
    const mem = ix.slateMembers.map(N);
    const backAll = (id: string) => mem.every((m) => (ix.out.get(m.id) || []).includes(id));
    const nBack = new Set(mem.flatMap((m) => ix.inn.get(m.id) || [])).size;
    const nIn = mem.reduce((a, m) => a + m.inDeg, 0);
    const npm = d.edges.filter((e) => e.kind === 'endorsement' && /probable/i.test(e.conf || '') && ix.slateMembers.includes(e.t)).length;
    let m = `<strong>The slate’s ${numWord(mem.length)} members</strong> form coalition ${chip(memberBloc)}${others.length ? ` with ${listJoin(others.map(nameRace))}` : ''}.`;
    if (others.length === 1 && backAll(others[0].id)) m += ` Each of them endorses ${esc(surname(others[0]))}.`;
    const lead = top3[0]?.n;
    if (lead && lead.community < 0 && backAll(lead.id)) m += ` Each also endorses ${esc(surname(lead))}, who fits no coalition.`;
    const backers = [...new Set(mem.flatMap((x) => ix.inn.get(x.id) || []))].map(N);
    m += ` Only ${numWord(nBack)} ${plural(nBack, 'endorser backs', 'endorsers back')} any member directly${nBack <= 3 ? `, ${listJoin(backers.map((b) => nlink(b)))}` : ''}: ${numWord(nIn)} ${plural(nIn, 'endorsement')}${npm ? `, ${numWord(npm)} of them probable` : ''}.`;
    findings.push(m);
  }

  // ---- coalitions ----
  {
    const items = d.communities.map((c) => `${chip(c.id)} ${byRace(c.targets)}: ${weakPct(d, c)}, ${marginLabel(d, c)}`);
    let s = `<p><strong>${cap(numWord(S.nBlocs))} ${plural(S.nBlocs, 'coalition')}.</strong> A clustering program sorts the network into groups so that most endorsements fall inside one. Its answer shifts from run to run, so we ran it ${S.nRuns.toLocaleString('en-US')} times and counted how often each pair of candidates landed together. A coalition is a set in which every pair lands together in at least three runs out of four, whether or not the ${numWord(nProb)} probable endorsements are counted. Each group’s figure is its weakest pair; “thin margin” means that pair clears ${pct(T)} by less than ${Math.round((S.border ?? 0.05) * 100)} points.</p><ul class="coal-list">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    const nm = nearMisses(d);
    const tail: string[] = [];
    if (nm.length) {
      const who = (x: typeof nm[number]) => N(x.l.id).type === 'Slate' ? 'The slate page' : nlink(N(x.l.id));
      tail.push(nm.length === 1
        ? `${who(nm[0])} falls just short of joining ${chip(nm[0].c)} (weakest pair ${pctCut(nm[0].v, T)}).`
        : `${cap(listJoin(nm.map((x, i) => (i === 0 ? who(x) : who(x).replace(/^The/, 'the')))))} fall just short: their weakest pairs with ${listJoin(nm.map((x) => chip(x.c)))} are ${listJoin(nm.map((x) => pctCut(x.v, T)))}.`);
    }
    const bg = Object.entries(S.bootGroups || {}).map(([k, v]) => [+k, v] as [number, number]).sort((a, b) => b[1] - a[1]);
    const nb = bg.reduce((a, x) => a + x[1], 0);
    if (nb) {
      const shown: [number, number][] = []; let cov = 0;
      for (const x of bg) { if (cov >= 0.85 * nb && shown.length >= 2) break; shown.push(x); cov += x[1]; }
      const fate = S.bootFate || [];
      const intact = fate.map((f, i) => ({ i, v: (f.intact || 0) / nb, sp: (f.split || 0) / nb })).sort((a, b) => a.v - b.v);
      const w = intact[0];
      tail.push(`Drop a random tenth of the endorsements and rerun everything, and the method finds ${listJoin(shown.map(([k, v], i) => `${numWord(k)} groups in ${pct(v / nb)}${i === 0 ? ` of ${nb} tries` : ''}`))}.${w && w.v < 0.995 ? ` ${chip(w.i)} is the least stable: its candidates ${w.sp >= 0.005 ? `split up in ${pct(w.sp)} of tries and ` : ''}stay exactly as listed in ${pct(w.v)}.` : ''}`);
    }
    findings.push(s + (tail.length ? `<p>${tail.join(' ')}</p>` : ''));
  }

  // ---- unattached candidates (not near misses) ----
  {
    const nmIds = new Set(nearMisses(d).map((x) => x.l.id));
    const far = d.loose.filter((l) => N(l.id).type !== 'Slate' && !nmIds.has(l.id));
    if (far.length) findings.push(`${cap(listJoin(far.map((l) => nameRace(N(l.id)))))} ${far.length === 1 ? 'fits' : 'fit'} no coalition; ${far.length === 1 ? 'it never lands' : 'they never land'} with any one candidate in more than ${listJoin(far.map((l) => pct(Math.max(l.best, l.bestConf))))} of runs${far.length > 1 ? ', respectively' : ''}.`);
  }

  // ---- endorsers who span coalitions ----
  const rob = robustBridges(d);
  if (rob.length) {
    const tiers = new Map<number, typeof rob>();
    for (const b of rob) { if (!tiers.has(b.reach)) tiers.set(b.reach, []); tiers.get(b.reach)!.push(b); }
    const ts = [...tiers.entries()].sort((a, b) => b[0] - a[0]);
    const nm = (b: typeof rob[number]) => `${nlink(N(b.id), undefined, 'strong')}${b.reachConf !== undefined && b.reachConf !== b.reach ? ` (${b.reachConf} without the probable endorsements)` : ''}`;
    const tierTxt = ([r, bs]: [number, typeof rob], first: boolean) => bs.length === 1
      ? `${nm(bs[0])} backs candidates in ${numWord(r)}${first ? ` of the ${numWord(S.nBlocs)} coalitions` : ''}`
      : `${listJoin(bs.map(nm))} each back candidates in ${numWord(r)}${first ? ` of the ${numWord(S.nBlocs)} coalitions` : ''}`;
    let s = `<strong>Endorsers who span coalitions.</strong> ${cap(tierTxt(ts[0], true))}.${ts.length > 1 ? ` ${cap(ts.slice(1).map((t) => tierTxt(t, false)).join('. '))}.` : ''}`;
    s += ` ${rob.length === 1 ? 'It stays' : `All ${numWord(rob.length)} stay`} in the top ${numWord(S.bootstrap.topK)} when we drop any single endorsement, a random tenth of them, or the probable ones.`;
    findings.push(s);
  }

  // ---- overview figure key + alt ----
  const ringed = rob.slice(0, 10);
  const tieTop = rob.filter((b) => b.reach === rob[0]?.reach).length;
  const overviewKey = `<ul class="okey">${d.communities.map((c) => `<li>${chip(c.id)} <span>${esc(blocName(ix, c))}</span> <span class="muted">${weakPct(d, c)}${marginLabel(d, c) === 'thin margin' ? ' · thin margin' : ''}</span></li>`).join('')}
    <li><span class="chip none">–</span> <span>No coalition</span></li></ul>
    <p class="small"><strong>Rings: endorsers who span the most coalitions</strong>${tieTop > 1 ? ` (1–${tieTop} tie)` : ''}</p>
    <ol class="obr">${ringed.map((b, i) => `<li><span class="ring">${i + 1}</span> ${esc(N(b.id).name)} <span class="muted">· ${b.reach} of ${S.nBlocs}</span></li>`).join('')}</ol>
    <p class="small muted">Percent: weakest pair. One-candidate endorsers omitted. Blue: probable endorsement. Dashed: slate link.</p>`;
  const overviewAlt = `Network diagram of the ${S.nCore} most connected candidates and endorsers. Outlines mark ${numWord(S.nBlocs)} coalitions: ${d.communities.map((c) => `${LETTERS[c.id]}, ${blocName(ix, c)}`).join('; ')}. White dots fit no coalition, including ${listJoin(d.loose.map((l) => N(l.id).name))}. Numbered rings: ${listJoin(ringed.map((b, i) => `${i + 1}, ${N(b.id).name} (${b.reach} of ${S.nBlocs})`))}.`;
  const graphSummary = `Interactive network of ${S.nNodes} candidates and endorsers and ${S.nEndorsementEdges} endorsements${nProb ? ` (${nProb} probable)` : ''}. ${overviewAlt} Use search or the side panel to explore by keyboard.`;
  const nCand = d.nodes.filter((n) => n.isTarget && n.type !== 'Slate' && !n.analysisEndorser).length;
  const nSlates = d.nodes.filter((n) => n.isTarget && n.type === 'Slate').length;
  const statsLine = `${S.nEndorsementEdges.toLocaleString('en-US')} endorsements${nProb ? ` (${nProb} probable)` : ''} · ${S.nEndorsers} endorsers · ${nCand} candidates and ${nSlates} ${plural(nSlates, 'slate')} · ${nRaces} races`;
  return {
    headline, findings, statsLine, overviewAlt, overviewKey, graphSummary,
    title: 'Who backs whom in Berkeley’s November 2026 election | The Daily Californian',
    description: `${headline}. An interactive network of endorsements in Berkeley’s November 2026 election.`,
  };
}
