"""はじめのチケットと「10連」（10パックまとめて開封）をたしかめる

  python3 test/multi_ui.py

- はじめての人はチケット REWARD.start 枚（30枚）。前の版のセーブの枚数は変わらない
- 10連：チケット10枚・パックポイント10パック分・カード50枚。結果は同じカードをまとめて ×枚数 で出る
- 「もう10パック」は、チケットが10枚より少ないと押せない
- スクリーンショットは test/shots/m_*.png
"""
import pathlib, sys
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
FLIP = 2600  # 結果のカードがぜんぶめくれるまで待つ時間（ms）

ok = True
def check(cond, msg):
    global ok
    print(('OK  ' if cond else 'NG  ') + msg)
    ok = ok and bool(cond)

STATE = '''JSON.parse(JSON.stringify({t: STORE.tickets, p: STORE.points, packs: STORE.stats.packs,
  cards: Object.values(STORE.coll).reduce((a, b) => a + b, 0), holo: Object.values(STORE.holo).reduce((a, b) => a + b, 0),
  kinds: ownedKinds()}))'''
# 結果の画面に出ているカードの枚数（×n をたす）と、NEW のしるしの数
SHOWN = '''(() => { const cells = [...document.querySelectorAll('#packov .po-flip')];
  return {cells: cells.length, total: cells.reduce((a, c) => a + (c.querySelector('.po-cnt') ? +c.querySelector('.po-cnt').textContent.slice(1) : 1), 0),
    news: cells.filter(c => c.querySelector('.t-badge.new')).length,
    sumNew: +document.querySelector('#packov .po-sum .newtxt b').textContent}; })()'''


def open10(page, pack, shot=None):
    page.click(f'.screen:not([hidden]) [data-open10="{pack}"]'); page.wait_for_timeout(300)
    check(page.is_visible('#packov .po-pack.many .po-x'), f'{pack}: 10パックの束と ×10 が出る')
    if shot: page.screenshot(path=str(OUT / f'{shot}_pack.png'))
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(900)
    if shot: page.screenshot(path=str(OUT / f'{shot}_flip.png'))  # めくっているところ
    page.wait_for_timeout(FLIP)
    if shot: page.screenshot(path=str(OUT / f'{shot}_done.png'))


with sync_playwright() as p:
    b = launch(p)
    errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
    route_fonts(page)

    # 1) はじめての人：チケット30枚。10連のボタンが押せる
    page.goto(URL + '#packs'); page.wait_for_timeout(900)
    st = page.evaluate(STATE)
    check(page.evaluate('REWARD.start') == 30 and st['t'] == 30, f'はじめのチケットは30枚 {st}')
    n_packs = page.evaluate('PACKS.length')
    check(len(page.query_selector_all('.screen:not([hidden]) [data-open10]:not([disabled])')) == n_packs, f'{n_packs}個のパックすべてに、押せる10連のボタン')
    check('10連' in page.inner_text('#scr-packs'), 'パックの画面に10連の説明')
    page.screenshot(path=str(OUT / 'm_packs.png'), full_page=True)

    # 2) 10連（ふつうのパック）
    open10(page, 'logic', 'm_logic')
    st = page.evaluate(STATE)
    check(st['t'] == 20 and st['p'] == 50 and st['packs'] == 10 and st['cards'] == 50, f'チケット-10・ポイント+50・カード50枚 {st}')
    sh = page.evaluate(SHOWN)
    check(sh['total'] == 50, f'結果の画面のカードは ×n をたして50枚 {sh}')
    # はじめての10連なので、持っているカード＝今回出たカード。（カード, ホロか）の組の数とマスの数が同じ
    pairs = page.evaluate('Object.keys(STORE.coll).reduce((a, id) => a + (STORE.coll[id] > (STORE.holo[id] || 0) ? 1 : 0) + (STORE.holo[id] ? 1 : 0), 0)')
    check(sh['cells'] == pairs, f'同じカードは1マスにまとまっている（{sh["cells"]}マス・{pairs}組・{st["kinds"]}種）')
    check(sh['news'] == st['kinds'] and sh['sumNew'] == st['kinds'], f'はじめて出たカードにだけ NEW（{sh["news"]}種・まとめ {sh["sumNew"]}種・所持 {st["kinds"]}種）')
    order = page.evaluate('''[...document.querySelectorAll('#packov .po-flip')].map(c => {
      const id = c.dataset.poInfo, h = c.querySelector('.thumb.holo') ? 1 : 0; return [h, rarityOf(DEF[id])]; })''')
    check(all((a[0], a[1]) >= (c[0], c[1]) for a, c in zip(order, order[1:])), 'ホロ → レア度の高い順にならぶ')
    vis_front = page.evaluate('''(() => { const c = document.querySelector('#packov .po-flip:last-child .po-front');
      return getComputedStyle(c).transform; })()''')
    check(vis_front in ('none', 'matrix(1, 0, 0, 1, 0, 0)', 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'), f'最後のカードまで表になった（{vis_front}）')
    btn_box = page.locator('#packov [data-po="again"]').bounding_box()
    check(btn_box and btn_box['y'] + btn_box['height'] <= 844, f'「もう10パック」がスクロールしなくても見える {btn_box}')
    page.evaluate("document.querySelector('#packov').scrollTo(0, 99999)"); page.wait_for_timeout(200)
    page.screenshot(path=str(OUT / 'm_logic_bottom.png'))
    page.evaluate("document.querySelector('#packov').scrollTo(0, 0)")
    # カードを押すと説明が出る
    first = page.evaluate("document.querySelector('#packov .po-flip').dataset.poInfo")
    page.click('#packov .po-flip'); page.wait_for_timeout(400)
    check(page.is_visible('#sheet') and page.evaluate('DEF[%r].name' % first) in page.inner_text('#sheet'), f'カードを押すと説明（{first}）')
    page.screenshot(path=str(OUT / 'm_info.png'))
    page.click('#sheet [data-i="close"]'); page.wait_for_timeout(300)

    # 3) もう10パック → チケット10枚 → もう一度 → 0枚。0枚なら押せない
    page.click('#packov [data-po="again"]'); page.wait_for_timeout(300)
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(900 + FLIP)
    st = page.evaluate(STATE)
    check(st['t'] == 10 and st['cards'] == 100 and st['packs'] == 20, f'もう10パック {st}')
    page.click('#packov [data-po="again"]'); page.wait_for_timeout(300)
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(900 + FLIP)
    st = page.evaluate(STATE)
    check(st['t'] == 0 and st['cards'] == 150 and st['p'] == 150, f'チケットを使いきった {st}')
    check(page.query_selector('#packov [data-po="again"]') is None and page.query_selector('#packov [data-po="again1"]') is None, 'チケット0枚では「もう10パック」「もう1パック」は出ない')
    check(page.query_selector('#packov [data-po="battle"]') is not None and 'チケットがなくなりました' in page.inner_text('#packov'), 'チケット0枚では「対戦する」と案内が出る')
    page.click('#packov [data-po="close"]'); page.wait_for_timeout(300)
    check(len(page.query_selector_all('.screen:not([hidden]) [data-open10]:not([disabled])')) == 0, 'チケット0枚では10連のボタンは押せない')

    # 4) チケット9枚：1パックは押せて、10連は押せない。むりに呼んでもチケットは減らない
    page.evaluate('STORE.tickets = 9; saveStore(); RENDER.packs()')
    check(len(page.query_selector_all('.screen:not([hidden]) [data-open]:not([disabled])')) > 0
          and len(page.query_selector_all('.screen:not([hidden]) [data-open10]:not([disabled])')) == 0, 'チケット9枚：1パックだけ押せる')
    page.evaluate("openPack('logic', MULTI_PACKS)"); page.wait_for_timeout(300)
    check(page.evaluate('STORE.tickets') == 9 and page.is_hidden('#packov'), '9枚で10連を呼んでも、何も起きない')
    # 1パックずつのほうは、今までどおり5枚を1枚ずつめくる
    page.click('.screen:not([hidden]) .btn[data-open="world"]'); page.wait_for_timeout(300)
    check(not page.is_visible('#packov .po-x'), '1パックのときは ×10 が出ない')
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(900)
    check(page.is_visible('#packov .po-card'), '1パックは1枚ずつめくる')
    page.click('#packov [data-po="all"]'); page.wait_for_timeout(300)
    check(len(page.query_selector_all('#packov .po-grid .tbtn')) == 5 and page.evaluate('STORE.tickets') == 8, '1パック：5枚・チケット-1')
    page.click('#packov [data-po="close"]'); page.wait_for_timeout(200)

    # 5) シリーズのパック（カードの種類が少ない）：同じカードが ×n でまとまる。ゴッドパックの表示
    page.evaluate('STORE.tickets = 10; saveStore(); RENDER.packs()')
    page.evaluate('''(() => { const orig = rollPack; let k = 0;
      window.__restore = () => { rollPack = orig; };
      rollPack = pack => { const r = orig(pack); if (k++ === 3) r.forEach(pl => { pl.god = true; }); return r; }; })()''')
    open10(page, 'weiser', 'm_weiser')
    page.evaluate('__restore()')
    sh = page.evaluate(SHOWN)
    check(sh['total'] == 50 and sh['cells'] < 50, f'シリーズのパック：50枚が{sh["cells"]}マスにまとまる')
    check('GOD PACK' in page.inner_text('#packov .po-title'), 'ゴッドパックが入っていたら GOD PACK と出る')
    page.click('#packov [data-po="dex"]'); page.wait_for_timeout(400)
    check(page.is_hidden('#packov') and page.evaluate('UI.screen') == 'dex', '「図鑑で見る」で図鑑へ')
    ctx.close()

    # 6) パソコンの広い画面
    ctx = b.new_context(viewport={'width': 1280, 'height': 860})
    page = ctx.new_page()
    page.on('pageerror', lambda e: errs.append(str(e)))
    route_fonts(page)
    page.goto(URL + '#packs'); page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / 'm_pc_packs.png'))
    open10(page, 'mind', 'm_pc')
    check(page.evaluate('STORE.tickets') == 20, 'パソコン：10連でチケット-10')

    # 6b) チケットが1〜9枚残ったとき：「もう1パック」と案内。下のボタンのうしろが、すけて見えない
    page.click('#packov [data-po="close"]'); page.wait_for_timeout(200)
    page.evaluate('STORE.tickets = 15; saveStore(); RENDER.packs()')
    open10(page, 'mind', 'm_pc_left5')
    check(page.query_selector('#packov [data-po="again"]') is None and page.query_selector('#packov [data-po="again1"]') is not None, 'のこり5枚：「もう10パック」ではなく「もう1パック」')
    check('チケットが10枚いります' in page.inner_text('#packov .po-note'), 'のこり5枚：10連にはチケットが10枚いる、と案内')
    bg = page.evaluate('''(() => { const b = document.querySelector('#packov .po-btns [data-po="dex"]'); return getComputedStyle(b).backgroundColor; })()''')
    check(bg not in ('rgba(0, 0, 0, 0)', 'transparent'), f'下のボタンに背景の色がある（{bg}）')
    page.click('#packov [data-po="again1"]'); page.wait_for_timeout(300)
    check(page.is_visible('#packov .po-pack') and not page.is_visible('#packov .po-x'), '「もう1パック」で、1パックの開封になる')
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(900)
    page.click('#packov [data-po="all"]'); page.wait_for_timeout(300)
    check(page.evaluate('STORE.tickets') == 4, '「もう1パック」でチケット-1')
    page.evaluate('STORE.tickets = 0; saveStore()'); page.evaluate('renderPackOverlay()'); page.wait_for_timeout(200)
    check(page.query_selector('#packov [data-po="battle"]') is not None, '1パックの結果でも、0枚なら「対戦する」')
    page.click('#packov [data-po="battle"]'); page.wait_for_timeout(300)
    check(page.is_hidden('#packov') and page.evaluate('UI.screen') == 'select', '「対戦する」で対戦の画面へ')

    # 7) 前の版のセーブ（チケット4枚・bonus2 あり）は、はじめの枚数が変わっても増えない
    page.evaluate('''localStorage.setItem("cs-term-card-battle-v1", JSON.stringify({decks: [], coll: {hello: 1}, tickets: 4, points: 0,
      migrated: 1, bonus2: 1, lastDaily: todayStr()}))''')
    page.goto('about:blank'); page.goto(URL + '#packs'); page.wait_for_timeout(900)
    check(page.evaluate('STORE.tickets') == 4, '前の版のセーブのチケットはそのまま（4枚）')
    ctx.close()

    # 8) 動きを減らす設定：アニメーションなしで、すぐ表が見える
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
    page = ctx.new_page()
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(URL + '#packs'); page.wait_for_timeout(900)
    page.click('.screen:not([hidden]) [data-open10="world"]'); page.wait_for_timeout(200)
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(400)
    back = page.evaluate('''(() => { const c = document.querySelector('#packov .po-flip:last-child .po-back');
      return getComputedStyle(c).transform; })()''')
    check(back.startswith('matrix3d(-1'), f'動きを減らす設定：すぐ表になる（裏 {back[:24]}…）')
    page.screenshot(path=str(OUT / 'm_reduced.png'))
    ctx.close()
    b.close()

check(not errs, f'ページのエラーなし {errs[:3]}')
sys.exit(0 if ok else 1)
