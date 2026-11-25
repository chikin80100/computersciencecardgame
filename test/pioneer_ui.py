"""「プログラミングの先駆者」シリーズを画面で確かめる：パック・図鑑・対戦（ノートG・詩的科学・ナノ秒の針金・マークI・COBOL）"""
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
    click(page, '#board .f-me .aslot .mslot')
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
    click(page, '.screen:not([hidden]) [data-nav="packs"]'); page.wait_for_timeout(300)
    heads = page.evaluate("[...document.querySelectorAll('.screen:not([hidden]) section.series')].map(s => s.querySelector('.ser-h').innerText)")
    check(any('プログラミングの先駆者' in h for h in heads), f'パックの画面にシリーズがある {heads}')
    check(page.query_selector('.pack-btn[data-open="ada"]') and page.query_selector('.pack-btn[data-open="hopper"]'), 'エイダとホッパーのパックがある')
    # NEW の札は、いちばん新しいシリーズだけ（ubicomp_ui.py で確かめる）
    page.screenshot(path=str(OUT / 'p_packs.png'))
    page.screenshot(path=str(OUT / 'p_packs_full.png'), full_page=True)
    # エイダのパック（中身を決めておく）
    page.evaluate("""(() => { rollPack = pk => pk.id === 'ada' ? [{ id: 'loop', holo: false, god: false }, { id: 'compose', holo: false, god: false }, { id: 'nestloop', holo: false, god: false },
      { id: 'poetical', holo: false, god: false }, { id: 'ada', holo: true, god: false }] : [{ id: 'machinecode', holo: false, god: false }, { id: 'moth', holo: false, god: false },
      { id: 'flowmatic', holo: false, god: false }, { id: 'cobol', holo: false, god: false }, { id: 'hopper', holo: true, god: false }]; return 1; })()""")
    click(page, '.screen:not([hidden]) .btn[data-open="ada"]'); page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'p_open_ada.png'))
    click(page, '#packov .po-pack'); page.wait_for_timeout(900)
    click(page, '#packov [data-po="all"]'); page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'p_open_ada_done.png'))
    click(page, '#packov [data-po-info="ada"]'); page.wait_for_timeout(400)
    check('プログラミングの先駆者' in page.inner_text('body'), 'カードの説明にシリーズ名')
    page.screenshot(path=str(OUT / 'p_card_ada.png'))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    click(page, '#packov [data-po="close"]'); page.wait_for_timeout(300)
    click(page, '.screen:not([hidden]) .btn[data-open="hopper"]'); page.wait_for_timeout(300)
    click(page, '#packov .po-pack'); page.wait_for_timeout(900)
    click(page, '#packov [data-po="all"]'); page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'p_open_hopper_done.png'))
    check(page.evaluate("STORE.holo.ada === 1 && STORE.holo.hopper === 1"), 'エイダとホッパーのホロが入った')
    click(page, '#packov [data-po="dex"]'); page.wait_for_timeout(300)
    check(page.query_selector('.screen:not([hidden]) [data-df="pioneer"]') is not None, '図鑑に「プログラミングの先駆者」の絞り込み')
    click(page, '.screen:not([hidden]) [data-df="pioneer"]'); page.wait_for_timeout(300)
    n = page.evaluate("document.querySelectorAll('.screen:not([hidden]) [data-info]').length")
    check(n == 16, f'シリーズのカードは16種 ({n})')
    page.screenshot(path=str(OUT / 'p_dex.png'), full_page=True)
    click(page, '.screen:not([hidden]) [data-info="cobol"]'); page.wait_for_timeout(400)
    check('レガシー' in page.inner_text('body'), 'COBOLの特性が見える')
    page.screenshot(path=str(OUT / 'p_card_cobol.png'))
    page.keyboard.press('Escape')

    # 対戦：エイダのノート vs アルゴリズム研究室
    page.goto('about:blank'); page.goto(URL + '#select'); page.wait_for_timeout(800)
    check(page.query_selector('[data-pick="me"][data-id="p_ada"]') and page.query_selector('[data-pick="me"][data-id="p_hopper"]'), 'デッキ選択に新しい2つのデッキ')
    click(page, '[data-pick="me"][data-id="p_ada"]'); click(page, '[data-pick="opp"][data-id="p_algo"]')
    click(page, '#startBtn'); page.evaluate('UI.fast = true')
    page.wait_for_selector('#actbar [data-act="ready"]', timeout=15000); page.wait_for_timeout(200)
    for _ in range(3):
        h = page.query_selector('#hand .hbtn.ok')
        if not h: break
        h.click(force=True); page.wait_for_timeout(80)
    click(page, '#actbar [data-act="ready"]')
    check(wait_my_turn(page) is True, '自分の番になった')
    page.evaluate("""(() => { const g = UI.g, me = g.players[0], cpu = g.players[1];
      const mk = id => mkMon({ uid: nextUid(), id }, g.turn - 2);
      cpu.active = mk('cpu'); if (!cpu.bench.length) cpu.bench.push(mk('transistor'));
      me.bench = [mk('loop')]; cpu.points = 0; me.points = 0; renderBattle(); return 1; })()""")
    # 詩的科学：色のちがうエネルギーで「ベルヌーイ数」
    set_active(page, 0, 'noteg', ['hw', 'net', 'sec'])
    page.evaluate('window._ng = UI.g.players[0].active; 1')
    rows = attack_sheet(page)
    check(not rows[1][1], f'詩的科学の前はベルヌーイ数を使えない {rows[1]}')
    close_sheet(page)
    [pc] = give(page, 0, ['poetical'])
    page.evaluate('renderBattle()')
    page.click(f'#hand .hbtn[data-uid="{pc}"]', force=True)
    page.wait_for_selector('#handact [data-act="play"]', timeout=3000)
    page.click('#handact [data-act="play"]', force=True); page.wait_for_timeout(400)
    rows = attack_sheet(page)
    page.screenshot(path=str(OUT / 'p_poetical.png'))
    check(rows[1][1] and '詩的科学' in rows[1][2], f'詩的科学のあとは使える {rows[1]}')
    calm_cpu(page)
    page.click('#sheet .btn.atk >> nth=1', force=True)
    for _ in range(50):
        if page.evaluate('window._ng.loops === 1'): break
        page.wait_for_timeout(100)
    check(page.evaluate('window._ng.loops === 1'), 'ノートG：1回目を数えた')
    check(wait_my_turn(page) is True, 'もう一度、自分の番')
    # ナノ秒の針金：ベンチのループのエネルギーを、バトル場のノートGへ
    page.evaluate("""(() => { const me = UI.g.players[0]; UI.g.players[1].points = 0; window._ng.dmg = 0; window._ng.status = {};
      me.active = window._ng; window._ng.energy = ['algo', 'algo']; me.bench = [mkMon({ uid: nextUid(), id: 'loop' }, UI.g.turn - 2)]; me.bench[0].energy = ['algo'];
      renderBattle(); return 1; })()""")
    [ns] = give(page, 0, ['nanosec'])
    page.evaluate('renderBattle()')
    page.click(f'#hand .hbtn[data-uid="{ns}"]', force=True)
    page.wait_for_selector('#handact [data-act="play"]', timeout=3000)
    page.click('#handact [data-act="play"]', force=True)
    picked = []
    for want in ['ループ', 'ノートG']:
        page.wait_for_selector('#choice:not([hidden]) .copt', timeout=4000)
        page.screenshot(path=str(OUT / f'p_nanosec_{len(picked)}.png'))
        labels = page.evaluate("[...document.querySelectorAll('#choice .copt')].map(b => b.innerText)")
        idx = next(i for i, l in enumerate(labels) if want in l)
        page.click(f'#choice .copt >> nth={idx}', force=True); page.wait_for_timeout(300)
        picked.append(want)
    check(page.evaluate('window._ng.energy.length === 3'), 'ナノ秒の針金：ノートGのエネルギーが3個に')
    rows = attack_sheet(page)
    check(rows[1][1], f'エネルギー3個でベルヌーイ数が使える {rows[1]}')
    calm_cpu(page)
    page.click('#sheet .btn.atk >> nth=1', force=True)
    for _ in range(40):
        if page.evaluate('window._ng.loops === 2'): break
        page.wait_for_timeout(100)
    check(page.evaluate("UI.g.log.some(l => String(l.msg || l).includes('80ダメージ'))"), 'ノートG：2回目は80ダメージ')
    page.screenshot(path=str(OUT / 'p_noteg2.png'))
    check(wait_my_turn(page) is True, 'もう一度、自分の番（マークI）')
    # ハーバード・マークI：大きな一撃のあと1回休み。相手はCOBOL（HP10で持ちこたえる）
    page.evaluate("""(() => { const g = UI.g, me = g.players[0], cpu = g.players[1]; cpu.points = 0;
      const m = mkMon({ uid: nextUid(), id: 'mark1' }, g.turn - 2); m.energy = ['hw', 'hw', 'hw']; me.active = m; window._m1 = m;
      const c = mkMon({ uid: nextUid(), id: 'cobol' }, g.turn - 2); c.dmg = 100; cpu.active = c; window._cb = c; renderBattle(); return 1; })()""")
    attack_sheet(page)
    calm_cpu(page)
    page.click('#sheet .btn.atk >> nth=1', force=True)
    for _ in range(40):
        if log_has(page, 'HP10で持ちこたえた'): break
        page.wait_for_timeout(100)
    page.screenshot(path=str(OUT / 'p_cobol.png'))
    check(log_has(page, '特性「レガシー」で、HP10で持ちこたえた'), 'COBOL：HP10で持ちこたえた')
    check(wait_my_turn(page) is True, 'もう一度、自分の番（休み）')
    page.evaluate('UI.g.players[1].points = 0; window._m1.dmg = 0; window._m1.status = {}; UI.g.players[0].active = window._m1; renderBattle(); 1')
    rows = attack_sheet(page)
    page.screenshot(path=str(OUT / 'p_mark1_rest.png'))
    check(not rows[1][1] and 'この番はワザを使えない' in rows[1][2], f'マークI：1回休み {rows[1]}')
    close_sheet(page)
    ctx.close(); b.close()
print('errors:', errors[:8])
print('fails:', len(fails))
