"""つなぐところだけを何回もくり返して、対戦がはじまらないことがあるかを調べる"""
import pathlib, sys, time
from playwright.sync_api import sync_playwright
from _env import launch, route_fonts
ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'dist' / 'index.html').as_uri()
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10
SPY = r"""
(() => {
  window.__log = [];
  const S = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (d) { window.__log.push('send ' + String(d).slice(0, 40) + ' state=' + this.readyState); return S.call(this, d); };
  const add = EventTarget.prototype.addEventListener;
  const desc = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, 'onmessage');
  Object.defineProperty(RTCDataChannel.prototype, 'onmessage', { set(fn) { desc.set.call(this, fn && (e => { window.__log.push('recv ' + String(e.data).slice(0, 40)); return fn(e); })); }, get() { return desc.get.call(this); } });
  const od = Object.getOwnPropertyDescriptor(RTCDataChannel.prototype, 'onopen');
  Object.defineProperty(RTCDataChannel.prototype, 'onopen', { set(fn) { od.set.call(this, fn && (e => { window.__log.push('open state=' + this.readyState); return fn(e); })); }, get() { return od.get.call(this); } });
})();
"""
ok = fail = 0
with sync_playwright() as p:
    b = launch(p, '--disable-features=WebRtcHideLocalIpsWithMdns')
    for i in range(N):
        ctx = b.new_context(viewport={'width': 390, 'height': 844})
        ctx.add_init_script(SPY)
        ctx.route('**/fonts.g*/**', lambda r: r.abort())
        host, guest = ctx.new_page(), ctx.new_page()
        errs = []
        for pg in (host, guest): pg.on('pageerror', lambda e: errs.append(str(e)))
        host.goto(URL + '#select'); guest.goto(URL + '#select'); host.wait_for_timeout(300)
        host.click('[data-vs="online"]', force=True); guest.click('[data-vs="online"]', force=True)
        host.click('[data-net="create"]', force=True); host.wait_for_selector('.code-out', timeout=15000)
        guest.fill('#p2pInvite', host.eval_on_selector('.code-out', 'e => e.value')); guest.click('[data-net="join"]', force=True)
        guest.wait_for_selector('.code-out', timeout=15000)
        host.fill('#p2pAnswer', guest.eval_on_selector('.code-out', 'e => e.value')); host.click('[data-net="connect"]', force=True)
        try:
            host.wait_for_selector('#actbar [data-act="ready"]', timeout=12000); guest.wait_for_selector('#actbar [data-act="ready"]', timeout=5000)
            ok += 1
        except Exception:
            fail += 1
            print(f'#{i} FAIL host log:', host.evaluate('window.__log')); print(f'#{i} FAIL guest log:', guest.evaluate('window.__log')); print('errs', errs)
        ctx.close()
    b.close()
print(f'ok {ok} / fail {fail}')
