"""アカウント保存（db）を、偽の window.claude でたしかめる"""
import pathlib, json, sys
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
URL = (pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html').as_uri()
FAKE = r"""
(() => {
  const KEY = '__fake_db__';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const store = load();
  window.__writes = [];
  const failNext = { n: 0 };
  window.__failNext = failNext;
  const db = Object.freeze({
    doc(path) {
      return {
        path,
        async get() { await new Promise(r => setTimeout(r, 120)); const v = load()[path]; return { id: path.split('/').pop(), exists: !!v, data: () => v ? JSON.parse(JSON.stringify(v)) : undefined, metadata: {} }; },
        async set(d) {
          await new Promise(r => setTimeout(r, 60));
          if (failNext.n > 0) { failNext.n--; const e = new Error('x'); e.code = 'unavailable'; throw e; }
          const all = load(); all[path] = JSON.parse(JSON.stringify(d)); localStorage.setItem(KEY, JSON.stringify(all)); window.__writes.push(d);
        },
      };
    },
  });
  const user = Object.freeze({ id: async () => 'u_test' });
  window.claude = { use: async name => (await new Promise(r => setTimeout(r, 50)), name === 'db' ? db : name === 'user' ? user : null) };
})();
"""
P = 'data/users/u_test/save'
ok = True
def check(cond, msg):
    global ok
    print(('OK  ' if cond else 'NG  ') + msg)
    ok = ok and cond
with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.add_init_script(FAKE)
    # 1) はじめての訪問：アカウントにデータなし → 今の状態を書く
    page.goto(URL + '#packs'); page.wait_for_timeout(900)
    st = page.evaluate('({where: SAVE.where, ready: SAVE.ready, t: STORE.tickets, writes: window.__writes.length})')
    check(st['where'] == 'cloud' and st['ready'] and st['t'] == 20 and st['writes'] == 1, f'first visit writes once {st}')
    check('アカウントに保存' in page.inner_text('#scr-packs'), 'pack screen says account save')
    # 2) パックを開ける → 少し待つと1回だけ書く
    page.click('.screen:not([hidden]) .btn[data-open="world"]', force=True); page.wait_for_timeout(200)
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(900)
    page.click('#packov [data-po="all"]', force=True); page.wait_for_timeout(1700)
    remote = page.evaluate(f'JSON.parse(localStorage.getItem("__fake_db__"))["{P}"]')
    check(remote['tickets'] == 19 and sum(remote['coll'].values()) == 5 and remote['points'] == 5, f'pack result synced t={remote["tickets"]} cards={sum(remote["coll"].values())}')
    check(page.evaluate('window.__writes.length') == 2, 'one write per change')
    # 3) 再読み込み：同じ内容なら書かない
    page.goto('about:blank'); page.goto(URL); page.wait_for_timeout(900)
    check(page.evaluate('window.__writes.length') == 0, 'reload with same data: no write')
    # 4) 別の端末（このブラウザの保存なし）で開く → アカウントの内容が入る
    page.evaluate('localStorage.removeItem("cs-term-card-battle-v1")')
    page.goto('about:blank'); page.goto(URL); page.wait_for_timeout(900)
    st = page.evaluate('({t: STORE.tickets, cards: Object.values(STORE.coll).reduce((a,b)=>a+b,0), p: STORE.points})')
    check(st == {'t': 19, 'cards': 5, 'p': 5}, f'new device loads account data {st}')
    # 5) 一時的な失敗のあとで、やり直して保存される
    page.evaluate('window.__failNext.n = 1')
    page.evaluate('STORE.points += 1; saveStore()'); page.wait_for_timeout(1500)
    r1 = page.evaluate(f'JSON.parse(localStorage.getItem("__fake_db__"))["{P}"].points')
    page.wait_for_timeout(5500)
    r2 = page.evaluate(f'JSON.parse(localStorage.getItem("__fake_db__"))["{P}"].points')
    check(r1 == 5 and r2 == 6, f'retry after unavailable ({r1} -> {r2})')
    # 6) 古い端末のデータと合わせる：カードは多いほう、数は新しいほう
    page.evaluate(f'''(() => {{ const all = JSON.parse(localStorage.getItem("__fake_db__")); const r = all["{P}"];
      r.coll.hello = 2; r.tickets = 3; r.updatedAt = Date.now() + 60000; localStorage.setItem("__fake_db__", JSON.stringify(all)); }})()''')
    page.goto('about:blank'); page.goto(URL); page.wait_for_timeout(900)
    st = page.evaluate('({t: STORE.tickets, h: STORE.coll.hello})')
    check(st == {'t': 3, 'h': 2}, f'merge newer remote {st}')
    # 7) 前の版のセーブ（チケット4枚）には、差の10枚を1回だけ配る
    page.evaluate('localStorage.clear()')
    page.evaluate('localStorage.setItem("cs-term-card-battle-v1", JSON.stringify({decks: [], coll: {hello: 1}, tickets: 4, points: 0, migrated: 1, lastDaily: "x"}))')
    page.goto('about:blank'); page.goto(URL); page.wait_for_timeout(900)
    t1 = page.evaluate('STORE.tickets')
    page.goto('about:blank'); page.goto(URL); page.wait_for_timeout(900)
    t2 = page.evaluate('STORE.tickets')
    check(t1 == 4 + 10 + 10 and t2 == t1, f'old save gets +10 once, plus daily +10 ({t1}, {t2})')
    check(not errs, f'no page errors {errs[:3]}')
    b.close()
sys.exit(0 if ok else 1)
