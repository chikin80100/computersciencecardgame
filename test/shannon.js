// 「クロード・シャノン」パックのカードの効果を、場面を作って1つずつ確かめる
//   node test/shannon.js
// コインの結果は setRNG で決めておく（0.5より小さいとオモテ）
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
const X = ctx; // engine.js の関数（actAttack など）は、ここから呼べる

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('NG', msg); } }
const H = 0.1, T = 0.9; // オモテ・ウラ
function coins(...seq) { let i = 0; E.setRNG(() => (i < seq.length ? seq[i++] : 0.3)); }

let UID = 10000; // テストで作るカードの番号（エンジンの番号と重ならないように大きくする）
// 2人の場を用意する。me がワザを使う側（番の人）
function scene(meId, foeId, opt = {}) {
  E.resetUid();
  const g = E.newGame({ io: E.NOOP_IO, players: [
    { name: 'A', isCPU: true, deck: { pair: 2, import: 2 }, energy: ['data'] },
    { name: 'B', isCPU: true, deck: { pair: 2, import: 2 }, energy: ['data'] },
  ] });
  const [p, o] = g.players;
  g.turn = 5; g.cur = 0; p.turns = 3; o.turns = 3;
  const card = id => ({ uid: ++UID, id });
  p.active = X.mkMon(card(meId), 1);
  o.active = X.mkMon(card(foeId), 1);
  p.hand = []; o.hand = [];
  if (opt.energy) p.active.energy = opt.energy.slice();
  if (opt.bench) o.bench = opt.bench.map(id => X.mkMon(card(id), 1));
  return { g, p, o, card };
}
const ATK = (m, name) => E.DEF[m.id].atk.findIndex(a => a.name === name);

(async () => {
  // ビット：オモテ・ウラ・オモテ → 101 → 5 → 50ダメージ
  {
    const { g, p, o } = scene('bit', 'cpu', { energy: ['data', 'data'] });
    coins(H, T, H);
    await X.actAttack(g, p, ATK(p.active, '3ビット'));
    ok(o.active.dmg === 50, `ビット 101 → 50 のはず: ${o.active.dmg}`);
    ok(g.log.some(l => String(l.msg || l).includes('2進数の101は5')), 'ビット：ログに 101は5');
  }
  {
    const { g, p, o } = scene('bit', 'cpu', { energy: ['data', 'data'] });
    coins(T, H, H);
    await X.actAttack(g, p, ATK(p.active, '3ビット'));
    ok(o.active.dmg === 30, `ビット 011 → 30 のはず: ${o.active.dmg}`);
  }
  // パリティビット：手札が偶数なら +30
  for (const [hand, want] of [[0, 50], [1, 20], [2, 50]]) {
    const { g, p, o, card } = scene('parity', 'cpu', { energy: ['data', 'data'] });
    p.hand = Array.from({ length: hand }, () => card('pair'));
    await X.actAttack(g, p, ATK(p.active, 'パリティチェック'));
    ok(o.active.dmg === want, `パリティ 手札${hand}枚 → ${want} のはず: ${o.active.dmg}`);
  }
  // ハミング符号：40ダメージ ＋ 自分を20回復
  {
    const { g, p, o } = scene('hamming', 'cpu', { energy: ['data', 'data'] });
    p.active.dmg = 50;
    await X.actAttack(g, p, ATK(p.active, '1ビット訂正'));
    ok(o.active.dmg === 40 && p.active.dmg === 30, `ハミング 40ダメ・20回復: ${o.active.dmg} / 残りダメージ${p.active.dmg}`);
  }
  // LDPC符号：特殊状態にならない
  {
    const { g, p } = scene('ldpc', 'cpu');
    for (const s of ['sleep', 'freeze', 'garble', 'bug']) X.setStatus(g, p.active, s);
    ok(!Object.values(p.active.status).some(Boolean), `LDPC 特殊状態にならない: ${JSON.stringify(p.active.status)}`);
  }
  // リレー回路：AND は2回ともオモテで70、OR は1回でもオモテで50
  for (const [atk, seq, want] of [['AND回路', [H, H], 70], ['AND回路', [H, T], 0], ['OR回路', [T, H], 50], ['OR回路', [T, T], 0]]) {
    const { g, p, o } = scene('relay', 'ldpc', { energy: ['hw', 'hw'] });
    coins(...seq);
    await X.actAttack(g, p, ATK(p.active, atk));
    ok(o.active.dmg === want, `リレー ${atk} ${seq.map(x => (x < 0.5 ? 'オ' : 'ウ')).join('')} → ${want}: ${o.active.dmg}`);
  }
  // テセウス：前の自分の番にも「迷路学習」を使っていたら +50
  {
    const { g, p, o } = scene('theseus', 'ldpc', { energy: ['ai', 'ai'] });
    await X.actAttack(g, p, ATK(p.active, '迷路学習'));
    const first = o.active.dmg;
    g.turn += 2;
    await X.actAttack(g, p, ATK(p.active, '迷路学習'));
    const second = o.active.dmg - first;
    g.turn += 4; // 1回あいだをあける
    const before = o.active.dmg;
    await X.actAttack(g, p, ATK(p.active, '迷路学習'));
    ok(first === 20 && second === 70 && o.active.dmg - before === 20, `テセウス 20 → 70 → (あいだをあけると) 20: ${first} ${second} ${o.active.dmg - before}`);
  }
  // ワンタイムパッド：「一度きりの鍵」は1回だけ
  {
    const { g, p, o } = scene('otp', 'ldpc', { energy: ['sec', 'sec'] });
    const i = ATK(p.active, '一度きりの鍵');
    ok(E.attackInfo(g, p, i).ok, 'OTP 1回目は使える');
    await X.actAttack(g, p, i);
    ok(o.active.dmg === 70, `OTP 70ダメージ: ${o.active.dmg}`);
    g.turn += 2;
    const info = E.attackInfo(g, p, i);
    ok(!info.ok && /1回だけ/.test(info.reason), `OTP 2回目は使えない: ${JSON.stringify(info)}`);
    ok(await X.actAttack(g, p, i) === false && o.active.dmg === 70, 'OTP 2回目を使おうとしても何も起きない');
    ok(E.attackInfo(g, p, ATK(p.active, '暗号化')).ok, 'OTP もう1つのワザは使える');
  }
  // 文字化けで失敗したときは、鍵を使ったことにならない
  {
    const { g, p } = scene('otp', 'ldpc', { energy: ['sec', 'sec'] });
    p.active.status.garble = true;
    coins(T);
    await X.actAttack(g, p, ATK(p.active, '一度きりの鍵'));
    ok(E.attackInfo(g, p, ATK(p.active, '一度きりの鍵')).ok, 'OTP 文字化けで失敗したら、まだ使える');
  }
  // データ圧縮：無色エネルギーを1個へらす（1番に1回）
  {
    const { g, p, o, card } = scene('ldpc', 'cpu', { energy: ['data', 'data'] });
    const i = ATK(p.active, 'シャノン限界');
    ok(!E.attackInfo(g, p, i).ok, 'DDC はエネルギー2個では使えない');
    const c1 = card('compress'), c2 = card('compress');
    p.hand.push(c1, c2);
    ok(E.handInfo(g, p, c1).ok, 'データ圧縮は使える');
    await X.actTrainer(g, p, c1);
    ok(E.attackInfo(g, p, i).ok, 'データ圧縮のあとは DDC をエネルギー2個で使える');
    const again = E.handInfo(g, p, c2);
    ok(!again.ok && again.reason === 'この番はもう使った', `2枚目は使えない: ${JSON.stringify(again)}`);
    p.active.energy = ['data'];
    ok(!E.attackInfo(g, p, i).ok, '色つきのエネルギーまでは へらない');
    await X.actAttack(g, p, ATK(p.active, '反復復号'));
    ok(o.active.dmg === 30, `反復復号（コストC）はエネルギー1個で使える: ${o.active.dmg}`);
    p.t = X.freshT();
    p.active.energy = ['data', 'data'];
    ok(!E.attackInfo(g, p, i).ok, '次の番には効果が消える');
  }
  // 究極の機械：これをつけたユニットを攻撃したユニットはフリーズ。どうぐはトラッシュ
  {
    const { g, p, o, card } = scene('hamming', 'cpu', { energy: ['data', 'data'] });
    const tool = card('ultimate');
    o.active.tool = tool;
    await X.actAttack(g, p, ATK(p.active, '1ビット訂正'));
    ok(p.active.status.freeze, '攻撃した側がフリーズ');
    ok(!o.active.tool && o.discard.includes(tool), '究極の機械はトラッシュへ');
    // 攻撃した側の番の終わり → 相手の番の終わり → 自分の番ではまだワザが使えない
    await X.finishTurn(g);          // 自分の番の終わり
    await X.beginTurn(g); await X.finishTurn(g); // 相手の番
    await X.beginTurn(g);           // 自分の番
    ok(g.cur === 0 && !E.attackInfo(g, p, 0).ok, '次の自分の番はワザを使えない');
    await X.finishTurn(g);
    ok(!p.active.status.freeze, 'その番の終わりにフリーズが解ける');
  }
  {
    // LDPC符号は、究極の機械でもフリーズしない（どうぐは使われてトラッシュ）
    const { g, p, o, card } = scene('ldpc', 'cpu', { energy: ['data'] });
    const tool = card('ultimate');
    o.active.tool = tool;
    await X.actAttack(g, p, ATK(p.active, '反復復号'));
    ok(!p.active.status.freeze && o.discard.includes(tool), 'LDPC はフリーズしない');
  }
  // クロード・シャノン：山札の上から5枚を見て2枚まで
  {
    const { g, p, card } = scene('bit', 'cpu');
    p.deck = ['import', 'pair', 'parity', 'hamming', 'ldpc', 'relay', 'otp'].map(id => card(id));
    const top5 = p.deck.slice(0, 5).map(c => c.uid);
    const s = card('shannon');
    p.hand.push(s);
    await X.actTrainer(g, p, s);
    const got = p.hand.filter(c => c.id !== 'shannon');
    ok(got.length === 2 && got.every(c => top5.includes(c.uid)), `シャノン：上から5枚のうち2枚: ${got.map(c => c.id)}`);
    ok(p.deck.length === 5 && p.discard.some(c => c.id === 'shannon'), 'シャノン：山札は5枚、シャノンはトラッシュ');
  }
  {
    // 人が使うときは、2枚目を「選ばない」こともできる
    const { g, p, card } = scene('bit', 'cpu');
    p.isCPU = false;
    const asked = [];
    g.io = Object.assign({}, E.NOOP_IO, { choose: async (pl, title, opts, o2) => { asked.push(!!(o2 && o2.cancel)); return asked.length === 1 ? opts[2].value : undefined; } });
    p.deck = ['import', 'pair', 'parity', 'hamming', 'ldpc', 'relay'].map(id => card(id));
    const s = card('shannon');
    p.hand.push(s);
    await X.actTrainer(g, p, s);
    ok(asked.join() === 'false,true', `シャノン：1枚目は必ず、2枚目は選ばなくてもよい: ${asked}`);
    ok(p.hand.length === 1 && p.hand[0].id === 'parity', `シャノン：選んだ1枚だけ: ${p.hand.map(c => c.id)}`);
  }
  console.log(`shannon cards: ${passes} ok, ${fails} NG`);
  if (fails) process.exitCode = 1;
})();
