"""テストの共通部分：ブラウザの起動と、フォントの読み込み。

- CHROME_PATH を指定すると、そのChromeを使う（なければPlaywright付属のChromium）
- FONTS_DIR に @fontsource のフォント（fontsource-dotgothic16-*, fontsource-m-plus-1-code-*）を置くと、
  本番と同じフォントでスクリーンショットをとれる（なければ、ネットから読むか、代わりのフォントになる）
"""
import os, re, glob, pathlib

CHROME = os.environ.get('CHROME_PATH')
FONTS = pathlib.Path(os.environ.get('FONTS_DIR', '/tmp/fonts'))


def launch(p, *extra):
    kw = {'args': ['--no-sandbox', *extra]}
    if CHROME:
        kw['executable_path'] = CHROME
    return p.chromium.launch(**kw)


def _font_css():
    css = []
    for pkg, files in [('dotgothic16', ['400.css']), ('m-plus-1-code', ['400.css', '700.css'])]:
        hits = glob.glob(str(FONTS / f'fontsource-{pkg}-*'))
        if not hits:
            return None
        d = pathlib.Path(hits[0])
        for f in files:
            css.append(re.sub(r'url\(\./files/([^)]+)\)', lambda m: f'url(https://fonts.gstatic.com/fs/{d.name}/{m.group(1)})', (d / f).read_text()))
    return '\n'.join(css)


FONT_CSS = _font_css()


def route_fonts(target):
    """Google Fonts のかわりに、FONTS_DIR のフォントを返す（FONTS_DIR がなければ何もしない）"""
    if not FONT_CSS:
        return

    def serve(route):
        m = re.search(r'/fs/([^/]+)/(.+)$', route.request.url)
        path = FONTS / m.group(1) / 'files' / m.group(2) if m else None
        if not path or not path.exists():
            return route.abort()
        route.fulfill(status=200, body=path.read_bytes(), headers={'content-type': 'font/woff2', 'access-control-allow-origin': '*'})

    target.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body=FONT_CSS, headers={'content-type': 'text/css'}))
    target.route('**/fonts.gstatic.com/**', serve)
