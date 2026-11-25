"""CPU戦のオート対戦：準備のとちゅう・自分の番のとちゅうでオンにする・最後まで自動で進む・もう一度でも続く・オフで手動にもどる"""
import pathlib
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
fails, errors = [], []


def check(ok, msg):
    print(('OK  ' if ok else 'NG  ') + msg)
    if not ok:
        fails.append(msg)


def vis(page, sel):
    el = page.query_selector(sel)
    return el is not None and el.is_visible()


def run_to_result(page, limit=900):
    """クリックせずに、結果が出るまで待つ。人に選ばせる窓が出たら NG"""
    asked = False
    for _ in range(limit):
        page.wait_for_timeout(100)
        if vis(page, '#choice') or page.query_selector('#actbar [data-act="end"]'):
            asked = True
        if vis(page, '#result'):
            return True, asked
    return False, asked


with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page.on('pageerror', lambda e: errors.append(str(e)))
    route_fonts(page)
    page.goto(URL + '#select'); page.wait_for_timeout(400)
    page.click('[data-pick="me"][data-id="p_algo"]', force=True)
    page.click('[data-pick="opp"][data-id="p_data"]', force=True)
    page.click('#startBtn', force=True)
    page.evaluate('UI.fast = true')
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000)
    check(page.query_selector('#actbar [data-act="auto"][aria-pressed="false"]') is not None, 'CPU戦にオートのボタンがある（はじめはオフ）')

    # 1. 準備のとちゅう（1枚だけ置いた）でオンにする → CPU が並べなおして、最後まで自動
    page.query_selector('#hand .hbtn.ok').click(force=True); page.wait_for_timeout(100)
    page.click('#actbar [data-act="auto"]', force=True); page.wait_for_timeout(600)
    check(page.evaluate('UI.g.players[0].isCPU') is True, 'オンにすると、自分の席が CPU 扱いになる')
    check(page.evaluate('!!UI.g.players[0].active'), '準備のとちゅうでも、CPU がバトル場に出した')
    page.wait_for_timeout(1500)
    page.screenshot(path=str(OUT / 'auto_on.png'))
    done, asked = run_to_result(page)
    check(done, 'クリックしなくても、最後まで進んで結果が出た')
    check(not asked, 'とちゅうで、人に選ばせる窓や「番を終わる」が出なかった')
    page.screenshot(path=str(OUT / 'auto_result.png'))

    # 2. もう一度 → オートのまま
    page.click('#result [data-r="again"]', force=True)
    page.wait_for_timeout(800)
    check(page.evaluate('UI.auto && UI.g.players[0].isCPU'), '「もう一度」でもオートが続く')
    check(page.query_selector('#actbar [data-act="ready"]') is None, 'オートなので「準備OK」を待たない')

    # 3. オフ → 次の自分の番から手動
    page.click('#actbar [data-act="auto"]', force=True)
    manual = False
    for _ in range(600):
        page.wait_for_timeout(100)
        if vis(page, '#choice'):
            page.query_selector('#choice .copt').click(force=True)
        if page.query_selector('#actbar [data-act="end"]'):
            manual = True
            break
        if vis(page, '#result'):
            break
    check(manual, 'オフにすると、次の自分の番は手で操作できる')
    check(page.evaluate('UI.g.players[0].isCPU') is False, 'オフのあと、自分の席は人にもどった')
    page.screenshot(path=str(OUT / 'auto_off.png'))

    # 4. 自分の番のとちゅうでオン → その番のつづきを CPU が進める
    if manual:
        t = page.evaluate('UI.g.turn')
        page.click('#actbar [data-act="auto"]', force=True)
        moved = False
        for _ in range(300):
            page.wait_for_timeout(100)
            if page.evaluate('UI.g.turn') > t or vis(page, '#result'):
                moved = True
                break
        check(moved, '自分の番のとちゅうでオンにすると、CPU が番を進めて終わらせた')
        done, asked = run_to_result(page)
        check(done and not asked, 'そのまま最後まで自動で進んだ')
    b.close()
print('errors:', errors)
print('fails:', len(fails))
