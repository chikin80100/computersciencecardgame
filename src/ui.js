'use strict';
/* =========================================================
   CS用語カードバトル — 画面
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const UI = {
  screen: 'title', g: null, mode: 'idle', targets: null, onTarget: null, targetLabel: '',
  busy: false, fast: false, turnResolve: null, setupResolve: null, chooseResolve: null, chooseOptions: null,
  deck: { me: 'p_algo', opp: 'random', p2: 'p_data' }, edit: null, me: 0, vs: 'cpu', vsPick: 'cpu', waitNote: '', dexFilter: 'all', poolFilter: 'all', lastLog: '', logs: [],
};

/* ---------- セーブデータ（アカウントに保存。使えないときはこのブラウザ） ---------- */
const STORE_KEY = 'cs-term-card-battle-v1';
const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const SAVE = { ref: null, where: 'local', writing: false, dirty: false, timer: null, ready: false };
function normalizeStore(st) {
  st = st && typeof st === 'object' ? st : {};
  if (!Array.isArray(st.decks)) st.decks = [];
  if (!st.coll || typeof st.coll !== 'object') st.coll = {};
  if (!st.holo || typeof st.holo !== 'object') st.holo = {};
  if (!st.stats || typeof st.stats !== 'object') st.stats = {};
  ['wins', 'losses', 'draws', 'packs'].forEach(k => { if (typeof st.stats[k] !== 'number') st.stats[k] = 0; });
  if (typeof st.tickets !== 'number') { st.tickets = REWARD.start; st.bonus2 = 1; } // はじめのパックチケット
  if (!st.bonus2) { st.tickets += 10; st.bonus2 = 1; } // 前の版のセーブには、はじめの枚数の差（10枚）を配る
  if (typeof st.points !== 'number') st.points = 0;
  if (!st.migrated) {
    // 以前に作ったマイデッキのカードは、所持しているものとして引き継ぐ
    for (const d of st.decks) for (const id in d.cards || {}) if (DEF[id]) st.coll[id] = Math.max(st.coll[id] || 0, Math.min(2, d.cards[id]));
    st.migrated = 1;
  }
  return st;
}
let STORE = normalizeStore((() => { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; } })());
function saveLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(STORE)); } catch (e) { /* 保存できない環境 */ } }
function saveStore() { STORE.updatedAt = Date.now(); saveLocal(); scheduleCloudSave(); }
function scheduleCloudSave() { if (!SAVE.ref) return; clearTimeout(SAVE.timer); SAVE.timer = setTimeout(flushCloud, 1200); }
const DB_FATAL = ['invalid_argument', 'quota_exceeded', 'revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'];
async function flushCloud() {
  if (!SAVE.ref) return;
  if (SAVE.writing) { SAVE.dirty = true; return; }
  SAVE.writing = true;
  let retry = false;
  try { await SAVE.ref.set(JSON.parse(JSON.stringify(STORE))); SAVE.fails = 0; } catch (e) {
    if (DB_FATAL.includes(e && e.code)) { SAVE.ref = null; SAVE.where = 'local'; } else retry = (SAVE.fails = (SAVE.fails || 0) + 1) <= 3;
  }
  SAVE.writing = false;
  if (SAVE.dirty) { SAVE.dirty = false; flushCloud(); } else if (retry) { clearTimeout(SAVE.timer); SAVE.timer = setTimeout(flushCloud, 2000 + Math.random() * 3000); }
}
function mergeStore(local, remote) {
  const fresh = !local.synced; // この端末がまだ一度もアカウントとそろえていない
  const newer = fresh || (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  const out = Object.assign({}, newer);
  out.coll = {}; out.holo = {};
  for (const src of [local, remote]) {
    for (const id in src.coll || {}) out.coll[id] = Math.max(out.coll[id] || 0, src.coll[id]);
    for (const id in src.holo || {}) out.holo[id] = Math.max(out.holo[id] || 0, src.holo[id]);
  }
  if (fresh) {
    const decks = {};
    for (const d of (local.decks || []).concat(remote.decks || [])) decks[d.id] = d;
    out.decks = Object.values(decks);
  } else out.decks = (newer.decks || []).slice();
  out.synced = 1;
  return normalizeStore(out);
}
function stableJSON(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJSON).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function initCloud() {
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return;
    const [db, user] = await withTimeout(Promise.all([window.claude.use('db'), window.claude.use('user')]), 11000);
    if (!db || !user) return;
    const id = await withTimeout(user.id(), 5000);
    if (!id) return;
    const ref = db.doc('data/users/' + id + '/save');
    const snap = await withTimeout(ref.get(), 10000);
    const remote = snap && snap.exists ? (snap.data() || {}) : null;
    STORE = remote ? mergeStore(STORE, JSON.parse(JSON.stringify(remote))) : Object.assign(STORE, { synced: 1 });
    SAVE.ref = ref; SAVE.where = 'cloud';
    saveLocal();
    if (!remote || stableJSON(STORE) !== stableJSON(remote)) await flushCloud(); // 変わったときだけ書く
  } catch (e) { /* アカウント保存が使えないときは、このブラウザにだけ保存する */ } finally {
    SAVE.ready = true;
    checkDaily();
    if (RENDER[UI.screen] && UI.screen !== 'editor' && UI.screen !== 'battle') RENDER[UI.screen]();
  }
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function checkDaily() {
  const t = todayStr();
  if (STORE.lastDaily === t) return;
  const first = !STORE.lastDaily;
  STORE.lastDaily = t;
  if (!first) { STORE.tickets += REWARD.daily; toast(`今日のログインボーナス：パックチケット+${REWARD.daily}`); }
  saveStore();
}
const customDecks = () => STORE.decks;
const allDecks = () => PRESETS.concat(customDecks());
const deckById = id => allDecks().find(d => d.id === id);
const owned = id => STORE.coll[id] || 0;
const ownedKinds = () => ALL_IDS.filter(id => owned(id) > 0).length;
if (STORE.deckMe && deckById(STORE.deckMe)) UI.deck.me = STORE.deckMe;
if (STORE.deckOpp && (STORE.deckOpp === 'random' || deckById(STORE.deckOpp))) UI.deck.opp = STORE.deckOpp;
if (STORE.deckP2 && deckById(STORE.deckP2)) UI.deck.p2 = STORE.deckP2;

/* ---------- 部品 ---------- */
const eI = (t, size) => `<i class="e ${size || ''}" style="--c:${TYPES[t].c}" title="${TYPES[t].name}">${TYPES[t].k}</i>`;
const kindLabel = d => (d.kind === 'mon' ? stageLabel(d) : KIND[d.kind].name);
const noLabel = d => `No.${String(d.no).padStart(3, '0')}`;

/* IBM 029 キーパンチのホレリス符号 */
const HOLL = (() => {
  const m = {};
  '0123456789'.split('').forEach((ch, i) => { m[ch] = [String(i)]; });
  'ABCDEFGHI'.split('').forEach((ch, i) => { m[ch] = ['12', String(i + 1)]; });
  'JKLMNOPQR'.split('').forEach((ch, i) => { m[ch] = ['11', String(i + 1)]; });
  'STUVWXYZ'.split('').forEach((ch, i) => { m[ch] = ['0', String(i + 2)]; });
  Object.assign(m, { '-': ['11'], '&': ['12'], '/': ['0', '1'], '.': ['12', '3', '8'], '(': ['12', '5', '8'], '+': ['12', '6', '8'], ')': ['11', '5', '8'], "'": ['5', '8'], ':': ['2', '8'], ',': ['0', '3', '8'] });
  return m;
})();
const ROWS = ['12', '11', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
function punchSVG(text, cols) {
  const s = text.toUpperCase().replace(/[^A-Z0-9\-&/.()+':, ]/g, ' ').slice(0, cols).padEnd(cols, ' ');
  const cw = 10, rh = 5.4, top = 10, W = cols * cw, H = top + ROWS.length * rh + 1;
  let out = `<svg class="c-punch" viewBox="0 0 ${W} ${H}" role="img" aria-label="パンチカード: ${esc(text.toUpperCase())}">`;
  for (let c = 0; c < cols; c++) {
    const ch = s[c];
    const holes = HOLL[ch] || [];
    const cx = c * cw + cw / 2;
    if (ch !== ' ') out += `<text x="${cx}" y="7" class="pt">${esc(ch)}</text>`;
    ROWS.forEach((r, ri) => {
      const y = top + ri * rh;
      if (holes.includes(r)) out += `<rect x="${c * cw + 3}" y="${y}" width="${cw - 6}" height="${rh - 1.2}" rx="0.6" class="ph"/>`;
      else if (ri >= 2) out += `<text x="${cx}" y="${y + rh - 1.3}" class="pd">${r}</text>`;
    });
  }
  return out + '</svg>';
}

function thumbHTML(id, opts) {
  opts = opts || {};
  const d = DEF[id];
  const c = d.kind === 'mon' ? TYPES[d.type].c : KIND[d.kind].c;
  const badge = opts.badge ? `<span class="t-badge ${opts.badge === 'NEW' ? 'new' : ''}">${esc(opts.badge)}</span>` : '';
  return `<div class="thumb ${d.ex || d.leg ? 'ex' : ''} ${d.kind === 'mon' ? '' : 'tr'} ${opts.sil ? 'sil' : ''} ${opts.holo ? 'holo' : ''}" style="--c:${c}">
    <span class="t-stripe"></span>
    <span class="t-top"><span>${noLabel(d)}</span><span class="t-kind">${kindLabel(d)}</span></span>
    <span class="t-art ${tileClass(d)}" aria-hidden="true">${artImg(id, { sil: opts.sil })}</span>
    <span class="t-name">${nameHTML(d)}${d.ex ? '<b class="exb">ex</b>' : ''}</span>
    <span class="t-en">${esc(d.en)}</span>
    <span class="t-bot">${d.kind === 'mon' ? `${eI(d.type, 's')}<span>HP ${d.hp}</span>` : `<span class="t-k">${KIND[d.kind].name}</span>`}<span class="t-rar">${opts.holo ? '☆' : RARITY_MARK[rarityOf(d)]}</span></span>
    ${badge}
  </div>`;
}

function atkLineHTML(a) {
  return `<span class="cost">${a.costArr.map(x => eI(x, 's')).join('') || '<span class="free">0</span>'}</span><b class="an">${esc(a.name)}</b><span class="dmg">${a.label || (a.dmg ? a.dmg : '')}</span>`;
}

// 「・」のある名前（人物カード）は「・」のところで改行する
const nameHTML = d => (d.name.includes('・') ? `<span class="kw">${esc(d.name).replace(/・/g, '・<wbr>')}</span>` : esc(d.name));
const seriesOf = id => SERIES.find(se => se.id === id && se.id !== 'base');
const setTag = d => { const se = d.set && seriesOf(d.set); return se ? `<span class="c-set">${esc(se.name)}</span>` : ''; };
function cardHTML(id, opts) {
  opts = opts || {};
  const d = DEF[id];
  if (d.kind === 'mon') {
    const t = TYPES[d.type];
    const m = opts.m;
    const hp = m ? `<span class="c-hp"><small>HP</small>${hpLeft(m)}<small>/${maxHp(m)}</small></span>` : `<span class="c-hp"><small>HP</small>${d.hp}</span>`;
    return `<div class="card-wrap"><article class="card ${d.ex ? 'ex' : ''} ${opts.holo ? 'holo' : ''}" style="--c:${t.c}">
      <div class="c-stripe"></div>
      <header class="c-head"><span class="c-stage">${stageLabel(d)}</span><h3 class="c-name">${nameHTML(d)}${d.ex ? '<b class="exb">ex</b>' : ''}</h3>${hp}${eI(d.type, 'l')}</header>
      <p class="c-sub"><span>${esc(d.en)}</span><span>${noLabel(d)} ${RARITY_MARK[rarityOf(d)]}${d.from ? ` ・「${esc(d.from)}」から進化` : ''}</span></p>
      <div class="c-art ${tileClass(d)}" aria-hidden="true">${artImg(id, { sil: opts.sil })}</div>
      <div class="c-body">
        ${d.ability ? `<div class="c-ab"><p class="c-ab-h"><span class="tag">特性</span><b>${esc(d.ability.name)}</b></p><p class="c-t">${esc(d.ability.text)}</p></div>` : ''}
        ${d.atk.map(a => `<div class="c-atk"><p class="c-atk-h">${atkLineHTML(a)}</p>${a.text ? `<p class="c-t">${esc(a.text)}</p>` : ''}</div>`).join('')}
      </div>
      <footer class="c-foot"><span>弱点 ${WEAK[d.type] ? `${eI(WEAK[d.type], 's')}<b>+20</b>` : '<b>なし</b>'}</span><span>にげる ${d.retreat ? eI('none', 's').repeat(d.retreat) : '<b>0</b>'}</span></footer>
      ${d.ex ? '<p class="c-rule">exルール：exがダウンしたとき、相手は2ポイント獲得する。</p>' : ''}
      <div class="c-desc"><p class="tag">用語解説${setTag(d)}</p><p>${esc(d.desc)}</p></div>
      ${opts.noPunch ? '' : punchSVG(d.en, 26)}
    </article></div>`;
  }
  const k = KIND[d.kind];
  return `<div class="card-wrap"><article class="card tr ${d.leg ? 'ex' : ''} ${opts.holo ? 'holo' : ''}" style="--c:${k.c}">
    <div class="c-stripe"></div>
    <header class="c-head"><span class="c-stage">${k.name}</span><h3 class="c-name">${nameHTML(d)}</h3></header>
    <p class="c-sub"><span>${esc(d.en)}</span><span>${noLabel(d)} ${RARITY_MARK[rarityOf(d)]}</span></p>
    <div class="c-art ${tileClass(d)}" aria-hidden="true">${artImg(id, { sil: opts.sil })}</div>
    <div class="c-body"><p class="c-eff">${esc(d.text)}</p><p class="c-t c-kr">${esc(k.rule)}</p></div>
    <div class="c-desc"><p class="tag">用語解説${setTag(d)}</p><p>${esc(d.desc)}</p></div>
    ${opts.noPunch ? '' : punchSVG(d.en, 26)}
  </article></div>`;
}

function monHTML(m, opts) {
  opts = opts || {};
  const d = DEF[m.id];
  const mx = maxHp(m), left = hpLeft(m);
  const sts = Object.keys(STATUS).filter(k => m.status[k]);
  const inner = `<span class="mon ${d.ex ? 'ex' : ''}" style="--c:${TYPES[d.type].c}">
      <span class="m-stripe"></span>
      <span class="m-name">${esc(d.name)}${d.ex ? '<b class="exb">ex</b>' : ''}</span>
      <span class="m-art" aria-hidden="true">${artImg(m.id)}</span>
      <span class="m-hp"><span class="m-v">${stageLabel(d)}</span><span><b>${left}</b>/${mx}</span></span>
      <span class="m-bar"><i class="${left / mx <= 0.34 ? 'low' : ''}" style="width:${Math.max(0, (left / mx) * 100)}%"></i></span>
      <span class="m-en">${m.energy.map(t => eI(t, 'xs')).join('')}</span>
    </span>
    ${sts.length ? `<span class="m-sts">${sts.map(k => `<b class="st st-${k}">${STATUS[k].name}</b>`).join('')}</span>` : ''}
    ${m.tool ? `<span class="m-tool" title="${esc(DEF[m.tool.id].name)}">${artImg(m.tool.id)}</span>` : ''}`;
  if (opts.static) return `<span class="mslot static">${inner}</span>`;
  const cls = ['mslot'];
  if (UI.mode === 'target') cls.push(UI.targets && UI.targets.has(m.uid) ? 'tgt' : 'dim');
  if (opts.hint) cls.push('hint');
  if (opts.setup) cls.push('setup');
  return `<button type="button" class="${cls.join(' ')}" data-act="mon" data-uid="${m.uid}" aria-label="${esc(d.name)} 残りHP${left}">${inner}</button>`;
}

function handCardHTML(c) {
  const d = DEF[c.id];
  const col = d.kind === 'mon' ? TYPES[d.type].c : KIND[d.kind].c;
  return `<span class="hc ${d.ex || d.leg ? 'ex' : ''}" style="--c:${col}"><span class="hc-stripe"></span><span class="hc-kind">${kindLabel(d)}</span><span class="hc-art" aria-hidden="true">${artImg(c.id)}</span><span class="hc-name">${nameHTML(d)}${d.ex ? '<b class="exb">ex</b>' : ''}</span>${d.kind === 'mon' ? `<span class="hc-hp">${eI(d.type, 'xs')}HP${d.hp}</span>` : ''}</span>`;
}

/* ---------- 画面の切り替え ---------- */
const ROUTES = ['title', 'select', 'packs', 'decks', 'dex', 'rules'];
function show(screen) {
  if (UI.screen === 'battle' && screen !== 'battle' && UI.g && !UI.g.over) abortBattle();
  UI.screen = screen;
  if (screen !== 'select' && screen !== 'battle' && NETUI.stopWait) { NETUI.stopWait(true); NETUI.stopWait = null; NETUI.stage = 'idle'; }
  if (PACKFLOW) { PACKFLOW = null; renderPackOverlay(); }
  $$('.screen').forEach(el => { el.hidden = el.id !== 'scr-' + screen; });
  document.body.dataset.screen = screen;
  const r = RENDER[screen];
  if (r) r();
  if (ROUTES.includes(screen)) {
    const want = screen === 'title' ? '' : '#' + screen;
    if (location.hash !== want) {
      try { history.replaceState(null, '', want || location.pathname + location.search); } catch (e) { /* noop */ }
    }
  }
  window.scrollTo(0, 0);
}
const RENDER = {
  title: renderTitle, select: renderSelect, packs: renderPacks, decks: renderDecks, dex: renderDex, rules: renderRules, editor: renderEditor,
};

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { e.preventDefault(); if (nav.dataset.vs) UI.vsPick = nav.dataset.vs; show(nav.dataset.nav); }
});
window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#', '');
  if ((UI.screen === 'battle' && UI.g && !UI.g.over) || UI.screen === 'editor') return;
  if (ROUTES.includes(h) && h !== UI.screen) show(h);
});

/* ---------- タイトル ---------- */
function renderTitle() {
  const picks = ['alan', 'eniac', 'neumann'];
  const pose = ['translateX(-102%) rotate(-9deg) translateY(14px)', 'translateX(-50%) rotate(0deg)', 'translateX(2%) rotate(9deg) translateY(14px)'];
  $('#scr-title').innerHTML = `
  <div class="title-wrap">
    <p class="silk">REV 3.0 ── COMPUTER SCIENCE TERMS ── ${ALL_IDS.length} CARDS</p>
    <h1 class="logo"><span>CS用語</span><span>カードバトル</span></h1>
    <p class="lead">コンピュータ科学の用語でたたかうカードゲーム。パックでカードを集めて、20枚のデッキで対戦しよう。カードの「用語解説」を読めば、用語にもくわしくなれる。</p>
    <div class="fan" aria-hidden="true">${picks.map((id, i) => `<div class="fan-c" style="transform:${pose[i]};animation-delay:${i * 0.12}s">${thumbHTML(id)}</div>`).join('')}</div>
    <nav class="menu" aria-label="メニュー">
      <button type="button" class="btn gold big m-main" data-nav="select" data-vs="cpu">CPUと対戦する</button>
      <button type="button" class="btn m-sub" data-nav="select" data-vs="online">人と対戦する<small>オンライン・この端末で2人</small></button>
      <button type="button" class="btn m-sub m-pack" data-nav="packs">パックをひらく<small>チケット ${STORE.tickets}枚</small>${SERIES.filter(se => se.isNew).map(se => `<small class="m-new"><b>NEW</b> ${esc(se.name)}</small>`).join('')}</button>
      <div class="m-tools">
        <button type="button" class="btn ghost" data-nav="dex">図鑑<small>${ownedKinds()}/${ALL_IDS.length}</small></button>
        <button type="button" class="btn ghost" data-nav="decks">デッキ</button>
        <button type="button" class="btn ghost" data-nav="rules">あそびかた</button>
      </div>
    </nav>
    <p class="silk foot">${TYPE_ORDER.length} TYPES ・ ${MONSTERS.length} UNITS ・ ${TRAINERS.length} COMMANDS ・ ${PACKS.length} PACKS</p>
  </div>`;
}

/* ---------- デッキ選択 ---------- */
function deckTileHTML(d, pressed, side, compact) {
  const v = d.cards ? validateDeck(d) : null;
  const bad = v && v.errs.length;
  const keys = (d.key || Object.keys(d.cards || {}).filter(id => DEF[id] && DEF[id].ex).slice(0, 2));
  return `<button type="button" class="dtile-b" data-pick="${side}" data-id="${d.id}" aria-pressed="${pressed}" ${bad ? 'disabled' : ''}>
    <span class="dtile">
      <span class="dt-stripe" style="background:linear-gradient(90deg,${(d.energy || []).map(t => TYPES[t].c).join(',') || '#777'}${(d.energy || []).length === 1 ? ',' + TYPES[d.energy[0]].c : ''})"></span>
      <span class="dt-name">${esc(d.name)}</span>
      <span class="dt-meta">${(d.energy || []).map(t => eI(t, 's')).join('')}${compact && d.id.startsWith('p_') ? '' : `<span>${d.id === 'random' ? 'おまかせ' : d.id.startsWith('p_') ? 'プリセット' : 'マイデッキ'}</span>`}</span>
      ${d.blurb && !compact ? `<span class="dt-blurb">${esc(d.blurb)}</span>` : ''}
      ${keys.length && !compact ? `<span class="dt-keys">${keys.map(id => `<span>${artImg(id, { cls: 'ic' })}${esc(DEF[id].name)}${DEF[id].ex ? 'ex' : ''}</span>`).join('')}</span>` : ''}
      ${bad ? `<span class="dt-bad">${esc(v.errs[0])}</span>` : ''}
    </span>
  </button>`;
}
// 選んでいるデッキのくわしい説明（押せない。一覧の上に出す）
function deckDetailHTML(d) {
  const keys = (d.key || Object.keys(d.cards || {}).filter(id => DEF[id] && DEF[id].ex).slice(0, 2));
  const cols = (d.energy || []).map(t => TYPES[t].c);
  return `<div class="dsel" aria-live="polite">
    <span class="dt-stripe" style="background:${cols.length ? `linear-gradient(90deg,${cols.concat(cols.length === 1 ? cols : []).join(',')})` : '#8a7d5c'}"></span>
    <p class="ds-name">${esc(d.name)}</p>
    <p class="dt-meta">${(d.energy || []).map(t => eI(t, 's')).join('')}<span>${d.id === 'random' ? 'おまかせ' : d.id.startsWith('p_') ? 'プリセット' : 'マイデッキ'}</span></p>
    ${d.blurb ? `<p class="dt-blurb">${esc(d.blurb)}</p>` : ''}
    ${keys.length ? `<p class="dt-keys">${keys.map(id => `<span>${artImg(id, { cls: 'ic' })}${esc(DEF[id].name)}${DEF[id].ex ? 'ex' : ''}</span>`).join('')}</p>` : ''}
  </div>`;
}
function renderSelect() {
  if (!deckById(UI.deck.me)) UI.deck.me = PRESETS[0].id;
  if (!deckById(UI.deck.p2)) UI.deck.p2 = PRESETS[1].id;
  const mode = UI.vsPick || 'cpu';
  const rndDeck = { id: 'random', name: 'ランダム', energy: [], blurb: 'あなたと違うプリセットデッキから、そのつど選びます。' };
  // 選んでいるデッキだけをくわしく見せ、一覧は小さなタイルにする（19個のデッキを2回ならべると、とても長くなるため）
  const picker = (side, list, title) => {
    const cur = list.find(d => d.id === UI.deck[side]) || list[0];
    return `<section class="sec pick">
      <h3 class="h3">${title}</h3>
      ${deckDetailHTML(cur)}
      <div class="decks compact" role="group" aria-label="${title}">${list.map(d => deckTileHTML(d, UI.deck[side] === d.id, side, true)).join('')}</div>
    </section>`;
  };
  const nameOf = id => (id === 'random' ? 'ランダム' : (deckById(id) || {}).name || '');
  const bar = (left, right, btn) => `<div class="matchbar"><p class="mb-vs"><span>${esc(left)}</span><i>vs</i><span>${esc(right)}</span></p>${btn}</div>`;
  let body;
  if (mode === 'local') {
    body = `<p class="note">1台の端末を、2人で交代しながら使います。番が変わるたびに「端末を渡す」画面が出るので、手札を見られずに遊べます。この遊び方では、パックチケットはもらえません。</p>
    ${picker('me', allDecks(), 'プレイヤー1のデッキ')}
    ${picker('p2', allDecks(), 'プレイヤー2のデッキ')}
    ${bar(nameOf(UI.deck.me), nameOf(UI.deck.p2), '<button type="button" class="btn gold big" id="startLocal">2人で対戦スタート</button>')}`;
  } else if (mode === 'online') {
    const claude = TRANSPORT() === 'claude';
    if (claude && !NETUI.checked) netInit().then(r => { NETUI.checked = true; NETUI.why = r.ok ? '' : r.why; if (UI.screen === 'select') renderSelect(); });
    body = `<section class="sec net">${netPanelHTML()}</section>
    ${claude && NETUI.stage === 'waiting' ? '' : picker('me', allDecks(), 'あなたのデッキ')}`;
  } else {
    body = `${picker('me', allDecks(), 'あなたのデッキ')}
      <p class="note">自分だけのデッキは「<button type="button" class="linkbtn" data-nav="decks">デッキをつくる</button>」で作れます。</p>
    ${picker('opp', [rndDeck].concat(PRESETS), '対戦相手（CPU）のデッキ')}
    ${bar(nameOf(UI.deck.me), nameOf(UI.deck.opp), '<button type="button" class="btn gold big" id="startBtn">対戦スタート</button>')}`;
  }
  const modes = [['cpu', 'CPUと対戦'], ['local', '2人で対戦（この端末）'], ['online', 'オンライン対戦']];
  $('#scr-select').innerHTML = `<div class="page">
    <header class="top"><button type="button" class="back" data-nav="title">← タイトル</button><h2>対戦</h2></header>
    <div class="chips modes" role="group" aria-label="対戦のしかた">${modes.map(([k, l]) => `<button type="button" class="chip" data-vs="${k}" aria-pressed="${mode === k}">${l}</button>`).join('')}</div>
    ${body}
  </div>`;
  $('#scr-select').onclick = e => {
    const v = e.target.closest('[data-vs]');
    if (v) {
      if (NETUI.stage === 'waiting' && v.dataset.vs !== 'online') { if (NETUI.stopWait) NETUI.stopWait(true); NETUI.stopWait = null; NETUI.stage = 'idle'; }
      UI.vsPick = v.dataset.vs; NETUI.err = ''; renderSelect(); return;
    }
    const b = e.target.closest('[data-pick]');
    if (b && !b.disabled) {
      UI.deck[b.dataset.pick] = b.dataset.id;
      STORE.deckMe = UI.deck.me; STORE.deckOpp = UI.deck.opp; STORE.deckP2 = UI.deck.p2; saveStore();
      renderSelect();
      return;
    }
    const n = e.target.closest('[data-net]');
    if (n && !n.disabled) { onNet(n.dataset.net); return; }
    if (e.target.closest('#startBtn')) startBattle();
    else if (e.target.closest('#startLocal')) startLocal();
  };
  const inp = $('#netCode');
  if (inp) inp.onkeydown = e => { if (e.key === 'Enter') onNet('join'); };
  const ti = $('#p2pInvite'), ta = $('#p2pAnswer');
  if (ti) ti.oninput = () => { P2P.inInvite = ti.value; };
  if (ta) ta.oninput = () => { P2P.inAnswer = ta.value; };
  const co = $('.code-out');
  if (co) co.onfocus = () => co.select();
}
function netPanelHTML() {
  if (TRANSPORT() === 'p2p') return p2pPanelHTML();
  const head = '<h3 class="h3">オンライン対戦（あいことば）</h3><p class="note">6けたの「あいことば」を使って、別の端末の人と対戦します。相手も、このページをClaudeで開いている必要があります。</p>';
  if (!NETUI.checked) return head + '<p class="msg">準備中…</p>';
  if (NETUI.why) return head + `<p class="msg warn">${esc(NETUI.why)}</p><p class="note">同じ端末で遊ぶなら「2人で対戦（この端末）」を選んでください。</p>`;
  const err = NETUI.err ? `<p class="msg err" role="alert">${esc(NETUI.err)}</p>` : '';
  if (NETUI.stage === 'waiting') {
    return head + `<div class="net-wait"><p class="silk">あいことば</p><p class="net-code">${esc(NETUI.code)}</p>
      <p>この数字を相手に伝えて、「部屋に入る」に入れてもらってください。</p><p class="waiting">相手が入るのを待っています…</p>
      <button type="button" class="btn ghost" data-net="cancel">やめる</button></div>${err}`;
  }
  if (NETUI.stage === 'busy') return head + `<p class="msg">${esc(NETUI.busyMsg || '通信中…')}</p>`;
  return head + `<div class="net-grid">
      <div class="net-box"><h4>部屋をつくる</h4><p class="note">あいことばが出るので、相手に伝えます。</p><button type="button" class="btn gold" data-net="create">部屋をつくる</button></div>
      <div class="net-box"><h4>部屋に入る</h4><label class="net-in"><span>あいことば</span><input id="netCode" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="6けたの数字" value="${esc(NETUI.input || '')}"></label><button type="button" class="btn gold" data-net="join">入る</button></div>
    </div>${err}<p class="note">下で選んだデッキで対戦します。勝つとパックチケット+${REWARD.win}、負け・引き分けで+${REWARD.lose}。途中でぬけると降参になります。</p>`;
}
const netErrMsg = e => (e && e.message && !e.code && e.message !== 'timeout' ? e.message : '通信できませんでした。もう一度ためしてください。');
async function onNet(k) {
  if (TRANSPORT() === 'p2p') { p2pAction(k); return; }
  const deck = deckById(UI.deck.me) || PRESETS[0];
  if (k === 'cancel') { if (NETUI.stopWait) NETUI.stopWait(true); NETUI.stopWait = null; NETUI.stage = 'idle'; renderSelect(); return; }
  if (NETUI.stage !== 'idle') return;
  if (validateDeck(deck).errs.length) { NETUI.err = 'このデッキはまだ使えません。デッキ編集で直してください。'; renderSelect(); return; }
  NETUI.err = '';
  if (k === 'create') {
    NETUI.stage = 'busy'; NETUI.busyMsg = '部屋をつくっています…'; renderSelect();
    try {
      const room = await netCreateRoom(deck);
      NETUI.stage = 'waiting'; NETUI.code = room.code;
      netWaitGuest(room);
    } catch (e) { NETUI.stage = 'idle'; NETUI.err = netErrMsg(e); }
    if (UI.screen === 'select') renderSelect();
  } else if (k === 'join') {
    const code = (($('#netCode') || {}).value || '').replace(/\D/g, '');
    NETUI.input = code;
    if (code.length !== 6) { NETUI.err = 'あいことばは6けたの数字です。'; renderSelect(); return; }
    NETUI.stage = 'busy'; NETUI.busyMsg = '部屋に入っています…'; renderSelect();
    try {
      const room = await netJoinRoom(code, deck);
      NETUI.stage = 'idle'; NETUI.input = '';
      startOnline(room, 1);
      return;
    } catch (e) { NETUI.stage = 'idle'; NETUI.err = netErrMsg(e); }
    if (UI.screen === 'select') renderSelect();
  }
}

/* ---------- デッキ編集 ---------- */
function validateDeck(d) {
  const errs = [], warns = [];
  const n = deckCount(d.cards);
  if (!String(d.name || '').trim()) errs.push('デッキ名を入れてください');
  if (n !== 20) errs.push(`デッキはちょうど20枚にしてください（いま${n}枚）`);
  if (!Object.keys(d.cards).some(id => d.cards[id] > 0 && DEF[id] && DEF[id].kind === 'mon' && DEF[id].stage === 1)) errs.push('v1ユニットを1枚以上入れてください');
  if (!d.energy || !d.energy.length) errs.push('エネルギーゾーンのタイプを1〜3個選んでください');
  if (Object.values(d.cards).some(v => v > 2)) errs.push('同じカードは2枚までです');
  if (!String(d.id).startsWith('p_')) {
    const lack = Object.keys(d.cards).filter(id => d.cards[id] > owned(id));
    if (lack.length) errs.push(`持っている枚数より多いカードがあります（${lack.slice(0, 3).map(id => DEF[id].name).join('・')}${lack.length > 3 ? 'など' : ''}）`);
  }
  const need = new Set();
  for (const id in d.cards) {
    const x = DEF[id];
    if (x && x.kind === 'mon') x.atk.forEach(a => a.costArr.forEach(t => { if (t !== 'none') need.add(t); }));
  }
  const miss = [...need].filter(t => !(d.energy || []).includes(t));
  if (miss.length && d.energy && d.energy.length) warns.push(`${miss.map(t => TYPES[t].name).join('・')}エネルギーが必要なワザがありますが、エネルギーゾーンにありません`);
  for (const id in d.cards) {
    const x = DEF[id];
    if (x && x.kind === 'mon' && x.stage > 1 && !Object.keys(d.cards).some(y => d.cards[y] > 0 && DEF[y].name === x.from)) warns.push(`「${x.name}」の進化元「${x.from}」が入っていません`);
  }
  return { errs, warns };
}
function renderDecks() {
  const mine = customDecks();
  $('#scr-decks').innerHTML = `<div class="page">
    <header class="top"><button type="button" class="back" data-nav="title">← タイトル</button><h2>デッキをつくる</h2></header>
    <section class="sec"><h3 class="h3">マイデッキ</h3>
      ${mine.length ? `<div class="mylist">${mine.map(d => {
        const v = validateDeck(d);
        return `<div class="myrow"><span class="my-name">${esc(d.name)}</span><span class="my-e">${d.energy.map(t => eI(t, 's')).join('')}</span><span class="my-n ${v.errs.length ? 'bad' : ''}">${deckCount(d.cards)}/20</span>
          <button type="button" class="btn sm" data-edit="${d.id}">編集</button><button type="button" class="btn sm ghost" data-del="${d.id}">削除</button></div>`;
      }).join('')}</div>` : '<p class="note">まだありません。新しく作るか、プリセットをコピーして改造しましょう。</p>'}
      <p class="note">マイデッキは、このブラウザの中だけに保存されます。</p>
      <div class="row"><button type="button" class="btn gold" data-new="1">＋ 新しいデッキ</button></div>
    </section>
    <section class="sec"><h3 class="h3">プリセットをコピーして改造</h3><div class="decks compact">${PRESETS.map(d => `<button type="button" class="dtile-b" data-copy="${d.id}"><span class="dtile"><span class="dt-stripe" style="background:${TYPES[d.energy[0]].c}"></span><span class="dt-name">${esc(d.name)}</span><span class="dt-meta">${d.energy.map(t => eI(t, 's')).join('')}<span>コピーして編集</span></span></span></button>`).join('')}</div></section>
  </div>`;
  $('#scr-decks').onclick = e => {
    const t = e.target.closest('[data-edit],[data-del],[data-new],[data-copy]');
    if (!t) return;
    if (t.dataset.new) { UI.edit = { id: 'u_' + Date.now(), name: 'マイデッキ' + (customDecks().length + 1), energy: [], cards: {}, isNew: true }; show('editor'); }
    else if (t.dataset.copy) {
      const p = PRESETS.find(x => x.id === t.dataset.copy);
      const cards = {};
      let left = 0;
      for (const id in p.cards) { const n = Math.min(p.cards[id], owned(id)); if (n) cards[id] = n; left += p.cards[id] - n; }
      UI.edit = { id: 'u_' + Date.now(), name: p.name + '（改）', energy: p.energy.slice(), cards, isNew: true };
      show('editor');
      if (left) toast(`持っていないカード${left}枚は入れていません。パックで集めよう`);
    }
    else if (t.dataset.edit) { const d = customDecks().find(x => x.id === t.dataset.edit); if (d) { UI.edit = JSON.parse(JSON.stringify(d)); show('editor'); } }
    else if (t.dataset.del) {
      const d = customDecks().find(x => x.id === t.dataset.del);
      if (!d) return;
      openSheet(`<div class="confirm"><h3>「${esc(d.name)}」を削除しますか？</h3><p>この操作は取り消せません。</p></div>`, [{ label: '削除する', cls: 'danger', fn: () => {
        STORE.decks = customDecks().filter(x => x.id !== d.id);
        if (UI.deck.me === d.id) UI.deck.me = PRESETS[0].id;
        saveStore(); renderDecks();
      } }]);
    }
  };
}
function poolIds() {
  const f = UI.poolFilter;
  return ALL_IDS.filter(id => {
    const d = DEF[id];
    if (UI.poolOwned !== false && !owned(id)) return false;
    if (f === 'all') return true;
    if (f === 'tr') return d.kind !== 'mon';
    if (seriesOf(f)) return d.set === f;
    return d.kind === 'mon' && d.type === f;
  });
}
function chipsHTML(cur, attr) {
  const list = [['all', 'すべて']].concat(TYPE_ORDER.map(t => [t, TYPES[t].name])).concat([['tr', 'コマンド']], SERIES.filter(se => se.short).map(se => [se.id, se.short]));
  return `<div class="chips" role="group" aria-label="絞り込み">${list.map(([k, label]) => `<button type="button" class="chip" ${attr}="${k}" aria-pressed="${cur === k}">${TYPES[k] ? eI(k, 'xs') : ''}${label}</button>`).join('')}</div>`;
}
function renderEditor() {
  const e = UI.edit;
  if (!e) { show('decks'); return; }
  const n = deckCount(e.cards);
  const v = validateDeck(e);
  const ids = ALL_IDS.filter(id => e.cards[id] > 0);
  $('#scr-editor').innerHTML = `<div class="page editor">
    <header class="top"><button type="button" class="back" id="edBack">← もどる</button><h2>デッキ編集</h2></header>
    <div class="ed-grid">
      <section class="ed-side">
        <label class="lbl" for="edName">デッキ名</label>
        <input id="edName" class="inp" maxlength="24" value="${esc(e.name)}">
        <p class="lbl">エネルギーゾーン（1〜3タイプ）</p>
        <div class="chips">${TYPE_ORDER.filter(t => t !== 'none').map(t => `<button type="button" class="chip" data-en="${t}" aria-pressed="${e.energy.includes(t)}">${eI(t, 'xs')}${TYPES[t].name}</button>`).join('')}</div>
        <p class="count ${n === 20 ? 'ok' : ''}"><b>${n}</b> / 20枚</p>
        <ul class="ed-list">${ids.map(id => `<li><span class="el-n">${artImg(id, { cls: 'ic' })} ${esc(DEF[id].name)}${DEF[id].ex ? 'ex' : ''}</span><span class="el-k">${kindLabel(DEF[id])}</span><button type="button" class="pm" data-minus="${id}" aria-label="${esc(DEF[id].name)}を1枚減らす">−</button><b>${e.cards[id]}</b><button type="button" class="pm" data-plus="${id}" ${e.cards[id] >= Math.min(2, owned(id)) || n >= 20 ? 'disabled' : ''} aria-label="${esc(DEF[id].name)}を1枚増やす">＋</button></li>`).join('') || '<li class="note">右（下）の一覧からカードを追加してください</li>'}</ul>
        ${v.errs.map(x => `<p class="msg err">${esc(x)}</p>`).join('')}${v.warns.map(x => `<p class="msg warn">${esc(x)}</p>`).join('')}
        <div class="row"><button type="button" class="btn gold" id="edSave" ${v.errs.length ? 'disabled' : ''}>保存する</button></div>
      </section>
      <section class="ed-pool">
        ${chipsHTML(UI.poolFilter, 'data-pf')}
        <div class="chips"><button type="button" class="chip" data-po-own="1" aria-pressed="${UI.poolOwned !== false}">持っているカードだけ表示</button></div>
        ${poolIds().length ? '' : '<p class="note">まだカードを持っていません。「パックをひらく」でカードを集めよう。</p>'}
        <div class="grid pool">${poolIds().map(id => `<div class="pcell"><button type="button" class="tbtn" data-info="${id}" aria-label="${esc(DEF[id].name)}の詳細">${thumbHTML(id, { sil: !owned(id), holo: !!STORE.holo[id] })}</button>
          <div class="pc-ctl"><button type="button" class="pm" data-minus="${id}" ${e.cards[id] ? '' : 'disabled'} aria-label="1枚減らす">−</button><b>${e.cards[id] || 0}</b><button type="button" class="pm" data-plus="${id}" ${(e.cards[id] || 0) >= Math.min(2, owned(id)) || n >= 20 ? 'disabled' : ''} aria-label="1枚増やす">＋</button></div>
          <p class="pc-own">所持 ${owned(id)}枚</p></div>`).join('')}</div>
      </section>
    </div>
  </div>`;
  const root = $('#scr-editor');
  $('#edName').oninput = ev => { e.name = ev.target.value; const btn = $('#edSave'); const vv = validateDeck(e); btn.disabled = vv.errs.length > 0; };
  $('#edName').onchange = () => renderEditor();
  root.onclick = ev => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.id === 'edBack') { show('decks'); return; }
    if (t.id === 'edSave') {
      const vv = validateDeck(e);
      if (vv.errs.length) return;
      const list = customDecks().filter(x => x.id !== e.id);
      const clean = { id: e.id, name: e.name.trim(), energy: e.energy.slice(), cards: {} };
      for (const id in e.cards) if (e.cards[id] > 0) clean.cards[id] = e.cards[id];
      list.push(clean);
      STORE.decks = list; saveStore();
      UI.deck.me = clean.id; STORE.deckMe = clean.id; saveStore();
      toast(`「${clean.name}」を保存しました`);
      show('decks');
      return;
    }
    if (t.dataset.en) {
      const k = t.dataset.en;
      if (e.energy.includes(k)) e.energy = e.energy.filter(x => x !== k);
      else if (e.energy.length < 3) e.energy.push(k);
      else toast('エネルギーのタイプは3つまでです');
      renderEditor(); return;
    }
    if (t.dataset.pf) { UI.poolFilter = t.dataset.pf; renderEditor(); return; }
    if (t.dataset.poOwn) { UI.poolOwned = UI.poolOwned === false; renderEditor(); return; }
    if (t.dataset.plus) { const id = t.dataset.plus; if ((e.cards[id] || 0) < Math.min(2, owned(id)) && deckCount(e.cards) < 20) e.cards[id] = (e.cards[id] || 0) + 1; renderEditor(); return; }
    if (t.dataset.minus) { const id = t.dataset.minus; if (e.cards[id]) e.cards[id]--; if (!e.cards[id]) delete e.cards[id]; renderEditor(); return; }
    if (t.dataset.info) openCardInfo(t.dataset.info);
  };
}

/* ---------- 図鑑 ---------- */
function renderDex() {
  const f = UI.dexFilter;
  const ids = ALL_IDS.filter(id => { const d = DEF[id]; if (f === 'all') return true; if (f === 'tr') return d.kind !== 'mon'; if (seriesOf(f)) return d.set === f; return d.kind === 'mon' && d.type === f; });
  const holoKinds = ALL_IDS.filter(id => STORE.holo[id]).length;
  $('#scr-dex').innerHTML = `<div class="page">
    <header class="top"><button type="button" class="back" data-nav="title">← タイトル</button><h2>カード図鑑</h2></header>
    ${walletHTML([['集めたカード', ownedKinds(), `/ ${ALL_IDS.length}種`], ['ホロ', holoKinds, '種'], ['パックポイント', STORE.points, 'pt']])}
    <p class="note">カードをタップすると用語解説が読めます。持っていないカードは影になっています（パックポイントで交換もできます）。</p>
    ${chipsHTML(f, 'data-df')}
    ${TYPES[f] && f !== 'none' ? `<p class="note">${eI(f, 's')} ${TYPES[f].name}の弱点は ${eI(WEAK[f], 's')} ${TYPES[WEAK[f]].name}。${esc(WEAK_WHY[f])}。</p>` : ''}
    <div class="grid dex">${ids.map(id => `<button type="button" class="tbtn" data-info="${id}" aria-label="${esc(DEF[id].name)}の詳細">${thumbHTML(id, { sil: !owned(id), holo: !!STORE.holo[id], badge: owned(id) ? '' : '未入手' })}</button>`).join('')}</div>
  </div>`;
  $('#scr-dex').onclick = e => {
    const c = e.target.closest('[data-df]');
    if (c) { UI.dexFilter = c.dataset.df; renderDex(); return; }
    const t = e.target.closest('[data-info]');
    if (t) openCardInfo(t.dataset.info);
  };
}

function openCardInfo(id) {
  const d = DEF[id];
  const n = owned(id), h = STORE.holo[id] || 0;
  const cost = EXCHANGE_COST[rarityOf(d)];
  const head = `<div class="live">
    <p>${n ? `所持 <b>${n}</b>枚${h ? `（うちホロ ${h}枚）` : ''}` : '<b>未入手</b>　パックから出るのを待つか、パックポイントで交換できます。'}</p>
    <p>レア度 ${RARITY_MARK[rarityOf(d)]}　交換 ${cost}pt（いま ${STORE.points}pt）</p>
  </div>`;
  openSheet(head + cardHTML(id, { sil: !n, holo: !!h }), [{
    label: `パックポイントで交換（${cost}pt）`, cls: 'gold', disabled: STORE.points < cost,
    note: STORE.points < cost ? `あと${cost - STORE.points}pt必要` : (n >= 2 ? 'デッキには同じカードを2枚まで入れられます' : ''),
    fn: () => {
      if (STORE.points < cost) return;
      if (!SAVE.ready) { toast('セーブデータを読み込み中です。少し待ってください'); return; }
      STORE.points -= cost;
      STORE.coll[id] = owned(id) + 1;
      saveStore();
      toast(`「${d.name}」を手に入れた！`);
      if (RENDER[UI.screen]) RENDER[UI.screen]();
      openCardInfo(id);
    },
  }]);
}

/* ---------- あそびかた ---------- */
function typeCycleSVG() {
  const order = ['hw', 'algo', 'data', 'ai', 'sec', 'net'];
  const R = 100, r = 28;
  const pos = order.map((t, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / order.length; return { t, a, x: R * Math.cos(a), y: R * Math.sin(a) }; });
  let s = `<svg class="cycle" viewBox="-200 -158 400 316" role="img" aria-label="タイプ相性：ハードウェア→アルゴリズム→データ→AI→セキュリティ→ネットワーク→ハードウェアの順に、矢印の先のタイプの弱点を突ける"><defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d9ad55"/></marker></defs>`;
  pos.forEach((p, i) => {
    const q = pos[(i + 1) % pos.length];
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    s += `<line x1="${(p.x + ux * (r + 4)).toFixed(1)}" y1="${(p.y + uy * (r + 4)).toFixed(1)}" x2="${(q.x - ux * (r + 7)).toFixed(1)}" y2="${(q.y - uy * (r + 7)).toFixed(1)}" stroke="#d9ad55" stroke-width="2.2" marker-end="url(#arw)"/>`;
  });
  pos.forEach(p => {
    const c = Math.cos(p.a);
    let lx = p.x, ly = p.y, anchor = 'middle';
    if (c > 0.3) { lx = p.x + r + 7; ly = p.y + 4; anchor = 'start'; }
    else if (c < -0.3) { lx = p.x - r - 7; ly = p.y + 4; anchor = 'end'; }
    else if (p.y < 0) ly = p.y - r - 8;
    else ly = p.y + r + 16;
    s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${TYPES[p.t].c}" stroke="#efe2bf" stroke-width="2"/>`;
    s += `<text x="${p.x.toFixed(1)}" y="${(p.y + 7).toFixed(1)}" text-anchor="middle" font-size="20" font-weight="700" fill="#fff">${TYPES[p.t].k}</text>`;
    s += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="12" fill="#e6eee2">${TYPES[p.t].name}</text>`;
  });
  return s + '</svg>';
}
function renderRules() {
  $('#scr-rules').innerHTML = `<div class="page rules">
    <header class="top"><button type="button" class="back" data-nav="title">← タイトル</button><h2>あそびかた</h2></header>
    <p class="lead2">ルールは「ポケモンカードゲーム ポケット（ポケポケ）」を参考にしています。ポケモンのかわりに、コンピュータ科学の用語「ユニット」でたたかいます。</p>
    <section><h3 class="h3">勝ち負け</h3><ul>
      <li>相手のユニットのHPを0にすると、そのユニットは<b>ダウン</b>してトラッシュへ。ダウンさせた側が<b>1ポイント</b>（<b class="exb">ex</b>なら<b>2ポイント</b>）獲得。</li>
      <li>先に<b>3ポイント</b>取ったほうが勝ち。相手の場にユニットが1体もいなくなっても勝ち。</li>
      <li>山札がなくなっても負けにはならない（カードを引けなくなるだけ）。両者あわせて60ターンたつと引き分け。</li>
    </ul></section>
    <section><h3 class="h3">デッキと準備</h3><ul>
      <li>デッキは<b>20枚</b>。同じカードは<b>2枚まで</b>。v1ユニットを1枚以上入れる。</li>
      <li>エネルギーはデッキに入れない。デッキごとに決めた1〜3タイプのエネルギーが、<b>エネルギーゾーン</b>から毎ターン1個出てくる（次に出るタイプも見える）。</li>
      <li>コイントスで先攻・後攻を決め、手札を5枚引く（v1ユニットが必ず1枚以上ある）。v1ユニットをバトル場に1体、ベンチに3体まで出して準備完了。</li>
    </ul></section>
    <section><h3 class="h3">自分の番にできること</h3>
      <ol>
        <li>山札を1枚引く。エネルギーゾーンにエネルギーが1個出る（<b>先攻の最初の番だけは出ない</b>）。</li>
        <li>次のことを好きな順番で行う。
          <ul>
            <li>手札のv1ユニットをベンチに出す（ベンチは3体まで）</li>
            <li>ユニットを進化させる（v1→v2→v3）。出したばかりのユニットと、最初の自分の番は進化できない</li>
            <li>エネルギーゾーンのエネルギーを、自分のユニット1体につける（1ターンに1回）</li>
            <li>コマンドを使う：グッズは何枚でも、サポートは1枚まで、どうぐはユニット1体に1枚まで。<b>フィールド</b>は場に1枚だけ置けて、おたがいに効く（新しいフィールドを出すと、前のものはトラッシュへ）</li>
            <li>特性を使う</li>
            <li><b>にげる</b>：にげるコストの数だけエネルギーをトラッシュして、バトル場とベンチのユニットを入れ替える（1ターンに1回）</li>
          </ul>
        </li>
        <li>最後にバトル場のユニットの<b>ワザ</b>を使うと番が終わる。ワザを使わずに終わってもよい。</li>
      </ol>
      <p class="note">ワザに必要なエネルギーは記号で書かれています。${eI('none', 's')}（無色）はどのタイプのエネルギーでも払えます。</p>
    </section>
    <section><h3 class="h3">タイプ相性（弱点 +20）</h3>
      <p>矢印の先のタイプは、矢印の元のタイプのワザから<b>+20ダメージ</b>を受けます（弱点はバトル場のユニットにだけはたらく）。無色には弱点がありません。</p>
      <div class="cycle-wrap">${typeCycleSVG()}</div>
      <ul class="why">${['algo', 'data', 'ai', 'sec', 'net', 'hw'].map(t => `<li>${eI(t, 's')} ${TYPES[t].name} ← ${eI(WEAK[t], 's')} ${TYPES[WEAK[t]].name}：${esc(WEAK_WHY[t])}</li>`).join('')}</ul>
    </section>
    <section><h3 class="h3">特殊状態</h3>
      <p>ワザの効果でバトル場のユニットがなることがあります。ベンチにもどる・進化すると回復します。番の終わりごとに「チェック」があります。</p>
      <table class="tbl"><thead><tr><th>状態</th><th>効果</th><th>ポケポケでいうと</th></tr></thead><tbody>
        <tr><td><b class="st st-bug">バグ</b></td><td>${esc(STATUS.bug.text)}</td><td>どく</td></tr>
        <tr><td><b class="st st-sleep">スリープ</b></td><td>${esc(STATUS.sleep.text)}</td><td>ねむり</td></tr>
        <tr><td><b class="st st-freeze">フリーズ</b></td><td>${esc(STATUS.freeze.text)}</td><td>マヒ</td></tr>
        <tr><td><b class="st st-garble">文字化け</b></td><td>${esc(STATUS.garble.text)}</td><td>こんらん</td></tr>
      </tbody></table>
      <p class="note">スリープ・フリーズ・文字化けは重ならず、あとからなった状態に上書きされます。バグはほかの状態と重なります。</p>
    </section>
    <section><h3 class="h3">カードの種類</h3><ul>
      <li><b>ユニット</b>：v1（たね）、v2（1進化）、v3（2進化）。名前に<b class="exb">ex</b>がつくユニットは強力だが、ダウンすると相手に2ポイント入る。</li>
      <li><b>コマンド</b>：ユニット以外のカード。<b>グッズ</b>は何枚でも、<b>サポート</b>は1ターンに1枚使える。<b>どうぐ</b>はユニットにつけて使う。</li>
      <li>コインは <b>1 = オモテ</b>、<b>0 = ウラ</b>。</li>
    </ul></section>
    <section><h3 class="h3">対人戦</h3><ul>
      <li><b>2人で対戦（この端末）</b>：1台の端末を2人で交代して使う。番が変わるたびに「端末を渡す」画面が出る。パックチケットはもらえない。</li>
      <li><b>オンライン対戦</b>：${TRANSPORT() === 'p2p'
        ? '1人が「部屋をつくる」を押し、出てきた「招待コード」を相手に送る。相手はそれを「部屋に入る」に貼って「参加コード」をつくり、送り返す。最初の人が参加コードを貼って「つなぐ」を押すと対戦がはじまる。ログインはいらない。'
        : '1人が「部屋をつくる」を押し、出てきた6けたの「あいことば」を相手に伝える。相手は「部屋に入る」にあいことばを入れる。2人ともClaudeにログインして、このページを開いている必要がある。'}</li>
      <li>オンライン対戦は、勝つとパックチケット+${REWARD.win}、負け・引き分けで+${REWARD.lose}。途中でぬけると降参になる。</li>
    </ul></section>
    <section><h3 class="h3">パックとコレクション</h3><ul>
      <li>パックチケット1枚で、パックを1つ（5枚入り）ひらける。「${MULTI_PACKS}連」なら、チケット${MULTI_PACKS}枚で${MULTI_PACKS}パックをまとめてひらける（中身の確率は1パックずつと同じ）。はじめはチケット${REWARD.start}枚。チケットは対戦すると増える（${REWARD_TEXT}。降参は0）。毎日はじめて遊ぶと+${REWARD.daily}。</li>
      <li>レア度は ◆（v1など）・◆◆（v2など）・◆◆◆（v3など）・◆◆◆◆（ex）。ごくまれに、キラキラの<b>☆ホロ</b>カードや、全部レアの<b>ゴッドパック</b>が出る。</li>
      <li>パックを1つひらくたびにパックポイント+${PACK_POINT}。図鑑で、ほしいカードと交換できる（◆${EXCHANGE_COST[1]}pt〜◆◆◆◆${EXCHANGE_COST[4]}pt）。</li>
      <li>自分で作るデッキには、持っているカードしか入れられない。プリセットデッキはいつでも使える。</li>
      <li>「コンピュータの父」シリーズ（「アラン・チューリング」パック・「ジョン・フォン・ノイマン」パック・「クロード・シャノン」パック）、「プログラミングの先駆者」シリーズ（「エイダ・ラブレス」パック・「グレース・ホッパー」パック）、「遍在する計算機」シリーズ（「マーク・ワイザー」パック・「TRON」パック・「落合陽一」パック）のカードは、そのシリーズのパックからしか出ない。</li>
    </ul></section>
    <div class="cta"><button type="button" class="btn gold big" data-nav="select">対戦する</button></div>
  </div>`;
}

/* ---------- 共通の小窓 ---------- */
function openSheet(html, buttons) {
  const s = $('#sheet');
  s.innerHTML = `<div class="sheet-in ${buttons.length ? '' : 'solo'}" role="dialog" aria-modal="true"><div class="sheet-main">${html}</div>
    <div class="sheet-btns">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.html || esc(b.label)}${b.note ? `<small class="why">${esc(b.note)}</small>` : ''}</button>`).join('')}
    <button type="button" class="btn ghost" data-i="close">閉じる</button></div></div>`;
  s.hidden = false;
  s.scrollTop = 0;
  s.onclick = e => {
    const btn = e.target.closest('button[data-i]');
    if (!btn) { if (e.target === s) closeSheet(); return; }
    if (btn.dataset.i === 'close') { closeSheet(); return; }
    const b = buttons[+btn.dataset.i];
    closeSheet();
    if (b && b.fn) b.fn();
  };
  const first = $('.sheet-btns .btn:not([disabled])', s);
  if (first) first.focus({ preventScroll: true });
}
function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }

function openChoice(title, options, opts) {
  return openChoiceIdx(title, options, opts).then(i => (i >= 0 && options[i] ? options[i].value : null));
}
function openChoiceIdx(title, options, opts) {
  opts = opts || {};
  return new Promise(res => {
    UI.chooseResolve = res;
    UI.chooseOptions = options;
    const el = $('#choice');
    el.innerHTML = `<div class="choice-in" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h3>${esc(title)}</h3>
      <div class="choice-opts">${options.map((o, i) => {
        let body = '';
        if (o.mon) body = monHTML(o.mon, { static: true });
        else if (o.atk) body = `<span class="copt-atk">${atkLineHTML(o.atk)}${o.atk.text ? `<small>${esc(o.atk.text)}</small>` : ''}</span>`;
        else if (o.energy) body = eI(o.energy, 'l');
        else if (o.cardId) body = `<span class="copt-card">${handCardHTML({ id: o.cardId })}</span>`;
        return `<button type="button" class="copt ${o.atk ? 'wide' : ''}" data-i="${i}">${body}${o.atk ? '' : `<span class="copt-l">${esc(o.label)}</span>`}</button>`;
      }).join('')}</div>
      ${opts.cancel ? '<button type="button" class="btn ghost" data-i="cancel">キャンセル</button>' : ''}</div>`;
    el.hidden = false;
    el.onclick = e => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const i = b.dataset.i;
      el.hidden = true;
      el.innerHTML = '';
      UI.chooseResolve = null;
      res(i === 'cancel' ? -1 : +i);
    };
  });
}
function closeChoice() {
  const el = $('#choice');
  if (UI.chooseResolve) { const r = UI.chooseResolve, o = UI.chooseOptions; UI.chooseResolve = null; r(o && o.length ? 0 : -1); }
  el.hidden = true; el.innerHTML = '';
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* =========================================================
   パック
   ========================================================= */
function walletHTML(items) {
  return `<div class="wallet">${items.map(([label, val, unit]) => `<span class="wl"><span class="silk">${label}</span><span class="wl-v"><b>${val}</b><small>${unit}</small></span></span>`).join('')}</div>`;
}
function packPool(pack) {
  if (pack.ids) return pack.ids.filter(id => DEF[id]);
  // スタンダードのパックには、シリーズのカードは入らない
  return ALL_IDS.filter(id => { const d = DEF[id]; return !d.set && (d.kind !== 'mon' || pack.types.includes(d.type)); });
}
function packTypes(pack) {
  if (pack.types) return pack.types;
  return TYPE_ORDER.filter(t => packPool(pack).some(id => DEF[id].kind === 'mon' && DEF[id].type === t));
}
function packProgress(pack) { const pool = packPool(pack); return [pool.filter(id => owned(id) > 0).length, pool.length]; }
function rollPack(pack) {
  const pool = packPool(pack);
  const units = pool.filter(id => DEF[id].kind === 'mon');
  const holoPool = pack.feature ? units.concat([pack.feature]) : units; // シリーズのパックは、人物カードのホロも出る
  const byR = r => pool.filter(id => rarityOf(DEF[id]) === r);
  const god = Math.random() < 0.005;
  const out = [];
  for (let i = 0; i < 5; i++) {
    let r = 1, holo = false;
    if (god) { r = Math.random() < 0.5 ? 3 : 4; holo = Math.random() < 0.35; } else if (i >= 3) {
      const t = Math.random();
      const o = i === 3 ? [0.72, 0.90, 0.98] : [0.50, 0.78, 0.94];
      if (t < o[0]) r = 2; else if (t < o[1]) r = 3; else if (t < o[2]) r = 4; else holo = true;
    }
    let id;
    if (holo && !god) id = rndU(holoPool);
    else if (r === 4 && pack.feature && Math.random() < 0.5) id = pack.feature; // ◆◆◆◆の半分は、そのパックの人物カード
    else { let list = byR(r); while (!list.length && r > 1) list = byR(--r); id = rndU(list); }
    out.push({ id, holo, god });
  }
  return out;
}
function packHTML(pack, big) {
  const se = seriesOf(pack.series), series = !!se;
  return `<span class="pack ${big ? 'big' : ''} ${series ? 'series' : ''}" style="--c1:${pack.c1};--c2:${pack.c2}">
    <span class="pk-crimp pk-t"></span>
    <span class="pk-body">
      ${series ? `<span class="pk-ser">${esc(se.short)}</span>` : ''}
      <span class="pk-en">${esc(pack.en)}</span>
      <span class="pk-art">${artImg(pack.cover)}</span>
      <span class="pk-name kw">${esc(pack.name).replace(/・/g, '・<wbr>')}</span>
      <span class="pk-types">${packTypes(pack).map(t => eI(t, 's')).join('')}</span>
      <span class="pk-sub">CS TERMS ・ 5 CARDS</span>
    </span>
    <span class="pk-crimp pk-b"></span>
  </span>`;
}
function cardBackHTML(rare) {
  return `<span class="cback ${rare ? 'rare' : ''}"><span class="cb-logo">CS</span><span class="cb-sub">TERMS CARD</span></span>`;
}
function renderPacks() {
  const loading = !SAVE.ready;
  const none = STORE.tickets < 1 || loading;
  const none10 = STORE.tickets < MULTI_PACKS || loading;
  $('#scr-packs').innerHTML = `<div class="page">
    <header class="top"><button type="button" class="back" data-nav="title">← タイトル</button><h2>パックをひらく</h2></header>
    ${walletHTML([['チケット', STORE.tickets, '枚'], ['パックポイント', STORE.points, 'pt'], ['集めたカード', ownedKinds(), `/ ${ALL_IDS.length}種`]])}
    <p class="note">チケット1枚で1パック（5枚）。「${MULTI_PACKS}連」なら、チケット${MULTI_PACKS}枚で${MULTI_PACKS}パックをまとめてひらけます。チケットは対戦すると増えます（${REWARD_TEXT}）。毎日はじめて遊ぶと+${REWARD.daily}。${SAVE.where === 'cloud' ? 'コレクションはあなたのアカウントに保存されます。' : 'コレクションはこのブラウザに保存されます。'}</p>
    ${loading ? '<p class="msg">セーブデータを読み込み中…</p>' : STORE.tickets < 1 ? '<p class="msg warn">チケットがありません。対戦してチケットを増やそう。</p>' : ''}
    ${SERIES.map(se => `<section class="series">
      <h3 class="ser-h">${esc(se.name)}${se.isNew ? '<b class="ser-new">NEW</b>' : ''}</h3>
      <p class="note">${esc(se.blurb)}</p>
      <div class="packs">${PACKS.filter(pk => pk.series === se.id).sort((a, b) => !!b.isNew - !!a.isNew).map(pk => { // 新しいパックを先頭に
        const [a, b] = packProgress(pk);
        return `<div class="pack-cell">
          <button type="button" class="pack-btn" data-open="${pk.id}" ${none ? 'disabled' : ''} aria-label="${esc(pk.name)}パックをひらく">${pk.isNew ? '<b class="pk-new">NEW</b>' : ''}${packHTML(pk)}</button>
          <p class="pk-prog">${esc(pk.tagline || packTypes(pk).map(t => TYPES[t].name).join('・'))}<br>所持 ${a} / ${b}種</p>
          <div class="pk-btns">
            <button type="button" class="btn gold" data-open="${pk.id}" ${none ? 'disabled' : ''}>ひらく（チケット1枚）</button>
            <button type="button" class="btn ten" data-open10="${pk.id}" ${none10 ? 'disabled' : ''} aria-label="${esc(pk.name)}パックを${MULTI_PACKS}連でひらく（チケット${MULTI_PACKS}枚）">${MULTI_PACKS}連でひらく<small>チケット${MULTI_PACKS}枚で${MULTI_PACKS}パック</small></button>
          </div>
        </div>`;
      }).join('')}</div>
    </section>`).join('')}
    <section class="sec"><h3 class="h3">レア度と出る確率</h3>
      <table class="tbl odds"><thead><tr><th></th><th>◆</th><th>◆◆</th><th>◆◆◆</th><th>◆◆◆◆</th><th>☆ホロ</th></tr></thead><tbody>
        <tr><td>1〜3枚目</td><td>100%</td><td>−</td><td>−</td><td>−</td><td>−</td></tr>
        <tr><td>4枚目</td><td>−</td><td>72%</td><td>18%</td><td>8%</td><td>2%</td></tr>
        <tr><td>5枚目</td><td>−</td><td>50%</td><td>28%</td><td>16%</td><td>6%</td></tr>
      </tbody></table>
      <p class="note">◆＝v1のユニットとふつうのコマンド、◆◆＝v2、◆◆◆＝v3と強いコマンド、◆◆◆◆＝exと人物カード。0.5%の確率で、全部◆◆◆以上の「ゴッドパック」。「コンピュータの父」シリーズでは、◆◆◆◆の半分がそのパックの人物カードになり、人物カードの☆ホロも出る。${MULTI_PACKS}連でも、1パックずつの確率は同じ。</p>
    </section>
  </div>`;
  $('#scr-packs').onclick = e => {
    const b = e.target.closest('[data-open], [data-open10]');
    if (!b || b.disabled) return;
    if (b.dataset.open10) openPack(b.dataset.open10, MULTI_PACKS); else openPack(b.dataset.open);
  };
}

let PACKFLOW = null;
/* n パックをまとめてひらく（1か MULTI_PACKS）。チケットは n 枚。1パックずつの中身は rollPack のまま */
function openPack(packId, n) {
  n = n === MULTI_PACKS ? MULTI_PACKS : 1;
  const pack = PACKS.find(p => p.id === packId);
  if (!pack) return;
  if (!SAVE.ready) { toast('セーブデータを読み込み中です。少し待ってください'); return; }
  if (STORE.tickets < n) { toast(n > 1 ? `${n}連には、パックチケットが${n}枚いります` : 'パックチケットがありません'); return; }
  STORE.tickets -= n;
  const pulls = [];
  for (let k = 0; k < n; k++) pulls.push(...rollPack(pack).map(pl => Object.assign(pl, { pk: k })));
  const seen = new Set();
  pulls.forEach(pl => {
    pl.isNew = !owned(pl.id) && !seen.has(pl.id);
    seen.add(pl.id);
    STORE.coll[pl.id] = owned(pl.id) + 1;
    if (pl.holo) STORE.holo[pl.id] = (STORE.holo[pl.id] || 0) + 1;
  });
  STORE.points += PACK_POINT * n;
  STORE.stats.packs += n;
  saveStore();
  PACKFLOW = { pack, n, pulls, i: -1, stage: 'pack', flipped: false };
  renderPackOverlay();
}
/* 10連の結果：同じカード（ホロかどうかも同じ）をまとめて、ホロ → レア度の高い順 → NEW → 番号の順に並べる */
function multiPulls(pulls) {
  const map = new Map();
  for (const pl of pulls) {
    const k = pl.id + (pl.holo ? '*' : '');
    const e = map.get(k) || { id: pl.id, holo: pl.holo, n: 0, isNew: false };
    e.n++;
    if (pl.isNew) e.isNew = true;
    map.set(k, e);
  }
  return Array.from(map.values()).sort((a, b) => (b.holo - a.holo) || (rarityOf(DEF[b.id]) - rarityOf(DEF[a.id])) || (b.isNew - a.isNew) || (DEF[a.id].no - DEF[b.id].no));
}
function multiDoneHTML(f) {
  const list = multiPulls(f.pulls);
  const cnt = test => f.pulls.filter(test).length;
  const gods = new Set(f.pulls.filter(pl => pl.god).map(pl => pl.pk)).size;
  const step = Math.min(70, Math.round(1500 / list.length)); // めくり終わるまで、長くても2秒ほど
  const sum = [['NEW', cnt(pl => pl.isNew), '種'], ['☆ホロ', cnt(pl => pl.holo), '枚'], [RARITY_MARK[4], cnt(pl => !pl.holo && rarityOf(DEF[pl.id]) === 4), '枚'], [RARITY_MARK[3], cnt(pl => !pl.holo && rarityOf(DEF[pl.id]) === 3), '枚']];
  return `<div class="po-in done multi">
      <h3 class="po-title">${esc(f.pack.name)}パック ×${f.n}${gods ? `<b class="god">GOD PACK${gods > 1 ? ` ×${gods}` : ''}!</b>` : ''}</h3>
      <p class="po-sum">${sum.map(([k, v, u]) => `<span class="${k === 'NEW' ? 'newtxt' : ''}">${k} <b>${v}</b>${u}</span>`).join('')}</p>
      <div class="po-grid multi" style="--step:${step}ms">${list.map((e, k) => {
        const rare = rarityOf(DEF[e.id]) >= 3 || e.holo;
        return `<button type="button" class="tbtn po-flip ${rare ? 'rare' : ''}" style="--i:${k}" data-po-info="${e.id}" aria-label="${esc(DEF[e.id].name)}${e.holo ? '（☆ホロ）' : ''}${e.n > 1 ? ` ${e.n}枚` : ''}${e.isNew ? '（NEW）' : ''}の詳細">
          <span class="po-back" aria-hidden="true">${cardBackHTML(rare)}</span>
          <span class="po-front">${thumbHTML(e.id, { holo: e.holo, badge: e.isNew ? 'NEW' : '' })}</span>
          ${e.n > 1 ? `<b class="po-cnt">×${e.n}</b>` : ''}
        </button>`;
      }).join('')}</div>
      <p class="po-msg">パックポイント +${PACK_POINT * f.n}（いま ${STORE.points}pt）　チケット残り ${STORE.tickets}枚</p>
      <div class="po-btns"><button type="button" class="btn gold" data-po="again" ${STORE.tickets < f.n ? 'disabled' : ''}>もう${f.n}パック</button><button type="button" class="btn" data-po="dex">図鑑で見る</button><button type="button" class="btn ghost" data-po="close">とじる</button></div>
    </div>`;
}
function renderPackOverlay() {
  const f = PACKFLOW, ov = $('#packov');
  if (!f) { ov.hidden = true; ov.innerHTML = ''; return; }
  ov.hidden = false;
  if (f.stage === 'pack') {
    const many = f.n > 1, ghost = c => `<span class="po-ghost ${c}" aria-hidden="true">${packHTML(f.pack, true)}</span>`;
    ov.innerHTML = `<div class="po-in">
      <p class="silk">${many ? `OPEN ${f.n} PACKS` : 'OPEN PACK'} ・ TICKETS LEFT ${STORE.tickets}</p>
      <button type="button" class="po-pack ${many ? 'many' : ''}" data-po="tear" aria-label="${many ? `${f.n}パックを開ける` : 'パックを開ける'}">${many ? ghost('g1') + ghost('g2') : ''}${packHTML(f.pack, true)}${many ? `<b class="po-x">×${f.n}</b>` : ''}</button>
      <p class="po-msg">${many ? `タップして${f.n}パックまとめて開封` : 'タップして開封'}</p>
    </div>`;
    const b = $('.po-pack', ov); if (b) b.focus({ preventScroll: true });
  } else if (f.stage === 'cards') {
    const pl = f.pulls[f.i];
    const rare = rarityOf(DEF[pl.id]) >= 3 || pl.holo;
    ov.innerHTML = `<div class="po-in">
      <p class="silk">CARD ${f.i + 1} / 5</p>
      <button type="button" class="po-card ${rare ? 'rare' : ''}" data-po="next" aria-label="カードをめくる">
        <span class="po-back">${cardBackHTML(rare)}</span>
        <span class="po-front">${thumbHTML(pl.id, { holo: pl.holo, badge: pl.isNew ? 'NEW' : '' })}</span>
      </button>
      <p class="po-msg">タップしてめくる</p>
      <div class="po-btns"><button type="button" class="btn ghost" data-po="all">すべてめくる</button></div>
    </div>`;
    const b = $('.po-card', ov); if (b) b.focus({ preventScroll: true });
  } else if (f.n > 1) {
    ov.innerHTML = multiDoneHTML(f);
    ov.scrollTop = 0;
  } else {
    ov.innerHTML = `<div class="po-in done">
      <h3 class="po-title">${esc(f.pack.name)}パック${f.pulls[0].god ? '<b class="god">GOD PACK!</b>' : ''}</h3>
      <div class="po-grid">${f.pulls.map(pl => `<button type="button" class="tbtn" data-po-info="${pl.id}" aria-label="${esc(DEF[pl.id].name)}の詳細">${thumbHTML(pl.id, { holo: pl.holo, badge: pl.isNew ? 'NEW' : '' })}</button>`).join('')}</div>
      <p class="po-msg">パックポイント +${PACK_POINT}（いま ${STORE.points}pt）　チケット残り ${STORE.tickets}枚</p>
      <div class="po-btns"><button type="button" class="btn gold" data-po="again" ${STORE.tickets < 1 ? 'disabled' : ''}>もう1パック</button><button type="button" class="btn" data-po="dex">図鑑で見る</button><button type="button" class="btn ghost" data-po="close">とじる</button></div>
    </div>`;
  }
}
async function tearPack() {
  const f = PACKFLOW;
  if (!f || f.tearing) return;
  f.tearing = true;
  const el = $('#packov .po-pack');
  if (el) el.classList.add('tear');
  await sleep(REDUCED ? 60 : 700);
  if (PACKFLOW !== f) return;
  if (f.n > 1) f.stage = 'done'; // 10連は、1枚ずつめくらずに、まとめて結果を見せる
  else { f.stage = 'cards'; f.i = 0; f.flipped = false; }
  renderPackOverlay();
}
function flipOrNext() {
  const f = PACKFLOW;
  if (!f) return;
  if (!f.flipped) {
    f.flipped = true;
    const b = $('#packov .po-card');
    const pl = f.pulls[f.i];
    if (b) { b.classList.add('flipped'); b.setAttribute('aria-label', '次のカード'); }
    const m = $('#packov .po-msg');
    if (m) m.innerHTML = `${esc(DEF[pl.id].name)}${DEF[pl.id].ex ? 'ex' : ''}${pl.holo ? '（☆ホロ）' : ''}　${RARITY_MARK[rarityOf(DEF[pl.id])]}${pl.isNew ? '　<b class="newtxt">NEW</b>' : ''}`;
    return;
  }
  if (f.i >= 4) f.stage = 'done'; else { f.i++; f.flipped = false; }
  renderPackOverlay();
}
$('#packov').addEventListener('click', e => {
  const f = PACKFLOW;
  if (!f) return;
  const info = e.target.closest('[data-po-info]');
  if (info) { openCardInfo(info.dataset.poInfo); return; }
  const b = e.target.closest('[data-po]');
  if (!b || b.disabled) return;
  const k = b.dataset.po;
  if (k === 'tear') tearPack();
  else if (k === 'next') flipOrNext();
  else if (k === 'all') { f.stage = 'done'; renderPackOverlay(); }
  else if (k === 'again') { const id = f.pack.id, n = f.n; PACKFLOW = null; openPack(id, n); }
  else if (k === 'dex') { PACKFLOW = null; renderPackOverlay(); show('dex'); }
  else if (k === 'close') { PACKFLOW = null; renderPackOverlay(); if (RENDER[UI.screen]) RENDER[UI.screen](); }
});

/* =========================================================
   対戦
   ========================================================= */
/* だれの目線で盤面を見るか（UI.me）。CPU戦は0、オンラインは自分の席、この端末での2人対戦は操作中の人 */
const meP = () => UI.g.players[UI.me];
const opP = () => UI.g.players[1 - UI.me];
function whoLabel(p) {
  if (UI.vs === 'local') return `プレイヤー${p.idx + 1}`;
  if (p.idx === UI.me) return 'あなた';
  return p.isCPU ? 'CPU' : '相手';
}
function turnLabel(p) { return UI.vs === 'local' ? `プレイヤー${p.idx + 1}の番` : (p.idx === UI.me ? 'あなたの番' : '相手の番'); }
const localSetup = () => new Promise(res => { UI.mode = 'setup'; UI.setupResolve = res; renderBattle(); });
const localTurn = () => new Promise(res => { UI.mode = 'idle'; UI.turnResolve = res; renderBattle(); });

function makeIO() {
  return {
    choose: (p, title, options, opts) => openChoice(title, options, opts),
    coin: (results, label) => showCoins(results, label),
    log: (msg, cls) => addLog(msg, cls),
    render: () => renderBattle(),
    pause: ms => sleep(UI.fast ? ms * 0.35 : ms),
    banner: p => showBanner(turnLabel(p), `ターン ${UI.g ? UI.g.turn : ''}`),
    fx: (uid, kind, val, extra) => { renderBattle(); fx(uid, kind, val, extra); },
    say: t => say(t),
    setup: () => localSetup(),
    humanTurn: () => localTurn(),
  };
}

/* この端末で2人：番や選択のたびに、端末を渡してもらう */
function handover(p, why) {
  const g = UI.g;
  if (!g || g.over || UI.me === p.idx) return Promise.resolve();
  return new Promise(res => {
    const ov = $('#handover');
    const who = `プレイヤー${p.idx + 1}`;
    const line = why === 'setup' ? `${who}の準備です` : why === 'choice' ? `${who}が選ぶ番です` : why === 'back' ? `${who}の番にもどります` : `${who}の番です`;
    ov.innerHTML = `<div class="ho-in" role="dialog" aria-modal="true" aria-label="${esc(line)}">
      <p class="silk">PASS THE DEVICE</p><h2 class="ho-who">${esc(who)}</h2><p class="ho-line">${esc(line)}</p>
      <p class="note">手札が見えないように、端末を${esc(who)}に渡してから押してください。</p>
      <button type="button" class="btn gold big" data-ho="go">${esc(who)}がはじめる</button></div>`;
    ov.hidden = false;
    UI.me = p.idx;
    renderBattle();
    const b = $('[data-ho]', ov); if (b) b.focus({ preventScroll: true });
    ov.onclick = e => { if (!e.target.closest('[data-ho]')) return; ov.hidden = true; ov.innerHTML = ''; ov.onclick = null; renderBattle(); res(); };
  });
}
function closeHandover() { const ov = $('#handover'); ov.hidden = true; ov.innerHTML = ''; }
function makeLocalIO() {
  const io = makeIO();
  let chain = Promise.resolve();
  io.setup = p => (chain = chain.then(async () => { await handover(p, 'setup'); if (UI.g && !UI.g.over) await localSetup(); }));
  io.humanTurn = async p => { await handover(p, 'turn'); if (UI.g && !UI.g.over) await localTurn(); };
  io.choose = async (p, title, options, opts) => {
    const back = UI.me;
    if (p.idx !== UI.me) await handover(p, 'choice');
    const v = await openChoice(`プレイヤー${p.idx + 1}：${title}`, options, opts);
    if (UI.g && !UI.g.over && back !== p.idx) await handover(UI.g.players[back], 'back');
    return v;
  };
  return io;
}

function beginBattle(g) {
  UI.g = g; UI.mode = 'idle'; UI.targets = null; UI.busy = false; UI.logs = []; UI.lastLog = ''; UI.waitNote = '';
  renderLogPanel();
  show('battle');
  runGame(g).then(() => {
    if (UI.g !== g || g.aborted) return;
    grantReward(g);
    if (UI.vs === 'online') netTeardown();
    renderBattle();
    setTimeout(() => { if (UI.g === g) showResult(g); }, 500);
  }).catch(err => {
    console.error(err);
    if (UI.g === g) toast('エラーが起きました：' + err.message);
  });
}
function startBattle() {
  const me = deckById(UI.deck.me) || PRESETS[0];
  if (validateDeck(me).errs.length) { toast('このデッキはまだ使えません。デッキ編集で直してください'); return; }
  const pool = PRESETS.filter(d => d.id !== me.id);
  const op = UI.deck.opp === 'random' ? rndU(pool) : (deckById(UI.deck.opp) || rndU(pool));
  if (UI.g) abortBattle();
  setRNG(Math.random);
  UI.vs = 'cpu'; UI.me = 0;
  beginBattle(newGame({
    io: makeIO(),
    players: [
      { name: 'あなた', isCPU: false, deck: me.cards, energy: me.energy, deckName: me.name },
      { name: 'CPU', isCPU: true, deck: op.cards, energy: op.energy, deckName: op.name },
    ],
  }));
}
function startLocal() {
  const d1 = deckById(UI.deck.me) || PRESETS[0], d2 = deckById(UI.deck.p2) || PRESETS[1];
  if (validateDeck(d1).errs.length || validateDeck(d2).errs.length) { toast('使えないデッキがあります。デッキ編集で直してください'); return; }
  if (UI.g) abortBattle();
  setRNG(Math.random);
  UI.vs = 'local'; UI.me = 0;
  beginBattle(newGame({
    io: makeLocalIO(),
    players: [
      { name: 'プレイヤー1', deck: d1.cards, energy: d1.energy, deckName: d1.name },
      { name: 'プレイヤー2', deck: d2.cards, energy: d2.energy, deckName: d2.name },
    ],
  }));
}
const rndU = a => a[Math.floor(Math.random() * a.length)];

function abortBattle() {
  const g = UI.g;
  if (!g) return;
  if (UI.vs === 'online') { if (!g.over) netSend({ t: 'surrender' }); netTeardown(); } // 途中でぬけたら降参あつかい
  closeHandover();
  g.aborted = true; g.over = true; g.io = NOOP_IO;
  const t = UI.turnResolve; UI.turnResolve = null; if (t) t();
  const s = UI.setupResolve; UI.setupResolve = null; if (s) s();
  closeChoice(); closeSheet();
  $('#result').hidden = true; $('#menu').hidden = true; $('#coin').hidden = true; $('#banner').hidden = true;
  UI.g = null; UI.mode = 'idle'; UI.targets = null; UI.busy = false;
}

const isMyTurn = () => { const g = UI.g; return !!(g && !g.over && g.cur === UI.me && UI.turnResolve && !UI.busy); };
function findMon(uid) {
  for (const p of UI.g.players) for (const m of inPlay(p)) if (m.uid === uid) return m;
  return null;
}
function ownerOf(m) { return UI.g.players.find(p => inPlay(p).includes(m)); }

function emptySlot(label) { return `<span class="slot-empty"><span>${label}</span></span>`; }
function benchHTML(p, mine) {
  const out = [];
  for (let i = 0; i < BENCH_MAX; i++) out.push(p.bench[i] ? monHTML(p.bench[i], { setup: mine && UI.mode === 'setup' }) : emptySlot('ベンチ'));
  return out.join('');
}
function pbarHTML(p) {
  const g = UI.g;
  const cur = g.cur === p.idx && !g.over && UI.mode !== 'setup' && g.turn > 0;
  return `<div class="pbar ${p.idx !== UI.me ? 'opp' : 'me'} ${cur ? 'cur' : ''}">
    <span class="who">${esc(whoLabel(p))}</span><span class="dname">${esc(p.deckName)}</span>
    <span class="pts"><span class="silk">ポイント</span><span class="leds" role="img" aria-label="${p.points}ポイント">${[0, 1, 2].map(i => `<i class="led ${i < p.points ? 'on' : ''}"></i>`).join('')}</span></span>
  </div>`;
}
function pileHTML(p) {
  return `<div class="pile">
    <span class="pl"><span class="silk">山札</span><b>${p.deck.length}</b></span>
    ${p.idx !== UI.me ? `<span class="pl"><span class="silk">手札</span><b>${p.hand.length}</b></span>` : ''}
    <button type="button" class="pl trash" data-act="trash" data-p="${p.idx}"><span class="silk">トラッシュ</span><b>${p.discard.length}</b></button>
  </div>`;
}
function zoneHTML(p, mine) {
  const g = UI.g;
  const can = mine && isMyTurn() && UI.mode === 'idle' && canAttachEnergy(g, p);
  const cur = p.energyCur ? eI(p.energyCur, 'xl') : '<i class="e xl empty"></i>';
  const inner = `<span class="z-cur">${cur}</span><span class="z-info"><span class="silk">エネルギー</span><span class="z-next">次 ${p.energyNext ? eI(p.energyNext, 's') : '−'}</span></span>`;
  return can
    ? `<button type="button" class="zone tap" data-act="zone" aria-label="エネルギーをつける">${inner}</button>`
    : `<div class="zone ${mine && p.t.energyDone ? 'used' : ''}">${inner}</div>`;
}
function midHTML(g) {
  let main;
  if (UI.mode === 'setup') main = '<b>準備</b><span class="tk wrap">手札のv1ユニットをタップして、バトル場とベンチ（3体まで）に出そう</span>';
  else if (g.over) main = '<b>対戦終了</b>';
  else if (UI.mode === 'target') main = `<b>選択</b><span class="tk wrap">${esc(UI.targetLabel)}</span>`;
  else if (g.turn === 0) main = '<b>準備中</b>';
  else main = `<b>${esc(turnLabel(g.players[g.cur]))}</b><span class="tk">${esc(UI.lastLog)}</span>`;
  const field = g.field ? `<button type="button" class="iconbtn fieldchip" data-act="field" aria-label="フィールド「${esc(DEF[g.field.card.id].name)}」の説明">${artImg(g.field.card.id)}<span>${esc(DEF[g.field.card.id].name)}</span></button>` : '';
  return `<span class="turn">T${String(g.turn).padStart(2, '0')}</span><span class="midtxt">${main}</span>${field}<button type="button" class="iconbtn" data-act="log">ログ</button>`;
}

function renderBattle() {
  const g = UI.g;
  if (!g || UI.screen !== 'battle') return;
  const me = g.players[UI.me], op = g.players[1 - UI.me];
  const handEl = $('#hand');
  const hs = handEl.scrollLeft;
  const myTurn = isMyTurn();
  const hideOpp = g.turn === 0 && UI.vs !== 'cpu'; // 準備が終わるまで、相手の並べ方は見せない
  $('#board').innerHTML = `
    ${pbarHTML(op)}
    <div class="field f-opp">
      <div class="bench">${hideOpp ? [1, 2, 3].map(i => emptySlot('ベンチ')).join('') : benchHTML(op, false)}</div>
      <div class="arow">${pileHTML(op)}<div class="aslot">${op.active && !hideOpp ? monHTML(op.active) : emptySlot(g.turn === 0 ? '準備中…' : 'バトル場')}</div>${zoneHTML(op, false)}</div>
    </div>
    <div class="mid">${midHTML(g)}</div>
    <div class="field f-me">
      <div class="arow">${pileHTML(me)}<div class="aslot">${me.active ? monHTML(me.active, { hint: myTurn && UI.mode === 'idle', setup: UI.mode === 'setup' }) : emptySlot('バトル場')}</div>${zoneHTML(me, true)}</div>
      <div class="bench">${benchHTML(me, true)}</div>
    </div>
    ${pbarHTML(me)}`;
  handEl.innerHTML = me.hand.map(c => {
    let ok = false;
    if (UI.mode === 'setup') ok = isBasic(c) && (!me.active || me.bench.length < BENCH_MAX);
    else if (myTurn && UI.mode === 'idle') ok = handInfo(g, me, c).ok;
    return `<button type="button" class="hbtn ${ok ? 'ok' : ''} ${UI.mode === 'target' ? 'dim' : ''}" data-act="hand" data-uid="${c.uid}" aria-label="${esc(DEF[c.id].name)}">${handCardHTML(c)}</button>`;
  }).join('') || '<p class="silk empty-hand">手札なし</p>';
  handEl.scrollLeft = hs;
  renderActbar();
}
function renderActbar() {
  const g = UI.g;
  if (!g) return;
  const fast = `<button type="button" class="iconbtn sq" data-act="speed" aria-pressed="${UI.fast}" aria-label="演出の速さ（いま${UI.fast ? '2倍速' : '通常'}）" title="演出の速さ">${UI.fast ? '×2' : '×1'}</button>`;
  const menu = '<button type="button" class="iconbtn sq" data-act="menu" aria-label="メニュー" title="メニュー">≡</button>';
  let main;
  if (UI.mode === 'setup') main = `<button type="button" class="btn gold grow" data-act="ready" ${meP().active ? '' : 'disabled'}>準備OK</button>`;
  else if (UI.mode === 'target') main = '<button type="button" class="btn grow" data-act="cancel">キャンセル</button>';
  else if (g.over) main = '<button type="button" class="btn gold grow" data-act="result">結果を見る</button>';
  else if (isMyTurn()) main = `<button type="button" class="btn grow" data-act="attackmenu" ${meP().active ? '' : 'disabled'}>ワザ・にげる</button><button type="button" class="btn gold grow" data-act="end">番を終わる</button>`;
  else {
    let w = '…';
    if (UI.vs === 'online' && NET.oppHere === false) w = NET.mode === 'p2p' ? '相手との接続が不安定です…' : '相手の接続を待っています…';
    else if (UI.waitNote) w = UI.waitNote;
    else if (g.turn === 0) w = UI.vs === 'online' ? '相手の準備を待っています…' : '準備中…';
    else if (g.cur !== UI.me) w = UI.vs === 'cpu' ? '相手が考え中…' : '相手の番です…';
    main = `<span class="waiting">${esc(w)}</span>`;
  }
  $('#actbar').innerHTML = menu + main + fast;
}

/* ---------- 対戦中の操作 ---------- */
$('#scr-battle').addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  const g = UI.g;
  if (!el || !g) return;
  const act = el.dataset.act;
  const uid = el.dataset.uid ? +el.dataset.uid : 0;
  if (act === 'menu') return openMenu();
  if (act === 'log') return toggleLog(true);
  if (act === 'field') return UI.g && UI.g.field && openCardInfo(UI.g.field.card.id);
  if (act === 'speed') { UI.fast = !UI.fast; renderActbar(); return; }
  if (act === 'trash') return openTrash(g.players[+el.dataset.p]);
  if (act === 'result') return showResult(g);
  if (UI.mode === 'setup') return onSetupClick(act, uid);
  if (UI.mode === 'target') {
    if (act === 'cancel') return exitTarget();
    if (act === 'mon' && UI.targets && UI.targets.has(uid)) { const fn = UI.onTarget; exitTarget(); fn(findMon(uid)); }
    return;
  }
  if (act === 'end') return onEndTurn();
  if (act === 'attackmenu') { const a = meP().active; if (a) onMon(a.uid); return; }
  if (act === 'zone') return onZone();
  if (act === 'hand') return onHandCard(uid);
  if (act === 'mon') return onMon(uid);
});

function onSetupClick(act, uid) {
  const g = UI.g, p = meP();
  if (act === 'hand') {
    const c = p.hand.find(x => x.uid === uid);
    if (!c) return;
    if (isBasic(c)) {
      if (!setupPlace(g, p, c)) toast('ベンチがいっぱいです（3体まで）');
      renderBattle();
    } else openSheet(cardHTML(c.id), []);
  } else if (act === 'mon') {
    const m = inPlay(p).find(x => x.uid === uid);
    if (m) { setupUnplace(g, p, m); renderBattle(); }
  } else if (act === 'ready') {
    if (!p.active) return;
    UI.mode = 'idle';
    const r = UI.setupResolve; UI.setupResolve = null;
    renderBattle();
    if (r) r();
  }
}

function chooseTarget(targets, label, cb) {
  if (!targets || !targets.length) return;
  if (targets.length === 1) { cb(targets[0]); return; }
  UI.mode = 'target';
  UI.targets = new Set(targets.map(m => m.uid));
  UI.onTarget = cb;
  UI.targetLabel = label;
  renderBattle();
}
function exitTarget() {
  UI.mode = 'idle'; UI.targets = null; UI.onTarget = null; UI.targetLabel = '';
  renderBattle();
}

async function act(fn, endTurn) {
  const g = UI.g;
  if (!g || UI.busy || !UI.turnResolve) return;
  UI.busy = true;
  closeSheet();
  renderBattle();
  let r = false;
  try { r = await fn(); } catch (err) { console.error(err); toast('エラー：' + err.message); }
  UI.busy = false;
  if (UI.g !== g) return;
  if (g.over || (endTurn && r)) { finishHumanTurn(); return; }
  renderBattle();
}
function doMove(m, endTurn) {
  const g = UI.g;
  return act(() => { if (UI.vs === 'online') netSend(m); return applyMove(g, g.players[UI.me], m); }, endTurn);
}
function finishHumanTurn() {
  const g = UI.g;
  if (UI.vs === 'online' && g && !g.over && UI.turnResolve) netSend({ t: 'end', h: stateHash(g) });
  const r = UI.turnResolve;
  UI.turnResolve = null;
  UI.mode = 'idle';
  renderBattle();
  if (r) r();
}

function onHandCard(uid) {
  const g = UI.g, p = meP();
  const card = p.hand.find(c => c.uid === uid);
  if (!card) return;
  const d = DEF[card.id];
  if (!isMyTurn()) { openSheet(cardHTML(card.id), []); return; }
  const info = handInfo(g, p, card);
  const b = { label: info.label, disabled: !info.ok, note: info.reason, cls: 'gold' };
  if (d.kind === 'mon' && d.stage === 1) b.fn = () => doMove({ t: 'bench', u: card.uid });
  else if (d.kind === 'mon') b.fn = () => chooseTarget(info.targets, `${d.name}に進化させるユニットを選んでください`, m => doMove({ t: 'evolve', u: card.uid, to: m.uid }));
  else if (info.targets) b.fn = () => chooseTarget(info.targets, `「${d.name}」を使うユニットを選んでください`, m => doMove({ t: 'trainer', u: card.uid, to: m.uid }));
  else b.fn = () => doMove({ t: 'trainer', u: card.uid });
  openSheet(cardHTML(card.id), [b]);
}

function onZone() {
  const g = UI.g, p = meP();
  if (!canAttachEnergy(g, p)) return;
  chooseTarget(inPlay(p), 'エネルギーをつけるユニットを選んでください', m => doMove({ t: 'attach', to: m.uid }));
}

function liveStateHTML(m, owner) {
  const g = UI.g;
  const sts = Object.keys(STATUS).filter(k => m.status[k]);
  return `<div class="live">
    <p><b>${esc(whoLabel(owner))}の${owner.active === m ? 'バトル場' : 'ベンチ'}</b>　HP ${hpLeft(m)} / ${maxHp(m)}</p>
    <p>エネルギー ${m.energy.length ? m.energy.map(t => eI(t, 's')).join('') : 'なし'}${m.tool ? `　どうぐ「${esc(DEF[m.tool.id].name)}」` : ''}</p>
    ${sts.map(k => `<p><b class="st st-${k}">${STATUS[k].name}</b> ${esc(STATUS[k].text)}</p>`).join('')}
    ${m.shield && m.shield.turn >= g.turn ? '<p>次の相手の番、受けるワザのダメージ-20</p>' : ''}
  </div>`;
}

function onMon(uid) {
  const g = UI.g, me = meP();
  const m = findMon(uid);
  if (!m) return;
  const owner = ownerOf(m);
  const buttons = [];
  if (owner === me && isMyTurn()) {
    if (m === me.active) {
      DEF[m.id].atk.forEach((a, i) => {
        const info = attackInfo(g, me, i);
        const cut = !info.ok ? '' : [me.t.anyColor && a.costArr.some(t => t !== 'none') ? '詩的科学で、どの色のエネルギーでも使える' : '',
          me.t.costCut && (me.t.anyColor ? a.costArr.length : a.costArr.includes('none')) ? 'データ圧縮で、無色エネルギーが1個少なくてよい' : ''].filter(Boolean).join('・');
        buttons.push({ html: `<span class="ab">${atkLineHTML(a)}</span>`, cls: 'atk', disabled: !info.ok, note: info.reason || cut, fn: () => doMove({ t: 'attack', i }, true) });
      });
      const r = retreatInfo(g, me);
      buttons.push({ html: `<span class="ab center">にげる <span class="cost">${r.cost ? eI('none', 's').repeat(r.cost) : '（コストなし）'}</span></span>`, disabled: !r.ok, note: r.reason, fn: () => chooseTarget(me.bench, 'バトル場に出すベンチのユニットを選んでください', b => doMove({ t: 'retreat', to: b.uid })) });
    }
    const ab = DEF[m.id].ability;
    if (ab && ab.kind === 'active') {
      const info = abilityInfo(g, me, m);
      buttons.push({ label: `特性「${ab.name}」を使う`, disabled: !info.ok, note: info.reason, fn: () => doMove({ t: 'ability', m: m.uid }) });
    }
  }
  openSheet(liveStateHTML(m, owner) + cardHTML(m.id, { m }), buttons);
}

function onEndTurn() {
  const g = UI.g, p = meP();
  if (canAttachEnergy(g, p) && inPlay(p).length) {
    openSheet('<div class="confirm"><h3>エネルギーをつけずに番を終わりますか？</h3><p>このターンのエネルギーは、つけないと消えてしまいます。</p></div>', [{ label: '番を終わる', cls: 'gold', fn: () => finishHumanTurn() }]);
    return;
  }
  finishHumanTurn();
}

function openTrash(p) {
  const ids = p.discard.map(c => c.id);
  openSheet(`<div class="confirm"><h3>${esc(whoLabel(p))}のトラッシュ（${ids.length}枚）</h3>${ids.length ? `<div class="grid mini">${ids.map(id => `<div>${thumbHTML(id)}</div>`).join('')}</div>` : '<p>まだありません。</p>'}</div>`, []);
}

function openMenu() {
  const g = UI.g;
  const m = $('#menu');
  m.innerHTML = `<div class="choice-in" role="dialog" aria-modal="true" aria-label="メニュー"><h3>メニュー</h3>
    <div class="menu-btns">
      <button type="button" class="btn" data-m="close">対戦にもどる</button>
      <button type="button" class="btn" data-m="rules">あそびかたを見る</button>
      ${g && !g.over ? '<button type="button" class="btn danger" data-m="give">降参する</button>' : ''}
      <button type="button" class="btn ghost" data-m="title">タイトルにもどる</button>
    </div></div>`;
  m.hidden = false;
  m.onclick = e => {
    const b = e.target.closest('[data-m]');
    if (!b && e.target !== m) return;
    m.hidden = true;
    const k = b ? b.dataset.m : 'close';
    if (k === 'title') { abortBattle(); show('title'); }
    else if (k === 'give' && UI.g && !UI.g.over) {
      const gg = UI.g;
      if (UI.vs === 'online') netSend({ t: 'surrender' });
      gg.surrenderedBy = UI.me;
      closeHandover();
      endGame(gg, 1 - UI.me, `${UI.vs === 'local' ? `プレイヤー${UI.me + 1}` : 'あなた'}が降参した`);
      if (UI.vs === 'online') netWake(); // 相手の手を待っているところも止める
      closeChoice();
      const t = UI.turnResolve; UI.turnResolve = null; if (t) t();
      const s = UI.setupResolve; UI.setupResolve = null; if (s) s();
      renderBattle();
    } else if (k === 'rules') {
      openSheet(`<div class="confirm rules-mini"><h3>あそびかた（要点）</h3><ul>
        <li>先に3ポイント取ったら勝ち。exをダウンさせると2ポイント。</li>
        <li>エネルギーは1ターンに1個。エネルギーゾーンをタップしてつける。</li>
        <li>サポートは1ターンに1枚、グッズは何枚でも。</li>
        <li>バトル場のユニットをタップすると、ワザ・にげるが選べる。ワザを使うと番が終わる。</li>
        <li>弱点のタイプからは+20ダメージ。</li></ul></div>`, []);
    }
  };
}

/* =========================================================
   オンライン対戦（あいことば）
   2人の画面で同じ対戦を動かし、操作（手）だけをやりとりする。
   手は db（あとから来ても読める）と room（すぐ届く）の両方で送る。
   ========================================================= */
const NET = {
  ready: null, db: null, room: null, uid: null,
  on: false, seat: 0, gid: '', code: '', myPath: '', oppPath: '',
  mine: [], remote: [], read: 0, pending: {}, waiter: null, unsubs: [], chan: null,
  writing: false, dirty: false, fails: 0, needAt: 0, oppHere: null,
};
const NETUI = { stage: 'idle', code: '', err: '', why: '', checked: false, stopWait: null };

function netInit() {
  if (NET.ready) return NET.ready;
  NET.ready = (async () => {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return { ok: false, why: 'オンライン対戦は、このページをClaudeの中で開いたときに使えます。' };
      const [db, user, room] = await withTimeout(Promise.all([window.claude.use('db'), window.claude.use('user'), window.claude.use('room')]), 11000);
      if (!db || !user) return { ok: false, why: 'オンライン対戦には、Claudeへのログインが必要です。' };
      const id = await withTimeout(user.id(), 5000);
      if (!id) return { ok: false, why: 'オンライン対戦には、Claudeへのログインが必要です。' };
      let can = null;
      try { can = typeof user.can === 'function' ? await user.can('data.write') : null; } catch (e) { can = null; }
      if (can === false) return { ok: false, why: 'このページを「見るだけ」の権限で開いているため、オンライン対戦はできません。持ち主に、コントリビューター以上の権限で共有してもらってください。' };
      NET.db = db; NET.room = room; NET.uid = id;
      return { ok: true };
    } catch (e) {
      return { ok: false, why: 'オンライン対戦の準備ができませんでした。ページを開きなおしてください。' };
    }
  })();
  return NET.ready;
}
const deckPayload = d => ({ name: String(d.name || 'デッキ').slice(0, 40), cards: Object.assign({}, d.cards), energy: (d.energy || []).slice() });
function deckShapeOK(d) {
  if (!d || typeof d !== 'object' || !d.cards || typeof d.cards !== 'object' || !Array.isArray(d.energy)) return false;
  const ids = Object.keys(d.cards);
  if (!ids.every(id => DEF[id] && Number.isInteger(d.cards[id]) && d.cards[id] >= 1 && d.cards[id] <= 2)) return false;
  if (deckCount(d.cards) !== 20 || !ids.some(id => DEF[id].kind === 'mon' && DEF[id].stage === 1)) return false;
  return d.energy.length >= 1 && d.energy.length <= 3 && d.energy.every(t => TYPES[t] && t !== 'none');
}

async function netCreateRoom(deck) {
  for (let k = 0; k < 6; k++) {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const ref = NET.db.doc('pvp/' + code);
    const snap = await withTimeout(ref.get(), 10000);
    if (snap && snap.exists && Date.now() - ((snap.data() || {}).createdAt || 0) < 2 * 3600e3) continue; // 使用中
    const room = {
      v: 1, code, gid: `${code}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
      host: NET.uid, hostDeck: deckPayload(deck), seed: Math.floor(Math.random() * 2147483647), createdAt: Date.now(), status: 'open',
    };
    await withTimeout(ref.set(room), 10000);
    return room;
  }
  throw new Error('部屋をつくれませんでした。もう一度ためしてください。');
}
function netWaitGuest(room) {
  const ref = NET.db.doc('pvp/' + room.code);
  let done = false, timer = null;
  const stop = () => { done = true; clearTimeout(timer); try { unsub(); } catch (e) { /* noop */ } };
  const unsub = ref.onSnapshot(snap => {
    if (done || !snap.exists) return;
    const d = snap.data() || {};
    if (d.gid !== room.gid) { stop(); NETUI.stage = 'idle'; NETUI.err = '部屋がなくなりました。もう一度つくってください。'; renderSelect(); return; }
    if (d.status !== 'playing' || !d.guestTok || !d.guestDeck) return;
    clearTimeout(timer);
    // 同時に2人が入ろうとしたときのために、少し待ってから確定する
    timer = setTimeout(async () => {
      if (done) return;
      let fin = d;
      try { const s2 = await withTimeout(ref.get(), 8000); if (s2 && s2.exists) fin = s2.data(); } catch (e) { /* そのまま */ }
      if (done || fin.gid !== room.gid || !fin.guestTok) return;
      stop();
      NETUI.stopWait = null; NETUI.stage = 'idle';
      startOnline(fin, 0);
    }, 1000);
  }, () => { stop(); NETUI.stage = 'idle'; NETUI.err = '部屋の情報を読めなくなりました。'; renderSelect(); });
  NETUI.stopWait = cancelRoom => { stop(); if (cancelRoom) ref.delete().catch(() => {}); };
}
async function netJoinRoom(code, deck) {
  const ref = NET.db.doc('pvp/' + code);
  const snap = await withTimeout(ref.get(), 10000);
  if (!snap || !snap.exists) throw new Error('その「あいことば」の部屋が見つかりません。');
  const r = snap.data() || {};
  if (r.v !== 1 || !r.gid || !deckShapeOK(r.hostDeck)) throw new Error('その部屋には入れません。');
  if (r.status !== 'open') throw new Error('その部屋は、もう対戦がはじまっています。');
  if (Date.now() - (r.createdAt || 0) > 2 * 3600e3) throw new Error('その部屋は古くなっています。新しい部屋をつくってもらってください。');
  const tok = Math.floor(Math.random() * 2176782335).toString(36);
  await withTimeout(ref.update({ status: 'playing', guest: NET.uid, guestDeck: deckPayload(deck), guestTok: tok, joinedAt: Date.now() }), 10000);
  await sleep(700);
  const s2 = await withTimeout(ref.get(), 10000);
  const fin = s2 && s2.exists ? s2.data() : null;
  if (!fin || fin.guestTok !== tok || fin.gid !== r.gid) throw new Error('ほかの人が先にその部屋に入りました。');
  return fin;
}

function startOnline(room, seat, mode) {
  mode = mode || 'claude';
  if (!deckShapeOK(room.hostDeck) || !deckShapeOK(room.guestDeck)) { NETUI.err = 'デッキの情報が正しくないため、対戦をはじめられません。'; if (UI.screen === 'select') renderSelect(); return; }
  if (UI.g) abortBattle();
  netTeardown();
  $('#result').hidden = true;
  Object.assign(NET, {
    on: true, mode, seat, gid: room.gid, code: room.code, mine: [], remote: [], read: 0, pending: {}, waiter: null, unsubs: [], chan: null,
    writing: false, dirty: false, fails: 0, needAt: 0, oppHere: mode === 'p2p' ? P2P.connected : null, isHost: seat === 0,
  });
  if (mode === 'claude') {
    NET.myPath = 'pvpm/' + room.gid + (seat === 0 ? '_h' : '_g' + room.guestTok);
    NET.oppPath = 'pvpm/' + room.gid + (seat === 0 ? '_g' + room.guestTok : '_h');
    try {
      NET.unsubs.push(NET.db.doc(NET.oppPath).onSnapshot(snap => { if (snap && snap.exists) netIngest((snap.data() || {}).moves || []); }, () => {}));
    } catch (e) { /* room だけで続ける */ }
    netJoinChannel(room.gid);
  }
  setRNG(seededRNG(room.seed)); resetUid(); // 2人の画面で同じ乱数・同じカード番号にする
  UI.vs = 'online'; UI.me = seat;
  const mk = (d, i) => ({ name: i === seat ? 'あなた' : '相手', isRemote: i !== seat, deck: d.cards, energy: d.energy, deckName: d.name });
  beginBattle(newGame({ io: makeNetIO(), players: [mk(room.hostDeck, 0), mk(room.guestDeck, 1)] }));
}
async function netJoinChannel(gid) {
  if (!NET.room) return;
  try {
    const ch = await NET.room.join(('pvp-' + gid).toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 48));
    if (!NET.on || NET.gid !== gid) { ch.leave().catch(() => {}); return; }
    NET.chan = ch;
    NET.unsubs.push(ch.on('mv', msg => {
      const d = msg && msg.data;
      if (!d || msg.sameTab || d.gid !== NET.gid || d.seat === NET.seat || !d.m) return;
      netIngest([d.m]);
    }, () => {}));
    NET.unsubs.push(ch.on('need', msg => {
      const d = msg && msg.data;
      if (!d || msg.sameTab || d.gid !== NET.gid || d.seat === NET.seat || !Number.isInteger(d.from)) return;
      for (const m of NET.mine.slice(d.from, d.from + 30)) ch.emit('mv', { gid: NET.gid, seat: NET.seat, m }).catch(() => {});
    }, () => {}));
    ch.presence({ seat: NET.seat, gid }).catch(() => {});
    NET.unsubs.push(ch.onPeers(chg => {
      const here = chg.peers.some(x => !x.sameTab && x.presence && x.presence.gid === gid && x.presence.seat === 1 - NET.seat);
      if (here !== NET.oppHere) { NET.oppHere = here; if (UI.g) renderActbar(); }
    }, () => {}));
  } catch (e) { /* room が使えなくても db だけで対戦できる */ }
}
function netTeardown() {
  for (const u of NET.unsubs) { try { u(); } catch (e) { /* noop */ } }
  NET.unsubs = [];
  if (NET.chan) { NET.chan.leave().catch(() => {}); NET.chan = null; }
  if (NET.on && NET.mode === 'claude' && NET.isHost && NET.db && NET.code) NET.db.doc('pvp/' + NET.code).delete().catch(() => {}); // あいことばを空ける
  const w = NET.waiter; NET.waiter = null;
  NET.on = false;
  if (w) w();
  setRNG(Math.random);
}

/* 自分の手を送る */
function netSend(m) {
  if (!NET.on) return;
  m.s = NET.mine.length;
  NET.mine.push(m);
  if (NET.mode === 'p2p') { p2pSendRaw({ k: 'mv', gid: NET.gid, m }); return; }
  netFlush();
  if (NET.chan) NET.chan.emit('mv', { gid: NET.gid, seat: NET.seat, m }).catch(() => {});
}
async function netFlush() {
  if (!NET.on || !NET.db) return;
  if (NET.writing) { NET.dirty = true; return; }
  NET.writing = true;
  const path = NET.myPath;
  try {
    await NET.db.doc(path).set({ gid: NET.gid, seat: NET.seat, moves: NET.mine.slice(), at: Date.now() });
    NET.fails = 0;
  } catch (e) {
    if (!DB_FATAL.includes(e && e.code) && ++NET.fails <= 6) {
      NET.writing = false;
      setTimeout(netFlush, 1200 + Math.random() * 1800);
      return;
    }
  }
  NET.writing = false;
  if (NET.dirty && NET.myPath === path) { NET.dirty = false; netFlush(); }
}
/* 相手の手を受け取る（順番どおりに並べる） */
function netIngest(list) {
  if (!NET.on) return;
  for (const m of list) {
    if (!m || typeof m !== 'object' || !Number.isInteger(m.s) || m.s < NET.remote.length || m.s > 100000) continue;
    if (m.t === 'surrender') netRemoteSurrender();
    if (m.s === NET.remote.length) NET.remote.push(m); else NET.pending[m.s] = m;
    while (NET.pending[NET.remote.length]) { const k = NET.remote.length; NET.remote.push(NET.pending[k]); delete NET.pending[k]; }
  }
  if (Object.keys(NET.pending).length && NET.chan && Date.now() - NET.needAt > 2000) {
    NET.needAt = Date.now();
    NET.chan.emit('need', { gid: NET.gid, seat: NET.seat, from: NET.remote.length }).catch(() => {});
  }
  netWake();
}
function netNext() {
  return new Promise(res => {
    const take = () => {
      if (!NET.on || !UI.g || UI.g.over) { res(null); return true; }
      if (NET.read < NET.remote.length) { res(NET.remote[NET.read++]); return true; }
      return false;
    };
    if (!take()) NET.waiter = () => take();
  });
}
function netWake() { if (NET.waiter && NET.waiter()) NET.waiter = null; }
function netRemoteSurrender() {
  const g = UI.g;
  if (!g || g.over || UI.vs !== 'online') return;
  g.surrenderedBy = 1 - UI.me;
  endGame(g, UI.me, '相手が降参した');
  netAfterForcedEnd();
}
function netDesync() {
  const g = UI.g;
  if (!g || g.over) return;
  g.desync = true;
  endGame(g, null, '通信のずれが起きたため、引き分けで終わりました');
  netAfterForcedEnd();
}
function netAfterForcedEnd() {
  closeChoice();
  const t = UI.turnResolve; UI.turnResolve = null; if (t) t();
  const s = UI.setupResolve; UI.setupResolve = null; if (s) s();
  netWake();
  renderBattle();
}
/* 2人の画面がずれていないかを確かめるための、盤面のしるし */
function stateHash(g) {
  const mon = m => (m ? [m.uid, m.id, m.dmg, m.energy.join(''), m.tool ? m.tool.id : '', Object.keys(m.status).filter(k => m.status[k] === true).sort().join('')].join(':') : '-');
  const str = JSON.stringify([g.turn, g.cur, g.field ? g.field.card.uid : '', g.players.map(p => [p.points, p.deck.map(c => c.uid).join(','), p.hand.map(c => c.uid).join(','), p.discard.length, p.energyCur, p.energyNext, mon(p.active), p.bench.map(mon)])]);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}
/* 手を盤面に反映する（自分の手も相手の手も、同じ関数で） */
async function applyMove(g, p, m) {
  const card = u => p.hand.find(c => c.uid === u);
  const mon = u => { for (const pl of g.players) for (const x of inPlay(pl)) if (x.uid === u) return x; return null; };
  switch (m && m.t) {
    case 'bench': { const c = card(m.u); return c ? actBench(g, p, c) : false; }
    case 'evolve': { const c = card(m.u), t = mon(m.to); return c && t ? actEvolve(g, p, c, t) : false; }
    case 'attach': { const t = mon(m.to); return t ? actAttach(g, p, t) : false; }
    case 'trainer': { const c = card(m.u); return c ? actTrainer(g, p, c, m.to ? mon(m.to) || undefined : undefined) : false; }
    case 'retreat': { const t = mon(m.to); return t ? actRetreat(g, p, t) : false; }
    case 'ability': { const t = mon(m.m); return t ? actAbility(g, p, t) : false; }
    case 'attack': return p.active && Number.isInteger(m.i) && m.i >= 0 && m.i < DEF[p.active.id].atk.length ? actAttack(g, p, m.i) : false;
    default: return false;
  }
}
const REMOTE_MOVES = ['bench', 'evolve', 'attach', 'trainer', 'retreat', 'ability', 'attack'];
async function remoteTurn(g, p) {
  UI.mode = 'idle';
  renderBattle();
  for (;;) {
    const m = await netNext();
    if (!m || g.over || UI.g !== g) return;
    if (m.t === 'end') { if (typeof m.h === 'number' && m.h !== stateHash(g)) netDesync(); return; }
    if (m.t === 'surrender') return;
    if (!REMOTE_MOVES.includes(m.t)) { netDesync(); return; }
    await applyMove(g, p, m);
    renderBattle();
    if (g.over) return;
  }
}
function makeNetIO() {
  const io = makeIO();
  io.setup = async p => {
    if (!p.isRemote) {
      await localSetup();
      if (UI.g && !UI.g.over && p.active) netSend({ t: 'setup', a: p.active.uid, b: p.bench.map(m => m.uid) });
      renderBattle();
      return;
    }
    const m = await netNext();
    const g = UI.g;
    if (!m || !g || g.over) return;
    if (m.t !== 'setup') { netDesync(); return; }
    const place = u => { const c = p.hand.find(x => x.uid === u); if (c) setupPlace(g, p, c); };
    place(m.a);
    (Array.isArray(m.b) ? m.b : []).slice(0, BENCH_MAX).forEach(place);
    renderBattle();
  };
  io.humanTurn = p => (p.isRemote ? remoteTurn(UI.g, p) : localTurn());
  io.choose = async (p, title, options, opts) => {
    if (!p.isRemote) {
      const i = await openChoiceIdx(title, options, opts);
      if (UI.g && !UI.g.over) netSend({ t: 'choice', i });
      return i >= 0 && options[i] ? options[i].value : null;
    }
    UI.waitNote = '相手が選んでいます…';
    renderActbar();
    const m = await netNext();
    UI.waitNote = '';
    if (UI.g) renderActbar();
    const first = options[0] ? options[0].value : null;
    if (!m || !UI.g || UI.g.over) return first;
    if (m.t !== 'choice' || !Number.isInteger(m.i)) { netDesync(); return first; }
    if (m.i < 0) return opts && opts.cancel ? null : first;
    return options[Math.min(m.i, options.length - 1)].value;
  };
  return io;
}

/* ---------- 演出 ---------- */
async function showCoins(results, label) {
  const ov = $('#coin');
  ov.innerHTML = `<div class="coin-in"><p class="coin-lbl">${esc(label)}</p><div class="coin-row"></div><p class="coin-sum">&nbsp;</p></div>`;
  ov.hidden = false;
  const row = $('.coin-row', ov);
  const per = UI.fast ? 230 : 430;
  for (const r of results) {
    const c = document.createElement('div');
    c.className = 'coin spin';
    c.innerHTML = '<span>?</span>';
    row.appendChild(c);
    await sleep(per);
    c.className = 'coin ' + (r ? 'h' : 't');
    c.innerHTML = `<span>${r ? 1 : 0}</span><small>${r ? 'オモテ' : 'ウラ'}</small>`;
  }
  const h = results.filter(Boolean).length;
  $('.coin-sum', ov).textContent = results.length > 1 ? `オモテ ${h}回・ウラ ${results.length - h}回` : (results[0] ? 'オモテ！' : 'ウラ…');
  await sleep(UI.fast ? 380 : 720);
  ov.hidden = true;
}
async function showBanner(text, sub) {
  const b = $('#banner');
  b.innerHTML = `<div class="bn-in"><b>${esc(text)}</b><small>${esc(sub || '')}</small></div>`;
  b.hidden = false;
  await sleep(UI.fast ? 520 : 950);
  b.hidden = true;
}
let sayTimer = null;
function say(t) {
  const s = $('#say');
  s.textContent = t;
  s.hidden = false;
  s.classList.remove('go'); void s.offsetWidth; s.classList.add('go');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => { s.hidden = true; }, 1300);
}
function fx(uid, kind, val, extra) {
  const el = document.querySelector(`#board [data-uid="${uid}"]`);
  if (!el) return;
  const cls = { hit: 'fx-hit', heal: 'fx-heal', ko: 'fx-ko', attack: 'fx-atk', evolve: 'fx-evo', energy: 'fx-en', enter: 'fx-enter', status: 'fx-st', tool: 'fx-en' }[kind];
  if (cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  if ((kind === 'hit' && val > 0) || kind === 'heal') {
    const n = document.createElement('span');
    n.className = 'pop ' + (kind === 'heal' ? 'heal' : extra ? 'weak' : '');
    n.textContent = (kind === 'heal' ? '+' : '−') + val;
    el.appendChild(n);
    setTimeout(() => n.remove(), 1200);
  }
}

/* ---------- ログ ---------- */
function addLog(msg, cls) {
  UI.logs.push({ msg, cls });
  if (UI.logs.length > 400) UI.logs.shift();
  if (cls !== 'turn') UI.lastLog = msg;
  if (!$('#logpanel').hidden) renderLogPanel();
}
function renderLogPanel() {
  const p = $('#logpanel');
  p.innerHTML = `<div class="lp-head"><b>対戦ログ</b><button type="button" class="iconbtn" id="lpClose">閉じる</button></div>
    <ol>${UI.logs.slice().reverse().map(l => `<li class="lg-${l.cls || 'n'}">${esc(l.msg)}</li>`).join('')}</ol>`;
  $('#lpClose').onclick = () => toggleLog(false);
}
function toggleLog(open) {
  const p = $('#logpanel');
  p.hidden = !open;
  if (open) renderLogPanel();
}

/* ---------- 結果 ---------- */
function grantReward(g) {
  if (g.rewarded || g.aborted) return;
  g.rewarded = true;
  if (UI.vs === 'local' || g.desync) { g.reward = 0; return; } // この端末での2人対戦と、通信エラーのときはチケットなし
  let t = 0;
  if (g.winner === UI.me) { t = REWARD.win; STORE.stats.wins++; } else if (g.winner === null) { t = REWARD.draw; STORE.stats.draws++; } else { t = g.surrenderedBy === UI.me ? 0 : REWARD.lose; STORE.stats.losses++; }
  STORE.tickets += t;
  g.reward = t;
  saveStore();
}
function showResult(g) {
  const r = $('#result');
  const local = UI.vs === 'local', online = UI.vs === 'online';
  const win = !local && g.winner === UI.me, draw = g.winner === null;
  const p0 = g.players[0], p1 = g.players[1];
  const me = g.players[UI.me], op = g.players[1 - UI.me];
  const head = local ? (draw ? '引き分け' : `プレイヤー${g.winner + 1}の勝ち`) : (win ? '勝ち！' : draw ? '引き分け' : '負け');
  const score = local
    ? `<span>プレイヤー1 <b>${p0.points}</b></span><span class="vs">-</span><span><b>${p1.points}</b> プレイヤー2</span>`
    : `<span>あなた <b>${me.points}</b></span><span class="vs">-</span><span><b>${op.points}</b> ${online ? '相手' : 'CPU'}</span>`;
  const p2p = online && NET.mode === 'p2p';
  const btns = online
    ? `${p2p ? '<button type="button" class="btn gold" data-r="again2">もう一度（同じ相手と）</button>' : ''}<button type="button" class="btn ${p2p ? '' : 'gold'}" data-r="online">オンライン対戦にもどる</button><button type="button" class="btn" data-r="packs" ${STORE.tickets < 1 ? 'disabled' : ''}>パックをひらく</button><button type="button" class="btn ghost" data-r="close">盤面を見る</button>`
    : `<button type="button" class="btn gold" data-r="again">もう一度</button>${local ? '' : `<button type="button" class="btn" data-r="packs" ${STORE.tickets < 1 ? 'disabled' : ''}>パックをひらく</button>`}<button type="button" class="btn" data-r="select">デッキをえらぶ</button><button type="button" class="btn ghost" data-r="close">盤面を見る</button>`;
  r.innerHTML = `<div class="res-in ${local ? (draw ? 'draw' : 'win') : win ? 'win' : draw ? 'draw' : 'lose'}" role="dialog" aria-modal="true">
    <p class="res-turn">${g.turn}ターンで決着</p>
    <h2 class="res-h">${head}</h2>
    <p class="res-sub">${esc(g.reason)}</p>
    <div class="res-score">${score}</div>
    <p class="res-deck">${esc(local ? p0.deckName : me.deckName)} vs ${esc(local ? p1.deckName : op.deckName)}</p>
    ${local ? '' : `<p class="res-reward">パックチケット <b>+${g.reward || 0}</b>（いま ${STORE.tickets}枚）</p>`}
    <div class="res-btns">${btns}</div>
  </div>`;
  r.hidden = false;
  p2pResultButtons();
  r.onclick = e => {
    const b = e.target.closest('[data-r]');
    if (!b || b.disabled) return;
    if (b.dataset.r === 'again2') { p2pAgain(); return; }
    r.hidden = true;
    const k = b.dataset.r;
    if (k === 'again') { if (UI.vs === 'local') startLocal(); else startBattle(); }
    else if (k === 'select') { UI.vsPick = UI.vs; UI.g = null; show('select'); }
    else if (k === 'online') { UI.vsPick = 'online'; UI.g = null; show('select'); }
    else if (k === 'dex') { UI.g = null; show('dex'); }
    else if (k === 'packs') { UI.g = null; show('packs'); }
  };
}

/* ---------- 背景の基板 ---------- */
function drawPCB() {
  const cv = $('#pcb');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = '#0e3a2b';
  x.fillRect(0, 0, w, h);
  let seed = 20250;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const G = 14;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  x.lineCap = 'round'; x.lineJoin = 'round';
  const n = Math.round((w * h) / 7000);
  for (let i = 0; i < n; i++) {
    let px = Math.round((R() * w) / G) * G, py = Math.round((R() * h) / G) * G;
    const sx = px, sy = py;
    let d = Math.floor(R() * 4) * 2;
    x.beginPath(); x.moveTo(px, py);
    const steps = 2 + Math.floor(R() * 5);
    for (let s = 0; s < steps; s++) {
      const len = G * (1 + Math.floor(R() * 5));
      px += dirs[d][0] * len; py += dirs[d][1] * len;
      x.lineTo(px, py);
      d = (d + (R() < 0.5 ? 1 : 7)) % 8;
    }
    x.strokeStyle = 'rgba(52,140,98,0.28)';
    x.lineWidth = R() < 0.2 ? 4 : 1.6;
    x.stroke();
    for (const [qx, qy] of [[sx, sy], [px, py]]) {
      x.beginPath(); x.arc(qx, qy, 3.2, 0, Math.PI * 2); x.fillStyle = 'rgba(217,173,85,0.22)'; x.fill();
      x.beginPath(); x.arc(qx, qy, 1.2, 0, Math.PI * 2); x.fillStyle = 'rgba(4,20,14,0.6)'; x.fill();
    }
  }
  const grd = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = grd;
  x.fillRect(0, 0, w, h);
}
let pcbTimer = null;
window.addEventListener('resize', () => { clearTimeout(pcbTimer); pcbTimer = setTimeout(drawPCB, 150); });

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !$('#handover').hidden) return;
  if (!$('#sheet').hidden) closeSheet();
  else if (!$('#logpanel').hidden) toggleLog(false);
  else if (!$('#menu').hidden) $('#menu').hidden = true;
  else if (UI.mode === 'target') exitTarget();
  else if (PACKFLOW && PACKFLOW.stage === 'done') { PACKFLOW = null; renderPackOverlay(); if (RENDER[UI.screen]) RENDER[UI.screen](); }
});

/* ---------- 起動 ---------- */
function boot(data) {
  data = data || {};
  if (data.deck) Object.assign(UI.deck, data.deck);
  if (data.dexFilter) UI.dexFilter = data.dexFilter;
  injectArtCSS();
  drawPCB();
  const h = location.hash.replace('#', '');
  const start = data.screen && ROUTES.includes(data.screen) ? data.screen : (ROUTES.includes(h) ? h : 'title');
  show(start);
  initCloud();
}
if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
  window.claude.hot.snapshot(() => ({ screen: ROUTES.includes(UI.screen) ? UI.screen : 'select', deck: UI.deck, dexFilter: UI.dexFilter }));
}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot);
else boot((window.claude && window.claude.hot && window.claude.hot.data) || {});
