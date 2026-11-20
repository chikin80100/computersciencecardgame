// 実験: 特定デッキの勝率を、カードの調整案ごとに比べる
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8')).join('\n');
async function run(label, patch, focus, N) {
  const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const E = ctx.module.exports;
  patch(E);
  const me = E.PRESETS.find(p => p.id === focus);
  let w = 0, n = 0;
  for (const op of E.PRESETS) { if (op === me) continue;
    for (let i = 0; i < N; i++) for (const side of [0, 1]) {
      const ps = [{ name: 'A', isCPU: true, deck: me.cards, energy: me.energy }, { name: 'B', isCPU: true, deck: op.cards, energy: op.energy }];
      if (side) ps.reverse();
      const g = E.newGame({ io: E.NOOP_IO, players: ps });
      await E.runGame(g);
      const myIdx = side ? 1 : 0;
      if (g.winner === myIdx) w++; else if (g.winner === null) w += 0.5;
      n++;
    } }
  console.log(label.padEnd(28), (100 * w / n).toFixed(1) + '%');
}
(async () => {
  const N = 120;
  await run('hw baseline', E => {}, 'p_hw', N);
  await run('hw: no sleep', E => { E.DEF.transistor.atk[0].after = async () => {}; }, 'p_hw', N);
  await run('hw: no hackathon', E => { const c = E.PRESETS.find(p => p.id === 'p_hw').cards; delete c.hackathon; c.patch = 2; }, 'p_hw', N);
  await run('hw: no update', E => { const c = E.PRESETS.find(p => p.id === 'p_hw').cards; delete c.update; c.patch = 2; }, 'p_hw', N);
  await run('hw: gpu 30x', E => { E.DEF.gpu.atk[1].dmgFn = async c => { c.dmg = 30 * await c.heads(4); }; }, 'p_hw', N);
  await run('hw: gate no bonus', E => { E.DEF.gate.atk[0].dmgFn = async c => {}; }, 'p_hw', N);
})();
