// 同じ種の乱数なら、同じ対戦になるか（Math.random が残っていないか）を確かめる
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const run = async (seed, a, b) => {
  const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const E = ctx.module.exports;
  E.setRNG(E.seededRNG(seed)); E.resetUid();
  const P = id => E.PRESETS.find(p => p.id === id);
  const g = E.newGame({ io: E.NOOP_IO, players: [{ name: 'A', isCPU: true, deck: P(a).cards, energy: P(a).energy }, { name: 'B', isCPU: true, deck: P(b).cards, energy: P(b).energy }] });
  await E.runGame(g);
  return g.log.map(l => l.msg || l).join('\n');
};
(async () => {
  let same = 0, n = 0;
  const pairs = [['p_turing', 'p_neumann'], ['p_ai', 'p_chain'], ['p_net', 'p_quantum'], ['p_data', 'p_compile'], ['p_shannon', 'p_turing'], ['p_ada', 'p_hopper'], ['p_weiser', 'p_tron'], ['p_ochiai', 'p_weiser'], ['p_tron', 'p_ochiai']];
  for (const [a, b] of pairs) for (const seed of [1, 42, 9999]) {
    const x = await run(seed, a, b), y = await run(seed, a, b);
    n++; if (x === y) same++; else console.log('DIFF', a, b, seed);
  }
  console.log(`same ${same}/${n}`);
  if (same !== n) process.exitCode = 1;
})();
