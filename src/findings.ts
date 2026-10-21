import './fonts.css';
import './style.css';
import type { Data } from './types';
import { esc, index, listJoin, chip, pct, raceShort, plural, shortName, contrast, surname, commColor } from './text';
const hoverMQ = window.matchMedia('(hover: hover) and (pointer: fine)');

// ---------- co-assignment heatmap (real table) ----------
function heat(v: number) {   // returns hex so contrast() can read it
  const h = 222 / 360, sat = (35 + v * 35) / 100, l = (98 - v * 74) / 100;
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; const c = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(h + 1 / 3)}${f(h)}${f(h - 1 / 3)}`;
}
function renderHeatmap(d: Data) {
  const ix = index(d);
  const order = [...d.communities.flatMap((c) => c.targets), ...d.loose.map((l) => l.id)];
  const ids = order.filter((id, i) => order.indexOf(id) === i);
  const N = (id: string) => ix.byId.get(id)!;
  const lab = (id: string) => { const n = N(id); return n.type === 'Slate' ? 'Slate page' : surname(n); };
  let h = `<table class="hm"><caption class="sr">Share of ${d.summary.nRuns.toLocaleString("en-US")} clustering runs in which each pair of candidates is grouped together</caption><thead><tr><td></td>${ids.map((id) => `<th scope="col"><span>${chip(N(id).community)} ${esc(lab(id))}</span></th>`).join('')}</tr></thead><tbody>`;
  for (const a of ids) {
    h += `<tr><th scope="row">${chip(N(a).community)} ${esc(lab(a))}${N(a).memberOf ? '<sup aria-label="slate member">s</sup>' : ''} <small>${esc(raceShort(N(a).race))}</small></th>`;
    for (const b of ids) {
      const ca = N(a).community, cb = N(b).community;
      const same = ca >= 0 && ca === cb;
      if (a === b) { h += `<td class="diag${same ? ' blk' : ''}" ${same ? `style="--bc:${commColor(ca)}"` : ''}><span class="sr">same candidate</span></td>`; continue; }
      const v = ix.together(a, b); const bg = heat(v); const fg = contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#fff' : '#000';
      h += `<td class="${same ? 'blk' : ''}" style="background:${bg};color:${fg};${same ? `--bc:${commColor(ca)}` : ''}" title="${esc(N(a).name)} & ${esc(N(b).name)}: together in ${pct(v)} of runs">${v > 0 && v < 0.005 ? '&lt;1' : Math.round(v * 100)}</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  const hm = document.getElementById('heatmap')!;
  hm.innerHTML = h;
  hm.tabIndex = 0; hm.setAttribute('role', 'region'); hm.setAttribute('aria-label', 'Co-assignment table; scroll sideways to see every column');
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
    const fmt = (o: Data['overlap'][number]) => (metric === 'n' ? String(o.n) : o[metric] > 0 && o[metric] < 0.005 ? '<1' : String(Math.round(o[metric] * 100)));
    const lab = (id: string) => (N(id).type === 'Slate' ? 'Right to Housing slate' : shortName(N(id)));
    let h = `<table class="ovt"><caption class="sr">Endorser overlap between candidates (${metric === 'j' ? 'Jaccard similarity, percent' : metric === 'oc' ? 'shared endorsers as a percent of the smaller list' : 'number of shared endorsers'})</caption><thead><tr><td></td>${ids.slice(0, -1).map((id) => `<th scope="col"><span>${esc(lab(id))}</span></th>`).join('')}</tr></thead><tbody>`;
    ids.forEach((a, i) => {
      if (i === 0) return;
      h += `<tr><th scope="row">${chip(N(a).community)} ${esc(lab(a))} <small>${esc(raceShort(N(a).race))}</small></th>`;
      ids.slice(0, -1).forEach((b, j) => {
        if (j >= i) { h += '<td class="void"></td>'; return; }
        const o = ov.get(a + '|' + b);
        if (!o) { h += '<td class="zero"><span class="sr">none</span></td>'; return; }
        const t = Math.sqrt(o[metric] / max); const bg = heat(t); const fg = contrast('#ffffff', bg) >= contrast('#000000', bg) ? '#fff' : '#000';
        h += `<td tabindex="0" data-a="${esc(a)}" data-b="${esc(b)}" style="background:${bg};color:${fg}">${esc(fmt(o))}</td>`;
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    el.querySelector('.ovwrap')!.innerHTML = h;
    const w = el.querySelector<HTMLElement>('.ovwrap')!; w.tabIndex = 0; w.setAttribute('role', 'region'); w.setAttribute('aria-label', 'Endorser overlap table; scroll sideways to see every column');
  };
  el.innerHTML = `<div id="ovtip" class="ovtip" role="status" hidden></div><div class="seg" role="group" aria-label="Overlap measure"><button data-m="j" aria-pressed="true">Jaccard (% of combined lists)</button><button data-m="oc" aria-pressed="false">% of smaller list</button><button data-m="n" aria-pressed="false">Raw count</button></div><div class="ovwrap"></div>`;
  draw();
  const tip = document.getElementById('ovtip')!;
  let cur: HTMLElement | null = null;
  const hide = () => { tip.hidden = true; cur = null; };
  const show = (cell: HTMLElement) => {
    const a = cell.dataset.a!, b = cell.dataset.b!; const o = ov.get(a + '|' + b); if (!o) { hide(); return; }
    cur = cell;
    const names = o.shared.map((s) => N(s).name);
    const sheet = window.matchMedia('(max-width: 640px)').matches;
    tip.classList.toggle('sheet', sheet);
    tip.innerHTML = `<button class="ovx" aria-label="Close">×</button><strong>${esc(N(a).name)} & ${esc(N(b).name)}</strong><br>${o.n} shared ${plural(o.n, 'endorser')} · ${pct(o.j)} of combined lists · ${pct(o.oc)} of the smaller list<br>${esc(listJoin(names.slice(0, 14)))}${names.length > 14 ? ` and ${names.length - 14} more` : ''}`;
    if (!sheet) {
      const r = cell.getBoundingClientRect(), pr = el.getBoundingClientRect();
      tip.style.left = Math.max(0, Math.min(r.left - pr.left, el.clientWidth - 310)) + 'px'; tip.style.top = r.bottom - pr.top + 6 + 'px';
    } else { tip.style.left = ''; tip.style.top = ''; }
    tip.hidden = false;
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.ovx')) { hide(); return; }
    const b = t.closest<HTMLElement>('[data-m]');
    if (b) { metric = b.dataset.m as any; el.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); hide(); draw(); return; }
    const c = t.closest<HTMLElement>('td[data-a]');
    if (c) { if (wasOpen === c && !hoverMQ.matches) hide(); else show(c); }
    wasOpen = null;
  });
  let wasOpen: HTMLElement | null = null;   // a second tap on the same cell closes it (focus fires before click, so look at pointerdown)
  el.addEventListener('pointerdown', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-a]'); wasOpen = c && cur === c && !tip.hidden ? c : null; });
  document.addEventListener('click', (e) => { if (!el.contains(e.target as Node)) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  el.addEventListener('mouseover', (e) => { if (!hoverMQ.matches) return; const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-a]'); if (c) show(c); });
  el.addEventListener('focusin', (e) => { const c = (e.target as HTMLElement).closest<HTMLElement>('td[data-a]'); if (c) show(c); });
  el.addEventListener('mouseleave', () => { if (hoverMQ.matches) hide(); });
}


fetch('/data/graph.json').then((r) => r.json()).then((d: Data) => { renderHeatmap(d); renderOverlap(d); })
  .catch((err) => { console.error(err); });
