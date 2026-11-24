// 1つのデッキだけを入れ替え案ごとに試す
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8')).join('\n');
async function run(label, focus, patch, N) {
  const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const E = ctx.module.exports; patch(E);
  const me = E.PRESETS.find(p => p.id === focus);
  let w = 0, n = 0;
  for (const op of E.PRESETS) { if (op === me) continue;
    for (let i = 0; i < N; i++) {
      const ps = [{ name: 'A', isCPU: true, deck: me.cards, energy: me.energy }, { name: 'B', isCPU: true, deck: op.cards, energy: op.energy }];
      const sw = i % 2; if (sw) ps.reverse();
      const g = E.newGame({ io: E.NOOP_IO, players: ps }); await E.runGame(g);
      const mi = sw ? 1 : 0; w += g.winner === mi ? 1 : g.winner === null ? .5 : 0; n++;
    } }
  console.log(label.padEnd(34), (100 * w / n).toFixed(1));
}
const swap = (E, id, from, to) => { const c = E.PRESETS.find(p => p.id === id).cards; c[from]--; if (!c[from]) delete c[from]; c[to] = (c[to] || 0) + 1; };
module.exports = { run, swap };
if (require.main === module) (async () => {
  const N = 60;
  await run('data baseline', 'p_data', E => {}, N);
  await run('data rdb->hash', 'p_data', E => swap(E, 'p_data', 'rdb', 'hash'), N);
  await run('data pqueue->stack', 'p_data', E => { swap(E, 'p_data', 'pqueue', 'stack'); }, N);
  await run('data no SELECT fetch', 'p_data', E => { E.DEF.rdb.atk[0].after = async () => {}; }, N);
  await run('data no pqueue heal', 'p_data', E => { E.DEF.pqueue.atk[0].after = async () => {}; }, N);
  await run('chain baseline', 'p_chain', E => {}, N);
  await run('chain no lock', 'p_chain', E => { E.DEF.ransom.atk[1].after = async () => {}; }, N);
  await run('chain no phishing discard', 'p_chain', E => { E.DEF.phishing.atk[0].after = async () => {}; }, N);
})();
