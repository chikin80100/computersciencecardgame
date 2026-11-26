/* =========================================================
   オンライン対戦（Claude以外のサイトに置いたとき）
   WebRTC で2台を直接つなぐ。ログインはいらない。
   最初に接続情報（招待コード・参加コード）を1回ずつ交換する。交換のしかたは2つ：
   - あいことば：SIGNAL_URL の Cloudflare Worker（worker/）が、6けたの数字で10分だけ預かる
   - リンク交換：「招待リンク」と「参加リンク」（QRコードでも読める）を送り合う（Worker がないとき・届かないとき）
   つながったあとは、同じ相手と何回でも対戦できる。
   ========================================================= */
const P2P = {
  pc: null, dc: null, role: '', stage: 'idle', code: '', err: '', inInvite: '', inAnswer: '',
  connected: false, meAgain: false, oppAgain: false, oppDeck: null, timer: null, busy: false,
  round: 0, lastStart: null, tick: null, needAt: 0,
  link: '', handoff: '', handCode: '', fromLink: false,
  room: null, inRoom: '', viaRoom: false, sigNote: '',
};
/* あいことばを預かる Worker の URL（worker/README.md の手順でデプロイしたもの）。空なら、リンク交換だけ。
   テストでは window.CS_SIGNAL_URL で上書きできる */
const SIGNAL_URL = 'https://cs-card-signal.chikin80100.workers.dev';
const signalURL = () => String(window.CS_SIGNAL_URL !== undefined ? window.CS_SIGNAL_URL : SIGNAL_URL).replace(/\/+$/, '');
/* Worker を呼ぶ。本文は text/plain の JSON（ブラウザの事前確認を減らす）。8秒で打ち切り */
async function sig(path, method, body) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => { if (ctl) ctl.abort(); }, 8000);
  try {
    const r = await fetch(signalURL() + path, { method: method || 'GET', body: body ? JSON.stringify(body) : undefined, headers: body ? { 'Content-Type': 'text/plain' } : undefined, signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    let j = {};
    try { j = await r.json(); } catch (e) { /* 本文なし */ }
    return Object.assign({ status: r.status }, j);
  } finally { clearTimeout(t); }
}
const SIG_DOWN = 'あいことばのサーバーにつながりませんでした。かわりに、下の招待リンク（QRコード）で相手を呼んでください。';
/* チャンネルは両方の端末で同じ番号（id 0）を使ってつくる。片方だけでつくると、最初の通信が落ちることがある */
const DC_OPTS = { negotiated: true, id: 0, ordered: true };
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
/* Claudeの中で開いているときは Claude の共有のしくみ、それ以外は WebRTC を使う */
const TRANSPORT = () => (window.claude && typeof window.claude.use === 'function' ? 'claude' : 'p2p');
const hasRTC = () => typeof RTCPeerConnection === 'function';

/* ---------- コード（接続情報を、送りやすい1行の文字列にする） ----------
   CS2：SDP から、つなぐのに本当に要るものだけを取り出してバイト列につめる（100文字くらい）。
        ICE のユーザー名とパスワード・証明書の指紋（sha-256）・役割（setup）・接続先の候補（UDPのみ）。
        受け取った側は、決まった形の SDP を組み立てなおす（データチャンネルだけの接続なので、ほかの行はいらない）。
   CS1Z / CS1：SDP をまるごと（圧縮して）入れる古い形。CS2 にできない SDP のときに使う。読むのは今も両方できる。 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const toB64url = bytes => { let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64url = t => { const b = t.replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), c => c.charCodeAt(0)); };
const SETUPS = ['actpass', 'active', 'passive'];
const CTYPES = ['host', 'srflx', 'prflx', 'relay'];
const MDNS = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
function ip6Bytes(a) {
  if (!/^[0-9a-f:]+$/i.test(a) || a.split('::').length > 2) return null;
  const [l, r] = a.includes('::') ? a.split('::') : [a, null];
  const L = l ? l.split(':') : [], R = r ? r.split(':') : [];
  const fill = r === null ? 0 : 8 - L.length - R.length;
  if (fill < 0 || (r === null && L.length !== 8)) return null;
  const parts = L.concat(Array(fill).fill('0'), R);
  if (parts.some(x => !/^[0-9a-f]{1,4}$/i.test(x))) return null;
  return parts.flatMap(x => { const v = parseInt(x, 16); return [v >> 8, v & 255]; });
}
const ip6Text = b => Array.from({ length: 8 }, (_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(':');
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

/* ICE のユーザー名・パスワード（使える文字は B64 の64文字）を6ビットずつつめる */
function pushIce(out, t) {
  if (!t || t.length > 255 || [...t].some(ch => !B64.includes(ch))) return false;
  out.push(t.length);
  let acc = 0, n = 0;
  for (const ch of t) { acc = (acc << 6) | B64.indexOf(ch); n += 6; while (n >= 8) { n -= 8; out.push((acc >> n) & 255); } }
  if (n) out.push((acc << (8 - n)) & 255);
  return true;
}
function readIce(r) {
  const len = r.u8();
  let t = '', acc = 0, n = 0;
  while (t.length < len) { if (n < 6) { acc = ((acc & 0xffff) << 8) | r.u8(); n += 8; } n -= 6; t += B64[(acc >> n) & 63]; }
  return t;
}

/* SDP → バイト列。CS2 にできないときは null */
function compactSDP(desc) {
  const sdp = desc.sdp || '';
  const get = k => { const m = sdp.match(new RegExp('^a=' + k + ':(.+?)\\s*$', 'm')); return m ? m[1] : ''; };
  const ms = sdp.match(/^m=/gm) || [];
  if (ms.length !== 1 || !/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel/m.test(sdp)) return null;
  if (get('mid') !== '0' || !['', '5000'].includes(get('sctp-port'))) return null;
  const fp = get('fingerprint').match(/^sha-256 ((?:[0-9A-F]{2}:){31}[0-9A-F]{2})$/i);
  const setup = SETUPS.indexOf(get('setup'));
  if (!fp || setup < 0) return null;
  const out = [(desc.type === 'offer' ? 0 : 1) | (setup << 1)];
  if (!pushIce(out, get('ice-ufrag')) || !pushIce(out, get('ice-pwd'))) return null;
  fp[1].split(':').forEach(x => out.push(parseInt(x, 16)));
  // 接続先の候補：UDP だけ。同じものは1つに。多すぎるときは優先度の高いものから8つ
  const seen = new Set(), cands = [];
  for (const line of sdp.match(/^a=candidate:.+$/gm) || []) {
    const f = line.trim().split(/\s+/);
    const typ = CTYPES.indexOf(f[f.indexOf('typ') + 1]);
    if (f[2].toLowerCase() !== 'udp' || f[1] !== '1' || typ < 0) continue;
    const key = f[4] + ' ' + f[5] + ' ' + typ;
    if (seen.has(key)) continue;
    seen.add(key);
    cands.push({ pri: +f[3], addr: f[4], port: +f[5], typ });
  }
  cands.sort((a, b) => b.pri - a.pri);
  const list = cands.slice(0, 8);
  out.push(list.length);
  for (const c of list) {
    let kind, ab, m;
    if ((m = c.addr.match(IPV4)) && m.slice(1).every(x => +x < 256)) { kind = 0; ab = m.slice(1).map(Number); }
    else if ((m = c.addr.match(MDNS))) { kind = 2; ab = m.slice(1).join('').match(/../g).map(x => parseInt(x, 16)); }
    else if ((ab = ip6Bytes(c.addr))) kind = 1;
    else { if (c.addr.length > 255) return null; kind = 3; ab = [c.addr.length, ...new TextEncoder().encode(c.addr)]; }
    out.push(c.typ | (kind << 2), ...ab, c.port >> 8, c.port & 255);
  }
  return new Uint8Array(out);
}
/* バイト列 → SDP */
function expandSDP(bytes) {
  let i = 0;
  const r = { u8: () => { if (i >= bytes.length) throw new Error('short'); return bytes[i++]; } };
  const take = n => Array.from({ length: n }, () => r.u8());
  const h = r.u8();
  const type = h & 1 ? 'answer' : 'offer', setup = SETUPS[(h >> 1) & 3];
  if (!setup) throw new Error('setup');
  const ufrag = readIce(r), pwd = readIce(r);
  const fp = take(32).map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const n = r.u8();
  const pref = [126, 100, 110, 0];
  const cl = [];
  for (let k = 0; k < n; k++) {
    const f = r.u8(), typ = f & 3, kind = (f >> 2) & 3;
    let addr;
    if (kind === 0) addr = take(4).join('.');
    else if (kind === 1) addr = ip6Text(take(16));
    else if (kind === 2) { const x = hex(take(16)); addr = `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}.local`; }
    else addr = new TextDecoder().decode(new Uint8Array(take(r.u8())));
    const port = (r.u8() << 8) | r.u8();
    const pri = pref[typ] * 2 ** 24 + (65535 - k) * 256 + 255;
    cl.push(`a=candidate:${k + 1} 1 udp ${pri} ${addr} ${port} typ ${CTYPES[typ]}${typ ? ' raddr 0.0.0.0 rport 0' : ''}`);
  }
  if (i !== bytes.length) throw new Error('long');
  const sdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, 'a=ice-options:trickle', `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${setup}`, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ...cl, 'a=end-of-candidates'].join('\r\n') + '\r\n';
  return { t: type === 'offer' ? 'o' : 'a', s: sdp };
}

async function packCode(desc) {
  const c = compactSDP(desc);
  if (c) return 'CS2.' + toB64url(c);
  // 古い形（SDP をまるごと）
  let bytes = new TextEncoder().encode(JSON.stringify({ t: desc.type === 'offer' ? 'o' : 'a', s: desc.sdp }));
  let tag = 'CS1';
  if (typeof CompressionStream === 'function') {
    const zs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(zs).arrayBuffer());
    tag = 'CS1Z';
  }
  return tag + '.' + toB64url(bytes);
}
async function unpackCode(code, want) {
  // コードだけでも、コードの入ったリンク（…#j=CS2.… / …#a=CS2.…）でもよい
  const m = String(code || '').replace(/\s+/g, '').match(/(?:^|[#=&/])(CS2|CS1Z?)\.([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('コードの形がちがいます。届いたコードを、そのまま全部貼ってください。');
  let o;
  try {
    let bytes = fromB64url(m[2]);
    if (m[1] === 'CS2') o = expandSDP(bytes);
    else {
      if (m[1] === 'CS1Z') {
        const zs = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        bytes = new Uint8Array(await new Response(zs).arrayBuffer());
      }
      o = JSON.parse(new TextDecoder().decode(bytes));
    }
  } catch (e) {
    throw new Error('コードを読めませんでした。途中で切れていないか確かめてください。');
  }
  if (!o || (o.t !== 'o' && o.t !== 'a') || typeof o.s !== 'string') throw new Error('コードを読めませんでした。');
  if (want && o.t !== want) throw new Error(want === 'o' ? 'これは「参加コード」です。「招待コード」を貼ってください。' : 'これは「招待コード」です。相手から届いた「参加コード」を貼ってください。');
  return { type: o.t === 'o' ? 'offer' : 'answer', sdp: o.s };
}
/* コードを、このページへのリンクにする（j＝招待、a＝参加）。QRコードやLINEで送ると、押すだけで開ける */
const p2pLink = (code, kind) => location.href.split('#')[0] + '#' + kind + '=' + code;

/* リンクから開いたとき（boot から呼ぶ）。開く画面の名前を返す。リンクでなければ null */
const P2P_BC = 'cs-term-p2p';
function p2pFromHash() {
  if (TRANSPORT() !== 'p2p') return null;
  const r = location.hash.match(/^#r=(\d{6})$/);
  if (r) { // あいことばのQRコード（リンク）から開いたとき
    try { history.replaceState(null, '', '#select'); } catch (e) { /* noop */ }
    UI.vsPick = 'online'; P2P.inRoom = r[1]; P2P.fromLink = true; P2P.err = '';
    return 'select';
  }
  const m = location.hash.match(/^#([ja])=((?:CS2|CS1Z?)\.[A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try { history.replaceState(null, '', '#select'); } catch (e) { /* noop */ }
  UI.vsPick = 'online';
  P2P.err = '';
  if (m[1] === 'j') { P2P.inInvite = m[2]; P2P.fromLink = true; return 'select'; }
  // 参加コードのリンク：同じブラウザで部屋をつくった画面があれば、そちらへ渡す
  P2P.handoff = 'wait'; P2P.handCode = m[2];
  let bc = null;
  try { bc = new BroadcastChannel(P2P_BC); } catch (e) { bc = null; }
  const id = Math.random().toString(36).slice(2);
  const done = took => { if (bc) bc.close(); if (P2P.handoff === 'wait') { P2P.handoff = took ? 'sent' : 'orphan'; p2pRefresh(); } };
  if (!bc) { setTimeout(() => done(false), 0); return 'select'; }
  bc.onmessage = e => { if (e.data && e.data.k === 'took' && e.data.id === id) done(true); };
  bc.postMessage({ k: 'answer', code: m[2], id });
  setTimeout(() => done(false), 1500);
  return 'select';
}
/* 部屋をつくった画面：別のタブで開かれた参加コードを受け取る */
function p2pListen() {
  if (TRANSPORT() !== 'p2p' || typeof BroadcastChannel !== 'function') return;
  const bc = new BroadcastChannel(P2P_BC);
  bc.onmessage = e => {
    const d = e.data;
    if (!d || d.k !== 'answer' || P2P.stage !== 'offer' || P2P.role !== 'host' || P2P.busy) return;
    bc.postMessage({ k: 'took', id: d.id });
    P2P.inAnswer = d.code;
    if (UI.screen !== 'select') { UI.vsPick = 'online'; show('select'); }
    p2pAction('connect');
  };
}

/* カメラでQRコードを読む（BarcodeDetector が使えるブラウザだけ） */
const canScan = () => typeof window.BarcodeDetector === 'function' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
async function p2pScan(onCode) {
  const ov = document.createElement('div');
  ov.className = 'overlay center scan-ov';
  ov.innerHTML = '<div class="scan-in" role="dialog" aria-modal="true" aria-label="QRコードを読む"><video playsinline muted></video><p>相手の画面のQRコードを、わくの中に入れてください。</p><button type="button" class="btn ghost">やめる</button></div>';
  document.body.appendChild(ov);
  let stream = null, alive = true;
  const stop = () => { alive = false; if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); };
  ov.querySelector('button').onclick = stop;
  try {
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
    const v = ov.querySelector('video');
    v.srcObject = stream;
    await v.play();
    while (alive) {
      const found = await det.detect(v).catch(() => []);
      const hit = found.map(f => f.rawValue).find(t => /(?:CS2|CS1Z?)\.[A-Za-z0-9_-]+/.test(t || ''));
      if (hit) { stop(); onCode(hit); return; }
      await new Promise(r => setTimeout(r, 250));
    }
  } catch (e) {
    stop();
    toast('カメラを使えませんでした。コードを貼りつけてください');
  }
}

/* 接続の候補を集め終わるまで待つ（STUNが遅いときは、あるものだけで進む） */
function iceDone(pc, ms) {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') { res(); return; }
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

function p2pClose() {
  if (P2P.room) { const rm = P2P.room; sig(`/room/${rm.code}?t=${rm.token}`, 'DELETE').catch(() => {}); }
  P2P.room = null; P2P.viaRoom = false;
  clearTimeout(P2P.timer);
  clearInterval(P2P.tick);
  try { if (P2P.dc) { P2P.dc.onclose = null; P2P.dc.onmessage = null; P2P.dc.close(); } } catch (e) { /* noop */ }
  try { if (P2P.pc) { P2P.pc.onconnectionstatechange = null; P2P.pc.close(); } } catch (e) { /* noop */ }
  Object.assign(P2P, { pc: null, dc: null, role: '', connected: false, meAgain: false, oppAgain: false, oppDeck: null, code: '', link: '', round: 0, lastStart: null, tick: null });
}
const p2pInGame = () => !!(UI.g && !UI.g.over && UI.vs === 'online' && NET.mode === 'p2p');
/* 1.5秒ごとに：準備OKを送りなおす／対戦中は自分の手の数を知らせる（届いていない手があれば、相手が送りなおしを頼む） */
function p2pTick() {
  if (!P2P.connected) return;
  if (P2P.meAgain && !p2pInGame()) p2pSendAgain();
  if (NET.mode === 'p2p' && NET.gid) p2pSendRaw({ k: 'hb', gid: NET.gid, n: NET.mine.length });
}
function p2pSendAgain() {
  const mine = deckById(UI.deck.me) || PRESETS[0];
  // ゲストのデッキは、ホストが盤面をつくるのに要るので送る（画面には出さない）。ホストは準備OKだけを知らせる
  p2pSendRaw(P2P.role === 'host' ? { k: 'again', r: P2P.round } : { k: 'again', r: P2P.round, deck: deckPayload(mine) });
}
function p2pRefresh() {
  if (UI.screen === 'select' && UI.vsPick === 'online') renderSelect();
  if (UI.g && UI.screen === 'battle') renderActbar();
  p2pResultButtons();
}
function p2pLost(msg) {
  if (!P2P.pc && !P2P.dc) return;
  p2pClose();
  P2P.stage = 'idle';
  P2P.err = msg;
  NET.oppHere = false;
  const g = UI.g;
  if (UI.vs === 'online' && NET.mode === 'p2p' && g && !g.over) {
    g.desync = true; // チケットはなし
    endGame(g, null, '相手との接続が切れたため、対戦を終わりました');
    netAfterForcedEnd();
  }
  p2pRefresh();
}
function p2pNewPC(role) {
  p2pClose();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  P2P.pc = pc;
  P2P.role = role;
  pc.onconnectionstatechange = () => {
    if (P2P.pc !== pc) return;
    const st = pc.connectionState;
    if (st === 'failed') p2pLost(P2P.connected ? '相手との接続が切れました。' : 'つながりませんでした。ネットワークによっては、つながらないことがあります。2台を同じWi-Fiにつなぐと、つながりやすくなります。');
    else if (st === 'disconnected' && P2P.connected) { NET.oppHere = false; p2pRefresh(); }
    else if (st === 'connected' && P2P.connected) { NET.oppHere = true; p2pRefresh(); }
  };
  return pc;
}
function p2pWire(dc) {
  P2P.dc = dc;
  dc.onopen = () => {
    clearTimeout(P2P.timer);
    Object.assign(P2P, { connected: true, stage: 'connected', err: '', inInvite: '', inAnswer: '' });
    NET.oppHere = true;
    clearInterval(P2P.tick);
    P2P.tick = setInterval(p2pTick, 1500);
    // すぐにははじめない：2人ともデッキを選んで「準備OK」を押したらはじまる
    if (UI.screen !== 'select' || UI.vsPick !== 'online') { UI.vsPick = 'online'; if (UI.screen !== 'battle') show('select'); }
    p2pRefresh();
  };
  dc.onmessage = e => p2pOnMessage(e.data);
  dc.onclose = () => p2pLost('相手との接続が切れました。');
}
function p2pSendRaw(o) {
  try {
    if (P2P.dc && P2P.dc.readyState === 'open') { P2P.dc.send(JSON.stringify(o)); return true; }
  } catch (e) { /* 送れなかった */ }
  return false;
}
function p2pOnMessage(raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  if (!msg || typeof msg !== 'object') return;
  if (msg.k === 'mv') {
    if (NET.on && NET.mode === 'p2p' && msg.gid === NET.gid && msg.m) netIngest([msg.m]);
  } else if (msg.k === 'hb') {
    // 相手が送った手の数より、受け取った手が少なければ、送りなおしてもらう
    if (NET.on && NET.mode === 'p2p' && msg.gid === NET.gid && Number.isInteger(msg.n) && msg.n > NET.remote.length && Date.now() - P2P.needAt > 1200) {
      P2P.needAt = Date.now();
      p2pSendRaw({ k: 'need', gid: NET.gid, from: NET.remote.length });
    }
  } else if (msg.k === 'need') {
    if (NET.mode === 'p2p' && msg.gid === NET.gid && Number.isInteger(msg.from) && msg.from >= 0) {
      for (const m of NET.mine.slice(msg.from, msg.from + 60)) p2pSendRaw({ k: 'mv', gid: NET.gid, m });
    }
  } else if (msg.k === 'again') {
    // ゲスト → ホスト：デッキつきの「準備OK」。ホスト → ゲスト：準備OKのお知らせだけ
    if (P2P.role === 'host') {
      // 1つ前の対戦の「準備OK」がまだ届く＝はじめの合図が届いていない。もう一度送る
      if (msg.r === P2P.round - 1 && P2P.lastStart) { p2pSendRaw(P2P.lastStart); return; }
      if (msg.r !== P2P.round || !deckShapeOK(msg.deck)) return;
      P2P.oppDeck = msg.deck;
    } else if (msg.r !== P2P.round) return;
    if (P2P.oppAgain && P2P.role !== 'host') return;
    P2P.oppAgain = true;
    if (!p2pMaybeStart()) p2pRefresh();
  } else if (msg.k === 'unready') {
    // 相手が「準備をやめる」を押した（デッキを変えるなど）
    if (msg.r !== P2P.round) return;
    P2P.oppAgain = false;
    if (P2P.role === 'host') P2P.oppDeck = null;
    p2pRefresh();
  } else if (msg.k === 'start') {
    if (P2P.role !== 'guest' || !Number.isInteger(msg.seed) || !Number.isInteger(msg.round) || typeof msg.gid !== 'string') return;
    if (msg.round <= P2P.round) return; // 同じ合図が2回届いた
    if (!deckShapeOK(msg.hostDeck) || !deckShapeOK(msg.guestDeck)) return;
    P2P.round = msg.round;
    P2P.meAgain = false; P2P.oppAgain = false;
    startOnline({ gid: msg.gid.slice(0, 40), seed: msg.seed, hostDeck: msg.hostDeck, guestDeck: msg.guestDeck, code: '' }, 1, 'p2p');
  } else if (msg.k === 'bye') {
    p2pLost('相手が接続を切りました。');
  }
}
/* 2人とも準備OKなら、ホストが種（シード）を決めて対戦をはじめる */
function p2pMaybeStart() {
  if (P2P.role !== 'host' || !P2P.connected || !P2P.meAgain || !P2P.oppAgain || !P2P.oppDeck) return false;
  if (UI.g && !UI.g.over && UI.vs === 'online') return false;
  const mine = deckById(UI.deck.me) || PRESETS[0];
  if (validateDeck(mine).errs.length) { P2P.meAgain = false; toast('このデッキはまだ使えません。デッキ編集で直してください'); return false; }
  const room = {
    gid: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
    seed: Math.floor(Math.random() * 2147483647), hostDeck: deckPayload(mine), guestDeck: P2P.oppDeck, code: '',
  };
  P2P.meAgain = false; P2P.oppAgain = false;
  P2P.round += 1;
  P2P.lastStart = Object.assign({ k: 'start', round: P2P.round }, room);
  p2pSendRaw(P2P.lastStart);
  startOnline(room, 0, 'p2p');
  return true;
}
function p2pAgain() {
  if (!P2P.connected) return;
  const mine = deckById(UI.deck.me) || PRESETS[0];
  if (validateDeck(mine).errs.length) { toast('このデッキはまだ使えません。デッキ編集で直してください'); return; }
  P2P.meAgain = true;
  if (P2P.role !== 'host' || !p2pMaybeStart()) p2pSendAgain();
  p2pRefresh();
}
/* 準備OKを取り消す（デッキを変えるときなど）。相手にも知らせる */
function p2pUnready() {
  if (!P2P.meAgain) return;
  P2P.meAgain = false;
  p2pSendRaw({ k: 'unready', r: P2P.round });
  p2pRefresh();
}
/* 結果画面の「もう一度（同じ相手と）」の表示を、いまの状態に合わせる */
function p2pResultButtons() {
  const b = document.querySelector('#result [data-r="again2"]');
  if (!b) return;
  if (!P2P.connected) { b.disabled = true; b.textContent = '接続が切れました'; return; }
  b.disabled = P2P.meAgain;
  b.textContent = P2P.meAgain ? '相手を待っています…' : P2P.oppAgain ? 'もう一度（相手は準備OK）' : 'もう一度（同じ相手と）';
}
async function p2pCopy() {
  const t = P2P.link || P2P.code;
  if (!t) return;
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { /* 下の方法で */ }
  if (!ok) {
    const ta = document.querySelector('.code-out');
    if (ta) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
  }
  toast(ok ? 'コピーしました' : 'コードを長押しして、コピーしてください');
}
/* 部屋をつくった人：あいことばで入った相手の参加コードを、Worker に聞きに行く（はじめは1.5秒ごと、だんだんゆっくり） */
async function p2pWaitAnswer(pc, room) {
  let wait = 1500;
  const alive = () => P2P.pc === pc && P2P.room === room && P2P.stage === 'offer';
  while (alive() && Date.now() < room.until) {
    await new Promise(res => setTimeout(res, wait));
    if (!alive()) return;
    wait = Math.min(4000, wait + 250);
    let r;
    try { r = await sig(`/room/${room.code}/answer?t=${room.token}`); } catch (e) { continue; } // 通信の失敗は、次にまたためす
    if (!alive()) return;
    if (r.answer) {
      P2P.inAnswer = r.answer;
      await p2pAction('connect');
      return;
    }
    if (r.status === 404) break;
  }
  if (alive()) { P2P.room = null; P2P.err = 'あいことばの期限（10分）が切れました。もう一度「部屋をつくる」を押してください。'; p2pRefresh(); }
}
async function p2pAction(k) {
  if (k === 'copy') { p2pCopy(); return; }
  if (k === 'share') { if (navigator.share) navigator.share({ url: P2P.link || P2P.code }).catch(() => {}); return; }
  if (k === 'scan') { p2pScan(t => { P2P.inAnswer = t; p2pRefresh(); p2pAction('connect'); }); return; }
  if (k === 'copyhand') { P2P.code = P2P.handCode; P2P.link = ''; p2pCopy(); return; }
  if (k === 'again') { p2pAgain(); return; }
  if (k === 'unready') { p2pUnready(); return; }
  if (k === 'cancel') { p2pSendRaw({ k: 'bye' }); p2pClose(); Object.assign(P2P, { stage: 'idle', err: '' }); p2pRefresh(); return; }
  if (P2P.busy) return;
  if (!hasRTC()) { P2P.err = 'このブラウザでは、オンライン対戦を使えません。'; p2pRefresh(); return; }
  const mine = deckById(UI.deck.me) || PRESETS[0];
  if ((k === 'create' || k === 'join' || k === 'joinroom') && validateDeck(mine).errs.length) { P2P.err = 'このデッキはまだ使えません。デッキ編集で直してください。'; p2pRefresh(); return; }
  P2P.err = '';
  P2P.busy = true;
  try {
    if (k === 'create') {
      P2P.stage = 'making'; p2pRefresh();
      const pc = p2pNewPC('host');
      p2pWire(pc.createDataChannel('game', DC_OPTS));
      await pc.setLocalDescription(await pc.createOffer());
      await iceDone(pc, 4000);
      if (P2P.pc !== pc) return;
      P2P.code = await packCode(pc.localDescription);
      P2P.link = p2pLink(P2P.code, 'j');
      P2P.sigNote = '';
      if (signalURL()) { // あいことばを Worker にあずける。だめなら、リンク交換だけで続ける
        try {
          const r = await sig('/room', 'POST', { offer: P2P.code });
          if (P2P.pc !== pc) return;
          if (r.code && r.token) {
            P2P.room = { code: r.code, token: r.token, until: Date.now() + (r.ttl || 600000) };
          } else P2P.sigNote = SIG_DOWN;
        } catch (e) { P2P.sigNote = SIG_DOWN; }
      }
      P2P.stage = 'offer';
      if (P2P.room) p2pWaitAnswer(pc, P2P.room); // stage を offer にしてから待ちはじめる
    } else if (k === 'join') {
      const desc = await unpackCode(P2P.inInvite, 'o');
      P2P.stage = 'making'; p2pRefresh();
      const pc = p2pNewPC('guest');
      p2pWire(pc.createDataChannel('game', DC_OPTS));
      await pc.setRemoteDescription(desc);
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc, 4000);
      if (P2P.pc !== pc) return;
      P2P.code = await packCode(pc.localDescription);
      P2P.link = p2pLink(P2P.code, 'a');
      P2P.stage = 'answer';
    } else if (k === 'joinroom') {
      // あいことばで入る：招待コードを Worker から受けとり、参加コードを Worker にわたす
      const code = String(P2P.inRoom || '').replace(/\D/g, '');
      P2P.inRoom = code;
      if (code.length !== 6) throw new Error('あいことばは6けたの数字です。');
      P2P.stage = 'making'; p2pRefresh();
      let r;
      try { r = await sig(`/room/${code}`); } catch (e) { throw new Error('あいことばのサーバーにつながりませんでした。相手に招待リンク（QRコード）を送ってもらってください。'); }
      if (r.status === 404) throw new Error('そのあいことばの部屋は見つかりませんでした。数字をたしかめてください（部屋は10分で消えます）。');
      if (r.taken) throw new Error('その部屋には、もうほかの人が入っています。');
      if (!r.offer) throw new Error('部屋に入れませんでした。もう一度ためしてください。');
      const desc = await unpackCode(r.offer, 'o');
      const pc = p2pNewPC('guest');
      p2pWire(pc.createDataChannel('game', DC_OPTS));
      await pc.setRemoteDescription(desc);
      await pc.setLocalDescription(await pc.createAnswer());
      await iceDone(pc, 4000);
      if (P2P.pc !== pc) return;
      P2P.code = await packCode(pc.localDescription);
      P2P.link = p2pLink(P2P.code, 'a');
      let w;
      try { w = await sig(`/room/${code}/answer`, 'POST', { answer: P2P.code }); } catch (e) { w = { status: 0 }; }
      if (P2P.pc !== pc) return;
      if (w.ok) {
        P2P.viaRoom = true;
        P2P.stage = 'answer';
        clearTimeout(P2P.timer);
        P2P.timer = setTimeout(() => { if (!P2P.connected) p2pLost('つながりませんでした。ネットワークによっては、つながらないことがあります。2台を同じWi-Fiにつなぐと、つながりやすくなります。'); }, 30000);
      } else if (w.error === 'taken') throw new Error('その部屋には、もうほかの人が入っています。');
      else if (w.status === 404) throw new Error('部屋の期限が切れていました。部屋をつくった人に、もう一度つくってもらってください。');
      else { // サーバーにわたせなかった：参加リンクを手で送ってもらう
        P2P.stage = 'answer';
        P2P.err = 'あいことばのサーバーに参加コードをわたせませんでした。下の参加リンク（QRコード）を、部屋をつくった人に送ってください。';
      }
    } else if (k === 'connect') {
      if (!P2P.pc || P2P.role !== 'host') throw new Error('先に「部屋をつくる」を押してください。');
      const desc = await unpackCode(P2P.inAnswer, 'a');
      await P2P.pc.setRemoteDescription(desc);
      if (P2P.room) { const rm = P2P.room; P2P.room = null; sig(`/room/${rm.code}?t=${rm.token}`, 'DELETE').catch(() => {}); } // もう要らない
      P2P.stage = 'connecting';
      clearTimeout(P2P.timer);
      P2P.timer = setTimeout(() => { if (!P2P.connected) p2pLost('つながりませんでした。ネットワークによっては、つながらないことがあります。2台を同じWi-Fiにつなぐと、つながりやすくなります。'); }, 25000);
    }
  } catch (e) {
    if (k !== 'connect') { const keep = P2P.inRoom; p2pClose(); P2P.stage = 'idle'; P2P.inRoom = keep; }
    P2P.err = (e && e.message) || 'うまくいきませんでした。もう一度ためしてください。';
  } finally {
    P2P.busy = false;
  }
  p2pRefresh();
}
function p2pPanelHTML() {
  const useSig = !!signalURL();
  const head = useSig
    ? `<h3 class="h3">オンライン対戦（あいことば）</h3>
    <p class="note">6けたの「あいことば」を相手に伝えると、2台が直接つながります。ログインはいりません。あいことばが使えないときは、リンクやQRコードでもつなげます。</p>`
    : `<h3 class="h3">オンライン対戦（リンク交換）</h3>
    <p class="note">「招待リンク」と「参加リンク」を1回ずつ送り合うと、2台が直接つながります。そばにいるなら、QRコードをスマホのカメラで読むだけ。はなれているなら、リンクをLINEなどで送ります。ログインはいりません。</p>`;
  if (!hasRTC()) return head + '<p class="msg warn">このブラウザでは、オンライン対戦を使えません。</p>';
  const err = P2P.err ? `<p class="msg err" role="alert">${esc(P2P.err)}</p>` : '';
  const note = P2P.sigNote ? `<p class="msg warn">${esc(P2P.sigNote)}</p>` : '';
  const cancel = label => `<div class="p2p-btns"><button type="button" class="btn ghost" data-net="cancel">${label || 'やめる'}</button></div>`;
  // QRコード（リンク）とコピー・送るボタン。gold は、その画面の本命の操作のときだけ
  const codeBox = (label, note2, gold) => `<div class="p2p-code"><p class="p2p-lbl">${label}</p>
      ${P2P.link ? qrSVG(P2P.link, label + 'のQRコード') : ''}
      <p class="note">${note2}</p>
      <div class="p2p-btns"><button type="button" class="btn ${gold ? 'gold' : ''}" data-net="copy">リンクをコピー</button>${navigator.share ? '<button type="button" class="btn" data-net="share">送る</button>' : ''}</div>
      <details class="p2p-raw"><summary>リンクの文字を見る</summary><textarea class="code-out" readonly rows="3" aria-label="${label}">${esc(P2P.link || P2P.code)}</textarea></details></div>`;
  const answerBox = () => `<div class="p2p-code"><p class="p2p-lbl">相手から届いた「参加リンク」</p>
        <p class="note">相手の画面に出たQRコードを、このスマホのカメラで読むと、この画面でつながります（同じブラウザで開いたとき）。${canScan() ? '下の「カメラで読む」でも読めます。' : ''}リンクが届いたら、ここに貼ってもかまいません。</p>
        <label class="net-in"><span class="sr">参加リンク</span><textarea id="p2pAnswer" rows="2" placeholder="ここに貼る" autocomplete="off">${esc(P2P.inAnswer)}</textarea></label>
        <div class="p2p-btns"><button type="button" class="btn ${P2P.room ? '' : 'gold'}" data-net="connect">つなぐ</button>${canScan() ? '<button type="button" class="btn" data-net="scan">カメラで読む</button>' : ''}</div></div>`;
  switch (P2P.stage) {
    case 'making':
      return head + `<p class="msg">${useSig ? 'じゅんびしています…' : 'リンクをつくっています…'}</p>`;
    case 'offer':
      if (P2P.room) {
        const rl = p2pLink(P2P.room.code, 'r');
        return head + `<div class="net-wait room-wait"><p class="p2p-lbl">あいことば</p><p class="net-code">${esc(P2P.room.code)}</p>
          <p>この数字を相手に伝えて、「部屋に入る」に入れてもらってください。10分で使えなくなります。</p>
          ${qrSVG(rl, 'あいことばのQRコード')}
          <p class="note">そばにいるなら、相手のスマホのカメラでこのQRコードを読んでもらうと、あいことばが入った状態で開きます。</p>
          <p class="waiting">相手が入るのを待っています…</p>${cancel()}</div>${err}
          <details class="p2p-alt"><summary>あいことばが使えないとき（リンクで送る）</summary>
          ${codeBox('招待リンク', '相手のスマホのカメラでこのQRコードを読んでもらうか、リンクを送ってください。', false)}${answerBox()}</details>`;
      }
      return head + note + codeBox('招待リンク', '相手のスマホのカメラでこのQRコードを読んでもらうか、リンクを送ってください。', false) + answerBox() + cancel() + err;
    case 'answer':
      if (P2P.viaRoom) {
        return head + `<div class="net-wait"><p class="net-ok">部屋に入りました（あいことば ${esc(P2P.inRoom)}）</p><p class="waiting">相手とつないでいます…</p>${cancel()}</div>${err}`;
      }
      return head + err + codeBox('参加リンク', '部屋をつくった人に、このQRコードをカメラで読んでもらうか、リンクを送ってください。読んでもらえば、対戦がはじまります。', true) + `
        <p class="waiting">相手を待っています…</p>${cancel()}`;
    case 'connecting':
      return head + '<p class="msg">つないでいます…</p>' + cancel() + err;
    case 'connected':
      return head + `<div class="net-wait"><p class="net-ok">相手とつながっています</p>
        <p>下でデッキを選んで、「準備OK」を押してください。2人とも準備OKになると、対戦がはじまります。相手のデッキは、対戦が終わるまでわかりません。</p>
        <ul class="ready-list">
          <li class="${P2P.meAgain ? 'on' : ''}">あなた：${P2P.meAgain ? '準備OK' : 'デッキを選んでいます…'}</li>
          <li class="${P2P.oppAgain ? 'on' : ''}">相手：${P2P.oppAgain ? '準備OK' : 'デッキを選んでいます…'}</li>
        </ul>
        <button type="button" class="btn ghost" data-net="cancel">接続を切る</button></div>${err}`;
    default: {
      // 参加リンクを別のタブで開いたとき
      const hand = P2P.handoff === 'wait' ? '<p class="msg">部屋をつくった画面をさがしています…</p>'
        : P2P.handoff === 'sent' ? '<div class="net-wait"><p class="net-ok">部屋をつくった画面に、参加リンクをわたしました</p><p>もとの画面にもどってください。この画面は閉じてかまいません。</p></div>'
        : P2P.handoff === 'orphan' ? `<div class="p2p-code"><p class="msg warn">部屋をつくった画面が、このブラウザで見つかりませんでした。</p>
            <p class="note">リンクをコピーして、部屋をつくった画面の「参加リンク」に貼ってください。</p>
            <div class="p2p-btns"><button type="button" class="btn gold" data-net="copyhand">リンクをコピー</button></div></div>` : '';
      if (hand) return head + hand;
      const byLink = !!P2P.inInvite && P2P.fromLink, byRoom = !!P2P.inRoom && P2P.fromLink && !byLink;
      const tail = `<p class="note">2台を同じWi-Fiにつなぐと、つながりやすくなります。学校や会社のネットワークでは、つながらないこともあります。勝つとパックチケット+${REWARD.win}、負け・引き分けで+${REWARD.lose}。</p>`;
      const linkJoin = gold => `<label class="net-in"><span>相手から届いた「招待リンク」</span><textarea id="p2pInvite" rows="2" placeholder="ここに貼る（QRコードで開いたときは、もう入っています）" autocomplete="off">${esc(P2P.inInvite)}</textarea></label><button type="button" class="btn ${gold ? 'gold' : ''}" data-net="join">参加リンクをつくる</button>`;
      const msg = byLink ? '<p class="msg ok">招待リンクから開きました。下でデッキを選んで、「参加リンクをつくる」を押してください。</p>'
        : byRoom ? '<p class="msg ok">あいことばが入っています。下でデッキを選んで、「入る」を押してください。</p>' : '';
      if (!useSig) {
        return head + msg + `<div class="net-grid">
          <div class="net-box"><h4>部屋をつくる</h4><p class="note">招待リンクとQRコードが出るので、相手に読んでもらいます。</p><button type="button" class="btn ${byLink ? '' : 'gold'}" data-net="create">部屋をつくる</button></div>
          <div class="net-box"><h4>部屋に入る</h4>${linkJoin(byLink)}</div>
        </div>${err}${tail}`;
      }
      return head + msg + `<div class="net-grid">
        <div class="net-box"><h4>部屋をつくる</h4><p class="note">あいことば（6けたの数字）が出るので、相手に伝えます。</p><button type="button" class="btn ${byLink || byRoom ? '' : 'gold'}" data-net="create">部屋をつくる</button></div>
        <div class="net-box"><h4>部屋に入る</h4><label class="net-in"><span>あいことば</span><input id="p2pRoom" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="6けたの数字" value="${esc(P2P.inRoom)}"></label><button type="button" class="btn ${byRoom ? 'gold' : ''}" data-net="joinroom">入る</button>
          <details class="p2p-alt" ${byLink ? 'open' : ''}><summary>招待リンクで入る</summary>${linkJoin(byLink)}</details></div>
      </div>${err}${tail}`;
    }
  }
}
