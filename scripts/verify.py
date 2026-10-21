"""Headless verification: screenshots of each view at desktop+mobile, console errors, node click panel."""
import sys, json, re, os
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; OUT = sys.argv[2] if len(sys.argv) > 2 else '/workspace/endorsement-graph/shots'
os.makedirs(OUT, exist_ok=True)
VPS = {'desktop': (1440, 900), 'mobile': (390, 844)}
report = {'url': URL, 'errors': {}, 'checks': {}}
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, (w, h) in VPS.items():
        ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if name == 'mobile' else 1, is_mobile=name == 'mobile', has_touch=name == 'mobile')
        pg = ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        pg.on('requestfailed', lambda r: errs.append(f'requestfailed: {r.url}'))
        pg.goto(URL, wait_until='networkidle'); pg.wait_for_function('window.__ready === true', timeout=20000)
        pg.wait_for_timeout(600)
        pg.screenshot(path=f'{OUT}/{name}-top.png')
        pg.screenshot(path=f'{OUT}/{name}-fullpage.png', full_page=True)
        for view in ['coalitions', 'bridges', 'race']:
            pg.click(f'[data-view={view}]'); pg.wait_for_timeout(500)
            pg.locator('#explore').scroll_into_view_if_needed(); pg.evaluate("document.getElementById('explore').scrollIntoView()"); pg.wait_for_timeout(300)
            pg.screenshot(path=f'{OUT}/{name}-{view}.png')
            if name == 'mobile':
                pg.locator('#panel').screenshot(path=f'{OUT}/{name}-{view}-panel.png')
        # node click: real mouse/touch on canvas at the node's viewport position
        pg.click('[data-view=coalitions]'); pg.wait_for_timeout(300)
        pg.evaluate("document.getElementById('explore').scrollIntoView()"); pg.wait_for_timeout(300)
        nid = pg.evaluate("window.__test.byName('Jenny Wong')")
        pos = pg.evaluate(f"window.__test.pos('{nid}')")
        box = pg.locator('#graph').bounding_box()
        x, y = box['x'] + pos['x'], box['y'] + pos['y']
        if name == 'mobile': pg.touchscreen.tap(x, y)
        else: pg.mouse.move(x, y); pg.wait_for_timeout(200); pg.mouse.click(x, y)
        pg.wait_for_timeout(900)
        h3 = pg.locator('#panel h3').first.inner_text()
        nlinks = pg.locator('#panel .srcs a').count()
        report['checks'][f'{name}-click'] = {'clicked': 'Jenny Wong', 'panel_h3': h3, 'source_links_in_panel': nlinks, 'hash': pg.evaluate('location.hash')}
        pg.evaluate("document.getElementById('explore').scrollIntoView()"); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{name}-node-click.png')
        if name == 'mobile': pg.locator('#panel').screenshot(path=f'{OUT}/{name}-node-click-panel.png')
        # search
        pg.mouse.move(2, 2) if name == 'desktop' else None
        pg.fill('#q', 'Karen W'); pg.wait_for_timeout(200); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        report['checks'][f'{name}-search'] = pg.locator('#panel h3').first.inner_text()
        pg.evaluate("document.getElementById('explore').scrollIntoView()"); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{name}-search-select.png')
        pg.fill('#q', 'Right to Housing'); pg.wait_for_timeout(200); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        report['checks'][f'{name}-slate'] = pg.locator('#panel h3').first.inner_text()
        pg.evaluate("document.getElementById('explore').scrollIntoView()"); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{OUT}/{name}-slate-select.png')
        # show all toggle
        pg.keyboard.press('Escape'); pg.check('#showall'); pg.wait_for_timeout(400)
        pg.screenshot(path=f'{OUT}/{name}-showall.png'); pg.uncheck('#showall')
        pg.locator('.overlap-sec').screenshot(path=f'{OUT}/{name}-overlap.png')
        pg.locator('.methods').screenshot(path=f'{OUT}/{name}-methods.png')
        report['errors'][name] = errs
        ctx.close()
    b.close()
print(json.dumps(report, indent=1))
