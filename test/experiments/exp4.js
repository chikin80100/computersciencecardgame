const { run, swap } = require('./exp3.js');
(async () => {
  const N = 50;
  await run('graph baseline', 'p_graph', E => {}, N);
  await run('graph colorless array/graph, algo only', 'p_graph', E => {
    E.DEF.array.atk[0].cost = 'C'; E.DEF.array.atk[0].costArr = ['none'];
    E.DEF.graph.atk[0].cost = 'CC'; E.DEF.graph.atk[0].costArr = ['none', 'none'];
    E.PRESETS.find(p => p.id === 'p_graph').energy = ['algo'];
  }, N);
  await run('hw gpu150', 'p_hw', E => { E.DEF.gpu.hp = 150; }, N);
  await run('hw gpu150 + cpu80', 'p_hw', E => { E.DEF.gpu.hp = 150; E.DEF.cpu.atk[0].dmg = 80; }, N);
  await run('data baseline', 'p_data', E => {}, N);
  await run('data bst50', 'p_data', E => { E.DEF.bst.atk[0].dmg = 50; }, N);
})();
