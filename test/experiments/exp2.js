const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8')).join('\n');
function load(patch) { const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise }; vm.createContext(ctx); vm.runInContext(src, ctx); const E = ctx.module.exports; patch(E); return E; }
async function rates(label, patch, N) {
  const E = load(patch);
  const res = {};
  for (const a of E.PRESETS) { res[a.id] = [0, 0]; }
  for (let ai = 0; ai < E.PRESETS.length; ai++) for (let bi = ai + 1; bi < E.PRESETS.length; bi++) {
    const a = E.PRESETS[ai], b = E.PRESETS[bi];
    for (let i = 0; i < N; i++) {
      const g = E.newGame({ io: E.NOOP_IO, players: [{ name: 'A', isCPU: true, deck: a.cards, energy: a.energy }, { name: 'B', isCPU: true, deck: b.cards, energy: b.energy }] });
      await E.runGame(g);
      const wa = g.winner === 0 ? 1 : g.winner === null ? 0.5 : 0;
      res[a.id][0] += wa; res[a.id][1]++; res[b.id][0] += 1 - wa; res[b.id][1]++;
    }
  }
  const vals = Object.entries(res).map(([k, v]) => [k.slice(2), 100 * v[0] / v[1]]);
  const spread = Math.max(...vals.map(v => v[1])) - Math.min(...vals.map(v => v[1]));
  console.log(label.padEnd(30), vals.map(([k, v]) => `${k} ${v.toFixed(0)}`).join('  '), ' | spread', spread.toFixed(1));
}
const swap = (E, id, from, to) => { const c = E.PRESETS.find(p => p.id === id).cards; c[from]--; if (!c[from]) delete c[from]; c[to] = (c[to] || 0) + 1; };
(async () => {
  const N = +(process.argv[2] || 200);
  await rates('baseline', E => {}, N);
  await rates('hw hack->patch', E => { swap(E, 'p_hw', 'hackathon', 'patch'); }, N);
  await rates('hw hack->patch, data reboot->hack', E => { swap(E, 'p_hw', 'hackathon', 'patch'); swap(E, 'p_data', 'reboot', 'hackathon'); }, N);
  await rates('+ net patch->hack', E => { swap(E, 'p_hw', 'hackathon', 'patch'); swap(E, 'p_data', 'reboot', 'hackathon'); swap(E, 'p_net', 'patch', 'hackathon'); }, N);
})();
