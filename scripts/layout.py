"""Deterministic 'dandelion' layout: core graph by ForceAtlas2, single-candidate endorsers in
phyllotaxis clouds around their candidate, then circle-collision relaxation."""
import math, numpy as np, networkx as nx

GOLDEN = math.pi * (3 - math.sqrt(5))

def layout(U, core, leaves_of, is_target, seed=7, spacing=2.1, iters=1500, label_len=None):
    # 1. core layout
    pos = nx.forceatlas2_layout(core, max_iter=iters, scaling_ratio=2.0, gravity=1.0, linlog=False, seed=seed)
    P = np.array([pos[n] for n in core], dtype=float)
    P -= P.mean(0); P /= np.abs(P).max(); P *= 100
    nodes = list(core)
    idx = {n: i for i, n in enumerate(nodes)}
    # radii: targets get room for their cloud
    rad = np.array([(3.0 + spacing * math.sqrt(len(leaves_of.get(n, [])) + 1.5)) if is_target(n) else 1.6 for n in nodes])
    home = P.copy()
    T = [i for i, n in enumerate(nodes) if is_target(n)]
    LW = {i: (label_len(nodes[i]) * 2.0 if label_len else 0) for i in T}
    for it in range(600):
        diff = P[:, None, :] - P[None, :, :]
        dist = np.sqrt((diff ** 2).sum(-1)) + 1e-9
        need = rad[:, None] + rad[None, :] + 1.2
        over = np.clip(need - dist, 0, None); np.fill_diagonal(over, 0)
        if over.max() < 1e-3: break
        push = (diff / dist[..., None]) * (over[..., None] / 2)
        P += push.sum(1) * 0.5
        P += (home - P) * 0.01
        # label-aware: labels sit to the right of target nodes; keep them from colliding
        if label_len is not None:
            for a in T:
                for b in T:
                    if a == b: continue
                    dx = P[b, 0] - P[a, 0]; dy = P[b, 1] - P[a, 1]
                    if 0 <= dx < LW[a] + rad[a] and abs(dy) < 6.5:
                        s_ = (6.5 - abs(dy)) / 2 * (1 if dy >= 0 else -1)
                        P[b, 1] += s_; P[a, 1] -= s_
    out = {n: (float(P[idx[n]][0]), float(P[idx[n]][1])) for n in nodes}
    # 2. leaf clouds
    center = P.mean(0)
    for t, ls in leaves_of.items():
        if t not in idx: continue
        cx, cy = P[idx[t]]
        base = math.atan2(cy - center[1], cx - center[0])
        r0 = 3.0
        for i, l in enumerate(sorted(ls)):
            r = r0 + spacing * math.sqrt(i + 1.5)
            a = base + i * GOLDEN
            out[l] = (float(cx + r * math.cos(a)), float(cy + r * math.sin(a)))
    return out
