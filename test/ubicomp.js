// 「遍在する計算機」シリーズ（マーク・ワイザー／TRON／落合陽一）のカードの効果を、場面を作って1つずつ確かめる
//   node test/ubicomp.js
const { E, X, ok, report, H, T, coins, card, scene, ATK, logHas } = require('./_scene.js');

(async () => {
  // ユビキタス：自分の場のユニットの数×20
  {
    const { g, p, o } = scene('ubiq', 'cpu', { energy: ['hw', 'hw'], bench: ['pc', 'tab'] });
    await X.actAttack(g, p, ATK(p.active, 'どこにでもある'));
    ok(o.active.dmg === 60, `ユビキタス 3体 → 60: ${o.active.dmg}`);
  }
  // タブ・パッド・ボード：2種類で +20、3種類そろうと +40
  {
    // 相手は rbtree（データ。弱点はアルゴリズム）にして、ネットワークの弱点が入らないようにする
    const { g, p, o } = scene('tab', 'rbtree', { energy: ['net'], bench: ['pad', 'board'] });
    await X.actAttack(g, p, ATK(p.active, 'そろう'));
    ok(o.active.dmg === 50, `タブ（3種類）→ 10+40: ${o.active.dmg}`);
  }
  {
    const { g, p, o } = scene('pad', 'rbtree', { energy: ['net'], bench: ['tab', 'tab'] });
    await X.actAttack(g, p, ATK(p.active, 'そろう'));
    ok(o.active.dmg === 40, `パッド（2種類。タブ2枚は1種類と数える）→ 20+20: ${o.active.dmg}`);
  }
  {
    const { g, p, o } = scene('pad', 'rbtree', { energy: ['net'], bench: ['pc'] });
    await X.actAttack(g, p, ATK(p.active, 'そろう'));
    ok(o.active.dmg === 20, `パッドだけ → 20: ${o.active.dmg}`);
  }
  // センサー：ベンチから見張る（1体につき10）。バトル場にいるときは働かない
  {
    const { g, p, o } = scene('func', 'cpu', { energy: ['data', 'data'], foeBench: ['sensor', 'sensor'] });
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(p.active.dmg === 20 && logHas(g, 'センサーが見張っていた'), `センサー2体 → 攻撃した側に20: ${p.active.dmg}`);
  }
  {
    const { g, p, o } = scene('func', 'sensor', { energy: ['data', 'data'], foeBench: ['cpu'] });
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(p.active.dmg === 0, `センサーがバトル場にいるときは見張らない: ${p.active.dmg}`);
  }
  // TRON：ベンチにいると自分のワザ +10（バトル場の相手だけ）
  {
    const { g, p, o } = scene('func', 'cpu', { energy: ['data', 'data'], bench: ['tronex'] });
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(o.active.dmg === 40 && logHas(g, '組込みOS+10'), `TRONがベンチ → 30+10: ${o.active.dmg}`);
  }
  {
    const { g, p, o } = scene('tronex', 'cpu', { energy: ['hw', 'hw'] });
    await X.actAttack(g, p, ATK(p.active, 'リアルタイム処理'));
    ok(o.active.dmg === 30, `TRONがバトル場のときは+10しない: ${o.active.dmg}`);
  }
  // リアルタイムOS：文字化けでも失敗しない
  {
    const { g, p, o } = scene('rtos', 'cpu', { energy: ['algo', 'algo'] });
    p.active.status.garble = true;
    coins(T, T, T);
    await X.actAttack(g, p, ATK(p.active, '締め切りを守る'));
    ok(o.active.dmg === 40, `リアルタイムOS：文字化けでも40: ${o.active.dmg}`);
  }
  // IoT：おたがいの場のユニットの数×10
  {
    const { g, p, o } = scene('iot', 'rbtree', { energy: ['net', 'hw', 'algo'], bench: ['pc'], foeBench: ['tab', 'pad'] });
    await X.actAttack(g, p, ATK(p.active, 'モノのインターネット'));
    ok(o.active.dmg === 50, `IoT 2体+3体 → 50: ${o.active.dmg}`);
  }
  // ICタグ：にげるのにエネルギーがいらない
  {
    const { g, p } = scene('board', 'cpu', { bench: ['pc'] });
    ok(!E.retreatInfo(g, p).ok, 'ボード（にげる2）はエネルギーなしではにげられない');
    const t = card('ictag'); p.hand.push(t);
    await X.actTrainer(g, p, t);
    ok(E.retreatInfo(g, p).ok && E.retreatInfo(g, p).cost === 0, 'ICタグのあとは、エネルギー0でにげられる');
  }
  // 音響浮揚：ベンチにいると、にげるエネルギー -1（2体なら -2）
  {
    const { g, p } = scene('board', 'cpu', { bench: ['levitation', 'levitation'] });
    ok(E.retreatInfo(g, p).cost === 0, `音響浮揚2体 → ボードのにげるは0: ${E.retreatInfo(g, p).cost}`);
  }
  // 環境発電：ベンチにいると、自分の番のはじめにエネルギーが1個
  {
    const { g, p } = scene('pc', 'cpu', { bench: ['ubiq'] });
    p.bench[0].tool = card('harvest');
    p.active.tool = card('harvest');
    g.turn = 4; g.cur = 1;
    await X.finishTurn(g);            // 相手の番のおわり → 自分の番へ
    await X.beginTurn(g);
    ok(g.cur === 0 && p.bench[0].energy.length === 1 && p.active.energy.length === 0, `環境発電：ベンチだけ1個 (${p.bench[0].energy} / ${p.active.energy})`);
  }
  // TRONハウス：場に出す・同じものは出せない・番のおわりにベンチを10回復・新しいフィールドで入れかわる
  {
    const { g, p, o } = scene('pc', 'cpu', { bench: ['tab'], foeBench: ['pad'] });
    const f = card('tronhouse'); p.hand.push(f);
    ok(E.handInfo(g, p, f).ok, 'TRONハウスは出せる');
    await X.actTrainer(g, p, f);
    ok(g.field && g.field.card === f && !p.discard.includes(f), 'TRONハウスが場にある（トラッシュではない）');
    const f2 = card('tronhouse'); o.hand.push(f2);
    const info = E.handInfo(g, o, f2);
    ok(!info.ok && info.reason === 'もう場に出ている', `同じフィールドは出せない ${JSON.stringify(info)}`);
    p.bench[0].dmg = 30; o.bench[0].dmg = 5; p.active.dmg = 30;
    await X.finishTurn(g);
    ok(p.bench[0].dmg === 20 && o.bench[0].dmg === 0 && p.active.dmg === 30, `TRONハウス：おたがいのベンチだけ10回復 (${p.bench[0].dmg}, ${o.bench[0].dmg}, ${p.active.dmg})`);
  }
  // マーク・ワイザー：ベンチの数だけ引く
  {
    const { g, p } = scene('pc', 'cpu', { bench: ['tab', 'pad', 'board'] });
    p.deck = ['pair', 'import', 'grep', 'debug'].map(card);
    const w = card('weiser'); p.hand.push(w);
    await X.actTrainer(g, p, w);
    ok(p.hand.length === 3, `マーク・ワイザー：ベンチ3体 → 3枚引く (${p.hand.length})`);
  }
  // カーム・テクノロジー：ただで入れかえて1枚引く
  {
    const { g, p } = scene('board', 'cpu', { bench: ['pc'] });
    p.deck = ['pair'].map(card);
    const old = p.active;
    const c = card('calm'); p.hand.push(c);
    await X.actTrainer(g, p, c);
    ok(p.active.id === 'pc' && p.bench[0] === old && p.hand.length === 1 && !p.t.retreatDone, 'カーム・テクノロジー：入れかえて1枚引く（にげたことにはならない）');
  }
  // 落合陽一：弱点を必ず突く（+20）。デジタルネイチャーには弱点がない
  {
    const { g, p, o } = scene('func', 'cpu', { energy: ['data', 'data'] });
    p.deck = ['pair'].map(card);
    const c = card('ochiai'); p.hand.push(c);
    await X.actTrainer(g, p, c);
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(o.active.dmg === 50 && logHas(g, '落合陽一+20') && p.hand.length === 1, `落合陽一 30+20: ${o.active.dmg}`);
  }
  {
    const { g, p, o } = scene('func', 'dnature', { energy: ['data', 'data'] });
    p.t.allWeak = 1;
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(o.active.dmg === 30, `デジタルネイチャーには落合陽一の+20も効かない: ${o.active.dmg}`);
  }
  {
    // ネットワーク（hw の弱点）で攻撃しても、デジタルネイチャーには+20されない
    const { g, p, o } = scene('router', 'dnature', { energy: ['net', 'net', 'net'] });
    const i = E.DEF.router.atk.length - 1;
    await X.actAttack(g, p, i);
    ok(!logHas(g, '弱点+20'), 'デジタルネイチャー：弱点がない');
  }
  // 計算機ホログラム：最初に受けるワザのダメージは0（1回だけ）
  {
    const { g, p, o } = scene('func', 'hologram', { energy: ['data', 'data'] });
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    const first = o.active.dmg;
    g.turn += 2;
    await X.actAttack(g, p, ATK(p.active, '呼び出し'));
    ok(first === 0 && o.active.dmg === 30, `ホログラム：1回目0、2回目30 (${first}, ${o.active.dmg})`);
  }
  // デジタルツイン：ダウンしたら、山札から同じユニットがベンチへ
  {
    const { g, p, o } = scene('cpu', 'twin', { energy: ['hw', 'hw', 'hw', 'hw'] });
    o.deck = ['twin', 'pair'].map(card);
    o.active.dmg = 60;
    const i = E.DEF.cpu.atk.findIndex(a => a.dmg >= 10 && a.costArr.length <= 4);
    await X.actAttack(g, p, i);
    await X.checkKOs(g);
    ok(logHas(g, '「分身」で') && (o.active && o.active.id === 'twin' || o.bench.some(b => b.id === 'twin')) && !g.over, `デジタルツイン：ダウンしても、山札の分身が出る (over=${g.over})`);
  }
  // null²：受けたダメージの半分（一の位は切り捨て）をはね返す。「null」で相手のどうぐをトラッシュ
  {
    const { g, p, o } = scene('cpu', 'null2', { energy: ['hw', 'hw', 'hw'] });
    const i = E.DEF.cpu.atk.findIndex(a => E.attackInfo(g, p, E.DEF.cpu.atk.indexOf(a)).ok);
    await X.actAttack(g, p, i);
    const dealt = o.active.dmg;
    ok(p.active.dmg === Math.floor(dealt / 2 / 10) * 10 && logHas(g, 'はね返した'), `null²：${dealt}を受けて ${p.active.dmg} はね返す`);
  }
  {
    const { g, p, o } = scene('null2', 'cpu', { energy: ['data', 'data', 'data'] });
    o.active.tool = card('ram');
    await X.actAttack(g, p, ATK(p.active, 'null'));
    ok(!o.active.tool && o.discard.some(c => c.id === 'ram') && o.active.dmg === 70, `null：70ダメージ＋どうぐをトラッシュ (${o.active.dmg})`);
  }
  // 空中プラズマ：相手のベンチに20。ダウンすればポイント
  {
    const { g, p, o } = scene('pc', 'cpu', { foeBench: ['sensor', 'pad'] });
    o.bench[0].dmg = 10; // 残りHP20
    const c = card('plasma'); p.hand.push(c);
    const pts = p.points;
    await X.actTrainer(g, p, c);
    ok(!o.bench.some(b => b.id === 'sensor') && p.points === pts + 1, `空中プラズマ：残りHP20のセンサーをねらってダウン（ポイント ${pts}→${p.points}）`);
  }
  report('ubicomp cards');
})();
