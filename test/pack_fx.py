"""パック開封で ex・★フルアートが出るときの演出：開ける前の光・破いたときの光のすじ・めくったときの文字・10連の告知

  python3 test/pack_fx.py
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


# 4枚目を ex、5枚目を ★フルアートにする（ほかはふつうのカードに固定）。kind='plain' なら全部ふつう
FORCE = '''kind => { const orig = window.__origRoll || rollPack; window.__origRoll = orig;
  rollPack = pack => { const r = orig(pack); r.forEach(pl => { pl.holo = false; pl.full = false; pl.god = false; if (DEF[pl.id].ex) pl.id = packPool(pack).find(id => !DEF[id].ex && DEF[id].kind === 'mon'); });
    const ex = packPool(pack).find(id => DEF[id].ex), u = packPool(pack).find(id => DEF[id].kind === 'mon' && !DEF[id].ex);
    if (kind === 'ex' || kind === 'both') r[3] = { id: ex, holo: false, full: false, god: false };
    if (kind === 'full' || kind === 'both') r[4] = { id: u, holo: false, full: true, god: false };
    return r; }; }'''
NOFILTER = '''Array.from(document.querySelectorAll('#packov *')).map(e => getComputedStyle(e).filter).filter(f => f && f !== 'none')'''


def page_with(b, **kw):
    pg = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, **kw)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    route_fonts(pg)
    pg.goto(URL + '#packs'); pg.wait_for_timeout(500)
    pg.evaluate('STORE.tickets = 40; renderPacks()')
    return pg


with sync_playwright() as p:
    b = launch(p)
    pg = page_with(b)

    # 1. 1パック（4枚目 ex・5枚目 ★フルアート）
    pg.evaluate(FORCE, 'both')
    pg.click('.screen:not([hidden]) .btn[data-open="logic"]', force=True); pg.wait_for_timeout(400)
    check(pg.query_selector('#packov .po-pack.fx-full') is not None, '開ける前：★フルアート入りのパックは虹色に光る')
    pg.screenshot(path=str(OUT / 'fx_pack.png'))
    pg.click('#packov .po-pack', force=True); pg.wait_for_timeout(350)
    check(pg.query_selector('#packov .po-burst.full') is not None, '破いたとき：虹色の光のすじが出る')
    pg.screenshot(path=str(OUT / 'fx_burst.png'))
    pg.wait_for_timeout(1000)
    for _ in range(12):  # 4枚目（ex）の番まで進める
        if pg.evaluate('PACKFLOW.i === 3 && !PACKFLOW.flipped'):
            break
        pg.click('#packov .po-card', force=True); pg.wait_for_timeout(250)
    check(pg.query_selector('#packov .po-card.sp-ex') is not None and '光っている' in pg.inner_text('#packov .po-msg'), 'ex の番：裏が金色に光り「光っている…！」')
    pg.screenshot(path=str(OUT / 'fx_ex_before.png'))
    pg.click('#packov .po-card', force=True); pg.wait_for_timeout(1100)
    check(pg.query_selector('#packov .po-stage.go .po-pop.ex') is not None, 'めくると「ex！」と光のすじ')
    pg.screenshot(path=str(OUT / 'fx_ex_after.png'))
    pg.click('#packov .po-card', force=True); pg.wait_for_timeout(500)
    check(pg.query_selector('#packov .po-card.sp-full') is not None, '★フルアートの番：裏が虹色に光る')
    pg.click('#packov .po-card', force=True); pg.wait_for_timeout(1100)
    check(pg.query_selector('#packov .po-stage.go .po-pop.full') is not None and pg.query_selector('#packov .po-card .thumb.full') is not None, 'めくると「★フルアート！」')
    pg.screenshot(path=str(OUT / 'fx_full_after.png'))
    flt = pg.evaluate(NOFILTER)
    check(not flt, f'演出に filter を使っていない {flt[:2]}')
    pg.click('#packov .po-card', force=True); pg.wait_for_timeout(300)
    pg.click('#packov [data-po="close"]', force=True); pg.wait_for_timeout(200)

    # 2. ふつうのパックでは、何も出ない
    pg.evaluate(FORCE, 'plain')
    pg.click('.screen:not([hidden]) .btn[data-open="logic"]', force=True); pg.wait_for_timeout(300)
    check(pg.query_selector('#packov .po-pack.fx-ex, #packov .po-pack.fx-full') is None, 'ふつうのパックは光らない')
    pg.click('#packov .po-pack', force=True); pg.wait_for_timeout(300)
    check(pg.query_selector('#packov .po-burst') is None, 'ふつうのパックでは、光のすじも出ない')
    pg.wait_for_timeout(700)
    check(pg.query_selector('#packov .po-stage.sp-ex, #packov .po-stage.sp-full') is None, 'ふつうのカードには、めくる演出がない')
    pg.click('#packov [data-po="all"]', force=True); pg.wait_for_timeout(200)
    pg.click('#packov [data-po="close"]', force=True); pg.wait_for_timeout(200)

    # 3. 10連：結果の前に告知。タップで結果へ
    pg.evaluate(FORCE, 'both')
    pg.click('.screen:not([hidden]) [data-open10="logic"]', force=True); pg.wait_for_timeout(300)
    pg.click('#packov .po-pack', force=True); pg.wait_for_timeout(1300)
    ci = pg.query_selector('#packov .po-cutin')
    check(ci is not None and '★フルアート' in ci.inner_text() and '×10' in ci.inner_text() and 'ex' in ci.inner_text(), f'10連：結果の前に「★フルアート ×10」「ex ×10」の告知 {ci and ci.inner_text()[:40]!r}')
    pg.screenshot(path=str(OUT / 'fx_cutin.png'))
    pg.click('#packov .po-cutin', force=True); pg.wait_for_timeout(2400)
    check(pg.query_selector('#packov .po-grid.multi') is not None, 'タップすると結果へ')
    check(pg.query_selector('#packov .po-flip.sp-full') is not None and pg.query_selector('#packov .po-flip.sp-ex') is not None, '結果でも、ex・★フルアートのまわりが光る')
    pg.screenshot(path=str(OUT / 'fx_multi.png'))
    pg.click('#packov [data-po="close"]', force=True); pg.wait_for_timeout(200)

    # 4. 告知は、待っていても結果へ進む（UI.fast で短く）
    pg.evaluate('UI.fast = true')
    pg.click('.screen:not([hidden]) [data-open10="logic"]', force=True); pg.wait_for_timeout(300)
    pg.click('#packov .po-pack', force=True); pg.wait_for_timeout(1200)
    check(pg.query_selector('#packov .po-cutin') is None and pg.query_selector('#packov .po-grid.multi') is not None, '告知は、待っていると自動で結果へ進む')
    pg.close()

    # 5. 動きを減らす設定：光のすじは出さず、文字は出す
    rm = page_with(b, reduced_motion='reduce')
    rm.evaluate(FORCE, 'full')
    rm.click('.screen:not([hidden]) [data-open10="logic"]', force=True); rm.wait_for_timeout(300)
    rm.click('#packov .po-pack', force=True); rm.wait_for_timeout(250)
    burst = rm.query_selector('#packov .po-burst')
    check(burst is None or not burst.is_visible(), '動きを減らす設定：光のすじは出さない')
    rm.wait_for_timeout(200)
    check(rm.query_selector('#packov .po-cutin') is not None and '★フルアート' in rm.inner_text('#packov'), '動きを減らす設定でも、告知の文字は出る')
    rm.screenshot(path=str(OUT / 'fx_reduced.png'))
    b.close()

print('errors:', errs)
print('fails:', len(fails))
sys.exit(1 if fails or errs else 0)
