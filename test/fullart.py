"""★フルアート（カードの面ぜんたいに絵のパラレル）：開封・10連・図鑑・デッキ編集・カードの説明（絵の切りかえ）・セーブ

  python3 test/fullart.py
確率そのものは node test/odds.js（slot 4・5 の f: が ★フルアート）で見る。
"""
import pathlib, sys
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
fails, errs = [], []


def check(ok, msg):
    print(('OK  ' if ok else 'NG  ') + msg)
    if not ok:
        fails.append(msg)


# 5枚目を、そのパックのユニットの★フルアートにする（4枚目はふつうのまま）
FORCE = '''(() => { const orig = rollPack; window.__restore = () => { rollPack = orig; };
  rollPack = pack => { const r = orig(pack); const u = packPool(pack).filter(id => DEF[id].kind === 'mon');
    r.forEach(pl => { pl.holo = false; pl.full = false; pl.god = false; }); // ほかの枠は、ふつうのカードに固定（数がずれないように）
    r[4] = { id: u[0], holo: false, full: true, god: false }; return r; }; })()'''

with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page.on('pageerror', lambda e: errs.append(str(e)))
    route_fonts(page)
    # 古いセーブ（full がない）でも読める
    page.goto(URL)
    page.evaluate('''localStorage.setItem("cs-term-card-battle-v1", JSON.stringify({decks: [], coll: {hello: 1}, holo: {}, tickets: 30, points: 0, migrated: 1, bonus2: 1, lastDaily: todayStr()}))''')
    page.goto('about:blank'); page.goto(URL + '#packs'); page.wait_for_timeout(700)
    check(page.evaluate('JSON.stringify(STORE.full)') == '{}', '古いセーブには full がなくても、空で読める')
    page.evaluate('UI.fast = true')

    # 1. 1パック：5枚目が★フルアート
    page.evaluate(FORCE)
    fid = page.evaluate("packPool(PACKS.find(p => p.id === 'mind')).filter(id => DEF[id].kind === 'mon')[0]")
    page.click('.screen:not([hidden]) .btn[data-open="mind"]', force=True); page.wait_for_timeout(300)
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(900)
    for _ in range(12):  # 1枚ごとに「めくる」「次へ」。5枚目をめくったところで止める
        if page.evaluate('PACKFLOW && PACKFLOW.i === 4 && PACKFLOW.flipped'):
            break
        page.click('#packov .po-card', force=True); page.wait_for_timeout(350)
    page.wait_for_timeout(500)
    check(page.query_selector('#packov .po-card .thumb.full') is not None, '1枚ずつめくると、5枚目が★フルアートの絵')
    check('★フルアート' in page.inner_text('#packov .po-msg'), 'めくったとき「（★フルアート）」と出る')
    page.screenshot(path=str(OUT / 'fa_flip.png'))
    page.click('#packov [data-po="all"]', force=True); page.wait_for_timeout(300)
    check(len(page.query_selector_all('#packov .po-grid .thumb.full')) == 1, '開封のあとの一覧にも★フルアートが1枚')
    check(page.evaluate(f'STORE.full[{fid!r}]') == 1 and page.evaluate(f'STORE.coll[{fid!r}]') >= 1, f'セーブに★フルアートが入る（{fid}）')
    page.click('#packov [data-po="close"]', force=True); page.wait_for_timeout(200)

    # 2. 10連：★フルアートは先頭にまとまり、数が出る
    page.click('.screen:not([hidden]) [data-open10="mind"]', force=True); page.wait_for_timeout(300)
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(3000)
    first = page.query_selector('#packov .po-grid.multi .po-flip')
    check(first.query_selector('.thumb.full') is not None and first.inner_text().find('×10') >= 0, '10連：★フルアートは先頭に「×10」でまとまる')
    check('★フルアート 10' in page.inner_text('#packov .po-sum'), '10連：「★フルアート 10枚」と数える')
    check(page.evaluate(f'STORE.full[{fid!r}]') == 11, '10連のぶんもセーブに入る（11枚）')
    page.screenshot(path=str(OUT / 'fa_multi.png'))
    page.evaluate('__restore()')
    page.click('#packov [data-po="close"]', force=True); page.wait_for_timeout(200)

    # 3. 図鑑：お財布と、カードの絵
    page.evaluate(f'STORE.holo[{fid!r}] = 1; saveStore()')
    page.goto(URL + '#dex'); page.wait_for_timeout(500)
    wl = page.evaluate('''Array.from(document.querySelectorAll('.wallet .wl')).map(w => w.innerText.replace(/\\s+/g, ''))''')
    check('★フルアート1種' in wl, f'図鑑のお財布に「★フルアート 1種」 {wl}')
    check(page.query_selector(f'[data-info="{fid}"] .thumb.full') is not None, '図鑑では、持っていれば★フルアートの絵')
    page.screenshot(path=str(OUT / 'fa_dex.png'))

    # 4. カードの説明：★フルアート → ふつう → ☆ホロ → ★フルアート と切りかえ
    page.click(f'[data-info="{fid}"]', force=True); page.wait_for_timeout(300)
    check(page.query_selector('#sheet .card.full') is not None, '説明は★フルアートの絵で開く')
    page.screenshot(path=str(OUT / 'fa_info.png'), full_page=True)
    seen = []
    for _ in range(3):
        btn = page.query_selector('#sheet .sheet-btns .btn:has-text("絵を切りかえる")')
        if not btn:
            break
        btn.click(force=True); page.wait_for_timeout(250)
        seen.append('full' if page.query_selector('#sheet .card.full') else 'holo' if page.query_selector('#sheet .card.holo') else 'plain')
    check(seen == ['plain', 'holo', 'full'], f'「絵を切りかえる」で ふつう → ホロ → フルアート の順（{seen}）')
    page.click('#sheet [data-i="close"]', force=True)

    # 5. Safari でくずれないように、フルアートの部品には filter を使わない
    flt = page.evaluate('''Array.from(document.querySelectorAll('.thumb.full, .thumb.full *')).map(e => getComputedStyle(e).filter).filter(f => f && f !== 'none')''')
    check(not flt, f'フルアートの部品に filter がない {flt[:2]}')

    # 6. デッキ編集の一覧
    page.goto(URL + '#decks'); page.wait_for_timeout(300)
    page.click('[data-new="1"]', force=True); page.wait_for_timeout(300)
    check(page.query_selector(f'#scr-editor [data-info="{fid}"] .thumb.full') is not None, 'デッキ編集の一覧でも★フルアートの絵')

    # 7. アカウントの保存とのマージ：カードごとに多いほう
    m = page.evaluate('''(() => { const a = normalizeStore({ coll: {x: 1}, full: {a: 2, b: 1}, synced: 1, updatedAt: 1 });
      const r = normalizeStore({ coll: {x: 1}, full: {a: 1, c: 3}, updatedAt: 2 }); return mergeStore(a, r).full; })()''')
    check(m == {'a': 2, 'b': 1, 'c': 3}, f'マージ：★フルアートはカードごとに多いほう {m}')

    # 8. パソコンの画面
    pc = b.new_page(viewport={'width': 1280, 'height': 860})
    pc.on('pageerror', lambda e: errs.append(str(e)))
    route_fonts(pc)
    pc.goto(URL + '#dex'); pc.wait_for_timeout(500)
    pc.evaluate(f'STORE.full[{fid!r}] = 1; renderDex()'); pc.wait_for_timeout(200)
    pc.click(f'[data-info="{fid}"]', force=True); pc.wait_for_timeout(300)
    pc.screenshot(path=str(OUT / 'fa_info_pc.png'))
    b.close()

print('errors:', errs)
print('fails:', len(fails))
sys.exit(1 if fails or errs else 0)
