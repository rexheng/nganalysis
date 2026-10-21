import './fonts.css';
import './style.css';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { Data, GNode, GEdge } from './types';
import { commColor, commName, LETTERS, esc, index, bridgeSentence, listJoin, coalitionTargets, numWord, SLATE } from './text';
import { srcLabel } from './methods';

const TYPE_COLORS: Record<string, string> = {
  'Candidate': '#1f1f1f', 'Candidate (withdrawn)': '#6f6f6f', 'Slate': '#7B3294', 'Union': '#D55E00', 'Democratic club': '#0072B2',
  'Political/advocacy org': '#009E73', 'Current elected official': '#E69F00', 'Former elected official': '#CC79A7', 'Individual': '#9C9C9C',
};
const TYPE_ORDER = Object.keys(TYPE_COLORS);
const DIM = '#ececec', FADE = '#d4d4d4', MEMBER = 'rgba(123,50,148,0.75)';
type View = 'coalitions' | 'bridges' | 'race';
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const fmtDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function main() {
  const res = await fetch('data/graph.json');
  const d: Data = await res.json();
  const ix = index(d);
  const { byId } = ix;
  const edgesOut = new Map<string, GEdge[]>(); const edgesIn = new Map<string, GEdge[]>();
  const memberEdges = d.edges.filter((e) => e.kind === 'member');
  for (const e of d.edges) {
    if (e.kind === 'member') continue;
    (edgesOut.get(e.s) || edgesOut.set(e.s, []).get(e.s)!).push(e);
    (edgesIn.get(e.t) || edgesIn.set(e.t, []).get(e.t)!).push(e);
  }
  const endorserBridges = d.bridges.filter((b) => !byId.get(b.id)!.isTarget);
  const targetBridges = d.bridges.filter((b) => byId.get(b.id)!.isTarget);
  const TOPN = 10;
  const topBridgeSet = new Set(endorserBridges.slice(0, TOPN).map((b) => b.id));
  // competition ranking: ties share a rank
  const rankMap = (bs: typeof endorserBridges) => new Map(bs.map((b) => [b.id, 1 + bs.filter((x) => x.bc > b.bc + 1e-9).length]));
  const bridgeRank = rankMap(endorserBridges);
  const targetRank = rankMap(targetBridges);

  const state = { view: 'coalitions' as View, selected: null as string | null, hovered: null as string | null,
    showAll: false, colorBy: 'community' as 'community' | 'type', race: d.races[1]?.race || d.races[0].race, bridgeCands: false };

  // ---------- graph ----------
  const g = new Graph({ type: 'directed', multi: false });
  const baseSize = (n: GNode) => (n.isTarget ? 5 + 1.55 * Math.sqrt(Math.max(n.inDeg, 1)) : 2.2 + 1.5 * Math.sqrt(n.outDeg));
  for (const n of d.nodes) g.addNode(n.id, { x: n.x, y: n.y, size: baseSize(n), label: n.name, color: commColor(n.community) });
  for (const e of d.edges) if (!g.hasEdge(e.s, e.t)) g.addDirectedEdgeWithKey(e.id, e.s, e.t, { size: 0.6, kind: e.kind });

  const raceSet = () => new Set(d.races.find((r) => r.race === state.race)?.candidates || []);
  const neighbors = (id: string) => new Set([id, ...g.neighbors(id)]);

  function focusSet(): Set<string> | null {
    const f = state.hovered || state.selected;
    if (f) return neighbors(f);
    if (state.view === 'bridges') {
      const s = new Set<string>();
      const src = state.bridgeCands ? targetBridges.slice(0, TOPN).map((b) => b.id) : [...topBridgeSet];
      for (const b of src) { s.add(b); if (!state.bridgeCands) for (const m of g.outNeighbors(b)) s.add(m); }
      return s;
    }
    if (state.view === 'race') {
      const s = new Set<string>();
      for (const c of raceSet()) { s.add(c); for (const m of g.inNeighbors(c)) s.add(m); for (const m of g.outNeighbors(c)) if (memberEdges.some((e) => e.s === c && e.t === m)) s.add(m); }
      return s;
    }
    return null;
  }
  let FOCUS: Set<string> | null = null;
  let RACE_SHARED = new Set<string>();
  function recompute() {
    FOCUS = focusSet();
    RACE_SHARED = new Set();
    if (state.view === 'race') {
      const cnt = new Map<string, number>();
      for (const c of raceSet()) for (const e of edgesIn.get(c) || []) cnt.set(e.s, (cnt.get(e.s) || 0) + 1);
      for (const [m, k] of cnt) if (k >= 2) RACE_SHARED.add(m);
    }
  }
  const colorOf = (n: GNode) => (state.colorBy === 'type' ? TYPE_COLORS[n.type] || '#888' : commColor(n.community));

  const container = $('#graph');
  const isNarrow = window.matchMedia('(max-width: 640px)').matches;
  const renderer = new Sigma(g, container, {
    renderLabels: true, labelRenderedSizeThreshold: 1e6, labelDensity: 1, labelGridCellSize: 60,
    labelFont: '"Libre Franklin Variable", "Libre Franklin", system-ui, sans-serif', labelSize: isNarrow ? 10 : 12, labelWeight: '600',
    zIndex: true, stagePadding: 24, minCameraRatio: 0.06, maxCameraRatio: 2.5, defaultEdgeColor: '#d6d6d6',
    defaultDrawNodeLabel: drawLabel, defaultDrawNodeHover: drawHover,
    nodeReducer: (id, attr) => {
      const n = byId.get(id)!; const r: any = { ...attr, color: colorOf(n), zIndex: 1 };
      const focus = FOCUS; const inFocus = !focus || focus.has(id);
      const active = state.hovered || state.selected;
      if (n.isTarget) { r.forceLabel = true; r.zIndex = 3; }
      if (n.leaf && !state.showAll && !(focus && focus.has(id) && (active || state.view === 'race'))) {
        r.color = FADE; r.size = 1.6; r.zIndex = 0; r.forceLabel = false; r.label = '';
      }
      if (!inFocus) { r.color = DIM; r.forceLabel = false; r.label = n.isTarget ? attr.label : ''; r.labelColor = '#bbb'; r.zIndex = 0; if (n.isTarget) { r.forceLabel = true; r.dimLabel = true; } }
      if (state.view === 'bridges' && !active) {
        const rank = state.bridgeCands ? targetRank.get(id) : bridgeRank.get(id);
        if (rank && rank <= TOPN) { r.forceLabel = true; r.label = `${rank}. ${n.name}`; r.size = Math.max(attr.size * 1.5, 7); r.zIndex = 4; r.ring = true; }
      }
      if (state.view === 'race' && !active && RACE_SHARED.has(id)) { r.size = Math.max(attr.size * 1.4, 5.5); r.zIndex = 4; r.ring = true; if (RACE_SHARED.size <= (isNarrow ? 6 : 14)) r.forceLabel = true; }
      if (active && id === active) { r.forceLabel = true; r.zIndex = 5; r.ring = true; r.highlighted = false; }
      if (active && focus && focus.has(id) && focus.size <= 40) r.forceLabel = true;
      return r;
    },
    edgeReducer: (eid, attr) => {
      const s = g.source(eid), t = g.target(eid); const r: any = { ...attr };
      const sn = byId.get(s)!;
      const active = state.hovered || state.selected;
      const isMember = attr.kind === 'member';
      if (active) {
        if (s === active || t === active) { r.color = isMember ? MEMBER : '#3a3a3a'; r.size = isMember ? 2 : 1.1; r.zIndex = 2; } else r.hidden = true;
        return r;
      }
      if (isMember) {
        const vis = state.view !== 'race' || raceSet().has(t) || raceSet().has(s);
        r.color = vis ? MEMBER : '#efefef'; r.size = vis ? 1.8 : 0.6; r.zIndex = 3; return r;
      }
      if (sn.leaf && !state.showAll) { r.hidden = state.view !== 'race' || !FOCUS?.has(s); if (!r.hidden) r.color = '#e2e2e2'; return r; }
      if (state.view === 'bridges') {
        const on = state.bridgeCands ? false : topBridgeSet.has(s);
        if (on) { r.color = '#555'; r.size = 1; r.zIndex = 2; } else r.color = '#efefef';
      } else if (state.view === 'race') {
        if (raceSet().has(t)) { r.color = RACE_SHARED.has(s) ? '#444' : '#c9c9c9'; r.size = RACE_SHARED.has(s) ? 1 : 0.6; r.zIndex = RACE_SHARED.has(s) ? 2 : 1; } else r.hidden = true;
      } else {
        r.color = 'rgba(120,120,120,0.2)';
      }
      return r;
    },
  });

  function drawLabel(ctx: CanvasRenderingContext2D, data: any, settings: any) {
    if (!data.label) return;
    const size = data.isTargetLabel ? settings.labelSize : settings.labelSize;
    const n = byId.get(data.key);
    const big = n?.isTarget;
    ctx.font = `${big ? 650 : 550} ${big ? size + 1 : size - 1}px ${settings.labelFont}`;
    const x = data.x + data.size + 4, y = data.y + size / 3;
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineJoin = 'round';
    ctx.strokeText(data.label, x, y);
    ctx.fillStyle = data.dimLabel ? '#b5b5b5' : '#161616';
    ctx.fillText(data.label, x, y);
  }
  function drawHover(ctx: CanvasRenderingContext2D, data: any, settings: any) {
    ctx.beginPath(); ctx.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
    drawLabel(ctx, data, settings);
  }
  // ring around emphasized nodes: draw in afterRender on the mouse layer-independent canvas
  renderer.on('afterRender', () => {
    const ctx = (renderer as any).getCanvases().labels.getContext('2d') as CanvasRenderingContext2D;
    ctx.save();
    g.forEachNode((id) => {
      const dd: any = renderer.getNodeDisplayData(id);
      if (!dd || dd.hidden) return;
      const isRing = (state.selected === id) || (!state.hovered && !state.selected && ((state.view === 'bridges' && (state.bridgeCands ? (targetRank.get(id) || 99) <= TOPN : topBridgeSet.has(id))) || (state.view === 'race' && (RACE_SHARED.has(id) || raceSet().has(id)))));
      if (!isRing) return;
      const p = renderer.framedGraphToViewport({ x: dd.x, y: dd.y });
      const size = renderer.scaleSize(dd.size);
      ctx.beginPath(); ctx.arc(p.x, p.y, size + 2.5, 0, Math.PI * 2); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6; ctx.stroke();
    });
    ctx.restore();
  });

  // ---------- tooltip ----------
  const tip = $('#tooltip');
  renderer.on('enterNode', ({ node, event }) => {
    state.hovered = node; recompute(); renderer.refresh({ skipIndexation: true });
    const n = byId.get(node)!;
    tip.innerHTML = `<strong>${esc(n.name)}</strong><span>${esc(n.type)}${n.race ? ' · ' + esc(n.race) : ''}</span><span>${n.outDeg ? `Endorses ${n.outDeg}` : ''}${n.outDeg && n.inDeg ? ' · ' : ''}${n.inDeg ? `Endorsed by ${n.inDeg}` : ''}</span>`;
    tip.hidden = false; placeTip(event.x, event.y); container.style.cursor = 'pointer';
  });
  renderer.on('leaveNode', () => { state.hovered = null; recompute(); renderer.refresh({ skipIndexation: true }); tip.hidden = true; container.style.cursor = ''; });
  function placeTip(x: number, y: number) {
    const w = container.clientWidth; tip.style.left = Math.min(x + 14, w - 220) + 'px'; tip.style.top = y + 14 + 'px';
  }
  renderer.on('clickNode', ({ node }) => select(node, false));
  renderer.on('clickStage', () => { if (state.selected) select(null); });

  // ---------- camera ----------
  const cam = renderer.getCamera();
  const HOME = isNarrow ? { x: 0.62, y: 0.5, ratio: 1.42, angle: 0 } : { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
  cam.setState(HOME);
  $('#zin').onclick = () => cam.animatedZoom({ duration: 250 });
  $('#zout').onclick = () => cam.animatedUnzoom({ duration: 250 });
  $('#zreset').onclick = () => cam.animate(HOME, { duration: 300 });
  function flyTo(id: string) {
    const p = renderer.getNodeDisplayData(id); if (!p) return;
    cam.animate({ x: p.x, y: p.y, ratio: Math.min(cam.ratio, 0.55) }, { duration: 450 });
  }

  // ---------- panel ----------
  const panel = $('#panel');
  const chip = (c: number) => `<span class="chip" style="--c:${commColor(c)}" title="${esc(commName(c))}">${c >= 0 ? LETTERS[c] : '–'}</span>`;
  const nlink = (id: string, cls = '') => { const n = byId.get(id)!; return `<button class="nlink ${cls}" data-node="${esc(id)}">${esc(n.name)}</button>`; };
  const typeDot = (t: string) => `<span class="tdot" style="--c:${TYPE_COLORS[t] || '#999'}"></span>`;

  function sourcesHtml(e: GEdge) {
    const dates = new Set(e.src.map((x) => x.at || e.date).filter(Boolean));
    const links = e.src.map((x) => {
      const u = d.urls[x.u]; const pg = x.pg ? `, p. ${esc(x.pg)}` : '';
      const href = x.pg && /\.pdf$/i.test(u) ? `${u}#page=${encodeURIComponent(x.pg)}` : u;
      const acc = dates.size > 1 && x.at ? ` <span class="acc">(${esc(fmtDate(x.at))})</span>` : '';
      return `<a href="${esc(href)}" target="_blank" rel="noopener" title="${esc(x.ty || '')}">${esc(srcLabel(u))}${pg}<span aria-hidden="true"> ↗</span></a>${acc}`;
    }).join('');
    const one = dates.size === 1 ? `<span class="acc">accessed ${esc(fmtDate([...dates][0]))}</span>` : '';
    return `<span class="srcs">${links}${one}</span>`;
  }
  function edgeRow(e: GEdge, otherId: string, showTitle: boolean) {
    const o = byId.get(otherId)!;
    const badges: string[] = [];
    if (e.rel !== 'Endorses' && e.kind !== 'member') badges.push(`<span class="badge">${esc(e.rel)}</span>`);
    const title = showTitle && e.title ? `<span class="ttl">${esc(e.title)}</span>` : '';
    const asw = e.asw && !e.asw.split(' | ').every((a) => a === o.name) && showTitle ? `<span class="asw">as written: ${esc(e.asw)}</span>` : '';
    const chk = e.check ? `<span class="flag" title="Reviewer note">⚑ ${esc(e.check)}</span>` : '';
    return `<li>${typeDot(o.type)}${nlink(otherId)} ${chip(o.community)} ${badges.join('')}${title}${asw}${sourcesHtml(e)}${chk}</li>`;
  }
  function groupedIn(id: string) {
    const es = (edgesIn.get(id) || []).slice();
    const groups = new Map<string, GEdge[]>();
    for (const e of es) { const t = byId.get(e.s)!.type; if (!groups.has(t)) groups.set(t, []); groups.get(t)!.push(e); }
    return TYPE_ORDER.filter((t) => groups.has(t)).map((t) => {
      const list = groups.get(t)!.sort((a, b) => (byId.get(b.s)!.outDeg - byId.get(a.s)!.outDeg) || byId.get(a.s)!.name.localeCompare(byId.get(b.s)!.name));
      const LIM = 12;
      const rows = list.map((e, i) => edgeRow(e, e.s, true).replace('<li>', i >= LIM ? '<li class="more" hidden>' : '<li>')).join('');
      const more = list.length > LIM ? `<button class="showmore" data-n="${list.length - LIM}">Show ${list.length - LIM} more</button>` : '';
      return `<h5>${typeDot(t)}${esc(t)} <span class="cnt">${list.length}</span></h5><ul class="elist">${rows}</ul>${more}`;
    }).join('');
  }

  function nodePanel(id: string) {
    const n = byId.get(id)!;
    const outs = edgesOut.get(id) || [];
    const ins = edgesIn.get(id) || [];
    const brank = n.isTarget ? targetRank.get(id) : bridgeRank.get(id);
    const comms = n.commsTouched.length;
    const titles = [...new Set(outs.map((e) => e.title).filter(Boolean))];
    const bLine = n.bc > 0 ? `<p class="metric"><strong>Betweenness ${n.bc.toFixed(4)}</strong> — #${brank} of ${n.isTarget ? targetBridges.length + ' candidates/slate' : endorserBridges.length + ' endorsers'} with a nonzero score.</p>` : (n.leaf ? `<p class="metric muted">Endorses one candidate only, so it cannot bridge others.</p>` : '');
    const sentence = outs.length ? `<p class="sentence">${bridgeSentence(d, id)}</p>` : '';
    let html = `<button class="back" data-back>← Back to ${state.view === 'race' ? 'race view' : state.view}</button>
      <div class="ncard"><p class="ntype">${typeDot(n.type)}${esc(n.type)}${n.race ? ` · ${esc(n.race)}` : ''}</p>
      <h3>${esc(n.name)}</h3>
      ${n.typeNote ? `<p class="muted small">${esc(n.typeNote)}</p>` : ''}${n.status ? `<p class="muted small">Status: ${esc(n.status)}</p>` : ''}
      ${titles.length ? `<p class="ttl-main">${titles.slice(0, 2).map(esc).join(' · ')}</p>` : ''}
      <p class="meta">${chip(n.community)} Placed in <strong>${esc(commName(n.community))}</strong>${comms > 1 ? ` · connected to ${numWord(comms)} coalitions` : ''}</p>
      ${n.campaignUrl ? `<p class="meta"><a href="${esc(n.campaignUrl)}" target="_blank" rel="noopener">Campaign site ↗</a>${n.endorsementsPage && n.endorsementsPage !== n.campaignUrl ? ` · <a href="${esc(n.endorsementsPage)}" target="_blank" rel="noopener">Endorsements page ↗</a>` : ''}</p>` : ''}
      ${bLine}${sentence}</div>`;
    const mem = memberEdges.filter((e) => e.t === id);
    if (mem.length) html += `<h4>Members <span class="cnt">${mem.length}</span></h4><ul class="elist">${mem.map((e) => edgeRow(e, e.s, false)).join('')}</ul>`;
    const memOf = memberEdges.filter((e) => e.s === id);
    if (memOf.length) html += `<h4>Member of</h4><ul class="elist">${memOf.map((e) => edgeRow(e, e.t, false)).join('')}</ul>`;
    if (outs.length) html += `<h4>Endorses <span class="cnt">${outs.length}</span></h4><ul class="elist">${outs.map((e) => edgeRow(e, e.t, false)).join('')}</ul>`;
    if (ins.length) html += `<h4>Endorsed by <span class="cnt">${ins.length}</span></h4>${groupedIn(id)}`;
    if (n.isTarget && !ins.length) html += `<p class="muted">No endorsements recorded for this candidate. See the methodology notes below.</p>`;
    return html;
  }

  function coalitionsPanel() {
    const S = d.summary;
    const items = d.communities.map((c) => {
      const tc = Object.entries(c.typeCounts); const tot = tc.reduce((a, [, v]) => a + v, 0) || 1;
      const bar = tc.map(([t, v]) => `<span style="flex:${v};background:${TYPE_COLORS[t] || '#999'}" title="${esc(t)}: ${v}"></span>`).join('');
      return `<li class="coal"><div class="coal-h">${chip(c.id)}<strong>${commName(c.id)}</strong><span class="muted small">${c.size} actors${c.stability != null ? ` · candidates grouped together in ${Math.round(c.stability * 100)}% of runs` : ''}</span></div>
        <p class="coal-c">${coalitionTargets(d, c.id, { html: true }).join(', ')}</p>
        <div class="tbar" aria-label="Endorser types">${bar}</div><p class="tbar-l small muted">${tc.slice(0, 3).map(([t, v]) => `${v} ${esc(t.toLowerCase())}${v !== 1 && !t.endsWith('s') ? (t === 'Individual' ? 's' : '') : ''}`).join(' · ')}</p></li>`;
    }).join('');
    return `<h3 class="ph">${numWord(d.communities.length).replace(/^./, (c) => c.toUpperCase())} coalitions</h3>
      <p class="pintro">Colors show the group each actor was assigned to by the Louvain algorithm (modularity ${S.modularity.toFixed(2)}). Click a name to see its endorsers and sources.</p><ol class="coals">${items}</ol>`;
  }

  function bridgesPanel() {
    const list = (state.bridgeCands ? targetBridges : endorserBridges)
      .filter((b, i, arr) => i < 15 || (state.bridgeCands ? targetRank : bridgeRank).get(b.id) === (state.bridgeCands ? targetRank : bridgeRank).get(arr[14].id));
    const max = list[0]?.bc || 1;
    const rmap = state.bridgeCands ? targetRank : bridgeRank;
    const rows = list.map((b) => {
      const n = byId.get(b.id)!; const rk = rmap.get(b.id)!;
      const tie = list.filter((x) => rmap.get(x.id) === rk).length > 1;
      return `<li><div class="br-h"><span class="rank">${tie ? '=' : ''}${rk}</span>${nlink(b.id, 'strong')}<span class="muted small">${esc(n.type)}</span></div>
      <div class="br-bar"><span style="width:${(100 * b.bc) / max}%;background:${commColor(n.community)}"></span><em>${b.bc.toFixed(4)}</em></div>
      <p class="sentence small">${bridgeSentence(d, b.id)}</p></li>`;
    }).join('');
    return `<h3 class="ph">Who bridges the coalitions</h3>
      <p class="pintro">Ranked by betweenness centrality: how often an actor lies on the shortest path between two others. Explanations list the candidates each actor endorses, with the coalition of each.</p>
      <div class="seg" role="group" aria-label="Rank"><button data-bc="0" aria-pressed="${!state.bridgeCands}">Endorsers</button><button data-bc="1" aria-pressed="${state.bridgeCands}">Candidates</button></div>
      ${state.bridgeCands ? '<p class="small muted">Candidates score high mainly because they are hubs with many endorsers.</p>' : ''}
      <ol class="bridges">${rows}</ol>`;
  }

  function racePanel() {
    const r = d.races.find((x) => x.race === state.race)!;
    const opts = d.races.map((x) => `<button data-race="${esc(x.race)}" aria-pressed="${x.race === state.race}">${esc(x.race)}</button>`).join('');
    const cands = r.candidates.map((id) => byId.get(id)!);
    const cards = cands.map((n) => {
      const ins = edgesIn.get(n.id) || [];
      const tc = new Map<string, number>(); for (const e of ins) { const t = byId.get(e.s)!.type; tc.set(t, (tc.get(t) || 0) + 1); }
      const bar = TYPE_ORDER.filter((t) => tc.has(t)).map((t) => `<span style="flex:${tc.get(t)};background:${TYPE_COLORS[t]}" title="${esc(t)}: ${tc.get(t)}"></span>`).join('');
      return `<li class="rc">${chip(n.community)}${nlink(n.id, 'strong')}<span class="num">${ins.length}</span>${ins.length ? `<div class="tbar">${bar}</div>` : '<p class="small muted">No endorsements recorded</p>'}</li>`;
    }).join('');
    // shared endorsers within race
    const set = new Set(r.candidates);
    const m = new Map<string, string[]>();
    for (const c of r.candidates) for (const e of edgesIn.get(c) || []) { if (!m.has(e.s)) m.set(e.s, []); m.get(e.s)!.push(c); }
    const shared = [...m.entries()].filter(([, cs]) => cs.length >= 2).sort((a, b) => b[1].length - a[1].length || byId.get(a[0])!.name.localeCompare(byId.get(b[0])!.name));
    const isSlateRace = r.candidates.some((c) => byId.get(c)!.name === SLATE);
    const sharedHtml = shared.length
      ? `<ul class="shared">${shared.map(([s, cs]) => `<li>${typeDot(byId.get(s)!.type)}${nlink(s)} <span class="small muted">→ ${cs.map((c) => esc(byId.get(c)!.name)).join(', ')}</span></li>`).join('')}</ul>`
      : '<p class="muted">No endorser backs more than one candidate in this race.</p>';
    // pairwise counts
    const pairs = d.overlap.filter((o) => set.has(o.a) && set.has(o.b));
    const pairHtml = pairs.length ? `<p class="small">${pairs.map((o) => `${esc(byId.get(o.a)!.name)} & ${esc(byId.get(o.b)!.name)}: <strong>${o.n}</strong>`).join(' · ')}</p>` : '';
    return `<h3 class="ph">Compare a race</h3><div class="seg wrap" role="group" aria-label="Race">${opts}</div>
      <ul class="rcs">${cards}</ul>
      <h4>Shared endorsers <span class="cnt">${shared.length}</span></h4>${isSlateRace ? '<p class="small muted">Includes endorsers listed for the slate and in members’ own voter-guide statements.</p>' : ''}${pairHtml}${sharedHtml}`;
  }

  function renderPanel() {
    panel.innerHTML = state.selected ? nodePanel(state.selected)
      : state.view === 'coalitions' ? coalitionsPanel() : state.view === 'bridges' ? bridgesPanel() : racePanel();
    panel.scrollTop = 0;
  }
  function renderLegend() {
    const L = $('#legend');
    const items = state.colorBy === 'community'
      ? d.communities.map((c) => `<li>${chip(c.id)}<span>${esc(commName(c.id))}</span></li>`).join('')
      : TYPE_ORDER.filter((t) => d.nodes.some((n) => n.type === t)).map((t) => `<li>${typeDot(t)}<span>${esc(t)}</span></li>`).join('');
    L.innerHTML = `<ul>${items}</ul><p>${memberEdges.length ? '<span class="mline"></span>slate membership (not an endorsement) · ' : ''}Dot size: endorsements given or received${state.showAll ? '' : ' · <span class="tdot" style="--c:' + FADE + '"></span>grey = backs one candidate'}</p>`;
  }

  // ---------- interactions ----------
  function select(id: string | null, fly = true) {
    state.selected = id; recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); syncHash();
    if (id && fly) flyTo(id);
    if (id && window.matchMedia('(max-width: 899px)').matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function setView(v: View) {
    state.view = v; state.selected = null;
    document.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); syncHash();
  }
  document.querySelectorAll<HTMLButtonElement>('[role=tab]').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view as View));
    b.addEventListener('keydown', (ev) => {
      const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')]; const i = tabs.indexOf(b);
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { const nb = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; nb.focus(); nb.click(); }
    });
  });
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const nb = t.closest<HTMLElement>('[data-node]');
    if (nb) { ev.preventDefault(); const id = nb.dataset.node!; if (!panel.contains(nb)) document.getElementById('explore')!.scrollIntoView({ behavior: 'smooth' }); select(id); return; }
    if (t.closest('[data-back]')) { select(null); return; }
    const rb = t.closest<HTMLElement>('[data-race]'); if (rb) { state.race = rb.dataset.race!; recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); return; }
    const bc = t.closest<HTMLElement>('[data-bc]'); if (bc) { state.bridgeCands = bc.dataset.bc === '1'; recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); return; }
    const sm = t.closest<HTMLButtonElement>('.showmore');
    if (sm) { const el = sm.previousElementSibling; el?.querySelectorAll('li.more').forEach((li) => ((li as HTMLElement).hidden = false)); sm.remove(); }
  });
  $<HTMLInputElement>('#showall').addEventListener('change', (e) => { state.showAll = (e.target as HTMLInputElement).checked; recompute(); renderer.refresh({ skipIndexation: true }); renderLegend(); });
  $<HTMLSelectElement>('#colorby').addEventListener('change', (e) => { state.colorBy = (e.target as HTMLSelectElement).value as any; renderer.refresh({ skipIndexation: true }); renderLegend(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.selected) select(null); });

  // ---------- search ----------
  const q = $<HTMLInputElement>('#q'); const qres = $('#qres');
  const searchIdx = d.nodes.map((n) => ({ id: n.id, key: norm([n.name, ...n.variants].join(' | ')) }));
  let hits: string[] = []; let hi = 0;
  function renderHits() {
    qres.innerHTML = hits.map((id, i) => { const n = byId.get(id)!; return `<li role="option" id="opt-${i}" aria-selected="${i === hi}" data-hit="${esc(id)}">${typeDot(n.type)}<span>${esc(n.name)}</span><small>${esc(n.type)}${n.race ? ' · ' + esc(n.race) : ''}</small></li>`; }).join('')
      || (q.value.trim() ? '<li class="none">No match</li>' : '');
    qres.hidden = !q.value.trim(); q.setAttribute('aria-expanded', String(!qres.hidden));
    if (hits.length) q.setAttribute('aria-activedescendant', `opt-${hi}`);
  }
  q.addEventListener('input', () => {
    const s = norm(q.value.trim()); hi = 0;
    hits = s ? searchIdx.filter((x) => x.key.includes(s)).map((x) => x.id)
      .sort((a, b) => (Number(norm(byId.get(b)!.name).startsWith(s)) - Number(norm(byId.get(a)!.name).startsWith(s))) || (byId.get(b)!.outDeg + byId.get(b)!.inDeg - byId.get(a)!.outDeg - byId.get(a)!.inDeg)).slice(0, 8) : [];
    renderHits();
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, hits.length - 1); renderHits(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(hi - 1, 0); renderHits(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[hi]) { choose(hits[hi]); }
    else if (e.key === 'Escape') { qres.hidden = true; }
  });
  qres.addEventListener('mousedown', (e) => { const li = (e.target as HTMLElement).closest<HTMLElement>('[data-hit]'); if (li) { e.preventDefault(); choose(li.dataset.hit!); } });
  q.addEventListener('blur', () => setTimeout(() => (qres.hidden = true), 120));
  function choose(id: string) {
    q.value = byId.get(id)!.name; qres.hidden = true; q.setAttribute('aria-expanded', 'false');
    select(id);
  }

  // ---------- hash ----------
  function syncHash() {
    const p = new URLSearchParams(); if (state.view !== 'coalitions') p.set('view', state.view); if (state.selected) p.set('node', state.selected);
    const h = p.toString(); history.replaceState(null, '', h ? '#' + h : location.pathname + location.search);
  }
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('view') && ['bridges', 'race'].includes(hp.get('view')!)) setView(hp.get('view') as View);

  recompute(); renderPanel(); renderLegend(); renderer.refresh();
  if (hp.get('node') && byId.has(hp.get('node')!)) select(hp.get('node')!);
  renderOverlap(d, byId);
  (window as any).__test = { pos: (id: string) => renderer.graphToViewport(g.getNodeAttributes(id) as any), byName: (n: string) => ix.byName.get(n)?.id };
  (window as any).__ready = true;
}

function renderOverlap(d: Data, byId: Map<string, GNode>) {
  const ix = index(d);
  const memberSet = new Set(ix.slateMembers);
  const ids = d.nodes.filter((n) => n.isTarget && !memberSet.has(n.id) && n.inDeg > 0)
    .sort((a, b) => a.community - b.community || b.inDeg - a.inDeg).map((n) => n.id);
  const ov = new Map<string, { n: number; shared: string[] }>();
  for (const o of d.overlap) { ov.set(o.a + '|' + o.b, o); ov.set(o.b + '|' + o.a, o); }
  const max = Math.max(...d.overlap.filter((o) => ids.includes(o.a) && ids.includes(o.b)).map((o) => o.n), 1);
  const col = (v: number) => { const t = Math.sqrt(v / max); const l = 97 - t * 72; return `hsl(214 ${30 + t * 40}% ${l}%)`; };
  const short = (id: string) => { const n = byId.get(id)!; return n.name === SLATE ? 'Right to Housing slate' : n.name.replace(/ "Gaith"/, ''); };
  const N = ids.length;
  let html = `<div class="ov-grid" style="--n:${N}" role="table" aria-label="Shared endorsers between candidates">`;
  html += `<div class="ov-corner" role="columnheader"></div>` + ids.map((id) => `<div class="ov-col" role="columnheader"><span style="color:${commColor(byId.get(id)!.community)}">■</span> ${esc(short(id))}</div>`).join('');
  for (const a of ids) {
    html += `<div class="ov-row" role="rowheader"><span style="color:${commColor(byId.get(a)!.community)}">■</span> ${esc(short(a))} <small>${esc(byId.get(a)!.race || '')}</small></div>`;
    for (const b of ids) {
      if (a === b) { html += `<div class="ov-cell diag" role="cell" title="${esc(byId.get(a)!.name)}: ${byId.get(a)!.inDeg} endorsers">${byId.get(a)!.inDeg}</div>`; continue; }
      const o = ov.get(a + '|' + b); const v = o?.n || 0;
      html += `<div class="ov-cell" role="cell" tabindex="${v ? 0 : -1}" data-a="${esc(a)}" data-b="${esc(b)}" style="background:${v ? col(v) : '#fafafa'};color:${v / max > 0.45 ? '#fff' : '#333'}">${v || ''}</div>`;
    }
  }
  html += '</div><div id="ovtip" class="ovtip" hidden></div>';
  const el = document.getElementById('overlap')!; el.innerHTML = html;
  const tip = document.getElementById('ovtip')!;
  const show = (cell: HTMLElement) => {
    const a = cell.dataset.a!, b = cell.dataset.b!; const o = ov.get(a + '|' + b);
    if (!o) { tip.hidden = true; return; }
    const names = o.shared.map((s) => byId.get(s)!.name);
    tip.innerHTML = `<strong>${esc(byId.get(a)!.name)} & ${esc(byId.get(b)!.name)}</strong><br>${o.n} shared endorser${o.n > 1 ? 's' : ''}: ${esc(listJoin(names.slice(0, 14)))}${names.length > 14 ? ` and ${names.length - 14} more` : ''}`;
    const r = cell.getBoundingClientRect(), pr = el.getBoundingClientRect();
    tip.style.left = Math.max(0, Math.min(r.left - pr.left + el.scrollLeft, el.scrollWidth - 300)) + 'px'; tip.style.top = r.bottom - pr.top + 6 + 'px'; tip.hidden = false;
  };
  el.addEventListener('mouseover', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.ov-cell[data-a]'); if (c) show(c); });
  el.addEventListener('focusin', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.ov-cell[data-a]'); if (c) show(c); });
  el.addEventListener('click', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('.ov-cell[data-a]'); if (c) show(c); });
  el.addEventListener('mouseleave', () => (tip.hidden = true));
}

main().catch((err) => { console.error(err); const p = document.getElementById('panel'); if (p) p.innerHTML = '<p>Could not load the graphic data.</p>'; });
