"""パック開封・図鑑・デッキ編集・対戦を、本番と同じフォントで一通り操作して確認する"""
import pathlib, time
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
errors = []
def vis(page, sel):
    el = page.query_selector(sel); return el is not None and el.is_visible()
def click(page, sel):
    el = page.query_selector(sel)
    if el: el.click(force=True); return True
    return False
def handle_choice(page):
    if vis(page, '#choice'):
        o = page.query_selector('#choice .copt')
        if o: o.click(force=True); return True
    return False
def my_turn(page):
    return page.query_selector('#actbar [data-act="end"]') is not None and not vis(page, '#coin') and not vis(page, '#choice')
def wait_idle(page):
    for _ in range(60):
        handle_choice(page)
        if my_turn(page) or vis(page, '#result') or page.query_selector('#actbar [data-act="cancel"]'): return
        page.wait_for_timeout(100)
def play_turn(page, shot=None):
    for _ in range(14):
        handle_choice(page)
        if not my_turn(page): return
        ok = page.query_selector('#hand .hbtn.ok')
        if not ok: break
        ok.click(force=True)
        page.wait_for_selector('#sheet .btn', timeout=3000)
        b = page.query_selector('#sheet .sheet-btns .btn.gold:not([disabled])')
        if not b: click(page, '#sheet [data-i="close"]'); break
        b.click(force=True); page.wait_for_timeout(120)
        if page.query_selector('#actbar [data-act="cancel"]'): click(page, '.mslot.tgt')
        wait_idle(page)
    if my_turn(page) and page.query_selector('.zone.tap'):
        click(page, '.zone.tap'); page.wait_for_timeout(100)
        if page.query_selector('#actbar [data-act="cancel"]'): click(page, '.mslot.tgt')
        wait_idle(page)
    if shot: page.screenshot(path=str(OUT / shot))
    if not my_turn(page): return
    click(page, '#actbar [data-act="attackmenu"]')
    page.wait_for_selector('#sheet .btn', timeout=3000)
    atks = page.query_selector_all('#sheet .btn.atk:not([disabled])')
    if atks:
        atks[-1].click(force=True)
        for _ in range(40):
            page.wait_for_timeout(150); handle_choice(page)
            if not page.query_selector('#actbar [data-act="end"]'): break
        return
    click(page, '#sheet [data-i="close"]'); click(page, '#actbar [data-act="end"]'); page.wait_for_timeout(150)
    if vis(page, '#sheet'): click(page, '#sheet .btn.gold')

with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_' not in m.text else None)
    route_fonts(page)
    page.goto(URL); page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT / 'n_title.png'))
    click(page, '.screen:not([hidden]) [data-nav="packs"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'n_packs.png'), full_page=True)
    # 1パック目を丁寧に
    click(page, '.screen:not([hidden]) .btn[data-open="logic"]'); page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'n_open1.png'))
    click(page, '#packov .po-pack'); page.wait_for_timeout(250)
    page.screenshot(path=str(OUT / 'n_open_tear.png'))
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / 'n_open2.png'))
    click(page, '#packov .po-card'); page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / 'n_open3.png'))
    click(page, '#packov [data-po="all"]'); page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'n_open_done.png'))
    # 残りのチケットで開ける
    opened = 1
    for _ in range(12):
        if not click(page, '#packov [data-po="again"]:not([disabled])'): break
        page.wait_for_timeout(150); click(page, '#packov .po-pack'); page.wait_for_timeout(900)
        click(page, '#packov [data-po="all"]'); page.wait_for_timeout(200); opened += 1
    print('opened packs:', opened, page.evaluate('JSON.stringify({t:STORE.tickets,p:STORE.points,kinds:ownedKinds(),cards:Object.values(STORE.coll).reduce((a,b)=>a+b,0)})'))
    click(page, '#packov [data-po="dex"]'); page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'n_dex.png'))
    # デッキ編集
    click(page, '.screen:not([hidden]) [data-nav="title"]'); click(page, '.screen:not([hidden]) [data-nav="decks"]')
    click(page, '[data-copy="p_algo"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'n_editor.png'))
    click(page, '#edBack')
    # CPUと対戦
    page.goto('about:blank'); page.goto(URL + '#select'); page.wait_for_timeout(800)
    click(page, '[data-pick="me"][data-id="p_chain"]'); click(page, '[data-pick="opp"][data-id="p_quantum"]')
    click(page, '#startBtn'); page.evaluate('UI.fast = true')
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000); page.wait_for_timeout(200)
    for _ in range(3):
        h = page.query_selector('#hand .hbtn.ok')
        if not h: break
        h.click(force=True); page.wait_for_timeout(80)
    click(page, '#actbar [data-act="ready"]')
    t0, turns = time.time(), 0
    while time.time() - t0 < 240:
        if vis(page, '#result'): break
        handle_choice(page)
        if my_turn(page):
            turns += 1; play_turn(page, shot='n_battle.png' if turns == 4 else None)
        page.wait_for_timeout(120)
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / 'n_result.png'))
    print('battle finished:', vis(page, '#result'), 'turns', turns, page.evaluate('STORE.tickets'))
    ctx.close()
    # パソコンの画面でカード詳細
    ctx = b.new_context(viewport={'width': 1280, 'height': 860})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror(desk): {e}'))
    route_fonts(page)
    page.goto(URL + '#dex'); page.wait_for_timeout(900)
    page.evaluate("STORE.coll.quantum = 1; STORE.holo.quantum = 1; renderDex()")
    click(page, '.screen:not([hidden]) [data-info="quantum"]'); page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'n_card.png'))
    ctx.close(); b.close()
print('errors:', errors[:10])
