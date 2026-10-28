"""Headless verification of a deployed URL: the graph-only landing page (/) and the findings page (/findings/).
Screenshots at 1440/1024/800/390, console errors, canvas click/tap, search, bottom sheet, labels, deep links (?node=),
references, axe on both pages, and the URL format of every source.
Usage: python scripts/verify.py <url> <outdir>"""
import sys, json, os, re, urllib.request, zipfile, io
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
URL = sys.argv[1].rstrip('/'); OUT = sys.argv[2] if len(sys.argv) > 2 else '/workspace/endorsement-graph/shots'
os.makedirs(OUT, exist_ok=True)
VPS = {'d1440': (1440, 900, False), 'd1024': (1024, 768, False), 't800': (800, 900, True), 'm390': (390, 844, True)}
report = {'url': URL, 'errors': {}, 'checks': {}}
RED = lambda t: re.sub(r'token=[^&\s"\']+', 'token=REDACTED', str(t))   # never write the logo.dev key into reports
g = json.load(urllib.request.urlopen(URL + '/data/graph.json'))
bad = [u for u in g['urls'] if urlparse(u).scheme not in ('http', 'https') or not urlparse(u).netloc or ' ' in u]
refu = {r['u']: r for r in g.get('refs', [])}
undated = [e['id'] for e in g['edges'] if not any(x['u'] in refu and x.get('at') and g['urls'][x['u']].startswith('http') for x in e['src'])]
report['checks']['every_edge_has_dated_source'] = {'edges': len(g['edges']), 'refs': len(refu), 'failing': undated, 'ok': not undated and len(refu) == len(g['urls']),
    'ref_numbers_contiguous': sorted(r['n'] for r in refu.values()) == list(range(1, len(refu) + 1)), 'probable_edges': [e['id'] for e in g['edges'] if 'conf' in e]}
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
BANNED = re.compile(r'probable|betweenness|lands most|\bcoalitions\b|(in|no|any|a|same) coalition\b|\bcoalition [A-G]\b|coalition (view|legend|colou?r)|\bbridg\w*|\bbloc\b|\bgroup [A-G]\b|\bcommunit(y|ies)\b', re.I)
banned = {}
for page in ('/', '/findings/'):
    t = urllib.request.urlopen(URL + page).read().decode(); leaks[page] = [m.group(0) for m in LEAK.finditer(t)][:3]; banned[page] = [m.group(0) for m in BANNED.finditer(t)][:3]
banned['METHODS.md'] = [m.group(0) for m in BANNED.finditer(urllib.request.urlopen(URL + '/data/METHODS.md').read().decode())][:3]
_gj = json.loads(urllib.request.urlopen(URL + '/data/graph.json').read())
banned['graph.json coalition keys'] = [k for k in ('communities', 'loose', 'ties', 'variants', 'borderlinePairs') if k in _gj] + sorted({k for n in _gj['nodes'] for k in ('community', 'blocScore', 'loose') if k in n}) + [k for k in ('nBlocs', 'robustThreshold', 'palette', 'bootstrap') if k in _gj['summary']]
for js in sorted(set(re.findall(r'/assets/[\w.-]+\.js', urllib.request.urlopen(URL + '/').read().decode() + urllib.request.urlopen(URL + '/findings/').read().decode()))):
    banned[js] = [m.group(0) for m in re.finditer(r'coalitions|In no coalition|probable|betweenness', urllib.request.urlopen(URL + js).read().decode(), re.I)][:3]
for path in ('/internal/', '/raw/rex_doc.md', '/raw/rex_doc.docx', '/data/internal/'):
    try: body = urllib.request.urlopen(URL + path).read().decode('utf-8', 'replace'); code = 'app fallback (not the file)' if 'id="graph"' in body else 'EXPOSED'
    except Exception as ex: code = getattr(ex, 'code', 'err')
    leaks[path + ' (HTTP)'] = code
report['checks']['banned_words'] = banned
report['checks']['leaks'] = leaks
PANEL = """(()=>{const P=document.getElementById('panel');const refs=[...P.querySelectorAll('a[data-ref]')];
  return {h2: (P.querySelector('h2')||{}).textContent, banner: [...P.querySelectorAll('.banner')].map(b=>b.innerText), groups: [...P.querySelectorAll('.grp>summary')].map(s=>s.innerText.replace(/\\s+/g,' ').trim()),
   markers: refs.length, unresolved_markers: refs.filter(a=>!P.querySelector('#pref-'+a.dataset.ref)).map(a=>a.dataset.ref), ref_items: P.querySelectorAll('.reflist li').length,
   ref_items_missing_date_or_url: [...P.querySelectorAll('.reflist li')].filter(li=>!li.querySelector('a.ru[href^=http]')||!/Accessed|not recorded/.test(li.innerText)).length,
   place: (P.querySelector('.place')||{}).innerText, banned: (P.innerText.match(/probable|betweenness|lands most|coalitions|(in|no|any) coalition\\b|coalition [A-G]\\b|bridg\\w*|\\bgroup [A-G]\\b/ig)||[]),
   small_text_px: Math.min(...[...P.querySelectorAll('*')].filter(e=>e.childNodes.length&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(e=>parseFloat(getComputedStyle(e).fontSize)))}})()"""
def shoot_panel(pg, mob, path):
    if mob: pg.screenshot(path=path)   # the bottom sheet fills the screen on phones
    else: pg.locator('#panel').screenshot(path=path)
AXE = "axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r => r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0,3).map(x => x.target.join(' '))})))"
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    for name, (w, h, mob) in VPS.items():
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
        pg = ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(RED(f'{m.type}: {m.text}')) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(RED(f'pageerror: {e}')))
        pg.on('requestfailed', lambda r: errs.append(RED(f'requestfailed: {r.url}')))
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
        for view in ['cands', 'race']:
            if mob and not pg.evaluate("document.getElementById('sheet').classList.contains('open')"): pg.locator('#sheetbtn').tap()
            pg.click(f'[data-view={view}]'); pg.wait_for_timeout(500)
            pg.screenshot(path=f'{OUT}/{name}-{view}.png')
        c['default_race'] = pg.evaluate("document.querySelector('[data-race][aria-pressed=true]').dataset.race")
        c['bridges_tab_present'] = pg.locator('[data-view=bridges]').count() > 0
        pg.click('[data-view=cands]'); pg.wait_for_timeout(300)
        if mob: pg.locator('#sheetbtn').tap(); pg.wait_for_timeout(400)
        c['sheet_closed_before_click'] = (not pg.evaluate("document.getElementById('sheet').classList.contains('open')")) if mob else None
        c['unlabelled_candidates'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);return window.__test.cands().filter(id=>!L.has(id))})()")
        nid = pg.evaluate("window.__test.byName('Igor A. Tregub')")
        pos = pg.evaluate(f"window.__test.pos('{nid}')"); box = pg.locator('#graph').bounding_box()
        x, y = box['x'] + pos['x'], box['y'] + pos['y']
        if mob: pg.touchscreen.tap(x, y)
        else: pg.mouse.move(x, y); pg.wait_for_timeout(200); pg.mouse.click(x, y)
        pg.wait_for_timeout(900)
        c['click'] = {'clicked': 'Igor A. Tregub', 'panel': pg.evaluate(PANEL), 'selected': pg.evaluate('window.__test.state.selected'),
                      'tooltip_hidden': pg.evaluate("document.getElementById('tooltip').hidden"), 'url': pg.evaluate('location.search'),
                      'sheet_open': pg.evaluate("document.getElementById('sheet').classList.contains('open')") if mob else None}
        pg.screenshot(path=f'{OUT}/{name}-node-click.png'); shoot_panel(pg, mob, f'{OUT}/{name}-panel-tregub.png')
        if name in ('d1440', 'm390'): c['tregub_panel_text'] = pg.locator('#panel').inner_text()
        first = pg.locator('#panel a[data-ref]').first
        if first.count():
            exp = first.get_attribute('href')
            with pg.context.expect_page() as pop: first.click(modifiers=[]) if not mob else first.tap()
            np_ = pop.value; opened = np_.url; np_.close()
            c['ref_click'] = {'ref': first.get_attribute('data-ref'), 'href': exp, 'opened': opened, 'target': first.get_attribute('target'), 'rel': first.get_attribute('rel'),
                              'label': first.get_attribute('aria-label'), 'ok': opened.rstrip('/') == exp.rstrip('/') or opened.startswith(exp.split('#')[0]), 'url': pg.evaluate('location.search')}
            c['bad_cite_links'] = pg.evaluate("[...document.querySelectorAll('#panel a[data-ref]')].filter(a=>!/^https?:/.test(a.getAttribute('href'))||a.target!=='_blank'||!/noopener/.test(a.rel)||!a.title).length")
        c['unlabelled_neighbours_tregub'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);const g=document.getElementById('graph').getBoundingClientRect();const inV=window.__test.nbrs().filter(id=>{const p=window.__test.pos(id);return p&&p.x>=0&&p.y>=0&&p.x<=g.width&&p.y<=g.height});return {neighbours: window.__test.nbrs().length, in_view: inV.length, in_view_unlabelled: inV.filter(id=>!L.has(id)).length, in_view_multi_unlabelled: inV.filter(id=>!L.has(id)&&!window.__test.leaf(id)).length}})()")
        pg.keyboard.press('Escape'); pg.wait_for_timeout(600)
        c['deselect_selected'] = pg.evaluate('window.__test.state.selected')
        if not mob: pg.mouse.move(2, 2)
        pg.fill('#q', 'Alameda County Democratic'); pg.wait_for_timeout(200)
        c['combobox_expanded'] = pg.get_attribute('#q', 'aria-expanded')
        pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        c['search'] = pg.locator('#panel h2').first.inner_text(); c['primary_tags'] = pg.locator('#panel .prim').count()
        c['acdp_panel'] = pg.evaluate(PANEL)
        c['unlabelled_neighbours_acdp'] = pg.evaluate("(()=>{const L=new Set(window.__labels||[]);const g=document.getElementById('graph').getBoundingClientRect();const inV=window.__test.nbrs().filter(id=>{const p=window.__test.pos(id);return p&&p.x>=0&&p.y>=0&&p.x<=g.width&&p.y<=g.height});return {neighbours: window.__test.nbrs().length, in_view: inV.length, in_view_unlabelled: inV.filter(id=>!L.has(id)).length, in_view_multi_unlabelled: inV.filter(id=>!L.has(id)&&!window.__test.leaf(id)).length}})()")
        pg.screenshot(path=f'{OUT}/{name}-search-select.png')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        if mob and pg.evaluate("document.getElementById('sheet').classList.contains('open')"): pg.locator('#sheetbtn').tap(); pg.wait_for_timeout(300)
        if not pg.evaluate("document.getElementById('legendbox').open"): pg.click('#legendbox summary'); pg.wait_for_timeout(200)
        pg.check('#showall'); pg.wait_for_timeout(400); pg.screenshot(path=f'{OUT}/{name}-showall.png'); pg.uncheck('#showall')
        c['legend_text'] = pg.locator('#legend').inner_text()
        if mob: pg.click('#legendbox summary'); pg.wait_for_timeout(200)
        if True:   # axe at every width
            pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js'); c['axe_landing'] = pg.evaluate(AXE)
        pg.goto(URL + f'/?node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(700)
        c['deeplink_query'] = pg.locator('#panel h2').first.inner_text()
        pg.goto(URL + f'/?view=bridges&node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(500)
        c['deeplink_legacy_bridges_view'] = [pg.evaluate('window.__test.state.view'), pg.locator('#panel h2').first.inner_text()]
        pg.goto(URL + '/?view=race'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(400)
        c['deeplink_race_view'] = pg.evaluate('window.__test.state.view')
        pg.goto(URL + '/?view=coalitions'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(400)
        c['deeplink_legacy_coalitions_view'] = [pg.evaluate('window.__test.state.view'), pg.locator('#panel h2').first.inner_text()]
        c['search_placeholder'] = pg.get_attribute('#q', 'placeholder')
        gid = pg.evaluate("window.__test.byName('Green Party of Alameda County')")
        pg.goto(URL + f'/?node={gid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(800)
        c['green_panel'] = pg.evaluate(PANEL); shoot_panel(pg, mob, f'{OUT}/{name}-panel-green.png')
        if name in ('d1440', 'm390'): c['green_panel_text'] = pg.locator('#panel').inner_text()
        pg.goto(URL + f'/#node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(500)
        c['deeplink_legacy_hash'] = pg.locator('#panel h2').first.inner_text()
        # ---------- filter: endorser types and races ----------
        fr = c['filter'] = {}
        # groups only: no switch, no individual/official chips; old links still load
        fr['controls'] = {'hideind': pg.locator('#hideind').count(), 'type_chips': pg.eval_on_selector_all('[data-ft]', 'b=>b.map(x=>x.dataset.ft)'),
            'individual_in_graph': pg.evaluate("window.__test.byName('Ben Bartlett') || null")}
        pg.goto(URL + f'/?hide=individuals&node={nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(800)
        fr['legacy_hide_individuals'] = {'state': pg.evaluate('window.__test.filt()'), 'banner': pg.locator('#panel .banner').first.inner_text(),
            'h2': pg.locator('#panel h2').first.inner_text(), 'url': pg.evaluate('location.search')}
        bb = next(n['id'] for n in json.loads(urllib.request.urlopen(URL + '/data/graph.json').read())['nodes'] if n['name'] == 'Ben Bartlett')
        pg.goto(URL + f'/?select={bb},{nid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(800)
        fr['legacy_select_individual'] = {'multi': pg.evaluate('window.__test.multi()'), 'node': pg.evaluate('window.__test.state.selected'), 'h2': pg.locator('#panel h2').first.inner_text()}
        for who, fn in (('Mark Humbert', 'humbert'), ('The Daily Californian Editorial Board', 'dailycal'), ('Mari Mendonca', 'mendonca')):
            wid = pg.evaluate(f"window.__test.byName({json.dumps(who)})")
            pg.goto(URL + f'/?node={wid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(1500)
            c[f'{fn}_panel_text'] = pg.locator('#panel').inner_text(); shoot_panel(pg, mob, f'{OUT}/{name}-panel-{fn}.png')
        pg.goto(URL + '/?hide=unions&races=Rent%20Board'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(800)
        fr['combined'] = {'state': pg.evaluate('window.__test.filt()'), 'tregub_visible': pg.evaluate(f"window.__test.visible('{nid}')"),
            'slate_visible': pg.evaluate("window.__test.visible(window.__test.byName('Berkeley Right to Housing slate'))"), 'count': pg.locator('#fcount').inner_text()}
        pg.screenshot(path=f'{OUT}/{name}-filter-combined.png')
        # keyboard: open the control, turn a race off with the keyboard, reset
        pg.goto(URL + '/'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(500)
        pg.focus('#filterbox summary'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        fr['opens_with_keyboard'] = pg.evaluate("document.getElementById('filterbox').open")
        pg.focus('[data-fr="Auditor"]'); pg.keyboard.press('Space'); pg.wait_for_timeout(500)
        fr['race_off_by_keyboard'] = [pg.get_attribute('[data-fr="Auditor"]', 'aria-pressed'), pg.evaluate('location.search')]
        pg.screenshot(path=f'{OUT}/{name}-filter-open.png')
        pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js'); fr['axe_filter_open'] = pg.evaluate(AXE)
        pg.click('#freset'); pg.wait_for_timeout(400)
        fr['after_reset'] = [pg.evaluate('window.__test.filt()'), pg.evaluate('location.search')]
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200); fr['escape_closes'] = not pg.evaluate("document.getElementById('filterbox').open")
        aid = pg.evaluate("window.__test.byName('Alameda County Democratic Party')")
        pg.goto(URL + f'/?node={aid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(2500)
        fr['logos'] = pg.evaluate("(()=>{const im=[...document.querySelectorAll('#panel .av-logo img')];return {imgs: im.length, loaded: im.filter(i=>i.complete&&i.naturalWidth>0).length, fallbacks: document.querySelectorAll('#panel .av-logo:not(:has(img))').length}})()")
        c['landing_tools_fit'] = pg.evaluate("(()=>{const r=document.querySelector('.ab-tools').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),hscroll:document.documentElement.scrollWidth>innerWidth}})()")
        # ---------- compare (multi-select) ----------
        cm = c['compare'] = {}
        mid = pg.evaluate("window.__test.byName('Syrak Micael')"); bid = pg.evaluate("window.__test.byName('Daria Wrubel')")
        CMP = """(()=>{const P=document.getElementById('panel');return {multi: window.__test.multi(), all_linked: window.__test.allLinked().length, some_linked: window.__test.someLinked().length,
          chips: P.querySelectorAll('.cchip').length, banner: (P.querySelector('.banner')||{}).innerText, between: (P.querySelector('.between')||{}).innerText,
          only: [...P.querySelectorAll('.grp.only>summary')].map(s=>s.innerText.replace(/\\s+/g,' ').trim()), markers: P.querySelectorAll('a[data-ref]').length,
          unresolved_markers: [...P.querySelectorAll('a[data-ref]')].filter(a=>!P.querySelector('#pref-'+a.dataset.ref)).length, url: location.search}})()"""
        pg.goto(URL + f'/?select={mid},{bid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(900)
        cm['deeplink'] = pg.evaluate(CMP)
        pg.screenshot(path=f'{OUT}/{name}-compare-micael-wrubel.png'); shoot_panel(pg, mob, f'{OUT}/{name}-compare-panel.png')
        if name in ('d1440', 'm390'): cm['panel_text'] = pg.locator('#panel').inner_text()
        pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js'); cm['axe'] = pg.evaluate(AXE)
        # + Compare in the panel, then "+ Add" in search, by keyboard
        pg.goto(URL + f'/?node={mid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(700)
        btn = pg.locator('#panel [data-compare]'); btn.tap() if mob else btn.click(); pg.wait_for_timeout(400)
        cm['after_compare_button'] = pg.evaluate(CMP)
        if mob and pg.evaluate("document.getElementById('sheet').classList.contains('open')"): pg.locator('#sheetbtn').tap(); pg.wait_for_timeout(300)
        pg.fill('#q', 'Wrubel'); pg.wait_for_timeout(300)
        cm['search_add_option'] = pg.locator('#qres [data-add]').count()
        pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
        cm['after_search_add'] = pg.evaluate(CMP)
        pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js'); cm['axe_after_add'] = pg.evaluate(AXE)
        if not mob:   # shift-click on the graph
            pg.goto(URL + f'/?node={mid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(900)
            pos = pg.evaluate(f"window.__test.pos('{bid}')"); box = pg.locator('#graph').bounding_box()
            pg.mouse.move(box['x'] + pos['x'], box['y'] + pos['y']); pg.wait_for_timeout(200)
            pg.keyboard.down('Shift'); pg.mouse.click(box['x'] + pos['x'], box['y'] + pos['y']); pg.keyboard.up('Shift'); pg.wait_for_timeout(700)
            cm['shift_click'] = pg.evaluate('window.__test.multi()')
            pg.goto(URL + f'/?select={mid},{bid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(700)
        # remove a chip, then clear
        x = pg.locator(f'#panel [data-unsel="{bid}"]')
        if mob and not pg.evaluate("document.getElementById('sheet').classList.contains('open')"): pg.locator('#sheetbtn').tap(); pg.wait_for_timeout(300)
        x.tap() if mob else x.click(); pg.wait_for_timeout(400); cm['after_remove'] = pg.evaluate('window.__test.multi()')
        cl = pg.locator('#panel [data-clear]'); cl.tap() if mob else cl.click(); pg.wait_for_timeout(400)
        cm['after_clear'] = [pg.evaluate('window.__test.multi()'), pg.evaluate('location.search'), pg.locator('#panel h2').first.inner_text()]
        # with a filter, and the cap of five
        pg.goto(URL + f'/?races=Council%20D1,Council%20D7&select={mid},{bid}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(700)
        cm['with_filter'] = pg.evaluate(CMP)
        six = pg.evaluate("window.__test.cands().slice(0,6).join(',')")
        pg.goto(URL + f'/?select={six}'); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(700)
        cm['cap'] = len(pg.evaluate('window.__test.multi()'))
        # ---------- findings page ----------
        pg.goto(URL + '/findings/', wait_until='networkidle'); pg.wait_for_timeout(800)
        f = c['findings'] = pg.evaluate("""(()=>({draft: (document.querySelector('.draft')||{}).textContent, back_links: [...document.querySelectorAll('a[href="/"]')].length,
           hscroll: document.documentElement.scrollWidth > innerWidth, h1: document.querySelector('h1').textContent,
           node_links: [...document.querySelectorAll('a.nlink')].length, bad_node_links: [...document.querySelectorAll('a.nlink')].filter(a=>!/^\\/\\?node=/.test(a.getAttribute('href'))).length,
           jaccard_on_page: /jaccard|combined lists|either list/i.test(document.body.innerText),
           logo_credit: !!document.querySelector('a[href="https://logo.dev"]'),
           grids_present: ['#heatmap','#overlap','.matrix-sec','#hmmode','.ovtip'].filter(q=>document.querySelector(q)),
           findings_words: (()=>{const a=document.querySelector('.story').cloneNode(true); return a.innerText.split(/\\s+/).filter(Boolean).length})(),
           references: (()=>{const li=[...document.querySelectorAll('#refs ~ .reflist li[id^=ref-]')]; return {n: li.length, missing_url_or_date: li.filter(x=>!x.querySelector('a[href^=http]')||!/Accessed|not recorded/.test(x.innerText)).length}})()}))()""")
        pg.screenshot(path=f'{OUT}/{name}-findings-top.png'); pg.screenshot(path=f'{OUT}/{name}-findings-full.png', full_page=True)
        if True:   # axe at every width
            pg.add_script_tag(path='/tmp/axe-pkg/node_modules/axe-core/axe.min.js'); f['axe'] = pg.evaluate(AXE)
        # a findings name link opens the graph with that node selected
        href = pg.locator('a.nlink').first.get_attribute('href'); pg.goto(URL + href); pg.wait_for_function('window.__ready === true'); pg.wait_for_timeout(500)
        f['name_link_opens'] = [href, pg.locator('#panel h2').first.inner_text()]
        report['errors'][name] = errs
        ctx.close()
    b.close()
out = RED(json.dumps(report, indent=1)); open(f'{OUT}/verify_report.json', 'w').write(out); print(out)
