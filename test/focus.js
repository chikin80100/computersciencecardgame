// 指定したデッキだけ、ほかの全デッキと対戦させた勝率
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
const N = +(process.argv[2] || 40);
const focus = (process.argv[3] || 'p_turing,p_neumann').split(',');
(async () => {
  for (const fid of focus) {
    const a = E.PRESETS.find(p => p.id === fid);
    let w = 0, n = 0; const per = [];
    for (const b of E.PRESETS) {
      if (b.id === fid) continue;
      let wb = 0;
      for (let k = 0; k < N; k++) {
        const swap = k % 2;
        const ps = [{ name: 'A', isCPU: true, deck: a.cards, energy: a.energy }, { name: 'B', isCPU: true, deck: b.cards, energy: b.energy }];
        if (swap) ps.reverse();
        const g = E.newGame({ io: E.NOOP_IO, players: ps });
        await E.runGame(g);
        const r = g.winner === null ? 0.5 : (g.winner === (swap ? 1 : 0) ? 1 : 0);
        wb += r; w += r; n++;
      }
      per.push(`${b.id.slice(2)} ${(100 * wb / N).toFixed(0)}`);
    }
    console.log(`${fid}: ${(100 * w / n).toFixed(1)}%  |  ${per.join('  ')}`);
  }
})();
