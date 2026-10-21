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

def rd(name):
    with open(os.path.join(C, name), newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))

E = rd('endorsements.csv'); EN = rd('endorsers.csv'); CA = rd('candidates.csv')
RACE_ORDER = ['Auditor', 'Council D1', 'Council D4', 'Council D7', 'Council D8', 'Rent Board', 'School Board']
SLATE = 'Berkeley Right to Housing slate'

def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def valid_url(u):
    try:
        p = urlparse(u); return p.scheme in ('http', 'https') and bool(p.netloc) and ' ' not in u
    except Exception: return False

# ---------- nodes ----------
nodes = {}            # id -> dict
name2id = {}
for r in EN:
    nid = r['endorser_id']; name2id[r['Endorser']] = nid
    nodes[nid] = dict(id=nid, name=r['Endorser'], type=r['Endorser type'], title=r['Title/affiliation (most common)'],
                      variants=[v for v in r['Name variants seen'].split(' | ') if v])
cand_names = []
cand_info = {}
for r in CA:
    n = r['Candidate']; cand_names.append(n)
    nid = name2id.get(n) or ('C' + hashlib.md5(n.lower().encode()).hexdigest()[:7])
    name2id[n] = nid
    nd = nodes.setdefault(nid, dict(id=nid, name=n, type='Candidate', title='', variants=[]))
    nd['type'] = 'Slate' if n == SLATE else 'Candidate'
    nd['isCandidate'] = n != SLATE
    nd['isTarget'] = True
    nd['race'] = r['Race']
    nd['campaignUrl'] = r['Campaign URL']; nd['endorsementsPage'] = r['Endorsements page']
    nd['candNotes'] = r['Notes']
    cand_info[n] = r

# ---------- edges ----------
edges = []; bad_urls = []
for i, r in enumerate(E):
    s = r['endorser_id']; t = name2id.get(r['Endorses'])
    if t is None: raise SystemExit(f"Unknown target {r['Endorses']!r}")
    if s not in nodes: raise SystemExit(f"Unknown endorser id {s}")
    srcs = [u.strip() for u in r['Source'].split('|') if u.strip()]
    for u in srcs:
        if not valid_url(u): bad_urls.append((r['Endorser'], r['Endorses'], u))
    stypes = [x.strip() for x in r['Source type'].split('+')]
    edges.append(dict(id=f'e{i}', s=s, t=t, rel=r['Relationship'], rank=r['Ranking'], formality=r['Formality'],
                      title=r['Title/affiliation'], src=srcs, stype=stypes, date=r['Date accessed'],
                      check=r['Needs check'], asw=r['Name(s) as written']))
    # Edge-specific title: if node lacks one, keep the first seen
    if not nodes[s]['title'] and r['Title/affiliation']: nodes[s]['title'] = r['Title/affiliation']
if bad_urls: raise SystemExit(f'Invalid source URLs: {bad_urls[:5]} ({len(bad_urls)})')

# keep only nodes that participate in at least one edge, plus all candidates
used = {e['s'] for e in edges} | {e['t'] for e in edges} | {name2id[n] for n in cand_names}
nodes = {k: v for k, v in nodes.items() if k in used}
for nd in nodes.values():
    nd.setdefault('isCandidate', False); nd.setdefault('isTarget', False)
    if nd['type'] == 'Candidate' and not nd['isCandidate']:
        nd['typeNote'] = 'Listed as a candidate for another office; not on this ballot in the races covered here'

# ---------- graphs ----------
D = nx.DiGraph(); D.add_nodes_from(nodes)
for e in edges: D.add_edge(e['s'], e['t'])
U = nx.Graph(D.to_undirected())
deg = dict(U.degree())
cand_ids = {name2id[n] for n in cand_names}
leaves = {n for n in U if deg[n] == 1 and n not in cand_ids}
core = U.subgraph([n for n in U if n not in leaves and deg[n] > 0]).copy()
# drop core nodes that became isolated (can't happen for targets with >=1 non-leaf... keep safe)
core.remove_nodes_from([n for n in list(core) if core.degree(n) == 0])

# Louvain, many seeds
best = None; parts = []
for seed in range(args.seeds):
    p = louvain_communities(core, seed=seed, resolution=1.0)
    q = modularity(core, p)
    parts.append(p)
    if best is None or q > best[0] + 1e-12: best = (q, p, seed)
Q, P, best_seed = best
# order communities by size of candidate membership then size
def comm_key(c): return (-len([n for n in c if n in cand_ids or nodes[n]['type'] == 'Slate']), -len(c))
P = sorted(P, key=comm_key)
comm = {}
for ci, c in enumerate(P):
    for n in c: comm[n] = ci
for n in leaves:
    nb = next(iter(U[n])); comm[n] = comm.get(nb, -1)
for n in U:
    comm.setdefault(n, -1)   # isolated (e.g. candidates with no endorsements)
# stability: pairwise co-assignment of target nodes across seeds
targets_core = [n for n in core if nodes[n]['isTarget']]
co = collections.Counter()
for p in parts:
    m = {}
    for ci, c in enumerate(p):
        for n in c: m[n] = ci
    for i, a in enumerate(targets_core):
        for b in targets_core[i+1:]:
            if m[a] == m[b]: co[(a, b)] += 1
def together(a, b): return co.get((a, b), co.get((b, a), 0)) / len(parts)
n_comm_dist = collections.Counter(len(p) for p in parts)
# per-community stability: mean co-assignment of its target members with each other
comm_meta = []
for ci, c in enumerate(P):
    tg = [n for n in c if nodes[n]['isTarget']]
    pairs = [(a, b) for i, a in enumerate(tg) for b in tg[i+1:]]
    stab = sum(together(a, b) for a, b in pairs) / len(pairs) if pairs else None
    members_all = [n for n in U if comm[n] == ci]
    endorsers_all = [n for n in members_all if not nodes[n]['isTarget']]
    tc = collections.Counter(nodes[n]['type'] for n in endorsers_all)
    comm_meta.append(dict(id=ci, size=len(members_all), coreSize=len(c),
                          targets=sorted(tg, key=lambda n: -D.in_degree(n)), stability=stab,
                          typeCounts=dict(tc.most_common())))

# betweenness
bc_core = nx.betweenness_centrality(core, normalized=True)
bc_full = nx.betweenness_centrality(U, normalized=True)
for n in nodes:
    nodes[n]['bc'] = round(bc_core.get(n, 0.0), 6)
    nodes[n]['bcFull'] = round(bc_full.get(n, 0.0), 6)
    nodes[n]['community'] = comm[n]
    nodes[n]['outDeg'] = D.out_degree(n); nodes[n]['inDeg'] = D.in_degree(n)
    nodes[n]['leaf'] = n in leaves
    nodes[n]['commsTouched'] = sorted({comm[m] for m in U[n] if comm[m] >= 0})

# bridge explanations (purely from data)
def nm(n): return nodes[n]['name']
def community_label(ci):
    return 'Coalition ' + 'ABCDEFGHIJKLMNOP'[ci] if ci >= 0 else 'No endorsements recorded'
bridges = []
for n in sorted(nodes, key=lambda n: -nodes[n]['bc']):
    if nodes[n]['bc'] <= 0: continue
    outs = sorted(D.successors(n), key=nm); ins = sorted(D.predecessors(n), key=nm)
    by_c = collections.defaultdict(list)
    for m in outs: by_c[comm[m]].append(nm(m))
    by_c_in = collections.defaultdict(list)
    for m in ins: by_c_in[comm[m]].append(nm(m))
    bridges.append(dict(id=n, bc=nodes[n]['bc'], endorses={str(k): v for k, v in sorted(by_c.items())},
                        endorsedBy={str(k): len(v) for k, v in sorted(by_c_in.items())},
                        nComms=len(set(by_c) | set(by_c_in))))

# overlap between targets
tg_all = [name2id[n] for n in cand_names]
endorsers_of = {t: set(D.predecessors(t)) for t in tg_all}
overlap = []
for i, a in enumerate(tg_all):
    for b in tg_all[i+1:]:
        s = endorsers_of[a] & endorsers_of[b]
        if s:
            u = endorsers_of[a] | endorsers_of[b]
            overlap.append(dict(a=a, b=b, n=len(s), j=round(len(s)/len(u), 4), shared=sorted(s, key=nm)))

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

# summary stats
n_end = len([n for n in nodes if D.out_degree(n) > 0])
single = len([n for n in nodes if D.out_degree(n) == 1 and not nodes[n]['isTarget']])
summary = dict(
    generated=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    cleanDir=os.path.abspath(C),
    cleanFiles={f: datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(C, f)), datetime.timezone.utc).isoformat(timespec='seconds')
                for f in ['endorsements.csv', 'endorsers.csv', 'candidates.csv']},
    nEdges=len(edges), nEndorsementEdges=len([e for e in edges if e['rel'] != 'Slate member']),
    nNodes=len(nodes), nEndorsers=n_end, nSingle=single,
    nCandidates=len([n for n in cand_names if n != SLATE]),
    nCore=core.number_of_nodes(), nCoreEdges=core.number_of_edges(),
    modularity=round(Q, 4), bestSeed=best_seed, seeds=args.seeds,
    nCommunitiesDistribution={str(k): v for k, v in sorted(n_comm_dist.items())},
    relCounts=dict(collections.Counter(e['rel'] for e in edges)),
    typeCounts=dict(collections.Counter(nodes[n]['type'] for n in nodes if not nodes[n]['isTarget'] or D.out_degree(n) > 0)),
    sourceTypeCounts=dict(collections.Counter(st for e in edges for st in e['stype'])),
    accessDates=sorted({e['date'] for e in edges}),
    nNeedsCheck=len([e for e in edges if e['check']]),
    # count only (never used as edges): pamphlet 'I refer to the following residents' lists
    nPamphletRefsExcluded=(len(rd('pamphlet_references.csv')) if os.path.exists(os.path.join(C, 'pamphlet_references.csv')) else None),
)
races = []
for r in RACE_ORDER:
    races.append(dict(race=r, candidates=[name2id[n] for n in cand_names if cand_info[n]['Race'] == r]))

pair_together = {f'{a}|{b}': round(together(a, b), 3) for i, a in enumerate(targets_core) for b in targets_core[i+1:]}
urls = sorted({u for e in edges for u in e['src']})
uix = {u: i for i, u in enumerate(urls)}
for e in edges: e['src'] = [uix[u] for u in e['src']]
out = dict(urls=urls, summary=summary, communities=comm_meta, races=races, nodes=list(nodes.values()), edges=edges,
           bridges=bridges, overlap=overlap, pairTogether=pair_together)
with open(os.path.join(args.out, 'graph.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
for fn in ['endorsements.csv', 'endorsers.csv', 'candidates.csv', 'berkeley_endorsements_2026.xlsx', 'validation_report.md']:
    p = os.path.join(C, fn)
    if os.path.exists(p): shutil.copy2(p, os.path.join(args.out, fn))

# console report
print(f"nodes={len(nodes)} edges={len(edges)} core={core.number_of_nodes()}/{core.number_of_edges()} Q={Q:.4f} seed={best_seed} k-dist={dict(n_comm_dist)}")
for cm in comm_meta:
    print(f"  {community_label(cm['id'])}: size={cm['size']} core={cm['coreSize']} stab={cm['stability']} targets={[nm(t) for t in cm['targets']]}")
print('Top bridges (non-target actors):')
for b in [b for b in bridges if not nodes[b['id']]['isTarget']][:15]:
    print(f"  {nm(b['id'])} [{nodes[b['id']]['type']}] bc={b['bc']:.4f} comms={b['nComms']} endorses={b['endorses']}")
print('Top targets by bc:', [(nm(b['id']), round(b['bc'], 4)) for b in bridges if nodes[b['id']]['isTarget']][:8])
