"""Candidate headshots -> public/photos/<node id>.webp (96 x 96, centre-cropped, WebP).
Usage: python3 scripts/photos.py <folder of images>
Files are matched to candidates by filename only: the file name (accents, case and punctuation ignored) must contain the
candidate's full name, or a surname that no other candidate shares. Anything else is reported and skipped, never guessed."""
import json, os, re, sys, unicodedata
from PIL import Image, ImageOps

here = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(here, '..', 'public', 'photos'); os.makedirs(OUT, exist_ok=True)
g = json.load(open(os.path.join(here, '..', 'public', 'data', 'graph.json'), encoding='utf-8'))
cands = [n for n in g['nodes'] if n['isTarget'] and n['type'] != 'Slate']
def key(s): return re.sub(r'[^a-z]+', ' ', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()).strip()
def plain(n): return key(re.sub(r'[“"][^”"]*[”"]', ' ', n['name']))
surn = {}
for n in cands: surn.setdefault(plain(n).split()[-1], []).append(n)
src = sys.argv[1] if len(sys.argv) > 1 else ''
matched, unmatched = {}, []
for f in sorted(os.listdir(src)) if src and os.path.isdir(src) else []:
    if not f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.heic', '.avif')): continue
    k = ' ' + key(os.path.splitext(f)[0]) + ' '
    hit = [n for n in cands if f' {plain(n)} ' in k]
    if not hit: hit = [ns[0] for s_, ns in surn.items() if len(ns) == 1 and f' {s_} ' in k]
    if len(hit) != 1 or hit[0]['id'] in matched: unmatched.append(f); continue
    n = hit[0]
    im = ImageOps.exif_transpose(Image.open(os.path.join(src, f))).convert('RGB')
    s_ = min(im.size); top = max(0, int((im.height - s_) * 0.25))   # bias the crop upward, where faces usually are
    im = im.crop(((im.width - s_) // 2, top, (im.width - s_) // 2 + s_, top + s_)).resize((96, 96), Image.LANCZOS)
    im.save(os.path.join(OUT, n['id'] + '.webp'), 'WEBP', quality=72, method=6)
    matched[n['id']] = f
print(json.dumps({'matched': {g_['name']: matched[g_['id']] for g_ in cands if g_['id'] in matched}, 'unmatched_files': unmatched,
                  'candidates_without_photo': [n['name'] for n in cands if n['id'] not in matched]}, ensure_ascii=False, indent=1))
