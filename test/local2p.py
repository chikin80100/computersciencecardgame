"""この端末で2人対戦：端末を渡す画面をはさみながら、最後まで遊べるか"""
import pathlib, time
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
errors = []
def vis(page, sel):
    el = page.query_selector(sel); return el is not None and el.is_visible()
def click(page, sel):
    el = page.query_selector(sel)
    if el: el.click(force=True); return True
    return False
def my_turn(page):
    return page.query_selector('#actbar [data-act="end"]') is not None and not vis(page, '#coin') and not vis(page, '#choice') and not vis(page, '#handover')
def handle(page):
    if vis(page, '#handover'): click(page, '#handover [data-ho]'); page.wait_for_timeout(150); return True
    if vis(page, '#choice'):
        o = page.query_selector('#choice .copt')
        if o: o.click(force=True); page.wait_for_timeout(120); return True
    return False
def wait_idle(page):
    for _ in range(80):
        handle(page)
        if my_turn(page) or vis(page, '#result') or page.query_selector('#actbar [data-act="cancel"]'): return
        page.wait_for_timeout(100)
def play_turn(page):
    for _ in range(14):
        handle(page)
        if not my_turn(page): return
        ok = page.query_selector('#hand .hbtn.ok')
        if not ok: break
        ok.click(force=True)
        page.wait_for_selector('#handact [data-act="play"]', timeout=3000)
        b = page.query_selector('#handact [data-act="play"]:not([disabled])')
        if not b: click(page, '#handact [data-act="unsel"]'); break
        b.click(force=True); page.wait_for_timeout(120)
        if page.query_selector('#actbar [data-act="cancel"]'): click(page, '.mslot.tgt')
        wait_idle(page)
    if my_turn(page) and page.query_selector('.zone.tap'):
        click(page, '.zone.tap'); page.wait_for_timeout(100)
        if page.query_selector('#actbar [data-act="cancel"]'): click(page, '.mslot.tgt')
        wait_idle(page)
    if not my_turn(page): return
    click(page, '#board .f-me .aslot .mslot')
    page.wait_for_selector('#sheet .btn', timeout=3000)
    atks = page.query_selector_all('#sheet .btn.atk:not([disabled])')
    if atks:
        atks[-1].click(force=True)
        for _ in range(60):
            page.wait_for_timeout(120); handle(page)
            if not page.query_selector('#actbar [data-act="end"]') or vis(page, '#handover'): break
        return
    click(page, '#sheet [data-i="close"]'); click(page, '#actbar [data-act="end"]'); page.wait_for_timeout(150)
    if vis(page, '#sheet'): click(page, '#sheet .btn.gold')
def setup(page):
    for _ in range(3):
        h = page.query_selector('#hand .hbtn.ok')
        if not h: break
        h.click(force=True); page.wait_for_timeout(80)
    click(page, '#actbar [data-act="ready"]'); page.wait_for_timeout(200)

with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console: {m.text}') if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    page.route('**/fonts.g*/**', lambda r: r.abort())
    page.goto(URL + '#select'); page.wait_for_timeout(500)
    click(page, '[data-vs="local"]'); page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / 'l_select.png'))
    click(page, '[data-pick="me"][data-id="p_turing"]'); click(page, '[data-pick="p2"][data-id="p_neumann"]')
    click(page, '#startLocal'); page.evaluate('UI.fast = true')
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000); page.wait_for_timeout(200)
    print('P1 setup, me =', page.evaluate('UI.me'))
    setup(page)
    page.wait_for_selector('#handover:not([hidden])', timeout=8000)
    page.screenshot(path=str(OUT / 'l_handover.png'))
    click(page, '#handover [data-ho]'); page.wait_for_timeout(300)
    print('P2 setup, me =', page.evaluate('UI.me'), 'opp hidden:', page.inner_text('#board .f-opp .aslot')[:20])
    setup(page)
    t0, turns, seen = time.time(), 0, set()
    while time.time() - t0 < 300:
        if vis(page, '#result'): break
        if handle(page): continue
        if my_turn(page):
            turns += 1; seen.add(page.evaluate('UI.me'))
            if turns == 3: page.screenshot(path=str(OUT / 'l_turn.png'))
            play_turn(page)
        page.wait_for_timeout(100)
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / 'l_result.png'))
    print('finished:', vis(page, '#result'), 'turns:', turns, 'perspectives:', sorted(seen), page.inner_text('#result .res-sub') if vis(page, '#result') else '')
    print('tickets unchanged:', page.evaluate('STORE.tickets'))
    b.close()
print('errors:', errors[:8])
