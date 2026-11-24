// カードの効果をたしかめるテスト（shannon.js・pioneer.js）で使う道具
// 場面（2人の場）を自分で作って、エンジンの関数を直接よぶ
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
const X = ctx; // engine.js の関数（actAttack など）は、ここから呼べる

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('NG', msg); } }
function report(name) { console.log(`${name}: ${passes} ok, ${fails} NG`); if (fails) process.exitCode = 1; }
const H = 0.1, T = 0.9; // コインのオモテ・ウラ（0.5より小さいとオモテ）
function coins(...seq) { let i = 0; E.setRNG(() => (i < seq.length ? seq[i++] : 0.3)); }

let UID = 10000; // テストで作るカードの番号（エンジンの番号と重ならないように大きくする）
const card = id => ({ uid: ++UID, id });
// 2人の場を用意する。p がワザを使う側（番の人）、o が相手
function scene(meId, foeId, opt = {}) {
  E.resetUid();
  const g = E.newGame({ io: E.NOOP_IO, players: [
    { name: 'A', isCPU: true, deck: { pair: 2, import: 2 }, energy: ['data'] },
    { name: 'B', isCPU: true, deck: { pair: 2, import: 2 }, energy: ['data'] },
  ] });
  const [p, o] = g.players;
  g.turn = 5; g.cur = 0; p.turns = 3; o.turns = 3;
  p.active = X.mkMon(card(meId), 1);
  o.active = X.mkMon(card(foeId), 1);
  p.hand = []; o.hand = [];
  if (opt.energy) p.active.energy = opt.energy.slice();
  if (opt.bench) p.bench = opt.bench.map(id => X.mkMon(card(id), 1));
  if (opt.foeBench) o.bench = opt.foeBench.map(id => X.mkMon(card(id), 1));
  return { g, p, o };
}
const ATK = (m, name) => E.DEF[m.id].atk.findIndex(a => a.name === name);
const logHas = (g, text) => g.log.some(l => String(l.msg || l).includes(text));

module.exports = { E, X, ok, report, H, T, coins, card, scene, ATK, logHas };
