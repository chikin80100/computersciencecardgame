// CPU同士の自動対戦でルールエンジンを検査する
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = ['data.js', 'engine.js'].map(f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8')).join('\n');
const ctx = { console, module: { exports: {} }, Math, setTimeout, Promise };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const E = ctx.module.exports;

const problems = [];
function check(cond, msg) { if (!cond) problems.push(msg); }

// データの整合性
for (const d of E.MONSTERS) {
  check(d.hp > 0, `${d.id}: hp`);
  check([1, 2, 3].includes(d.stage), `${d.id}: stage`);
  if (d.stage > 1) check(E.MONSTERS.some(x => x.name === d.from && x.stage === d.stage - 1), `${d.id}: 進化元 ${d.from} がない`);
  check(d.desc && d.desc.length > 20, `${d.id}: desc`);
  for (const a of d.atk) check(a.costArr.every(Boolean), `${d.id}/${a.name}: cost`);
}
for (const p of E.PRESETS) {
  check(E.deckCount(p.cards) === 20, `${p.id}: ${E.deckCount(p.cards)}枚`);
  for (const id in p.cards) { check(E.DEF[id], `${p.id}: 不明なカード ${id}`); check(p.cards[id] <= 2, `${p.id}: ${id} が3枚以上`); }
  check(Object.keys(p.cards).some(id => E.DEF[id].kind === 'mon' && E.DEF[id].stage === 1), `${p.id}: v1がない`);
  for (const id in p.cards) { const d = E.DEF[id]; if (d.kind === 'mon' && d.stage > 1) check(Object.keys(p.cards).some(x => E.DEF[x].name === d.from), `${p.id}: ${id} の進化元がデッキにない`); }
}

const N = +(process.argv[2] || 30);
const stats = {};
let games = 0, draws = 0, turnsSum = 0, errors = 0, maxTurns = 0;
const reasons = {};

async function play(da, db) {
  let g;
  const io = Object.assign({}, E.NOOP_IO, {
    render() {
      if (!g) return;
      for (const p of g.players) {
        const inPlay = E.inPlay(p);
        const count = p.deck.length + p.hand.length + p.discard.length + inPlay.reduce((s, m) => s + m.cards.length + (m.tool ? 1 : 0), 0);
        if (count !== 20) problems.push(`カード枚数が${count}枚 (turn ${g.turn}, ${p.deckName})`);
        if (p.bench.length > 3) problems.push(`ベンチ${p.bench.length}体`);
        for (const m of inPlay) {
          const sts = ['sleep', 'freeze', 'garble'].filter(k => m.status[k]);
          if (sts.length > 1) problems.push(`特殊状態が重複 ${sts}`);
          if (p.bench.includes(m) && Object.keys(m.status).some(k => m.status[k] && k !== 'freezeTurn')) problems.push(`ベンチのユニットに特殊状態: ${m.id}`);
        }
        const uids = inPlay.map(m => m.uid);
        if (new Set(uids).size !== uids.length) problems.push('同じユニットが重複');
      }
    },
  });
  g = E.newGame({ io, players: [
    { name: 'A', isCPU: true, deck: da.cards, energy: da.energy, deckName: da.id },
    { name: 'B', isCPU: true, deck: db.cards, energy: db.energy, deckName: db.id },
  ] });
  await E.runGame(g);
  return g;
}

(async () => {
  for (const da of E.PRESETS) for (const db of E.PRESETS) {
    for (let i = 0; i < N; i++) {
      let g;
      try { g = await play(da, db); } catch (e) { errors++; problems.push(`例外 ${da.id} vs ${db.id}: ${e.stack.split('\n').slice(0, 4).join(' | ')}`); continue; }
      games++;
      turnsSum += g.turn; maxTurns = Math.max(maxTurns, g.turn);
      reasons[g.reason.replace(/^(A|B)/, 'X')] = (reasons[g.reason.replace(/^(A|B)/, 'X')] || 0) + 1;
      if (!g.over) problems.push('終わっていない');
      stats[da.id] = stats[da.id] || { w: 0, l: 0, d: 0 };
      stats[db.id] = stats[db.id] || { w: 0, l: 0, d: 0 };
      if (g.winner === null) { draws++; stats[da.id].d++; stats[db.id].d++; }
      else { const w = g.winner === 0 ? da.id : db.id, l = g.winner === 0 ? db.id : da.id; stats[w].w++; stats[l].l++; }
    }
  }
  console.log(`games=${games} errors=${errors} draws=${draws} avgTurns=${(turnsSum / games).toFixed(1)} maxTurns=${maxTurns}`);
  for (const id in stats) { const s = stats[id]; console.log(id.padEnd(8), `勝率 ${(100 * s.w / (s.w + s.l + s.d)).toFixed(0)}%`, s); }
  console.log(reasons);
  const uniq = [...new Set(problems)];
  console.log(`problems: ${problems.length} (unique ${uniq.length})`);
  uniq.slice(0, 25).forEach(p => console.log(' -', p));
  if (problems.length || errors) process.exitCode = 1;
})();
