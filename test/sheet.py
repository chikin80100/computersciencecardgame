"""カードの絵柄（src/art.js）を一覧にして、test/shots/sheet*.png に撮る

  python3 test/sheet.py                  … 全カード
  python3 test/sheet.py set=father big=1 … 「コンピュータの父」シリーズだけを大きく
  python3 test/sheet.py ids=enigma,alan  … 指定したカードだけ
"""
import pathlib, sys
from playwright.sync_api import sync_playwright
from _env import launch
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
query = '&'.join(sys.argv[1:])
with sync_playwright() as p:
    b = launch(p, '--allow-file-access-from-files')
    pg = b.new_page(viewport={'width': 1010, 'height': 800})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto((ROOT / 'test' / 'sheet.html').as_uri() + ('?' + query if query else ''))
    pg.wait_for_timeout(500)
    w = pg.evaluate('document.getElementById("g").scrollWidth')
    h = pg.evaluate('document.body.scrollHeight')
    for old in OUT.glob('sheet*.png'):
        old.unlink()
    # 1000pxごとに分けて撮る
    shots = []
    for i, y in enumerate(range(0, h, 1000)):
        pg.set_viewport_size({'width': max(w, 300), 'height': min(1000, h - y)})
        pg.evaluate(f'window.scrollTo(0,{y})')
        pg.wait_for_timeout(100)
        path = OUT / f'sheet{i}.png'
        pg.screenshot(path=str(path))
        shots.append(path.name)
    print('cards', pg.evaluate('document.querySelectorAll(".c").length'), 'shots', shots, 'errors', errs)
    b.close()
