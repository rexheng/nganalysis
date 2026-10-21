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
                      title=col(r, 'Title/affiliation (most common)', 'Title/affiliation', 'title'),
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
                snap=col(r, 'snapshot_path', 'Snapshot path'), at=day(col(r, 'accessed_at', 'Date accessed', 'source_accessed_date')))
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
        if key in seen: continue
        seen.add(key); uniq.append(sr)
    for sr in uniq:
        if not valid_url(sr['u']): bad_urls.append((ename, tname, sr['u']))
    rel = col(r, 'Relationship', 'relationship') or ('Slate member' if kind == 'member' else 'Endorses')
    edges.append(dict(id=f'e{i}', s=s, t=t, kind=kind, rel=rel, rank=col(r, 'Ranking', 'rank'), formality=col(r, 'Formality', 'formality'),
                      title=col(r, 'Title/affiliation', 'title'), src=uniq,
                      date=next((x['at'] for x in uniq if x['at']), day(col(r, 'accessed_at', 'Date accessed'))),
                      check=col(r, 'Needs check', 'needs_check'), asw=col(r, 'Name(s) as written', 'name_as_written')))
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
    if not nodes[s]['title'] and col(r, 'Title/affiliation'): nodes[s]['title'] = col(r, 'Title/affiliation')
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
for e in edges:
    if e['kind'] == 'member': nodes[e['s']]['memberOf'] = e['t']
    if e['kind'] == 'member' and nodes[e['t']]['type'] != 'Slate': nodes[e['t']]['type'] = 'Slate'

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

# Louvain, many seeds
best = None; parts = []
for seed in range(args.seeds):
    p = louvain_communities(core, seed=seed, resolution=1.0)
    q = modularity(core, p)
    parts.append(p)
    if best is None or q > best[0] + 1e-12: best = (q, p, seed)
Q, P, best_seed = best
# order communities by size of candidate membership then size
def comm_key(c): return (-len([n for n in c if nodes[n]['isTarget']]), -len(c), min(nodes[n]['name'] for n in c))
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
for n in sorted(nodes, key=lambda n: (-nodes[n]['bc'], nodes[n]['name'])):
    if nodes[n]['bc'] <= 0 and D.out_degree(n) < 2: continue
    outs = sorted(D.successors(n), key=nm); ins = sorted(D.predecessors(n), key=nm)
    by_c = collections.defaultdict(list)
    for m in outs: by_c[comm[m]].append(nm(m))
    by_c_in = collections.defaultdict(list)
    for m in ins: by_c_in[comm[m]].append(nm(m))
    ks = collections.Counter(comm[m] for m in outs if comm[m] >= 0)
    kt = sum(ks.values())
    pc = round(1 - sum((v / kt) ** 2 for v in ks.values()), 4) if kt else 0.0
    bridges.append(dict(id=n, bc=nodes[n]['bc'], pc=pc, outComms=len(ks), deg=len(outs), endorses={str(k): v for k, v in sorted(by_c.items())},
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
    nEdges=len(edges), nEndorsementEdges=len([e for e in edges if e['kind'] == 'endorsement']), nMemberEdges=len([e for e in edges if e['kind'] == 'member']),
    nNodes=len(nodes), nEndorsers=n_end, nSingle=single,
    nCandidates=len([n for n in cand_names if n != SLATE]),
    nCore=core.number_of_nodes(), nCoreEdges=core.number_of_edges(),
    modularity=round(Q, 4), bestSeed=best_seed, seeds=args.seeds,
    nCommunitiesDistribution={str(k): v for k, v in sorted(n_comm_dist.items())},
    relCounts=dict(collections.Counter(e['rel'] for e in edges if e['kind'] == 'endorsement')),
    typeCounts=dict(collections.Counter(nodes[n]['type'] for n in nodes if not nodes[n]['isTarget'] or D.out_degree(n) > 0)),
    sourceTypeCounts=dict(collections.Counter(x['ty'] for e in edges for x in e['src'])),
    accessDates=sorted({x['at'] for e in edges for x in e['src'] if x['at']} or {e['date'] for e in edges if e['date']}),
    nNeedsCheck=len([e for e in edges if e['check']]),
    # count only (never used as edges): pamphlet 'I refer to the following residents' lists
    nPamphletRefsExcluded=(len(rd('pamphlet_references.csv')) if os.path.exists(os.path.join(C, 'pamphlet_references.csv')) else None),
)
races = []
for r in RACE_ORDER:
    races.append(dict(race=r, candidates=[name2id[n] for n in cand_names if cand_info[n]['Race'] == r]))

pair_together = {f'{a}|{b}': round(together(a, b), 3) for i, a in enumerate(targets_core) for b in targets_core[i+1:]}
urls = sorted({x['u'] for e in edges for x in e['src']})
uix = {u: i for i, u in enumerate(urls)}
for e in edges:
    e['src'] = [{k: v for k, v in dict(u=uix[x['u']], ty=x['ty'], pg=x['pg'], snap=x['snap'], at=x['at']).items() if v != ''} for x in e['src']]
out = dict(urls=urls, summary=summary, communities=comm_meta, races=races, nodes=list(nodes.values()), edges=edges,
           bridges=bridges, overlap=overlap, pairTogether=pair_together)
with open(os.path.join(args.out, 'graph.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
DOWNLOADS = [('berkeley_endorsements_2026.xlsx', 'Spreadsheet (XLSX, all tabs)'), ('endorsements.csv', 'endorsements.csv'),
             ('endorsers.csv', 'endorsers.csv'), ('candidates.csv', 'candidates.csv'), ('slate_members.csv', 'slate_members.csv'),
             ('edge_sources.csv', 'edge_sources.csv'), ('validation_report.md', 'Validation report')]
copied = []
for f in os.listdir(args.out):
    if f != 'graph.json': os.remove(os.path.join(args.out, f))
for fn, label in DOWNLOADS:
    p_ = os.path.join(C, fn)
    if os.path.exists(p_): shutil.copy2(p_, os.path.join(args.out, fn)); copied.append([fn, label])
out['summary']['downloads'] = copied
with open(os.path.join(args.out, 'graph.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))

# console report
print(f"nodes={len(nodes)} edges={len(edges)} core={core.number_of_nodes()}/{core.number_of_edges()} Q={Q:.4f} seed={best_seed} k-dist={dict(n_comm_dist)}")
for cm in comm_meta:
    print(f"  {community_label(cm['id'])}: size={cm['size']} core={cm['coreSize']} stab={cm['stability']} targets={[nm(t) for t in cm['targets']]}")
print('Top bridges (non-target actors):')
for b in [b for b in bridges if not nodes[b['id']]['isTarget']][:15]:
    print(f"  {nm(b['id'])} [{nodes[b['id']]['type']}] bc={b['bc']:.4f} comms={b['nComms']} endorses={b['endorses']}")
print('Top targets by bc:', [(nm(b['id']), round(b['bc'], 4)) for b in bridges if nodes[b['id']]['isTarget']][:8])
