"""サイト版の「あいことば」：Worker（worker/）を手元で動かして、6けたの数字でつながるかを確かめる

先に1回だけ：cd worker && npm install
引数に URL をわたすと、手元の Worker のかわりに、デプロイした Worker でためす（期限切れの確認は10分かかるので、とばす）：
  python3 test/p2p_room.py https://cs-card-signal.chikin80100.workers.dev
Worker は wrangler dev で立てる（部屋の期限はテスト用に20秒）。ページは http で開く（Worker が localhost からの呼び出しを許すため）。
- 部屋をつくる → あいことばとQRコード（#r=数字 のリンク）
- 相手：QRのリンクで開く → あいことばが入っている → 入る → 2人とも対戦の画面
- まちがったあいことば・サーバーに届かないとき（リンク交換にもどる）・期限切れ
"""
import sys, pathlib, threading, functools, http.server, socketserver, subprocess, time, urllib.request, os, signal, re
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
TTL = 20
fails, errors = [], []


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

# Worker を立てる（引数に URL があれば、それを使う）
REMOTE = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else ''
WPORT = 8799
SIG = REMOTE or f'http://127.0.0.1:{WPORT}'
env = dict(os.environ, NO_PROXY='127.0.0.1,localhost', no_proxy='127.0.0.1,localhost', WRANGLER_SEND_METRICS='false')
wd = None if REMOTE else subprocess.Popen(['npx', 'wrangler', 'dev', '--port', str(WPORT), '--ip', '127.0.0.1', '--var', f'ROOM_TTL_SEC:{TTL}'],
                      cwd=str(ROOT / 'worker'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env, start_new_session=True)
opener = urllib.request.build_opener() if REMOTE else urllib.request.build_opener(urllib.request.ProxyHandler({}))
opener.addheaders = [('User-Agent', 'cs-card-test')]  # Cloudflare は Python の標準の名乗りを断る（error 1010）
for _ in range(90):
    try:
        if opener.open(SIG + '/health', timeout=2).status == 200:
            break
    except Exception:
        time.sleep(1)
else:
    if wd:
        os.killpg(wd.pid, signal.SIGTERM)
    raise SystemExit('Worker が起動しませんでした（cd worker && npm install をしましたか？）')


def qr_text(pg, sel):
    try:
        import numpy as np, zxingcpp, io
        from PIL import Image
    except ImportError:
        return None
    img = Image.open(io.BytesIO(pg.locator(sel).first.screenshot())).convert('L')
    res = zxingcpp.read_barcodes(np.array(img))
    return res[0].text if res else ''


def new_page(b, sig_url):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    ctx.add_init_script(f'window.CS_SIGNAL_URL = {sig_url!r};')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))
    route_fonts(pg)
    return pg


def open_online(pg, url=None):
    pg.goto(url or (URL + '#select')); pg.wait_for_timeout(400)
    if not url:
        pg.click('[data-vs="online"]', force=True); pg.wait_for_timeout(200)


try:
    with sync_playwright() as p:
        b = launch(p)
        # 1. 部屋をつくる → あいことば
        host = new_page(b, SIG)
        open_online(host)
        check('あいことば' in host.inner_text('#scr-select h3'), 'Worker があると「あいことば」の画面になる')
        host.click('[data-net="create"]', force=True)
        host.wait_for_selector('.net-code', timeout=15000)
        code = host.inner_text('.net-code').strip()
        check(re.fullmatch(r'\d{6}', code) is not None, f'6けたのあいことばが出た（{code}）')
        q = qr_text(host, '.room-wait .qr')
        if q is not None:
            check(q == URL + '#r=' + code, 'QRコードを読むと、あいことばの入ったリンク')
        host.screenshot(path=str(OUT / 'room_host.png'), full_page=True)

        # 2. まちがったあいことば
        guest = new_page(b, SIG)
        open_online(guest)
        bad = '000000' if code != '000000' else '111111'
        guest.fill('#p2pRoom', bad); guest.click('[data-net="joinroom"]', force=True)
        guest.wait_for_selector('.msg.err', timeout=10000)
        check('見つかりませんでした' in guest.inner_text('.msg.err'), 'まちがったあいことばでは「見つかりませんでした」')

        # 3. QRのリンクで開く → 入る → つながる
        guest.goto(URL + '#r=' + code); guest.wait_for_timeout(500)
        check(guest.eval_on_selector('#p2pRoom', 'e => e.value') == code, 'リンクで開くと、あいことばが入っている')
        check(guest.is_visible('.msg.ok'), '「あいことばが入っています」が出る')
        guest.screenshot(path=str(OUT / 'room_guest.png'), full_page=True)
        guest.click('[data-net="joinroom"]', force=True)
        ok = False
        for _ in range(150):
            guest.wait_for_timeout(150)
            if host.evaluate('P2P.connected') and guest.evaluate('P2P.connected'):
                ok = True
                break
        check(ok, 'あいことばだけで、2台がつながった')
        check(host.evaluate('P2P.room') is None, 'つながったら、部屋をつくった人は部屋の情報をすてた')

        # 4. 待合室：つながっても、2人とも「準備OK」を押すまではじまらない
        host.wait_for_timeout(2000)
        check(host.evaluate('UI.screen') == 'select' and guest.evaluate('UI.screen') == 'select', 'つながっても、すぐには対戦がはじまらない')
        check(host.query_selector('.matchbar [data-net="again"]') is not None and guest.query_selector('.matchbar [data-net="again"]') is not None, '2人の画面の下に「準備OK」がある')
        host.screenshot(path=str(OUT / 'room_ready_host.png'))
        guest.click('[data-pick="me"][data-id="p_data"]', force=True)
        guest.click('.matchbar [data-net="again"]', force=True)
        host.wait_for_function('P2P.oppAgain', timeout=5000)
        check('準備OK' in host.inner_text('.matchbar'), '相手が準備OKを押すと、こちらに「相手：準備OK」')
        check('データ構造ラボ' not in host.inner_text('#scr-select .net') + host.inner_text('.matchbar'), '相手のデッキの名前は出ない')
        check(host.evaluate('UI.screen') == 'select', '片方だけ準備OKでは、まだはじまらない')
        host.screenshot(path=str(OUT / 'room_ready_opp.png'))
        # 準備OKのあとでデッキを変える → 取り消し（相手にも伝わる）
        guest.click('[data-pick="me"][data-id="p_net"]', force=True)
        check(guest.query_selector('.matchbar [data-net="again"]') is not None, 'デッキを変えると、準備OKが取り消される')
        host.wait_for_function('!P2P.oppAgain', timeout=5000)
        check('選んでいます' in host.inner_text('.matchbar'), '相手の画面でも「デッキを選んでいます」にもどる')
        # 「準備をやめる」ボタン
        host.click('.matchbar [data-net="again"]', force=True); host.wait_for_timeout(200)
        check(host.query_selector('.matchbar [data-net="unready"]') is not None, '準備OKのあとは「準備をやめる」が出る')
        host.click('.matchbar [data-net="unready"]', force=True)
        guest.wait_for_function('!P2P.oppAgain', timeout=5000)
        check(True, '「準備をやめる」で、相手の画面の準備OKも消える')
        # 2人とも準備OK → はじまる。ゲストのデッキは、変えたあとのもの
        guest.click('.matchbar [data-net="again"]', force=True); host.click('.matchbar [data-net="again"]', force=True)
        host.wait_for_selector('#actbar [data-act="ready"]', timeout=15000); guest.wait_for_selector('#actbar [data-act="ready"]', timeout=15000)
        check(host.evaluate('UI.screen') == 'battle' and guest.evaluate('UI.screen') == 'battle', '2人とも準備OKで、対戦がはじまった')
        check(host.evaluate('UI.g.players[1].deckName') == 'ネットワーク網' and guest.evaluate('UI.g.players[1].deckName') == 'ネットワーク網', '相手のデッキは、変えたあとの「ネットワーク網」（2人の画面で同じ）')
        host.wait_for_timeout(500)
        check('ネットワーク網' not in host.inner_text('#board') and 'アルゴリズム研究室' not in guest.inner_text('#board'), '対戦中も、相手のデッキの名前は盤面に出ない')
        check('アルゴリズム研究室' in host.inner_text('#board'), '自分のデッキの名前は出る')
        try:
            opener.open(SIG + f'/room/{code}', timeout=3)
            check(False, 'つながったあと、Worker の部屋は消えている')
        except urllib.error.HTTPError as e:
            check(e.code == 404, 'つながったあと、Worker の部屋は消えている')

        # 4. サーバーに届かない → リンク交換にもどる
        down = new_page(b, 'http://127.0.0.1:9')
        open_online(down)
        down.click('[data-net="create"]', force=True)
        down.wait_for_selector('.qr', timeout=20000)
        check(down.query_selector('.net-code') is None and 'つながりませんでした' in down.inner_text('#scr-select'), 'サーバーに届かないときは、招待リンク（QR）にもどる')
        check('#j=CS2.' in down.eval_on_selector('.code-out', 'e => e.value'), '招待リンクはちゃんとできている')
        down.screenshot(path=str(OUT / 'room_down.png'), full_page=True)

        # 5. 期限切れ（デプロイした Worker では10分かかるので、とばす）
        if not REMOTE:
            late = new_page(b, SIG)
            open_online(late)
            late.click('[data-net="create"]', force=True)
            late.wait_for_selector('.net-code', timeout=15000)
            late.wait_for_selector('.msg.err', timeout=(TTL + 15) * 1000)
            check('期限' in late.inner_text('.msg.err'), f'{TTL}秒（テスト用の期限）たつと「期限が切れました」')
        b.close()
finally:
    if wd:
        os.killpg(wd.pid, signal.SIGTERM)
    srv.shutdown()
print('errors:', errors)
print('fails:', len(fails))
