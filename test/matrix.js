// 対戦組み合わせ別の勝率と、ワザの使用状況を見る
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
vm.createContext(ctx); vm.runInContext(src, ctx);
const E = ctx.module.exports;
const N = +(process.argv[2] || 80);
const atkUse = {}, cardPlay = {};
(async () => {
  const ids = E.PRESETS.map(p => p.id);
  const M = {};
  for (const da of E.PRESETS) for (const db of E.PRESETS) {
    if (da === db) continue;
    let w = 0;
    for (let i = 0; i < N; i++) {
      let g;
      const io = Object.assign({}, E.NOOP_IO, { log(msg) { const m = msg.match(/の「(.+?)」！/); if (m) atkUse[m[1]] = (atkUse[m[1]] || 0) + 1; const t = msg.match(/は「(.+?)」を(使った|つけた)/); if (t) cardPlay[t[1]] = (cardPlay[t[1]] || 0) + 1; } });
      g = E.newGame({ io, players: [
        { name: 'A', isCPU: true, deck: da.cards, energy: da.energy }, { name: 'B', isCPU: true, deck: db.cards, energy: db.energy }] });
      await E.runGame(g);
      if (g.winner === 0) w++; else if (g.winner === null) w += 0.5;
    }
    M[da.id + '|' + db.id] = w / N;
  }
  console.log('row vs col (row win%)');
  console.log('        ' + ids.map(i => i.slice(2).padStart(6)).join(''));
  for (const a of ids) console.log(a.slice(2).padEnd(8) + ids.map(b => a === b ? '     -' : String(Math.round(100 * (M[a + '|' + b] + (1 - M[b + '|' + a])) / 2)).padStart(6)).join(''));
  console.log(Object.entries(atkUse).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
  console.log(Object.entries(cardPlay).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
})();
