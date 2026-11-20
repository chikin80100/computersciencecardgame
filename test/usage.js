// 新しいカードが実際に使われているかを、ログから数える
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
const P = id => E.PRESETS.find(p => p.id === id);
const words = ['「アラン・チューリング」を使った', '「ジョン・フォン・ノイマン」を使った', '「暗号解読」を使った', '「ゲーム理論」を使った', '「チューリングテスト」を使った',
  'を手札にもどした', 'チューリングテスト+', 'のエネルギーを2個トラッシュ', 'パンチカード', '「読み取り」', '「総当たり解読」', '「並列テープ読み取り」', '「自動計算」', '「止まるか？」', '「オウム返し」',
  '「プログラム内蔵」', '「全力演算」', '「ランダムサンプリング」', '「最悪を最小に」', '「カード制御」', '「ローター暗号」'];
(async () => {
  const cnt = {}; words.forEach(w => { cnt[w] = 0; });
  const pairs = [['p_turing', 'p_neumann'], ['p_turing', 'p_ai'], ['p_neumann', 'p_sec'], ['p_ai', 'p_quantum']];
  for (const [a, b] of pairs) for (let k = 0; k < 30; k++) {
    // チューリングテストを試すため、AIデッキに1枚入れる
    const da = Object.assign({}, P(a).cards), db = Object.assign({}, P(b).cards);
    if (a === 'p_ai') { da.turtest = 2; da.alttab = 0; da.patch = 0; }
    const g = E.newGame({ io: E.NOOP_IO, players: [{ name: 'A', isCPU: true, deck: da, energy: P(a).energy }, { name: 'B', isCPU: true, deck: db, energy: P(b).energy }] });
    await E.runGame(g);
    for (const l of g.log) for (const w of words) if (String(l.msg || l).includes(w)) cnt[w]++;
  }
  console.log(cnt);
})();
