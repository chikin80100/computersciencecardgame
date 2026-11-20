"""ゴッドパックとホロの見た目をたしかめる"""
import pathlib
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
OUT = ROOT / 'test' / 'shots'
OUT.mkdir(exist_ok=True)
errs = []
with sync_playwright() as p:
    b = launch(p)
    page = b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page.on('pageerror', lambda e: errs.append(str(e)))
    route_fonts(page)
    page.goto(URL + '#packs'); page.wait_for_timeout(900)
    page.evaluate("""(() => { rollPack = () => [
      {id:'quantum', holo:true, god:true}, {id:'diffusion', holo:false, god:true}, {id:'cnn', holo:true, god:true},
      {id:'hackathon', holo:false, god:true}, {id:'ups', holo:false, god:true}]; return 1; })()""")
    page.click('.screen:not([hidden]) .btn[data-open="mind"]', force=True); page.wait_for_timeout(300)
    page.click('#packov .po-pack', force=True); page.wait_for_timeout(1300)
    page.screenshot(path=str(OUT / 'r_back.png'))
    page.click('#packov .po-card', force=True); page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / 'r_front.png'))
    page.click('#packov [data-po="all"]', force=True); page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'r_done.png'))
    page.click('#packov [data-po-info="quantum"]', force=True); page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'r_info.png'))
    b.close()
print('errors', errs)
