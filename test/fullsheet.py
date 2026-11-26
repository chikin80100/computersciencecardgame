"""★フルアートの絵を一覧にして撮る（目で確かめる用）
  python3 test/fullsheet.py                 # ex と人物カード（1枚ずつ描いた絵）
  python3 test/fullsheet.py ids=bit,stack   # カードを指定
  python3 test/fullsheet.py types=1         # タイプごとの景色（各タイプのユニットを2枚ずつ）
  python3 test/fullsheet.py cards=1         # 小さいカードの形（名前・HP の文字つき）で
"""
import sys, pathlib
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
args = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
with sync_playwright() as p:
    b = launch(p)
    pg = b.new_page(viewport={'width': 1200, 'height': 900})
    route_fonts(pg)
    pg.goto(URL + '#dex'); pg.wait_for_timeout(500)
    if 'ids' in args:
        ids = args['ids'].split(',')
    elif args.get('types'):
        ids = pg.evaluate("TYPE_ORDER.flatMap(t => MONSTERS.filter(d => d.type === t && !d.ex && !FULL[d.id]).slice(0, 2).map(d => d.id))")
    else:
        ids = pg.evaluate("MONSTERS.filter(d => d.ex).map(d => d.id).concat(TRAINERS.filter(d => d.leg).map(d => d.id))")
    cards = bool(args.get('cards'))
    pg.evaluate('''([ids, cards]) => {
      document.body.innerHTML = '<div id="fs" style="display:grid;grid-template-columns:repeat(auto-fill,' + (cards ? 150 : 160) + 'px);gap:10px;padding:10px;background:#0e3a2b"></div>';
      const fs = document.getElementById('fs');
      for (const id of ids) {
        const el = document.createElement('div');
        el.innerHTML = cards ? thumbHTML(id, { full: true }) : '<img src="' + fullURL(id) + '" style="width:160px;image-rendering:pixelated;display:block"><p style="margin:2px 0;color:#fff;font:12px sans-serif">' + id + (FULL[id] ? ' ★' : '') + '</p>';
        fs.appendChild(el);
      }
    }''', [ids, cards])
    pg.wait_for_timeout(300)
    name = args.get('out', 'fullsheet')
    pg.locator('#fs').screenshot(path=str(OUT / f'{name}.png'))
    print('wrote', OUT / f'{name}.png', len(ids), 'cards')
    b.close()
