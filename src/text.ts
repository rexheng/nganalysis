// Shared, data-driven prose. Every number or name in here is computed from graph.json.
import type { Data, GNode } from './types';

export const LETTERS = 'ABCDEFGHIJKLMNOP';
// Okabe–Ito based, colour-blind-safe; ordered so the first five are maximally distinct.
export const COMM_COLORS = ['#D55E00', '#0072B2', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#8C6D31', '#666666'];
export const commColor = (c: number) => (c < 0 ? '#9a9a9a' : COMM_COLORS[c % COMM_COLORS.length]);
export const commName = (c: number) => (c < 0 ? 'Unassigned' : `Coalition ${LETTERS[c]}`);
export const SLATE = 'Berkeley Right to Housing slate';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function listJoin(a: string[], conj = 'and'): string {
  if (a.length <= 1) return a.join('');
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, ${conj} ${a[a.length - 1]}`;
}
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const numWord = (n: number) => (n >= 0 && n <= 10 ? NUM[n] : String(n));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const pct = (a: number, b: number) => Math.round((100 * a) / b);

export function index(d: Data) {
  const byId = new Map<string, GNode>(d.nodes.map((n) => [n.id, n]));
  const byName = new Map<string, GNode>(d.nodes.map((n) => [n.name, n]));
  const out = new Map<string, string[]>(); const inn = new Map<string, string[]>();
  for (const e of d.edges) {
    if (!out.has(e.s)) out.set(e.s, []); out.get(e.s)!.push(e.t);
    if (!inn.has(e.t)) inn.set(e.t, []); inn.get(e.t)!.push(e.s);
  }
  const slate = byName.get(SLATE);
  const slateMembers = d.edges.filter((e) => e.rel === 'Slate member').map((e) => e.t);
  return { byId, byName, out, inn, slate, slateMembers };
}

/** Actors (not the slate node itself) whose endorsements go to 2+ different coalitions. */
export function crossers(d: Data) {
  const ix = index(d);
  const res: { id: string; comms: number[] }[] = [];
  for (const [s, ts] of ix.out) {
    if (ix.slate && s === ix.slate.id) continue;
    const cs = [...new Set(ts.map((t) => ix.byId.get(t)!.community).filter((c) => c >= 0))].sort();
    if (cs.length >= 2) res.push({ id: s, comms: cs });
  }
  return res;
}

/** Candidate list for a coalition with the slate collapsed to one phrase. */
export function coalitionTargets(d: Data, ci: number, opts: { html?: boolean } = {}) {
  const ix = index(d);
  const c = d.communities[ci];
  const members = c.targets.map((t) => ix.byId.get(t)!);
  const slateIn = members.some((m) => m.name === SLATE);
  const memberSet = new Set(ix.slateMembers);
  const allMembersIn = ix.slateMembers.every((m) => c.targets.includes(m));
  const parts: string[] = [];
  for (const m of members) {
    if (slateIn && allMembersIn && memberSet.has(m.id)) continue;
    if (m.name === SLATE) {
      parts.push(allMembersIn ? `the ${numWord(ix.slateMembers.length)}-member ${SLATE}` : `the ${SLATE}`);
      continue;
    }
    const label = `${m.name} (${m.race})`;
    parts.push(opts.html ? `<button class="nlink" data-node="${esc(m.id)}">${esc(m.name)}</button> <span class="race-tag">${esc(m.race || '')}</span>` : label);
  }
  return parts;
}

export function bridgeSentence(d: Data, id: string, html = true): string {
  const ix = index(d);
  const outs = (ix.out.get(id) || []).map((t) => ix.byId.get(t)!);
  const groups = new Map<number, GNode[]>();
  for (const t of outs) { if (!groups.has(t.community)) groups.set(t.community, []); groups.get(t.community)!.push(t); }
  const parts = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([c, ts]) => {
    const names = listJoin(ts.map((t) => (html ? `<button class="nlink" data-node="${esc(t.id)}">${esc(t.name)}</button>` : t.name)));
    return html ? `${names} <span class="chip" style="--c:${commColor(c)}">${LETTERS[c] ?? '–'}</span>` : `${names} (${commName(c)})`;
  });
  const n = ix.byId.get(id)!;
  const ins = (ix.inn.get(id) || []).length;
  let s = parts.length ? `Endorses ${parts.length > 1 ? parts.join('; ') : parts[0]}` : '';
  if (n.isTarget && ins) s += `${s ? '; ' : ''}endorsed by ${ins} actors`;
  if (groups.size >= 2) s += ` — ${numWord(groups.size)} coalitions`;
  return s + '.';
}

export interface Texts {
  headline: string; dek: string; findings: string[]; k: number; nCross: number;
  title: string; description: string; statsLine: string;
}

export function buildTexts(d: Data): Texts {
  const ix = index(d);
  const S = d.summary;
  const k = d.communities.length;
  const cross = crossers(d);
  const nCross = cross.length;
  const nRaces = d.races.filter((r) => r.candidates.length).length;
  const headline = `Berkeley’s endorsements split into ${numWord(k)} coalitions. ${cap(numWord(nCross))} endorsers cross the lines.`;
  const dek = `We mapped ${S.nEndorsementEdges.toLocaleString('en-US')} public endorsements from ${S.nEndorsers.toLocaleString('en-US')} people and organizations across Berkeley’s ${numWord(nRaces)} local races on the Nov. 3 ballot. A community-detection algorithm sorts the network into ${numWord(k)} groups that mostly endorse within themselves — and identifies the people and groups who connect them.`;
  const findings: string[] = [];

  // 1. Rent Board vs council
  const rbComms = d.communities.filter((c) => c.targets.some((t) => ix.byId.get(t)!.race === 'Rent Board'));
  for (const c of rbComms) {
    const ts = c.targets.map((t) => ix.byId.get(t)!);
    const rb = ts.filter((t) => t.race === 'Rent Board' && !ix.slateMembers.includes(t.id));
    const council = ts.filter((t) => (t.race || '').startsWith('Council'));
    const other = ts.filter((t) => t.race && !t.race.startsWith('Council') && t.race !== 'Rent Board');
    const rbNames = rb.map((t) => (t.name === SLATE ? `the ${SLATE}` : `Rent Board candidate ${t.name}`));
    let s = `<span class="chip" style="--c:${commColor(c.id)}">${LETTERS[c.id]}</span> <strong>${esc(cap(listJoin(rbNames)))}</strong> ${rb.length > 1 ? 'share' : 'shares'} ${commName(c.id)}`;
    if (council.length) s += ` with council candidates ${esc(listJoin(council.map((t) => `${t.name} (${t.race!.replace('Council ', '')})`)))}`;
    if (other.length) s += `${council.length ? ' and' : ' with'} ${esc(listJoin(other.map((t) => `${t.name} (${t.race})`)))}`;
    findings.push(s + '.');
  }

  // 2. Rivals in the same race (candidates with at least one recorded endorsement)
  const diff: string[] = []; const same: string[] = [];
  for (const r of d.races) {
    if (r.race === 'Rent Board') continue; // slate race handled above
    const cs = r.candidates.map((id) => ix.byId.get(id)!).filter((n) => n.inDeg > 0 && n.community >= 0);
    if (cs.length < 2) continue;
    const byC = new Map<number, string[]>();
    for (const n of cs) { if (!byC.has(n.community)) byC.set(n.community, []); byC.get(n.community)!.push(n.name); }
    const shared = [...byC.entries()].filter(([, names]) => names.length > 1);
    if (!shared.length) diff.push(r.race);
    else for (const [c, names] of shared) same.push(`in ${r.race}, ${listJoin(names)} share ${commName(c)}`);
  }
  if (diff.length || same.length) {
    let s2 = '';
    if (diff.length) s2 += `In ${esc(listJoin(diff))}, every candidate with recorded endorsements lands in a different coalition. `;
    if (same.length) s2 += `${diff.length ? 'By contrast, ' : ''}${esc(listJoin(same))}.`;
    findings.push(s2.trim().replace(/^by/, 'By'));
  }

  // 3. Top bridges
  const topB = d.bridges.filter((b) => !ix.byId.get(b.id)!.isTarget).slice(0, 3);
  if (topB.length) {
    const items = topB.map((b) => {
      const n = ix.byId.get(b.id)!;
      return `<button class="nlink" data-node="${esc(n.id)}"><strong>${esc(n.name)}</strong></button> (${esc(n.type.toLowerCase())}) ${bridgeSentence(d, b.id).replace(/^Endorses/, 'endorses').replace(/\.$/, '')}`;
    });
    findings.push(`The strongest bridges, by betweenness centrality: ${items.join('; ')}.`);
  }

  // 4. Biggest cross-race overlap
  const raceOf = (id: string) => ix.byId.get(id)!.race;
  const cr = d.overlap.filter((o) => raceOf(o.a) && raceOf(o.b) && raceOf(o.a) !== raceOf(o.b)).sort((a, b) => b.n - a.n)[0];
  if (cr) {
    const A = ix.byId.get(cr.a)!, B = ix.byId.get(cr.b)!;
    findings.push(`The two candidates in different races with the most endorsers in common are ${esc(A.name)} (${esc(A.race!)}) and ${esc(B.name)} (${esc(B.race!)}): ${cr.n} shared endorsers.`);
  }

  // 5. Singletons
  findings.push(`${pct(S.nSingle, S.nEndorsers)}% of endorsers (${S.nSingle.toLocaleString('en-US')} of ${S.nEndorsers.toLocaleString('en-US')}) back exactly one candidate or slate. They are faded in the graphic by default so the connective structure is visible.`);

  const statsLine = `${S.nEndorsementEdges} endorsements · ${S.nEndorsers} endorsers · ${S.nCandidates} candidates + 1 slate · ${nRaces} races`;
  return {
    headline, dek, findings, k, nCross, statsLine,
    title: `Who bridges Berkeley’s endorsement coalitions? | The Daily Californian`,
    description: headline + ' An interactive network of endorsements in the November 2026 Berkeley local election.',
  };
}
