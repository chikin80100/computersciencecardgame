// 全デッキ総当たりの勝率（左右入れ替えあり）
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
const N = +(process.argv[2] || 40);
(async () => {
  const res = {}; E.PRESETS.forEach(p => { res[p.id] = [0, 0]; });
  for (let i = 0; i < E.PRESETS.length; i++) for (let j = i + 1; j < E.PRESETS.length; j++) {
    const a = E.PRESETS[i], b = E.PRESETS[j];
    for (let k = 0; k < N; k++) {
      const swap = k % 2;
      const ps = [{ name: 'A', isCPU: true, deck: a.cards, energy: a.energy }, { name: 'B', isCPU: true, deck: b.cards, energy: b.energy }];
      if (swap) ps.reverse();
      const g = E.newGame({ io: E.NOOP_IO, players: ps });
      await E.runGame(g);
      let wa = g.winner === null ? 0.5 : (g.winner === (swap ? 1 : 0) ? 1 : 0);
      res[a.id][0] += wa; res[a.id][1]++; res[b.id][0] += 1 - wa; res[b.id][1]++;
    }
  }
  const vals = Object.entries(res).map(([k, v]) => [k.slice(2), 100 * v[0] / v[1]]).sort((x, y) => y[1] - x[1]);
  console.log(vals.map(([k, v]) => `${k} ${v.toFixed(0)}`).join('  '), '| spread', (vals[0][1] - vals[vals.length - 1][1]).toFixed(1));
})();
