// 「プログラミングの先駆者」シリーズ（エイダ・ラブレス／グレース・ホッパー）のカードの効果を、場面を作って1つずつ確かめる
//   node test/pioneer.js
const { E, X, ok, report, H, T, coins, card, scene, ATK, logHas } = require('./_scene.js');

(async () => {
  // ノートG：ベルヌーイ数は 使った回数×40（40 → 80 → 120）
  {
    const { g, p, o } = scene('noteg', 'cpu', { energy: ['algo', 'algo'] });
    o.active.dmg = 0;
    const i = ATK(p.active, 'ベルヌーイ数');
    const got = [];
    for (let k = 0; k < 3; k++) { const before = o.active.dmg; await X.actAttack(g, p, i); got.push(o.active.dmg - before); g.turn += 2; o.active.dmg = 0; }
    ok(got.join() === '40,80,120', `ノートG 40→80→120: ${got}`);
    // CPUの見積もり（dry）では回数がふえない
    const before = p.active.loops;
    await X.evalAttack(g, p, p.active, E.DEF.noteg.atk[i]);
    ok(p.active.loops === before, 'ノートG：CPUの見積もりでは回数がふえない');
  }
  // 二重ループ：オモテの数の2乗×20
  for (const [seq, want] of [[[H, H, T], 80], [[H, H, H], 180], [[T, T, T], 0], [[H, T, T], 20]]) {
    const { g, p, o } = scene('nestloop', 'cpu', { energy: ['algo', 'algo', 'algo'] });
    coins(...seq);
    await X.actAttack(g, p, ATK(p.active, 'n²回のくり返し'));
    const label = `二重ループ ${seq.map(x => (x < 0.5 ? 'オ' : 'ウ')).join('')} → ${want}`;
    if (want >= 140) ok(logHas(g, `${want}ダメージ`) && (!o.active || o.active.id !== 'cpu'), `${label}（HP140のCPUはダウン）`);
    else ok(o.active.dmg === want, `${label}: ${o.active.dmg}`);
  }
  // ジャカード織機：交互なら +70
  for (const [seq, want] of [[[H, T, H, T], 100], [[T, H, T, H], 100], [[H, H, T, H], 30], [[T, T, T, T], 30]]) {
    const { g, p, o } = scene('jacquard', 'cpu', { energy: ['hw', 'hw'] });
    coins(...seq);
    await X.actAttack(g, p, ATK(p.active, '模様を織る'));
    // CPU（hw）はネットワークに弱い。ジャカード（hw）→ CPU（hw）は弱点にならない
    ok(o.active.dmg === want, `ジャカード ${seq.map(x => (x < 0.5 ? 'オ' : 'ウ')).join('')} → ${want}: ${o.active.dmg}`);
  }
  // 自動作曲：自分の場のタイプの数×20（同じタイプは1つ）
  {
    const { g, p, o } = scene('compose', 'cpu', { energy: ['ai', 'ai'], bench: ['loop', 'func', 'noteg'] });
    await X.actAttack(g, p, ATK(p.active, 'ハーモニー'));
    ok(o.active.dmg === 60, `自動作曲 ai・none・algo の3種類 → 60: ${o.active.dmg}`);
  }
  // Ada言語：受けるダメージ -20
  {
    const { g, p, o } = scene('func', 'adalang', { energy: ['data', 'data'] });
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(o.active.dmg === 10, `Ada言語 30-20 → 10: ${o.active.dmg}`);
  }
  // ラブレスの反論：AIタイプのワザだけ -30
  {
    const { g, p, o } = scene('compose', 'cpu', { energy: ['ai', 'ai'], bench: ['loop', 'func', 'noteg'] });
    o.active.tool = card('lovelace');
    await X.actAttack(g, p, ATK(p.active, 'ハーモニー'));
    ok(o.active.dmg === 30 && logHas(g, 'ラブレスの反論-30'), `ラブレスの反論 60-30 → 30: ${o.active.dmg}`);
  }
  {
    const { g, p, o } = scene('func', 'cpu', { energy: ['data', 'data'] });
    o.active.tool = card('lovelace');
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(o.active.dmg === 30, `ラブレスの反論はAI以外には効かない: ${o.active.dmg}`);
  }
  // 詩的科学：どの色のエネルギーでもワザが使える
  {
    const { g, p, o } = scene('noteg', 'cpu', { energy: ['hw', 'net'] });
    const i = ATK(p.active, 'ベルヌーイ数');
    ok(!E.attackInfo(g, p, i).ok, '詩的科学の前：アルゴリズムのエネルギーがないので使えない');
    const c1 = card('poetical'), c2 = card('poetical');
    p.hand.push(c1, c2);
    await X.actTrainer(g, p, c1);
    ok(E.attackInfo(g, p, i).ok, '詩的科学のあと：どの色でも使える');
    ok(!E.handInfo(g, p, c2).ok, '詩的科学は1番に1回');
    p.active.energy = ['hw'];
    ok(!E.attackInfo(g, p, i).ok, '数が足りなければ使えない');
    p.hand.push(card('compress'));
    await X.actTrainer(g, p, p.hand[p.hand.length - 1]);
    ok(E.attackInfo(g, p, i).ok, '詩的科学＋データ圧縮で、エネルギー1個でも使える');
    p.t = X.freshT(); p.active.energy = ['hw', 'net'];
    ok(!E.attackInfo(g, p, i).ok, '次の番には効果が消える');
  }
  // エイダ・ラブレス：山札からコマンドを2枚まで（エイダはのぞく）
  {
    const { g, p } = scene('noteg', 'cpu');
    p.deck = ['loop', 'ada', 'pair', 'poetical', 'nestloop', 'lovelace'].map(card);
    const a = card('ada');
    p.hand.push(a);
    ok(E.handInfo(g, p, a).ok, 'エイダは使える');
    await X.actTrainer(g, p, a);
    const got = p.hand.map(c => c.id).filter(id => id !== 'ada');
    ok(got.length === 2 && got.every(id => E.DEF[id].kind !== 'mon'), `エイダ：コマンドを2枚 ${got}`);
    ok(p.deck.some(c => c.id === 'ada'), 'エイダ：山札のエイダは選ばない');
  }
  {
    const { g, p } = scene('noteg', 'cpu');
    p.deck = ['loop', 'ada', 'nestloop'].map(card);
    const a = card('ada'); p.hand.push(a);
    const info = E.handInfo(g, p, a);
    ok(!info.ok && info.reason === '山札にコマンドがない', `エイダ：ほかのコマンドがないときは使えない ${JSON.stringify(info)}`);
  }
  // グレース・ホッパー：山札から進化ユニットを2枚まで
  {
    const { g, p } = scene('machinecode', 'cpu');
    p.deck = ['machinecode', 'flowmatic', 'cobol', 'pair', 'nestloop', 'loop'].map(card);
    const h = card('hopper'); p.hand.push(h);
    await X.actTrainer(g, p, h);
    const got = p.hand.map(c => c.id).filter(id => id !== 'hopper');
    ok(got.length === 2 && got.every(id => E.DEF[id].stage >= 2), `ホッパー：進化ユニットを2枚 ${got}`);
  }
  // 機械語 → FLOW-MATIC（1枚引く） → COBOL（1回だけHP10で持ちこたえる）
  {
    const { g, p, o } = scene('flowmatic', 'cpu', { energy: ['data', 'data'] });
    p.deck = ['pair', 'import'].map(card);
    await X.actAttack(g, p, ATK(p.active, '英語で書く'));
    ok(o.active.dmg === 40 && p.hand.length === 1, `FLOW-MATIC 40ダメージ＋1枚引く: ${o.active.dmg} / 手札${p.hand.length}`);
  }
  {
    const { g, p, o } = scene('mark1', 'cobol', { energy: ['hw', 'hw', 'hw'], foeBench: ['machinecode'] });
    o.active.dmg = 100; // 残りHP40
    await X.actAttack(g, p, ATK(p.active, '紙テープの命令'));
    ok(o.active && o.active.id === 'cobol' && E.hpLeft(o.active) === 10, `COBOL：1回目はHP10で残る（残り ${o.active && E.hpLeft(o.active)}）`);
    // マークIは次の自分の番ワザを使えない
    g.turn += 2;
    const info = E.attackInfo(g, p, 0);
    ok(!info.ok && /この番はワザを使えない/.test(info.reason), `マークI：次の番は休み ${JSON.stringify(info)}`);
    g.turn += 2;
    ok(E.attackInfo(g, p, 0).ok, 'マークI：その次の番は使える');
    await X.actAttack(g, p, ATK(p.active, '歯車の計算'));
    ok(!o.active || o.active.id !== 'cobol', 'COBOL：2回目はダウンする');
  }
  // 本物のバグ：相手をバグにする
  {
    const { g, p, o } = scene('moth', 'cpu', { energy: ['data'] });
    await X.actAttack(g, p, ATK(p.active, 'リレーにはさまる'));
    ok(o.active.status.bug && o.active.dmg === 10, `本物のバグ：10ダメージ＋バグ: ${JSON.stringify(o.active.status)}`);
  }
  // 作業日誌：特殊状態を1回ふせいで、トラッシュ
  {
    const { g, p, o } = scene('moth', 'cpu', { energy: ['data'] });
    const lb = card('logbook');
    o.active.tool = lb;
    await X.actAttack(g, p, ATK(p.active, 'リレーにはさまる'));
    ok(!o.active.status.bug && !o.active.tool && o.discard.includes(lb), '作業日誌：バグにならず、トラッシュへ');
    g.turn += 2;
    await X.actAttack(g, p, ATK(p.active, 'リレーにはさまる'));
    ok(o.active.status.bug, '作業日誌がなくなったら、バグになる');
  }
  // ナノ秒の針金：エネルギーを1個つけかえる（人が選ぶ）
  {
    const { g, p } = scene('cobol', 'cpu', { energy: ['data'], bench: ['machinecode'] });
    p.bench[0].energy = ['data', 'hw'];
    p.isCPU = false;
    const answers = [p.bench[0], 'hw', p.active];
    g.io = Object.assign({}, E.NOOP_IO, { choose: async (pl, title, opts) => { const want = answers.shift(); const o = opts.find(x => x.value === want); return o && o.value; } });
    const ns = card('nanosec'); p.hand.push(ns);
    ok(E.handInfo(g, p, ns).ok, 'ナノ秒の針金は使える');
    await X.actTrainer(g, p, ns);
    ok(p.active.energy.join() === 'data,hw' && p.bench[0].energy.join() === 'data', `ナノ秒の針金：ベンチのhwをバトル場へ ${p.active.energy} / ${p.bench[0].energy}`);
  }
  {
    // CPU：バトル場のワザが使えるようになるときだけ使う
    const { g, p } = scene('cobol', 'cpu', { energy: ['data', 'data'], bench: ['machinecode'] });
    p.bench[0].energy = ['data'];
    const ns = card('nanosec'); p.hand.push(ns);
    const plan = X.aiNanoPlan(g, p);
    ok(plan && plan.from === p.bench[0] && plan.to === p.active, 'CPU：DDCが使えるようになるので、ベンチから移す');
    await X.aiLateItems(g, p);
    ok(p.active.energy.length === 3 && E.attackInfo(g, p, ATK(p.active, '大量のデータ処理')).ok, `CPU：つけかえて大量のデータ処理が使える ${p.active.energy}`);
  }
  report('pioneer cards');
})();
