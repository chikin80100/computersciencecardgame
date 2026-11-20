"""オンライン対戦：2つのページで部屋をつくって入り、最後まで遊んで、2人の盤面が同じかを確かめる"""
import pathlib, time, sys
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
FAKE = r"""
(() => {
  const qs = new URLSearchParams(location.search);
  const ME = qs.get('u') || 'u1', DROP = Number(qs.get('drop') || 0), LAG = Number(qs.get('lag') || 40);
  const DBK = '__fakedb2__';
  const load = () => { try { return JSON.parse(localStorage.getItem(DBK)) || {}; } catch (e) { return {}; } };
  const save = all => localStorage.setItem(DBK, JSON.stringify(all));
  const bc = new BroadcastChannel('fakedb2');
  const L = new Map();
  const notify = path => { const s = L.get(path); if (s) for (const f of s) f(); };
  bc.onmessage = e => notify(e.data.path);
  const snapOf = path => { const v = load()[path]; return { id: path.split('/').pop(), exists: !!v, data: () => (v ? JSON.parse(JSON.stringify(v)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } }; };
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const write = (path, fn) => { const all = load(); fn(all); save(all); notify(path); bc.postMessage({ path }); };
  const doc = path => ({
    id: path.split('/').pop(), path,
    async get() { await delay(20); return snapOf(path); },
    async set(d) { await delay(20); write(path, all => { all[path] = JSON.parse(JSON.stringify(d)); }); },
    async update(d) { await delay(20); if (!load()[path]) { const e = new Error('nf'); e.code = 'invalid_argument'; throw e; } write(path, all => { all[path] = Object.assign(all[path], JSON.parse(JSON.stringify(d))); }); },
    async delete() { await delay(20); write(path, all => { delete all[path]; }); },
    onSnapshot(next) { const f = () => setTimeout(() => next(snapOf(path)), LAG); if (!L.has(path)) L.set(path, new Set()); L.get(path).add(f); setTimeout(f, 5); return () => L.get(path).delete(f); },
  });
  const db = Object.freeze({ doc });
  const user = Object.freeze({ id: async () => ME, can: async () => true });
  const peer = Math.random().toString(36).slice(2);
  const room = Object.freeze({
    async join(name) {
      const ch = new BroadcastChannel('fakeroom-' + name);
      const H = {}, P = new Set(), others = new Map();
      let mine = {};
      const fire = () => { const peers = [...others.entries()].map(([p, pr]) => ({ peer: p, presence: pr, sameTab: false, isMe: false })); P.forEach(f => f({ peers, joined: [], left: [], updated: [] })); };
      ch.onmessage = e => {
        const d = e.data;
        if (d.kind === 'emit') { if (Math.random() < DROP) return; (H[d.topic] || []).forEach(h => h({ topic: d.topic, data: d.data, peer: d.peer, by: d.by, isMe: false, sameTab: false, kind: 'viewer', guest: false })); }
        if (d.kind === 'presence') { others.set(d.peer, d.presence); fire(); if (d.ask) ch.postMessage({ kind: 'presence', peer, presence: mine }); }
        if (d.kind === 'leave') { others.delete(d.peer); fire(); }
      };
      return {
        name,
        emit: async (topic, data) => { ch.postMessage({ kind: 'emit', topic, data, peer, by: ME }); },
        on: (topic, h) => { (H[topic] = H[topic] || []).push(h); return () => { H[topic] = H[topic].filter(x => x !== h); }; },
        presence: async patch => { mine = Object.assign({}, mine, patch); ch.postMessage({ kind: 'presence', peer, presence: mine, ask: true }); },
        peers: () => [], onPeers: f => { P.add(f); setTimeout(fire, 20); return () => P.delete(f); },
        connected: () => true, onConnection: () => () => {},
        leave: async () => { ch.postMessage({ kind: 'leave', peer }); ch.close(); },
      };
    },
  });
  window.claude = { use: async n => (n === 'db' ? db : n === 'user' ? user : n === 'room' && !qs.get('noroom') ? room : null) };
})();
"""
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
        page.wait_for_selector('#sheet .btn', timeout=3000)
        b = page.query_selector('#sheet .sheet-btns .btn.gold:not([disabled])')
        if not b: click(page, '#sheet [data-i="close"]'); break
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
    click(page, '#actbar [data-act="attackmenu"]')
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

DROP = sys.argv[1] if len(sys.argv) > 1 else '0.3'
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ''
with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(FAKE)
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    host, guest = ctx.new_page(), ctx.new_page()
    for name, pg in (('host', host), ('guest', guest)):
        pg.on('pageerror', lambda e, n=name: errors.append(f'{n} pageerror: {e}'))
        pg.on('console', lambda m, n=name: errors.append(f'{n} console: {m.text}') if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    host.goto(URL + '?u=alice&lag=60#select'); host.evaluate('localStorage.clear()'); host.goto('about:blank')
    host.goto(URL + '?u=alice&lag=60#select'); guest.goto(URL + f'?u=bob&lag=250&drop={DROP}{EXTRA}#select')
    host.wait_for_timeout(600)
    click(host, '[data-pick="me"][data-id="p_turing"]'); click(guest, '[data-pick="me"][data-id="p_neumann"]')
    click(host, '[data-vs="online"]'); click(guest, '[data-vs="online"]')
    host.wait_for_selector('[data-net="create"]', timeout=15000)
    host.screenshot(path=str(OUT / 'o_lobby.png'))
    click(host, '[data-net="create"]')
    host.wait_for_selector('.net-code', timeout=15000)
    code = host.inner_text('.net-code').strip()
    host.screenshot(path=str(OUT / 'o_wait.png'))
    print('code', code)
    guest.wait_for_selector('#netCode', timeout=15000)
    guest.fill('#netCode', code); click(guest, '[data-net="join"]')
    host.evaluate('UI.fast = true'); guest.evaluate('UI.fast = true')
    setup(guest); setup(host)
    t0, turns = time.time(), {'host': 0, 'guest': 0}
    shot = False
    while time.time() - t0 < 420:
        if vis(host, '#result') and vis(guest, '#result'): break
        handle(host); handle(guest)
        for name, pg, other in (('host', host, guest), ('guest', guest, host)):
            if my_turn(pg):
                pg.evaluate('UI.fast = true')
                turns[name] += 1
                if not shot and turns[name] == 3: pg.screenshot(path=str(OUT / f'o_battle_{name}.png')); shot = True
                play_turn(pg, other)
        host.wait_for_timeout(80)
    host.wait_for_timeout(800)
    host.screenshot(path=str(OUT / 'o_result_host.png')); guest.screenshot(path=str(OUT / 'o_result_guest.png'))
    hs = host.evaluate('UI.g ? { w: UI.g.winner, pts: UI.g.players.map(p => p.points), turn: UI.g.turn, h: stateHash(UI.g), desync: !!UI.g.desync, reason: UI.g.reason, t: STORE.tickets } : null')
    gs = guest.evaluate('UI.g ? { w: UI.g.winner, pts: UI.g.players.map(p => p.points), turn: UI.g.turn, h: stateHash(UI.g), desync: !!UI.g.desync, reason: UI.g.reason, t: STORE.tickets } : null')
    print('host ', hs); print('guest', gs)
    print('turns', turns, 'same result:', hs and gs and hs['w'] == gs['w'] and hs['pts'] == gs['pts'] and hs['h'] == gs['h'])
    print('moves sent', host.evaluate('NET.mine.length'), guest.evaluate('NET.mine.length'), '| room doc left:', host.evaluate("Object.keys(JSON.parse(localStorage.getItem('__fakedb2__'))).filter(k => k.startsWith('pvp/'))"))
    b.close()
print('errors:', errors[:8])
