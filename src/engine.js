'use strict';
/* =========================================================
   CS用語カードバトル — ルールエンジン + CPU
   DOMに依存しない。画面とのやりとりは g.io 経由。
   ========================================================= */

const BENCH_MAX = 3;
const WIN_POINTS = 3;
const TURN_LIMIT = 60; // 両者あわせて60ターンで引き分け（オリジナルルール）
const CPU_STEP = 650;

const CODE = { A: 'algo', D: 'data', N: 'net', S: 'sec', H: 'hw', I: 'ai', C: 'none' };
const DEF = {};
MONSTERS.forEach((d, i) => {
  d.kind = 'mon';
  d.no = i + 1;
  d.atk.forEach(a => { a.costArr = [...a.cost].map(ch => CODE[ch]); });
  DEF[d.id] = d;
});
TRAINERS.forEach((d, i) => { d.no = MONSTERS.length + i + 1; DEF[d.id] = d; });
const ALL_IDS = MONSTERS.map(d => d.id).concat(TRAINERS.map(d => d.id));

/* 進化先（子孫）一覧 */
const DESC = {};
function descendantsOf(name) {
  if (DESC[name]) return DESC[name];
  const out = [];
  for (const d of MONSTERS) if (d.from === name) { out.push(d); out.push(...descendantsOf(d.name)); }
  DESC[name] = out;
  return out;
}

/* ---------- 小道具 ---------- */
let UIDC = 0;
const nextUid = () => ++UIDC;
const resetUid = () => { UIDC = 0; };
/* 乱数。オンライン対戦では、2人の画面で同じ種（シード）の乱数を使い、同じ結果になるようにする */
let RNG = Math.random;
function seededRNG(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function setRNG(fn) { RNG = fn || Math.random; }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(RNG() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const rnd = a => a[Math.floor(RNG() * a.length)];
const isMon = c => DEF[c.id].kind === 'mon';
const isBasic = c => isMon(c) && DEF[c.id].stage === 1;
const isEvo = c => isMon(c) && DEF[c.id].stage > 1;
const other = (g, p) => g.players[1 - p.idx];
const inPlay = p => (p.active ? [p.active] : []).concat(p.bench);
const maxHp = m => DEF[m.id].hp + (m.tool && DEF[m.tool.id].hp ? DEF[m.tool.id].hp : 0);
const hpLeft = m => Math.max(0, maxHp(m) - m.dmg);
const nm = m => DEF[m.id].name;
const stageLabel = d => (d.stage === 1 ? 'v1' : d.stage === 2 ? 'v2' : 'v3');
const deckCount = cards => Object.values(cards).reduce((a, b) => a + b, 0);

const NOOP_IO = {
  choose: async (p, t, opts) => (opts[0] ? opts[0].value : null),
  coin: async () => {}, log() {}, render() {}, pause: async () => {}, banner: async () => {},
  fx() {}, say() {}, setup: async () => {}, humanTurn: async () => {},
};

function L(g, msg, cls) {
  g.log.push({ msg, cls: cls || '', turn: g.turn });
  g.io.log(msg, cls || '');
}

/* ---------- エネルギーの支払い ---------- */
function canPay(energy, cost) {
  return deficit(energy, cost) === 0;
}
function deficit(energy, cost) {
  const pool = {};
  energy.forEach(t => { pool[t] = (pool[t] || 0) + 1; });
  let missing = 0, colorless = 0;
  for (const t of cost) {
    if (t === 'none') { colorless++; continue; }
    if (pool[t] > 0) pool[t]--; else missing++;
  }
  const left = Object.values(pool).reduce((a, b) => a + b, 0);
  return missing + Math.max(0, colorless - left);
}

/* ---------- ゲームの生成 ---------- */
function makeDeck(cards) {
  const out = [];
  for (const id of Object.keys(cards).sort()) for (let i = 0; i < cards[id]; i++) out.push({ uid: nextUid(), id });
  return out;
}
function freshT() {
  return { energyDone: false, supporterDone: false, retreatDone: false, retreatDiscount: 0, dmgBonus: 0, aiBonus: 0, abilityUsed: [] };
}
function newGame(cfg) {
  const g = { players: [], cur: 0, first: 0, turn: 0, over: false, winner: null, reason: '', io: cfg.io || NOOP_IO, log: [] };
  cfg.players.forEach((pc, idx) => {
    g.players.push({
      idx, name: pc.name, isCPU: !!pc.isCPU, isRemote: !!pc.isRemote, deckName: pc.deckName || '',
      deck: shuffle(makeDeck(pc.deck)), hand: [], discard: [], active: null, bench: [], points: 0,
      energyTypes: pc.energy.slice().sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b)), energyCur: null, energyNext: null, turns: 0, t: freshT(), kos: 0,
    });
  });
  return g;
}
function mkMon(card, turn) {
  return {
    uid: card.uid, id: card.id, cards: [card], dmg: 0, energy: [], tool: null, status: {},
    playedTurn: turn, evolvedTurn: -1, activeSince: turn, lastAtk: null, shield: null,
  };
}
function rollEnergy(p) { return rnd(p.energyTypes); }

/* ---------- コイン ---------- */
async function flipCoins(g, n, label, dry) {
  const r = [];
  for (let i = 0; i < n; i++) r.push(RNG() < 0.5);
  if (!dry) {
    await g.io.coin(r, label);
    L(g, `${label}：${r.map(x => (x ? 'オモテ' : 'ウラ')).join('・')}`, 'coin');
  }
  return r;
}
async function flipUntilTails(g, label, dry) {
  const r = [];
  while (r.length < 12) { const h = RNG() < 0.5; r.push(h); if (!h) break; }
  if (!dry) {
    await g.io.coin(r, label);
    L(g, `${label}：オモテ${r.filter(Boolean).length}回`, 'coin');
  }
  return r.filter(Boolean).length;
}

/* ---------- 基本操作 ---------- */
function drawCards(g, p, n) {
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) { L(g, `${p.name}の山札がない`); break; }
    p.hand.push(p.deck.shift());
    k++;
  }
  if (k) L(g, `${p.name}はカードを${k}枚引いた`);
  return k;
}
function heal(g, m, n) {
  const before = m.dmg;
  m.dmg = Math.max(0, m.dmg - n);
  const h = before - m.dmg;
  if (h > 0) { L(g, `${nm(m)}のHPが${h}回復`, 'heal'); g.io.fx(m.uid, 'heal', h); }
  return h;
}
function setStatus(g, m, s) {
  if (!m) return;
  if (s === 'sleep' || s === 'freeze' || s === 'garble') {
    m.status.sleep = false; m.status.freeze = false; m.status.garble = false;
  }
  m.status[s] = true;
  if (s === 'freeze') m.status.freezeTurn = g.turn;
  L(g, `${nm(m)}は${STATUS[s].name}になった`, 'status');
  g.io.fx(m.uid, 'status', s);
}
function clearStatus(m) { m.status = {}; }
function removeFromPlay(p, m) {
  if (p.active === m) p.active = null;
  else p.bench = p.bench.filter(x => x !== m);
}
function promote(g, p, m) {
  p.bench = p.bench.filter(x => x !== m);
  p.active = m;
  m.activeSince = g.turn;
}
function switchActive(g, p, benchMon) {
  const old = p.active;
  const i = p.bench.indexOf(benchMon);
  if (!old || i < 0) return;
  p.bench[i] = old;
  p.active = benchMon;
  clearStatus(old);
  old.shield = null;
  benchMon.activeSince = g.turn;
}
function benchFromDeck(g, p, pred) {
  if (p.bench.length >= BENCH_MAX) { L(g, 'ベンチがいっぱいで出せない'); return null; }
  const idx = p.deck.map((c, i) => (isMon(c) && pred(DEF[c.id]) ? i : -1)).filter(i => i >= 0);
  if (!idx.length) { L(g, '山札に当てはまるユニットがなかった'); shuffle(p.deck); return null; }
  const [card] = p.deck.splice(rnd(idx), 1);
  const m = mkMon(card, g.turn);
  p.bench.push(m);
  shuffle(p.deck);
  L(g, `${p.name}は${DEF[card.id].name}をベンチに出した`);
  g.io.fx(m.uid, 'enter');
  return m;
}
function zoneTypeFor(p, m) {
  const t = DEF[m.id].type;
  return p.energyTypes.includes(t) ? t : rnd(p.energyTypes);
}
function energyLocked(g, p) { return p.lockTurn === g.turn; }
function attachFromZone(g, p, m, n) {
  if (energyLocked(g, p)) { L(g, `${p.name}はランサムウェアの影響でエネルギーをつけられない`); return; }
  for (let i = 0; i < n; i++) m.energy.push(zoneTypeFor(p, m));
  if (n > 0) {
    L(g, `${nm(m)}にエネルギーを${n}個つけた`, 'energy');
    g.io.fx(m.uid, 'energy');
  }
}
function reduction(g, m) {
  let r = 0;
  const ab = DEF[m.id].ability;
  if (ab && ab.reduce) r += ab.reduce;
  if (m.shield && m.shield.turn === g.turn) r += m.shield.amt;
  return r;
}

function ownerOfMon(g, m) { return g.players.find(pl => inPlay(pl).includes(m)); }
/* ワザのダメージを実際にのせる（UPSの判定もここ） */
function applyAttackDamage(g, target, d) {
  if (d <= 0) return 0;
  if (target.tool && target.tool.id === 'ups' && target.dmg + d >= maxHp(target) && hpLeft(target) > 10) {
    d = hpLeft(target) - 10;
    const owner = ownerOfMon(g, target);
    if (owner) owner.discard.push(target.tool);
    target.tool = null;
    L(g, `UPSが作動！ ${nm(target)}はHP10で持ちこたえた`, 'heal');
  }
  target.dmg += d;
  return d;
}
function lowestUnit(pl) {
  return inPlay(pl).slice().sort((a, b) => hpLeft(a) - hpLeft(b) || (b === pl.active) - (a === pl.active))[0];
}

/* ---------- ワザのコンテキスト ---------- */
function mkCtx(g, p, me, atk, dry) {
  const o = other(g, p);
  const c = {
    g, p, o, me, atk, dry, foe: o.active, target: o.active, dmg: atk.dmg || 0, flag: null,
    flip: async () => (await flipCoins(g, 1, atk.name, dry))[0],
    heads: async n => (await flipCoins(g, n, atk.name, dry)).filter(Boolean).length,
    headsUntilTails: async () => flipUntilTails(g, atk.name, dry),
    usedLastTurn: name => !!(me.lastAtk && me.lastAtk.name === name && me.lastAtk.turn === g.turn - 2),
    hpLeft, maxHp,
    name: nm,
    foeAlive: () => !!(c.foe && c.foe === o.active && c.foe.dmg < maxHp(c.foe)),
    say: t => { if (!dry) g.io.say(t); },
    log: t => { if (!dry) L(g, t); },
    heal: (m, n) => heal(g, m, n),
    selfDmg: n => { me.dmg += n; L(g, `${nm(me)}は自分にも${n}ダメージ`, 'dmg'); g.io.fx(me.uid, 'hit', n); },
    status: (m, s) => setStatus(g, m, s),
    draw: n => drawCards(g, p, n),
    benchFromDeck: pred => benchFromDeck(g, p, pred),
    attachFromZone: (m, n) => attachFromZone(g, p, m, n),
    hitBench: n => {
      for (const m of o.bench.slice()) {
        const d = applyAttackDamage(g, m, n);
        L(g, `${o.name}のベンチの${nm(m)}に${d}ダメージ`, 'dmg');
        g.io.fx(m.uid, 'hit', d);
      }
    },
    healMostDamaged: n => {
      const t = inPlay(p).filter(m => m.dmg > 0).sort((a, b) => b.dmg - a.dmg)[0];
      if (t) heal(g, t, n);
    },
    searchDeck: (pred, label) => {
      const idx = p.deck.map((x, i) => (pred(DEF[x.id]) ? i : -1)).filter(i => i >= 0);
      if (!idx.length) { L(g, `山札に${label}がなかった`); return; }
      const [card] = p.deck.splice(rnd(idx), 1);
      p.hand.push(card);
      shuffle(p.deck);
      L(g, `${p.name}は${DEF[card.id].name}を手札に加えた`);
    },
    discardOppHand: n => {
      for (let i = 0; i < n && o.hand.length; i++) {
        const [card] = o.hand.splice(Math.floor(RNG() * o.hand.length), 1);
        o.discard.push(card);
        L(g, `${o.name}の手札の${DEF[card.id].name}がトラッシュされた`, 'dmg');
      }
    },
    lockOppEnergy: () => { o.lockTurn = g.turn + 1; L(g, `${o.name}は次の番、エネルギーゾーンからエネルギーをつけられない`, 'status'); },
    switchSelf: async () => {
      if (!p.bench.length || p.active !== me || me.dmg >= maxHp(me)) return;
      const b = await pick(g, p, `${nm(me)}と入れ替えるベンチのユニットを選んでください`,
        p.bench.map(m => ({ label: nm(m), value: m, mon: m })), () => aiNewActive(g, p));
      if (!b || g.over) return;
      switchActive(g, p, b);
      L(g, `${nm(me)}はベンチにもどり、${nm(b)}がバトル場へ`);
      g.io.fx(b.uid, 'enter');
    },
    discardOwnEnergy: n => {
      const idx = pickDiscard(me, Math.min(n, me.energy.length)).sort((a, b) => b - a);
      idx.forEach(i => me.energy.splice(i, 1));
      if (idx.length) L(g, `${nm(me)}のエネルギーを${idx.length}個トラッシュした`);
    },
    recallCommands: n => recallCommands(g, p, n, null, atk.name),
    chargeBench: async n => {
      if (!p.bench.length) { L(g, 'ベンチにユニットがいない'); return; }
      const b = await pick(g, p, `エネルギーを${n}個つけるベンチのユニットを選んでください`,
        p.bench.map(m => ({ label: nm(m), value: m, mon: m })), () => aiBuildTarget(g, p));
      if (b && !g.over) attachFromZone(g, p, b, n);
    },
  };
  return c;
}

function isWeakHit(me, target, atk) {
  return !!(atk.alwaysWeak || (WEAK[DEF[target.id].type] && WEAK[DEF[target.id].type] === DEF[me.id].type));
}
function finalDamage(g, p, me, target, base, atk) {
  if (base <= 0) return 0;
  const o = other(g, p);
  let d = base;
  if (target === o.active) {
    d += p.t.dmgBonus;
    if (p.t.aiBonus && DEF[me.id].type === 'ai') d += p.t.aiBonus;
    if (isWeakHit(me, target, atk)) d += 20;
  }
  if (!atk.pierce) d -= reduction(g, target);
  return Math.max(0, d);
}

async function dealAttackDamage(g, p, me, target, base, atk) {
  const o = other(g, p);
  const isActive = target === o.active;
  const weak = isActive && isWeakHit(me, target, atk);
  const red = atk.pierce ? 0 : reduction(g, target);
  const d = applyAttackDamage(g, target, finalDamage(g, p, me, target, base, atk));
  const notes = [];
  if (isActive && p.t.dmgBonus) notes.push(`最適化+${p.t.dmgBonus}`);
  if (isActive && p.t.aiBonus && DEF[me.id].type === 'ai') notes.push(`チューリングテスト+${p.t.aiBonus}`);
  if (weak) notes.push(atk.alwaysWeak && WEAK[DEF[target.id].type] !== DEF[me.id].type ? '特徴抽出+20' : '弱点+20');
  if (red) notes.push(`軽減-${red}`);
  L(g, `${nm(target)}に${d}ダメージ${notes.length ? `（${notes.join('・')}）` : ''}`, 'dmg');
  g.io.fx(target.uid, 'hit', d, weak);
  await g.io.pause(380);
  if (isActive && d > 0 && target.tool && target.tool.id === 'honeypot' && p.active === me) {
    me.dmg += 20;
    L(g, `ハニーポットの反撃！ ${nm(me)}に20ダメージ`, 'dmg');
    g.io.fx(me.uid, 'hit', 20);
    await g.io.pause(300);
  }
}

/* ---------- ダウンの処理と勝敗 ---------- */
function endGame(g, winner, reason) {
  if (g.over) return;
  g.over = true;
  g.winner = winner;
  g.reason = reason;
  L(g, reason, 'end');
  g.io.render();
}

async function checkKOs(g) {
  let any = false;
  for (const pl of g.players) {
    for (const m of inPlay(pl).slice()) {
      if (m.dmg >= maxHp(m)) {
        any = true;
        const d = DEF[m.id];
        const opp = other(g, pl);
        g.io.fx(m.uid, 'ko');
        await g.io.pause(520);
        removeFromPlay(pl, m);
        pl.discard.push(...m.cards);
        if (m.tool) pl.discard.push(m.tool);
        const pts = d.ex ? 2 : 1;
        opp.points += pts;
        opp.kos++;
        L(g, `${pl.name}の${d.name}はダウンした！ ${opp.name}は${pts}ポイント獲得`, 'ko');
      }
    }
  }
  if (!any) return;
  g.io.render();
  const lose = g.players.map(pl => other(g, pl).points >= WIN_POINTS || inPlay(pl).length === 0);
  if (lose[0] || lose[1]) {
    if (lose[0] && lose[1]) endGame(g, null, '両者が同時に勝利条件を満たしたため引き分け');
    else {
      const w = lose[0] ? 1 : 0, l = 1 - w;
      const why = g.players[w].points >= WIN_POINTS ? `${g.players[w].name}が${WIN_POINTS}ポイントを獲得` : `${g.players[l].name}の場にユニットがいなくなった`;
      endGame(g, w, why);
    }
    return;
  }
  // バトル場が空いたプレイヤーは、ベンチから新しいユニットを出す（相手→自分の順）
  const order = [other(g, g.players[g.cur]), g.players[g.cur]];
  for (const pl of order) {
    if (!pl.active && pl.bench.length && !g.over) {
      const opts = pl.bench.map(m => ({ label: nm(m), value: m, mon: m }));
      const m = await pick(g, pl, 'バトル場に出すユニットを選んでください', opts, () => aiNewActive(g, pl));
      if (g.over) return;
      promote(g, pl, m || pl.bench[0]);
      L(g, `${pl.name}は${nm(pl.active)}をバトル場に出した`);
      g.io.fx(pl.active.uid, 'enter');
    }
  }
  g.io.render();
}

async function pick(g, p, title, options, aiFn, opts) {
  if (!options.length) return null;
  if (p.isCPU) {
    const v = aiFn ? await aiFn(options) : undefined;
    return v === undefined || v === null ? options[0].value : v;
  }
  const v = await g.io.choose(p, title, options, opts || {});
  return v === undefined ? null : v;
}

/* トラッシュのコマンドを手札にもどす。同じカードは1つにまとめて選ばせる */
async function recallCommands(g, p, n, exclude, label) {
  let got = 0;
  for (let k = 0; k < n && !g.over; k++) {
    const seen = new Set(), uniq = [];
    for (const c of p.discard) if (DEF[c.id].kind !== 'mon' && c.id !== exclude && !seen.has(c.id)) { seen.add(c.id); uniq.push(c); }
    if (!uniq.length) { if (!got) L(g, 'トラッシュにコマンドがなかった'); break; }
    const c = await pick(g, p, `${label}：手札にもどすコマンドを選んでください${n > 1 ? `（${k + 1}枚目）` : ''}`,
      uniq.map(x => ({ label: DEF[x.id].name, value: x, cardId: x.id })), () => aiRecallPick(g, p, uniq), { cancel: k > 0 });
    if (!c || !p.discard.includes(c)) break;
    p.discard.splice(p.discard.indexOf(c), 1);
    p.hand.push(c);
    got++;
    L(g, `${p.name}は「${DEF[c.id].name}」を手札にもどした`);
  }
  return got;
}
const PICK_ORDER = c => { const d = DEF[c.id]; return (d.kind === 'mon' ? 0 : d.kind === 'sup' ? 20 : d.kind === 'item' ? 30 : 40) + (d.stage || 0); };

/* ---------- 準備・ターン進行 ---------- */
function drawOpening(p) {
  const basics = p.deck.map((c, i) => (isBasic(c) ? i : -1)).filter(i => i >= 0);
  const [b] = p.deck.splice(rnd(basics), 1);
  p.hand.push(b);
  for (let k = 0; k < 4 && p.deck.length; k++) p.hand.push(p.deck.shift());
}

function setupPlace(g, p, card) {
  if (!isBasic(card)) return false;
  const i = p.hand.indexOf(card);
  if (i < 0) return false;
  if (!p.active) { p.hand.splice(i, 1); p.active = mkMon(card, 0); return true; }
  if (p.bench.length < BENCH_MAX) { p.hand.splice(i, 1); p.bench.push(mkMon(card, 0)); return true; }
  return false;
}
function setupUnplace(g, p, m) {
  if (p.active === m) {
    p.active = null;
    p.hand.push(m.cards[0]);
    if (p.bench.length) p.active = p.bench.shift();
  } else if (p.bench.includes(m)) {
    p.bench = p.bench.filter(x => x !== m);
    p.hand.push(m.cards[0]);
  }
}

async function setupGame(g) {
  for (const p of g.players) { drawOpening(p); p.energyNext = rollEnergy(p); }
  g.io.render();
  const r = await flipCoins(g, 1, '先攻・後攻を決めるコイントス（オモテならあなたが先攻）', false);
  g.first = r[0] ? 0 : 1;
  L(g, `${g.players[g.first].name}が先攻`);
  await Promise.all(g.players.filter(p => !p.isCPU).map(p => g.io.setup(p)));
  if (g.over) return;
  for (const p of g.players) if (p.isCPU) aiSetup(g, p);
  for (const p of g.players) if (!p.active) setupPlace(g, p, p.hand.find(isBasic));
  for (const p of g.players) p.hand.sort((a, b) => a.uid - b.uid);
  L(g, 'バトル開始！');
  g.cur = g.first;
  g.io.render();
}

async function beginTurn(g) {
  g.turn++;
  const p = g.players[g.cur];
  p.turns++;
  p.t = freshT();
  await g.io.banner(p);
  if (p.deck.length) {
    p.hand.push(p.deck.shift());
    L(g, `── ターン${g.turn}：${p.name}の番。カードを1枚引いた`, 'turn');
  } else {
    L(g, `── ターン${g.turn}：${p.name}の番。山札がないので引けない`, 'turn');
  }
  if (g.turn === 1) {
    p.energyCur = null;
    L(g, '先攻の最初の番は、エネルギーが出ない');
  } else {
    p.energyCur = p.energyNext || rollEnergy(p);
    if (energyLocked(g, p)) L(g, `${p.name}はランサムウェアの影響で、この番エネルギーをつけられない`, 'status');
    p.energyNext = rollEnergy(p);
  }
  g.io.render();
}

async function checkup(g) {
  const cur = g.players[g.cur];
  for (const pl of [cur, other(g, cur)]) {
    const m = pl.active;
    if (!m) continue;
    if (m.status.bug) {
      m.dmg += 10;
      L(g, `${nm(m)}はバグで10ダメージ`, 'dmg');
      g.io.fx(m.uid, 'hit', 10);
      await g.io.pause(350);
    }
    if (m.status.sleep) {
      const r = await flipCoins(g, 1, `${nm(m)}のスリープ判定（オモテで回復）`, false);
      if (r[0]) { m.status.sleep = false; L(g, `${nm(m)}はスリープから復帰した`); } else L(g, `${nm(m)}はスリープのまま`);
    }
  }
  const a = cur.active;
  if (a && a.status.freeze && a.status.freezeTurn < g.turn) {
    a.status.freeze = false;
    L(g, `${nm(a)}のフリーズが解けた`);
  }
  await checkKOs(g);
}

async function finishTurn(g) {
  const p = g.players[g.cur];
  p.energyCur = null;
  await checkup(g);
  if (g.over) return;
  if (g.turn >= TURN_LIMIT) { endGame(g, null, `${TURN_LIMIT}ターンが経過したため引き分け`); return; }
  g.cur = 1 - g.cur;
  g.io.render();
}

async function runGame(g) {
  await setupGame(g);
  while (!g.over) {
    await beginTurn(g);
    if (g.over) break;
    const p = g.players[g.cur];
    if (p.isCPU) await cpuTurn(g, p); else await g.io.humanTurn(p);
    if (g.over) break;
    await finishTurn(g);
  }
}

/* ---------- できること・できないこと ---------- */
function evoTargets(g, p, card) {
  const d = DEF[card.id];
  if (d.kind !== 'mon' || d.stage === 1) return [];
  return inPlay(p).filter(m => DEF[m.id].name === d.from && m.playedTurn < g.turn && m.evolvedTurn < g.turn);
}
function updateTargets(g, p) {
  return inPlay(p).filter(m => DEF[m.id].stage === 1 && m.playedTurn < g.turn && m.evolvedTurn < g.turn &&
    p.hand.some(c => { const d = DEF[c.id]; return d.kind === 'mon' && d.stage === 3 && BYNAME[d.from] && BYNAME[d.from].from === DEF[m.id].name; }));
}
const BYNAME = {};
MONSTERS.forEach(d => { BYNAME[d.name] = d; });

function handInfo(g, p, card) {
  const d = DEF[card.id];
  const res = { ok: false, reason: '', targets: null, label: '使う' };
  if (d.kind === 'mon') {
    if (d.stage === 1) {
      res.label = 'ベンチに出す';
      if (p.bench.length >= BENCH_MAX) res.reason = 'ベンチがいっぱい（最大3体）';
      else res.ok = true;
      return res;
    }
    res.label = '進化させる';
    if (p.turns <= 1) { res.reason = '最初の自分の番は進化できない'; return res; }
    const t = evoTargets(g, p, card);
    if (!t.length) {
      const has = inPlay(p).some(m => DEF[m.id].name === d.from);
      res.reason = has ? `「${d.from}」はこの番に出した（進化した）ばかり` : `進化元の「${d.from}」が場にいない`;
      return res;
    }
    res.ok = true; res.targets = t;
    return res;
  }
  if (d.kind === 'sup' && p.t.supporterDone) { res.reason = 'サポートは1ターンに1枚まで'; return res; }
  const o = other(g, p);
  switch (d.id) {
    case 'import':
      if (!p.deck.some(isBasic)) res.reason = '山札にv1ユニットがない'; else res.ok = true; break;
    case 'grep':
      if (!p.deck.some(isEvo)) res.reason = '山札に進化ユニットがない'; else res.ok = true; break;
    case 'patch': {
      const t = inPlay(p).filter(m => m.dmg > 0);
      if (!t.length) res.reason = 'ダメージを受けているユニットがいない'; else { res.ok = true; res.targets = t; }
      break;
    }
    case 'alttab':
      if (!p.active) res.reason = 'バトル場にユニットがいない'; else res.ok = true; break;
    case 'reboot':
      res.ok = true; break;
    case 'update': {
      if (p.turns <= 1) { res.reason = '最初の自分の番は使えない'; break; }
      const t = updateTargets(g, p);
      if (!t.length) res.reason = '手札のv3ユニットに進化できるv1ユニットがいない'; else { res.ok = true; res.targets = t; }
      break;
    }
    case 'ram': case 'honeypot': case 'ups': {
      const t = inPlay(p).filter(m => !m.tool);
      if (!t.length) res.reason = 'どうぐをつけられるユニットがいない'; else { res.ok = true; res.targets = t; res.label = 'つける'; }
      break;
    }
    case 'pair':
      if (!p.deck.length) res.reason = '山札がない'; else res.ok = true; break;
    case 'optimize':
      res.ok = true; break;
    case 'lb':
      if (!o.bench.length || !o.active) res.reason = '相手のベンチにユニットがいない'; else res.ok = true; break;
    case 'pentest':
      if (!o.bench.some(m => m.dmg > 0)) res.reason = '相手のベンチにダメージを受けたユニットがいない'; else res.ok = true; break;
    case 'ctrlz':
      if (!p.discard.some(isMon)) res.reason = 'トラッシュにユニットがない'; else res.ok = true; break;
    case 'search': case 'opensource':
      if (!p.deck.length) res.reason = '山札がない'; else res.ok = true; break;
    case 'hackathon': case 'debug':
      if (!p.active) res.reason = 'バトル場にユニットがいない'; else res.ok = true; break;
    case 'alan':
      if (!p.deck.length) res.reason = '山札がない'; else res.ok = true; break;
    case 'neumann':
      if (!p.discard.some(c => DEF[c.id].kind !== 'mon' && c.id !== 'neumann')) res.reason = 'トラッシュにコマンドがない'; else res.ok = true; break;
    case 'codebreak': case 'gametheory':
      if (!o.hand.length) res.reason = '相手の手札がない'; else res.ok = true; break;
    case 'turtest':
      if (!p.active || DEF[p.active.id].type !== 'ai') res.reason = 'バトル場のユニットがAIタイプではない'; else res.ok = true; break;
    default:
      res.ok = true;
  }
  return res;
}

function attackInfo(g, p, idx) {
  const m = p.active;
  if (!m) return { ok: false, reason: 'バトル場にユニットがいない' };
  const a = DEF[m.id].atk[idx];
  if (m.status.sleep) return { ok: false, reason: 'スリープ中はワザを使えない' };
  if (m.status.freeze) return { ok: false, reason: 'フリーズ中はワザを使えない' };
  if (!canPay(m.energy, a.costArr)) return { ok: false, reason: 'エネルギーが足りない' };
  if (a.copy) {
    const foe = other(g, p).active;
    if (!foe || !DEF[foe.id].atk.some(x => !x.copy)) return { ok: false, reason: 'コピーできるワザがない' };
  }
  return { ok: true, reason: '' };
}
function retreatCost(g, p) {
  return p.active ? Math.max(0, DEF[p.active.id].retreat - p.t.retreatDiscount) : 0;
}
function retreatInfo(g, p) {
  const m = p.active;
  const cost = retreatCost(g, p);
  if (!m) return { ok: false, reason: '', cost };
  if (p.t.retreatDone) return { ok: false, reason: 'にげるのは1ターンに1回まで', cost };
  if (m.status.sleep) return { ok: false, reason: 'スリープ中はにげられない', cost };
  if (m.status.freeze) return { ok: false, reason: 'フリーズ中はにげられない', cost };
  if (!p.bench.length) return { ok: false, reason: 'ベンチにユニットがいない', cost };
  if (m.energy.length < cost) return { ok: false, reason: `エネルギーが${cost}個必要`, cost };
  return { ok: true, reason: '', cost };
}
function abilityInfo(g, p, m) {
  const ab = DEF[m.id].ability;
  if (!ab || ab.kind !== 'active') return { ok: false, reason: '' };
  if (p.t.abilityUsed.includes(m.uid)) return { ok: false, reason: 'この番はもう使った' };
  if (!p.active) return { ok: false, reason: 'バトル場にユニットがいない' };
  if (!p.bench.some(b => b.energy.length > 0)) return { ok: false, reason: 'ベンチにエネルギーのついたユニットがいない' };
  return { ok: true, reason: '' };
}
function canAttachEnergy(g, p) { return !!(p.energyCur && !p.t.energyDone && !energyLocked(g, p)); }

/* ---------- 行動（人とCPUで共通） ---------- */
function takeFromHand(p, card) {
  const i = p.hand.indexOf(card);
  if (i >= 0) p.hand.splice(i, 1);
}

async function actBench(g, p, card) {
  const info = handInfo(g, p, card);
  if (!info.ok || DEF[card.id].stage !== 1) return false;
  takeFromHand(p, card);
  const m = mkMon(card, g.turn);
  p.bench.push(m);
  L(g, `${p.name}は${DEF[card.id].name}をベンチに出した`);
  g.io.fx(m.uid, 'enter');
  return true;
}

async function actEvolve(g, p, card, m) {
  if (!evoTargets(g, p, card).includes(m) || p.turns <= 1) return false;
  const from = nm(m);
  takeFromHand(p, card);
  m.cards.push(card);
  m.id = card.id;
  clearStatus(m);
  m.evolvedTurn = g.turn;
  L(g, `${p.name}の${from}が${DEF[card.id].name}に進化！`, 'evo');
  g.io.fx(m.uid, 'evolve');
  await g.io.pause(300);
  return true;
}

async function actAttach(g, p, m) {
  if (!canAttachEnergy(g, p) || !inPlay(p).includes(m)) return false;
  m.energy.push(p.energyCur);
  L(g, `${p.name}は${nm(m)}に${TYPES[p.energyCur].name}エネルギーをつけた`, 'energy');
  p.energyCur = null;
  p.t.energyDone = true;
  g.io.fx(m.uid, 'energy');
  return true;
}

function pickDiscard(m, n) {
  const need = {};
  DEF[m.id].atk.forEach(a => {
    const cnt = {};
    a.costArr.forEach(t => { if (t !== 'none') cnt[t] = (cnt[t] || 0) + 1; });
    for (const t in cnt) need[t] = Math.max(need[t] || 0, cnt[t]);
  });
  const keep = Object.assign({}, need);
  const scored = m.energy.map((t, i) => {
    if (keep[t] > 0) { keep[t]--; return { i, s: 1 }; }
    return { i, s: 0 };
  });
  scored.sort((a, b) => a.s - b.s || b.i - a.i);
  return scored.slice(0, n).map(o => o.i);
}

async function actRetreat(g, p, to) {
  const info = retreatInfo(g, p);
  if (!info.ok || !p.bench.includes(to)) return false;
  const m = p.active;
  const idx = pickDiscard(m, info.cost).sort((a, b) => b - a);
  const lost = idx.map(i => m.energy.splice(i, 1)[0]);
  switchActive(g, p, to);
  p.t.retreatDone = true;
  L(g, `${p.name}の${nm(m)}はにげた${lost.length ? `（エネルギー${lost.length}個をトラッシュ）` : ''}。${nm(to)}がバトル場へ`);
  g.io.fx(to.uid, 'enter');
  return true;
}

async function actAbility(g, p, m) {
  if (!abilityInfo(g, p, m).ok) return false;
  const sources = p.bench.filter(b => b.energy.length > 0);
  const src = await pick(g, p, 'ルーティング：エネルギーを移すベンチのユニットを選んでください',
    sources.map(b => ({ label: nm(b), value: b, mon: b })), () => aiRouterSource(g, p), { cancel: true });
  if (!src || g.over) return false;
  const types = [...new Set(src.energy)];
  let t = types[0];
  if (types.length > 1) {
    t = await pick(g, p, '移すエネルギーを選んでください', types.map(x => ({ label: `${TYPES[x].name}エネルギー`, value: x, energy: x })), () => aiRouterType(g, p, src));
    if (!t) t = types[0];
  }
  src.energy.splice(src.energy.indexOf(t), 1);
  p.active.energy.push(t);
  p.t.abilityUsed.push(m.uid);
  L(g, `${nm(m)}の特性「ルーティング」：${nm(src)}の${TYPES[t].name}エネルギーを${nm(p.active)}へ`, 'energy');
  g.io.fx(p.active.uid, 'energy');
  return true;
}

async function actTrainer(g, p, card, target) {
  const d = DEF[card.id];
  const info = handInfo(g, p, card);
  if (!info.ok) return false;
  if (info.targets && !info.targets.includes(target)) return false;
  const o = other(g, p);
  takeFromHand(p, card);
  if (d.kind === 'sup') p.t.supporterDone = true;
  if (d.kind === 'tool') {
    target.tool = card;
    L(g, `${p.name}は${nm(target)}に「${d.name}」をつけた`, 'trainer');
    g.io.fx(target.uid, 'tool');
    return true;
  }
  p.discard.push(card);
  L(g, `${p.name}は「${d.name}」を使った`, 'trainer');
  g.io.say(d.name);
  switch (d.id) {
    case 'import': {
      const idx = p.deck.map((c, i) => (isBasic(c) ? i : -1)).filter(i => i >= 0);
      if (idx.length) { const [c] = p.deck.splice(rnd(idx), 1); p.hand.push(c); L(g, `${DEF[c.id].name}を手札に加えた`); }
      shuffle(p.deck);
      break;
    }
    case 'grep': {
      const idx = p.deck.map((c, i) => (isEvo(c) ? i : -1)).filter(i => i >= 0);
      if (idx.length) { const [c] = p.deck.splice(rnd(idx), 1); p.hand.push(c); L(g, `${DEF[c.id].name}を手札に加えた`); }
      shuffle(p.deck);
      break;
    }
    case 'patch': heal(g, target, 20); break;
    case 'alttab':
      p.t.retreatDiscount += 1;
      L(g, 'この番、にげるためのエネルギーが1個少なくなった');
      break;
    case 'reboot':
      o.deck.push(...o.hand);
      o.hand = [];
      shuffle(o.deck);
      L(g, `${o.name}は手札を山札にもどした`);
      drawCards(g, o, 3);
      break;
    case 'update': {
      const cands = p.hand.filter(c => { const x = DEF[c.id]; return x.kind === 'mon' && x.stage === 3 && BYNAME[x.from] && BYNAME[x.from].from === DEF[target.id].name; });
      let evo = cands[0];
      if (cands.length > 1) evo = (await pick(g, p, '進化させるv3ユニットを選んでください', cands.map(c => ({ label: DEF[c.id].name, value: c, cardId: c.id })), () => cands[0])) || cands[0];
      const from = nm(target);
      takeFromHand(p, evo);
      target.cards.push(evo);
      target.id = evo.id;
      clearStatus(target);
      target.evolvedTurn = g.turn;
      L(g, `${from}がv2をとばして${DEF[evo.id].name}に進化！`, 'evo');
      g.io.fx(target.uid, 'evolve');
      break;
    }
    case 'pair': drawCards(g, p, 2); break;
    case 'opensource': drawCards(g, p, 3); drawCards(g, o, 1); break;
    case 'ctrlz': {
      const units = p.discard.filter(isMon);
      const c = await pick(g, p, 'Ctrl+Z：手札にもどすユニットを選んでください',
        units.map(x => ({ label: DEF[x.id].name, value: x, cardId: x.id })), () => aiCtrlZ(g, p, units));
      if (c && p.discard.includes(c)) { p.discard.splice(p.discard.indexOf(c), 1); p.hand.push(c); L(g, `${DEF[c.id].name}を手札にもどした`); }
      break;
    }
    case 'search': {
      const top = p.deck.slice(0, 3);
      const c = await pick(g, p, '検索エンジン：手札に加えるカードを選んでください',
        top.map(x => ({ label: DEF[x.id].name, value: x, cardId: x.id })), () => aiSearchPick(g, p, top));
      if (c && p.deck.includes(c)) { p.deck.splice(p.deck.indexOf(c), 1); p.hand.push(c); L(g, `${DEF[c.id].name}を手札に加えた`); }
      shuffle(p.deck);
      break;
    }
    case 'optimize':
      p.t.dmgBonus += 10;
      L(g, 'この番、相手のバトル場へのダメージ+10');
      break;
    case 'lb': {
      const m = await pick(g, o, '相手のロードバランシング：バトル場に出すユニットを選んでください',
        o.bench.map(b => ({ label: nm(b), value: b, mon: b })), () => aiNewActive(g, o));
      if (m && !g.over) { const old = o.active; switchActive(g, o, m); L(g, `${o.name}の${nm(old)}とベンチの${nm(m)}が入れ替わった`); g.io.fx(m.uid, 'enter'); }
      break;
    }
    case 'pentest': {
      const cands = o.bench.filter(b => b.dmg > 0);
      const m = await pick(g, p, 'ペネトレーションテスト：バトル場に引きずり出すユニットを選んでください',
        cands.map(b => ({ label: nm(b), value: b, mon: b })), () => aiPentestTarget(g, p, cands));
      if (m && !g.over) { const old = o.active; switchActive(g, o, m); L(g, `${o.name}の${nm(m)}がバトル場に引きずり出された（${nm(old)}はベンチへ）`); g.io.fx(m.uid, 'enter'); }
      break;
    }
    case 'hackathon': {
      const n = await flipUntilTails(g, 'ハッカソン', false);
      if (p.active) attachFromZone(g, p, p.active, n);
      if (!n) L(g, '成果なし…');
      break;
    }
    case 'alan': {
      const seen = new Set(), uniq = [];
      for (const x of p.deck) if (!seen.has(x.id)) { seen.add(x.id); uniq.push(x); }
      uniq.sort((a, b) => PICK_ORDER(a) - PICK_ORDER(b) || ALL_IDS.indexOf(a.id) - ALL_IDS.indexOf(b.id));
      const c = await pick(g, p, 'アラン・チューリング：手札に加えるカードを選んでください',
        uniq.map(x => ({ label: DEF[x.id].name, value: x, cardId: x.id })), () => aiTutorPick(g, p, uniq));
      if (c && p.deck.includes(c)) { p.deck.splice(p.deck.indexOf(c), 1); p.hand.push(c); L(g, `${DEF[c.id].name}を手札に加えた`); }
      shuffle(p.deck);
      break;
    }
    case 'neumann':
      await recallCommands(g, p, 2, 'neumann', 'ジョン・フォン・ノイマン');
      break;
    case 'codebreak': {
      const c = await pick(g, p, '暗号解読：相手の手札から、山札にもどすカードを選んでください',
        o.hand.map(x => ({ label: DEF[x.id].name, value: x, cardId: x.id })), () => aiCodebreakPick(g, p));
      if (c && o.hand.includes(c)) {
        o.hand.splice(o.hand.indexOf(c), 1);
        o.deck.push(c);
        shuffle(o.deck);
        L(g, `${o.name}の手札の「${DEF[c.id].name}」を山札にもどした`);
      }
      drawCards(g, p, 1);
      break;
    }
    case 'gametheory': {
      const c = await pick(g, o, '相手の「ゲーム理論」：トラッシュする手札を1枚選んでください',
        o.hand.map(x => ({ label: DEF[x.id].name, value: x, cardId: x.id })), () => aiLeastValuable(g, o));
      const card = c && o.hand.includes(c) ? c : o.hand[0];
      if (card) {
        o.hand.splice(o.hand.indexOf(card), 1);
        o.discard.push(card);
        L(g, `${o.name}は手札の「${DEF[card.id].name}」をトラッシュした`, 'dmg');
      }
      drawCards(g, p, 1);
      break;
    }
    case 'turtest':
      p.t.aiBonus += 20;
      L(g, 'この番、AIタイプのユニットのワザのダメージ+20');
      break;
    case 'debug':
      if (p.active) {
        heal(g, p.active, 50);
        const had = Object.keys(STATUS).some(k => p.active.status[k]);
        clearStatus(p.active);
        if (had) L(g, `${nm(p.active)}の特殊状態がすべて回復した`);
      }
      break;
  }
  return true;
}

async function actAttack(g, p, idx) {
  if (!attackInfo(g, p, idx).ok) return false;
  const me = p.active;
  const o = other(g, p);
  let atk = DEF[me.id].atk[idx];
  L(g, `${p.name}の${nm(me)}の「${atk.name}」！`, 'atk');
  g.io.fx(me.uid, 'attack');
  await g.io.pause(320);
  if (me.status.garble) {
    const r = await flipCoins(g, 1, '文字化けチェック（ウラなら失敗）', false);
    if (!r[0]) {
      L(g, '文字化けしていて、ワザは失敗した…');
      g.io.say('譁' + String.fromCharCode(0xFFFD) + '蟄怜喧縺' + String.fromCharCode(0xFFFD)); // 「文字化け」をUTF-8→Shift_JISで読んだときの本物の文字化け
      me.lastAtk = { name: atk.name, turn: g.turn };
      return true;
    }
  }
  const usedName = atk.name;
  if (atk.copy) {
    const foe = o.active;
    const list = foe ? DEF[foe.id].atk.filter(a => !a.copy) : [];
    const chosen = await pick(g, p, '万能シミュレーション：コピーするワザを選んでください',
      list.map(a => ({ label: a.name, value: a, atk: a })), () => aiCopyChoice(g, p, list));
    if (!chosen || g.over) return true;
    atk = chosen;
    L(g, `「${atk.name}」をシミュレーション！`, 'atk');
  }
  const c = mkCtx(g, p, me, atk, false);
  if (atk.pick === 'lowest') {
    c.target = lowestUnit(o);
    if (c.target) L(g, `いちばん残りHPが少ない${nm(c.target)}をねらう`);
  } else if (atk.pick) {
    const targets = inPlay(o);
    c.target = await pick(g, p, `${atk.name}：ダメージを与えるユニットを選んでください`,
      targets.map(m => ({ label: nm(m), value: m, mon: m })), () => aiSnipeTarget(g, p, atk, targets));
    if (g.over) return true;
    c.target = c.target || o.active;
  }
  if (atk.dmgFn) await atk.dmgFn(c);
  if (c.dmg > 0 && c.target) await dealAttackDamage(g, p, me, c.target, c.dmg, atk);
  else if (!atk.after) L(g, 'ダメージを与えられなかった');
  if (atk.after && !g.over) await atk.after(c);
  me.lastAtk = { name: usedName, turn: g.turn };
  if (atk !== DEF[me.id].atk[idx]) me.lastAtk.copied = atk.name;
  g.io.render();
  await checkKOs(g);
  return true;
}

/* =========================================================
   CPU
   ========================================================= */
async function evalAttack(g, p, m, a, target, samples) {
  if (!target) return { exp: 0, pKO: 0 };
  if (a.copy) {
    const foe = other(g, p).active;
    let best = { exp: 0, pKO: 0 };
    if (foe) for (const b of DEF[foe.id].atk) {
      if (b.copy) continue;
      const r = await evalAttack(g, p, m, b, target, samples);
      if (r.exp + r.pKO * 100 > best.exp + best.pKO * 100) best = r;
    }
    return best;
  }
  const n = a.dmgFn ? (samples || 18) : 1;
  const left = hpLeft(target);
  let sum = 0, ko = 0;
  for (let i = 0; i < n; i++) {
    const c = mkCtx(g, p, m, a, true);
    c.target = target;
    if (a.dmgFn) await a.dmgFn(c);
    const d = finalDamage(g, p, m, target, c.dmg, a);
    sum += d;
    if (d > 0 && d >= left) ko++;
  }
  const f = m.status && m.status.garble ? 0.5 : 1;
  return { exp: (sum / n) * f, pKO: (ko / n) * f };
}

async function scoreAttack(g, p, m, a) {
  const o = other(g, p);
  const targets = a.pick === 'lowest' ? [lowestUnit(o)] : a.pick ? inPlay(o) : [o.active];
  let best = -Infinity;
  for (const t of targets) {
    if (!t) continue;
    const r = await evalAttack(g, p, m, a, t);
    const pts = DEF[t.id].ex ? 2 : 1;
    let s = r.exp + r.pKO * (40 + pts * 45);
    if (p.points + pts >= WIN_POINTS) s += r.pKO * 1000;
    if (s > best) best = s;
  }
  if (best === -Infinity) best = 0;
  if (a.ai) best += a.ai(g, p, m);
  return best;
}

/* そのユニットがバトル場にいたら、今ある エネルギーで出せる最善のワザの点数 */
async function readiness(g, p, m) {
  let best = 0;
  for (const a of DEF[m.id].atk) {
    if (!canPay(m.energy, a.costArr)) continue;
    const s = await scoreAttack(g, p, m, a);
    if (s > best) best = s;
  }
  return best;
}

async function aiPickAttack(g, p) {
  const m = p.active;
  if (!m) return null;
  let best = null, bestS = 0.5;
  for (let i = 0; i < DEF[m.id].atk.length; i++) {
    if (!attackInfo(g, p, i).ok) continue;
    const s = await scoreAttack(g, p, m, DEF[m.id].atk[i]);
    if (s > bestS) { bestS = s; best = i; }
  }
  return best;
}

async function aiSnipeTarget(g, p, a, targets) {
  let best = targets[0], bestS = -Infinity;
  for (const t of targets) {
    const r = await evalAttack(g, p, p.active, a, t);
    const pts = DEF[t.id].ex ? 2 : 1;
    const s = r.exp + r.pKO * (60 + pts * 50);
    if (s > bestS) { bestS = s; best = t; }
  }
  return best;
}
async function aiCopyChoice(g, p, list) {
  let best = list[0], bestS = -Infinity;
  for (const a of list) {
    const s = await scoreAttack(g, p, p.active, a);
    if (s > bestS) { bestS = s; best = a; }
  }
  return best;
}
async function aiNewActive(g, p) {
  let best = p.bench[0], bestS = -Infinity;
  for (const b of p.bench) {
    const s = (await readiness(g, p, b)) + hpLeft(b) / 4 + b.energy.length * 8 - (DEF[b.id].ex && hpLeft(b) < 60 ? 30 : 0);
    if (s > bestS) { bestS = s; best = b; }
  }
  return best;
}
function cardValue(c) { const d = DEF[c.id]; return (d.ex ? 30 : 0) + (d.stage || 0) * 10 + (d.hp || 0) / 10; }
function aiCtrlZ(g, p, units) {
  const want = units.filter(c => isBasic(c) || inPlay(p).some(m => DEF[m.id].name === DEF[c.id].from));
  return (want.length ? want : units).slice().sort((a, b) => cardValue(b) - cardValue(a))[0];
}
function aiSearchPick(g, p, top) {
  const names = inPlay(p).map(m => DEF[m.id].name);
  const evo = top.find(c => isMon(c) && DEF[c.id].from && names.includes(DEF[c.id].from));
  if (evo) return evo;
  const basic = top.find(isBasic);
  if (basic && (p.bench.length < BENCH_MAX || !p.hand.some(isBasic))) return basic;
  return top.find(c => DEF[c.id].kind === 'sup') || top.find(c => DEF[c.id].kind === 'item') || top[0];
}
/* 手札にあるカードが、その持ち主にとってどれくらい大事か */
function cmdValue(g, p, c) {
  const d = DEF[c.id];
  const o = other(g, p);
  const table = {
    alan: 24, hackathon: 22, pentest: 16, opensource: 16, codebreak: 14, gametheory: 13, pair: 13, debug: 12, optimize: 9, lb: 9, neumann: 10,
    update: 12, import: 11, grep: 11, ctrlz: 8, search: 8, patch: 7, turtest: 7, alttab: 4, reboot: o.hand.length >= 5 ? 9 : 3,
    ram: 9, honeypot: 8, ups: 10,
  };
  let v = table[d.id] === undefined ? 6 : table[d.id];
  if (d.id === 'turtest' && !inPlay(p).some(m => DEF[m.id].type === 'ai')) v = 1;
  if (d.id === 'update' && !p.hand.concat(p.deck).some(x => DEF[x.id].kind === 'mon' && DEF[x.id].stage === 3)) v = 2;
  if (d.kind === 'tool' && !inPlay(p).some(m => !m.tool)) v = 2;
  return v;
}
function aiHandValue(g, pl, c) {
  const d = DEF[c.id];
  if (d.kind !== 'mon') return cmdValue(g, pl, c);
  if (d.stage === 1) return 10 + (d.ex ? 25 : 0) + (pl.bench.length < BENCH_MAX ? 6 : -6);
  if (inPlay(pl).some(m => DEF[m.id].name === d.from)) return 30 + d.stage * 6 + (d.ex ? 20 : 0);
  return pl.hand.some(h => DEF[h.id].name === d.from) ? 14 : 4;
}
function aiTutorScore(g, p, c) { return aiHandValue(g, p, c) - (p.hand.some(h => h.id === c.id) ? 12 : 0); }
function aiTutorPick(g, p, cards) { return cards.slice().sort((a, b) => aiTutorScore(g, p, b) - aiTutorScore(g, p, a))[0]; }
function aiRecallPick(g, p, cands) { return cands.slice().sort((a, b) => cmdValue(g, p, b) - cmdValue(g, p, a))[0]; }
function aiCodebreakPick(g, p) { const o = other(g, p); return o.hand.slice().sort((a, b) => aiHandValue(g, o, b) - aiHandValue(g, o, a))[0]; }
function aiLeastValuable(g, pl) { return pl.hand.slice().sort((a, b) => aiHandValue(g, pl, a) - aiHandValue(g, pl, b))[0]; }
function aiBuildTarget(g, p) {
  const need = m => Math.max(...attacksFor(p, m).map(a => deficit(m.energy, a.costArr))) + (DEF[m.id].ex ? 1 : 0);
  return p.bench.slice().sort((a, b) => need(b) - need(a))[0];
}
function aiPentestTarget(g, p, cands) {
  return cands.slice().sort((a, b) => hpLeft(a) - hpLeft(b))[0];
}

function attacksFor(p, m) {
  const list = DEF[m.id].atk.slice();
  for (const d of descendantsOf(DEF[m.id].name)) list.push(...d.atk);
  return list;
}
function energyValue(g, p, m, e) {
  let s = -10;
  for (const a of attacksFor(p, m)) {
    const before = deficit(m.energy, a.costArr);
    const after = deficit(m.energy.concat([e]), a.costArr);
    if (after < before) s = Math.max(s, 20 + (after === 0 ? 25 : 0) + (a.dmg || 40) / 5);
  }
  if (m === p.active) s += 12;
  if (DEF[m.id].ex) s += 6;
  if (DEF[m.id].id === 'stack' || DEF[m.id].id === 'dl') s += 8; // エネルギーが多いほど強い
  return s;
}
function aiEnergyTarget(g, p) {
  let best = null, bestS = -Infinity;
  for (const m of inPlay(p)) {
    const s = energyValue(g, p, m, p.energyCur);
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}
function aiRouterSource(g, p) {
  const act = p.active;
  if (!act) return null;
  let best = null, bestS = 0;
  for (const b of p.bench) {
    for (const t of new Set(b.energy)) {
      const gain = energyValue(g, p, act, t) - (energyValue(g, p, b, t) > 30 ? 25 : 0);
      if (gain > bestS) { bestS = gain; best = b; }
    }
  }
  return best;
}
function aiRouterType(g, p, src) {
  let best = src.energy[0], bestS = -Infinity;
  for (const t of new Set(src.energy)) { const s = energyValue(g, p, p.active, t); if (s > bestS) { bestS = s; best = t; } }
  return best;
}

function aiSetup(g, p) {
  const basics = p.hand.filter(isBasic);
  const score = c => {
    const d = DEF[c.id];
    let s = d.hp;
    if (d.ex) s += 15;
    if (p.hand.some(h => DEF[h.id].from === d.name)) s -= 15; // 進化させたいものはベンチで育てる
    if (d.atk.some(a => a.costArr.length === 1 && (a.dmg || 0) >= 20)) s += 10;
    return s;
  };
  basics.sort((a, b) => score(b) - score(a));
  for (const c of basics) setupPlace(g, p, c);
}

async function cpuPause(g) { await g.io.pause(CPU_STEP); }

async function aiDevelop(g, p) {
  // 1手ずつ実行して true を返す
  // 進化（バトル場を優先）
  for (const c of p.hand.filter(isEvo)) {
    const t = evoTargets(g, p, c);
    if (t.length && p.turns > 1) {
      const target = t.includes(p.active) ? p.active : t[0];
      if (await actEvolve(g, p, c, target)) return true;
    }
  }
  // メジャーアップデート
  const up = p.hand.find(c => c.id === 'update');
  if (up) {
    const info = handInfo(g, p, up);
    if (info.ok) {
      const t = info.targets.includes(p.active) ? p.active : info.targets[0];
      if (await actTrainer(g, p, up, t)) return true;
    }
  }
  // ベンチに出す（ex・進化先が手札にあるもの優先）
  if (p.bench.length < BENCH_MAX) {
    const basics = p.hand.filter(isBasic).sort((a, b) => {
      const sa = (DEF[a.id].ex ? 2 : 0) + (p.hand.some(h => DEF[h.id].from === DEF[a.id].name) ? 1 : 0);
      const sb = (DEF[b.id].ex ? 2 : 0) + (p.hand.some(h => DEF[h.id].from === DEF[b.id].name) ? 1 : 0);
      return sb - sa;
    });
    if (basics.length && await actBench(g, p, basics[0])) return true;
  }
  // グッズ
  for (const c of p.hand.slice()) {
    const d = DEF[c.id];
    if (d.kind !== 'item') continue;
    const info = handInfo(g, p, c);
    if (!info.ok) continue;
    if (c.id === 'import' && (p.bench.length < BENCH_MAX || !p.hand.some(isBasic))) { if (await actTrainer(g, p, c)) return true; }
    if (c.id === 'grep') {
      const want = inPlay(p).some(m => descendantsOf(nm(m)).length && !p.hand.some(h => descendantsOf(nm(m)).some(x => x.id === h.id)));
      if (want && await actTrainer(g, p, c)) return true;
    }
    if (c.id === 'patch') {
      const t = info.targets.slice().sort((a, b) => (b === p.active) - (a === p.active) || b.dmg - a.dmg)[0];
      if (t.dmg >= 20 && await actTrainer(g, p, c, t)) return true;
    }
    if (c.id === 'reboot' && other(g, p).hand.length >= 5) { if (await actTrainer(g, p, c)) return true; }
    if (c.id === 'search') { if (await actTrainer(g, p, c)) return true; }
    if (c.id === 'ctrlz' && (!p.hand.some(isBasic) || p.bench.length < BENCH_MAX)) { if (await actTrainer(g, p, c)) return true; }
  }
  // どうぐ
  for (const c of p.hand.slice()) {
    const d = DEF[c.id];
    if (d.kind !== 'tool') continue;
    const info = handInfo(g, p, c);
    if (!info.ok) continue;
    const prefer = info.targets.slice().sort((a, b) => ((b === p.active) * 2 + (DEF[b.id].ex ? 1 : 0)) - ((a === p.active) * 2 + (DEF[a.id].ex ? 1 : 0)))[0];
    if (await actTrainer(g, p, c, prefer)) return true;
  }
  return false;
}

async function aiSupporter(g, p, phase) {
  if (p.t.supporterDone) return false;
  const sups = p.hand.filter(c => DEF[c.id].kind === 'sup' && handInfo(g, p, c).ok);
  if (!sups.length) return false;
  const has = id => sups.find(c => c.id === id);
  const o = other(g, p);
  const m = p.active;
  if (phase === 'late') {
    // ダウンを取れるなら最優先
    if (has('pentest')) {
      for (const t of o.bench.filter(b => b.dmg > 0)) {
        if (!m) break;
        for (const a of DEF[m.id].atk) {
          if (!canPay(m.energy, a.costArr)) continue;
          const r = await evalAttack(g, p, m, a, t);
          if (r.pKO >= 0.5) return actTrainer(g, p, has('pentest'));
        }
      }
    }
    if (has('optimize') && m && o.active) {
      for (let i = 0; i < DEF[m.id].atk.length; i++) {
        if (!attackInfo(g, p, i).ok) continue;
        const a = DEF[m.id].atk[i];
        const r0 = await evalAttack(g, p, m, a, o.active);
        p.t.dmgBonus += 10;
        const r1 = await evalAttack(g, p, m, a, o.active);
        p.t.dmgBonus -= 10;
        if (r1.pKO - r0.pKO >= 0.3) return actTrainer(g, p, has('optimize'));
      }
    }
  }
  if (has('debug') && m && (m.status.sleep || m.status.freeze || m.status.garble || m.status.bug || m.dmg >= 60)) return actTrainer(g, p, has('debug'));
  if (has('alan') && p.deck.length) {
    const best = Math.max(...p.deck.map(c => aiTutorScore(g, p, c)));
    if (best >= 30 || (phase === 'late' && p.hand.length <= 3)) return actTrainer(g, p, has('alan'));
  }
  if (has('hackathon') && m) {
    const strongest = DEF[m.id].atk.reduce((a, b) => (b.costArr.length >= a.costArr.length ? b : a));
    if (deficit(m.energy, strongest.costArr) >= 1) return actTrainer(g, p, has('hackathon'));
  }
  if (has('neumann')) {
    const vals = p.discard.filter(c => DEF[c.id].kind !== 'mon' && c.id !== 'neumann').map(c => cmdValue(g, p, c)).sort((a, b) => b - a);
    if ((vals[0] || 0) + (vals[1] || 0) >= 22 || (phase === 'late' && vals.length)) return actTrainer(g, p, has('neumann'));
  }
  if (p.hand.length >= 4 && o.hand.length >= 3) {
    if (has('codebreak')) return actTrainer(g, p, has('codebreak'));
    if (has('gametheory')) return actTrainer(g, p, has('gametheory'));
  }
  if (has('opensource') && (phase === 'late' || p.hand.length <= 4)) return actTrainer(g, p, has('opensource'));
  if (has('pair') && (phase === 'late' || p.hand.length <= 5)) return actTrainer(g, p, has('pair'));
  if (phase === 'late' && o.hand.length >= 2) {
    if (has('codebreak')) return actTrainer(g, p, has('codebreak'));
    if (has('gametheory')) return actTrainer(g, p, has('gametheory'));
  }
  if (phase === 'late' && has('lb') && o.active && o.active.energy.length >= 2 && o.bench.some(b => b.energy.length === 0)) return actTrainer(g, p, has('lb'));
  return false;
}

async function aiLateItems(g, p) {
  const tt = p.hand.find(c => c.id === 'turtest');
  if (tt && !p.t.aiBonus && handInfo(g, p, tt).ok && DEF[p.active.id].atk.some((a, i) => attackInfo(g, p, i).ok)) return actTrainer(g, p, tt);
  return false;
}

async function aiMaybeRetreat(g, p) {
  const m = p.active;
  if (!m || !p.bench.length || p.t.retreatDone || m.status.sleep || m.status.freeze) return false;
  const cur = await readiness(g, p, m);
  let cand = null, candS = -Infinity;
  for (const b of p.bench) {
    const s = await readiness(g, p, b);
    if (s > candS) { candS = s; cand = b; }
  }
  const base = retreatCost(g, p);
  const alt = p.hand.find(c => c.id === 'alttab');
  const eff = alt && base > 0 ? base - 1 : base;
  if (m.energy.length < eff) return false;
  const lostValue = eff * 12;
  const should = (cur <= 0 && candS > 15) ||
    (candS - lostValue > cur + 35) ||
    (m.status.garble && candS > cur * 0.7 && candS > 10) ||
    (DEF[m.id].ex && hpLeft(m) <= 40 && candS > 10 && eff <= 1);
  if (!should) return false;
  if (alt && eff < base) await actTrainer(g, p, alt);
  if (!retreatInfo(g, p).ok) return false;
  return actRetreat(g, p, cand);
}

async function cpuTurn(g, p) {
  await cpuPause(g);
  const loop = async (phase) => {
    for (let i = 0; i < 30 && !g.over; i++) {
      let acted = await aiSupporter(g, p, phase === 'late' ? 'late' : 'early');
      if (!acted && phase === 'late') acted = await aiLateItems(g, p);
      if (!acted) acted = await aiDevelop(g, p);
      if (!acted) break;
      g.io.render();
      await cpuPause(g);
    }
  };
  await loop('early');
  if (g.over) return;
  if (canAttachEnergy(g, p)) {
    const t = aiEnergyTarget(g, p);
    if (t && await actAttach(g, p, t)) { g.io.render(); await cpuPause(g); }
  }
  if (g.over) return;
  for (const r of inPlay(p)) {
    if (abilityInfo(g, p, r).ok && aiRouterSource(g, p)) {
      if (await actAbility(g, p, r)) { g.io.render(); await cpuPause(g); }
    }
  }
  if (await aiMaybeRetreat(g, p)) { g.io.render(); await cpuPause(g); }
  if (g.over) return;
  await loop('late');
  if (g.over) return;
  const idx = await aiPickAttack(g, p);
  if (idx !== null && idx !== undefined) await actAttack(g, p, idx);
}

/* Node（テスト）用 */
if (typeof module !== 'undefined') {
  module.exports = { DEF, MONSTERS, TRAINERS, PRESETS, TYPES, PACKS, SERIES, rarityOf, setRNG, seededRNG, resetUid, newGame, runGame, NOOP_IO, deckCount, canPay, deficit, inPlay, maxHp, hpLeft, handInfo, attackInfo, retreatInfo, BENCH_MAX };
}
