import './fonts.css';
import './style.css';
import Graph from 'graphology';
import Sigma from 'sigma';
import { createNodeBorderProgram } from '@sigma/node-border';
import type { Data, GNode, GEdge, Bridge } from './types';
import {
  commColor, commName, LETTERS, esc, index, bridgeSentence, listJoin, numWord, chip, nlink, typeGlyph, TYPE_ORDER, TYPE_RAMP,
  blocName, campOf, nCamps, pct, raceShort, srcLabel, srcHref, onColor, plural, shortName, contrast,
} from './text';

const LEAF = '#c4c4c4', DIM = '#eeeeee', DIM_BORDER = '#d9d9d9';
type View = 'coalitions' | 'bridges' | 'race';
type BMode = 'reach' | 'bc' | 'cand';
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const fmtDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const narrowMQ = window.matchMedia('(max-width: 640px)');
const stackMQ = window.matchMedia('(max-width: 899px)');
const hoverMQ = window.matchMedia('(hover: hover) and (pointer: fine)');

async function main() {
  const d: Data = await (await fetch('data/graph.json')).json();
  const ix = index(d);
  const { byId } = ix;
  const S = d.summary; const K = S.bootstrap.topK;
  const edgesOut = new Map<string, GEdge[]>(); const edgesIn = new Map<string, GEdge[]>();
  const memberEdges = d.edges.filter((e) => e.kind === 'member');
  for (const e of d.edges) {
    if (e.kind === 'member') continue;
    (edgesOut.get(e.s) || edgesOut.set(e.s, []).get(e.s)!).push(e);
    (edgesIn.get(e.t) || edgesIn.set(e.t, []).get(e.t)!).push(e);
  }
  const isolated = d.nodes.filter((n) => n.inDeg + n.outDeg === 0 && !memberEdges.some((e) => e.s === n.id || e.t === n.id));
  const isoSet = new Set(isolated.map((n) => n.id));
  // bridge lists
  const reachList = d.bridges.filter((b) => b.reach >= 2).sort((a, b) => a.rankReach - b.rankReach || byId.get(a.id)!.name.localeCompare(byId.get(b.id)!.name));
  const bcList = d.bridges.filter((b) => b.rankBc !== null).sort((a, b) => a.rankBc! - b.rankBc! || byId.get(a.id)!.name.localeCompare(byId.get(b.id)!.name));
  const candList = d.candBc.map((c, i, arr) => ({ id: c.id, bc: c.bc, rank: 1 + arr.filter((x) => x.bc > c.bc + 1e-9).length }));
  const robustTop = reachList.filter((b) => b.robustReach);
  const bridgeById = new Map(d.bridges.map((b) => [b.id, b]));

  const state = { view: 'coalitions' as View, selected: null as string | null, hovered: null as string | null, showAll: false,
    colorBy: 'community' as 'community' | 'type', race: d.races.find((r) => r.race === 'Rent Board')?.race || d.races[0].race, bmode: 'reach' as BMode };

  // ---------- graph ----------
  const g = new Graph({ type: 'directed', multi: false });
  const baseSize = (n: GNode) => (n.isTarget ? 4 + 2.1 * Math.log2(1 + n.inDeg) : n.leaf ? 2.5 : Math.min(8, 2.4 + 1.1 * Math.sqrt(n.outDeg)));
  for (const n of d.nodes) if (!isoSet.has(n.id)) g.addNode(n.id, { x: n.x, y: n.y, size: baseSize(n), label: n.name, color: commColor(n.community) });
  for (const e of d.edges) if (g.hasNode(e.s) && g.hasNode(e.t) && !g.hasEdge(e.s, e.t)) g.addDirectedEdgeWithKey(e.id, e.s, e.t, { size: 1, kind: e.kind });

  const raceSet = () => new Set(d.races.find((r) => r.race === state.race)?.candidates || []);
  const neighbors = (id: string) => (g.hasNode(id) ? new Set([id, ...g.neighbors(id)]) : new Set([id]));
  const bridgeIds = () => (state.bmode === 'cand' ? candList.map((c) => c.id) : (state.bmode === 'bc' ? bcList : reachList).map((b) => b.id)).slice(0, narrowMQ.matches ? 5 : K);
  const rankOf = (id: string) => (state.bmode === 'cand' ? candList.find((c) => c.id === id)?.rank : state.bmode === 'bc' ? bridgeById.get(id)?.rankBc : bridgeById.get(id)?.rankReach) ?? undefined;
  const coalTopBridges = () => robustTop.slice(0, 5).map((b) => b.id);

  let FOCUS: Set<string> | null = null; let RACE_SHARED = new Set<string>(); let TOPB = new Set<string>();
  function recompute() {
    const f = state.hovered || state.selected;
    TOPB = new Set(state.view === 'bridges' ? bridgeIds() : state.view === 'coalitions' ? coalTopBridges() : []);
    RACE_SHARED = new Set();
    if (state.view === 'race') {
      const cnt = new Map<string, number>();
      for (const c of raceSet()) for (const e of edgesIn.get(c) || []) cnt.set(e.s, (cnt.get(e.s) || 0) + 1);
      for (const [m, k] of cnt) if (k >= 2) RACE_SHARED.add(m);
    }
    if (f) FOCUS = neighbors(f);
    else if (state.view === 'bridges') {
      const s = new Set<string>();
      for (const b of TOPB) { s.add(b); if (state.bmode !== 'cand') for (const m of g.outNeighbors(b)) s.add(m); }
      FOCUS = s;
    } else if (state.view === 'race') {
      const s = new Set<string>();
      for (const c of raceSet()) { if (!g.hasNode(c)) continue; s.add(c); for (const m of g.inNeighbors(c)) s.add(m); }
      for (const e of memberEdges) if (raceSet().has(e.s) || raceSet().has(e.t)) { s.add(e.s); s.add(e.t); }
      FOCUS = s;
    } else FOCUS = null;
  }
  const crossEdge = (s: GNode, t: GNode) => s.community >= 0 && s.community !== t.community;

  const container = $('#graph');
  const BorderProgram = createNodeBorderProgram({
    borders: [
      { size: { attribute: 'borderSize', defaultValue: 0, mode: 'pixels' }, color: { attribute: 'borderColor', defaultValue: '#555' } },
      { size: { fill: true }, color: { attribute: 'color' } },
    ],
    drawLabel: undefined, drawHover: undefined,
  });
  const renderer = new Sigma(g, container, {
    renderLabels: false, renderEdgeLabels: false, zIndex: true, stagePadding: 18, minCameraRatio: 0.06, maxCameraRatio: 2.5,
    defaultNodeType: 'border', nodeProgramClasses: { border: BorderProgram as any }, defaultEdgeColor: '#d6d6d6',
    defaultDrawNodeHover: () => undefined,
    nodeReducer: (id, attr) => {
      const n = byId.get(id)!; const r: any = { ...attr, zIndex: 1, borderSize: 0 };
      const active = state.hovered || state.selected;
      const inFocus = !FOCUS || FOCUS.has(id);
      if (state.colorBy === 'type') { r.color = TYPE_RAMP[n.type] || '#999'; r.borderSize = 0.8; r.borderColor = '#ffffff'; }
      else if (n.community < 0) { r.color = '#ffffff'; r.borderSize = n.isTarget ? 2 : 1.3; r.borderColor = '#4d4d4d'; }
      else { r.color = commColor(n.community); r.borderSize = 0.8; r.borderColor = '#ffffff'; }
      if (n.isTarget) r.zIndex = 3;
      if (n.leaf && !state.showAll && !(FOCUS && FOCUS.has(id) && (active || state.view === 'race'))) {
        r.color = LEAF; r.size = 2.5; r.zIndex = 0; r.borderSize = 0;
      }
      if (!inFocus) { r.color = DIM; r.borderColor = DIM_BORDER; r.borderSize = n.isTarget ? 1 : 0; r.zIndex = 0; }
      if (TOPB.has(id) && !active) { r.size = Math.max(attr.size * 1.3, 6); r.zIndex = 4; }
      if (state.view === 'race' && !active && RACE_SHARED.has(id)) { r.size = Math.max(attr.size * 1.3, 5); r.zIndex = 4; }
      if (active === id) r.zIndex = 5;
      return r;
    },
    edgeReducer: (eid, attr) => {
      const s = g.source(eid), t = g.target(eid); const r: any = { ...attr };
      const sn = byId.get(s)!, tn = byId.get(t)!;
      const active = state.hovered || state.selected;
      const isMember = attr.kind === 'member';
      if (active) {
        if (s === active || t === active) { r.color = isMember ? '#111' : crossEdge(sn, tn) ? '#1f1f1f' : '#555'; r.size = isMember ? 2.2 : 1.3; r.zIndex = 2; } else r.hidden = true;
        return r;
      }
      if (isMember) {
        const vis = state.view !== 'race' || raceSet().has(t) || raceSet().has(s);
        r.color = vis ? '#111' : '#e6e6e6'; r.size = vis ? 2 : 1; r.zIndex = 3; return r;
      }
      if (sn.leaf && !state.showAll) {
        r.hidden = state.view !== 'race' || !FOCUS?.has(s);
        if (!r.hidden) { r.color = 'rgba(150,150,150,0.35)'; r.size = 0.8; }
        return r;
      }
      if (state.view === 'bridges') {
        if (state.bmode !== 'cand' && TOPB.has(s)) { r.color = '#2b2b2b'; r.size = 1.3; r.zIndex = 2; } else { r.color = 'rgba(160,160,160,0.18)'; r.size = 0.7; }
      } else if (state.view === 'race') {
        if (raceSet().has(t)) { r.color = RACE_SHARED.has(s) ? '#2b2b2b' : 'rgba(110,110,110,0.4)'; r.size = RACE_SHARED.has(s) ? 1.3 : 0.8; r.zIndex = RACE_SHARED.has(s) ? 2 : 1; }
        else r.hidden = true;
      } else if (crossEdge(sn, tn)) { r.color = 'rgba(25,25,25,0.55)'; r.size = 1.2; r.zIndex = 2; }
      else { r.color = 'rgba(90,90,90,0.35)'; r.size = 1; }
      return r;
    },
  });

  // ---------- overlay: collision-aware labels, rings, letters ----------
  const overlay = document.createElement('canvas'); overlay.className = 'overlay'; overlay.setAttribute('aria-hidden', 'true');
  container.appendChild(overlay);
  const octx = overlay.getContext('2d')!;
  const FONT = '"Libre Franklin Variable","Libre Franklin",system-ui,sans-serif';
  function sizeOverlay() {
    const dpr = window.devicePixelRatio || 1; const w = container.clientWidth, h = container.clientHeight;
    overlay.width = Math.round(w * dpr); overlay.height = Math.round(h * dpr); overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  sizeOverlay();
  type Lab = { id: string; text: string; force: boolean; weight: number; dim?: boolean };
  function labelPlan(): Lab[] {
    const L: Lab[] = []; const narrow = narrowMQ.matches;
    const active = state.hovered || state.selected;
    const push = (id: string, text: string, force = false, weight = 600, dim = false) => { if (g.hasNode(id) && !L.some((l) => l.id === id)) L.push({ id, text, force, weight, dim }); };
    if (active) push(active, byId.get(active)!.name, true, 750);
    const tb = [...TOPB].filter((id) => !active || (FOCUS && FOCUS.has(id)));
    const bl = (id: string) => (state.view === 'bridges' ? `${rankOf(id)}. ${shortName(byId.get(id)!)}` : shortName(byId.get(id)!));
    tb.slice(0, 3).forEach((id) => push(id, bl(id), !active, 750));
    if (active && FOCUS && FOCUS.size <= (narrow ? 14 : 40)) [...FOCUS].sort((a, b) => Number(byId.get(b)!.isTarget) - Number(byId.get(a)!.isTarget) || (byId.get(b)!.inDeg + byId.get(b)!.outDeg) - (byId.get(a)!.inDeg + byId.get(a)!.outDeg)).forEach((id) => push(id, shortName(byId.get(id)!)));
    tb.slice(3).forEach((id) => push(id, bl(id), false, 700));
    if (state.view === 'race') {
      for (const c of raceSet()) push(c, shortName(byId.get(c)!), false, 700);
      if (RACE_SHARED.size <= (narrow ? 6 : 14)) [...RACE_SHARED].forEach((id) => push(id, shortName(byId.get(id)!), false, 550));
    }
    const targets = d.nodes.filter((n) => n.isTarget && g.hasNode(n.id)).sort((a, b) => Number(!!a.memberOf) - Number(!!b.memberOf) || b.inDeg - a.inDeg);
    for (const n of targets) { const dim = !!FOCUS && !FOCUS.has(n.id); push(n.id, shortName(n), false, dim ? 500 : 650, dim); }
    return L;
  }
  function drawOverlay() {
    const w = container.clientWidth, h = container.clientHeight;
    octx.clearRect(0, 0, w, h);
    const fs = narrowMQ.matches ? 11.5 : 12.5;
    const placed: [number, number, number, number][] = [];
    const vp = (id: string) => { const dd: any = renderer.getNodeDisplayData(id); if (!dd || dd.hidden) return null; const p = renderer.framedGraphToViewport({ x: dd.x, y: dd.y }); return { x: p.x, y: p.y, r: renderer.scaleSize(dd.size) }; };
    const active = state.hovered || state.selected;
    // rings
    const ringIds = new Set<string>([...TOPB]); if (active) ringIds.add(active);
    if (state.view === 'race' && !active) RACE_SHARED.forEach((x) => ringIds.add(x));
    if (active) for (const x of [...ringIds]) if (x !== active && !(FOCUS && FOCUS.has(x))) ringIds.delete(x);
    octx.lineWidth = 1.8; octx.strokeStyle = '#111';
    for (const id of ringIds) { const p = vp(id); if (!p) continue; octx.beginPath(); octx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); octx.stroke(); placed.push([p.x - p.r - 3, p.y - p.r - 3, p.x + p.r + 3, p.y + p.r + 3]); }
    // coalition letters inside big nodes (colour-blind redundancy)
    if (state.colorBy === 'community') {
      for (const n of d.nodes) {
        if (!n.isTarget || n.community < 0 || !g.hasNode(n.id) || (FOCUS && !FOCUS.has(n.id))) continue;
        const p = vp(n.id); if (!p || p.r < 7) continue;
        octx.font = `800 ${Math.min(13, p.r * 1.1)}px ${FONT}`; octx.textAlign = 'center'; octx.textBaseline = 'middle';
        octx.fillStyle = onColor(commColor(n.community)); octx.fillText(LETTERS[n.community], p.x, p.y + 0.5);
      }
      octx.textAlign = 'left'; octx.textBaseline = 'alphabetic';
    }
    // node discs of targets block labels
    for (const n of d.nodes) if (n.isTarget && g.hasNode(n.id)) { const p = vp(n.id); if (p) placed.push([p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r]); }
    const hits = (a: number[]) => placed.some((b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]);
    for (const L of labelPlan()) {
      const p = vp(L.id); if (!p) continue;
      octx.font = `${L.weight} ${fs}px ${FONT}`;
      const tw = octx.measureText(L.text).width; const th = fs;
      const opts: [number, number][] = [[p.x + p.r + 4, p.y + th * 0.35], [p.x - p.r - 4 - tw, p.y + th * 0.35], [p.x - tw / 2, p.y - p.r - 5], [p.x - tw / 2, p.y + p.r + th + 2]];
      let pick: [number, number] | null = null;
      for (const [x, y] of opts) {
        const box = [x - 2, y - th, x + tw + 2, y + 3];
        if (box[0] < 2 || box[2] > w - 2 || box[1] < 2 || box[3] > h - 2) continue;
        if (!hits(box)) { pick = [x, y]; break; }
      }
      if (!pick && L.force) {
        const ov = (bx: number[]) => placed.reduce((a, b) => a + Math.max(0, Math.min(bx[2], b[2]) - Math.max(bx[0], b[0])) * Math.max(0, Math.min(bx[3], b[3]) - Math.max(bx[1], b[1])), 0);
        const inb = opts.filter(([x, y]) => x > 2 && x + tw < w - 2 && y - th > 2 && y < h - 2);
        const extra: [number, number][] = [[p.x + p.r + 4, p.y - th * 0.7], [p.x + p.r + 4, p.y + th * 1.3], [p.x - p.r - 4 - tw, p.y - th * 0.7], [p.x - p.r - 4 - tw, p.y + th * 1.3]];
        const all = [...inb, ...extra.filter(([x, y]) => x > 2 && x + tw < w - 2 && y - th > 2 && y < h - 2)];
        pick = all.sort((a, b) => ov([a[0] - 2, a[1] - th, a[0] + tw + 2, a[1] + 3]) - ov([b[0] - 2, b[1] - th, b[0] + tw + 2, b[1] + 3]))[0] || opts[0];
      }
      if (!pick) continue;
      const [x, y] = pick; placed.push([x - 2, y - th, x + tw + 2, y + 3]);
      octx.lineWidth = 3.5; octx.strokeStyle = 'rgba(255,255,255,0.95)'; octx.lineJoin = 'round';
      octx.strokeText(L.text, x, y); octx.fillStyle = L.dim ? '#757575' : '#111'; octx.fillText(L.text, x, y);
    }
  }
  renderer.on('afterRender', drawOverlay);
  new ResizeObserver(() => { sizeOverlay(); renderer.refresh(); }).observe(container);

  // ---------- camera ----------
  const cam = renderer.getCamera();
  function setFrame() {
    if (narrowMQ.matches && !state.showAll) {
      const core = d.nodes.filter((n) => g.hasNode(n.id) && !n.leaf);
      const xs = core.map((n) => n.x), ys = core.map((n) => n.y);
      renderer.setCustomBBox({ x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] });
    } else renderer.setCustomBBox(null);
  }
  const HOME = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
  const home = () => ({ ...HOME, angle: narrowMQ.matches && !state.showAll ? Math.PI / 2 : 0 });   // portrait screens: turn the wide layout upright
  setFrame(); cam.setState(home());
  const goHome = () => cam.animate(home(), { duration: 300 });
  $('#zin').onclick = () => cam.animatedZoom({ duration: 250 });
  $('#zout').onclick = () => cam.animatedUnzoom({ duration: 250 });
  $('#zreset').onclick = goHome;
  function flyTo(id: string) {
    if (!g.hasNode(id)) return;
    const p = renderer.getNodeDisplayData(id); if (!p) return;
    cam.animate({ x: p.x, y: p.y, ratio: Math.min(cam.ratio, 0.6), angle: cam.angle }, { duration: 450 });
  }

  // ---------- tooltip (pointer devices only) ----------
  const tip = $('#tooltip');
  const hideTip = () => { tip.hidden = true; };
  renderer.on('enterNode', ({ node, event }) => {
    if (!hoverMQ.matches) return;
    state.hovered = node; recompute(); renderer.refresh({ skipIndexation: true });
    const n = byId.get(node)!;
    tip.innerHTML = `<strong>${esc(n.name)}</strong><span>${esc(n.type)}${n.race ? ' · ' + esc(n.race) : ''}</span><span>${n.outDeg ? `Endorses ${n.outDeg}` : ''}${n.outDeg && n.inDeg ? ' · ' : ''}${n.inDeg ? `Endorsed by ${n.inDeg}` : ''}</span>`;
    tip.hidden = false; const w = container.clientWidth; tip.style.left = Math.min(event.x + 14, w - 230) + 'px'; tip.style.top = event.y + 14 + 'px';
    container.style.cursor = 'pointer';
  });
  renderer.on('leaveNode', () => { if (!state.hovered) return; state.hovered = null; recompute(); renderer.refresh({ skipIndexation: true }); hideTip(); container.style.cursor = ''; });
  renderer.on('clickNode', ({ node }) => { hideTip(); state.hovered = null; select(node, false); });
  renderer.on('clickStage', () => { hideTip(); if (state.selected) select(null); });
  container.addEventListener('touchstart', hideTip, { passive: true });

  // ---------- panel helpers ----------
  const panel = $('#panel');
  const N = (id: string) => byId.get(id)!;
  const typeBar = (tc: Map<string, number> | Record<string, number>) => {
    const m = tc instanceof Map ? tc : new Map(Object.entries(tc));
    return `<div class="tbar" role="img" aria-label="${esc([...m].map(([t, v]) => `${v} ${t}`).join(', '))}">${TYPE_ORDER.filter((t) => m.has(t)).map((t) => `<span style="flex:${m.get(t)};background:${TYPE_RAMP[t]}" title="${esc(t)}: ${m.get(t)}"></span>`).join('')}</div>`;
  };
  const typeKey = (types: string[]) => `<p class="tkey small">${TYPE_ORDER.filter((t) => types.includes(t)).map((t) => `<span><i style="background:${TYPE_RAMP[t]}"></i>${esc(t)}</span>`).join('')}</p>`;
  function panelDates(es: GEdge[]) {
    const ds = new Set(es.flatMap((e) => e.src.map((x) => x.at || e.date)).filter(Boolean));
    return ds.size === 1 ? [...ds][0] : null;
  }
  function sourcesHtml(e: GEdge, oneDate: string | null) {
    return `<span class="srcs">${e.src.map((x) => {
      const u = d.urls[x.u];
      const acc = !oneDate && x.at ? ` <span class="acc">(${esc(fmtDate(x.at))})</span>` : '';
      return `<span><a href="${esc(srcHref(u, x.pg))}" target="_blank" rel="noopener" title="${esc(x.ty || '')}">${esc(srcLabel(u))}${x.pg ? `, p. ${esc(x.pg)}` : ''}<span aria-hidden="true"> ↗</span></a>${x.pr ? ' <span class="prim">primary</span>' : ''}${x.sh ? ' <span class="acc">(screenshot archived)</span>' : ''}${acc}</span>`;
    }).join('')}</span>`;
  }
  function edgeRow(e: GEdge, otherId: string, showTitle: boolean, oneDate: string | null) {
    const o = N(otherId);
    const badges: string[] = [];
    if (e.rel !== 'Endorses' && e.kind !== 'member') badges.push(`<span class="badge"${e.rankNote ? ` title="${esc(e.rankNote)}"` : ''}>${esc(e.rel)}</span>`);
    const title = showTitle && e.title ? `<span class="ttl">${esc(e.title)}</span>` : '';
    const rn = e.rankNote ? `<span class="asw">${esc(e.rankNote)}</span>` : '';
    const asw = e.asw && showTitle && !e.asw.split(' | ').every((a) => a === o.name) ? `<span class="asw">as written: ${esc(e.asw)}</span>` : '';
    const chk = '';
    return `<li>${typeGlyph(o.type)}${nlink(o)} ${chip(o.community, commName(ix, d, o.community))} ${badges.join('')}${title}${rn}${asw}${sourcesHtml(e, oneDate)}${chk}</li>`;
  }
  function groupedIn(id: string, oneDate: string | null) {
    const es = (edgesIn.get(id) || []).slice();
    const groups = new Map<string, GEdge[]>();
    for (const e of es) { const t = N(e.s).type; if (!groups.has(t)) groups.set(t, []); groups.get(t)!.push(e); }
    return TYPE_ORDER.filter((t) => groups.has(t)).map((t) => {
      const list = groups.get(t)!.sort((a, b) => (N(b.s).outDeg - N(a.s).outDeg) || N(a.s).name.localeCompare(N(b.s).name));
      const LIM = 12;
      const rows = list.map((e, i) => edgeRow(e, e.s, true, oneDate).replace('<li>', i >= LIM ? '<li class="more" hidden>' : '<li>')).join('');
      const more = list.length > LIM ? `<button class="showmore">Show ${list.length - LIM} more</button>` : '';
      return `<h5>${typeGlyph(t)}${esc(t)} <span class="cnt">${list.length}</span></h5><ul class="elist">${rows}</ul>${more}`;
    }).join('');
  }
  function placement(n: GNode) {
    if (n.isTarget) {
      if (n.community >= 0) { const c = d.communities[n.community]; return `${chip(n.community)} In robust coalition <strong>${esc(LETTERS[c.id])} (${esc(blocName(ix, c))})</strong>: every pair of its candidates is grouped together in at least ${pct(c.weakest.p)} of ${S.seeds} runs.`; }
      const l = d.loose.find((x) => x.id === n.id);
      if (l) return `${chip(-1)} In no robust coalition. Most often grouped with ${listJoin(l.partners.slice(0, 3).map((p) => `${esc(N(p.t).name)} (${pct(p.p)} of runs)`))}.`;
      return `${chip(-1)} Not grouped: no endorsements recorded.`;
    }
    if (n.leaf) return `${chip(n.community)} Backs one candidate only${n.community >= 0 ? `, in coalition ${LETTERS[n.community]}` : ''}.`;
    if (n.community >= 0) return `${chip(n.community)} Grouped with coalition <strong>${LETTERS[n.community]} (${esc(blocName(ix, d.communities[n.community]))})</strong> in ${pct(n.blocScore ?? 0)} of runs, on average.`;
    return `${chip(-1)} In no robust coalition${n.blocScore ? ` (closest: ${pct(n.blocScore)} of runs)` : ''}.`;
  }
  function bridgeMetrics(n: GNode) {
    const b = bridgeById.get(n.id);
    if (n.isTarget) {
      const c = candList.find((x) => x.id === n.id);
      return c ? `<p class="metric">Candidate betweenness: <strong>#${c.rank}</strong> of ${candList.length} candidates and slates. Candidates rank high because their endorsers connect through them.</p>` : '';
    }
    if (!b) return '';
    const sure = (ok: boolean) => (ok ? '<span class="ok">holds up</span>' : '<span class="unsure">less certain</span>');
    return `<p class="metric">Reaches <strong>${b.reach} of ${nCamps(d)} camps</strong> · rank #${b.rankReach} · ${sure(b.robustReach)} (top ${K} in ${pct(b.topReach)} of resamples${b.looWorst ? `; worst rank after removing any one endorsement: #${b.looWorst}` : ''})</p>${b.rankBc ? `<p class="metric small">Betweenness rank #${b.rankBc} · ${sure(b.robustBc)} (top ${K} in ${pct(b.topBc)} of resamples${b.bcLooWorst ? `; worst after one removal: #${b.bcLooWorst}` : ''})${b.bcLooOut?.length ? `. Without its endorsement of ${esc(d.nodes.find((x) => x.id === b.bcLooOut![0].t)!.name)} it would rank ${b.bcLooOut[0].rank ? '#' + b.bcLooOut[0].rank : 'below every other bridge'}` : ''}</p>` : ''}`;
  }
  function nodePanel(id: string) {
    const n = N(id);
    const outs = edgesOut.get(id) || []; const ins = edgesIn.get(id) || [];
    const struct = memberEdges.filter((e) => e.s === id || e.t === id);
    const oneDate = panelDates([...outs, ...ins, ...struct]);
    const titles = [...new Set(outs.map((e) => e.title).filter(Boolean))];
    const sentence = outs.length ? `<p class="sentence">${bridgeSentence(ix, d, id)}</p>` : '';
    const notes = (n.notes || []).map((x) => (x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : esc(x.text))).join(' ');
    let html = `<button class="back" data-back>← Back to ${state.view === 'race' ? 'race view' : state.view}</button>
      <div class="ncard"><p class="ntype">${typeGlyph(n.type)}${esc(n.type)}${n.race ? ` · ${esc(n.race)}` : ''}</p>
      <h3 tabindex="-1" id="ntitle">${esc(n.name)}</h3>
      ${n.typeNote ? `<p class="muted small">${esc(n.typeNote)}</p>` : ''}${notes ? `<p class="small">${notes}</p>` : ''}
      ${titles.length ? `<p class="ttl-main">${titles.slice(0, 2).map(esc).join(' · ')}</p>` : ''}
      <p class="meta">${placement(n)}</p>
      ${n.campaignUrl ? `<p class="meta"><a href="${esc(n.campaignUrl)}" target="_blank" rel="noopener">Campaign site ↗</a>${n.endorsementsPage && n.endorsementsPage !== n.campaignUrl ? ` · <a href="${esc(n.endorsementsPage)}" target="_blank" rel="noopener">Endorsements page ↗</a>` : ''}</p>` : ''}
      ${bridgeMetrics(n)}${sentence}${oneDate ? `<p class="small muted">All sources below accessed ${esc(fmtDate(oneDate))}.</p>` : ''}</div>`;
    const isMem = (e: GEdge) => /member/i.test(e.rel);
    const groups: [string, GEdge[], 's' | 't'][] = [
      ['Members', memberEdges.filter((e) => e.t === id && isMem(e)), 's'], ['Nominated by', memberEdges.filter((e) => e.t === id && !isMem(e)), 's'],
      ['Member of', memberEdges.filter((e) => e.s === id && isMem(e)), 't'], ['Nominated', memberEdges.filter((e) => e.s === id && !isMem(e)), 't'],
    ];
    for (const [h, es, side] of groups) if (es.length) html += `<h4>${h} <span class="cnt">${es.length}</span> <span class="small muted nt">not an endorsement</span></h4><ul class="elist">${es.map((e) => edgeRow(e, side === 's' ? e.s : e.t, false, oneDate)).join('')}</ul>`;
    if (outs.length) html += `<h4>Endorses <span class="cnt">${outs.length}</span></h4><ul class="elist">${outs.map((e) => edgeRow(e, e.t, false, oneDate)).join('')}</ul>`;
    if (ins.length) html += `<h4>Endorsed by <span class="cnt">${ins.length}</span></h4>${groupedIn(id, oneDate)}`;
    if (n.isTarget && !ins.length) html += `<p class="muted">No endorsements recorded for this candidate.</p>`;
    return html;
  }

  function coalitionsPanel() {
    const items = d.communities.map((c) => {
      const pairs: string[] = [];
      for (let i = 0; i < c.targets.length; i++) for (let j = i + 1; j < c.targets.length; j++) pairs.push(`<li>${esc(shortName(N(c.targets[i])))} & ${esc(shortName(N(c.targets[j])))}: <strong>${pct(ix.together(c.targets[i], c.targets[j]))}</strong></li>`);
      return `<li class="coal"><div class="coal-h">${chip(c.id)}<strong>${esc(blocName(ix, c))}</strong></div>
        <p class="coal-c">${c.targets.map((t) => `${nlink(N(t))} <span class="race-tag">${esc(raceShort(N(t).race))}</span>`).join(', ')}</p>
        <p class="small">Every pair grouped together in at least <strong>${pct(c.weakest.p)}</strong> of runs (weakest: ${esc(shortName(N(c.weakest.a)))} & ${esc(shortName(N(c.weakest.b)))}).</p>
        ${pairs.length > 1 ? `<details class="pairs"><summary>All ${pairs.length} pairs</summary><ul>${pairs.join('')}</ul></details>` : ''}
        ${Object.keys(c.typeCounts).length ? `${typeBar(c.typeCounts)}<p class="small muted">${c.size - c.targets.length} endorsers colored with this coalition</p>` : ''}</li>`;
    }).join('');
    const loose = d.loose.map((l) => `<li>${nlink(N(l.id), undefined, 'strong')} <span class="race-tag">${esc(raceShort(N(l.id).race))}</span><br><span class="small">Most often with ${listJoin(l.partners.slice(0, 2).map((p) => `${esc(shortName(N(p.t)))} (${pct(p.p)})`))}</span></li>`).join('');
    const allTypes = [...new Set(d.communities.flatMap((c) => Object.keys(c.typeCounts)))];
    return `<h3 class="ph">${numWord(S.nBlocs).replace(/^./, (x) => x.toUpperCase())} robust coalitions</h3>
      <p class="pintro">A coalition is a group of candidates in which every pair lands in the same cluster in at least ${pct(S.robustThreshold)} of ${S.seeds} runs of the clustering algorithm. Dark lines are endorsements that leave the endorser’s coalition. Click a name for its endorsers and sources.</p>
      <ol class="coals">${items}</ol>${typeKey(allTypes)}
      <h4>Unattached <span class="cnt">${d.loose.length}</span></h4><p class="small muted">In no robust coalition (white dots).</p><ul class="loose">${loose}</ul>`;
  }

  function stackBar(b: Bridge) {
    const m = new Map<string, number>();
    for (const t of b.targets) { const k = campOf(N(t)); m.set(k, (m.get(k) || 0) + 1); }
    const segs = [...m.entries()].sort((a, c) => a[0].localeCompare(c[0])).map(([k, v]) => {
      const c = k.startsWith('b') ? +k.slice(1) : -1;
      return `<span class="seg${c < 0 ? ' none' : ''}" style="flex:${v};${c >= 0 ? `background:${commColor(c)}` : ''}" title="${esc(c >= 0 ? commName(ix, d, c) : shortName(N(k.slice(1))))}: ${v}"></span>`;
    }).join('');
    return `<div class="sbar" role="img" aria-label="${b.reach} camps, ${b.deg} picks">${segs}</div>`;
  }
  function bridgesPanel() {
    const mode = state.bmode;
    let rows = '';
    if (mode === 'cand') {
      const max = Math.max(...candList.map((c) => c.bc), 1e-9);
      rows = candList.slice(0, 15).map((c) => `<li><div class="br-h"><span class="rank">${c.rank}</span>${nlink(N(c.id), undefined, 'strong')}<span class="race-tag">${esc(raceShort(N(c.id).race))}</span></div><div class="br-bar"><span style="width:${(100 * c.bc) / max}%"></span></div></li>`).join('');
    } else {
      const list = (mode === 'bc' ? bcList : reachList).slice(0, 15);
      const rk = (b: Bridge) => (mode === 'bc' ? b.rankBc! : b.rankReach);
      const sure = (b: Bridge) => (mode === 'bc' ? b.robustBc : b.robustReach);
      const max = Math.max(...list.map((b) => b.bc), 1e-9);
      const row = (b: Bridge) => {
        const tie = list.filter((x) => rk(x) === rk(b)).length > 1;
        return `<li class="${sure(b) ? '' : 'unsure-row'}"><div class="br-h"><span class="rank">${tie ? '=' : ''}${rk(b)}</span>${nlink(N(b.id), undefined, 'strong')}<span class="small muted">${esc(N(b.id).type)}</span>${sure(b) ? '' : '<span class="unsure">less certain</span>'}</div>
          ${mode === 'reach' ? `${stackBar(b)}<p class="br-meta">${b.reach} of ${nCamps(d)} camps · ${b.deg} picks · top ${K} in ${pct(b.topReach)} of resamples</p>` : `<div class="br-bar"><span style="width:${(100 * b.bc) / max}%"></span></div><p class="br-meta">top ${K} in ${pct(b.topBc)} of resamples${b.bcLooWorst ? ` · worst rank after removing one endorsement: #${b.bcLooWorst}` : ''}</p>`}
          <p class="sentence small">${bridgeSentence(ix, d, b.id)}</p></li>`;
      };
      const ok = list.filter(sure), un = list.filter((b) => !sure(b));
      rows = `${ok.length ? `<li class="sub">Hold up under resampling <span class="cnt">${ok.length}</span></li>${ok.map(row).join('')}` : ''}${un.length ? `<li class="sub">Less certain <span class="cnt">${un.length}</span></li>${un.map(row).join('')}` : ''}`;
    }
    const expl = mode === 'cand' ? '<p class="small">Candidates score high on betweenness mainly because all their endorsers connect through them. Shown for reference only; ranks, not scores, because the differences are small.</p>'
      : mode === 'reach' ? `<p class="small"><strong>Camps reached</strong>: how many of the ${nCamps(d)} camps (${numWord(S.nBlocs)} coalitions plus ${numWord(S.nLoose)} unattached candidates or slates) an endorser’s picks land in. Each bar shows the endorser’s picks, colored by camp; white segments are unattached candidates.</p>`
        : '<p class="small"><strong>Betweenness</strong>: trace the shortest chain of endorsements between every pair of actors; how often does it pass through this endorser? Bars show relative size; ranks, not scores, because the differences are small.</p>';
    return `<h3 class="ph">Who bridges the camps</h3>
      <p class="pintro">People and groups (not candidates) who back at least two candidates. “Holds up” means the endorser stays in the top ${K} in at least ${pct(S.bootstrap.robustShare)} of ${S.bootstrap.resamples} resamples (each dropping ${pct(S.bootstrap.dropShare)} of endorsements) and after removing any single endorsement.</p>
      <div class="seg" role="group" aria-label="Ranking"><button data-bsort="reach" aria-pressed="${mode === 'reach'}">Camps reached</button><button data-bsort="bc" aria-pressed="${mode === 'bc'}">Betweenness</button><button data-bsort="cand" aria-pressed="${mode === 'cand'}">Candidates</button></div>
      ${expl}<ol class="bridges">${rows}</ol>`;
  }

  function racePanel() {
    const r = d.races.find((x) => x.race === state.race)!;
    const opts = d.races.map((x) => `<button data-race="${esc(x.race)}" aria-pressed="${x.race === state.race}">${esc(x.race)}</button>`).join('');
    const cands = r.candidates.map(N);
    const types = new Set<string>();
    const cards = cands.map((n) => {
      const ins = edgesIn.get(n.id) || [];
      const tc = new Map<string, number>(); for (const e of ins) { const t = N(e.s).type; types.add(t); tc.set(t, (tc.get(t) || 0) + 1); }
      return `<li class="rc">${chip(n.community, commName(ix, d, n.community))}${nlink(n, undefined, 'strong')}<span class="num">${ins.length}</span>${ins.length ? typeBar(tc) : `<p class="small muted">${n.memberOf ? 'No individual endorsements; see the slate' : 'No endorsements recorded'}</p>`}</li>`;
    }).join('');
    const m = new Map<string, string[]>();
    for (const c of r.candidates) for (const e of edgesIn.get(c) || []) { if (!m.has(e.s)) m.set(e.s, []); m.get(e.s)!.push(c); }
    const shared = [...m.entries()].filter(([, cs]) => cs.length >= 2).sort((a, b) => b[1].length - a[1].length || N(a[0]).name.localeCompare(N(b[0]).name));
    const sharedHtml = shared.length ? `<ul class="shared">${shared.map(([s, cs]) => `<li>${typeGlyph(N(s).type)}${nlink(N(s))} <span class="small muted">→ ${cs.map((c) => esc(shortName(N(c)))).join(', ')}</span></li>`).join('')}</ul>`
      : '<p class="muted small">No endorser backs more than one candidate in this race.</p>';
    // Rent Board vs council
    let rbc = '';
    if (r.race === 'Rent Board') {
      const units: { label: string; ids: string[]; rep: string }[] = [];
      if (ix.slate) units.push({ label: 'Slate (page + members)', ids: [ix.slate.id, ...ix.slateMembers], rep: ix.slate.id });
      for (const n of cands) if (n.type !== 'Slate' && !n.memberOf) units.push({ label: shortName(n), ids: [n.id], rep: n.id });
      const council = d.nodes.filter((n) => n.isTarget && (n.race || '').startsWith('Council') && n.inDeg > 0);
      const endSet = (ids: string[]) => new Set(ids.flatMap((i) => (edgesIn.get(i) || []).map((e) => e.s)));
      rbc = units.map((u) => {
        const U = endSet(u.ids);
        const rows = council.map((c) => { const C = endSet([c.id]); const sh = [...U].filter((x) => C.has(x)).length; const p = Math.max(...u.ids.map((i) => ix.together(i, c.id))); return { c, sh, p }; })
          .filter((x) => x.sh > 0).sort((a, b) => b.p - a.p || b.sh - a.sh).slice(0, 6);
        return `<h5>${esc(u.label)}</h5><table class="mini"><thead><tr><th scope="col">Council candidate</th><th scope="col" class="num">Shared endorsers</th><th scope="col" class="num">Grouped together</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${nlink(x.c)} <span class="race-tag">${esc(raceShort(x.c.race))}</span></td><td class="num">${x.sh}</td><td class="num">${pct(x.p)}</td></tr>`).join('')}</tbody></table>`;
      }).join('');
      rbc = `<h4>Shared with council candidates</h4><p class="small muted">“Grouped together” is the highest share of ${S.seeds} runs in which the unit and the council candidate share a cluster.</p>${rbc}`;
    }
    return `<h3 class="ph">Compare a race</h3><div class="seg wrap" role="group" aria-label="Race">${opts}</div>
      <ul class="rcs">${cards}</ul>${typeKey([...types])}${rbc}
      <h4>Endorsers shared within the race <span class="cnt">${shared.length}</span></h4>${sharedHtml}`;
  }

  function renderPanel() {
    panel.innerHTML = state.selected ? nodePanel(state.selected) : state.view === 'coalitions' ? coalitionsPanel() : state.view === 'bridges' ? bridgesPanel() : racePanel();
    panel.scrollTop = 0;
    $('#pill').hidden = !(state.selected && stackMQ.matches);
  }
  function renderLegend() {
    const L = $('#legend');
    const items = state.colorBy === 'community'
      ? d.communities.map((c) => `<li>${chip(c.id)}<span>${esc(blocName(ix, c))}</span></li>`).join('') + `<li><span class="dot none"></span><span>No robust coalition</span></li>`
      : TYPE_ORDER.filter((t) => d.nodes.some((n) => n.type === t)).map((t) => `<li><span class="dot" style="background:${TYPE_RAMP[t]}"></span><span>${esc(t)}</span></li>`).join('');
    const ring = state.view === 'coalitions' ? 'ringed: top 5 bridges that hold up' : state.view === 'bridges' ? `ringed and numbered: top ${narrowMQ.matches ? 5 : K} by ${state.bmode === 'reach' ? 'camps reached' : state.bmode === 'bc' ? 'betweenness' : 'candidate betweenness'} (number = rank)` : 'ringed: endorsers shared by 2+ candidates in this race';
    L.innerHTML = `<ul>${items}<li><span class="dot" style="background:${LEAF}"></span><span>backs one candidate${state.showAll ? '' : ' (faded)'}</span></li></ul>
      <p>${narrowMQ.matches ? `<span class="lline"></span>endorsement <span class="lline dark"></span>leaves its coalition${memberEdges.length ? ' <span class="lline mem"></span>slate link' : ''} · <span class="ringk"></span>${state.view === 'race' ? 'shared endorser' : 'top bridge'}` : `<span class="lline"></span>endorsement <span class="lline dark"></span>leaves the endorser’s coalition ${memberEdges.length ? '<span class="lline mem"></span>slate membership (not an endorsement)' : ''} · <span class="ringk"></span>${ring} · dot size: endorsements (log scale)`}</p>`;
  }
  function renderTray() {
    const t = $('#tray');
    t.innerHTML = isolated.length ? `<strong>No endorsements recorded:</strong> ${isolated.map((n) => `${nlink(n)}${n.race ? ` <span class="race-tag">${esc(n.race)}</span>` : ''}`).join(', ')}` : '';
    t.hidden = !isolated.length;
  }

  // ---------- interactions ----------
  function select(id: string | null, fly = true) {
    const had = state.selected;
    state.selected = id; recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); syncHash();
    if (id && fly) flyTo(id);
    if (!id && had) goHome();
  }
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  function setView(v: View) {
    state.view = v; state.selected = null;
    tabs.forEach((b) => { const on = b.dataset.view === v; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    panel.setAttribute('aria-labelledby', `tab-${v}`);
    recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); renderLegend(); syncHash();
  }
  tabs.forEach((b) => {
    b.addEventListener('click', () => { setView(b.dataset.view as View); goHome(); });
    b.addEventListener('keydown', (ev) => {
      const i = tabs.indexOf(b); let j = -1;
      if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length; else if (ev.key === 'ArrowLeft') j = (i + tabs.length - 1) % tabs.length;
      else if (ev.key === 'Home') j = 0; else if (ev.key === 'End') j = tabs.length - 1;
      if (j >= 0) { ev.preventDefault(); tabs[j].focus(); tabs[j].click(); }
    });
  });
  $('#pill').addEventListener('click', () => { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); ($('#ntitle') as HTMLElement | null)?.focus({ preventScroll: true }); });
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const nb = t.closest<HTMLElement>('[data-node]');
    if (nb) {
      ev.preventDefault(); const id = nb.dataset.node!;
      if (!panel.contains(nb) && !$('#explore').contains(nb)) $('#explore').scrollIntoView({ behavior: 'smooth' });
      select(id); return;
    }
    if (t.closest('[data-back]')) { select(null); return; }
    const rb = t.closest<HTMLElement>('[data-race]'); if (rb) { state.race = rb.dataset.race!; recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); syncHash(); return; }
    const bs = t.closest<HTMLElement>('[data-bsort]'); if (bs) { state.bmode = bs.dataset.bsort as BMode; recompute(); renderer.refresh({ skipIndexation: true }); renderPanel(); renderLegend(); syncHash(); return; }
    const sm = t.closest<HTMLButtonElement>('.showmore');
    if (sm) { sm.previousElementSibling?.querySelectorAll('li.more').forEach((li) => ((li as HTMLElement).hidden = false)); sm.remove(); }
  });
  $<HTMLInputElement>('#showall').addEventListener('change', (e) => { state.showAll = (e.target as HTMLInputElement).checked; setFrame(); cam.setState(home()); recompute(); renderer.refresh(); renderLegend(); });
  $<HTMLSelectElement>('#colorby').addEventListener('change', (e) => { state.colorBy = (e.target as HTMLSelectElement).value as any; renderer.refresh({ skipIndexation: true }); renderLegend(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.selected) select(null); });
  narrowMQ.addEventListener('change', () => { setFrame(); cam.setState(home()); recompute(); renderer.refresh(); renderLegend(); });

  // ---------- search (ARIA combobox) ----------
  const q = $<HTMLInputElement>('#q'); const qres = $('#qres');
  const searchIdx = d.nodes.map((n) => ({ id: n.id, key: norm([n.name, ...n.variants].join(' | ')) }));
  let hits: string[] = []; let hi = 0;
  function renderHits() {
    qres.innerHTML = hits.map((id, i) => { const n = N(id); return `<li role="option" id="opt-${i}" aria-selected="${i === hi}" data-hit="${esc(id)}">${typeGlyph(n.type)}<span>${esc(n.name)}</span><small>${esc(n.type)}${n.race ? ' · ' + esc(n.race) : ''}</small></li>`; }).join('')
      || (q.value.trim() ? '<li class="none" role="option" aria-disabled="true" aria-selected="false">No match</li>' : '');
    const open = !!q.value.trim();
    qres.hidden = !open; q.setAttribute('aria-expanded', String(open));
    if (hits.length) q.setAttribute('aria-activedescendant', `opt-${hi}`); else q.removeAttribute('aria-activedescendant');
  }
  q.addEventListener('input', () => {
    const s = norm(q.value.trim()); hi = 0;
    hits = s ? searchIdx.filter((x) => x.key.includes(s)).map((x) => x.id)
      .sort((a, b) => (Number(norm(N(b).name).startsWith(s)) - Number(norm(N(a).name).startsWith(s))) || (N(b).outDeg + N(b).inDeg - N(a).outDeg - N(a).inDeg)).slice(0, 8) : [];
    renderHits();
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { hi = Math.min(hi + 1, hits.length - 1); renderHits(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { hi = Math.max(hi - 1, 0); renderHits(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); choose(hits[hi]); }
    else if (e.key === 'Escape') { qres.hidden = true; q.setAttribute('aria-expanded', 'false'); }
  });
  qres.addEventListener('mousedown', (e) => { const li = (e.target as HTMLElement).closest<HTMLElement>('[data-hit]'); if (li) { e.preventDefault(); choose(li.dataset.hit!); } });
  q.addEventListener('blur', () => setTimeout(() => { qres.hidden = true; q.setAttribute('aria-expanded', 'false'); }, 120));
  function choose(id: string) { q.value = N(id).name; qres.hidden = true; q.setAttribute('aria-expanded', 'false'); select(id); }

  // ---------- hash ----------
  let applying = false;
  function syncHash() {
    if (applying) return;
    const p = new URLSearchParams();
    if (state.view !== 'coalitions') p.set('view', state.view);
    if (state.view === 'race' && state.race !== 'Rent Board') p.set('race', state.race);
    if (state.view === 'bridges' && state.bmode !== 'reach') p.set('rank', state.bmode);
    if (state.selected) p.set('node', state.selected);
    const h = p.toString(); const want = h ? '#' + h : '';
    if (location.hash !== want) history.replaceState(null, '', want || location.pathname + location.search);
  }
  function applyHash() {
    applying = true;
    const hp = new URLSearchParams(location.hash.slice(1));
    const v = hp.get('view'); const race = hp.get('race'); const rank = hp.get('rank');
    if (race && d.races.some((r) => r.race === race)) state.race = race;
    if (rank && ['reach', 'bc', 'cand'].includes(rank)) state.bmode = rank as BMode;
    setView(v === 'bridges' || v === 'race' ? (v as View) : 'coalitions');
    const node = hp.get('node');
    if (node && byId.has(node)) select(node, true);
    applying = false;
  }
  window.addEventListener('hashchange', applyHash);

  renderTray(); applyHash(); recompute(); renderPanel(); renderLegend(); renderer.refresh();
  renderHeatmap(d); renderOverlap(d);
  (window as any).__test = {
    pos: (id: string) => { const dd: any = renderer.getNodeDisplayData(id); return dd ? renderer.framedGraphToViewport({ x: dd.x, y: dd.y }) : null; },
    byName: (n: string) => ix.byName.get(n)?.id, state,
  };
  (window as any).__ready = true;
}

// ---------- co-assignment heatmap (real table) ----------
function heat(v: number) { const l = 98 - v * 74; return `hsl(222 ${35 + v * 35}% ${l}%)`; }
function renderHeatmap(d: Data) {
  const ix = index(d);
  const order = [...d.communities.flatMap((c) => c.targets), ...d.loose.map((l) => l.id)];
  const ids = order.filter((id, i) => order.indexOf(id) === i);
  const N = (id: string) => ix.byId.get(id)!;
  const lab = (id: string) => { const n = N(id); return n.type === 'Slate' ? 'Slate page' : `${shortName(n).split(' ').pop()}${n.memberOf ? ' (slate)' : ''}`; };
  let h = `<table class="hm"><caption class="sr">Share of ${d.summary.seeds} clustering runs in which each pair of candidates is grouped together</caption><thead><tr><td></td>${ids.map((id) => `<th scope="col"><span>${chip(N(id).community)} ${esc(lab(id))}</span></th>`).join('')}</tr></thead><tbody>`;
  for (const a of ids) {
    h += `<tr><th scope="row">${chip(N(a).community)} ${esc(lab(a))} <small>${esc(raceShort(N(a).race))}</small></th>`;
    for (const b of ids) {
      const ca = N(a).community, cb = N(b).community;
      const same = ca >= 0 && ca === cb;
      if (a === b) { h += `<td class="diag${same ? ' blk' : ''}" ${same ? `style="--bc:${commColor(ca)}"` : ''}><span class="sr">same candidate</span></td>`; continue; }
      const v = ix.together(a, b); const bg = heat(v); const fg = contrast('#ffffff', bg) >= 4.5 ? '#fff' : '#111';
      h += `<td class="${same ? 'blk' : ''}" style="background:${bg};color:${fg};${same ? `--bc:${commColor(ca)}` : ''}" title="${esc(N(a).name)} & ${esc(N(b).name)}: together in ${pct(v)} of runs">${Math.round(v * 100)}</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  document.getElementById('heatmap')!.innerHTML = h;
}

// ---------- normalized overlap matrix (real table, lower triangle) ----------
function renderOverlap(d: Data) {
  const ix = index(d); const N = (id: string) => ix.byId.get(id)!;
  const memberSet = new Set(ix.slateMembers);
  const order = [...d.communities.flatMap((c) => c.targets), ...d.loose.map((l) => l.id)];
  const ids = order.filter((id, i) => order.indexOf(id) === i && !memberSet.has(id) && N(id).inDeg > 0);
  const ov = new Map<string, Data['overlap'][number]>();
  for (const o of d.overlap) { ov.set(o.a + '|' + o.b, o); ov.set(o.b + '|' + o.a, o); }
  const el = document.getElementById('overlap')!;
  let metric: 'j' | 'oc' | 'n' = 'j';
  const draw = () => {
    const vals = d.overlap.filter((o) => ids.includes(o.a) && ids.includes(o.b)).map((o) => o[metric]);
    const max = Math.max(...vals, 1e-9);
    const fmt = (o: Data['overlap'][number]) => (metric === 'n' ? String(o.n) : String(Math.round(o[metric] * 100)));
    const lab = (id: string) => (N(id).type === 'Slate' ? 'Right to Housing slate' : shortName(N(id)));
    let h = `<table class="ovt"><caption class="sr">Endorser overlap between candidates (${metric === 'j' ? 'Jaccard similarity, percent' : metric === 'oc' ? 'shared endorsers as a percent of the smaller list' : 'number of shared endorsers'})</caption><thead><tr><td></td>${ids.slice(0, -1).map((id) => `<th scope="col"><span>${esc(lab(id))}</span></th>`).join('')}</tr></thead><tbody>`;
    ids.forEach((a, i) => {
      if (i === 0) return;
      h += `<tr><th scope="row">${chip(N(a).community)} ${esc(lab(a))} <small>${esc(raceShort(N(a).race))}</small></th>`;
      ids.slice(0, -1).forEach((b, j) => {
        if (j >= i) { h += '<td class="void"></td>'; return; }
        const o = ov.get(a + '|' + b);
        if (!o) { h += '<td class="zero"><span class="sr">none</span></td>'; return; }
        const t = Math.sqrt(o[metric] / max); const bg = heat(t); const fg = contrast('#ffffff', bg) >= 4.5 ? '#fff' : '#111';
        h += `<td tabindex="0" data-a="${esc(a)}" data-b="${esc(b)}" style="background:${bg};color:${fg}">${fmt(o)}</td>`;
      });
      h += '</tr>';
    });
    h += '</tbody></table><div id="ovtip" class="ovtip" hidden></div>';
    el.querySelector('.ovwrap')!.innerHTML = h;
  };
  el.innerHTML = `<div class="seg" role="group" aria-label="Overlap measure"><button data-m="j" aria-pressed="true">Jaccard (% of combined lists)</button><button data-m="oc" aria-pressed="false">% of smaller list</button><button data-m="n" aria-pressed="false">Raw count</button></div><div class="ovwrap"></div>`;
  draw();
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (b) { metric = b.dataset.m as any; el.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); return; }
    const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-a]'); if (c) show(c);
  });
  const show = (cell: HTMLElement) => {
    const tip = document.getElementById('ovtip')!;
    const a = cell.dataset.a!, b = cell.dataset.b!; const o = ov.get(a + '|' + b); if (!o) { tip.hidden = true; return; }
    const names = o.shared.map((s) => N(s).name);
    tip.innerHTML = `<strong>${esc(N(a).name)} & ${esc(N(b).name)}</strong><br>${o.n} shared ${plural(o.n, 'endorser')} · ${pct(o.j)} of combined lists · ${pct(o.oc)} of the smaller list<br>${esc(listJoin(names.slice(0, 14)))}${names.length > 14 ? ` and ${names.length - 14} more` : ''}`;
    const r = cell.getBoundingClientRect(), wrap = el.querySelector('.ovwrap')!, pr = wrap.getBoundingClientRect();
    tip.style.left = Math.max(0, Math.min(r.left - pr.left + wrap.scrollLeft, wrap.scrollWidth - 310)) + 'px'; tip.style.top = r.bottom - pr.top + 6 + 'px'; tip.hidden = false;
  };
  el.addEventListener('mouseover', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-a]'); if (c) show(c); });
  el.addEventListener('focusin', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-a]'); if (c) show(c); });
  el.addEventListener('mouseleave', () => { const t = document.getElementById('ovtip'); if (t) t.hidden = true; });
}

main().catch((err) => { console.error(err); const p = document.getElementById('panel'); if (p) p.innerHTML = '<p>Could not load the graphic data.</p>'; });
