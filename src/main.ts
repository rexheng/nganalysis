import './fonts.css';
import './style.css';
import Graph from 'graphology';
import Sigma from 'sigma';
import { createNormalizationFunction, graphExtent, matrixFromCamera, multiplyVec2 } from 'sigma/utils';
import { createNodeBorderProgram } from '@sigma/node-border';
import type { Data, GNode, GEdge } from './types';
import { logoUrl } from './logos';
import {
  commColor, commName, LETTERS, esc, index, listJoin, numWord, chip, nlink, typeGlyph, TYPE_ORDER, TYPE_RAMP,
  blocName, pct, raceShort, shortName, surname, onColor, plural, pctCut, weakPct, marginLabel, nearMisses,
  intactNote, intactWords, initials,
} from './text';

const LEAF = '#c4c4c4', DIM = '#f1f1f1', DIM_BORDER = '#e2e2e2';
type View = 'coalitions' | 'race';
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const fmtDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const narrowMQ = window.matchMedia('(max-width: 640px)');
const stackMQ = window.matchMedia('(max-width: 899px)');
const hoverMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
const midMQ = window.matchMedia('(max-width: 1279px)');   // below 1280 px, ring names show only on hover, focus or tap

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function main() {
  const d: Data = await fetch('/data/graph.json').then((r) => r.json());
  await tick();
  const ix = index(d);
  const { byId } = ix;
  const S = d.summary; const T = S.robustThreshold;
  const edgesOut = new Map<string, GEdge[]>(); const edgesIn = new Map<string, GEdge[]>();
  const memberEdges = d.edges.filter((e) => e.kind === 'member');
  for (const e of d.edges) {
    if (e.kind === 'member') continue;
    (edgesOut.get(e.s) || edgesOut.set(e.s, []).get(e.s)!).push(e);
    (edgesIn.get(e.t) || edgesIn.set(e.t, []).get(e.t)!).push(e);
  }
  const isolated = d.nodes.filter((n) => n.inDeg + n.outDeg === 0 && !memberEdges.some((e) => e.s === n.id || e.t === n.id));
  const isoSet = new Set(isolated.map((n) => n.id));
  const state = { view: 'coalitions' as View, selected: null as string | null, hovered: null as string | null, showAll: false,
    colorBy: 'community' as 'community' | 'type', race: d.races.find((r) => r.race === 'Rent Board')?.race || d.races[0].race };

  // ---------- graph ----------
  const g = new Graph({ type: 'directed', multi: false });
  const baseSize = (n: GNode) => (n.isTarget ? 4 + 2.1 * Math.log2(1 + n.inDeg) : n.leaf ? 2.5 : Math.min(8, 2.4 + 1.1 * Math.sqrt(n.outDeg)));
  for (const n of d.nodes) if (!isoSet.has(n.id)) g.addNode(n.id, { x: n.x, y: n.y, size: baseSize(n), label: n.name, color: commColor(n.community) });
  for (const e of d.edges) if (g.hasNode(e.s) && g.hasNode(e.t) && !g.hasEdge(e.s, e.t)) g.addDirectedEdgeWithKey(e.id, e.s, e.t, { size: 1, kind: e.kind });

  await tick();
  const raceSet = () => new Set(d.races.find((r) => r.race === state.race)?.candidates || []);
  const neighbors = (id: string) => (g.hasNode(id) ? new Set([id, ...g.neighbors(id)]) : new Set([id]));
  const isCand = (n: GNode) => n.isTarget && !n.analysisEndorser;

  let FOCUS: Set<string> | null = null; let RACE_SHARED = new Set<string>();
  function recompute() {
    const f = state.hovered || state.selected;
    RACE_SHARED = new Set();
    if (state.view === 'race') {
      const cnt = new Map<string, number>();
      for (const c of raceSet()) for (const e of edgesIn.get(c) || []) cnt.set(e.s, (cnt.get(e.s) || 0) + 1);
      for (const [m, k] of cnt) if (k >= 2) RACE_SHARED.add(m);
    }
    if (f) FOCUS = neighbors(f);
    else if (state.view === 'race') {
      const s = new Set<string>();
      for (const c of raceSet()) { if (!g.hasNode(c)) continue; s.add(c); for (const m of g.inNeighbors(c)) s.add(m); }
      for (const e of memberEdges) if (raceSet().has(e.s) || raceSet().has(e.t)) { s.add(e.s); s.add(e.t); }
      FOCUS = s;
    } else FOCUS = null;
  }

  // ---------- filter: endorser types and races (AND); candidates stay unless their race is off ----------
  const FTYPES = [
    { k: 'people', label: 'Individuals', types: ['Individual'] },
    { k: 'officials', label: 'Elected officials', types: ['Current elected official', 'Former elected official'] },
    { k: 'unions', label: 'Unions', types: ['Union'] },
    { k: 'clubs', label: 'Clubs and parties', types: ['Democratic club', 'Political party'] },
    { k: 'advocacy', label: 'Advocacy groups', types: ['Political/advocacy org'] },
  ];
  const RACES = d.races.map((r) => r.race);
  const filt = { hideT: new Set<string>(), hideR: new Set<string>() };
  let HIDDEN = new Set<string>();
  const ftKey = (t: string) => FTYPES.find((f) => f.types.includes(t))?.k;
  function computeHidden() {
    const H = new Set<string>();
    if (filt.hideT.size || filt.hideR.size) {
      for (const n of d.nodes) {
        if (!g.hasNode(n.id)) continue;
        if (n.isTarget) { if (n.race && filt.hideR.has(n.race)) H.add(n.id); }
        else { const k = ftKey(n.type); if (k && filt.hideT.has(k)) H.add(n.id); }
      }
      // endorsers left with no visible link are hidden too
      for (const n of d.nodes) if (g.hasNode(n.id) && !n.isTarget && !H.has(n.id) && !g.neighbors(n.id).some((m) => !H.has(m))) H.add(n.id);
      if (state.selected) H.delete(state.selected);   // the selected node always stays on screen
    }
    HIDDEN = H;
  }
  const shownE = (e: GEdge) => !HIDDEN.has(e.s) && !HIDDEN.has(e.t);

  const container = $('#graph');
  const BorderProgram = createNodeBorderProgram({
    borders: [
      { size: { attribute: 'borderSize', defaultValue: 0, mode: 'pixels' }, color: { attribute: 'borderColor', defaultValue: '#555' } },
      { size: { fill: true }, color: { attribute: 'color' } },
    ],
    drawLabel: undefined, drawHover: undefined,
  });
  const SETTINGS: any = {
    renderLabels: false, renderEdgeLabels: false, zIndex: true, stagePadding: 18, minCameraRatio: 0.06, maxCameraRatio: 2.5,
    defaultNodeType: 'border', nodeProgramClasses: { border: BorderProgram as any }, defaultEdgeColor: '#d6d6d6',
    defaultDrawNodeHover: () => undefined,
    nodeReducer: (id: string, attr: any) => {
      if (HIDDEN.has(id)) return { ...attr, hidden: true };
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
      if (state.view === 'race' && !active && RACE_SHARED.has(id)) { r.size = Math.max(attr.size * 1.3, 5); r.zIndex = 4; }
      if (active === id) { r.zIndex = 6; r.size = Math.max(attr.size * 1.45, 9); r.borderSize = 2.5; r.borderColor = '#111111'; }
      else if (active && inFocus) r.zIndex = Math.max(r.zIndex, 4);
      return r;
    },
    edgeReducer: (eid: string, attr: any) => {
      const s = g.source(eid), t = g.target(eid); const r: any = { ...attr };
      const sn = byId.get(s)!;
      const active = state.hovered || state.selected;
      const isMember = attr.kind === 'member';
      if (HIDDEN.has(s) || HIDDEN.has(t)) { r.hidden = true; return r; }
      edgeStyle(); return r;
      function edgeStyle() {
      if (active) {   // the selected node's own endorsements, drawn dark and heavy; every other line is hidden
        if (s === active || t === active) { r.color = '#111111'; r.size = isMember ? 2.6 : 2; r.zIndex = 3; } else r.hidden = true;
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
      if (state.view === 'race') {
        if (raceSet().has(t)) { r.color = RACE_SHARED.has(s) ? '#2b2b2b' : 'rgba(110,110,110,0.4)'; r.size = RACE_SHARED.has(s) ? 1.3 : 0.8; r.zIndex = RACE_SHARED.has(s) ? 2 : 1; }
        else r.hidden = true;
      } else { r.color = 'rgba(90,90,90,0.38)'; r.size = 1; }
      return r;
      }
    },
  };
  let renderer: Sigma | null = null;
  // Until the first interaction the graph is a 2D-canvas preview drawn with sigma's own camera math and the same
  // reducers, so the page becomes interactive without paying for WebGL set-up during load.
  const preview = document.createElement('canvas'); preview.className = 'preview'; preview.setAttribute('aria-hidden', 'true');
  container.appendChild(preview);
  const pctx = preview.getContext('2d')!;
  const pvPos = new Map<string, { x: number; y: number; r: number }>();
  let bbox: { x: [number, number]; y: [number, number] } | null = null;
  let pvFrame = 0;
  function drawPreview() {
    pvFrame = 0;
    if (renderer) return;
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (preview.width !== Math.round(w * dpr) || preview.height !== Math.round(h * dpr)) { preview.width = Math.round(w * dpr); preview.height = Math.round(h * dpr); preview.style.width = w + 'px'; preview.style.height = h + 'px'; }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0); pctx.clearRect(0, 0, w, h);
    const ext = bbox || graphExtent(g);
    const normF = createNormalizationFunction(ext);
    const M = matrixFromCamera(home(), { width: w, height: h }, { width: ext.x[1] - ext.x[0] || 1, height: ext.y[1] - ext.y[0] || 1 }, SETTINGS.stagePadding);
    pvPos.clear();
    const nd: any[] = [];
    g.forEachNode((id, a) => {
      const r: any = SETTINGS.nodeReducer(id, a); if (r.hidden) return;
      const v = multiplyVec2(M, normF({ x: a.x, y: a.y }) as any);
      const X = ((1 + v.x) * w) / 2, Y = ((1 - v.y) * h) / 2;
      pvPos.set(id, { x: X, y: Y, r: r.size }); nd.push({ ...r, X, Y });
    });
    const ed: any[] = [];
    g.forEachEdge((eid, a, s_, t_) => { const r: any = SETTINGS.edgeReducer(eid, a); if (r.hidden) return; const p1 = pvPos.get(s_), p2 = pvPos.get(t_); if (p1 && p2) ed.push({ ...r, p1, p2 }); });
    ed.sort((x, y) => (x.zIndex || 0) - (y.zIndex || 0));
    pctx.lineCap = 'butt';
    for (const e of ed) { pctx.strokeStyle = e.color || SETTINGS.defaultEdgeColor; pctx.lineWidth = Math.max(0.6, e.size || 1); pctx.beginPath(); pctx.moveTo(e.p1.x, e.p1.y); pctx.lineTo(e.p2.x, e.p2.y); pctx.stroke(); }
    nd.sort((x, y) => (x.zIndex || 0) - (y.zIndex || 0));
    for (const n of nd) {
      if (n.borderSize > 0) { pctx.fillStyle = n.borderColor; pctx.beginPath(); pctx.arc(n.X, n.Y, n.size, 0, Math.PI * 2); pctx.fill(); }
      pctx.fillStyle = n.color; pctx.beginPath(); pctx.arc(n.X, n.Y, Math.max(0, n.size - (n.borderSize || 0)), 0, Math.PI * 2); pctx.fill();
    }
    drawOverlay();
  }
  /** redraw: sigma once it exists, the preview until then */
  const refresh = (opts?: any) => { if (renderer) renderer.refresh(opts); else if (!pvFrame) pvFrame = requestAnimationFrame(drawPreview); };

  await tick();
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
  type Lab = { id: string; texts: string[]; force: boolean; weight: number; dim?: boolean };
  const lblName = (n: GNode) => (n.type === 'Slate' ? n.name : shortName(n));
  const altName = (n: GNode) => (n.type === 'Slate' ? 'Slate' : /Individual|official|Candidate/.test(n.type) ? surname(n) : lblName(n));
  let peek: string | null = null;   // a node whose name is hovered or focused in the panel or legend
  function labelPlan(): Lab[] {
    const L: Lab[] = []; const narrow = narrowMQ.matches;
    const active = state.hovered || state.selected;
    const push = (id: string, texts: string[], force = false, weight = 600, dim = false) => {
      if (!g.hasNode(id) || L.some((l) => l.id === id)) return;
      const tx = texts.filter((t, i) => t && texts.indexOf(t) === i);
      L.push({ id, texts: tx, force, weight, dim });
    };
    if (active) { const n = byId.get(active)!; push(active, [n.name, lblName(n), altName(n)], true, 750); }
    if (peek && peek !== active && (!FOCUS || FOCUS.has(peek))) { const n = byId.get(peek)!; push(peek, [lblName(n), altName(n)], true, 750); }
    // every candidate, at every width (dimmed when outside the focus)
    const cands = d.nodes.filter((n) => n.isTarget && g.hasNode(n.id)).sort((a, b) => Number(!!a.memberOf) - Number(!!b.memberOf) || b.inDeg - a.inDeg);
    const nbs = active && FOCUS ? [...FOCUS].filter((x) => x !== active) : [];
    const nbForce = nbs.length <= 40;
    const cn = (n: GNode) => (narrow ? [altName(n)] : [lblName(n), altName(n)]);
    for (const n of cands) if (!FOCUS || FOCUS.has(n.id)) push(n.id, cn(n), true, 650);
    // every neighbour of the selected node (all of them when there are up to 40; otherwise those with 2+ links)
    nbs.sort((a, b) => (byId.get(b)!.inDeg + byId.get(b)!.outDeg) - (byId.get(a)!.inDeg + byId.get(a)!.outDeg))
      .forEach((id, i) => { const n = byId.get(id)!; if (nbForce || i < (narrow ? 12 : 30)) push(id, [lblName(n), altName(n)], true, 600); else if (!n.leaf) push(id, [lblName(n), altName(n)], false, 550); });
    if (state.view === 'race') {
      for (const c of raceSet()) { const n = byId.get(c)!; push(c, [lblName(n), altName(n)], true, 700); }
      if (RACE_SHARED.size <= (narrow ? 8 : 16)) [...RACE_SHARED].forEach((id) => { const n = byId.get(id)!; push(id, [lblName(n), altName(n)], false, 550); });
    }
    // a filtered view with few endorsers left: name them too
    if (HIDDEN.size && !active) {
      const rest = d.nodes.filter((n) => !n.isTarget && g.hasNode(n.id) && !HIDDEN.has(n.id) && (state.showAll || !n.leaf));
      if (rest.length <= 40) rest.sort((a, b) => b.outDeg - a.outDeg).forEach((n) => push(n.id, [lblName(n), altName(n)], false, 550));
    }
    for (const n of cands) push(n.id, cn(n), true, 500, true);
    return L;
  }
  function drawOverlay() {
    const w = container.clientWidth, h = container.clientHeight;
    octx.clearRect(0, 0, w, h);
    const fs = narrowMQ.matches ? 12 : 12.5;
    const placed: [number, number, number, number][] = [];
    const R = renderer;
    const vp = (id: string) => { if (!R) return pvPos.get(id) || null; const dd: any = R.getNodeDisplayData(id); if (!dd || dd.hidden) return null; const p = R.framedGraphToViewport({ x: dd.x, y: dd.y }); return { x: p.x, y: p.y, r: R.scaleSize(dd.size) }; };
    const active = state.hovered || state.selected;
    // rings: endorsers shared within a race
    const ringIds = new Set<string>();
    if (state.view === 'race' && !active) RACE_SHARED.forEach((x) => ringIds.add(x));
    octx.lineWidth = 1.8; octx.strokeStyle = '#111';
    for (const id of ringIds) { const p = vp(id); if (!p) continue; octx.beginPath(); octx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); octx.stroke(); placed.push([p.x - p.r - 3, p.y - p.r - 3, p.x + p.r + 3, p.y + p.r + 3]); }
    // the selected node: a soft halo, a white gap and a heavy dark ring
    if (active) {
      const p = vp(active);
      if (p) {
        const R0 = p.r + 4;
        octx.lineWidth = 9; octx.strokeStyle = 'rgba(255, 184, 0, 0.5)'; octx.beginPath(); octx.arc(p.x, p.y, R0 + 8.5, 0, Math.PI * 2); octx.stroke();
        octx.lineWidth = 4; octx.strokeStyle = '#ffffff'; octx.beginPath(); octx.arc(p.x, p.y, R0, 0, Math.PI * 2); octx.stroke();
        octx.lineWidth = 3; octx.strokeStyle = '#111111'; octx.beginPath(); octx.arc(p.x, p.y, R0 + 3, 0, Math.PI * 2); octx.stroke();
        placed.push([p.x - R0 - 5, p.y - R0 - 5, p.x + R0 + 5, p.y + R0 + 5]);
      }
    }
    // coalition letters inside big nodes (colour-blind redundancy)
    if (state.colorBy === 'community') {
      for (const n of d.nodes) {
        if (n.community < 0 || !g.hasNode(n.id) || (FOCUS && !FOCUS.has(n.id))) continue;
        const p = vp(n.id); if (!p || p.r < (n.isTarget ? 7 : 6.5)) continue;
        octx.font = `800 ${Math.max(12, Math.min(13, p.r * 1.1))}px ${FONT}`; octx.textAlign = 'center'; octx.textBaseline = 'middle';
        octx.fillStyle = onColor(commColor(n.community)); octx.fillText(LETTERS[n.community], p.x, p.y + 0.5);
      }
      octx.textAlign = 'left'; octx.textBaseline = 'alphabetic';
    }
    for (const n of d.nodes) if (n.isTarget && g.hasNode(n.id)) { const p = vp(n.id); if (p) placed.push([p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r]); }
    const ovl = (bx: number[]) => placed.reduce((a, b) => a + Math.max(0, Math.min(bx[2], b[2]) - Math.max(bx[0], b[0])) * Math.max(0, Math.min(bx[3], b[3]) - Math.max(bx[1], b[1])), 0);
    const draws: [string, number, number, number, boolean, string][] = [];
    const leaders: [number, number, number, number][] = [];
    for (const L of labelPlan()) {
      const p = vp(L.id); if (!p) continue;
      octx.font = `${L.weight} ${fs}px ${FONT}`;
      const th = fs; let done = false; let best: [number, number, number, string] | null = null;
      for (const text of L.texts) {
        const tw = octx.measureText(text).width;
        const opts: [number, number][] = [[p.x + p.r + 4, p.y + th * 0.35], [p.x - p.r - 4 - tw, p.y + th * 0.35], [p.x - tw / 2, p.y - p.r - 5], [p.x - tw / 2, p.y + p.r + th + 2],
          [p.x + p.r + 3, p.y - th * 0.6], [p.x + p.r + 3, p.y + th * 1.3], [p.x - p.r - 3 - tw, p.y - th * 0.6], [p.x - p.r - 3 - tw, p.y + th * 1.3]];
        for (const [x, y] of opts) {
          const box = [x - 3, y - th, x + tw + 3, y + 4];
          if (box[0] < 2 || box[2] > w - 2 || box[1] < 2 || box[3] > h - 2) continue;
          const o = ovl(box);
          if (o === 0) { placed.push(box as any); draws.push([text, x, y, L.weight, !!L.dim, L.id]); done = true; break; }
          if (!best || o < best[0]) best = [o, x, y, text];
        }
        if (done) break;
      }
      // guaranteed labels that collide: try positions further out, joined to the node by a leader line
      if (!done && L.force && !L.dim) {
        const text = L.texts[L.texts.length > 1 && narrowMQ.matches ? L.texts.length - 1 : 0]; const tw = octx.measureText(text).width;
        outer: for (const k of [1.6, 2.4, 3.3]) for (let j = 0; j < 12; j++) {
          const a = (Math.PI * 2 * j) / 12, dist = p.r + th * k;
          const cx = p.x + Math.cos(a) * dist, cy = p.y + Math.sin(a) * dist;
          const x = Math.cos(a) > 0.3 ? cx : Math.cos(a) < -0.3 ? cx - tw : cx - tw / 2, y = cy + th * 0.35;
          const box = [x - 3, y - th, x + tw + 3, y + 4];
          if (box[0] < 2 || box[2] > w - 2 || box[1] < 2 || box[3] > h - 2) continue;
          if (ovl(box) === 0) {
            placed.push(box as any); draws.push([text, x, y, L.weight, false, L.id]);
            leaders.push([p.x + Math.cos(a) * (p.r + 1), p.y + Math.sin(a) * (p.r + 1), Math.min(Math.max(p.x, box[0] + 3), box[2] - 3), Math.min(Math.max(p.y, box[1] + 2), box[3] - 2)]);
            done = true; break outer;
          }
        }
      }
      if (!done && L.force && best) {
        const [, x, y, text] = best; const tw = octx.measureText(text).width;
        placed.push([x - 3, y - th, x + tw + 3, y + 4]); draws.push([text, x, y, L.weight, !!L.dim, L.id]);
      }
    }
    (window as any).__labels = draws.map((x) => x[5]);
    octx.lineWidth = 1; octx.strokeStyle = '#444';
    for (const [x1, y1, x2, y2] of leaders) { octx.beginPath(); octx.moveTo(x1, y1); octx.lineTo(x2, y2); octx.stroke(); }
    // labels sit above lines: a white backing box under each label
    for (const [text, x, y, wgt, dim] of draws) {
      octx.font = `${wgt} ${fs}px ${FONT}`; const tw = octx.measureText(text).width;
      octx.fillStyle = 'rgba(255,255,255,0.86)'; octx.fillRect(x - 2, y - fs + 1, tw + 4, fs + 3);
      octx.lineWidth = 3; octx.strokeStyle = 'rgba(255,255,255,0.95)'; octx.lineJoin = 'round';
      octx.strokeText(text, x, y); octx.fillStyle = dim ? '#6b6b6b' : '#111'; octx.fillText(text, x, y);
    }
  }
  new ResizeObserver(() => { sizeOverlay(); refresh(); }).observe(container);

  // ---------- camera ----------
  let cam: ReturnType<Sigma['getCamera']> | null = null;
  function setFrame() {
    if (narrowMQ.matches && !state.showAll) {
      const core = d.nodes.filter((n) => g.hasNode(n.id) && !n.leaf);
      const xs = core.map((n) => n.x), ys = core.map((n) => n.y);
      bbox = { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] };
    } else bbox = null;
    homeMemo = null; if (renderer) renderer.setCustomBBox(bbox);
  }
  const HOME = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
  // portrait screens: turn the wide layout upright, and lift it so its top sits just under the legend button (no dead band above)
  let homeBottom = 0;
  let homeMemo: { k: string; v: { x: number; y: number; ratio: number; angle: number } } | null = null;
  const home = () => {
    const base = { ...HOME, angle: narrowMQ.matches && !state.showAll ? Math.PI / 2 : 0 };
    if (!base.angle) return base;
    const w = container.clientWidth, h = container.clientHeight; if (!w || !h) return base;
    const k = `${w}x${h}`; if (homeMemo && homeMemo.k === k) return homeMemo.v;
    const ext = bbox || graphExtent(g); const normF = createNormalizationFunction(ext);
    const pts: { x: number; y: number }[] = []; g.forEachNode((id, a) => { if (!(SETTINGS.nodeReducer(id, a) as any).hidden) pts.push(normF({ x: a.x, y: a.y }) as any); });
    const dims = { width: ext.x[1] - ext.x[0] || 1, height: ext.y[1] - ext.y[0] || 1 };
    const box = (c: typeof base) => { const M = matrixFromCamera(c, { width: w, height: h }, dims, SETTINGS.stagePadding); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of pts) { const q = multiplyVec2(M, p as any); const X = ((1 + q.x) * w) / 2, Y = ((1 - q.y) * h) / 2; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); } return { x0, x1, y0, y1 }; };
    // fit: zoom so the visible nodes fill the width (room for labels at the sides) or the height between the legend button and the zoom buttons
    const TOP = 56, BOTTOM = 64, SIDE = 44;
    const b0 = box(base); const sc = Math.min((w - 2 * SIDE) / Math.max(1, b0.x1 - b0.x0), (h - TOP - BOTTOM) / Math.max(1, b0.y1 - b0.y0));
    let v = { ...base, ratio: base.ratio / Math.max(0.5, Math.min(3, sc)) };
    // then pan (2×2 finite-difference solve) so the box is centred horizontally with its top at TOP
    for (let it = 0; it < 2; it++) {
      const b1 = box(v), eps = 0.002 * v.ratio;
      const f = (bb: ReturnType<typeof box>) => [(bb.x0 + bb.x1) / 2 - w / 2, bb.y0 - TOP];
      const f0 = f(b1), fx = f(box({ ...v, x: v.x + eps })), fy = f(box({ ...v, y: v.y + eps }));
      const J = [[(fx[0] - f0[0]) / eps, (fy[0] - f0[0]) / eps], [(fx[1] - f0[1]) / eps, (fy[1] - f0[1]) / eps]];
      const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]; if (Math.abs(det) < 1e-9) break;
      v = { ...v, x: v.x - (J[1][1] * f0[0] - J[0][1] * f0[1]) / det, y: v.y - (-J[1][0] * f0[0] + J[0][0] * f0[1]) / det };
    }
    homeBottom = box(v).y1;
    homeMemo = { k, v }; return v;
  };
  setFrame();
  const goHome = () => { if (cam) cam.animate(home(), { duration: 300 }); else refresh(); };
  $('#zin').onclick = () => { ensureSigma(); cam!.animatedZoom({ duration: 250 }); };
  $('#zout').onclick = () => { ensureSigma(); cam!.animatedUnzoom({ duration: 250 }); };
  $('#zreset').onclick = goHome;
  function flyTo(id: string) {
    if (!g.hasNode(id)) return;
    ensureSigma();
    const p = renderer!.getNodeDisplayData(id); if (!p) return;
    cam!.animate({ x: p.x, y: p.y, ratio: Math.min(cam!.ratio, 0.6), angle: cam!.angle }, { duration: 450 });
  }

  // ---------- tooltip (pointer devices only) ----------
  const tip = $('#tooltip');
  const hideTip = () => { tip.hidden = true; };
  function ensureSigma() {
    if (renderer) return;
    renderer = new Sigma(g, container, SETTINGS);
    renderer.setCustomBBox(bbox);
    cam = renderer.getCamera(); cam.setState(home());
    container.appendChild(overlay);   // keep the label layer above sigma's canvases
    preview.remove();
    renderer.on('afterRender', drawOverlay);
    renderer.on('enterNode', onEnter); renderer.on('leaveNode', onLeave);
    renderer.on('clickNode', ({ node }) => { hideTip(); state.hovered = null; select(node, stackMQ.matches); });
    renderer.on('clickStage', () => { hideTip(); if (state.selected) select(null); });
    renderer.refresh();
  }
  const wake = () => ensureSigma();
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focusin']) document.addEventListener(ev, wake, { capture: true, once: true, passive: true });
  for (const ev of ['pointermove', 'pointerover']) container.addEventListener(ev, wake, { once: true, passive: true });
  function onEnter({ node, event }: { node: string; event: { x: number; y: number } }) {
    if (!hoverMQ.matches) return;
    state.hovered = node; recompute(); refresh({ skipIndexation: true });
    const n = byId.get(node)!;
    tip.innerHTML = `<strong>${esc(n.name)}</strong><span>${esc(n.type)}${n.race ? ' · ' + esc(n.race) : ''}</span><span>${n.outDeg ? `Endorses ${n.outDeg}` : ''}${n.outDeg && n.inDeg ? ' · ' : ''}${n.inDeg ? `Endorsed by ${n.inDeg}` : ''}</span>`;
    tip.hidden = false; const w = container.clientWidth; tip.style.left = Math.min(event.x + 14, w - 230) + 'px'; tip.style.top = event.y + 14 + 'px';
    container.style.cursor = 'pointer';
  }
  function onLeave() { if (!state.hovered) return; state.hovered = null; recompute(); refresh({ skipIndexation: true }); hideTip(); container.style.cursor = ''; }
  container.addEventListener('touchstart', hideTip, { passive: true });

  // ---------- panel helpers ----------
  const panel = $('#panel');
  const N = (id: string) => byId.get(id)!;
  const typeBar = (tc: Map<string, number> | Record<string, number>) => {
    const m = tc instanceof Map ? tc : new Map(Object.entries(tc));
    return `<div class="tbar" role="img" aria-label="${esc([...m].map(([t, v]) => `${v} ${t}`).join(', '))}">${TYPE_ORDER.filter((t) => m.has(t)).map((t) => `<span style="flex:${m.get(t)};background:${TYPE_RAMP[t]}" title="${esc(t)}: ${m.get(t)}"></span>`).join('')}</div>`;
  };
  const typeKey = (types: string[]) => `<p class="tkey small">${TYPE_ORDER.filter((t) => types.includes(t)).map((t) => `<span><i style="background:${TYPE_RAMP[t]}"></i>${esc(t)}</span>`).join('')}</p>`;
  // ---------- references: one number per source document, shared with the References list on /findings/ ----------
  const refByU = new Map(d.refs.map((r) => [r.u, r]));
  const fmtDates = (at: string[]) => (!at.length ? '' : at.length === 1 ? fmtDate(at[0]) : `${fmtDate(at[0])} to ${fmtDate(at[at.length - 1])}`);
  const refNums = (e: GEdge) => [...new Set(e.src.map((x) => refByU.get(x.u)?.n).filter((n): n is number => !!n))].sort((a, b) => a - b);
  const marker = (ns: number[]) => (ns.length ? `<sup class="rm">[${ns.map((n) => `<a href="#pref-${n}" data-ref="${n}" aria-label="Reference ${n}">${n}</a>`).join(',')}]</sup>` : '');
  function refList(ns: Set<number>) {
    const rs = d.refs.filter((r) => ns.has(r.n));
    if (!rs.length) return '';
    return `<details class="grp refs" open><summary><h3>References <span class="cnt">${rs.length}</span></h3></summary><ol class="reflist">${rs.map((r) => `<li id="pref-${r.n}" value="${r.n}"><span class="rt">${esc(r.title)}</span> <a class="ru" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace(/^https?:\/\/(www\.)?/, ''))}</a> <span class="acc">${r.at.length ? `Accessed ${esc(fmtDates(r.at))}.` : 'Access date not recorded; corroborating source only.'}</span></li>`).join('')}</ol></details>`;
  }
  // ---------- avatars: a candidate headshot when one exists, otherwise initials ----------
  const photos = d.photos || {};
  /** an organisation's logo (logo.dev) over its initials; the initials show if the image fails */
  const logoAv = (n: GNode, size: 'lg' | 'sm') => {
    const u = logoUrl(n.name, size === 'lg' ? 48 : 24); if (!u) return null;
    const px = size === 'lg' ? 48 : 24;
    return `<span class="av av-${size} av-i av-logo" style="--c:#eeeeee;--t:#333">${esc(initials(n))}<img src="${esc(u)}" alt="" width="${px}" height="${px}" loading="lazy" decoding="async"></span>`;
  };
  document.addEventListener('error', (e) => { const t = e.target as HTMLElement; if (t instanceof HTMLImageElement && t.parentElement?.classList.contains('av-logo')) t.remove(); }, true);
  const avatar = (n: GNode, size: 'lg' | 'sm' = 'lg') => logoAv(n, size) || (photos[n.id]
    ? `<img class="av av-${size}" src="${esc(photos[n.id])}" alt="" width="${size === 'lg' ? 48 : 24}" height="${size === 'lg' ? 48 : 24}" loading="lazy" decoding="async">`
    : `<span class="av av-${size} av-i" aria-hidden="true" style="--c:${n.community >= 0 ? commColor(n.community) : '#e9e9e9'};--t:${n.community >= 0 ? onColor(commColor(n.community)) : '#333'}">${esc(initials(n))}</span>`);
  // endorser groups: the key names first (officials, parties, clubs, unions, organizations, candidates), then everyone else
  const GROUPS: { label: string; types: string[]; key: boolean }[] = [
    { label: 'Elected officials', types: ['Current elected official'], key: true },
    { label: 'Former elected officials', types: ['Former elected official'], key: true },
    { label: 'Parties', types: ['Political party'], key: true },
    { label: 'Democratic clubs', types: ['Democratic club'], key: true },
    { label: 'Unions', types: ['Union'], key: true },
    { label: 'Organizations', types: ['Political/advocacy org'], key: true },
    { label: 'Candidates and slates', types: ['Candidate', 'Candidate (withdrawn)', 'Slate'], key: true },
    { label: 'Everyone else', types: ['Individual'], key: false },
  ];
  const groupOf = (t: string) => GROUPS.find((x) => x.types.includes(t)) || GROUPS[GROUPS.length - 1];
  const rankTxt = (e: GEdge) => (e.rel !== 'Endorses' && e.kind !== 'member' ? ` <span class="rk"${e.rankNote ? ` title="${esc(e.rankNote)}"` : ''}>${esc(e.rel.replace(/^Ranked /, 'ranked '))}</span>` : '');
  const srcKey = (e: GEdge) => refNums(e).join(',');
  /** one shared source for every edge in the list? then it is cited once, in the banner */
  const sharedRef = (es: GEdge[]) => (es.length > 1 && es.every((e) => srcKey(e) === srcKey(es[0])) && srcKey(es[0]) ? refNums(es[0]) : null);
  const bannerSrc = (ns: number[] | null) => (ns ? `<p class="bsrc">Source: ${marker(ns)} ${ns.map((n) => esc(d.refs[n - 1].title)).join('; ')}</p>` : '');
  /** a key endorser: icon, name, a short description, ranking, reference marker */
  function keyRow(e: GEdge, otherId: string, cite: boolean) {
    const o = N(otherId);
    const desc = e.title || o.title;
    return `<li>${logoAv(o, 'sm') || typeGlyph(o.type)}<span class="kr">${nlink(o)}${rankTxt(e)}${cite ? marker(refNums(e)) : ''}${desc ? `<span class="desc">${esc(desc)}</span>` : ''}</span></li>`;
  }
  const LIM = 5;   // key names shown per group before "Show all"
  function endorserGroups(es: GEdge[], cite: boolean) {
    const by = new Map<string, GEdge[]>();
    for (const e of es) { const gl = groupOf(N(e.s).type).label; if (!by.has(gl)) by.set(gl, []); by.get(gl)!.push(e); }
    return GROUPS.filter((gr) => by.has(gr.label)).map((gr) => {
      const list = by.get(gr.label)!.sort((a, b) => (N(b.s).outDeg - N(a.s).outDeg) || N(a.s).name.localeCompare(N(b.s).name));
      const head = `<summary>${typeGlyph(gr.types[0])}<span>${gr.label}</span> <span class="cnt">${list.length}</span></summary>`;
      if (!gr.key) {   // everyone else: a compact run of names
        const names = list.slice().sort((a, b) => N(a.s).name.localeCompare(N(b.s).name)).map((e) => `<span class="ci">${nlink(N(e.s))}${rankTxt(e)}${cite ? marker(refNums(e)) : ''}</span>`).join('');
        return `<details class="grp">${head}<p class="clist">${names}</p></details>`;   // collapsed: open to see every name
      }
      const rows = list.map((e, i) => keyRow(e, e.s, cite).replace('<li>', i >= LIM ? '<li class="more" hidden>' : '<li>')).join('');
      const more = list.length > LIM ? `<button class="showmore">Show all ${list.length}</button>` : '';
      return `<details class="grp" open>${head}<ul class="klist">${rows}</ul>${more}</details>`;
    }).join('');
  }
  /** what a node endorses (or its slate links): one row per target, with race and reference marker */
  function targetRows(es: GEdge[], cite: boolean) {
    return `<ul class="klist">${es.slice().sort((a, b) => (N(a.t).race || '').localeCompare(N(b.t).race || '') || N(a.t).name.localeCompare(N(b.t).name)).map((e) => {
      const t = N(e.t);
      return `<li>${typeGlyph(t.type)}<span class="kr">${nlink(t)}${t.race && t.type !== 'Slate' ? ` <span class="race-tag">${esc(raceShort(t.race))}</span>` : ''}${rankTxt(e)}${cite ? marker(refNums(e)) : ''}${e.rankNote ? `<span class="desc">${esc(e.rankNote)}</span>` : ''}</span></li>`;
    }).join('')}</ul>`;
  }
  /** candidates whose endorsements most resemble this one's: the share of clustering runs that group the two together */
  function closest(id: string, k = 3) {
    return d.coTargets.filter((t) => t !== id).map((t) => ({ t, p: ix.together(id, t) })).sort((x, y) => y.p - x.p).slice(0, k).filter((x) => x.p > 0);
  }
  const simLine = (id: string) => {
    const cl = closest(id); if (!cl.length) return '';
    return ` Similarly endorsed candidates include: ${cl.map((x, i) => `${nlink(N(x.t))} <span class="pc">${pct(x.p)}</span>${i < cl.length - 1 ? ',' : ''}`).join(' ')}.`;
  };
  function placement(n: GNode) {
    const runs = `<span class="pnote">Percent: share of ${S.nRuns.toLocaleString('en-US')} clustering runs that group the two together.</span>`;
    if (n.isTarget && !n.analysisEndorser) {
      if (n.community >= 0) {
        const c = d.communities[n.community]; const others = c.targets.filter((t) => t !== n.id).map(N);
        return `<p class="place">${chip(n.community)} In coalition ${LETTERS[c.id]} with ${listJoin(others.map((o) => nlink(o)))}.${simLine(n.id)}</p>${runs}`;
      }
      if (!g.hasNode(n.id) || !d.coTargets.includes(n.id)) return n.memberOf ? '' : `<p class="place">${chip(-1)} Not in any coalition.</p>`;
      return `<p class="place">${chip(-1)} Not in any coalition.${simLine(n.id)}</p>${runs}`;
    }
    return '';   // endorsers: the panel is just whom they endorse
  }
  function nodePanel(id: string) {
    const n = N(id);
    const outs = edgesOut.get(id) || []; const ins = edgesIn.get(id) || [];
    const isMem = (e: GEdge) => /member/i.test(e.rel);
    const used = new Set<number>(); const use = (es: GEdge[]) => es.forEach((e) => refNums(e).forEach((x) => used.add(x)));
    const notes = (n.notes || []).filter((x) => !/^No endorsements recorded/.test(x.text)).map((x) => (x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : esc(x.text))).join(' ');
    const isC = n.isTarget && !n.analysisEndorser;
    const sub = [n.type === 'Candidate' || n.type === 'Slate' ? '' : n.type, n.race, !isC && n.title ? n.title : ''].filter(Boolean).join(' · ');
    const site = n.campaignUrl ? `<a class="site" href="${esc(n.campaignUrl)}" target="_blank" rel="noopener">Campaign site<span aria-hidden="true"> ↗</span></a>` : '';
    let html = `<button class="back" data-back>← Back</button>
      <header class="nhead">${isC || n.type === 'Slate' || logoUrl(n.name, 48) ? avatar(n) : `<span class="av av-lg av-t" aria-hidden="true">${typeGlyph(n.type)}</span>`}<div><h2 tabindex="-1" id="ntitle">${esc(n.name)}</h2><p class="ntype">${esc(sub || n.type)}${site ? ` · ${site}` : ''}</p></div></header>`;
    // 1. who endorses this candidate (or, for an endorser, whom it endorses)
    // with a filter on, list only the visible links and say how many of the total are shown
    const lead = (label: string, all: GEdge[], es: GEdge[], body: (cite: boolean) => string) => {
      const sr = sharedRef(es); use(es);
      const cnt = es.length < all.length ? `<strong>${label} ${all.length}</strong> <span class="bsub">· ${es.length} shown (filter on)</span>` : `<strong>${label} ${all.length}</strong>`;
      return `<section class="lead"><div class="banner"><p class="bn">${cnt}</p>${bannerSrc(sr)}</div>${es.length ? body(!sr) : ''}</section>`;
    };
    const insV = ins.filter(shownE), outsV = outs.filter(shownE);
    if (ins.length) html += lead('Endorsed by', ins, insV, (cite) => endorserGroups(insV, cite));
    else if (isC) html += `<div class="banner"><p class="bn"><strong>No endorsements recorded</strong></p></div>`;
    if (outs.length) html += lead(ins.length ? 'Also endorses' : 'Endorses', outs, outsV, (cite) => targetRows(outsV, cite));
    if (notes) html += `<p class="small notes">${notes}</p>`;
    if (n.typeNote) html += `<p class="small muted">${esc(n.typeNote)}</p>`;
    // slate links (not endorsements)
    const links: [string, GEdge[], 's' | 't'][] = [
      ['Members', memberEdges.filter((e) => e.t === id && isMem(e)), 's'], ['Nominated by', memberEdges.filter((e) => e.t === id && !isMem(e)), 's'],
      ['Member of', memberEdges.filter((e) => e.s === id && isMem(e)), 't'], ['Nominated', memberEdges.filter((e) => e.s === id && !isMem(e)), 't'],
    ];
    for (const [h, es, side] of links) if (es.length) {
      use(es); const sr = sharedRef(es);
      html += `<details class="grp" open><summary><span>${h}</span> <span class="cnt">${es.length}</span> <span class="small muted nt">slate link, not an endorsement</span></summary>${sr ? bannerSrc(sr) : ''}<ul class="klist">${es.map((e) => { const o = N(side === 's' ? e.s : e.t); return `<li>${typeGlyph(o.type)}<span class="kr">${nlink(o)}${sr ? '' : marker(refNums(e))}</span></li>`; }).join('')}</ul></details>`;
    }
    // 2. the network analysis, last and in plain words
    html += placement(n);
    // 3. references used in this panel
    html += refList(used);
    return html;
  }

  function coalitionsPanel() {
    const items = d.communities.map((c) => {
      const pairs: string[] = [];
      for (let i = 0; i < c.targets.length; i++) for (let j = i + 1; j < c.targets.length; j++) pairs.push(`<li>${esc(shortName(N(c.targets[i])))} & ${esc(shortName(N(c.targets[j])))}: <strong>${pctCut(ix.together(c.targets[i], c.targets[j]), T)}</strong></li>`);
      return `<li class="coal"><div class="coal-h">${chip(c.id)}<strong>${esc(blocName(ix, c))}</strong></div>
        <p class="coal-c">${c.targets.map((t) => `${nlink(N(t))} <span class="race-tag">${esc(raceShort(N(t).race))}</span>`).join(', ')}</p>
        <p class="small">Weakest pair ${esc(shortName(N(c.weakest.a)))} & ${esc(shortName(N(c.weakest.b)))}: <strong>${weakPct(d, c)}</strong>, ${marginLabel(d, c)}${intactWords(c, true) ? `. Intact in ${intactWords(c, true)}${(() => { const nt = intactNote(d, ix, c); return nt ? ` (${esc(nt)})` : ''; })()}` : ''}</p>
        ${pairs.length > 1 ? `<details class="pairs"><summary>All ${pairs.length} pairs</summary><ul>${pairs.join('')}</ul></details>` : ''}
        ${Object.keys(c.typeCounts).length ? typeBar(c.typeCounts) : ''}</li>`;
    }).join('');
    const loose = d.loose.map((l) => `<li>${nlink(N(l.id), undefined, 'strong')} <span class="race-tag">${esc(raceShort(N(l.id).race))}</span><br><span class="small">${(() => { const nm = nearMisses(d).find((x) => x.l.id === l.id); return nm ? `Just short of ${LETTERS[nm.c]}: ${pctCut(nm.v, T)}` : `Similarly endorsed: ${listJoin(closest(l.id, 2).map((p) => `${esc(shortName(N(p.t)))} (${pct(p.p)})`))}`; })()}</span></li>`).join('');
    const allTypes = [...new Set(d.communities.flatMap((c) => Object.keys(c.typeCounts)))];
    return `<h2 class="ph">${numWord(S.nBlocs).replace(/^./, (x) => x.toUpperCase())} ${plural(S.nBlocs, 'coalition')}</h2>
      <p class="pintro">Every pair is grouped together in at least ${pct(T)} of ${S.nRuns.toLocaleString('en-US')} clustering runs. Bars: endorsers by type.</p>
      <ol class="coals">${items}</ol>${typeKey(allTypes)}
      <h3>No coalition <span class="cnt">${d.loose.length + isolated.length}</span></h3><ul class="loose">${loose}${isolated.map((n) => `<li>${nlink(n, undefined, 'strong')} <span class="race-tag">${esc(raceShort(n.race))}</span><br><span class="small">No endorsements recorded</span></li>`).join('')}</ul>`;
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
        return `<h4>${esc(u.label)}</h4><table class="mini"><thead><tr><th scope="col">Council candidate</th><th scope="col" class="num">Shared endorsers</th><th scope="col" class="num">Together</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${nlink(x.c)} <span class="race-tag">${esc(raceShort(x.c.race))}</span></td><td class="num">${x.sh}</td><td class="num">${pct(x.p)}</td></tr>`).join('')}</tbody></table>`;
      }).join('');
      rbc = `<h3>Shared with council candidates</h3><p class="small muted">Together: share of runs in the same cluster.</p>${rbc}`;
    }
    return `<h2 class="ph">Compare a race</h2><div class="seg wrap" role="group" aria-label="Race">${opts}</div>
      <ul class="rcs">${cards}</ul>${typeKey([...types])}${rbc}
      <h3>Endorsers shared within the race <span class="cnt">${shared.length}</span></h3>${sharedHtml}`;
  }

  function renderPanel() {
    panel.innerHTML = state.selected ? nodePanel(state.selected) : state.view === 'coalitions' ? coalitionsPanel() : racePanel();
    panel.scrollTop = 0;
    updatePill();
  }
  function renderLegend() {
    const L = $('#legend');
    const items = state.colorBy === 'community'
      ? d.communities.map((c) => `<li>${chip(c.id)}<span>${esc(blocName(ix, c))}</span></li>`).join('') + `<li><span class="dot none"></span><span>No coalition</span></li>`
      : TYPE_ORDER.filter((t) => d.nodes.some((n) => n.type === t)).map((t) => `<li><span class="dot" style="background:${TYPE_RAMP[t]}"></span><span>${esc(t)}</span></li>`).join('');
    L.innerHTML = `<ul>${items}<li><span class="dot" style="background:${LEAF}"></span><span>backs one candidate</span></li></ul>
      <p><span class="lline"></span>endorsement${memberEdges.length ? ' <span class="lline mem"></span>slate link' : ''}${state.view === 'race' ? ' <span class="ringk"></span>endorser shared within the race' : ''} <span class="selk"></span>selected</p>`;
  }
  // ---------- bottom sheet (narrow screens) ----------
  const sheet = $('#sheet'); const handle = $<HTMLButtonElement>('#sheetbtn');
  function setSheet(open: boolean) {
    sheet.classList.toggle('open', open); document.body.classList.toggle('sheet-open', open); handle.setAttribute('aria-expanded', String(open));
    handle.querySelector('span')!.textContent = open ? 'Hide details' : state.selected ? `Details: ${N(state.selected).name}` : 'Coalitions and races';
  }
  handle.addEventListener('click', () => setSheet(!sheet.classList.contains('open')));
  function updatePill() { if (stackMQ.matches) setSheet(sheet.classList.contains('open') || !!state.selected); }
  // ---------- interactions ----------
  function select(id: string | null, fly = true) {
    const had = state.selected;
    state.selected = id; recompute(); refresh({ skipIndexation: true }); renderPanel(); syncHash();
    if (id && fly) { if (stackMQ.matches) setTimeout(() => flyTo(id), 260); else flyTo(id); }
    if (!id && had) goHome();
  }
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  function setView(v: View) {
    state.view = v; state.selected = null;
    tabs.forEach((b) => { const on = b.dataset.view === v; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    panel.setAttribute('aria-labelledby', `tab-${v}`);
    recompute(); refresh({ skipIndexation: true }); renderPanel(); renderLegend(); syncHash();
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
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const nb = t.closest<HTMLElement>('[data-node]');
    if (nb) {
      ev.preventDefault(); const id = nb.dataset.node!;
      select(id); return;
    }
    if (t.closest('[data-back]')) { select(null); return; }
    const rb = t.closest<HTMLElement>('[data-race]'); if (rb) { state.race = rb.dataset.race!; recompute(); refresh({ skipIndexation: true }); renderPanel(); syncHash(); return; }
    const rf = t.closest<HTMLElement>('[data-ref]');
    if (rf) { ev.preventDefault(); const li = panel.querySelector<HTMLElement>(`#pref-${rf.dataset.ref}`); if (li) { (li.closest('details') as HTMLDetailsElement | null)?.setAttribute('open', ''); li.scrollIntoView({ block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1200); } return; }
    const sm = t.closest<HTMLButtonElement>('.showmore');
    if (sm) { sm.previousElementSibling?.querySelectorAll('li.more').forEach((li) => ((li as HTMLElement).hidden = false)); sm.remove(); }
  });
  $<HTMLInputElement>('#showall').addEventListener('change', (e) => { state.showAll = (e.target as HTMLInputElement).checked; setFrame(); fitSheet(); cam?.setState(home()); recompute(); refresh(); renderLegend(); });
  $<HTMLSelectElement>('#colorby').addEventListener('change', (e) => { state.colorBy = (e.target as HTMLSelectElement).value as any; refresh({ skipIndexation: true }); renderLegend(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const fb = document.getElementById('filterbox') as HTMLDetailsElement | null;
    if (fb?.open) { fb.open = false; fb.querySelector('summary')?.focus(); return; }   // close the filter first
    if (state.selected) select(null);
  });
  const setPeek = (ev: Event) => { const t = (ev.target as HTMLElement)?.closest?.<HTMLElement>('[data-node]'); const id = t && ev.type !== 'focusout' && ev.type !== 'mouseout' ? t.dataset.node! : null; if (id !== peek) { peek = id; drawOverlay(); } };
  for (const ev of ['focusin', 'focusout', 'mouseover', 'mouseout']) document.addEventListener(ev, setPeek, { passive: true });
  midMQ.addEventListener('change', () => drawOverlay());
  // portrait phones: the upright network is about as wide as it is tall, so it cannot fill the screen's height without
  // cropping its sides. Give the leftover height to the bottom sheet, which then shows the panel (a peek) instead of empty canvas.
  function fitSheet() {
    const root = document.documentElement;
    root.style.removeProperty('--peek'); sheet.classList.remove('peek'); homeMemo = null;
    if (!narrowMQ.matches || state.showAll) { document.body.classList.add('sheet-ready'); return; }
    home(); const spare = container.clientHeight - (homeBottom + 64);
    if (spare >= 120) { root.style.setProperty('--peek', `${Math.round(52 + spare)}px`); sheet.classList.add('peek'); }
    homeMemo = null;
    if (renderer) { renderer.resize(); cam?.setState(home()); }
    refresh();
    document.body.classList.add('sheet-ready');
  }
  fitSheet();
  let rsz = 0; window.addEventListener('resize', () => { cancelAnimationFrame(rsz); rsz = requestAnimationFrame(fitSheet); });
  narrowMQ.addEventListener('change', () => { setFrame(); fitSheet(); cam?.setState(home()); recompute(); refresh(); renderLegend(); });

  // ---------- search (ARIA combobox) ----------
  const q = $<HTMLInputElement>('#q'); const qres = $('#qres');
  const searchIdx = d.nodes.map((n) => ({ id: n.id, key: norm([n.name, ...n.variants].join(' | ')) }));
  let hits: string[] = []; let hi = 0;
  function renderHits() {
    qres.innerHTML = hits.map((id, i) => { const n = N(id); return `<li role="option" id="opt-${i}" aria-selected="${i === hi}" data-hit="${esc(id)}">${n.isTarget ? avatar(n, 'sm') : typeGlyph(n.type)}<span>${esc(n.name)}</span><small>${esc(n.type)}${n.race ? ' · ' + esc(n.race) : ''}</small></li>`; }).join('')
      || (q.value.trim() ? '<li class="none" role="option" aria-disabled="true" aria-selected="false">No match</li>' : '');
    const open = !!q.value.trim();
    qres.hidden = !open; q.setAttribute('aria-expanded', String(open));
    if (hits.length) q.setAttribute('aria-activedescendant', `opt-${hi}`); else q.removeAttribute('aria-activedescendant');
  }
  q.addEventListener('input', () => {
    const s = norm(q.value.trim()); hi = 0;
    hits = s ? searchIdx.filter((x) => x.key.includes(s) && !HIDDEN.has(x.id)).map((x) => x.id)
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
    if (filt.hideT.size) {
      const t = [...filt.hideT]; const ind = filt.hideT.has('people') && filt.hideT.has('officials');
      p.set('hide', (ind ? ['individuals', ...t.filter((k) => k !== 'people' && k !== 'officials')] : t).join(','));
    }
    if (filt.hideR.size) p.set('races', RACES.filter((r) => !filt.hideR.has(r)).join(',') || 'none');
    if (state.selected) p.set('node', state.selected);
    const h = p.toString().replace(/%2C/g, ','); const want = location.pathname + (h ? '?' + h : '');
    if (location.pathname + location.search + location.hash !== want) history.replaceState(null, '', want);
  }
  function applyHash() {
    applying = true;
    const hp = new URLSearchParams(location.search.slice(1) || location.hash.slice(1));
    const v = hp.get('view'); const race = hp.get('race');
    if (race && d.races.some((r) => r.race === race)) state.race = race;
    filt.hideT.clear(); filt.hideR.clear();
    for (const k of (hp.get('hide') || '').split(',').filter(Boolean)) {
      if (k === 'individuals') { filt.hideT.add('people'); filt.hideT.add('officials'); } else if (FTYPES.some((f) => f.k === k)) filt.hideT.add(k);
    }
    const rs = hp.get('races'); if (rs) { const on = new Set(rs.split(',')); for (const r of RACES) if (!on.has(r)) filt.hideR.add(r); }
    computeHidden(); renderFilter();
    setView(v === 'race' ? 'race' : 'coalitions');   // old ?view=bridges links open the coalitions view
    const node = hp.get('node');
    if (node && byId.has(node)) select(node, true);
    applying = false;
  }
  window.addEventListener('popstate', applyHash);

  // ---------- filter control ----------
  const fbox = $<HTMLDetailsElement>('#filterbox');
  $('#ftypes').innerHTML = FTYPES.map((f) => `<button type="button" class="fchip" data-ft="${f.k}" aria-pressed="true">${typeGlyph(f.types[0])}${f.label}</button>`).join('');
  $('#fraces').innerHTML = RACES.map((r) => `<button type="button" class="fchip" data-fr="${esc(r)}" aria-pressed="true">${esc(raceShort(r))}</button>`).join('');
  function renderFilter() {
    fbox.querySelectorAll<HTMLButtonElement>('[data-ft]').forEach((b) => b.setAttribute('aria-pressed', String(!filt.hideT.has(b.dataset.ft!))));
    fbox.querySelectorAll<HTMLButtonElement>('[data-fr]').forEach((b) => b.setAttribute('aria-pressed', String(!filt.hideR.has(b.dataset.fr!))));
    $<HTMLInputElement>('#hideind').checked = filt.hideT.has('people') && filt.hideT.has('officials');
    const k = filt.hideT.size + filt.hideR.size; const fc = $('#fcount');
    fc.hidden = !k; fc.textContent = String(k); fc.setAttribute('aria-label', `${k} active`);
    const tot = g.order, vis = tot - [...HIDDEN].filter((id) => g.hasNode(id)).length;
    $('#fstat').textContent = k ? `${vis} of ${tot} shown` : 'Showing everyone';
    $<HTMLButtonElement>('#freset').disabled = !k;
  }
  function applyFilter() {
    if (state.selected && filt.hideR.has(N(state.selected).race || '')) state.selected = null;
    computeHidden(); renderFilter(); homeMemo = null;
    recompute(); refresh(); renderPanel(); syncHash();
    if (narrowMQ.matches) cam?.setState(home());
  }
  fbox.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b) return;
    if (b.dataset.ft) { const k = b.dataset.ft; filt.hideT.has(k) ? filt.hideT.delete(k) : filt.hideT.add(k); applyFilter(); }
    else if (b.dataset.fr) { const r = b.dataset.fr; filt.hideR.has(r) ? filt.hideR.delete(r) : filt.hideR.add(r); applyFilter(); }
    else if (b.id === 'freset') { filt.hideT.clear(); filt.hideR.clear(); applyFilter(); }
  });
  $<HTMLInputElement>('#hideind').addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    for (const k of ['people', 'officials']) on ? filt.hideT.add(k) : filt.hideT.delete(k);
    applyFilter();
  });
  document.addEventListener('click', (e) => { if (fbox.open && !fbox.contains(e.target as Node)) fbox.open = false; });

  ($('#legendbox') as HTMLDetailsElement).open = window.innerWidth >= 1280;   // collapsed below 1280 px so it never covers the graph
  await tick(); applyHash();
  (window as any).__test = {
    pos: (id: string) => { if (!renderer) { const p = pvPos.get(id); return p ? { x: p.x, y: p.y } : null; } const dd: any = renderer.getNodeDisplayData(id); return dd ? renderer.framedGraphToViewport({ x: dd.x, y: dd.y }) : null; },
    sigma: () => !!renderer, home: () => home(),
    byName: (n: string) => ix.byName.get(n)?.id, state, filt: () => ({ hideT: [...filt.hideT], hideR: [...filt.hideR], hidden: HIDDEN.size }),
    visible: (id: string) => g.hasNode(id) && !HIDDEN.has(id),
    cands: () => d.nodes.filter((n) => n.isTarget && g.hasNode(n.id)).map((n) => n.id),
    leaf: (id: string) => !!byId.get(id)?.leaf,
    nbrs: () => (state.selected && g.hasNode(state.selected) ? g.neighbors(state.selected) : []),
  };
  (window as any).__ready = true;
}


main().catch((err) => { console.error(err); const p = document.getElementById('panel'); if (p) p.innerHTML = '<p>Could not load the graphic data.</p>'; });
