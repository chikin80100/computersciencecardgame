"""ほかのサイトに置いた版：2つのページでコードを交換してつなぎ、対戦・再戦・切断をたしかめる"""
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
    return page.query_selector('#actbar [data-act="end"]') is not None and not vis(page, '#coin') and not vis(page, '#choice')
def handle(page):
    if vis(page, '#choice'):
        o = page.query_selector('#choice .copt')
        if o: o.click(force=True); page.wait_for_timeout(100); return True
    return False
def pump(pages, ms=100):
    for p in pages: handle(p)
    pages[0].wait_for_timeout(ms)
def play_turn(page, other):
    for _ in range(14):
        handle(page); handle(other)
        if not my_turn(page): return
        ok = page.query_selector('#hand .hbtn.ok')
        if not ok: break
        ok.click(force=True)
        page.wait_for_selector('#handact [data-act="play"]', timeout=3000)
        b = page.query_selector('#handact [data-act="play"]:not([disabled])')
        if not b: click(page, '#handact [data-act="unsel"]'); break
        b.click(force=True); page.wait_for_timeout(120)
        if page.query_selector('#actbar [data-act="cancel"]'): click(page, '.mslot.tgt')
        for _ in range(80):
            pump([page, other])
            if my_turn(page) or vis(page, '#result') or page.query_selector('#actbar [data-act="cancel"]'): break
    if my_turn(page) and page.query_selector('.zone.tap'):
        click(page, '.zone.tap'); page.wait_for_timeout(100)
        if page.query_selector('#actbar [data-act="cancel"]'): click(page, '.mslot.tgt')
        page.wait_for_timeout(150)
    if not my_turn(page): return
    click(page, '#board .f-me .aslot .mslot')
    page.wait_for_selector('#sheet .btn', timeout=3000)
    atks = page.query_selector_all('#sheet .btn.atk:not([disabled])')
    if atks:
        atks[-1].click(force=True)
        for _ in range(120):
            pump([page, other])
            if not page.query_selector('#actbar [data-act="end"]'): break
        return
    click(page, '#sheet [data-i="close"]'); click(page, '#actbar [data-act="end"]'); page.wait_for_timeout(150)
    if vis(page, '#sheet'): click(page, '#sheet .btn.gold')
def setup(page):
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=20000); page.wait_for_timeout(200)
    for _ in range(3):
        h = page.query_selector('#hand .hbtn.ok')
        if not h: break
        h.click(force=True); page.wait_for_timeout(80)
    click(page, '#actbar [data-act="ready"]'); page.wait_for_timeout(200)
def play_game(host, guest, limit=420, max_turns=999):
    setup(guest); setup(host)
    t0, turns = time.time(), 0
    while time.time() - t0 < limit and turns < max_turns:
        if vis(host, '#result') and vis(guest, '#result'): break
        handle(host); handle(guest)
        for pg, other in ((host, guest), (guest, host)):
            if my_turn(pg):
                pg.evaluate('UI.fast = true'); turns += 1
                play_turn(pg, other)
        host.wait_for_timeout(80)
    return turns
def state(pg):
    return pg.evaluate('UI.g ? { w: UI.g.winner, pts: UI.g.players.map(p => p.points), turn: UI.g.turn, h: stateHash(UI.g), over: UI.g.over, desync: !!UI.g.desync, reason: UI.g.reason } : null')

with sync_playwright() as p:
    b = launch(p, '--disable-features=WebRtcHideLocalIpsWithMdns')
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    import sys as _s
    DROP = float(_s.argv[1]) if len(_s.argv) > 1 else 0
    if DROP:
        # 手（mv）の通信を、わざと一部落とす
        ctx.add_init_script("(() => { const S = RTCDataChannel.prototype.send; RTCDataChannel.prototype.send = function (d) { if (String(d).startsWith('{\"k\":\"mv\"') && Math.random() < %s) { window.__dropped = (window.__dropped || 0) + 1; return; } return S.call(this, d); }; })()" % DROP)
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    host, guest = ctx.new_page(), ctx.new_page()
    for name, pg in (('host', host), ('guest', guest)):
        pg.on('pageerror', lambda e, n=name: errors.append(f'{n} pageerror: {e}'))
        pg.on('console', lambda m, n=name: errors.append(f'{n} console: {m.text}') if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    host.goto(URL + '#select'); host.evaluate('localStorage.clear()'); host.goto('about:blank')
    host.goto(URL + '#select'); guest.goto(URL + '#select'); host.wait_for_timeout(400)
    print('transport:', host.evaluate('TRANSPORT()'))
    DECKS = (_s.argv[2] if len(_s.argv) > 2 else 'p_turing,p_neumann').split(',')  # 部屋をつくる人,入る人 のデッキ
    print('decks:', DECKS)
    click(host, f'[data-pick="me"][data-id="{DECKS[0]}"]'); click(guest, f'[data-pick="me"][data-id="{DECKS[1]}"]')
    click(host, '[data-vs="online"]'); click(guest, '[data-vs="online"]')
    host.screenshot(path=str(OUT / 'p_lobby.png'))
    t0 = time.time()
    click(host, '[data-net="create"]')
    host.wait_for_selector('.code-out', timeout=15000)
    invite = host.eval_on_selector('.code-out', 'e => e.value')
    print(f'invite code: {len(invite)} chars ({time.time() - t0:.1f}s)')
    host.screenshot(path=str(OUT / 'p_offer.png'))
    guest.fill('#p2pInvite', invite); click(guest, '[data-net="join"]')
    guest.wait_for_selector('.code-out', timeout=15000)
    answer = guest.eval_on_selector('.code-out', 'e => e.value')
    print(f'answer code: {len(answer)} chars')
    guest.screenshot(path=str(OUT / 'p_answer.png'))
    # まちがって招待コードを貼ったとき
    host.fill('#p2pAnswer', invite); click(host, '[data-net="connect"]'); host.wait_for_timeout(300)
    print('wrong paste:', host.inner_text('.msg.err') if vis(host, '.msg.err') else None)
    host.fill('#p2pAnswer', answer); click(host, '[data-net="connect"]')
    try:
        host.wait_for_selector('#actbar [data-act="ready"]', timeout=30000)
    except Exception:
        diag = "({ stage: P2P.stage, role: P2P.role, conn: P2P.connected, err: P2P.err, pc: P2P.pc && P2P.pc.connectionState, ice: P2P.pc && P2P.pc.iceConnectionState, dc: P2P.dc && P2P.dc.readyState, me: P2P.meAgain, opp: P2P.oppAgain, screen: UI.screen })"
        print('CONNECT FAILED host', host.evaluate(diag)); print('CONNECT FAILED guest', guest.evaluate(diag))
        raise
    print(f'connected and game started ({time.time() - t0:.1f}s from create)')
    host.evaluate('UI.fast = true'); guest.evaluate('UI.fast = true')
    turns = play_game(host, guest)
    host.wait_for_timeout(800)
    hs, gs = state(host), state(guest)
    print('game1 host ', hs); print('game1 guest', gs)
    print('game1 same:', hs['h'] == gs['h'] and hs['w'] == gs['w'], 'turns', turns, '| dropped moves:', host.evaluate('window.__dropped || 0'), guest.evaluate('window.__dropped || 0'))
    # 新しいしくみ（フィールド・ベンチで働く特性など）が、2人の画面で同じ回数おきたか
    KEYS = ['フィールド「', 'TRONハウス：', '環境発電で', '組込みOS+', 'センサーが見張って', '」！ ', '実体がない', '「分身」', '落合陽一+20', '「空中プラズマ」', '「カーム・テクノロジー」', '「ICタグ」', '「マーク・ワイザー」']
    cnt = lambda pg: pg.evaluate("keys => keys.map(k => UI.g.log.filter(l => String(l.msg || l).includes(k)).length)", KEYS)
    ch, cg = cnt(host), cnt(guest)
    print('events', {k: v for k, v, w in zip(KEYS, ch, cg) if v or w}, 'same:', ch == cg)
    host.screenshot(path=str(OUT / 'p_result.png'))
    # 再戦（コードの交換なし）
    click(guest, '#result [data-r="again2"]'); guest.wait_for_timeout(300)
    print('guest button:', guest.inner_text('#result [data-r="again2"]'))
    click(host, '#result [data-r="again2"]')
    host.wait_for_selector('#actbar [data-act="ready"]', timeout=15000)
    print('rematch started:', host.evaluate('NET.gid') == guest.evaluate('NET.gid'))
    play_game(host, guest, limit=120, max_turns=6)
    hs, gs = state(host), state(guest)
    print('game2 midway same turn:', hs['turn'] == gs['turn'], hs['turn'])
    # 切断
    guest.close()
    host.wait_for_selector('#result:not([hidden])', timeout=30000)
    print('after disconnect:', host.inner_text('.res-sub'), '| btn:', host.inner_text('#result [data-r="again2"]'))
    b.close()
print('errors:', errors[:8])
