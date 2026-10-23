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
  * Louvain on the core graph: 2 independent sets of 20,000 runs, node and edge order shuffled
    per run. Pair co-assignment over all runs; complete linkage at 0.75 (every pair together in
    >= 75% of runs).
  * Only confirmed endorsements are edges. Rows rated "Probable" in the cleaned table are moved to
    unverified_leads.csv and never enter the graph or the analysis.
    Leaves inherit the community of their single neighbour.
  * Shared endorsers between the slate page and each council candidate (count + Jaccard).
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
ap.add_argument('--seeds', type=int, default=1000, help='Louvain runs per batch (min 1000); 5 batches')
args = ap.parse_args()
C = args.clean
os.makedirs(args.out, exist_ok=True)

MANIFEST = os.path.join(C, 'PUBLISH_MANIFEST.txt')
ALLOWED_FILES = None
if os.path.exists(MANIFEST):
    ALLOWED_FILES = {l.strip() for l in open(MANIFEST, encoding='utf-8') if l.strip() and not l.lstrip().startswith('#')}
def allowed(name): return ALLOWED_FILES is None or name in ALLOWED_FILES
def rd(name, required=True):
    if not allowed(name):
        if required: raise SystemExit(f'{name} is not listed in clean/PUBLISH_MANIFEST.txt')
        return []
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
# Only confirmed endorsements are edges: rows rated 'Probable' become unverified leads (published in unverified_leads.csv).
PROB_ROWS = [r for r in E if 'probable' in col(r, 'Confidence').lower()]
PROB_IDS = {col(r, 'edge_id') for r in PROB_ROWS}
E = [r for r in E if r not in PROB_ROWS]
ES = [r for r in ES if col(r, 'edge_id') not in PROB_IDS]
PROB_PAIRS = collections.Counter((col(r, 'Endorser'), col(r, 'Endorses')) for r in PROB_ROWS)
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
                      asw=col(r, 'Name(s) as written', 'name_as_written'),
                      conf=col(r, 'Confidence'), confNote=col(r, 'Confidence note')))
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
        nodes[e['s']]['typeNote'] = 'Nominated the slate (a nomination, not an endorsement).'
    if e['kind'] == 'member' and nodes[e['t']]['type'] != 'Slate': nodes[e['t']]['type'] = 'Slate'

for nd in nodes.values():   # 'Slate' is only meaningful for a slate on the ballot; other actors typed so are organizations
    if nd['type'] == 'Slate' and not nd.get('isTarget'):
        type_overrides.append(dict(id=nd['id'], was='Slate', now='Political/advocacy org', why='not a slate on the ballot'))
        nd['type'] = 'Political/advocacy org'
        nd['typeNote'] = 'A political organization (not a slate on the ballot).'

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


# ---------- Louvain consensus: BATCHES independent batches x RUNS shuffled-order runs ----------
# Feller-style withdrawn candidates with no endorsers are analysed as endorsers, not as clustering targets.
def nm(n): return nodes[n]['name']
for n in nodes:
    nd = nodes[n]
    if nd.get('isTarget') and nd['type'] == 'Candidate (withdrawn)' and D.in_degree(n) == 0:
        nd['analysisEndorser'] = True
is_ctarget = lambda n: nodes[n].get('isTarget') and not nodes[n].get('analysisEndorser')
import random, numpy as np
from multiprocessing import Pool
POOL = max(args.seeds, 20000)            # Louvain runs per pool
SEED_BASES = [0, 10_000_000]              # two independent pools (different seeds and shuffles)
CORE_NL = sorted(core.nodes()); CORE_EL = sorted(tuple(sorted(e)) for e in core.edges())
core_ix = {n: i for i, n in enumerate(CORE_NL)}
def louvain_shuffled(job):
    """one Louvain run on graph (nl, el) with node and edge insertion order shuffled by `seed`"""
    nl, el, seed = job
    r = random.Random(seed); ns = list(nl); es = list(el); r.shuffle(ns); r.shuffle(es)
    G = nx.Graph(); G.add_nodes_from(ns); G.add_edges_from(es)
    p = louvain_communities(G, seed=seed, resolution=1.0)
    m = {}
    for ci, c in enumerate(p):
        for x in c: m[x] = ci
    return [m[x] for x in nl], len(p)
def coassign(M, cols):
    """M: runs x nodes membership array -> co-assignment matrix over the given column indices"""
    sub = M[:, cols]
    out = np.zeros((len(cols), len(cols)))
    for i in range(len(cols)):
        out[i] = (sub == sub[:, [i]]).mean(0)
    return out
def avg_linkage(ids, P_, th):
    """complete-linkage agglomerative clustering on a co-assignment matrix, cut at th:
    keep merging the two clusters whose weakest cross pair is highest, while that weakest pair is >= th
    (so every pair inside a group lands together in >= th of runs).
    Deterministic given the matrix. Returns (groups, merge values, first refused merge value)."""
    cl = [[i] for i in range(len(ids))]; merges = []; refused = None
    while len(cl) > 1:
        bm = None
        for a_ in range(len(cl)):
            for b_ in range(a_ + 1, len(cl)):
                v = float(min(P_[x, y] for x in cl[a_] for y in cl[b_]))
                if bm is None or v > bm[0] + 1e-12: bm = (v, a_, b_)
        if bm[0] < th: refused = (bm[0], frozenset(ids[x] for x in cl[bm[1]] + cl[bm[2]])); break
        merges.append((bm[0], frozenset(ids[x] for x in cl[bm[1]] + cl[bm[2]])))
        cl[bm[1]] += cl[bm[2]]; del cl[bm[2]]
    return [frozenset(ids[x] for x in c) for c in cl], merges, refused
ROBUST = 0.75; BORDER = 0.05
targets_core = sorted([n for n in core if is_ctarget(n)], key=nm)
tix = {t: i for i, t in enumerate(targets_core)}
def build_core(drop_edges):
    G = nx.Graph(); G.add_nodes_from(nodes)
    for e in edges:
        if e['kind'] == 'endorsement' and (e['s'], e['t']) in drop_edges: continue
        G.add_edge(e['s'], e['t'])
    dg = dict(G.degree()); lv = {x for x in G if dg[x] == 1 and x not in cand_ids}
    return G.subgraph([x for x in G if x not in lv and dg[x] > 0]).copy()
def analyse(g_, pool):
    nl = sorted(g_.nodes()); el = sorted(tuple(sorted(e)) for e in g_.edges()); ix_ = {n: i for i, n in enumerate(nl)}
    cols = [ix_[t] for t in targets_core]
    Ms, kd = [], collections.Counter()
    for base in SEED_BASES:
        res_ = pool.map(louvain_shuffled, [(nl, el, base + k) for k in range(POOL)], chunksize=200)
        Ms.append(np.array([r_[0] for r_ in res_], dtype=np.int16)); kd.update(r_[1] for r_ in res_)
    Ps = [coassign(M_, cols) for M_ in Ms]
    parts = [avg_linkage(targets_core, P_, ROBUST) for P_ in Ps]
    Mall = np.vstack(Ms)
    return dict(nl=nl, ix=ix_, Ps=Ps, P=coassign(Mall, cols), Mall=Mall, parts=parts, kdist=kd)
prob_edges = {(e['s'], e['t']) for e in edges if e['kind'] == 'endorsement' and 'probable' in (e.get('conf') or '').lower()}
assert not prob_edges, 'probable rows must be moved to unverified leads before the analysis'
with Pool(min(8, os.cpu_count() or 1)) as pool:
    AN = {'all': analyse(core, pool)}
    AN['conf'] = analyse(build_core(prob_edges), pool) if prob_edges else AN['all']
R = POOL * len(SEED_BASES)
n_comm_dist = AN['all']['kdist']
P_pool = AN['all']['P']; P_conf = AN['conf']['P']
MALL = AN['all']['Mall']
def together(a, b): return 1.0 if a == b else float(P_pool[tix[a], tix[b]]) if a in tix and b in tix else 0.0
def together_conf(a, b): return 1.0 if a == b else float(P_conf[tix[a], tix[b]]) if a in tix and b in tix else 0.0
def together_min(a, b): return min(together(a, b), together_conf(a, b))
# every partition (2 pools); with confirmed endorsements only, the 'conf' analysis is the same object as 'all'
variant_parts = {f'{k}{i}': [c for c in AN[k]['parts'][i][0]] for k in ('all', 'conf') for i in range(len(SEED_BASES))}
pools_agree = {k: {c for c in AN[k]['parts'][0][0] if len(c) > 1} == {c for c in AN[k]['parts'][1][0] if len(c) > 1} for k in ('all', 'conf')}
# ONE rule for membership and for the margin flag: complete linkage on the co-assignment matrix (P_min == P_pool
# now that only confirmed endorsements are edges), so every pair inside a coalition lands together in >= ROBUST of runs.
P_min = np.minimum(P_pool, P_conf)
min_part = avg_linkage(targets_core, P_min, ROBUST)
meet = {}
for gi_, c in enumerate(min_part[0]):
    meet[gi_] = sorted(c, key=nm)
# robustness: the same rule applied to each 20,000-run set separately
pool_min_parts = [{c for c in avg_linkage(targets_core, np.minimum(AN['all']['Ps'][i], AN['conf']['Ps'][i]), ROBUST)[0] if len(c) > 1} for i in range(len(SEED_BASES))]
pools_min_agree = all(pp == {c for c in min_part[0] if len(c) > 1} for pp in pool_min_parts)
bloc_list = [sorted(g_, key=nm) for g_ in meet.values() if len(g_) >= 2]
def endorsers_of_set(ts):
    out_ = set()
    for t in ts: out_ |= set(D.predecessors(t))
    return out_
bloc_list.sort(key=lambda c: (-len(endorsers_of_set(c)), min(nm(x) for x in c)))
final_sets = {frozenset(c) for c in bloc_list}
min_refused = dict(set=sorted(min_part[2][1], key=nm), v=round(min_part[2][0], 4)) if min_part[2] else None
loose = sorted([g_[0] for g_ in meet.values() if len(g_) == 1], key=lambda n: -D.in_degree(n))
# groupings that appear in some partitions but not all: reported as such, never as coalitions
def mean_p(Pm, grp): 
    g_ = sorted(grp); v = [Pm[tix[x], tix[y]] for i, x in enumerate(g_) for y in g_[i+1:]]
    return round(float(np.mean(v)), 3) if v else 1.0
variants = []
for key_, vp in variant_parts.items():
    for c in vp:
        if len(c) < 2 or c in final_sets: continue
        v_ = next((x for x in variants if x['set'] == c), None)
        if not v_: v_ = dict(set=c, where=[]); variants.append(v_)
        v_['where'].append(key_)
variants_meta = [dict(members=sorted(v_['set'], key=lambda n: -D.in_degree(n)), where=sorted(v_['where']),
                      meanAll=mean_p(P_pool, v_['set']), meanConf=mean_p(P_conf, v_['set'])) for v_ in variants]
variants_meta.sort(key=lambda v_: (-len(v_['where']), -len(v_['members'])))
refusals = {k_: [dict(set=sorted(AN[k]['parts'][i][2][1], key=nm), v=round(AN[k]['parts'][i][2][0], 4)) if AN[k]['parts'][i][2] else None
                 for i in range(len(SEED_BASES))] for k_, k in (('all', 'all'), ('conf', 'conf'))}
merge_vals = {k: [[dict(set=sorted(m_[1], key=nm), v=round(m_[0], 4)) for m_ in AN[k]['parts'][i][1]] for i in range(len(SEED_BASES))] for k in ('all', 'conf')}
borderline_pairs = []
for i, x in enumerate(targets_core):
    for y in targets_core[i+1:]:
        pa, pc = together(x, y), together_conf(x, y)
        if any(abs(v - ROBUST) <= BORDER for v in (pa, pc)):
            borderline_pairs.append(dict(a=x, b=y, p=round(pa, 3), pConf=round(pc, 3)))
borderline_pairs.sort(key=lambda b_: -max(b_['p'], b_['pConf']))
bloc_of = {t: bi for bi, c in enumerate(bloc_list) for t in c}
comm = {t: bloc_of.get(t, -1) for t in targets_core}
# endorsers in the core join a coalition only if, on average, they sit with its candidates in >= ROBUST of all runs
end_bloc_score = {}
bloc_cols = [[core_ix[t] for t in c] for c in bloc_list]
assert AN['all']['nl'] == CORE_NL
for n in core:
    if n in comm: continue
    col_n = MALL[:, core_ix[n]][:, None]
    sc = [float((MALL[:, cc] == col_n).mean()) for cc in bloc_cols]
    k = max(range(len(sc)), key=lambda i: sc[i]) if sc else -1
    end_bloc_score[n] = round(sc[k], 3) if sc else 0
    comm[n] = k if sc and sc[k] >= ROBUST else -1
for n in leaves:
    nb = next(iter(U[n])); comm[n] = comm.get(nb, -1)
for n in U: comm.setdefault(n, -1)
def anchors(c): return [t for t in c if not nodes[t].get('memberOf')]
comm_meta = []
for bi, c in enumerate(bloc_list):
    pairs = [(x, y) for i, x in enumerate(c) for y in c[i+1:]]
    wa, wb = min(pairs, key=lambda pr: (together_min(*pr), together(*pr)))
    wmin = together_min(wa, wb)
    amb = []   # members tied (within the borderline band or above) to a candidate outside the group
    for t in c:
        for o in targets_core:
            if o not in c and max(together(t, o), together_conf(t, o)) >= ROBUST - BORDER:
                amb.append(dict(t=t, o=o, p=round(together(t, o), 3), pConf=round(together_conf(t, o), 3)))
    members_all = [n for n in U if comm[n] == bi]
    endorsers_all = [n for n in members_all if not is_ctarget(n)]
    tc = collections.Counter(nodes[n]['type'] for n in endorsers_all)
    comm_meta.append(dict(id=bi, size=len(members_all), targets=sorted(c, key=lambda n: -D.in_degree(n)),
                          anchors=sorted(anchors(c), key=lambda n: -D.in_degree(n)),
                          weakest=dict(a=wa, b=wb, p=round(wmin, 3), pPooled=round(together(wa, wb), 3), pConf=round(together_conf(wa, wb), 3)),
                          mean=mean_p(P_pool, c), meanConf=mean_p(P_conf, c),
                          borderline=wmin < ROBUST + BORDER, ambiguous=amb,
                          nEndorsersOfTargets=len(endorsers_of_set(c)), typeCounts=dict(tc.most_common())))
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
    ps = sorted(((round(together(t, o), 3), round(together_conf(t, o), 3), o) for o in targets_core if o != t), key=lambda x: (-max(x[0], x[1]), nm(x[2])))
    top = max(ps[0][0], ps[0][1]) if ps else 0
    loose_meta.append(dict(id=t, best=round(max(p_[0] for p_ in ps), 3) if ps else 0, bestConf=round(max(p_[1] for p_ in ps), 3) if ps else 0,
                           partners=[dict(t=o, p=v, pConf=vc) for v, vc, o in ps if max(v, vc) >= top - 0.01 or max(v, vc) >= ROBUST - BORDER][:6],
                           groupedIn=[dict(members=v_['members'], where=v_['where']) for v_ in variants_meta if t in v_['members']]))
    # nearest coalition under the membership rule (weakest pair with its candidates), on the co-assignment matrix
    if bloc_list:
        cand_ = [(bi, min(together(t, o) for o in c), min(together_conf(t, o) for o in c)) for bi, c in enumerate(bloc_list)]
        bi, ma, mc = max(cand_, key=lambda x: max(x[1], x[2]))
        loose_meta[-1].update(nearBloc=bi, nearMin=round(ma, 4), nearMinConf=round(mc, 4))

# ---------- per-node attributes ----------
for n in nodes:
    nodes[n]['community'] = comm[n]
    nodes[n]['outDeg'] = D.out_degree(n); nodes[n]['inDeg'] = D.in_degree(n)
    nodes[n]['leaf'] = n in leaves
    if n in end_bloc_score: nodes[n]['blocScore'] = end_bloc_score[n]
    if is_ctarget(n) and n in core and comm[n] < 0: nodes[n]['loose'] = True

# ---------- coalition survival: drop 10% of endorsements, re-cluster from scratch, same rule ----------
end_edges = [(e['s'], e['t']) for e in edges if e['kind'] == 'endorsement']
mem_edges = [(e['s'], e['t']) for e in edges if e['kind'] == 'member']
BOOT = 200; BOOT_RUNS = 1000
def boot_rep(seed):
    rng_ = random.Random(1_000_003 * (seed + 1))
    keep = [e_ for e_ in end_edges if rng_.random() >= 0.10]
    G = nx.Graph(); G.add_nodes_from(nodes); G.add_edges_from(keep); G.add_edges_from(mem_edges)
    dg = dict(G.degree()); lv = {x for x in G if dg[x] == 1 and not is_ctarget(x) and not nodes[x].get('isTarget')}
    Gc = G.subgraph([x for x in G if x not in lv and dg[x] > 0]).copy()
    nl = sorted(Gc.nodes()); el = sorted(tuple(sorted(e_)) for e_ in Gc.edges()); ixx = {x: i for i, x in enumerate(nl)}
    M = np.array([louvain_shuffled((nl, el, seed * 10_000 + k))[0] for k in range(BOOT_RUNS)])
    tg = [t for t in targets_core if t in ixx]
    Pb = coassign(M, [ixx[t] for t in tg])
    groups = [c for c in avg_linkage(tg, Pb, ROBUST)[0] if len(c) >= 2]
    grp = {t: gi for gi, c in enumerate(groups) for t in c}
    fate = []   # for each reported coalition: 'intact' (same candidates together, nobody added), or the group(s) its members end up in
    for c in bloc_list:
        cs = [t for t in c if t in grp or t in ixx]
        gids = {grp.get(t, -1) for t in cs}
        if len(gids) == 1 and -1 not in gids and set(groups[next(iter(gids))]) == set(cs): fate.append('intact')
        elif len(gids) == 1 and -1 not in gids: fate.append('joined:' + '|'.join(sorted(set(groups[next(iter(gids))]) - set(cs))))
        else: fate.append('split')
    return len(groups), fate
with Pool(min(8, os.cpu_count() or 1)) as pool:
    boot = pool.map(boot_rep, range(BOOT), chunksize=4)
boot_ngroups = collections.Counter(k_ for k_, _ in boot)
boot_fate = [dict(collections.Counter(f_[bi] for _, f_ in boot)) for bi in range(len(bloc_list))]
boot_intact_all = sum(all(x == 'intact' for x in f_) for _, f_ in boot)
def wilson(k_, n_, z=1.96):
    if not n_: return (0.0, 0.0)
    ph = k_ / n_; den = 1 + z * z / n_; cen = (ph + z * z / (2 * n_)) / den; hw = z * math.sqrt(ph * (1 - ph) / n_ + z * z / (4 * n_ * n_)) / den
    return (max(0.0, cen - hw), min(1.0, cen + hw))
for bi, cm in enumerate(comm_meta):   # data survival per coalition: intact in how many of the BOOT resamples (+ 95% Wilson range)
    f_ = boot_fate[bi]; k_ = f_.get('intact', 0)
    joiners = collections.Counter(j for key_, v_ in f_.items() if key_.startswith('joined:') for j in key_[7:].split('|') for _ in range(v_))
    lo_, hi_ = wilson(k_, BOOT)
    cm.update(intact=k_, intactShare=round(k_ / BOOT, 3), intactLo=round(lo_, 3), intactHi=round(hi_, 3), boots=BOOT,
              split=f_.get('split', 0), joiners=[dict(t=t_, n=n_) for t_, n_ in joiners.most_common(3)])

# endorser sets of every candidate (for the slate comparison below)
tg_all = [name2id[n] for n in cand_names]
endorsers_of = {t: set(D.predecessors(t)) for t in tg_all}

# ---------- headline numbers: whose endorser lists overlap most with the slate page's? ----------
slate_id = name2id.get(SLATE)
slate_overlap = None
if slate_id and endorsers_of.get(slate_id):
    council = [t for t in tg_all if (nodes[t].get('race') or '').startswith('Council') and endorsers_of[t] and is_ctarget(t)]
    def jac(a, b, E_):
        s_, u_ = E_[a] & E_[b], E_[a] | E_[b]
        return len(s_) / len(u_) if u_ else 0.0
    base = sorted(((jac(slate_id, t, endorsers_of), t) for t in council), key=lambda x: (-x[0], nm(x[1])))
    top2 = frozenset(t for _, t in base[:2])
    # endorser bootstrap: resample the endorsers (with replacement) and recompute every list
    rngh = random.Random(42); allE = sorted({s_ for t in tg_all for s_ in endorsers_of[t]})
    hold2 = 0; hold1 = 0; HB = 1000; holdk = collections.Counter()
    for _ in range(HB):
        w = collections.Counter(rngh.choice(allE) for _ in allE)
        def wj(a, b):
            s_ = sum(w[x] for x in endorsers_of[a] & endorsers_of[b]); u_ = sum(w[x] for x in endorsers_of[a] | endorsers_of[b])
            return s_ / u_ if u_ else 0.0
        rb_ = sorted(((wj(slate_id, t), t) for t in council), key=lambda x: (-x[0], nm(x[1])))
        hold2 += frozenset(t for _, t in rb_[:2]) == top2; hold1 += rb_[0][1] == base[0][1]
        for k_ in range(1, 5): holdk[k_] += frozenset(t for _, t in rb_[:k_]) == frozenset(t for _, t in base[:k_])
    slate_overlap = dict(slate=slate_id, council=[dict(t=t, j=round(j_, 4), n=len(endorsers_of[slate_id] & endorsers_of[t])) for j_, t in base],
                         topKShare={str(k_): round(holdk[k_] / HB, 3) for k_ in range(1, 5)},
                         top2Share=round(hold2 / HB, 3), top1Share=round(hold1 / HB, 3), resamples=HB,
                         nSlateEndorsers=len(endorsers_of[slate_id]))
    # base rate: among endorsers who do NOT back the slate and back 2+ candidates, the share backing each candidate
    n_targets = collections.Counter(s_ for t in tg_all for s_ in endorsers_of[t])
    others = {s_ for s_, k_ in n_targets.items() if k_ >= 2 and s_ not in endorsers_of[slate_id]}
    for c_ in slate_overlap['council']:
        c_['base'] = round(len(others & endorsers_of[c_['t']]) / len(others), 4) if others else 0
        c_['nList'] = len(endorsers_of[c_['t']])
    slate_overlap['nOthersMulti'] = len(others)
    # bootstrap of the slate's own backers (with replacement): how often does the top candidate by count lead the runner-up?
    by_n = sorted(slate_overlap['council'], key=lambda c_: (-c_['n'], nm(c_['t'])))
    if len(by_n) >= 2:
        A_, B_ = by_n[0]['t'], by_n[1]['t']; SL = sorted(endorsers_of[slate_id]); rngl = random.Random(7); LB = 10000
        lead = tie = majA = majB = 0
        for _ in range(LB):
            smp = [rngl.choice(SL) for _ in SL]
            a_ = sum(x in endorsers_of[A_] for x in smp); b_ = sum(x in endorsers_of[B_] for x in smp)
            lead += a_ > b_; tie += a_ == b_; majA += 2 * a_ > len(SL); majB += 2 * b_ > len(SL)
        slate_overlap['leadBoot'] = dict(a=A_, b=B_, resamples=LB, aLeads=round(lead / LB, 3), tie=round(tie / LB, 3), aMajority=round(majA / LB, 3), bMajority=round(majB / LB, 3))
# withdrawn candidates analysed as endorsers: reader-facing note
for n in nodes:
    if nodes[n].get('analysisEndorser'):
        nodes[n]['typeNote'] = ('Withdrew from the race and has no endorsers, so the analysis treats this entry as an endorser (of '
                                + ' and '.join(nm(t) for t in sorted(D.successors(n), key=nm)) + '), not as a candidate.')

# layout: deterministic "dandelion" layout (see scripts/layout.py)
leaves_of = collections.defaultdict(list)
for l in leaves: leaves_of[next(iter(U[l]))].append(l)
pos = dandelion_layout(U, core, leaves_of, lambda n: nodes[n]['isTarget'], label_len=lambda n: len(nodes[n]['name']))
xs = [p[0] for p in pos.values()]; ys = [p[1] for p in pos.values()]
iso = sorted([n for n in U if deg[n] == 0], key=nm)
for k, n in enumerate(iso):   # isolated candidates: bottom-right corner, inside the frame
    pos[n] = (max(xs) - k * 14, min(ys))
# keep coalition outlines apart: if two coalitions' (padded) hulls touch, slide the smaller coalition
# (its candidates, its endorsers and their one-candidate endorsers) directly away from the other.
def _segd(p, a, b):
    ax, ay = a; bx, by = b; px, py = p; dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)
def _hull(pts):
    pts = sorted(set(pts))
    if len(pts) <= 2: return pts
    cr = lambda o, a, b: (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]
def _inside(p, poly):
    if len(poly) < 3: return False
    s_ = None
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        c_ = (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])
        if s_ is None: s_ = c_ > 0
        elif (c_ > 0) != s_: return False
    return True
def _polyd(A, B):
    if any(_inside(p, B) for p in A) or any(_inside(p, A) for p in B): return 0.0
    ea = [(A[i], A[(i + 1) % len(A)]) for i in range(len(A))] if len(A) > 1 else [(A[0], A[0])]
    eb = [(B[i], B[(i + 1) % len(B)]) for i in range(len(B))] if len(B) > 1 else [(B[0], B[0])]
    return min(min(_segd(p, *e) for p in A for e in eb), min(_segd(p, *e) for p in B for e in ea))
HULL_GAP = 16.0   # layout units: roughly two hull paddings
grp_nodes = collections.defaultdict(list)
for n in U:
    if comm.get(n, -1) >= 0: grp_nodes[comm[n]].append(n)
for n in list(grp_nodes):
    grp_nodes[n] += [l for x in list(grp_nodes[n]) for l in leaves_of.get(x, []) if l not in grp_nodes[n]]
moved = 0
for _it in range(400):
    hulls = {bi: _hull([pos[t] for t in c]) for bi, c in enumerate(bloc_list)}
    worst = None
    for a in hulls:
        for b in hulls:
            if a < b:
                dd = _polyd(hulls[a], hulls[b])
                if dd < HULL_GAP and (worst is None or dd < worst[0]): worst = (dd, a, b)
    if worst is None: break
    _, a, b = worst
    small, big = (a, b) if len(grp_nodes[a]) <= len(grp_nodes[b]) else (b, a)
    ca = np.mean([pos[t] for t in bloc_list[small]], 0); cb = np.mean([pos[t] for t in bloc_list[big]], 0)
    v = ca - cb; v = v / (np.linalg.norm(v) or 1)
    for n in grp_nodes[small]: pos[n] = (pos[n][0] + 2 * v[0], pos[n][1] + 2 * v[1])
    moved += 1
print('hull separation steps:', moved)
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
PR = rd('pamphlet_references.csv', required=False)
n_end = len([n for n in nodes if D.out_degree(n) > 0])
single = len([n for n in nodes if D.out_degree(n) == 1])
summary = dict(
    generated=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
    cleanFiles={f: datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(C, f)), datetime.timezone.utc).isoformat(timespec='seconds')
                for f in ['endorsements.csv', 'endorsers.csv', 'candidates.csv']},
    nEdges=len(edges), nEndorsementEdges=len([e for e in edges if e['kind'] == 'endorsement']), nMemberEdges=len([e for e in edges if e['kind'] == 'member']),
    nNodes=len(nodes), nEndorsers=n_end, nSingle=single,
    nCandidates=len([n for n in cand_names if n != SLATE]),
    nCore=core.number_of_nodes(), nCoreEdges=core.number_of_edges(),
    runs=POOL, pools=len(SEED_BASES), nRuns=R, border=BORDER, linkage='complete', poolsAgree=pools_agree, poolsMinAgree=pools_min_agree, minRefused=dict(set=[nm(x) for x in min_refused['set']], v=min_refused['v']) if min_refused else None,
    variantPartitions={k_: sorted([sorted(nm(x) for x in c) for c in vp if len(c) >= 2]) for k_, vp in variant_parts.items()},
    refusedMerges={k_: [dict(set=[nm(x) for x in r_['set']], v=r_['v']) if r_ else None for r_ in v_] for k_, v_ in refusals.items()},
    bootGroups={str(k): v for k, v in sorted(boot_ngroups.items())}, bootFate=boot_fate, bootIntactAll=boot_intact_all,
    nCommunitiesDistribution={str(k): v for k, v in sorted(n_comm_dist.items())},
    relCounts=dict(collections.Counter(e['rel'] for e in edges if e['kind'] == 'endorsement')),
    typeCounts=dict(collections.Counter(nodes[n]['type'] for n in nodes)),
    endorserTypeCounts=dict(collections.Counter(nodes[n]['type'] for n in nodes if D.out_degree(n) > 0)),
    # sources behind endorsement edges only (slate-membership links excluded), one count per distinct URL+page
    sourceTypeCounts=dict(collections.Counter(ty for (u_, pg_, ty) in {(x['u'], x.get('pg', ''), x['ty']) for e in edges if e['kind'] == 'endorsement' for x in e['src']})),
    edgeSourceTypeCounts=dict(collections.Counter(x['ty'] for e in edges if e['kind'] == 'endorsement' for x in e['src'])),
    robustThreshold=ROBUST, nBlocs=len(bloc_list), nLoose=len(loose),
    bootstrap=dict(resamples=BOOT, runsPerResample=BOOT_RUNS, dropShare=0.10),
    typeOverrides=type_overrides,
    accessDates=sorted({x['at'] for e in edges for x in e['src'] if x['at']} or {e['date'] for e in edges if e['date']}),
    # count only (never used as edges): pamphlet 'I refer to the following residents' lists
    nPamphletRefsExcluded=len(PR) if PR else None,
    nPamphletPeople=len({col(r, 'endorser_id') or col(r, 'Referee') for r in PR}) if PR else None,
    rankCounts=dict(sorted(collections.Counter(e['rank'] for e in edges if e['kind'] == 'endorsement' and e['rank']).items())),
    nZeroEndorsersDropped=None,
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
# ---------- reader-facing text clean-up: curly quotes in names, tidy titles, source names ----------
def curly(s_):
    if not s_: return s_
    s_ = re.sub(r'"([^"]*)"', '\u201c\\1\u201d', s_)
    return s_.replace("'", '\u2019')
def tidy_title(t_):
    t_ = re.sub(r'\s*\*+\s*$', '', (t_ or '').strip())
    return re.sub(r'\*(?=\s|,|$)', '', t_).strip()
for e in edges: e['title'] = tidy_title(e.get('title', ''))
for nd in nodes.values():
    nd['title'] = tidy_title(nd.get('title', ''))
host = lambda u: urlparse(u).netloc.replace('www.', '')
url_label = {}
for i_, u in enumerate(urls):
    cites = [e for e in edges if any(x['u'] == i_ for x in e['src'])]
    tys = collections.Counter(x['ty'] for e in cites for x in e['src'] if x['u'] == i_)
    ty = tys.most_common(1)[0][0] if tys else ''
    if 'acvote' in u or ty.lower().startswith('voter guide'): lab = 'Alameda County voter guide'
    elif ty.lower() == PRIMARY:
        lab = collections.Counter(nodes[e['s']]['name'] for e in cites if e['kind'] == 'endorsement').most_common(1)[0][0]
        if host(u) == 'web.archive.org': lab = f'Wayback Machine copy of {lab} page'
    elif ty.lower().startswith('campaign'):
        own_ids = [t for t in nodes if nodes[t].get('isTarget') and any(host(x) == host(u) for x in [nodes[t].get('campaignUrl') or '', nodes[t].get('endorsementsPage') or ''] if x)]
        sl_ = [t for t in own_ids if nodes[t]['type'] == 'Slate']
        own = [nodes[t]['name'] for t in own_ids]
        if sl_: lab = nodes[sl_[0]]['name'] + ' site'
        else: lab = (own[0] if own else collections.Counter(nodes[e['t']]['name'] for e in cites).most_common(1)[0][0]) + ' campaign site'
    else: lab = {'ballotpedia.org': 'Ballotpedia', 'bayballot.com': 'Bay Ballot', 'berkeley.voterguide.guru': 'Berkeley Voter Guide Guru'}.get(host(u), host(u))
    url_label[i_] = curly(lab)
for nd in nodes.values():
    nd['name'] = curly(nd['name'])
    if nd.get('variants'): nd['variants'] = [curly(v) for v in nd['variants']]
for e in edges:
    if e.get('asw'): e['asw'] = curly(e['asw'])
# colour-blind check of the bloc palette (Machado et al. 2009 simulation, CIE76 distance in Lab)
PALETTE = ['#D55E00', '#332288', '#44AA99', '#661100', '#DDCC77', '#AA4499', '#117733']   # chosen by brute force over Tol/Okabe-Ito hues: max min-ΔE under CVD; no cyan
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
# ---------- central reference list: one entry per source document (URL), numbered for the panel and /findings/ ----------
def _vg_page(u):
    m = re.search(r'#page=(\d+)$', u); return int(m.group(1)) if m else 0
_ref_rows = []
for i_, u in enumerate(urls):
    used_by = [x for e in edges for x in e['src'] if x['u'] == i_]
    dates = sorted({x['at'] for x in used_by if x.get('at')})
    lab = url_label[i_]
    if lab == 'Alameda County voter guide': title = f'Alameda County Voter Information Guide, November 3, 2026, p. {_vg_page(u)}' if _vg_page(u) else 'Alameda County Voter Information Guide, November 3, 2026'
    elif lab.endswith(' campaign site') or lab.endswith(' site') or lab.startswith('Wayback') or lab in ('Ballotpedia', 'Bay Ballot', 'Berkeley Voter Guide Guru'): title = lab
    else: title = f'{lab}: endorsements'
    _ref_rows.append(dict(u=i_, title=title, url=u, at=dates, sortk=(lab.lower(), _vg_page(u), u)))
_ref_rows.sort(key=lambda r_: r_['sortk'])
refs = [dict(n=k_ + 1, u=r_['u'], title=r_['title'], url=r_['url'], at=r_['at']) for k_, r_ in enumerate(_ref_rows)]
# hard data rule: every endorsement (and slate link) is traceable to at least one source with a URL and an access date
_untraceable = [e['id'] for e in edges if not any(urls[x['u']] and (x.get('at') or e.get('date')) for x in e['src'])]
_undated = [e['id'] for e in edges if not any(x.get('at') for x in e['src'])]
if _untraceable or _undated: raise SystemExit(f'BUILD FAILED: edges without a dated source: {(_untraceable + _undated)[:10]}')
print(f'references: {len(refs)}; every one of {len(edges)} edges has a dated source')

# single condition (confirmed endorsements only): the with/without-probable twins are gone
for cm in comm_meta:
    cm['weakest'] = dict(a=cm['weakest']['a'], b=cm['weakest']['b'], p=cm['weakest']['pPooled']); cm.pop('meanConf', None)
    cm['ambiguous'] = [dict(t=a_['t'], o=a_['o'], p=a_['p']) for a_ in cm['ambiguous']]
for l in loose_meta:
    l.pop('bestConf', None); l.pop('nearMinConf', None)
    l['partners'] = [dict(t=p_['t'], p=p_['p']) for p_ in l['partners']]
for v_ in variants_meta: v_.pop('meanConf', None)
borderline_pairs = [dict(a=b_['a'], b=b_['b'], p=b_['p']) for b_ in borderline_pairs]
summary['variantPartitions'] = {k_: v_ for k_, v_ in summary['variantPartitions'].items() if k_.startswith('all')}
summary['refusedMerges'] = {k_: v_ for k_, v_ in summary['refusedMerges'].items() if k_ == 'all'}
summary['poolsAgree'] = {k_: v_ for k_, v_ in summary['poolsAgree'].items() if k_ == 'all'}
for e in edges: e.pop('conf', None); e.pop('confNote', None)
summary['nProbableMoved'] = len(PROB_ROWS)
# candidate headshots: public/photos/<node id>.webp, produced by scripts/photos.py (initials are shown when absent)
_ph = os.path.join(here, '..', 'public', 'photos')
photos = {f[:-5]: f'/photos/{f}' for f in sorted(os.listdir(_ph)) if f.endswith('.webp') and f[:-5] in nodes} if os.path.isdir(_ph) else {}
out = dict(urls=urls, urlLabels=[url_label[i_] for i_ in range(len(urls))], refs=refs, photos=photos, slateOverlap=slate_overlap, summary=summary, communities=comm_meta, loose=loose_meta, ties=ties, races=races,
           nodes=list(nodes.values()), edges=edges, pairTogether=pair_together,
           variants=variants_meta, borderlinePairs=borderline_pairs,
           coTargets=targets_core)

# ---------- public downloads: explicit column ALLOWLIST (unknown columns are never published) ----------
# clean/internal/ is never read.
ALLOW = {
    'endorsements': ['edge_id', 'endorser_id', 'Endorser', 'Endorser type', 'Formality', 'Canonical title', 'Title as written (primary source)',
                     'Relationship', 'Direction', 'target_id', 'Endorses', 'Race', 'Ranking', 'Rank note', 'Source', 'Source type',
                     'Number of sources', 'All source types', 'page_section', 'voter_guide_page', 'statement_code', 'snapshot_path',
                     'snapshot_sha256', 'accessed_at', 'Date accessed', 'Name(s) as written',
                     'Corroborating (aggregator) sources'],
    'endorsers': ['endorser_id', 'Endorser', 'Endorser type', 'Canonical title', 'candidate_id', 'Candidates endorsed (count)',
                  'Candidates endorsed', 'Pamphlet references (count)', 'Partial slate members endorsed', 'Name variants seen'],
    'candidates': ['candidate_id', 'Candidate', 'Race', 'Status', 'Campaign URL', 'Endorsements page', 'Endorsement count', 'Notes'],
    'slate_members': ['slate_id', 'Slate', 'member_id', 'Member', 'Relationship', 'Source', 'Source type', 'page_section',
                      'voter_guide_page', 'statement_code', 'snapshot_path', 'snapshot_sha256', 'accessed_at'],
    'edge_sources': ['edge_id', 'source_no', 'source_id', 'endorser_id', 'Endorser', 'Endorses', 'Name as written', 'Title as written',
                     'Ranking as written', 'Rank note', 'Source', 'Source type', 'page_section', 'voter_guide_page', 'statement_code',
                     'snapshot_path', 'snapshot_sha256', 'accessed_at', 'capture_method', 'Note'],
    'unverified_leads': ['Organization', 'Candidate', 'Race', 'Claim', 'Lead type', 'Lead URL', 'Aggregator URL', 'Status'],
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
copied = []; published_tables = {}; zero_dropped = 0; zero_cand = zero_pamph = zero_other = 0
import zipfile as _zf
_zp = os.path.join(C, 'source_snapshots.zip')
ZIP_NAMES = set(_zf.ZipFile(_zp).namelist()) if allowed('source_snapshots.zip') and os.path.exists(_zp) else set()
def zip_path(v):
    """snapshot paths as stored in source_snapshots.zip; captures not in the archive get no path (their sha256 is kept)"""
    if not v: return v
    q = v[4:] if v.startswith('raw/') else v
    return q if q in ZIP_NAMES else ''
for base, cols_allowed in ALLOW.items():
    p_ = os.path.join(C, base + '.csv')
    if not allowed(base + '.csv') or not os.path.exists(p_): continue
    rows = rd(base + '.csv')
    if base in ('endorsements', 'edge_sources'): rows = [r for r in rows if col(r, 'edge_id') not in PROB_IDS]
    if base == 'endorsers':   # counts and lists without the rows moved to unverified leads
        for r in rows:
            nprob = sum(v_ for (en_, _), v_ in PROB_PAIRS.items() if en_ == r.get('Endorser'))
            if nprob:
                r['Candidates endorsed (count)'] = str(int(r['Candidates endorsed (count)']) - nprob)
            for k_ in ('Candidates endorsed', 'Partial slate members endorsed'):
                if r.get(k_): r[k_] = '; '.join(x for x in r[k_].split('; ') if '(Probable)' not in x)
    if base == 'candidates':
        for r in rows:
            nprob = sum(v_ for (_, cn_), v_ in PROB_PAIRS.items() if cn_ == r.get('Candidate'))
            if nprob: r['Endorsement count'] = str(int(r['Endorsement count']) - nprob)
    if base == 'unverified_leads':
        for r0 in PROB_ROWS:
            rows.append({'Organization': col(r0, 'Endorser'), 'Candidate': col(r0, 'Endorses'), 'Race': col(r0, 'Race'),
                         'Claim': f"Name on an unlabelled line just below {col(r0, 'Endorser')}'s {col(r0, 'Race')} entry; aggregators read it as an endorsement",
                         'Lead type': 'Organization page (unlabelled line)', 'Lead URL': col(r0, 'Source'),
                         'Status': f"Not confirmed by {col(r0, 'Endorser')} (not an edge)"})
    hk = [c_ for c_ in cols_allowed if rows and c_ in rows[0]]
    seen_r = set(); body = []
    for r in rows:
        rr = {k: clean_text(r.get(k, '')) for k in hk}
        if 'snapshot_path' in rr: rr['snapshot_path'] = zip_path(rr['snapshot_path'])
        if base == 'candidates' and curly(rr.get('Candidate')) in pub_cand_notes and 'Notes' in rr: rr['Notes'] = pub_cand_notes[curly(rr['Candidate'])]
        if 'Endorser type' in rr and curly(rr.get('Endorser')) in type_fix: rr['Endorser type'] = type_fix[curly(rr['Endorser'])]
        if base == 'endorsers' and (r.get('Candidates endorsed (count)') or '').strip() in ('0', ''):
            zero_dropped += 1   # endorse no one in this data
            if (r.get('Endorser type') or '') in ('Candidate', 'Slate', 'Candidate (withdrawn)'): zero_cand += 1
            elif (r.get('Pamphlet references (count)') or '0').strip() not in ('0', ''): zero_pamph += 1
            else: zero_other += 1
            continue
        t_ = tuple(rr[k] for k in hk)
        if t_ in seen_r: continue   # exact duplicate rows
        seen_r.add(t_); body.append(t_)
    with open(os.path.join(args.out, base + '.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(hk); w.writerows(body)
    published_tables[base] = (hk, body)
    copied.append([base + '.csv', base + '.csv'])
summary['nZeroEndorsersDropped'] = zero_dropped; summary['zeroDropped'] = dict(pamphletOnly=zero_pamph, candidates=zero_cand, other=zero_other)
if allowed('source_snapshots.zip') and os.path.exists(os.path.join(C, 'source_snapshots.zip')):
    shutil.copyfile(os.path.join(C, 'source_snapshots.zip'), os.path.join(args.out, 'source_snapshots.zip'))
    copied.append(['source_snapshots.zip', 'Archived source snapshots (ZIP)'])
try:   # spreadsheet regenerated from the allowlisted tables only
    import openpyxl
    from openpyxl.styles import Font
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'README'
    readme = [('Berkeley Nov 3, 2026 local election: endorsement network (public data)',), ('',),
              ('Tab', 'What it is')] + [(k.replace('_', ' ').capitalize(), f'{len(v[1])} rows; same as {k}.csv') for k, v in published_tables.items()] + [
              ('',), ('Endorsements', 'One row per endorser -> candidate or slate. Every source for each endorsement is in Edge sources.'),
              ('Slate members', 'Slate membership and nomination links. Not endorsements.'),
              ('Endorsers', f'Everyone who endorses at least one candidate or the slate. Omitted: {zero_dropped} rows for names that endorse no one in this data ({zero_pamph} named only in candidate statements\' "I refer to the following residents" lists; {zero_cand} candidates or the slate, listed in Candidates' + (f'; {zero_other} others' if zero_other else '') + ').'),
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
if allowed('validation_report.md') and os.path.exists(vr):
    txt = open(vr, encoding='utf-8').read()
    m_ = re.search(r'Hard checks:\s*(\d+)/(\d+) passed,\s*(\d+) failures', txt)
    if m_ and int(m_.group(2)) - int(m_.group(1)) == int(m_.group(3)):
        summary['validation'] = dict(passed=int(m_.group(1)), total=int(m_.group(2)))
    if m_ and not FORBID.search(txt) and summary.get('validation'):
        open(os.path.join(args.out, 'validation_report.md'), 'w', encoding='utf-8').write(txt)
        copied.append(['validation_report.md', 'Validation report'])
    else:
        print('validation_report.md not published (internal wording or inconsistent totals); its totals are cited in the methodology')
if allowed('unverified_leads.csv') and os.path.exists(os.path.join(C, 'unverified_leads.csv')):
    summary['nUnverifiedLeads'] = len(rd('unverified_leads.csv')) + len(PROB_ROWS)
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
print(f"nodes={len(nodes)} edges={len(edges)} core={core.number_of_nodes()}/{core.number_of_edges()} k-dist={dict(n_comm_dist)}")
for cm in comm_meta:
    print(f"  bloc {cm['id']}: weakest={cm['weakest']['p']} mean={cm['mean']} border={cm['borderline']} amb={[(nm(a['t']), nm(a['o']), a['p']) for a in cm['ambiguous']]} targets={[nm(t) for t in cm['targets']]} size={cm['size']}")
print('  pools agree:', pools_agree, 'boot groups', summary['bootGroups'])
for k_, vp in summary['variantPartitions'].items(): print('   ', k_, vp)
print('  refused merges:', summary['refusedMerges'])
print('  variants:', [([nm(x) for x in v_['members']], v_['where'], v_['meanAll']) for v_ in variants_meta])
print('  borderline pairs:', [(nm(b_['a']), nm(b_['b']), b_['p']) for b_ in borderline_pairs])
print('  loose:', [(nm(l['id']), [(nm(p_['t']), p_['p']) for p_ in l['partners'][:2]]) for l in loose_meta])
print('  ties:', [(t_['a'], t_['b'], t_['max']) for t_ in ties[:8]])
import subprocess as _sp
_sp.run([sys.executable, os.path.join(here, 'render_static.py')], check=True)
print('static overview written')

