"""Headless verification of a deployed URL: the graph-only landing page (/) and the findings page (/findings/).
Screenshots at 1440/1280/768/390, console errors, canvas click/tap, search, bottom sheet, labels, deep links (?node=),
overlap tooltips, axe on both pages, and the URL format of every source.
Usage: python scripts/verify.py <url> <outdir>"""
import sys, json, os, re, urllib.request, zipfile, io
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
URL = sys.argv[1].rstrip('/'); OUT = sys.argv[2] if len(sys.argv) > 2 else '/workspace/endorsement-graph/shots'
os.makedirs(OUT, exist_ok=True)
VPS = {'d1440': (1440, 900, False), 'd1280': (1280, 800, False), 't768': (768, 1024, True), 'm390': (390, 844, True)}
report = {'url': URL, 'errors': {}, 'checks': {}}
g = json.load(urllib.request.urlopen(URL + '/data/graph.json'))
bad = [u for u in g['urls'] if urlparse(u).scheme not in ('http', 'https') or not urlparse(u).netloc or ' ' in u]
report['checks']['sources'] = {'distinct_urls': len(g['urls']), 'bad_format': bad, 'edges': len(g['edges']), 'edges_without_source': [e['id'] for e in g['edges'] if not e['src']]}
LEAK = re.compile(r'verify|uncertain|needs.?check|possibly same|\bRex\b|review [A-Z]-?\d|internal_notes', re.I)
leaks = {}
for f in [x for x, _ in g['summary'].get('downloads', [])] + ['METHODS.md', 'graph.json']:
    body = urllib.request.urlopen(URL + '/data/' + f).read()
    if f.endswith('.xlsx'):
        z = zipfile.ZipFile(io.BytesIO(body)); t = ''.join(z.read(n).decode('utf-8', 'replace') for n in z.namelist() if n.endswith('.xml'))
    elif f.endswith('.zip'): t = ''
    else: t = body.decode('utf-8', 'replace')
    leaks[f] = [m.group(0) for m in LEAK.finditer(t)][:3]
for page in ('/', '/findings/'):
    t = urllib.request.urlopen(URL + page).read().decode(); leaks[page] = [m.group(0) for m in LEAK.finditer(t)][:3]
report['checks']['leaks'] = leaks
AXE = "axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0,3).map(x => x.target.join(' '))})))"
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for name, (w, h, mob) in VPS.items():
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
        pg = ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        pg.on('requestfailed', lambda r: errs.append(f'requestfailed: {r.url}'))
        c = report['checks'].setdefault(name, {})
        # ---------- landing page: graph only ----------
        pg.goto(URL + '/', wait_until='networkidle'); pg.wait_for_function('window.__ready === true', timeout=20000); pg.wait_for_timeout(700)
        c['landing'] = pg.evaluate("""(()=>{const gb=document.getElementById('graph').getBoundingClientRect();
          return {page_scrolls: document.documentElement.scrollHeight > innerHeight + 1, hscroll: document.documentElement.scrollWidth > innerWidth,
          graph_share_of_viewport: Math.round(100*gb.width*gb.height/(innerWidth*innerHeight))/100,
          forbidden: ['.findings','#heatmap','#overlap','.methods','.overview','.dek','.downloads'].filter(s=>document.querySelector(s)),
          story_link: (document.querySelector('.storylink')||{}).getAttribute?.('href'),
          legend_open: document.getElementById('legendbox').open, credit_line: !!document.querySelector('.credit'),
          sigma_before_interaction: window.__test.sigma(), preview_canvas: !!document.querySelector('#graph .preview'),
          words_outside_panel: (()=>{const cl=document.body.cloneNode(true); cl.querySelectorAll('#sheet,#legendbox,.sr,script,noscript,#tooltip,#qres').forEach(e=>e.remove()); return cl.innerText.split(/\\s+/).filter(Boolean).length})()}})()""")
        pg.screenshot(path=f'{OUT}/{name}-landing.png')
        for view in ['coalitions', 'bridges', 'race']:
            if mob and not pg.evaluate("document.getElementById('sheet').classList.contains('open')"): pg.locator('#sheetbtn').tap()
            pg.click(f'[data-view={view}]'); pg.wait_for_timeout(500)
            pg.screenshot(path=f'{OUT}/{name}-{view}.png')
        c['default_race'] = pg.evaluate("document.querySelector('[data-race][aria-pressed=true]').dataset.race")
        pg.click('[data-view=bridges]'); pg.wait_for_timeout(300)
        for s in ['bc', 'cand', 'reach']:
            pg.click(f'[data-bsort={s}]'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{name}-bridges-{s}.png')
        pg.click('[data-view=coalitions]'); pg.wait_for_timeout(300)
        if mob: pg.locator('#sheetbtn').tap(); pg.wait_for_timeout(400)
        c['sheet_closed_before_click'] = (not pg.evaluate("document.getElementById('sheet').classList.contains('open')")) if mob else None
        c['unlabelled_candidates'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);return window.__test.cands().filter(id=>!L.has(id))})()")
        nid = pg.evaluate("window.__test.byName('Igor A. Tregub')")
        pos = pg.evaluate(f"window.__test.pos('{nid}')"); box = pg.locator('#graph').bounding_box()
        x, y = box['x'] + pos['x'], box['y'] + pos['y']
        if mob: pg.touchscreen.tap(x, y)
        else: pg.mouse.move(x, y); pg.wait_for_timeout(200); pg.mouse.click(x, y)
        pg.wait_for_timeout(900)
        c['click'] = {'clicked': 'Igor A. Tregub', 'panel_h3': pg.locator('#panel h2').first.inner_text(), 'source_links': pg.locator('#panel .srcs a').count(),
                      'tooltip_hidden': pg.evaluate("document.getElementById('tooltip').hidden"), 'url': pg.evaluate('location.search'),
                      'sheet_open': pg.evaluate("document.getElementById('sheet').classList.contains('open')") if mob else None}
        pg.screenshot(path=f'{OUT}/{name}-node-click.png')
        c['unlabelled_neighbours_tregub'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);const g=document.getElementById('graph').getBoundingClientRect();const inV=window.__test.nbrs().filter(id=>{const p=window.__test.pos(id);return p&&p.x>=0&&p.y>=0&&p.x<=g.width&&p.y<=g.height});return {neighbours: window.__test.nbrs().length, in_view: inV.length, in_view_unlabelled: inV.filter(id=>!L.has(id)).length, in_view_multi_unlabelled: inV.filter(id=>!L.has(id)&&!window.__test.leaf(id)).length}})()")
        pg.keyboard.press('Escape'); pg.wait_for_timeout(600)
        c['deselect_selected'] = pg.evaluate('window.__test.state.selected')
        if not mob: pg.mouse.move(2, 2)
        pg.fill('#q', 'Alameda County Democratic'); pg.wait_for_timeout(200)
        c['combobox_expanded'] = pg.get_attribute('#q', 'aria-expanded')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        c['search'] = pg.locator('#panel h2').first.inner_text(); c['primary_tags'] = pg.locator('#panel .prim').count()
        c['acdp_metrics'] = pg.locator('#panel .metric').all_inner_texts()
        c['unlabelled_neighbours_acdp'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);const g=document.getElementById('graph').getBoundingClientRect();const inV=window.__test.nbrs().filter(id=>{const p=window.__test.pos(id);return p&&p.x>=0&&p.y>=0&&p.x<=g.width&&p.y<=g.height});return {neighbours: window.__test.nbrs().length, in_view: inV.length, in_view_unlabelled: inV.filter(id=>!L.has(id)).length, in_view_multi_unlabelled: inV.filter(id=>!L.has(id)&&!window.__test.leaf(id)).length}})()")
        pg.screenshot(path=f'{OUT}/{name}-search-select.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        if mob and pg.evaluate("document.getElementById('sheet').classList.contains('open')"): pg.locator('#sheetbtn').tap(); pg.wait_for_timeout(300)
        if not pg.evaluate("document.getElementById('legendbox').open"): pg.click('#legendbox summary'); pg.wait_for_timeout(200)
        pg.check('#showall'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{name}-showall.png'); pg.uncheck('#showall')
        pg.select_option('#colorby', 'type'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{name}-colorby-type.png'); pg.select_option('#colorby', 'community')
        if mob: pg.click('#legendbox summary'); pg.wait_for_timeout(200)
        if name in ('d1440', 'm390'):
            pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js'); c['axe_landing'] = pg.evaluate(AXE)
        pg.goto(URL + f'/?node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(700)
        c['deeplink_query'] = pg.locator('#panel h2').first.inner_text()
        pg.goto(URL + f'/?view=bridges&node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(500)
        c['deeplink_view'] = [pg.evaluate('window.__test.state.view'), pg.locator('#panel h2').first.inner_text()]
        pg.goto(URL + f'/#node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(500)
        c['deeplink_legacy_hash'] = pg.locator('#panel h2').first.inner_text()
        # ---------- findings page ----------
        pg.goto(URL + '/findings/', wait_until='networkidle'); pg.wait_for_timeout(800)
        f = c['findings'] = pg.evaluate("""(()=>({draft: (document.querySelector('.draft')||{}).textContent, back_links: [...document.querySelectorAll('a[href="/"]')].length,
           hscroll: document.documentElement.scrollWidth > innerWidth, h1: document.querySelector('h1').textContent,
           node_links: [...document.querySelectorAll('a.nlink')].length, bad_node_links: [...document.querySelectorAll('a.nlink')].filter(a=>!/^\\/\\?node=/.test(a.getAttribute('href'))).length,
           heatmap_region: (()=>{const h=document.getElementById('heatmap');return {tabindex:h.getAttribute('tabindex'),role:h.getAttribute('role'),label:h.getAttribute('aria-label')}})(),
           zero_cells: [...document.querySelectorAll('#overlap td[data-a]')].filter(t=>t.textContent.trim()==='0').length,
           jaccard_on_page: /jaccard|combined lists|either list/i.test(document.body.innerText),
           findings_words: (()=>{const a=document.querySelector('.story').cloneNode(true); return a.innerText.split(/\s+/).filter(Boolean).length})(),
           heatmap_toggle: (()=>{const cell=()=>([...document.querySelectorAll('#heatmap td[title]')].find(t=>/^Avery Arbaugh & Vylma Ortiz/.test(t.title))||{}).title; const a=cell(); document.querySelector('[data-hm=conf]').click(); const b=cell(); document.querySelector('[data-hm=all]').click(); return [a,b]})()}))()""")
        pg.screenshot(path=f'{OUT}/{name}-findings-top.png'); pg.screenshot(path=f'{OUT}/{name}-findings-full.png', full_page=True)
        cell = pg.locator('#overlap td[data-a]').nth(3); cell.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        if mob: cell.tap()
        else: cell.click()
        pg.wait_for_timeout(300)
        f['ovtip_after_tap'] = pg.evaluate("(()=>{const t=document.getElementById('ovtip');return {visible:!t.hidden,sheet:t.classList.contains('sheet'),text:t.textContent.slice(0,80)}})()")
        pg.screenshot(path=f'{OUT}/{name}-overlap-tap.png')
        if mob: pg.locator('#ovtip .ovx').tap()
        else: pg.locator('#ovtip .ovx').click()
        pg.wait_for_timeout(200); f['ovtip_closed'] = pg.evaluate("document.getElementById('ovtip').hidden")
        if name in ('d1440', 'm390'):
            pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js'); f['axe'] = pg.evaluate(AXE)
        # a findings name link opens the graph with that node selected
        href = pg.locator('a.nlink').first.get_attribute('href'); pg.goto(URL + href); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(500)
        f['name_link_opens'] = [href, pg.locator('#panel h2').first.inner_text()]
        report['errors'][name] = errs
        ctx.close()
    b.close()
json.dump(report, open(f'{OUT}/verify_report.json', 'w'), indent=1)
print(json.dumps(report, indent=1))
