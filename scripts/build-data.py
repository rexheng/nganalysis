#!/usr/bin/env python3
"""Build-time data pipeline: clean/*.csv -> public/data/graph.json (+ copies of downloads).

Usage:  python scripts/build-data.py [--clean ../clean] [--out public/data]

Reads ONLY the cleaned CSVs (endorsements.csv, endorsers.csv, candidates.csv).
Pamphlet "I refer to the following residents" lists live in pamphlet_references.csv and are
never read as edges.

Model: nodes = actors; edges = directed endorser -> candidate/slate, unweighted.
Analysis (all on the undirected, unweighted projection):
  * "core" graph = drop endorsers who endorse exactly one candidate/slate and nothing else
    (degree-1 leaves cannot lie on a shortest path between other nodes, and they only inflate
    hub scores), and drop isolated candidates.
  * Louvain communities on the core graph, 200 seeds, keep the highest-modularity partition;
    report how often each pair of candidates lands together (stability).
    Leaves inherit the community of their single neighbour.
  * Betweenness centrality (exact, normalized) on the core graph.
  * Endorser overlap between every pair of candidates (count + Jaccard).
  * ForceAtlas2 layout (fixed seed) on the full graph for a stable precomputed layout.
"""
import argparse, csv, json, os, re, shutil, hashlib, collections, datetime, math, sys
# Louvain iterates Python sets of node ids; pin string hashing so results are reproducible.
if os.environ.get('PYTHONHASHSEED') != '0':
    os.environ['PYTHONHASHSEED'] = '0'
    os.execv(sys.executable, [sys.executable] + sys.argv)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from layout import layout as dandelion_layout
from urllib.parse import urlparse
import networkx as nx
from networkx.algorithms.community import louvain_communities, modularity

ap = argparse.ArgumentParser()
here = os.path.dirname(os.path.abspath(__file__))
ap.add_argument('--clean', default=os.path.normpath(os.path.join(here, '..', '..', 'clean')))
ap.add_argument('--out', default=os.path.normpath(os.path.join(here, '..', 'public', 'data')))
ap.add_argument('--seeds', type=int, default=200)
args = ap.parse_args()
C = args.clean
os.makedirs(args.out, exist_ok=True)

def rd(name, required=True):
    p = os.path.join(C, name)
    if not os.path.exists(p):
        if required: raise SystemExit(f'missing {p}')
        return []
    with open(p, newline='', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))

def _k(s): return re.sub(r'[^a-z0-9]', '', (s or '').lower())
def col(row, *names, default=''):
    """Tolerant column getter: exact key, then normalized-key match."""
    for n in names:
        if n in row and row[n] is not None: return row[n].strip()
    nk = {_k(k): k for k in row}
    for n in names:
        k = nk.get(_k(n))
        if k is not None and row[k] is not None: return row[k].strip()
    return default
def has(rows, *names):
    if not rows: return False
    ks = {_k(k) for k in rows[0]}
    return any(_k(n) in ks for n in names)

E = rd('endorsements.csv'); EN = rd('endorsers.csv'); CA = rd('candidates.csv')
SM = rd('slate_members.csv', required=False); ES = rd('edge_sources.csv', required=False)
RACE_ORDER = ['Auditor', 'Council D1', 'Council D4', 'Council D7', 'Council D8', 'Rent Board', 'School Board']
SLATE = 'Berkeley Right to Housing slate'

def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def valid_url(u):
    try:
        p = urlparse(u); return p.scheme in ('http', 'https') and bool(p.netloc) and ' ' not in u
    except Exception: return False
def day(s):
    m = re.match(r'(\d{4}-\d{2}-\d{2})', s or ''); return m.group(1) if m else (s or '')
def mkid(name): return 'N' + hashlib.md5(name.lower().encode()).hexdigest()[:7]

# ---------- nodes ----------
nodes = {}; name2id = {}
def ensure(name, nid=None, typ='', title=''):
    if name in name2id: return name2id[name]
    nid = nid or mkid(name)
    name2id[name] = nid
    nodes.setdefault(nid, dict(id=nid, name=name, type=typ or 'Individual', title=title, variants=[]))
    return nid
for r in EN:
    name = col(r, 'Endorser', 'name'); nid = col(r, 'endorser_id', 'id') or mkid(name)
    name2id[name] = nid
    nodes[nid] = dict(id=nid, name=name, type=col(r, 'Endorser type', 'type') or 'Individual',
                      title=col(r, 'Canonical title', 'Title/affiliation (most common)', 'Title/affiliation', 'title'),
                      variants=[v.strip() for v in re.split(r'\s*\|\s*', col(r, 'Name variants seen', 'variants')) if v.strip()])
cand_names = []; cand_info = {}
for r in CA:
    n = col(r, 'Candidate', 'name')
    if not n: continue
    cand_names.append(n)
    nid = ensure(n, col(r, 'endorser_id', 'candidate_id') or None)
    nd = nodes[nid]
    status = col(r, 'Status', 'status')
    if n == SLATE or 'slate' in n.lower(): nd['type'] = 'Slate'
    elif nd['type'] == 'Candidate (withdrawn)' or 'withdrawn' in status.lower(): nd['type'] = 'Candidate (withdrawn)'
    else: nd['type'] = 'Candidate'
    nd['isCandidate'] = nd['type'] != 'Slate'
    nd['isTarget'] = True
    nd['race'] = col(r, 'Race', 'race')
    nd['campaignUrl'] = col(r, 'Campaign URL', 'campaign_url'); nd['endorsementsPage'] = col(r, 'Endorsements page', 'endorsements_page_url')
    nd['candNotes'] = col(r, 'Notes', 'notes')
    if status: nd['status'] = status
    cand_info[n] = dict(Race=nd['race'])

# ---------- sources (optional separate table) ----------
def src_from(r):
    u = col(r, 'Source', 'source_url', 'url')
    return dict(u=u, ty=col(r, 'Source type', 'source_type', 'source_kind'), pg=col(r, 'voter_guide_page', 'Voter guide page', 'page'),
                snap=col(r, 'snapshot_path', 'Snapshot path'), at=day(col(r, 'accessed_at', 'Date accessed', 'source_accessed_date')),
                shot=('screenshot' in col(r, 'capture_method').lower() or col(r, 'snapshot_path').lower().endswith(('.png', '.jpg'))))
es_by_edge = collections.defaultdict(list); es_by_pair = collections.defaultdict(list)
for r in ES:
    sr = src_from(r)
    if not sr['u']: continue
    eid = col(r, 'edge_id', 'endorsement_id')
    if eid: es_by_edge[eid].append(sr)
    s_ = col(r, 'endorser_id') or name2id.get(col(r, 'Endorser', 'endorser'), '')
    t_ = col(r, 'Endorses', 'target', 'candidate', 'target_name')
    if s_ and t_: es_by_pair[(s_, t_)].append(sr)

# ---------- edges ----------
edges = []; bad_urls = []
def add_edge(s, t, kind, r, i):
    ename = nodes[s]['name']; tname = nodes[t]['name']
    eid = col(r, 'edge_id', 'endorsement_id')
    srcs = es_by_edge.get(eid) if eid else None
    if not srcs: srcs = es_by_pair.get((s, tname)) or es_by_pair.get((s, t))
    if not srcs:
        urls = [u.strip() for u in re.split(r'\s*\|\s*', col(r, 'Source', 'source_url')) if u.strip()]
        types = [x.strip() for x in re.split(r'\s*[+|]\s*', col(r, 'Source type', 'source_type')) if x.strip()]
        base = src_from(r)
        srcs = [dict(base, u=u, ty=(types[j] if j < len(types) else (types[0] if types else ''))) for j, u in enumerate(urls)]
    # de-dupe identical url+page
    seen = set(); uniq = []
    for sr in srcs:
        key = (sr['u'], sr.get('pg', ''))
        if key in seen:
            for x in uniq:
                if (x['u'], x.get('pg', '')) == key and sr.get('shot'): x['shot'] = True
        if key in seen: continue
        seen.add(key); uniq.append(sr)
    for sr in uniq:
        if not valid_url(sr['u']): bad_urls.append((ename, tname, sr['u']))
    rel = col(r, 'Relationship', 'relationship') or ('Slate member' if kind == 'member' else 'Endorses')
    edges.append(dict(id=f'e{i}', s=s, t=t, kind=kind, rel=rel, rank=col(r, 'Ranking', 'rank'), rankNote=col(r, 'Rank note', 'rank_note'), formality=col(r, 'Formality', 'formality'),
                      title=col(r, 'Title as written (primary source)', 'Canonical title', 'Title/affiliation', 'title'), src=uniq,
                      date=next((x['at'] for x in uniq if x['at']), day(col(r, 'accessed_at', 'Date accessed'))),
                      asw=col(r, 'Name(s) as written', 'name_as_written')))
i = 0
for r in E:
    sname = col(r, 'Endorser', 'endorser'); s = col(r, 'endorser_id') or ''
    if s and s not in nodes:
        nodes[s] = dict(id=s, name=sname, type=col(r, 'Endorser type') or 'Individual', title='', variants=[]); name2id.setdefault(sname, s)
    if not s: s = ensure(sname, typ=col(r, 'Endorser type'))
    tname = col(r, 'Endorses', 'target', 'candidate'); tid = col(r, 'target_id')
    t = tid if tid in nodes else (name2id.get(tname) or ensure(tname, tid or None, typ='Candidate'))
    rel = col(r, 'Relationship', 'relationship')
    kind = 'member' if rel.lower().startswith('slate member') or rel.lower().startswith('member') else 'endorsement'
    if kind == 'member':   # old format: slate -> member row; normalise to member -> slate
        add_edge(t, s, 'member', r, i)
    else:
        add_edge(s, t, kind, r, i)
    if not nodes[s]['title'] and col(r, 'Canonical title', 'Title/affiliation'): nodes[s]['title'] = col(r, 'Canonical title', 'Title/affiliation')
    i += 1
sm_groups = collections.OrderedDict()
for r in SM:
    sl = col(r, 'Slate', 'slate', 'slate_name') or SLATE
    mem = col(r, 'Member', 'member', 'Candidate', 'candidate', 'member_name')
    if not mem: continue
    sm_groups.setdefault((sl, col(r, 'slate_id'), mem, col(r, 'member_id')), []).append(r)
for (sl, slid, mem, mid_), rs in sm_groups.items():
    sid = name2id.get(sl) or ensure(sl, slid or None, typ='Slate'); mid = name2id.get(mem) or ensure(mem, mid_ or None, typ='Candidate')
    if any(e['kind'] == 'member' and e['s'] == mid and e['t'] == sid for e in edges): continue
    srcs = [src_from(r) for r in rs if col(r, 'Source', 'source_url')]
    es_by_pair[(mid, nodes[sid]['name'])] = srcs
    rr = dict(rs[0]); rr.setdefault('Relationship', 'Slate member'); rr.pop('edge_id', None)
    add_edge(mid, sid, 'member', rr, i); i += 1
if bad_urls: raise SystemExit(f'Invalid source URLs: {bad_urls[:5]} ({len(bad_urls)})')

# keep only nodes that participate in at least one edge, plus all candidates
used = {e['s'] for e in edges} | {e['t'] for e in edges} | {name2id[n] for n in cand_names}
nodes = {k: v for k, v in nodes.items() if k in used}
for nd in nodes.values():
    nd.setdefault('isCandidate', False); nd.setdefault('isTarget', False)
    if nd['type'].startswith('Candidate') and not nd['isCandidate']:
        nd['typeNote'] = 'Listed as a candidate for another office; not on this ballot in the races covered here'
type_overrides = []
for e in edges:
    if e['kind'] != 'member': continue
    if e['rel'].lower().startswith(('slate member', 'member')): nodes[e['s']]['memberOf'] = e['t']
    elif nodes[e['s']]['type'].startswith('Candidate') and not nodes[e['s']]['isTarget']:
        # e.g. a nominating convention typed 'Candidate' in the source table: it is an organization
        type_overrides.append(dict(id=e['s'], was=nodes[e['s']]['type'], now='Political/advocacy org', why=e['rel']))
        nodes[e['s']]['type'] = 'Political/advocacy org'; nodes[e['s']].pop('typeNote', None)
        nodes[e['s']]['typeNote'] = f"Typed \u201c{type_overrides[-1]['was']}\u201d in the source table; shown as a political/advocacy organization because the record is a {e['rel'].lower()} link"
    if e['kind'] == 'member' and nodes[e['t']]['type'] != 'Slate': nodes[e['t']]['type'] = 'Slate'

for nd in nodes.values():   # 'Slate' is only meaningful for a slate on the ballot; other actors typed so are organizations
    if nd['type'] == 'Slate' and not nd.get('isTarget'):
        type_overrides.append(dict(id=nd['id'], was='Slate', now='Political/advocacy org', why='not a slate on the ballot'))
        nd['type'] = 'Political/advocacy org'
        nd['typeNote'] = 'Typed \u201cSlate\u201d in the source table; shown as a political/advocacy organization because it is not a slate on the ballot'

# ---------- graphs ----------
D = nx.DiGraph(); D.add_nodes_from(nodes)
for e in edges:
    if e['kind'] == 'endorsement': D.add_edge(e['s'], e['t'])
U = nx.Graph(D.to_undirected())
for e in edges:
    if e['kind'] == 'member': U.add_edge(e['s'], e['t'])   # membership ties count in the structure
deg = dict(U.degree())
cand_ids = {name2id[n] for n in cand_names}
leaves = {n for n in U if deg[n] == 1 and n not in cand_ids}
core = U.subgraph([n for n in U if n not in leaves and deg[n] > 0]).copy()
# drop core nodes that became isolated (can't happen for targets with >=1 non-leaf... keep safe)
core.remove_nodes_from([n for n in list(core) if core.degree(n) == 0])


# ---------- Louvain, many seeds -> consensus (co-assignment) ----------
def nm(n): return nodes[n]['name']
best = None; parts = []; memb = []
for seed in range(args.seeds):
    p = louvain_communities(core, seed=seed, resolution=1.0)
    q = modularity(core, p)
    parts.append(p); memb.append({n: ci for ci, c in enumerate(p) for n in c})
    if best is None or q > best[0] + 1e-12: best = (q, p, seed)
Q, P, best_seed = best
R = len(parts)
n_comm_dist = collections.Counter(len(p) for p in parts)
targets_core = sorted([n for n in core if nodes[n]['isTarget']], key=nm)
_pt = {}
for i, a_ in enumerate(targets_core):
    for b_ in targets_core[i+1:]:
        v = sum(1 for m in memb if m[a_] == m[b_]) / R
        _pt[(a_, b_)] = _pt[(b_, a_)] = v
def together(a, b): return 1.0 if a == b else _pt.get((a, b), 0.0)
ROBUST = 0.75
# complete linkage: merge the two clusters whose *weakest* cross pair is strongest, while that pair >= ROBUST
cl = [[t] for t in targets_core]
while len(cl) > 1:
    bestm = None
    for i in range(len(cl)):
        for j in range(i+1, len(cl)):
            mn = min(together(x, y) for x in cl[i] for y in cl[j])
            if bestm is None or mn > bestm[0]: bestm = (mn, i, j)
    if bestm[0] < ROBUST: break
    _, i, j = bestm; cl[i] += cl[j]; del cl[j]
def endorsers_of_set(ts):
    out = set()
    for t in ts: out |= set(D.predecessors(t))
    return out
bloc_list = [c for c in cl if len(c) >= 2]
bloc_list.sort(key=lambda c: (-len(endorsers_of_set(c)), min(nm(x) for x in c)))
loose = sorted([c[0] for c in cl if len(c) == 1], key=lambda n: -D.in_degree(n))
bloc_of = {}
for bi, c in enumerate(bloc_list):
    for t in c: bloc_of[t] = bi
comm = {}
for t in targets_core: comm[t] = bloc_of.get(t, -1)
# endorsers in the core: join a bloc only if they sit with its candidates in >= ROBUST of runs on average
end_bloc_score = {}
for n in core:
    if n in comm: continue
    sc = [sum(sum(1 for m in memb if m[n] == m[t]) for t in c) / (R * len(c)) for c in bloc_list]
    k = max(range(len(sc)), key=lambda i: sc[i]) if sc else -1
    end_bloc_score[n] = round(sc[k], 3) if sc else 0
    comm[n] = k if sc and sc[k] >= ROBUST else -1
for n in leaves:
    nb = next(iter(U[n])); comm[n] = comm.get(nb, -1)
for n in U: comm.setdefault(n, -1)
def group(t):   # analysis "camp": a robust bloc, or a loose candidate on its own
    return f'b{comm[t]}' if comm.get(t, -1) >= 0 else f't{t}'
def anchors(c): return [t for t in c if not nodes[t].get('memberOf')]
comm_meta = []
for bi, c in enumerate(bloc_list):
    pairs = [(x, y) for i, x in enumerate(c) for y in c[i+1:]]
    wa, wb = min(pairs, key=lambda pr: together(*pr))
    members_all = [n for n in U if comm[n] == bi]
    endorsers_all = [n for n in members_all if not nodes[n]['isTarget']]
    tc = collections.Counter(nodes[n]['type'] for n in endorsers_all)
    comm_meta.append(dict(id=bi, size=len(members_all), targets=sorted(c, key=lambda n: -D.in_degree(n)),
                          anchors=sorted(anchors(c), key=lambda n: -D.in_degree(n)),
                          weakest=dict(a=wa, b=wb, p=round(together(wa, wb), 3)),
                          nEndorsersOfTargets=len(endorsers_of_set(c)), typeCounts=dict(tc.most_common())))
# ties between blocs / loose candidates that are common but below the robust threshold
ties = []
units = [('b', bi, c) for bi, c in enumerate(bloc_list)] + [('t', t, [t]) for t in loose]
for i, (ka, ia, ca) in enumerate(units):
    for kb, ib, cb in units[i+1:]:
        prs = [(together(x, y), x, y) for x in ca for y in cb]
        mx = max(prs); mean = sum(p_[0] for p_ in prs) / len(prs)
        if mx[0] >= 0.5:
            ties.append(dict(a=f'{ka}{ia}', b=f'{kb}{ib}', max=round(mx[0], 3), maxA=mx[1], maxB=mx[2], mean=round(mean, 3)))
ties.sort(key=lambda t_: -t_['max'])
loose_meta = []
for t in loose:
    ps = sorted(((together(t, o), o) for o in targets_core if o != t), reverse=True)
    loose_meta.append(dict(id=t, partners=[dict(t=o, p=round(v, 3)) for v, o in ps[:3]]))

# ---------- betweenness + bridges ----------
bc_core = nx.betweenness_centrality(core, normalized=True)
bc_full = nx.betweenness_centrality(U, normalized=True)
for n in nodes:
    nodes[n]['bc'] = round(bc_core.get(n, 0.0), 6)
    nodes[n]['bcFull'] = round(bc_full.get(n, 0.0), 6)
    nodes[n]['community'] = comm[n]
    nodes[n]['outDeg'] = D.out_degree(n); nodes[n]['inDeg'] = D.in_degree(n)
    nodes[n]['leaf'] = n in leaves
    if n in end_bloc_score: nodes[n]['blocScore'] = end_bloc_score[n]
    if nodes[n]['isTarget'] and n in core and comm[n] < 0: nodes[n]['loose'] = True
for n in nodes: nodes[n].pop('commsTouched', None)

def reach_of(outs):
    gs = collections.Counter(group(t) for t in outs)
    k = sum(gs.values())
    return len(gs), (1 - sum((v / k) ** 2 for v in gs.values())) if k else 0.0
def rank_competition(items, key):
    items = sorted(items, key=key); ranks = {}; prev = None
    for i, it in enumerate(items):
        kk = key(it)[:-1]
        if kk != prev: r_ = i + 1; prev = kk
        ranks[it] = r_
    return ranks
cand_bridge = [n for n in nodes if not nodes[n]['isTarget'] and D.out_degree(n) >= 2]
def reach_ranks(outs_map):
    rr = {n: reach_of(outs_map[n]) for n in cand_bridge}
    return rank_competition(cand_bridge, lambda n: (-rr[n][0], -round(rr[n][1], 6), -len(outs_map[n]), nm(n))), rr
base_outs = {n: sorted(D.successors(n)) for n in cand_bridge}
rank_reach, rr0 = reach_ranks(base_outs)
rank_bc = rank_competition(cand_bridge, lambda n: (-round(bc_core.get(n, 0), 9), nm(n)))
# robustness: bootstrap over endorsement edges (drop a random 10% of edges, recompute), plus leave-one-edge-out
import random
rng = random.Random(20261103)
end_edges = [(e['s'], e['t']) for e in edges if e['kind'] == 'endorsement']
mem_edges = [(e['s'], e['t']) for e in edges if e['kind'] == 'member']
BOOT = 200; TOPK = 10
top_reach = collections.Counter(); top_bc = collections.Counter()
for bi_ in range(BOOT):
    keep = [e_ for e_ in end_edges if rng.random() >= 0.10]
    om = collections.defaultdict(list)
    for s_, t_ in keep: om[s_].append(t_)
    rk, _ = reach_ranks({n: om.get(n, []) for n in cand_bridge})
    for n in cand_bridge:
        if rk[n] <= TOPK and len(om.get(n, [])) >= 2: top_reach[n] += 1
    if bi_ < 100:   # betweenness is slower: 100 resamples
        G = nx.Graph(); G.add_edges_from(keep); G.add_edges_from(mem_edges)
        dg = dict(G.degree()); lv = {x for x in G if dg[x] == 1 and x not in cand_ids}
        Gc = G.subgraph([x for x in G if x not in lv]).copy()
        b_ = nx.betweenness_centrality(Gc, normalized=True)
        rkb = rank_competition([n for n in cand_bridge], lambda n: (-round(b_.get(n, 0), 9), nm(n)))
        for n in cand_bridge:
            if rkb[n] <= TOPK and b_.get(n, 0) > 0: top_bc[n] += 1
# leave-one-edge-out for the reach ranking: worst rank after deleting any single endorsement edge
loo_worst = {}
contenders = [n for n in cand_bridge if rank_reach[n] <= 25]
for n in contenders:
    worst = rank_reach[n]
    for e_ in set(base_outs[n]):
        om = dict(base_outs); om[n] = [t for t in base_outs[n] if t != e_]
        if len(om[n]) < 2: worst = max(worst, 10**6); continue
        rk, _ = reach_ranks(om); worst = max(worst, rk[n])
    loo_worst[n] = worst
ROBUST_SHARE = 0.80
# leave-one-edge-out for betweenness: worst rank of each endorser over every single endorsement-edge removal
bc_loo_worst = {n: rank_bc[n] for n in cand_bridge if bc_core.get(n, 0) > 0}
bc_loo_edge = {}
bc_loo_out = {}   # for top-K bridges: which single endorsements, if removed, push them out of the top K
for e_ in end_edges:
    if not (core.has_edge(*e_)): continue   # removing a leaf edge does not change core betweenness
    Gc = core.copy(); Gc.remove_edge(*e_)
    Gc.remove_nodes_from([x for x in list(Gc) if Gc.degree(x) == 0])
    b_ = nx.betweenness_centrality(Gc, normalized=True)
    rkb = rank_competition(cand_bridge, lambda n: (-round(b_.get(n, 0), 9), nm(n)))
    for n in bc_loo_worst:
        rnew = rkb[n] if b_.get(n, 0) > 0 else 10**6
        if rnew > bc_loo_worst[n]: bc_loo_worst[n] = rnew; bc_loo_edge[n] = list(e_)
        if rank_bc[n] <= TOPK and rnew > TOPK and n in e_: bc_loo_out.setdefault(n, []).append(dict(t=e_[1] if e_[0] == n else e_[0], rank=rnew if rnew < 10**6 else None))
bridges = []
for n in cand_bridge:
    reach, pc = rr0[n]
    if reach < 2 and bc_core.get(n, 0) <= 0: continue
    br = dict(id=n, bc=nodes[n]['bc'], pc=round(pc, 3), reach=reach, deg=len(base_outs[n]), targets=sorted(base_outs[n], key=nm),
              rankReach=rank_reach[n], rankBc=rank_bc[n] if bc_core.get(n, 0) > 0 else None,
              topReach=round(top_reach[n] / BOOT, 3), topBc=round(top_bc[n] / 100, 3))
    if n in loo_worst: br['looWorst'] = loo_worst[n] if loo_worst[n] < 10**6 else None
    if n in bc_loo_worst: br['bcLooWorst'] = bc_loo_worst[n] if bc_loo_worst[n] < 10**6 else None
    if n in bc_loo_edge: br['bcLooEdge'] = bc_loo_edge[n]
    if n in bc_loo_out: br['bcLooOut'] = sorted(bc_loo_out[n], key=lambda x: -(x['rank'] or 10**6))
    br['robustReach'] = br['topReach'] >= ROBUST_SHARE and rank_reach[n] <= TOPK and (br.get('looWorst') or 10**6) <= TOPK
    br['robustBc'] = br['topBc'] >= ROBUST_SHARE and br['rankBc'] is not None and br['rankBc'] <= TOPK and (br.get('bcLooWorst') or 10**6) <= TOPK
    bridges.append(br)
bridges.sort(key=lambda b_: (b_['rankReach'], nm(b_['id'])))
cand_bc = sorted([dict(id=n, bc=nodes[n]['bc']) for n in nodes if nodes[n]['isTarget'] and nodes[n]['bc'] > 0], key=lambda x: -x['bc'])
multi = [n for n in nodes if D.out_degree(n) >= 2]
crossers = [n for n in multi if reach_of(list(D.successors(n)))[0] >= 2]

# overlap between targets
tg_all = [name2id[n] for n in cand_names]
endorsers_of = {t: set(D.predecessors(t)) for t in tg_all}
overlap = []
for i, a in enumerate(tg_all):
    for b in tg_all[i+1:]:
        s = endorsers_of[a] & endorsers_of[b]
        if s:
            u = endorsers_of[a] | endorsers_of[b]
            overlap.append(dict(a=a, b=b, n=len(s), j=round(len(s)/len(u), 4), oc=round(len(s)/min(len(endorsers_of[a]), len(endorsers_of[b])), 4), shared=sorted(s, key=nm)))

# layout: deterministic "dandelion" layout (see scripts/layout.py)
leaves_of = collections.defaultdict(list)
for l in leaves: leaves_of[next(iter(U[l]))].append(l)
pos = dandelion_layout(U, core, leaves_of, lambda n: nodes[n]['isTarget'], label_len=lambda n: len(nodes[n]['name']))
xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]
iso = sorted([n for n in U if deg[n] == 0], key=nm)
for k, n in enumerate(iso):   # isolated candidates: bottom-right corner, inside the frame
    pos[n] = (max(xs) - k * 14, min(ys))
for n in nodes:
    x, y = pos[n]; nodes[n]['x'] = round(x, 3); nodes[n]['y'] = round(y, 3)

# ---------- reader-facing candidate notes (generated; raw editor notes are never shipped) ----------
SITE_NAMES = {'berkeleyscanner.com': 'The Berkeley Scanner', 'berkeleyside.org': 'Berkeleyside', 'dailycal.org': 'The Daily Californian'}
def public_notes(nd):
    raw = nd.pop('candNotes', '') or ''
    out = []
    if nd.get('status', '').lower().startswith('withdrawn'): out.append('Withdrawn from the race; still on the ballot.')
    m = re.search(r'per ([^(]+?)\s*\((https?://[^)\s]+)\)[^"]*?\b(he|she|they)?\s*"([^"]+)"', raw)
    if m:
        host = urlparse(m.group(2)).netloc.replace('www.', '')
        who = f'the candidate said {m.group(3)}' if m.group(3) else 'the candidate said'
        out.append(dict(text=f'In {SITE_NAMES.get(host, m.group(1).strip())}, {who} \u201c{m.group(4)}.\u201d', url=m.group(2)))
    if re.search(r'partial list', raw, re.I): out.append('The campaign page describes its list as partial.')
    if re.search(r'"and more!"|and more', raw, re.I): out.append('The campaign page ends its list with \u201cand more.\u201d')
    if re.search(r'jumbled|pairings uncertain', raw, re.I): out.append('Page layout made some name\u2013title pairings unclear.')
    if re.search(r'no campaign website found', raw, re.I): out.append('No campaign website found; endorsements come from organization pages.')
    if re.search(r'NationBuilder', raw): out.append('Endorsements come from the campaign site cited in the candidate\u2019s voter guide statement.')
    if nd.get('memberOf'): out.append(f"Member of the {nodes[nd['memberOf']]['name']}.")
    if nd['type'] == 'Slate':
        mem = sorted(nodes[x]['name'] for x in nodes if nodes[x].get('memberOf') == nd['id'])
        if mem: out.append(f"Shared page for the slate\u2019s {len(mem)} candidates. Endorsers listed for the whole slate link here; endorsements of individual members link to that member.")
    if nd['isTarget'] and D.in_degree(nd['id']) == 0: out.append('No endorsements recorded.')
    return [x if isinstance(x, dict) else dict(text=x) for x in out]
for nd in nodes.values():
    if nd.get('isTarget'): nd['notes'] = public_notes(nd)
    nd.pop('candNotes', None)

# summary stats
n_end = len([n for n in nodes if D.out_degree(n) > 0])
single = len([n for n in nodes if D.out_degree(n) == 1])
summary = dict(
    generated=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    cleanDir=os.path.abspath(C),
    cleanFiles={f: datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(C, f)), datetime.timezone.utc).isoformat(timespec='seconds')
                for f in ['endorsements.csv', 'endorsers.csv', 'candidates.csv']},
    nEdges=len(edges), nEndorsementEdges=len([e for e in edges if e['kind'] == 'endorsement']), nMemberEdges=len([e for e in edges if e['kind'] == 'member']),
    nNodes=len(nodes), nEndorsers=n_end, nSingle=single,
    nCandidates=len([n for n in cand_names if n != SLATE]),
    nCore=core.number_of_nodes(), nCoreEdges=core.number_of_edges(),
    modularity=round(Q, 4), bestSeed=best_seed, seeds=args.seeds,
    nCommunitiesDistribution={str(k): v for k, v in sorted(n_comm_dist.items())},
    relCounts=dict(collections.Counter(e['rel'] for e in edges if e['kind'] == 'endorsement')),
    typeCounts=dict(collections.Counter(nodes[n]['type'] for n in nodes)),
    endorserTypeCounts=dict(collections.Counter(nodes[n]['type'] for n in nodes if D.out_degree(n) > 0)),
    # sources behind endorsement edges only (slate-membership links excluded), one count per distinct URL+page
    sourceTypeCounts=dict(collections.Counter(ty for (u_, pg_, ty) in {(x['u'], x.get('pg', ''), x['ty']) for e in edges if e['kind'] == 'endorsement' for x in e['src']})),
    edgeSourceTypeCounts=dict(collections.Counter(x['ty'] for e in edges if e['kind'] == 'endorsement' for x in e['src'])),
    nMulti=len(multi), nCrossers=len(crossers), robustThreshold=ROBUST, nBlocs=len(bloc_list), nLoose=len(loose),
    bootstrap=dict(resamples=BOOT, bcResamples=100, dropShare=0.10, topK=TOPK, robustShare=ROBUST_SHARE),
    typeOverrides=type_overrides,
    accessDates=sorted({x['at'] for e in edges for x in e['src'] if x['at']} or {e['date'] for e in edges if e['date']}),
    # count only (never used as edges): pamphlet 'I refer to the following residents' lists
    nPamphletRefsExcluded=(len(rd('pamphlet_references.csv')) if os.path.exists(os.path.join(C, 'pamphlet_references.csv')) else None),
)
races = []
for r in RACE_ORDER:
    races.append(dict(race=r, candidates=[name2id[n] for n in cand_names if cand_info[n]['Race'] == r]))

pair_together = {f'{a}|{b}': round(together(a, b), 3) for i, a in enumerate(targets_core) for b in targets_core[i+1:]}
urls = sorted({x['u'] for e in edges for x in e['src']})
uix = {u: i for i, u in enumerate(urls)}
PRIMARY = 'org endorsement page'
for e in edges:
    srt = sorted(e['src'], key=lambda x: 0 if x['ty'].lower() == PRIMARY else 1)   # an org's own page is the primary source
    e['src'] = [{k: v for k, v in dict(u=uix[x['u']], ty=x['ty'], pg=x['pg'], snap=x['snap'], at=x['at'],
                                       pr=1 if x['ty'].lower() == PRIMARY else '', sh=1 if x.get('shot') else '').items() if v != ''} for x in srt]
# colour-blind check of the bloc palette (Machado et al. 2009 simulation, CIE76 distance in Lab)
PALETTE = ['#E69F00', '#332288', '#44AA99', '#882255', '#56B4E9', '#117733', '#0072B2']
def _s2l(c): c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def _l2s(c): c = min(max(c, 0), 1); return 255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)
def _rgb(h): return [int(h[i:i+2], 16) for i in (1, 3, 5)]
def _lab(rgb):
    r, g, b = [_s2l(x) for x in rgb]
    X = (0.4124*r + 0.3576*g + 0.1805*b) / 0.95047; Y = 0.2126*r + 0.7152*g + 0.0722*b; Z = (0.0193*r + 0.1192*g + 0.9505*b) / 1.08883
    f = lambda t: t ** (1/3) if t > 0.008856 else 7.787 * t + 16/116
    return (116*f(Y) - 16, 500*(f(X) - f(Y)), 200*(f(Y) - f(Z)))
_M = {'deuteranopia': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
      'protanopia': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
      'tritanopia': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]}
def _sim(h, k):
    r, g, b = [_s2l(x) for x in _rgb(h)]; m = _M[k]
    return [_l2s(m[i][0]*r + m[i][1]*g + m[i][2]*b) for i in range(3)]
used_pal = PALETTE[:max(1, len(bloc_list))]
pal_check = {}
for k in ['normal'] + list(_M):
    L = [_lab(_rgb(h)) if k == 'normal' else _lab(_sim(h, k)) for h in used_pal]
    pal_check[k] = round(min([math.dist(L[i], L[j]) for i in range(len(L)) for j in range(i+1, len(L))] or [0]), 1)
summary['palette'] = dict(colors=used_pal, minDeltaE=pal_check)
out = dict(urls=urls, summary=summary, communities=comm_meta, loose=loose_meta, ties=ties, candBc=cand_bc, races=races,
           nodes=list(nodes.values()), edges=edges, bridges=bridges, overlap=overlap, pairTogether=pair_together,
           coTargets=targets_core)

# ---------- public downloads: explicit column ALLOWLIST (unknown columns are never published) ----------
# clean/internal/ is never read.
ALLOW = {
    'endorsements': ['edge_id', 'endorser_id', 'Endorser', 'Endorser type', 'Formality', 'Canonical title', 'Title as written (primary source)',
                     'Relationship', 'Direction', 'target_id', 'Endorses', 'Race', 'Ranking', 'Rank note', 'Source', 'Source type',
                     'Number of sources', 'All source types', 'page_section', 'voter_guide_page', 'statement_code', 'snapshot_path',
                     'snapshot_sha256', 'accessed_at', 'Date accessed', 'Name(s) as written'],
    'endorsers': ['endorser_id', 'Endorser', 'Endorser type', 'Canonical title', 'candidate_id', 'Candidates endorsed (count)',
                  'Candidates endorsed', 'Partial slate members endorsed', 'Name variants seen'],
    'candidates': ['candidate_id', 'Candidate', 'Race', 'Status', 'Campaign URL', 'Endorsements page', 'Endorsement count', 'Notes'],
    'slate_members': ['slate_id', 'Slate', 'member_id', 'Member', 'Relationship', 'Source', 'Source type', 'page_section',
                      'voter_guide_page', 'statement_code', 'snapshot_path', 'snapshot_sha256', 'accessed_at'],
    'edge_sources': ['edge_id', 'source_no', 'endorser_id', 'Endorser', 'Endorses', 'Name as written', 'Title as written',
                     'Ranking as written', 'Rank note', 'Source', 'Source type', 'page_section', 'voter_guide_page', 'statement_code',
                     'snapshot_path', 'snapshot_sha256', 'accessed_at', 'capture_method'],
    'unverified_leads': ['Organization', 'Candidate', 'Race', 'Claim', 'Aggregator URL', 'Status'],
}
FORBID = re.compile(r'verify|uncertain|needs.?check|possibly same|\bRex\b|review [A-Z]-?\d|internal_notes', re.I)
def clean_text(v):
    if not isinstance(v, str) or not v: return v
    v = re.sub(r'\s+by the editor\b', '', v)
    v = re.sub(r'\s*\(review [A-Z]-?\d+\)', '', v)
    return v.strip()
pub_cand_notes = {nodes[n]['name']: ' '.join(x['text'] + (f" ({x['url']})" if x.get('url') else '') for x in nodes[n].get('notes', [])) for n in nodes if nodes[n]['isTarget']}
type_fix = {nodes[o['id']]['name']: o['now'] for o in type_overrides}
for f in os.listdir(args.out):
    if f != 'graph.json': os.remove(os.path.join(args.out, f))
copied = []; published_tables = {}
for base, cols_allowed in ALLOW.items():
    p_ = os.path.join(C, base + '.csv')
    if not os.path.exists(p_): continue
    rows = rd(base + '.csv')
    hk = [c_ for c_ in cols_allowed if rows and c_ in rows[0]]
    seen_r = set(); body = []
    for r in rows:
        rr = {k: clean_text(r.get(k, '')) for k in hk}
        if base == 'candidates' and rr.get('Candidate') in pub_cand_notes and 'Notes' in rr: rr['Notes'] = pub_cand_notes[rr['Candidate']]
        if 'Endorser type' in rr and rr.get('Endorser') in type_fix: rr['Endorser type'] = type_fix[rr['Endorser']]
        t_ = tuple(rr[k] for k in hk)
        if t_ in seen_r: continue   # exact duplicate rows
        seen_r.add(t_); body.append(t_)
    with open(os.path.join(args.out, base + '.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(hk); w.writerows(body)
    published_tables[base] = (hk, body)
    copied.append([base + '.csv', base + '.csv'])
try:   # spreadsheet regenerated from the allowlisted tables only
    import openpyxl
    from openpyxl.styles import Font
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'README'
    readme = [('Berkeley Nov 3, 2026 local election: endorsement network (public data)',), ('',),
              ('Tab', 'What it is')] + [(k.replace('_', ' ').capitalize(), f'{len(v[1])} rows; same as {k}.csv') for k, v in published_tables.items()] + [
              ('',), ('Endorsements', 'One row per endorser -> candidate or slate. Every source for each endorsement is in Edge sources.'),
              ('Slate members', 'Slate membership and nomination links. Not endorsements.'),
              ('Unverified leads', 'Claims found only on aggregator sites or third-party guides. Not drawn as endorsements.'),
              ('Methodology', 'See the methodology section of the published graphic.')]
    for row in readme: ws.append(list(row))
    ws['A1'].font = Font(bold=True)
    for k, (hk, body) in published_tables.items():
        w2 = wb.create_sheet(k.replace('_', ' ').capitalize()[:31]); w2.append(hk)
        for c_ in w2[1]: c_.font = Font(bold=True)
        for r in body: w2.append(list(r))
    wb.save(os.path.join(args.out, 'berkeley_endorsements_2026.xlsx'))
    copied.insert(0, ['berkeley_endorsements_2026.xlsx', 'Spreadsheet (XLSX, all tables)'])
except ImportError:
    print('openpyxl missing: XLSX not published')
vr = os.path.join(C, 'validation_report.md')
if os.path.exists(vr):
    txt = open(vr, encoding='utf-8').read()
    m_ = re.search(r'Hard checks:\s*(\d+)/(\d+) passed,\s*(\d+) failures', txt)
    if m_ and int(m_.group(2)) - int(m_.group(1)) == int(m_.group(3)):
        summary['validation'] = dict(passed=int(m_.group(1)), total=int(m_.group(2)))
    if m_ and not FORBID.search(txt) and summary.get('validation'):
        open(os.path.join(args.out, 'validation_report.md'), 'w', encoding='utf-8').write(txt)
        copied.append(['validation_report.md', 'Validation report'])
    else:
        print('validation_report.md not published (internal wording or inconsistent totals); its totals are cited in the methodology')
if os.path.exists(os.path.join(C, 'unverified_leads.csv')):
    summary['nUnverifiedLeads'] = len(rd('unverified_leads.csv'))
out['summary']['downloads'] = copied
blob = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
def check_published(name, text):
    m_ = FORBID.search(text)
    if m_: raise SystemExit(f'BUILD FAILED: internal/reviewer wording {m_.group(0)!r} in published file {name}: ...{text[max(0, m_.start() - 80):m_.end() + 80]}...')
check_published('graph.json', blob)
for f in os.listdir(args.out):
    pth = os.path.join(args.out, f)
    if f.endswith(('.csv', '.md')): check_published(f, open(pth, encoding='utf-8').read())
    elif f.endswith('.xlsx'):
        import zipfile
        z = zipfile.ZipFile(pth); check_published(f, ''.join(z.read(n).decode('utf-8', 'replace') for n in z.namelist() if n.endswith('.xml')))
with open(os.path.join(args.out, 'graph.json'), 'w', encoding='utf-8') as f: f.write(blob)

# console report
print(f"nodes={len(nodes)} edges={len(edges)} core={core.number_of_nodes()}/{core.number_of_edges()} Q={Q:.4f} k-dist={dict(n_comm_dist)}")
for cm in comm_meta:
    print(f"  bloc {cm['id']}: weakest={cm['weakest']['p']} targets={[nm(t) for t in cm['targets']]} size={cm['size']}")
print('  loose:', [(nm(l['id']), [(nm(p_['t']), p_['p']) for p_ in l['partners'][:2]]) for l in loose_meta])
print('  ties:', [(t_['a'], t_['b'], t_['max']) for t_ in ties[:8]])
print(f'crossers {len(crossers)}/{len(multi)} single={single} palette={pal_check}')
for b_ in bridges[:15]:
    print(f"  #{b_['rankReach']} {nm(b_['id'])} [{nodes[b_['id']]['type']}] reach={b_['reach']} deg={b_['deg']} top10={b_['topReach']} loo={b_.get('looWorst')} robust={b_['robustReach']} bcRank={b_['rankBc']} topBc={b_['topBc']}")
print('bc top:', [(nm(b_['id']), b_['rankBc'], b_['topBc'], b_.get('bcLooWorst'), b_['robustBc']) for b_ in sorted([x for x in bridges if x['rankBc']], key=lambda x: x['rankBc'])[:10]])

import subprocess as _sp
_sp.run([sys.executable, os.path.join(here, 'render_static.py')], check=True)
print('static overview written')
