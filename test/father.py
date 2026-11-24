"""「コンピュータの父」シリーズの画面と、新しいコマンドの操作をたしかめる"""
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
def my_turn(page):
    return page.query_selector('#actbar [data-act="end"]') is not None and not vis(page, '#coin') and not vis(page, '#choice')
def wait_my_turn(page, limit=60):
    t0 = time.time()
    while time.time() - t0 < limit:
        if vis(page, '#result'): return False
        if vis(page, '#choice'): return 'choice'
        if my_turn(page): return True
        page.wait_for_timeout(100)
    return False
def use_card(page, uid):
    page.click(f'#hand .hbtn[data-uid="{uid}"]', force=True)
    page.wait_for_selector('#sheet .btn', timeout=3000)
    b = page.query_selector('#sheet .sheet-btns .btn.gold:not([disabled])')
    assert b, 'use button disabled: ' + page.inner_text('#sheet')[:200]
    b.click(force=True)
    page.wait_for_selector('#choice:not([hidden]) .copt', timeout=4000)
def end_turn(page):
    click(page, '#actbar [data-act="end"]'); page.wait_for_timeout(200)
    if vis(page, '#sheet'): click(page, '#sheet .btn.gold')
def give(page, who, ids, where='hand'):
    return page.evaluate(f"""(() => {{ const p = UI.g.players[{who}]; return {ids!r}.map(id => {{ const c = {{ uid: nextUid(), id }}; p.{where}.push(c); return c.uid; }}); }})()""")

with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_' not in m.text else None)
    route_fonts(page)
    page.goto(URL); page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT / 'f_title.png'))
    click(page, '.screen:not([hidden]) [data-nav="packs"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'f_packs.png'), full_page=True)
    # チューリングのパック：◆◆◆◆の人物カード（ホロ）を確かめる
    page.evaluate("(() => { const _r = rollPack; rollPack = pk => { const o = _r(pk); o[4] = { id: pk.feature, holo: true, god: false }; return o; }; return 1; })()")
    click(page, '.screen:not([hidden]) .btn[data-open="turing"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'f_open.png'))
    click(page, '#packov .po-pack'); page.wait_for_timeout(900)
    click(page, '#packov [data-po="all"]'); page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'f_open_done.png'))
    click(page, '#packov [data-po="again"]'); page.wait_for_timeout(200)
    click(page, '#packov .po-pack'); page.wait_for_timeout(900)
    click(page, '#packov [data-po="all"]'); page.wait_for_timeout(300)
    click(page, '#packov [data-po="dex"]'); page.wait_for_timeout(300)
    click(page, '.screen:not([hidden]) [data-df="father"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'f_dex.png'))
    click(page, '.screen:not([hidden]) [data-info="alan"]'); page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'f_alan.png'))
    page.keyboard.press('Escape')
    # 対戦：アラン・チューリングと暗号解読を自分で使う
    page.goto('about:blank'); page.goto(URL + '#select'); page.wait_for_timeout(800)
    click(page, '[data-pick="me"][data-id="p_turing"]'); click(page, '[data-pick="opp"][data-id="p_neumann"]')
    click(page, '#startBtn'); page.evaluate('UI.fast = true')
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000); page.wait_for_timeout(200)
    for _ in range(3):
        h = page.query_selector('#hand .hbtn.ok')
        if not h: break
        h.click(force=True); page.wait_for_timeout(80)
    click(page, '#actbar [data-act="ready"]')
    r = wait_my_turn(page)
    while r == 'choice':  # 先攻のCPUがゲーム理論などを使うと、はじめに選ぶ画面が出る
        page.click('#choice .copt[data-i="0"]', force=True); page.wait_for_timeout(300); r = wait_my_turn(page)
    assert r is True, r
    [alan, code, neu] = give(page, 0, ['alan', 'codebreak', 'neumann'])
    give(page, 0, ['pair', 'hackathon', 'patch'], 'discard')
    page.evaluate('renderBattle()'); page.wait_for_timeout(200)
    use_card(page, alan)
    page.screenshot(path=str(OUT / 'f_tutor.png'))
    n_opts = page.evaluate("document.querySelectorAll('#choice .copt').length")
    page.click('#choice .copt[data-i="0"]', force=True); page.wait_for_timeout(300)
    print('alan options:', n_opts)
    # CPUのゲーム理論：自分の手札から捨てるカードを選ぶ
    give(page, 1, ['gametheory', 'gametheory'])
    end_turn(page)
    r = wait_my_turn(page)
    if r == 'choice':
        page.screenshot(path=str(OUT / 'f_gametheory.png'))
        print('gametheory choice:', page.inner_text('#choice h3'))
        page.click('#choice .copt[data-i="0"]', force=True); page.wait_for_timeout(300)
        r = wait_my_turn(page)
    print('back to my turn:', r)
    if r is True:
        use_card(page, code)
        page.screenshot(path=str(OUT / 'f_codebreak.png'))
        print('codebreak title:', page.inner_text('#choice h3'))
        page.click('#choice .copt[data-i="0"]', force=True); page.wait_for_timeout(300)
        end_turn(page)
        r = wait_my_turn(page)
        while r == 'choice':
            page.click('#choice .copt[data-i="0"]', force=True); page.wait_for_timeout(300); r = wait_my_turn(page)
        if r is True:
            use_card(page, neu)
            page.screenshot(path=str(OUT / 'f_neumann1.png'))
            page.click('#choice .copt[data-i="0"]', force=True); page.wait_for_timeout(300)
            if vis(page, '#choice'):
                page.screenshot(path=str(OUT / 'f_neumann2.png'))
                print('second pick has cancel:', page.query_selector('#choice [data-i="cancel"]') is not None)
                page.click('#choice .copt[data-i="0"]', force=True); page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / 'f_battle.png'))
    log = page.evaluate("UI.g.log.map(l => l.msg || l).filter(t => /アラン|暗号解読|ゲーム理論|ノイマン|手札にもどした|山札にもどした|トラッシュした/.test(t)).slice(-12)")
    print('\n'.join(log))
    ctx.close(); b.close()
print('errors:', errors[:8])
