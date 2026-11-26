// パックの中身の確率を、ui.js の rollPack そのもので数える
const fs = require('fs'), vm = require('vm'), path = require('path');
const rd = f => fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
const ui = rd('ui.js');
const fnSrc = ui.slice(ui.indexOf('function packPool'), ui.indexOf('function packHTML'));
// rollPack が使う、画面がわの乱数（ui.js の rndU と同じもの）
const rndUSrc = ui.match(/^const rndU = .*$/m)[0];
const ctx = { console, Math, module: {} };
vm.createContext(ctx);
vm.runInContext(rd('data.js') + '\n' + rd('engine.js') + '\nconst owned = id => 0;\n' + rndUSrc + '\n' + fnSrc + '\nthis.rollPack = rollPack; this.packPool = packPool; this.PACKS = PACKS; this.DEF = DEF; this.rarityOf = rarityOf;', ctx);
const N = 300000, slot = [...Array(5)].map(() => ({ 1: 0, 2: 0, 3: 0, 4: 0, h: 0, f: 0 })); // h=☆ホロ f=★フルアート
const seen = {}; let god = 0;
for (const pk of ctx.PACKS) seen[pk.id] = new Set();
for (let i = 0; i < N; i++) {
  const pk = ctx.PACKS[i % ctx.PACKS.length], r = ctx.rollPack(pk);
  if (r[0].god) god++;
  r.forEach((c, j) => { seen[pk.id].add(c.id); if (c.holo && !c.god) slot[j].h++; else if (c.full && !c.god) slot[j].f++; else slot[j][ctx.rarityOf(ctx.DEF[c.id])]++; });
}
slot.forEach((s, j) => console.log('slot', j + 1, Object.entries(s).map(([k, v]) => k + ':' + (100 * v / N).toFixed(1) + '%').join('  ')));
console.log('god packs', (100 * god / N).toFixed(2) + '%');
for (const pk of ctx.PACKS) { const pool = ctx.packPool(pk), miss = pool.filter(id => !seen[pk.id].has(id)); console.log(pk.id, 'pool', pool.length, 'never pulled', miss.length, miss.join(' ')); if (miss.length) process.exitCode = 1; }
// どのパックにも入っていないカード
const inAny = new Set(ctx.PACKS.flatMap(pk => ctx.packPool(pk)));
const orphan = Object.keys(ctx.DEF).filter(id => !inAny.has(id));
console.log('cards in no pack', orphan.length, orphan.join(' '));
if (orphan.length) process.exitCode = 1;
// 全種類そろえるのに何パックかかるか（交換なし・3パックを順番に）
let total = 0; const T = 200;
for (let t = 0; t < T; t++) { const have = new Set(); let n = 0; while (have.size < Object.keys(ctx.DEF).length && n < 5000) { ctx.rollPack(ctx.PACKS[n % ctx.PACKS.length]).forEach(c => have.add(c.id)); n++; } total += n; }
console.log('packs to complete (avg, no exchange):', Math.round(total / T));
