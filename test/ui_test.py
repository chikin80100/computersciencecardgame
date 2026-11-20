"""ブラウザで画面を操作して、対戦が最後まで進むか・エラーが出ないかを確かめる"""
import sys, time, pathlib
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
GAMES = int(sys.argv[1]) if len(sys.argv) > 1 else 2
errors = []


def visible(page, sel):
    el = page.query_selector(sel)
    return el is not None and el.is_visible()


def handle_choice(page):
    if visible(page, '#choice'):
        opts = page.query_selector_all('#choice .copt')
        if opts:
            opts[0].click(force=True)
            return True
    return False


def click_target(page):
    tg = page.query_selector('.mslot.tgt')
    if tg:
        tg.click(force=True)
        return True
    return False


def my_turn(page):
    return page.query_selector('#actbar [data-act="end"]') is not None and not visible(page, '#coin') and not visible(page, '#choice')


def play_my_turn(page, shot=None):
    # 手札で使えるカードを順に使う
    for _ in range(14):
        handle_choice(page)
        if not my_turn(page):
            return
        oks = page.query_selector_all('#hand .hbtn.ok')
        if not oks:
            break
        oks[0].click(force=True)
        page.wait_for_selector('#sheet .btn', timeout=3000)
        btn = page.query_selector('#sheet .sheet-btns .btn.gold:not([disabled])')
        if not btn:
            page.click(force=True, selector='#sheet [data-i="close"]')
            break
        btn.click(force=True)
        page.wait_for_timeout(120)
        if page.query_selector('#actbar [data-act="cancel"]'):
            click_target(page)
        wait_idle(page)
    # エネルギー
    if my_turn(page) and page.query_selector('.zone.tap'):
        page.click(force=True, selector='.zone.tap')
        page.wait_for_timeout(100)
        if page.query_selector('#actbar [data-act="cancel"]'):
            # 一番エネルギーが少ないバトル場を優先したいが、テストでは最初の候補
            click_target(page)
        wait_idle(page)
    if shot:
        page.screenshot(path=str(OUT / shot))
    if not my_turn(page):
        return
    # ワザ
    page.click(force=True, selector='#actbar [data-act="attackmenu"]')
    page.wait_for_selector('#sheet .btn', timeout=3000)
    atks = page.query_selector_all('#sheet .btn.atk:not([disabled])')
    if atks:
        atks[-1].click(force=True)
        for _ in range(40):
            page.wait_for_timeout(150)
            handle_choice(page)
            if not page.query_selector('#actbar [data-act="end"]'):
                break
        return
    page.click(force=True, selector='#sheet [data-i="close"]')
    page.click(force=True, selector='#actbar [data-act="end"]')
    page.wait_for_timeout(150)
    if visible(page, '#sheet'):
        b = page.query_selector('#sheet .btn.gold')
        if b:
            b.click(force=True)


def wait_idle(page):
    for _ in range(60):
        handle_choice(page)
        if my_turn(page) or visible(page, '#result') or page.query_selector('#actbar [data-act="cancel"]'):
            return
        page.wait_for_timeout(100)


def run():
    with sync_playwright() as p:
        browser = launch(p)
        for vp, name in [({'width': 390, 'height': 844}, 'phone'), ({'width': 1280, 'height': 820}, 'desk')]:
            ctx = browser.new_context(viewport=vp, device_scale_factor=2 if name == 'phone' else 1)
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
            page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning') and 'fonts.g' not in m.text else None)
            page.route('**/fonts.googleapis.com/**', lambda r: r.abort())
            page.route('**/fonts.gstatic.com/**', lambda r: r.abort())
            page.goto(URL)
            page.wait_for_timeout(400)
            page.screenshot(path=str(OUT / f'{name}_title.png'))
            if name == 'desk':
                page.click(force=True, selector='.screen:not([hidden]) [data-nav="dex"]')
                page.screenshot(path=str(OUT / 'desk_dex.png'))
                page.click(force=True, selector='.screen:not([hidden]) [data-info="quick"]')
                page.wait_for_timeout(300)
                page.screenshot(path=str(OUT / 'desk_card.png'))
                page.keyboard.press('Escape')
                page.click(force=True, selector='.screen:not([hidden]) [data-nav="title"]')
                page.click(force=True, selector='.screen:not([hidden]) [data-nav="rules"]')
                page.screenshot(path=str(OUT / 'desk_rules.png'), full_page=True)
                page.click(force=True, selector='.screen:not([hidden]) [data-nav="title"]')
                # デッキ編集：プリセットをコピーして保存
                page.evaluate('ALL_IDS.forEach(id => { STORE.coll[id] = 2; }); saveStore()')  # 全カード所持にしてからコピー
                page.click(force=True, selector='.screen:not([hidden]) [data-nav="decks"]')
                page.click(force=True, selector='[data-copy="p_net"]')
                page.screenshot(path=str(OUT / 'desk_editor.png'))
                page.click(force=True, selector='#edSave')
                page.wait_for_timeout(200)
                page.click(force=True, selector='.screen:not([hidden]) [data-nav="title"]')
                ctx.close()
                continue
            for gi in range(GAMES):
                page.goto('about:blank')
                page.goto(URL + '#select')
                page.wait_for_timeout(300)
                decks = page.query_selector_all('[data-pick="me"]')
                decks[gi % len(decks)].click(force=True)
                page.click(force=True, selector='#startBtn')
                page.evaluate('UI.fast = true')
                # 準備
                page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000)
                page.wait_for_timeout(200)
                for _ in range(3):
                    b = page.query_selector('#hand .hbtn.ok')
                    if not b:
                        break
                    b.click(force=True)
                    page.wait_for_timeout(80)
                if gi == 0:
                    page.screenshot(path=str(OUT / 'phone_setup.png'))
                page.click(force=True, selector='#actbar [data-act="ready"]')
                t0 = time.time()
                turns = 0
                while time.time() - t0 < 240:
                    if visible(page, '#result'):
                        break
                    handle_choice(page)
                    if my_turn(page):
                        turns += 1
                        play_my_turn(page, shot=f'phone_turn{turns}.png' if gi == 0 and turns in (2, 4) else None)
                    page.wait_for_timeout(120)
                done = visible(page, '#result')
                txt = page.inner_text('#result') if done else page.inner_text('#board')[:200]
                print(f'game {gi}: finished={done} myturns={turns} {time.time() - t0:.0f}s :: {txt.splitlines()[1] if done else txt}')
                if gi == 0:
                    page.screenshot(path=str(OUT / 'phone_result.png'))
                    page.click(force=True, selector='#result [data-r="close"]')
                    page.click(force=True, selector='#board [data-act="log"]')
                    page.screenshot(path=str(OUT / 'phone_log.png'))
                    page.click(force=True, selector='#lpClose')
                if done:
                    page.click(force=True, selector='#result [data-r="select"]') if visible(page, '#result') else None
            ctx.close()
        browser.close()
    print('errors:', len(errors))
    for e in errors[:20]:
        print(' ', e)


run()
