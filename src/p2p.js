/* =========================================================
   オンライン対戦（Claude以外のサイトに置いたとき）
   WebRTC で2台を直接つなぐ。ログインもサーバーもいらない。
   最初に「招待コード」と「参加コード」を1回ずつ送り合う。
   つながったあとは、同じ相手と何回でも対戦できる。
   ========================================================= */
const P2P = {
  pc: null, dc: null, role: '', stage: 'idle', code: '', err: '', inInvite: '', inAnswer: '',
  connected: false, meAgain: false, oppAgain: false, oppDeck: null, timer: null, busy: false,
  round: 0, lastStart: null, tick: null, needAt: 0,
};
/* チャンネルは両方の端末で同じ番号（id 0）を使ってつくる。片方だけでつくると、最初の通信が落ちることがある */
const DC_OPTS = { negotiated: true, id: 0, ordered: true };
const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
/* Claudeの中で開いているときは Claude の共有のしくみ、それ以外は WebRTC を使う */
const TRANSPORT = () => (window.claude && typeof window.claude.use === 'function' ? 'claude' : 'p2p');
const hasRTC = () => typeof RTCPeerConnection === 'function';

/* 接続情報（SDP）を、送りやすい1行の文字列にする */
async function packCode(desc) {
  let bytes = new TextEncoder().encode(JSON.stringify({ t: desc.type === 'offer' ? 'o' : 'a', s: desc.sdp }));
  let tag = 'CS1';
  if (typeof CompressionStream === 'function') {
    const zs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(zs).arrayBuffer());
    tag = 'CS1Z';
  }
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return tag + '.' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpackCode(code, want) {
  const m = String(code || '').replace(/\s+/g, '').match(/^(CS1Z?)\.([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('コードの形がちがいます。届いたコードを、そのまま全部貼ってください。');
  let o;
  try {
    const b64 = m[2].replace(/-/g, '+').replace(/_/g, '/');
    let bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), c => c.charCodeAt(0));
    if (m[1] === 'CS1Z') {
      const zs = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      bytes = new Uint8Array(await new Response(zs).arrayBuffer());
    }
    o = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    throw new Error('コードを読めませんでした。途中で切れていないか確かめてください。');
  }
  if (!o || (o.t !== 'o' && o.t !== 'a') || typeof o.s !== 'string') throw new Error('コードを読めませんでした。');
  if (want && o.t !== want) throw new Error(want === 'o' ? 'これは「参加コード」です。「招待コード」を貼ってください。' : 'これは「招待コード」です。相手から届いた「参加コード」を貼ってください。');
  return { type: o.t === 'o' ? 'offer' : 'answer', sdp: o.s };
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
  clearTimeout(P2P.timer);
  clearInterval(P2P.tick);
  try { if (P2P.dc) { P2P.dc.onclose = null; P2P.dc.onmessage = null; P2P.dc.close(); } } catch (e) { /* noop */ }
  try { if (P2P.pc) { P2P.pc.onconnectionstatechange = null; P2P.pc.close(); } } catch (e) { /* noop */ }
  Object.assign(P2P, { pc: null, dc: null, role: '', connected: false, meAgain: false, oppAgain: false, oppDeck: null, code: '', round: 0, lastStart: null, tick: null });
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
    p2pAgain(); // 最初の対戦は、つながったらすぐはじめる
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
/* 結果画面の「もう一度（同じ相手と）」の表示を、いまの状態に合わせる */
function p2pResultButtons() {
  const b = document.querySelector('#result [data-r="again2"]');
  if (!b) return;
  if (!P2P.connected) { b.disabled = true; b.textContent = '接続が切れました'; return; }
  b.disabled = P2P.meAgain;
  b.textContent = P2P.meAgain ? '相手を待っています…' : P2P.oppAgain ? 'もう一度（相手は準備OK）' : 'もう一度（同じ相手と）';
}
async function p2pCopy() {
  const t = P2P.code;
  if (!t) return;
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { /* 下の方法で */ }
  if (!ok) {
    const ta = document.querySelector('.code-out');
    if (ta) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (e) { ok = false; } }
  }
  toast(ok ? 'コピーしました' : 'コードを長押しして、コピーしてください');
}
async function p2pAction(k) {
  if (k === 'copy') { p2pCopy(); return; }
  if (k === 'share') { if (navigator.share) navigator.share({ text: P2P.code }).catch(() => {}); return; }
  if (k === 'again') { p2pAgain(); return; }
  if (k === 'cancel') { p2pSendRaw({ k: 'bye' }); p2pClose(); Object.assign(P2P, { stage: 'idle', err: '' }); p2pRefresh(); return; }
  if (P2P.busy) return;
  if (!hasRTC()) { P2P.err = 'このブラウザでは、オンライン対戦を使えません。'; p2pRefresh(); return; }
  const mine = deckById(UI.deck.me) || PRESETS[0];
  if ((k === 'create' || k === 'join') && validateDeck(mine).errs.length) { P2P.err = 'このデッキはまだ使えません。デッキ編集で直してください。'; p2pRefresh(); return; }
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
      P2P.stage = 'offer';
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
      P2P.stage = 'answer';
    } else if (k === 'connect') {
      if (!P2P.pc || P2P.role !== 'host') throw new Error('先に「部屋をつくる」を押してください。');
      const desc = await unpackCode(P2P.inAnswer, 'a');
      await P2P.pc.setRemoteDescription(desc);
      P2P.stage = 'connecting';
      clearTimeout(P2P.timer);
      P2P.timer = setTimeout(() => { if (!P2P.connected) p2pLost('つながりませんでした。ネットワークによっては、つながらないことがあります。2台を同じWi-Fiにつなぐと、つながりやすくなります。'); }, 25000);
    }
  } catch (e) {
    if (k !== 'connect') { p2pClose(); P2P.stage = 'idle'; }
    P2P.err = (e && e.message) || 'うまくいきませんでした。もう一度ためしてください。';
  } finally {
    P2P.busy = false;
  }
  p2pRefresh();
}
function p2pPanelHTML() {
  const head = `<h3 class="h3">オンライン対戦（コード交換）</h3>
    <p class="note">「招待コード」と「参加コード」を1回ずつ送り合うと、2台が直接つながります。ログインはいりません。つながったあとは、同じ相手と何回でも対戦できます。</p>`;
  if (!hasRTC()) return head + '<p class="msg warn">このブラウザでは、オンライン対戦を使えません。</p>';
  const err = P2P.err ? `<p class="msg err" role="alert">${esc(P2P.err)}</p>` : '';
  const codeBox = (label, note) => `<div class="p2p-code"><p class="silk">${label}</p>
      <textarea class="code-out" readonly rows="3" aria-label="${label}">${esc(P2P.code)}</textarea>
      <div class="p2p-btns"><button type="button" class="btn gold" data-net="copy">コピー</button>${navigator.share ? '<button type="button" class="btn" data-net="share">送る</button>' : ''}</div>
      <p class="note">${note}</p></div>`;
  switch (P2P.stage) {
    case 'making':
      return head + '<p class="msg">コードをつくっています…</p>';
    case 'offer':
      return head + codeBox('招待コード', 'このコードを、LINEなどで相手に送ってください。') + `
        <label class="net-in"><span>相手から届いた「参加コード」</span><textarea id="p2pAnswer" rows="3" placeholder="ここに貼る" autocomplete="off">${esc(P2P.inAnswer)}</textarea></label>
        <div class="p2p-btns"><button type="button" class="btn gold" data-net="connect">つなぐ</button><button type="button" class="btn ghost" data-net="cancel">やめる</button></div>${err}`;
    case 'answer':
      return head + codeBox('参加コード', 'このコードを相手に送ってください。相手が「つなぐ」を押すと、対戦がはじまります。') + `
        <p class="waiting">相手を待っています…</p><div class="p2p-btns"><button type="button" class="btn ghost" data-net="cancel">やめる</button></div>${err}`;
    case 'connecting':
      return head + '<p class="msg">つないでいます…</p><div class="p2p-btns"><button type="button" class="btn ghost" data-net="cancel">やめる</button></div>' + err;
    case 'connected':
      return head + `<div class="net-wait"><p class="net-ok">相手とつながっています</p>
        ${P2P.meAgain ? '<p class="waiting">相手の準備を待っています…</p>' : '<button type="button" class="btn gold" data-net="again">この相手と対戦する</button>'}
        ${P2P.oppAgain && !P2P.meAgain ? '<p class="note">相手は準備OKです。</p>' : ''}
        <button type="button" class="btn ghost" data-net="cancel">接続を切る</button></div>${err}`;
    default:
      return head + `<div class="net-grid">
        <div class="net-box"><h4>部屋をつくる</h4><p class="note">招待コードが出るので、相手に送ります。</p><button type="button" class="btn gold" data-net="create">部屋をつくる</button></div>
        <div class="net-box"><h4>部屋に入る</h4><label class="net-in"><span>相手から届いた「招待コード」</span><textarea id="p2pInvite" rows="3" placeholder="ここに貼る" autocomplete="off">${esc(P2P.inInvite)}</textarea></label><button type="button" class="btn gold" data-net="join">参加コードをつくる</button></div>
      </div>${err}
      <p class="note">2台を同じWi-Fiにつなぐと、つながりやすくなります。学校や会社のネットワークでは、つながらないこともあります。勝つとパックチケット+${REWARD.win}、負け・引き分けで+${REWARD.lose}。</p>`;
  }
}
