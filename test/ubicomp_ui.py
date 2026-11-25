"""「遍在する計算機」シリーズを画面で確かめる：パック・図鑑・対戦（フィールド・ベンチで働くユニット・カーム・テクノロジー・落合陽一）"""
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
    check('遍在する計算機' in page.inner_text('.screen:not([hidden])'), 'タイトルに新シリーズの知らせ')
    page.screenshot(path=str(OUT / 'u_title.png'))
    click(page, '.screen:not([hidden]) [data-nav="packs"]'); page.wait_for_timeout(300)
    heads = page.evaluate("[...document.querySelectorAll('.screen:not([hidden]) section.series')].map(s => s.querySelector('.ser-h').innerText)")
    check(heads and '遍在する計算機' in heads[0], f'新シリーズがいちばん上 {heads}')
    check(all(page.query_selector(f'.pack-btn[data-open="{k}"] .pk-new') for k in ['weiser', 'tron', 'ochiai']), '3つのパックに NEW')
    check(page.query_selector('.pack-btn[data-open="ada"] .pk-new') is None, 'エイダのパックの NEW は消えた')
    page.screenshot(path=str(OUT / 'u_packs.png'))
    page.screenshot(path=str(OUT / 'u_packs_full.png'), full_page=True)
    # 3つのパックを1回ずつ（中身を決めておく）
    page.evaluate("""(() => { const P = { weiser: ['tab', 'pad', 'board', 'ubiq', 'weiser'], tron: ['embedded', 'iot', 'ictag', 'tronhouse', 'tronex'], ochiai: ['levitation', 'hologram', 'twin', 'null2', 'ochiai'] };
      rollPack = pk => P[pk.id].map((id, i) => ({ id, holo: i === 4, god: false })); return 1; })()""")
    for k in ['weiser', 'tron', 'ochiai']:
        click(page, f'.screen:not([hidden]) .btn[data-open="{k}"]'); page.wait_for_timeout(300)
        if k == 'ochiai': page.screenshot(path=str(OUT / 'u_open_ochiai.png'))
        click(page, '#packov .po-pack'); page.wait_for_timeout(900)
        click(page, '#packov [data-po="all"]'); page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / f'u_open_{k}_done.png'))
        click(page, '#packov [data-po="close"]'); page.wait_for_timeout(300)
    check(page.evaluate("STORE.holo.weiser === 1 && STORE.holo.tronex === 1 && STORE.holo.ochiai === 1"), '3つの目玉カードのホロが入った')
    click(page, '.screen:not([hidden]) [data-nav="title"]'); click(page, '.screen:not([hidden]) [data-nav="dex"]'); page.wait_for_timeout(300)
    click(page, '.screen:not([hidden]) [data-df="ubicomp"]'); page.wait_for_timeout(300)
    n = page.evaluate("document.querySelectorAll('.screen:not([hidden]) [data-info]').length")
    check(n == 22, f'シリーズのカードは22種 ({n})')
    page.screenshot(path=str(OUT / 'u_dex.png'), full_page=True)
    for cid, word in [('tronhouse', 'フィールド'), ('ochiai', 'デジタルネイチャー'), ('null2', '鏡')]:
        click(page, f'.screen:not([hidden]) [data-info="{cid}"]'); page.wait_for_timeout(400)
        check(word in page.inner_text('body'), f'{cid} の説明に「{word}」')
        page.screenshot(path=str(OUT / f'u_card_{cid}.png'))
        page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # 対戦：どこでもコンピュータ vs アルゴリズム研究室
    page.goto('about:blank'); page.goto(URL + '#select'); page.wait_for_timeout(800)
    check(all(page.query_selector(f'[data-pick="me"][data-id="{d}"]') for d in ['p_weiser', 'p_tron', 'p_ochiai']), 'デッキ選択に新しい3つのデッキ')
    click(page, '[data-pick="me"][data-id="p_tron"]'); click(page, '[data-pick="opp"][data-id="p_algo"]')
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
      cpu.active = mk('cpu'); cpu.bench = [mk('transistor'), mk('sensor')];
      me.active = mk('pc'); me.active.energy = ['hw', 'hw']; me.bench = [mk('tronex'), mk('board')]; me.bench[1].dmg = 30;
      cpu.points = 0; me.points = 0; renderBattle(); return 1; })()""")
    # フィールド「TRONハウス」を出す → 帯に出る → タップで説明
    [fc] = give(page, 0, ['tronhouse'])
    page.evaluate('renderBattle()')
    page.click(f'#hand .hbtn[data-uid="{fc}"]', force=True)
    page.wait_for_selector('#handact [data-act="detail"]', timeout=3000)
    page.click('#handact [data-act="detail"]', force=True)  # 吹き出しの「くわしく」から説明のシートへ
    page.wait_for_selector('#sheet .btn', timeout=3000)
    page.screenshot(path=str(OUT / 'u_field_sheet.png'))
    page.click('#sheet .sheet-btns .btn.gold', force=True); page.wait_for_timeout(500)
    check(page.query_selector('.mid [data-act="field"]') is not None, 'フィールドが画面の帯に出た')
    page.screenshot(path=str(OUT / 'u_field.png'))
    page.click('.mid [data-act="field"]', force=True); page.wait_for_timeout(400)
    check('TRONハウス' in page.inner_text('body'), 'フィールドをタップすると説明が出る')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # ベンチのTRONで +10、相手のベンチのセンサーが見張る
    rows = attack_sheet(page)
    calm_cpu(page)
    page.click('#sheet .btn.atk >> nth=0', force=True)
    for _ in range(50):
        if log_has(page, 'センサーが見張っていた'): break
        page.wait_for_timeout(100)
    check(log_has(page, '組込みOS+10'), 'ベンチのTRONで +10')
    check(log_has(page, 'センサーが見張っていた'), '相手のベンチのセンサーが反撃')
    page.screenshot(path=str(OUT / 'u_attack.png'))
    check(wait_my_turn(page) is True, 'もう一度、自分の番')
    check(page.evaluate("UI.g.log.some(l => String(l.msg || l).includes('TRONハウス：ベンチのユニット'))"), 'TRONハウスでベンチが回復した')
    # カーム・テクノロジー：ただで入れかえて1枚引く
    page.evaluate("UI.g.players[1].points = 0; UI.g.players[0].t.supporterDone = false; 1")
    [cm] = give(page, 0, ['calm'])
    page.evaluate('renderBattle()')
    hand_before = page.evaluate('UI.g.players[0].hand.length')
    page.click(f'#hand .hbtn[data-uid="{cm}"]', force=True)
    page.wait_for_selector('#handact [data-act="play"]', timeout=3000)
    page.click('#handact [data-act="play"]', force=True)
    page.wait_for_selector('#choice:not([hidden]) .copt', timeout=4000)
    page.screenshot(path=str(OUT / 'u_calm.png'))
    labels = page.evaluate("[...document.querySelectorAll('#choice .copt')].map(b => b.innerText)")
    idx = next(i for i, l in enumerate(labels) if 'ボード' in l)
    page.click(f'#choice .copt >> nth={idx}', force=True); page.wait_for_timeout(400)
    check(page.evaluate("UI.g.players[0].active.id === 'board'"), 'カーム・テクノロジー：ボードがバトル場へ')
    check(page.evaluate(f"UI.g.players[0].hand.length === {hand_before}"), 'カーム・テクノロジー：1枚引いた（使った1枚と同じ数）')
    ctx.close(); b.close()
print('errors:', errors[:8])
print('fails:', len(fails))
