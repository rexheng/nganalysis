"""Headless verification of a deployed URL.
Screenshots of each view at 1440/1280/768/390, console errors, real canvas click/tap on a node, search,
mobile behaviours (no sticky tooltip, no auto-scroll, camera reset), deep links, and the URL format of every source.
Usage: python scripts/verify.py <url> <outdir>"""
import sys, json, os, re, urllib.request
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else '/workspace/endorsement-graph/shots'
os.makedirs(OUT, exist_ok=True)
VPS = {'d1440': (1440, 900, False), 'd1280': (1280, 800, False), 't768': (768, 1024, True), 'm390': (390, 844, True)}
report = {'url': URL, 'errors': {}, 'checks': {}}
# data checks (no browser)
g = json.load(urllib.request.urlopen(URL.rstrip('/') + '/data/graph.json'))
bad = [u for u in g['urls'] if urlparse(u).scheme not in ('http', 'https') or not urlparse(u).netloc or ' ' in u]
no_src = [e['id'] for e in g['edges'] if not e['src']]
report['checks']['sources'] = {'distinct_urls': len(g['urls']), 'bad_format': bad, 'edges': len(g['edges']), 'edges_without_source': no_src}
leaks = {}
for f, _ in g['summary'].get('downloads', []):
    body = urllib.request.urlopen(URL.rstrip('/') + '/data/' + f).read()
    if f.endswith(('.csv', '.md', '.json')):
        t = body.decode('utf-8', 'replace'); leaks[f] = bool(re.search(r'\bRex\b|internal_notes|by the editor', t))
    elif f.endswith('.xlsx'):
        import zipfile, io
        z = zipfile.ZipFile(io.BytesIO(body)); t = ''.join(z.read(n).decode('utf-8', 'replace') for n in z.namelist() if n.endswith('.xml'))
        leaks[f] = bool(re.search(r'\bRex\b|internal_notes|by the editor', t))
report['checks']['download_leaks'] = leaks
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for name, (w, h, mob) in VPS.items():
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
        pg = ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        pg.on('requestfailed', lambda r: errs.append(f'requestfailed: {r.url}'))
        pg.goto(URL, wait_until='networkidle'); pg.wait_for_function('window.__ready === true', timeout=20000); pg.wait_for_timeout(600)
        c = report['checks'].setdefault(name, {})
        c['overview_top'] = pg.evaluate("document.querySelector('.ov-art').getBoundingClientRect().top")
        c['hscroll'] = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        pg.screenshot(path=f'{OUT}/{name}-top.png')
        pg.screenshot(path=f'{OUT}/{name}-fullpage.png', full_page=True)
        ex = lambda: (pg.evaluate("document.getElementById('explore').scrollIntoView()"), pg.wait_for_timeout(350))
        for view in ['coalitions', 'bridges', 'race']:
            pg.click(f'[data-view={view}]'); pg.wait_for_timeout(500); ex()
            pg.screenshot(path=f'{OUT}/{name}-{view}.png')
            if mob: pg.locator('#panel').screenshot(path=f'{OUT}/{name}-{view}-panel.png')
        c['default_race'] = pg.evaluate("document.querySelector('[data-race][aria-pressed=true]').dataset.race")
        pg.click('[data-view=bridges]'); pg.wait_for_timeout(300)
        for s in ['bc', 'cand', 'reach']:
            pg.click(f'[data-bsort={s}]'); pg.wait_for_timeout(400); ex(); pg.screenshot(path=f'{OUT}/{name}-bridges-{s}.png')
        # canvas click / tap
        pg.click('[data-view=coalitions]'); pg.wait_for_timeout(300); ex()
        cam0 = pg.evaluate("JSON.stringify(window.__test.state)")
        nid = pg.evaluate("window.__test.byName('Igor A. Tregub')")
        pos = pg.evaluate(f"window.__test.pos('{nid}')"); box = pg.locator('#graph').bounding_box()
        x, y = box['x'] + pos['x'], box['y'] + pos['y']
        y0 = pg.evaluate('window.scrollY')
        if mob: pg.touchscreen.tap(x, y)
        else: pg.mouse.move(x, y); pg.wait_for_timeout(200); pg.mouse.click(x, y)
        pg.wait_for_timeout(900)
        c['click'] = {'clicked': 'Igor A. Tregub', 'panel_h3': pg.locator('#panel h3').first.inner_text(), 'source_links': pg.locator('#panel .srcs a').count(),
                      'tooltip_hidden': pg.evaluate("document.getElementById('tooltip').hidden"), 'scrolled_px': pg.evaluate('window.scrollY') - y0,
                      'pill_visible': pg.evaluate("!document.getElementById('pill').hidden")}
        pg.screenshot(path=f'{OUT}/{name}-node-click.png')
        if mob: pg.locator('#panel').screenshot(path=f'{OUT}/{name}-node-click-panel.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(600)
        c['deselect_selected'] = pg.evaluate('window.__test.state.selected')
        # search (combobox)
        if not mob: pg.mouse.move(2, 2)
        pg.fill('#q', 'Green Party'); pg.wait_for_timeout(200)
        c['combobox_expanded'] = pg.get_attribute('#q', 'aria-expanded')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        c['search'] = pg.locator('#panel h3').first.inner_text(); c['primary_tags'] = pg.locator('#panel .prim').count()
        ex(); pg.screenshot(path=f'{OUT}/{name}-search-select.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        pg.check('#showall'); pg.wait_for_timeout(400); ex(); pg.screenshot(path=f'{OUT}/{name}-showall.png'); pg.uncheck('#showall')
        pg.select_option('#colorby', 'type'); pg.wait_for_timeout(400); ex(); pg.screenshot(path=f'{OUT}/{name}-colorby-type.png'); pg.select_option('#colorby', 'community')
        pg.locator('#heatmap').screenshot(path=f'{OUT}/{name}-heatmap.png')
        pg.locator('.overlap-sec').screenshot(path=f'{OUT}/{name}-overlap.png')
        pg.locator('.overview').screenshot(path=f'{OUT}/{name}-overview.png')
        if name in ('d1440', 'm390'): pg.locator('.methods').screenshot(path=f'{OUT}/{name}-methods.png')
        # round-3 checks
        c['jump_link'] = pg.evaluate("(document.querySelector('.jump a')||{}).getAttribute ? document.querySelector('.jump a').getAttribute('href') : null")
        c['heatmap_region'] = pg.evaluate("(()=>{const h=document.getElementById('heatmap');return {tabindex:h.getAttribute('tabindex'),role:h.getAttribute('role'),label:h.getAttribute('aria-label')}})()")
        pg.click('[data-view=coalitions]'); pg.wait_for_timeout(300); ex(); pg.wait_for_timeout(300)
        c['unlabelled_candidates'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);return window.__test.cands().filter(id=>!L.has(id))})()")
        c['zero_cells'] = pg.evaluate("[...document.querySelectorAll('#overlap td[data-a]')].filter(t=>t.textContent.trim()==='0').length")
        cell = pg.locator('#overlap td[data-a]').nth(3); cell.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        if mob: cell.tap()
        else: cell.click()
        pg.wait_for_timeout(300)
        c['ovtip_after_tap'] = pg.evaluate("(()=>{const t=document.getElementById('ovtip');return {visible:!t.hidden,sheet:t.classList.contains('sheet'),text:t.textContent.slice(0,80)}})()")
        pg.screenshot(path=f'{OUT}/{name}-overlap-tap.png')
        if mob: pg.locator('#ovtip .ovx').tap()
        else: pg.locator('#ovtip .ovx').click()
        pg.wait_for_timeout(200); c['ovtip_closed'] = pg.evaluate("document.getElementById('ovtip').hidden")
        # pill: hidden while the panel is on screen
        pg.fill('#q', 'Green Party'); pg.wait_for_timeout(200); pg.keyboard.press('Enter'); pg.wait_for_timeout(700)
        pg.evaluate("document.getElementById('graph').scrollIntoView({block:'start'})"); pg.wait_for_timeout(500)
        p1 = pg.evaluate("!document.getElementById('pill').hidden")
        pg.evaluate("document.getElementById('panel').scrollIntoView({block:'start'})"); pg.wait_for_timeout(500)
        p2 = pg.evaluate("!document.getElementById('pill').hidden")
        c['pill'] = {'visible_over_graph': p1, 'visible_over_panel': p2}
        pg.evaluate("document.getElementById('graph').scrollIntoView({block:'start'})"); pg.wait_for_timeout(400)
        pg.screenshot(path=f'{OUT}/{name}-selected-labels.png')
        c['unlabelled_neighbours'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);return window.__test.nbrs().filter(id=>!L.has(id)).length})()")
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        if name in ('d1440', 'm390'):
            pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js')
            res = pg.evaluate("axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0,3).map(x => x.target.join(' '))})))")
            c['axe_violations'] = res
        # deep link
        pg.goto(URL + f'#view=bridges&node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(700)
        c['deeplink'] = pg.locator('#panel h3').first.inner_text()
        report['errors'][name] = errs
        ctx.close()
    b.close()
json.dump(report, open(f'{OUT}/verify_report.json', 'w'), indent=1)
print(json.dumps(report, indent=1))
