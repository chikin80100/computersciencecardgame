"""src/ の各ファイルを1枚のHTMLにまとめる

  python3 build.py

できるファイル（中身は同じ）
  dist/index.html … Claude のアーティファクトに公開する版・テストで開く版
  docs/index.html … GitHub Pages（main ブランチの /docs）で公開する版
どちらも同じHTML。Claude の中で開くとアカウント保存とClaudeのオンライン対戦、
ふつうのサイトで開くとブラウザ保存と WebRTC（コード交換）の対戦になる。
"""
from pathlib import Path

root = Path(__file__).parent
src = root / 'src'
JS_ORDER = ['data.js', 'engine.js', 'art.js', 'p2p.js', 'ui.js']  # この順につなげる（あとのファイルが前のファイルを使う）

html = (src / 'index.html').read_text(encoding='utf-8')
css = (src / 'style.css').read_text(encoding='utf-8')
js = '\n'.join((src / f).read_text(encoding='utf-8') for f in JS_ORDER)
assert '</script' not in js.lower(), 'JSの中に </script があると、HTMLがそこで切れてしまう'
assert html.count('/*STYLE*/') == 1 and html.count('/*SCRIPT*/') == 1
html = html.replace('/*STYLE*/', css, 1).replace('/*SCRIPT*/', js, 1)

for out in [root / 'dist' / 'index.html', root / 'docs' / 'index.html']:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8')
print('dist/index.html, docs/index.html', f'{len(html.encode("utf-8")) / 1024:.1f} KiB')
