"""本番と同じフォントで見た目を1回だけ確認する（フォントはローカルのfontsourceから配信）"""
import pathlib, re, glob
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
errors = []
with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    route_fonts(page)
    page.goto(URL)
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / 'v_title.png'))
    # 対戦：準備 → 自分の番でバトル場のシートを開く
    page.goto(URL + '#select')
    page.wait_for_timeout(400)
    page.click('[data-pick="me"][data-id="p_ai"]', force=True)
    page.click('[data-pick="opp"][data-id="p_sec"]', force=True)
    page.click('#startBtn', force=True)
    page.evaluate('UI.fast = true')
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000)
    for _ in range(3):
        h = page.query_selector('#hand .hbtn.ok')
        if not h:
            break
        h.click(force=True)
        page.wait_for_timeout(80)
    page.click('#actbar [data-act="ready"]', force=True)
    seen_sheet = False
    for _ in range(400):
        page.wait_for_timeout(150)
        if page.query_selector('#choice:not([hidden]) .copt'):
            page.query_selector('#choice .copt').click(force=True)
        if page.query_selector('#actbar [data-act="end"]') and page.query_selector('#coin[hidden]'):
            g_turn = page.evaluate('UI.g.turn')
            if g_turn >= 4 and not seen_sheet:
                if page.query_selector('.zone.tap'):
                    page.click('.zone.tap', force=True)
                    page.wait_for_timeout(100)
                    if page.query_selector('.mslot.tgt'):
                        page.screenshot(path=str(OUT / 'v_target.png'))
                        page.query_selector('.mslot.tgt').click(force=True)
                    page.wait_for_timeout(500)
                page.click('#board .f-me .aslot .mslot', force=True)
                page.wait_for_timeout(400)
                page.screenshot(path=str(OUT / 'v_sheet.png'))
                page.click('#sheet [data-i="close"]', force=True)
                seen_sheet = True
            page.click('#actbar [data-act="end"]', force=True)
            page.wait_for_timeout(150)
            if page.query_selector('#sheet:not([hidden]) .btn.gold'):
                page.click('#sheet .btn.gold', force=True)
        if page.query_selector('#result:not([hidden])'):
            page.wait_for_timeout(700)
            page.screenshot(path=str(OUT / 'v_result.png'))
            break
    ctx.close()
    ctx = b.new_context(viewport={'width': 1280, 'height': 860})
    page = ctx.new_page()
    route_fonts(page)
    page.goto(URL + '#rules')
    page.wait_for_timeout(1200)
    page.evaluate("document.querySelector('.cycle-wrap').scrollIntoView({block:'center'})")
    page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / 'v_rules.png'))
    page.goto(URL + '#dex')
    page.wait_for_timeout(800)
    page.click('.screen:not([hidden]) [data-info="pubkey"]', force=True)
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'v_card.png'))
    b.close()
print('pageerrors:', errors)
