#!/usr/bin/env python3
"""Fail the build if any published file contains internal/reviewer wording."""
import os, re, sys, zipfile
FORBID = re.compile(r'verify|uncertain|needs.?check|possibly same|\bRex\b|review [A-Z]-?\d|internal_notes', re.I)
root = sys.argv[1] if len(sys.argv) > 1 else 'dist'
bad = 0
for dp, _, fs in os.walk(root):
    for f in fs:
        p = os.path.join(dp, f)
        if f.endswith(('.woff2', '.woff', '.png', '.jpg', '.ico')): continue
        if f.endswith('.xlsx'):
            z = zipfile.ZipFile(p); txt = ''.join(z.read(n).decode('utf-8', 'replace') for n in z.namelist() if n.endswith('.xml'))
        else:
            txt = open(p, encoding='utf-8', errors='replace').read()
        for m in FORBID.finditer(txt):
            bad += 1; print(f'{p}: {m.group(0)!r} ...{txt[max(0, m.start() - 60):m.end() + 60]!r}')
            if bad > 30: break
if bad: sys.exit(f'check-published: {bad} forbidden match(es)')
print(f'check-published: {root} clean')
