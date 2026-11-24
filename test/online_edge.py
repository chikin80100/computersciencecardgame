"""オンライン対戦のはしっこ：まちがったあいことば・やめる・降参・見るだけの人"""
import pathlib, re
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
src = (ROOT / 'test' / 'online.py').read_text()
FAKE = re.search(r'FAKE = r"""(.*?)"""', src, re.S).group(1)
errors = []
def vis(page, sel):
    el = page.query_selector(sel); return el is not None and el.is_visible()
def click(page, sel):
    el = page.query_selector(sel)
    if el: el.click(force=True); return True
    return False
with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(FAKE)
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    host, guest = ctx.new_page(), ctx.new_page()
    for name, pg in (('host', host), ('guest', guest)):
        pg.on('pageerror', lambda e, n=name: errors.append(f'{n} pageerror: {e}'))
    host.goto(URL + '?u=alice#select'); host.evaluate('localStorage.clear()')
    host.goto('about:blank'); host.goto(URL + '?u=alice#select'); guest.goto(URL + '?u=bob#select')
    host.wait_for_timeout(500)
    click(host, '[data-vs="online"]'); click(guest, '[data-vs="online"]')
    guest.wait_for_selector('#netCode', timeout=15000)
    # 1) まちがったあいことば
    guest.fill('#netCode', '123456'); click(guest, '[data-net="join"]'); guest.wait_for_timeout(800)
    print('wrong code:', guest.inner_text('.msg.err') if vis(guest, '.msg.err') else None)
    guest.fill('#netCode', '12'); click(guest, '[data-net="join"]'); guest.wait_for_timeout(300)
    print('short code:', guest.inner_text('.msg.err') if vis(guest, '.msg.err') else None)
    # 2) 部屋をつくってやめる → 部屋が消える
    host.wait_for_selector('[data-net="create"]', timeout=15000)
    click(host, '[data-net="create"]'); host.wait_for_selector('.net-code', timeout=10000)
    code = host.inner_text('.net-code').strip()
    click(host, '[data-net="cancel"]'); host.wait_for_timeout(500)
    left = host.evaluate("Object.keys(JSON.parse(localStorage.getItem('__fakedb2__')) || {}).filter(k => k.startsWith('pvp/'))")
    print('cancel removes room:', left == [])
    guest.fill('#netCode', code); click(guest, '[data-net="join"]'); guest.wait_for_timeout(800)
    print('join canceled room:', guest.inner_text('.msg.err') if vis(guest, '.msg.err') else None)
    # 3) 対戦して、ホストが降参する
    click(host, '[data-net="create"]'); host.wait_for_selector('.net-code', timeout=10000)
    code = host.inner_text('.net-code').strip()
    guest.fill('#netCode', code); click(guest, '[data-net="join"]')
    for pg in (host, guest):
        pg.wait_for_selector('#actbar [data-act="ready"]', timeout=20000)
        h = pg.query_selector('#hand .hbtn.ok'); h.click(force=True); pg.wait_for_timeout(100)
        click(pg, '#actbar [data-act="ready"]')
    # 相手（ゲスト）の番のあいだに降参する（いちばん止まりやすい場面）
    for _ in range(300):
        if guest.query_selector('#actbar [data-act="end"]') and not vis(host, '#coin') and not vis(host, '#banner'): break
        if vis(guest, '#choice'): click(guest, '#choice .copt')
        if host.query_selector('#actbar [data-act="end"]') and not vis(host, '#coin') and not vis(host, '#choice'):
            click(host, '#actbar [data-act="end"]'); host.wait_for_timeout(150)
            if vis(host, '#sheet'): click(host, '#sheet .btn.gold')
        host.wait_for_timeout(100)
    print('surrender during:', 'guest turn' if guest.query_selector('#actbar [data-act="end"]') else 'other')
    click(host, '#actbar [data-act="menu"]'); host.wait_for_timeout(200)
    click(host, '#menu [data-m="give"]')
    guest.wait_for_selector('#result:not([hidden])', timeout=15000); host.wait_for_selector('#result:not([hidden])', timeout=15000)
    print('guest sees:', guest.inner_text('.res-sub'), '| tickets', guest.evaluate('STORE.tickets'))
    print('host sees:', host.inner_text('.res-sub'), '| tickets', host.evaluate('STORE.tickets'))
    # 4) 見るだけの人
    viewer = ctx.new_page()
    viewer.add_init_script("(() => { const u = window.claude.use; window.claude = { use: async n => { const v = await u(n); return n === 'user' ? Object.freeze({ id: async () => 'carol', can: async () => false }) : v; } }; })()")
    viewer.goto(URL + '?u=carol#select'); viewer.wait_for_timeout(500)
    click(viewer, '[data-vs="online"]'); viewer.wait_for_timeout(1500)
    print('viewer:', viewer.inner_text('.msg.warn') if vis(viewer, '.msg.warn') else None)
    b.close()
print('errors:', errors[:6])
