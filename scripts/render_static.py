"""Static, annotated overview of the core network, generated from graph.json (no hand placement).
Writes src/generated/overview-wide.svg and overview-narrow.svg. Labels are placed greedily with
collision tests. Candidates are coloured by race, endorsers by type (src/palette.json)."""
import json, math, os, sys
from html import escape

PALETTE_FALLBACK = '#5f5f5f'

def hull(points):
    pts = sorted(set(points))
    if len(pts) <= 2: return pts
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

def text_w(s, fs, bold=False): return len(s) * fs * (0.58 if bold else 0.54)

def lum(h):
    def c(x):
        x /= 255; return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (int(h[i:i+2], 16) for i in (1, 3, 5)); return 0.2126*c(r) + 0.7152*c(g) + 0.0722*c(b)
def on_color(h): return '#ffffff' if (1.05 / (lum(h) + 0.05)) >= 4.5 else '#111111'

def short_name(n):
    if n['type'] == 'Slate': return n['name'].replace('Berkeley ', '')
    parts = n['name'].replace('"', '').replace('\u201c', '').replace('\u201d', '').split()
    return parts[-1]

def render(d, W, fs, narrow):
    N = {n['id']: n for n in d['nodes']}
    PAL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'palette.json'), encoding='utf-8'))
    grp = {t: g for g, ts in PAL['groupTypes'].items() for t in ts}
    def col(n):
        if n['isTarget']: return PAL['race'].get(n.get('race') or '', PAL['other'])
        return PAL['group'].get(grp.get(n['type'], ''), PAL['other'])
    core = [n for n in d['nodes'] if not n['leaf'] and (n['inDeg'] + n['outDeg']) > 0]
    if narrow:   # portrait: rotate the layout a quarter turn
        for n in core: n['_x'], n['_y'] = n['y'], -n['x']
    else:
        for n in core: n['_x'], n['_y'] = n['x'], n['y']
    xs = [n['_x'] for n in core]; ys = [-n['_y'] for n in core]
    pad = fs * 3.2
    sx = (W - 2 * pad) / (max(xs) - min(xs))
    H = int((max(ys) - min(ys)) * sx + 2 * pad + fs * 1.5)
    P = {n['id']: (pad + (n['_x'] - min(xs)) * sx, pad + fs * 1.5 + (-n['_y'] - min(ys)) * sx) for n in core}
    def rad(n):
        if n['isTarget']: return (3.5 + 1.6 * math.log2(1 + n['inDeg'])) * (W / 1000) * (1.5 if narrow else 1)
        return (1.6 + 0.9 * math.sqrt(n['outDeg'])) * (W / 1000) * (1.4 if narrow else 1)
    out = []
    occupied_pre = []
    # edges (core endorsement edges + membership)
    el = []; pl = []
    for e in d['edges']:
        if e['s'] in P and e['t'] in P:
            (x1, y1), (x2, y2) = P[e['s']], P[e['t']]
            if e['kind'] == 'member':
                el.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#444" stroke-width="1" stroke-dasharray="3 2" stroke-opacity=".7"/>')
            else:
                el.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="#6e6e6e" stroke-opacity=".3" stroke-width="{.9 if narrow else .8}"/>')
    out.insert(0, '<g>' + ''.join(el) + ''.join(pl) + '</g>')
    # nodes
    occupied = list(occupied_pre)   # rects (x0,y0,x1,y1)
    nl = []
    for n in sorted(core, key=lambda n: (n['isTarget'], n['inDeg'])):
        x, y = P[n['id']]; r = rad(n); c = col(n)
        nl.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{c}" stroke="{"#111" if n["isTarget"] else "#fff"}" stroke-width="{1.2 if n["isTarget"] else .6}"/>')
        if n['isTarget']: occupied.append((x - r, y - r, x + r, y + r))
    out.append('<g>' + ''.join(nl) + '</g>')
    # labels: every candidate, by in-degree
    def place(lbl, x, y, r, fsz, bold, force):
        w = text_w(lbl, fsz, bold); h = fsz * 1.05
        cands = [(x + r + 3, y + h * 0.35, 'start'), (x - r - 3, y + h * 0.35, 'end'), (x, y - r - 4, 'middle'), (x, y + r + h * 0.95, 'middle')]
        if force:   # more room for guaranteed labels: rings of positions further out (drawn with a leader line)
            for k in (1, 2, 3, 4, 5):
                dist = r + h * (0.9 * k)
                for j in range(16):
                    a = 2 * math.pi * j / 16; cx_, cy_ = x + dist * math.cos(a), y + dist * math.sin(a)
                    anc = 'start' if math.cos(a) > 0.3 else 'end' if math.cos(a) < -0.3 else 'middle'
                    cands.append((cx_, cy_ + h * 0.35, anc))
        own = (x - r - 0.5, y - r - 0.5, x + r + 0.5, y + r + 0.5)
        best = None
        def lead(tx, ty, rect):
            if math.hypot(tx - x, ty - h * 0.35 - y) > r + h * 1.3:   # far from its node: draw a leader line
                lx = min(max(x, rect[0]), rect[2]); ly = min(max(y, rect[1]), rect[3])
                ang = math.atan2(ly - y, lx - x)
                leaders.append(f'<line x1="{x + r * math.cos(ang):.1f}" y1="{y + r * math.sin(ang):.1f}" x2="{lx:.1f}" y2="{ly:.1f}" stroke="#111" stroke-width="{1.4 if narrow else 1}"/>')
        for tx, ty, anc in cands:
            x0 = tx if anc == 'start' else tx - w if anc == 'end' else tx - w / 2
            rect = (x0 - 2, ty - h * 0.85, x0 + w + 2, ty + h * 0.2)
            if rect[0] < 0 or rect[2] > W or rect[1] < 0 or rect[3] > H: continue
            ov = sum(max(0, min(rect[2], o[2]) - max(rect[0], o[0])) * max(0, min(rect[3], o[3]) - max(rect[1], o[1]))
                     for o in occupied if not (abs(o[0] - own[0]) < 1 and abs(o[3] - own[3]) < 1))
            if ov == 0: occupied.append(rect); lead(tx, ty, rect); return tx, ty, anc
            if best is None or ov < best[0]: best = (ov, tx, ty, anc, rect)
        if force and best:
            occupied.append(best[4]); lead(best[1], best[2], best[4]); return best[1], best[2], best[3]
        return None
    labels = []; leaders = []
    tg = sorted([n for n in core if n['isTarget']], key=lambda n: (bool(n.get('analysisEndorser')), bool(n.get('memberOf')), -n['inDeg']))
    for n in tg:   # every candidate is labelled (forced placement); a withdrawn one is marked as such
        x, y = P[n['id']]
        lbl = short_name(n) + (' (withdrew)' if n.get('analysisEndorser') else '')
        p = place(lbl, x, y, rad(n), fs, False, True)
        if p: labels.append((p, lbl, False))
    tl = list(leaders)
    for p, lbl, bold in labels:
        if not p: continue
        tx, ty, anc = p
        tl.append(f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="{anc}" font-size="{fs:.1f}" font-weight="{700 if bold else 500}" paint-order="stroke" stroke="#fff" stroke-width="{fs * 0.22:.1f}" stroke-linejoin="round" fill="#111">{escape(lbl)}</text>')
    out.append('<g font-family="var(--sans)">' + ''.join(tl) + '</g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="100%" aria-hidden="true" focusable="false">' + ''.join(out) + '</svg>'

def main(graph_json, outdir):
    d = json.load(open(graph_json, encoding='utf-8'))
    os.makedirs(outdir, exist_ok=True)
    open(os.path.join(outdir, 'overview-wide.svg'), 'w', encoding='utf-8').write(render(d, 1000, 19, False))
    open(os.path.join(outdir, 'overview-narrow.svg'), 'w', encoding='utf-8').write(render(d, 1000, 38, True))

if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    main(os.path.join(here, '..', 'public', 'data', 'graph.json'), os.path.join(here, '..', 'src', 'generated'))
