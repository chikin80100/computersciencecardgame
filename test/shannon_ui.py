"""「クロード・シャノン」パックを画面で確かめる：パック・図鑑・対戦（1回だけのワザ・データ圧縮・究極の機械）"""
import pathlib, time
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
errors, fails = [], []
def check(cond, msg):
    print(('OK  ' if cond else 'NG  ') + msg)
    if not cond: fails.append(msg)
def vis(page, sel):
    el = page.query_selector(sel); return el is not None and el.is_visible()
def click(page, sel):
    el = page.query_selector(sel)
    if el: el.click(force=True); return True
    return False
def my_turn(page):
    return page.query_selector('#actbar [data-act="end"]') is not None and not vis(page, '#coin') and not vis(page, '#choice')
def wait_my_turn(page, limit=90):
    t0 = time.time()
    while time.time() - t0 < limit:
        if vis(page, '#result'): return False
        if vis(page, '#choice'):
            page.click('#choice .copt', force=True); page.wait_for_timeout(200); continue
        if my_turn(page): return True
        page.wait_for_timeout(100)
    return False
def attack_sheet(page):
    """バトル場のユニットのワザの一覧を開いて、[(ワザの文字, 使えるか, 下の注意書き)] を返す"""
    click(page, '#actbar [data-act="attackmenu"]')
    page.wait_for_selector('#sheet .btn.atk', timeout=3000)
    return page.evaluate("""[...document.querySelectorAll('#sheet .btn.atk')].map(b => [b.querySelector('.ab').innerText.replace(/\\s+/g, ' '), !b.disabled, (b.querySelector('.why') || {}).innerText || ''])""")
def close_sheet(page):
    click(page, '#sheet [data-i="close"]'); page.wait_for_timeout(150)
    if vis(page, '#sheet'): page.keyboard.press('Escape'); page.wait_for_timeout(150)
def set_active(page, who, id, energy):
    page.evaluate(f"""(() => {{ const p = UI.g.players[{who}]; const m = mkMon({{ uid: nextUid(), id: {id!r} }}, UI.g.turn - 2);
      m.energy = {energy!r}; p.active = m; renderBattle(); return 1; }})()""")
def give(page, who, ids):
    return page.evaluate(f"""(() => {{ const p = UI.g.players[{who}]; return {ids!r}.map(id => {{ const c = {{ uid: nextUid(), id }}; p.hand.push(c); return c.uid; }}); }})()""")
def calm_cpu(page):
    """次の相手の番に、こちらの場を動かすカード（入れ替えなど）を使われないようにする"""
    page.evaluate("(() => { const c = UI.g.players[1]; c.hand = []; c.deck.unshift({ uid: nextUid(), id: 'transistor' }); return 1; })()")
def log_has(page, text):
    return page.evaluate(f"UI.g.log.some(l => String(l.msg || l).includes({text!r}))")

with sync_playwright() as p:
    b = launch(p)
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' and 'ERR_' not in m.text else None)
    route_fonts(page)
    page.goto(URL); page.wait_for_timeout(1000)
    page.screenshot(path=str(OUT / 's_title.png'))
    # パックの画面
    click(page, '.screen:not([hidden]) [data-nav="packs"]'); page.wait_for_timeout(300)
    check(page.query_selector('.pack-btn[data-open="shannon"]') is not None, 'シャノンのパックがある')
    page.locator('.pack-btn[data-open="shannon"]').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / 's_packs.png'))
    page.screenshot(path=str(OUT / 's_packs_full.png'), full_page=True)
    # シャノンのパックをひらく（中身を決めておく）
    page.evaluate("""(() => { rollPack = () => [{ id: 'bit', holo: false, god: false }, { id: 'parity', holo: false, god: false }, { id: 'relay', holo: false, god: false },
      { id: 'ldpc', holo: false, god: false }, { id: 'shannon', holo: true, god: false }]; return 1; })()""")
    click(page, '.screen:not([hidden]) .btn[data-open="shannon"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 's_open.png'))
    click(page, '#packov .po-pack'); page.wait_for_timeout(900)
    click(page, '#packov [data-po="all"]'); page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 's_open_done.png'))
    check(page.evaluate("STORE.coll.shannon >= 1 && STORE.holo.shannon === 1"), 'シャノンのホロがコレクションに入った')
    click(page, '#packov [data-po-info="shannon"]'); page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 's_card_shannon.png'))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    click(page, '#packov [data-po="dex"]'); page.wait_for_timeout(300)
    click(page, '.screen:not([hidden]) [data-df="father"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 's_dex.png'), full_page=True)
    click(page, '.screen:not([hidden]) [data-info="ldpc"]'); page.wait_for_timeout(400)
    check('特殊状態にならない' in page.inner_text('body'), 'LDPC符号の特性が見える')
    page.screenshot(path=str(OUT / 's_card_ldpc.png'))
    page.keyboard.press('Escape')

    # 対戦：情報理論研究室 vs アルゴリズム研究室
    page.goto('about:blank'); page.goto(URL + '#select'); page.wait_for_timeout(800)
    check(page.query_selector('[data-pick="me"][data-id="p_shannon"]') is not None, 'デッキ選択に「情報理論研究室」')
    click(page, '[data-pick="me"][data-id="p_shannon"]'); click(page, '[data-pick="opp"][data-id="p_algo"]')
    page.screenshot(path=str(OUT / 's_select.png'))
    click(page, '#startBtn'); page.evaluate('UI.fast = true')
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000); page.wait_for_timeout(200)
    for _ in range(3):
        h = page.query_selector('#hand .hbtn.ok')
        if not h: break
        h.click(force=True); page.wait_for_timeout(80)
    click(page, '#actbar [data-act="ready"]')
    check(wait_my_turn(page) is True, '自分の番になった')
    if True:
        # 対戦が終わらないように：相手のバトル場はHPの多い「CPU」（エネルギーなし）、両方のベンチに1体ずつ
        page.evaluate("""(() => { const g = UI.g, me = g.players[0], cpu = g.players[1];
          const mk = id => mkMon({ uid: nextUid(), id }, g.turn - 2);
          cpu.active = mk('cpu'); if (!cpu.bench.length) cpu.bench.push(mk('transistor'));
          if (!me.bench.length) me.bench.push(mk('bit'));
          cpu.points = 0; me.points = 0; renderBattle(); return 1; })()""")
        # ワンタイムパッド：1回目
        set_active(page, 0, 'otp', ['sec', 'sec'])
        page.evaluate('window._otp = UI.g.players[0].active; 1')  # 相手の番にダウンしても、同じユニットをもどせるように
        rows = attack_sheet(page)
        page.screenshot(path=str(OUT / 's_otp1.png'))
        check(len(rows) == 2 and rows[1][1], f'一度きりの鍵は使える {rows}')
        calm_cpu(page)
        page.click('#sheet .btn.atk >> nth=1', force=True)
        page.wait_for_timeout(800)
        check(log_has(page, '「一度きりの鍵」'), '一度きりの鍵を使った')
        check(wait_my_turn(page) is True, 'もう一度、自分の番')
        # テストを続けるため、相手のポイントを0にして、同じワンタイムパッドをバトル場にもどす
        page.evaluate('UI.g.players[1].points = 0; window._otp.dmg = 0; window._otp.status = {}; UI.g.players[0].active = window._otp; renderBattle(); 1')
        rows = attack_sheet(page)
        page.screenshot(path=str(OUT / 's_otp2.png'))
        check(not rows[1][1] and '1回だけ' in rows[1][2], f'2回目は使えない {rows[1]}')
        close_sheet(page)
        # データ圧縮：LDPC符号の「シャノン限界」（DDC）をエネルギー2個で
        set_active(page, 0, 'ldpc', ['data', 'data'])
        rows = attack_sheet(page)
        check(not rows[1][1], f'データ圧縮の前は使えない {rows[1]}')
        close_sheet(page)
        [cz] = give(page, 0, ['compress'])
        page.evaluate('renderBattle()')
        page.click(f'#hand .hbtn[data-uid="{cz}"]', force=True)
        page.wait_for_selector('#sheet .btn', timeout=3000)
        page.click('#sheet .sheet-btns .btn.gold', force=True); page.wait_for_timeout(400)
        rows = attack_sheet(page)
        page.screenshot(path=str(OUT / 's_compress.png'))
        check(rows[1][1] and 'データ圧縮' in rows[1][2], f'データ圧縮のあとは使える {rows[1]}')
        close_sheet(page)
        # 究極の機械：相手のバトル場につけて、ハミング符号で攻撃 → こちらがフリーズ
        page.evaluate("UI.g.players[1].active.tool = { uid: nextUid(), id: 'ultimate' }; UI.g.players[1].active.dmg = 0; 1")
        set_active(page, 0, 'hamming', ['data', 'data'])
        attack_sheet(page)
        calm_cpu(page)
        page.click('#sheet .btn.atk >> nth=0', force=True)
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / 's_ultimate.png'))
        check(log_has(page, '究極の機械が作動'), '究極の機械が作動した')
        check(page.evaluate('!!(UI.g.players[0].active && UI.g.players[0].active.status.freeze) || UI.g.players[0].active.id !== "hamming"'), 'ハミング符号がフリーズ')
        page.evaluate('window._ham = UI.g.players[0].active; 1')
        r = wait_my_turn(page)
        page.evaluate('UI.g.players[1].points = 0; window._ham.dmg = 0; UI.g.players[0].active = window._ham; renderBattle(); 1')
        if r is True:
            rows = attack_sheet(page)
            check(not rows[0][1] and 'フリーズ' in rows[0][2], f'次の番はフリーズでワザが使えない {rows[0]}')
            page.screenshot(path=str(OUT / 's_frozen.png'))
            close_sheet(page)
        # ビット：3ビット（2進数）
        set_active(page, 0, 'bit', ['data', 'hw'])
        page.evaluate('UI.g.players[1].active.dmg = 0; UI.g.players[1].active.tool = null; UI.g.players[0].active.status = {}; 1')
        attack_sheet(page)
        page.click('#sheet .btn.atk >> nth=0', force=True)
        for _ in range(50):
            if log_has(page, '2進数の'): break
            page.wait_for_timeout(100)
        page.screenshot(path=str(OUT / 's_bit.png'))
        check(log_has(page, '2進数の'), 'ビットの2進数がログに出た')
    ctx.close(); b.close()
print('errors:', errors[:8])
print('fails:', len(fails))
