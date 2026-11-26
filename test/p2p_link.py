"""サイト版のリンク交換：QRコード・招待リンクで開く・参加リンクを別のタブからわたす・見つからないとき

ふつうのWebサイトと同じように http で開く（BroadcastChannel は同じオリジンのタブどうしで届くため）。
QRコードが読めるかは zxing-cpp があれば確かめる（pip install zxing-cpp numpy）。
"""
import pathlib, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
fails = []
errors = []


def check(ok, msg):
    print(('OK  ' if ok else 'NG  ') + msg)
    if not ok:
        fails.append(msg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'dist')))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/index.html'


def page_in(ctx):
    ctx.add_init_script("window.CS_SIGNAL_URL = '';")  # リンク交換をためすので、あいことばの Worker は使わない
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    route_fonts(pg)
    return pg


def qr_text(pg):
    try:
        import numpy as np, zxingcpp, io
        from PIL import Image
    except ImportError:
        return None
    img = Image.open(io.BytesIO(pg.locator('.qr').first.screenshot())).convert('L')
    res = zxingcpp.read_barcodes(np.array(img))
    return res[0].text if res else ''


with sync_playwright() as p:
    b = launch(p)
    host_ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    guest_ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    host = page_in(host_ctx)
    host.goto(URL + '#select'); host.wait_for_timeout(400)
    host.click('[data-vs="online"]', force=True); host.wait_for_timeout(200)
    host.click('[data-net="create"]', force=True)
    host.wait_for_selector('.qr', timeout=15000)
    invite = host.eval_on_selector('.code-out', 'e => e.value')
    check('#j=CS2.' in invite and invite.startswith(URL), f'招待リンクができた（{len(invite)}文字）')
    q = qr_text(host)
    if q is None:
        print('--  zxing-cpp がないので、QRコードの読み取りはとばす')
    else:
        check(q == invite, 'QRコードを読むと、招待リンクと同じ文字')
    host.screenshot(path=str(OUT / 'link_offer.png'), full_page=True)

    # 相手：招待リンク（QRコード）から開く
    guest = page_in(guest_ctx)
    guest.goto(invite); guest.wait_for_timeout(600)
    check(guest.evaluate('location.hash') == '#select', '開いたあと、アドレスからコードを消す')
    check(guest.is_visible('.msg.ok'), '「招待リンクから開きました」が出る')
    check(guest.eval_on_selector('#p2pInvite', 'e => e.value') in invite, '招待コードがもう入っている')
    guest.screenshot(path=str(OUT / 'link_guest_open.png'), full_page=True)
    guest.click('[data-net="join"]', force=True)
    guest.wait_for_selector('.qr', timeout=15000)
    answer = guest.eval_on_selector('.code-out', 'e => e.value')
    check('#a=CS2.' in answer, f'参加リンクができた（{len(answer)}文字）')
    q = qr_text(guest)
    if q is not None:
        check(q == answer, 'QRコードを読むと、参加リンクと同じ文字')
    guest.screenshot(path=str(OUT / 'link_answer.png'), full_page=True)

    # 別のブラウザで参加リンクを開いたとき：部屋をつくった画面は見つからない
    other = page_in(b.new_context(viewport={'width': 390, 'height': 844}))
    other.goto(answer); other.wait_for_timeout(2200)
    check(other.query_selector('[data-net="copyhand"]') is not None, 'ほかのブラウザでは「見つかりませんでした」とコピーの案内')
    other.screenshot(path=str(OUT / 'link_orphan.png'))

    # 部屋をつくった人が、同じブラウザで参加リンクを開く（スマホのカメラでQRを読んだとき）
    tab = page_in(host_ctx)
    tab.goto(answer)
    tab.wait_for_selector('.net-ok', timeout=5000)
    check('わたしました' in tab.inner_text('.net-ok'), '別のタブは「わたしました」と出る')
    tab.screenshot(path=str(OUT / 'link_handoff.png'))
    ok = False
    for _ in range(100):
        host.wait_for_timeout(150)
        if host.evaluate('P2P.connected') and guest.evaluate('P2P.connected'):
            ok = True
            break
    check(ok, 'もとの画面でつながった')
    host.wait_for_timeout(800)
    check(host.evaluate('UI.screen') == 'battle' and guest.evaluate('UI.screen') == 'battle', '2人とも対戦の画面になった')
    b.close()
srv.shutdown()
print('errors:', errors)
print('fails:', len(fails))
