'use strict';
/* =========================================================
   ★フルアートの絵（40×56 マスのたて長のドット絵。カードの面ぜんたいに敷く）
   - FULL[カードid] = (g, rnd, d) => {...}：1枚ずつ描きおこした一枚絵（ex と人物カード）
   - それ以外のカード：タイプごとの景色（SCENE）の上に、そのカードのふつうの絵を主役として置く
     （星や光の位置は、カードの id から決まる乱数でカードごとに変わる。画面の演出用なので Math.random は使わない）
   - 下の 14 マスくらいには名前・HP の文字が重なるので、暗めにしておく
   - 人物カードは顔を描かず、研究や作品の場面をえがく（CLAUDE.md「生きている人にかかわるカード」）
   ========================================================= */
const FW = 40, FH = 56;

/* 色は PAL の記号か '#rrggbb' */
const fcol = c => (c && c[0] === '#' ? c : PAL[c]);

/* カードの id から決まる乱数（同じカードは、いつも同じ絵になる） */
function fseed(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function frand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- 描く道具 ---------- */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const bay = (x, y) => (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;
/* 上から下へ、色を順に（あいだはディザでまぜる） */
function vgrad(g, cols, y0, y1) {
  y0 = y0 || 0; y1 = y1 === undefined ? g.H - 1 : y1;
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0) * (cols.length - 1);
    const i = Math.min(cols.length - 2, Math.floor(t)), f = t - i;
    for (let x = 0; x < g.W; x++) g.set(x, y, f > bay(x, y) ? cols[i + 1] : cols[i]);
  }
}
/* まるい光（中心ほど濃い。ディザ） */
function halo(g, cx, cy, r, c, k) {
  k = k === undefined ? 1 : k;
  g.each((x, y, px, py) => { const d = Math.hypot(px - cx, py - cy) / r; if (d < 1 && (1 - d) * k > bay(x, y)) g.set(x, y, c); });
}
/* 四角いところに、ある割合で色をまぶす */
function speck(g, x0, y0, w, h, c, p) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (p > bay(x, y)) g.set(x, y, c);
}
function stars(g, rnd, n, cols, y1) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * g.W), y = Math.floor(rnd() * (y1 || g.H)), c = cols[Math.floor(rnd() * cols.length)];
    g.set(x, y, c);
    if (rnd() < 0.12) { g.set(x - 1, y, c); g.set(x + 1, y, c); g.set(x, y - 1, c); g.set(x, y + 1, c); }
  }
}
/* ふつうの絵（24×24・ふちつき）を、scale 倍で置く */
function stamp(g, id, x0, y0, scale) {
  scale = scale || 1;
  const sg = spriteGrid(id);
  sg.each((x, y) => { const c = sg.a[y][x]; if (c) for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) g.set(x0 + x * scale + i, y0 + y * scale + j, c); });
}
/* 2つの点を結ぶたるんだ線（ケーブル） */
function cable(g, x0, y0, x1, y1, sag, c) {
  let px = x0, py = y0;
  for (let i = 1; i <= 24; i++) {
    const t = i / 24, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    g.line(px, py, x, y, c); px = x; py = y;
  }
}
/* 歯車 */
function gear(g, cx, cy, r, n, c, hub) {
  g.disc(cx, cy, r - 1, c);
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.disc(cx + Math.cos(a) * (r - 0.3), cy + Math.sin(a) * (r - 0.3), 1.2, c); }
  g.disc(cx, cy, Math.max(1, r * 0.35), hub || 'k');
}
/* 箱（正面・上面・横面で立体に） */
function box(g, x, y, w, h, face, top, side, d) {
  d = d || 2;
  g.rect(x, y, w, h, face);
  for (let i = 1; i <= d; i++) { g.hl(x + i, y - i, w, top); g.vl(x + w - 1 + i, y - i, h, side); }
}
/* 文字（FONT の3×5）を、影つきで */
function label(g, x, y, t, c, sh) { if (sh) g.text(x + 1, y + 1, t, sh); g.text(x, y, t, c); }

/* ---------- タイプごとの景色 ---------- */
const SCENE = {
  /* アルゴリズム：夜の野原の上に、グラフの星座 */
  algo(g, rnd) {
    vgrad(g, ['#03100a', '#0a2a19', '#124a2a', '#0b2e1b', '#030b07']);
    stars(g, rnd, 34, ['#9be7b0', '#e8fff0', '#52b562'], 34);
    const nodes = Array.from({ length: 7 }, () => [3 + rnd() * 34, 3 + rnd() * 26]);
    nodes.forEach((a, i) => nodes.slice(i + 1).forEach(b => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 15) g.line(a[0], a[1], b[0], b[1], '#1f7a44'); }));
    nodes.forEach(([x, y]) => { g.disc(x, y, 1.6, '#7fe39a'); g.set(x, y, '#e8fff0'); });
    for (let y = 38; y < FH; y += Math.max(2, Math.round((y - 34) / 3))) g.hl(0, y, FW, '#14512c');
    for (let i = -6; i <= 6; i++) g.line(20 + i * 1.5, 36, 20 + i * 9, FH - 1, '#14512c');
  },
  /* データ：青い夜に、データの塔がならぶ */
  data(g, rnd) {
    vgrad(g, ['#020816', '#0b1f45', '#16408a', '#0b1f45', '#020611']);
    stars(g, rnd, 20, ['#7fb0ff', '#dfeaff'], 30);
    for (let x = 0; x < FW;) {
      const w = 4 + Math.floor(rnd() * 3), h = 10 + Math.floor(rnd() * 16), top = 44 - h;
      for (let y = top; y < 44; y += 3) { g.ell(x + w / 2, y + 1, w / 2, 1.2, '#1d4a94'); g.hl(x + 1, y + 1, w - 2, '#4c88ea'); }
      g.hl(x + 1, top, w - 2, '#a3c8ff');
      x += w + 1;
    }
    for (let i = 0; i < 9; i++) g.text(Math.floor(rnd() * 37), Math.floor(rnd() * 26), rnd() < 0.5 ? '0' : '1', '#2c56aa');
  },
  /* ネットワーク：夕ぐれの街を、光の線がつなぐ */
  net(g, rnd) {
    vgrad(g, ['#140a26', '#3b1f4a', '#7a3b3b', '#c06a2a', '#3a1d0a', '#0c0603']);
    stars(g, rnd, 16, ['#ffe9b0', '#fff7df'], 18);
    const tops = [];
    for (let x = 0; x < FW;) {
      const w = 3 + Math.floor(rnd() * 4), h = 6 + Math.floor(rnd() * 14), top = 42 - h;
      g.rect(x, top, w, h + 14, '#140a14');
      for (let y = top + 2; y < 42; y += 3) for (let i = x + 1; i < x + w - 1; i += 2) if (rnd() < 0.45) g.set(i, y, '#f7d14a');
      if (rnd() < 0.5) { g.vl(x + 1, top - 3, 3, '#140a14'); g.set(x + 1, top - 4, '#e2493b'); }
      tops.push([x + w / 2, top]);
      x += w + 1;
    }
    for (let i = 0; i + 2 < tops.length; i += 1 + Math.floor(rnd() * 2)) {
      const a = tops[i], b = tops[i + 2];
      cable(g, a[0], a[1] - 1, b[0], b[1] - 1, -6, '#f7d14a');
      const t = rnd(); g.disc(a[0] + (b[0] - a[0]) * t, Math.min(a[1], b[1]) - 4, 0.9, '#fff3b0');
    }
  },
  /* セキュリティ：金庫のとびら */
  sec(g, rnd) {
    vgrad(g, ['#0c0205', '#2a050b', '#4a0c14', '#2a050b', '#080103']);
    g.disc(20, 22, 18, '#3a0a10'); g.ring(20, 22, 18, 2, '#7a1a1f'); g.ring(20, 22, 13.5, 1, '#a52a2a'); g.ring(20, 22, 9, 1, '#7a1a1f');
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.rect(20 + Math.cos(a) * 16 - 0.5, 22 + Math.sin(a) * 16 - 0.5, 2, 2, '#d9a0a0'); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; g.line(20 + Math.cos(a) * 4, 22 + Math.sin(a) * 4, 20 + Math.cos(a) * 12, 22 + Math.sin(a) * 12, '#5c1018'); }
    for (let y = 0; y < FH; y += 3) for (let x = 0; x < FW; x++) if (bay(x, y) < 0.3) g.set(x, y, '#14030a');
    stars(g, rnd, 10, ['#ff8a80'], 50);
  },
  /* ハードウェア：基板の大地 */
  hw(g, rnd) {
    vgrad(g, ['#120803', '#2a1306', '#3a1a08', '#1c0c04', '#080301']);
    for (let i = 0; i < 18; i++) {
      let x = Math.floor(rnd() * FW), y = Math.floor(rnd() * FH);
      const c = rnd() < 0.7 ? '#7a3a12' : '#cf6420';
      for (let k = 0; k < 4; k++) {
        const len = 3 + Math.floor(rnd() * 9);
        if (k % 2) { g.vl(x, y, len, c); y += len; } else { g.hl(x, y, len, c); x += len; }
      }
      g.rect(x - 1, y - 1, 2, 2, '#f7d14a');
    }
    g.rect(9, 11, 22, 22, '#2a1a0c'); g.rect(10, 12, 20, 20, '#3d2610');
    for (let i = 11; i < 31; i += 2) { g.set(i, 10, '#c79427'); g.set(i, 33, '#c79427'); g.set(8, i + 1, '#c79427'); g.set(31, i + 1, '#c79427'); }
  },
  /* AI：紫の星雲に、ニューロンの層 */
  ai(g, rnd) {
    vgrad(g, ['#07020f', '#1f0c3a', '#3a1a66', '#1f0c3a', '#06020c']);
    halo(g, 10, 14, 14, '#4b2380', 0.8); halo(g, 32, 30, 12, '#4b2380', 0.7);
    stars(g, rnd, 26, ['#d2adf6', '#ffffff', '#9d62da'], 40);
    const layers = [6, 20, 34].map(x => Array.from({ length: 4 }, (_, i) => [x, 6 + i * 9 + rnd() * 3]));
    for (let l = 0; l < 2; l++) layers[l].forEach(a => layers[l + 1].forEach(b => { if (rnd() < 0.6) g.line(a[0], a[1], b[0], b[1], '#3f1f6e'); }));
    layers.flat().forEach(([x, y]) => { g.disc(x, y, 1.5, '#9d62da'); g.set(x, y, '#f1e2ff'); });
  },
  /* 無色：0と1の雨と、スポットライト */
  none(g, rnd) {
    vgrad(g, ['#0a0908', '#1e1c18', '#2c2924', '#1a1815', '#080706']);
    for (let x = 1; x < FW; x += 4) {
      const y0 = Math.floor(rnd() * 30) - 6, n = 3 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) g.text(x, y0 + i * 6, rnd() < 0.5 ? '0' : '1', i === n - 1 ? '#cfc8ba' : i > n - 3 ? '#8f887c' : '#514a42');
    }
  },
  /* コマンド（ゴッドパックで出たとき）：光のすじ */
  cmd(g, rnd, d) {
    vgrad(g, ['#0a0d10', '#1a2228', '#26323a', '#141a1f', '#060809']);
    const c = KIND[d.kind] ? KIND[d.kind].c : '#4f6b7a';
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + rnd() * 0.2; g.line(20, 24, 20 + Math.cos(a) * 40, 24 + Math.sin(a) * 40, c); }
  },
};
/* 主役のうしろの光（タイプの色） */
const HALO = { algo: '#9fe0b4', data: '#9fbff2', net: '#f2d68a', sec: '#f0a8a2', hw: '#f2bb8a', ai: '#cfb3f2', none: '#d8d1c2' };
/* ふつうのカード：景色 → 主役のうしろの光 → 主役（ふつうの絵） */
function defaultFull(g, rnd, d, id) {
  (SCENE[d.kind === 'mon' ? d.type : 'cmd'] || SCENE.cmd)(g, rnd, d);
  halo(g, 20, 24, 14, HALO[d.kind === 'mon' ? d.type : 'none'], 0.4);
  g.ell(20, 37, 10, 2, '#000000');
  stamp(g, id, 8, 12, 1);
}

/* ---------- 1枚ずつ描きおこした絵（ex と人物カード） ---------- */
const FULL = {};

/* ===== アルゴリズム ===== */
/* クイックソート：光る「ピボット」を中心に、小さい棒は左へ、大きい棒は右へ */
FULL.quick = (g, rnd) => {
  vgrad(g, ['#02100a', '#0a2a19', '#0f3a22', '#06180e', '#020805']);
  stars(g, rnd, 22, ['#9be7b0', '#e8fff0'], 18);
  const hs = [5, 8, 3, 11, 7, 10, 30, 21, 26, 17, 28, 19, 24], base = 42;
  halo(g, 20, base - 16, 13, '#5a5212', 0.8);
  hs.forEach((h, i) => {
    const x = 1 + i * 3, piv = i === 6;
    g.rect(x, base - h, 2, h, piv ? '#f7d14a' : i < 6 ? '#52b562' : '#2b7a40');
    g.vl(x, base - h, h, piv ? '#fff3b0' : i < 6 ? '#a8de7c' : '#52b562');
    if (!piv) for (let k = 1; k < 4; k++) g.set(i < 6 ? x + 2 + k : x - 1 - k, base - h + 2 + k * 2, i < 6 ? '#1f5a35' : '#123d24'); // 動きのすじ
  });
  g.hl(0, base, FW, '#52b562'); g.hl(0, base + 1, FW, '#1f5a35');
  label(g, 11, 4, 'PIVOT', '#fff3b0', '#3a3208');
  g.line(20, 10, 20, 11, '#fff3b0');
  label(g, 4, 20, '<', '#a8de7c'); label(g, 33, 6, '>', '#52b562');
};
/* ダイクストラ法：夜の街の地図で、いちばん近い道が金色に光る */
FULL.dijkstra = g => {
  vgrad(g, ['#03140c', '#082a1a', '#0b3522', '#06180f', '#020805']);
  for (let x = 2; x < FW; x += 6) g.vl(x, 0, 46, '#0b3320');
  for (let y = 3; y < 46; y += 6) g.hl(0, y, FW, '#0b3320');
  const N = [[5, 6], [17, 4], [32, 8], [9, 19], [24, 16], [35, 25], [5, 33], [19, 30], [32, 39]];
  const E = [[0, 1, 4], [1, 2, 7], [0, 3, 3], [1, 4, 2], [2, 5, 5], [3, 4, 6], [4, 5, 3], [3, 6, 4], [4, 7, 2], [6, 7, 5], [7, 8, 3], [5, 8, 6]];
  const path = [0, 1, 4, 7, 8];
  E.forEach(([a, b]) => g.line(N[a][0], N[a][1], N[b][0], N[b][1], '#1f6b44'));
  for (let i = 0; i + 1 < path.length; i++) { const a = N[path[i]], b = N[path[i + 1]]; halo(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 6, '#3d3a10', 0.6); }
  for (let i = 0; i + 1 < path.length; i++) { const a = N[path[i]], b = N[path[i + 1]]; g.thick(a[0], a[1], b[0], b[1], '#f7d14a', 2); }
  E.filter(([a, b]) => !(path.includes(a) && path.includes(b))).forEach(([a, b, w]) => g.text(Math.round((N[a][0] + N[b][0]) / 2) - 1, Math.round((N[a][1] + N[b][1]) / 2) - 2, String(w), '#3f8a5c'));
  N.forEach(([x, y], i) => { const on = path.includes(i); g.disc(x, y, 2.3, on ? '#c79427' : '#2f8a4f'); g.disc(x, y, 1.3, on ? '#fff3b0' : '#7fe39a'); });
  const [sx, sy] = N[0]; g.vl(sx - 1, sy - 6, 5, '#e8fff0'); g.rect(sx, sy - 6, 3, 2, '#52b562'); // スタートの旗
  const [tx, ty] = N[8]; g.dia(tx, ty - 5, 2.5, '#e2493b'); g.set(tx, ty - 5, '#fff3b0'); // ゴール
};
/* A*探索：迷路で、ゴールに向かって探したところが青く、見つけた道が金色に */
FULL.astar = g => {
  vgrad(g, ['#03120b', '#071f14', '#03100a']);
  const C = 12, R = 12, ox = 2, oy = 2, rnd = frand(7);
  const open = Array.from({ length: R }, () => Array.from({ length: C }, () => [false, false])); // [右, 下] がひらいているか
  const seen = Array.from({ length: R }, () => new Array(C).fill(false)), st = [[0, 0]];
  seen[0][0] = true;
  while (st.length) {
    const [cx, cy] = st[st.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy, dx, dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < C && y < R && !seen[y][x]);
    if (!nb.length) { st.pop(); continue; }
    const [nx, ny, dx, dy] = nb[Math.floor(rnd() * nb.length)];
    if (dx === 1) open[cy][cx][0] = true; if (dx === -1) open[ny][nx][0] = true; if (dy === 1) open[cy][cx][1] = true; if (dy === -1) open[ny][nx][1] = true;
    seen[ny][nx] = true; st.push([nx, ny]);
  }
  const dist = Array.from({ length: R }, () => new Array(C).fill(-1)), par = {}, q = [[0, 0]];
  dist[0][0] = 0;
  while (q.length) {
    const [x, y] = q.shift();
    const mv = [];
    if (open[y][x][0]) mv.push([x + 1, y]); if (x > 0 && open[y][x - 1][0]) mv.push([x - 1, y]);
    if (open[y][x][1]) mv.push([x, y + 1]); if (y > 0 && open[y - 1][x][1]) mv.push([x, y - 1]);
    for (const [nx, ny] of mv) if (dist[ny][nx] < 0) { dist[ny][nx] = dist[y][x] + 1; par[nx + ',' + ny] = [x, y]; q.push([nx, ny]); }
  }
  const goal = [C - 1, R - 1], gd = dist[goal[1]][goal[0]];
  g.rect(ox, oy, C * 3 + 1, R * 3 + 1, '#0a1a12');
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
    const d = dist[y][x], h = Math.abs(goal[0] - x) + Math.abs(goal[1] - y);
    const explored = d + h <= gd + 6;
    const c = explored ? (d / gd < 0.5 ? '#2c56aa' : '#23889a') : '#123a26';
    g.rect(ox + 1 + x * 3, oy + 1 + y * 3, 2, 2, c);
    if (open[y][x][0]) g.rect(ox + 3 + x * 3, oy + 1 + y * 3, 1, 2, c);
    if (open[y][x][1]) g.rect(ox + 1 + x * 3, oy + 3 + y * 3, 2, 1, c);
  }
  let cur = goal;
  while (cur) {
    const [x, y] = cur, p = par[x + ',' + y];
    g.rect(ox + 1 + x * 3, oy + 1 + y * 3, 2, 2, '#f7d14a');
    if (p) g.line(ox + 1.5 + x * 3, oy + 1.5 + y * 3, ox + 1.5 + p[0] * 3, oy + 1.5 + p[1] * 3, '#f7d14a');
    cur = p;
  }
  g.dia(ox + 2 + goal[0] * 3, oy + 2 + goal[1] * 3, 3, '#fff3b0'); g.dia(ox + 2 + goal[0] * 3, oy + 2 + goal[1] * 3, 1.6, '#f28a2c');
  g.disc(ox + 2, oy + 2, 1.6, '#52b562');
};
/* ノートG：ベルヌーイ数の表と、羽根ペンと、解析機関の歯車 */
FULL.noteg = (g, rnd) => {
  vgrad(g, ['#1a0f08', '#2e1a0c', '#3d2410', '#1f1208', '#0a0603']);
  gear(g, 8, 40, 7, 11, '#8a6418', '#3a2a0a'); gear(g, 19, 45, 5, 9, '#c79427', '#5a4210'); gear(g, 31, 41, 6, 10, '#7a5a14', '#3a2a0a');
  g.rect(5, 5, 30, 30, '#1a1208');
  g.rect(4, 4, 30, 30, '#efe2bf'); g.rect(4, 4, 30, 5, '#d9c48f');
  for (let y = 13; y < 34; y += 4) g.hl(4, y, 30, '#c9b48a');
  [11, 19, 27].forEach(x => g.vl(x, 9, 25, '#c9b48a'));
  label(g, 6, 5, 'B7', '#9e2e25');
  label(g, 16, 5, 'V', '#514a42'); label(g, 26, 5, 'N', '#514a42');
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) if (rnd() < 0.8) g.text(6 + c * 8, 10 + r * 4, String(Math.floor(rnd() * 10)), '#5a4a30');
  g.thick(36, 1, 25, 30, '#fcf9f1', 2);
  for (let i = 0; i < 9; i++) { const t = i / 9, x = 36 - 11 * t, y = 1 + 29 * t; if (i < 7) { g.line(x, y, x + 3, y + 1, '#cfc8ba'); g.line(x - 1, y + 1, x - 3, y - 1, '#cfc8ba'); } }
  g.line(25, 30, 24, 33, '#26221c');
};

/* ===== データ ===== */
/* ハッシュテーブル：キーが「#」を通って、それぞれのバケツへ */
FULL.hash = g => {
  vgrad(g, ['#020816', '#0b1f45', '#123672', '#0b1f45', '#020611']);
  for (let i = 0; i < 8; i++) {
    const y = 3 + i * 5;
    g.rect(28, y, 10, 4, '#0d2552'); g.hl(28, y, 10, '#4c88ea'); g.vl(28, y, 4, '#4c88ea'); g.vl(37, y, 4, '#4c88ea');
    g.text(24, y, String(i), '#7fb0ff');
  }
  const keys = [[3, 6, '#e2493b', 1], [3, 15, '#52b562', 4], [3, 24, '#f28a2c', 6], [3, 33, '#d2adf6', 4]];
  halo(g, 15, 20, 9, '#3a5a9a', 0.7);
  keys.forEach(([x, y, c, b]) => {
    g.line(x + 6, y + 2, 13, 20, c);
    g.line(17, 20, 28, 3 + b * 5 + 2, c);
    g.rect(x, y, 6, 4, c); g.set(x + 1, y + 1, '#020816'); g.hl(x + 3, y + 1, 2, '#fcf9f1'); g.hl(x + 3, y + 2, 2, '#fcf9f1');
    g.rect(31 + (b === 4 && c === '#d2adf6' ? 4 : 0), 3 + b * 5 + 1, 3, 2, c);
  });
  g.line(34, 24, 35, 24, '#fcf9f1'); // 同じバケツにつながる（チェイン）
  g.thick(13, 14, 12, 26, '#f7d14a', 2); g.thick(18, 14, 17, 26, '#f7d14a', 2); g.thick(9, 17, 21, 17, '#f7d14a', 2); g.thick(9, 22, 21, 22, '#f7d14a', 2);
};
/* リレーショナルDB：大きなデータベースの前で、表と表がキーでつながる */
FULL.rdb = (g, rnd) => {
  vgrad(g, ['#020816', '#0b1f45', '#16408a', '#0b1f45', '#020611']);
  stars(g, rnd, 14, ['#7fb0ff'], 20);
  g.rect(5, 6, 30, 24, '#123a7a'); g.ell(20, 6, 15, 3.5, '#2c5fae'); g.ell(20, 6, 12, 2, '#4c88ea');
  [14, 22].forEach(y => { for (let x = 5; x < 35; x++) g.set(x, Math.round(y + Math.sin((x - 5) / 30 * Math.PI) * 3), '#2c5fae'); });
  for (let x = 5; x < 35; x++) g.set(x, Math.round(30 + Math.sin((x - 5) / 30 * Math.PI) * 3), '#0b1f45');
  const table = (x, y, w, rows, head) => {
    g.rect(x + 1, y + 1, w, 4 + rows * 3, '#020611');
    g.rect(x, y, w, 4 + rows * 3, '#fcf9f1'); g.rect(x, y, w, 4, head);
    for (let r = 0; r < rows; r++) { g.hl(x, y + 4 + r * 3 + 2, w, '#cfe0ff'); g.hl(x + 1, y + 5 + r * 3, 3, '#514a42'); g.hl(x + 6, y + 5 + r * 3, w - 8, '#8f887c'); }
    g.vl(x + 5, y + 4, rows * 3, '#a3c8ff');
  };
  table(2, 22, 15, 5, '#4c88ea'); table(23, 18, 15, 6, '#52b562');
  g.thick(17, 26, 23, 23, '#f7d14a', 1); g.line(17, 32, 23, 29, '#f7d14a'); g.disc(17, 26, 1, '#f7d14a'); g.disc(23, 23, 1, '#f7d14a');
};

/* ===== ネットワーク ===== */
/* クラウド：大きな雲と、その下でデータを上げ下げするサーバー */
FULL.cloud = (g, rnd) => {
  vgrad(g, ['#0a2550', '#2c5fae', '#6aa0e8', '#a3c8ff', '#2c4f86', '#0a1830']);
  [[11, 14, 6], [20, 10, 8.5], [29, 14, 6.5], [15, 17, 5], [25, 17, 5.5]].forEach(([x, y, r]) => g.disc(x, y + 1.5, r, '#9fb0c8'));
  [[11, 14, 6], [20, 10, 8.5], [29, 14, 6.5], [15, 17, 5], [25, 17, 5.5]].forEach(([x, y, r]) => g.disc(x, y, r, '#fcf9f1'));
  [[17, 5], [22, 4], [10, 10]].forEach(([x, y]) => g.hl(x, y, 3, '#ffffff'));
  [4, 13, 22, 31].forEach((x, i) => {
    g.rect(x, 31, 7, 11, '#2a2620'); for (let y = 33; y < 41; y += 2) { g.hl(x + 1, y, 5, '#514a42'); g.set(x + 5, y, (i + y) % 3 ? '#52b562' : '#f7d14a'); }
    for (let y = 24; y < 30; y += 2) g.set(x + 2, y, '#4cc6d8');
    for (let y = 25; y < 30; y += 2) g.set(x + 4, y, '#c8f0ff');
    g.set(x + 1, 25, '#4cc6d8'); g.set(x + 3, 25, '#4cc6d8'); // 上へ
    g.set(x + 3, 29, '#c8f0ff'); g.set(x + 5, 29, '#c8f0ff'); // 下へ
  });
  g.hl(0, 42, FW, '#1a1612');
  stars(g, rnd, 8, ['#ffffff'], 6);
};
/* CDN：地球のまわりに、近くでデータを配るサーバーがならぶ */
FULL.cdn = (g, rnd) => {
  vgrad(g, ['#03050c', '#0a1428', '#0f1f3c', '#08101f', '#020408']);
  stars(g, rnd, 40, ['#dfeaff', '#7fb0ff', '#ffffff'], 50);
  const cx = 20, cy = 22, R = 12;
  g.each((x, y, px, py) => {
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d > R) return;
    const land = Math.sin(px * 0.55) + Math.cos(py * 0.45) + Math.sin((px + py) * 0.3) > 0.9;
    let c = land ? '#52b562' : '#2c56aa';
    if (dx + dy > 6 && bay(x, y) < (dx + dy - 6) / 14) c = land ? '#2b7a40' : '#1a3a7a';
    if (dx + dy < -9 && bay(x, y) < 0.3) c = land ? '#a8de7c' : '#4c88ea';
    g.set(x, y, c);
  });
  for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2, x = cx + Math.cos(a) * 18, y = cy + Math.sin(a) * 7; if (i % 2 && (Math.sin(a) < 0 || Math.hypot(x - cx, y - cy) > R)) g.set(x, y, '#c79427'); }
  [0.3, 1.2, 2.2, 3.0, 4.1, 5.2].forEach((a, i) => {
    const x = cx + Math.cos(a) * 18, y = cy + Math.sin(a) * 7;
    if (Math.sin(a) > 0 || i % 2) { g.line(x, y, cx + Math.cos(a) * 8, cy + Math.sin(a) * 5, '#f7d14a'); }
    g.rect(x - 1.5, y - 1.5, 3, 3, '#f7d14a'); g.set(x - 0.5, y - 0.5, '#fff3b0');
  });
};

/* ===== セキュリティ ===== */
/* 公開鍵暗号：金の錠前と、2本の鍵（公開鍵と秘密鍵） */
FULL.pubkey = (g, rnd) => {
  vgrad(g, ['#0c0205', '#2a050b', '#4a0c14', '#2a050b', '#080103']);
  halo(g, 20, 20, 16, '#6a2418', 0.8);
  stars(g, rnd, 12, ['#ff8a80', '#ffd0c8'], 44);
  g.arc(20, 15, 8, 2.5, '#bcc6cb', 180, 360); g.vl(12, 15, 3, '#bcc6cb'); g.vl(13, 15, 3, '#bcc6cb'); g.vl(26, 15, 3, '#bcc6cb'); g.vl(27, 15, 3, '#bcc6cb');
  g.arc(20, 15, 7, 1, '#ffffff', 200, 250);
  g.rect(10, 17, 20, 15, '#c79427'); g.rect(10, 17, 20, 2, '#f7d14a'); g.vl(10, 17, 15, '#f7d14a'); g.hl(10, 31, 20, '#7a5a14');
  g.disc(20, 23, 2.2, '#3a2a0a'); g.rect(19, 23, 2, 5, '#3a2a0a');
  // 横向きの鍵（輪・軸・歯）
  const key = (x, y, dir, c, hi) => {
    g.ring(x, y, 3.4, 1.4, c); g.set(x - 1, y - 2, hi);
    const x1 = x + dir * 3, x2 = x + dir * 15;
    g.rect(Math.min(x1, x2), y - 1, 13, 2, c); g.hl(Math.min(x1, x2), y - 1, 13, hi);
    g.rect(x + dir * 11 - (dir < 0 ? 1 : 0), y + 1, 2, 3, c); g.rect(x + dir * 14 - (dir < 0 ? 1 : 0), y + 1, 2, 2, c);
  };
  key(5, 36, 1, '#f7d14a', '#fff3b0'); key(35, 41, -1, '#bcc6cb', '#ffffff');
  label(g, 15, 3, 'RSA', '#ffd76a', '#3a0a10');
};
/* ランサムウェア：赤い画面に鍵のマーク、鎖でしばられたファイル */
FULL.ransom = (g, rnd) => {
  vgrad(g, ['#0a0204', '#1c0508', '#2a070c', '#120305', '#050102']);
  g.rect(3, 3, 34, 24, '#2a2620'); g.rect(5, 5, 30, 19, '#9e2e25');
  for (let y = 5; y < 24; y += 2) g.hl(5, y, 30, '#7a1a1f');
  halo(g, 20, 12, 9, '#e2493b', 0.6);
  g.arc(20, 11, 3.5, 1.2, '#fcf9f1', 180, 360); g.vl(16, 11, 2, '#fcf9f1'); g.vl(24, 11, 2, '#fcf9f1');
  g.rect(15, 12, 11, 7, '#fcf9f1'); g.rect(20, 14, 1, 3, '#9e2e25');
  label(g, 9, 20 - 1, 'LOCKED', '#fcf9f1');
  g.rect(17, 27, 6, 3, '#2a2620'); g.rect(13, 30, 14, 1, '#2a2620');
  [[4, 32], [15, 31], [26, 32]].forEach(([x, y]) => {
    g.rect(x, y, 10, 10, '#efe2bf'); g.rect(x + 7, y, 3, 3, '#c9b48a');
    for (let k = 0; k < 3; k++) g.hl(x + 1, y + 4 + k * 2, 6, '#8f887c');
    for (let k = -1; k < 11; k += 2) { g.set(x + k, y + k, '#bcc6cb'); g.set(x + k + 1, y + k, '#77848c'); g.set(x + 10 - k, y + k, '#bcc6cb'); }
  });
  for (let x = -8; x < FW; x += 6) for (let i = 0; i < 3; i++) g.line(x + i, 47, x + i + 4, 43, '#f7d14a');
  g.hl(0, 43, FW, '#26221c'); g.hl(0, 47, FW, '#26221c');
};

/* ===== ハードウェア ===== */
/* GPU：たくさんの小さなコアが光るなかに、ファンが2つのグラフィックボード */
FULL.gpu = (g, rnd) => {
  vgrad(g, ['#05060a', '#0c0e16', '#05060a']);
  for (let y = 1; y < 46; y += 3) for (let x = 1; x < FW; x += 3) {
    const r = rnd();
    g.rect(x, y, 2, 2, r < 0.12 ? '#f28a2c' : r < 0.22 ? '#4cc6d8' : r < 0.6 ? '#2a1a10' : '#101a26');
  }
  [[6, 4, 14, 9, 22, 3], [24, 6, 34, 2, 30, 11]].forEach(([a, b, c, d, e, f]) => { g.line(a, b, c, d, '#4cc6d8'); g.line(c, d, e, f, '#4cc6d8'); g.line(e, f, a, b, '#4cc6d8'); });
  g.rect(2, 17, 36, 18, '#26221c'); g.rect(2, 17, 36, 2, '#514a42'); g.rect(3, 19, 34, 14, '#3a3530');
  [11, 29].forEach(x => {
    g.disc(x, 26, 6.5, '#1a1612'); g.ring(x, 26, 6.5, 1, '#cf6420');
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.line(x + Math.cos(a) * 1.5, 26 + Math.sin(a) * 1.5, x + Math.cos(a + 0.6) * 5.5, 26 + Math.sin(a + 0.6) * 5.5, '#8f887c'); }
    g.disc(x, 26, 1.6, '#cf6420');
  });
  for (let x = 6; x < 32; x += 2) g.rect(x, 35, 1, 3, '#f7d14a');
  g.hl(5, 35, 28, '#2b7a40');
};
/* 量子コンピュータ：金色のシャンデリアのような冷凍機と、光る量子ビット */
FULL.quantum = (g, rnd) => {
  vgrad(g, ['#02040a', '#060c1c', '#0a1630', '#060c1c', '#020408']);
  stars(g, rnd, 14, ['#c8f0ff'], 40);
  halo(g, 20, 38, 11, '#1a5a7a', 0.9);
  const tiers = [[2, 30], [10, 24], [18, 18], [25, 12], [31, 8]];
  for (let i = 0; i + 1 < tiers.length; i++) {
    const [y, w] = tiers[i], [y2, w2] = tiers[i + 1];
    [-w2 / 2 + 1, 0, w2 / 2 - 1].forEach(o => { g.vl(20 + o, y + 2, y2 - y - 2, '#bcc6cb'); });
    for (let k = y + 3; k < y2; k += 2) { g.set(20 - w2 / 2 + 3, k, '#cf6420'); g.set(20 - w2 / 2 + 4, k + 1, '#cf6420'); g.set(20 + w2 / 2 - 4, k, '#cf6420'); g.set(20 + w2 / 2 - 5, k + 1, '#cf6420'); }
  }
  tiers.forEach(([y, w]) => { g.rect(20 - w / 2, y, w, 2, '#c79427'); g.hl(20 - w / 2, y, w, '#f7d14a'); g.hl(20 - w / 2, y + 2, w, '#5a4210'); });
  g.vl(20, 0, 2, '#bcc6cb');
  const bx = 20, by = 39;
  g.ring(bx, by, 5, 1, '#4cc6d8'); g.ell(bx, by, 5, 1.6, '#23889a'); g.ell(bx, by, 4, 0.8, '#0a1630');
  g.vl(bx, by - 7, 14, '#23889a'); g.line(bx, by, bx + 3, by - 4, '#fcf9f1'); g.disc(bx + 3, by - 4, 1, '#c8f0ff');
};
/* ENIAC：部屋いっぱいのパネルと、色とりどりのケーブル */
FULL.eniac = (g, rnd) => {
  vgrad(g, ['#0c0b09', '#1a1815', '#24211c', '#14120f', '#080706']);
  for (let y = 38; y < FH; y += 3) for (let x = (y % 6 ? 0 : 3); x < FW; x += 6) g.rect(x, y, 3, 3, '#1e1c18');
  [[1, 6, 12], [14, 4, 12], [27, 6, 12]].forEach(([x, y, w]) => {
    g.rect(x, y, w, 30, '#26221c'); g.rect(x, y, w, 2, '#514a42');
    for (let j = y + 4; j < y + 16; j += 2) for (let i = x + 1; i < x + w - 1; i += 2) g.set(i, j, '#8f887c');
    for (let j = y + 18; j < y + 28; j += 3) for (let i = x + 1; i < x + w - 1; i += 2) g.set(i, j, rnd() < 0.45 ? '#f28a2c' : rnd() < 0.3 ? '#fcf9f1' : '#3a352e');
  });
  [['#e2493b', 6, 12, 18, 14, 6], ['#f7d14a', 10, 16, 31, 12, 8], ['#4c88ea', 18, 20, 33, 22, 5], ['#52b562', 4, 24, 20, 26, 7], ['#fcf9f1', 24, 14, 37, 18, 4]].forEach(([c, x0, y0, x1, y1, sag]) => cable(g, x0, y0, x1, y1, sag, c));
  label(g, 10, 0, 'ENIAC', '#f28a2c', '#26221c');
};
/* ハーバード・マークI：ガラスの中に、スイッチと数字の輪がならぶ長い機械 */
FULL.mark1 = (g, rnd) => {
  vgrad(g, ['#0a0c0e', '#161a1e', '#22282c', '#12161a', '#06080a']);
  g.rect(0, 6, FW, 28, '#bcc6cb'); g.hl(0, 6, FW, '#e4ecef'); g.hl(0, 33, FW, '#77848c');
  [1, 11, 21, 31].forEach(x => {
    g.rect(x, 9, 8, 21, '#141a1e');
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { g.disc(x + 1.5 + i * 2.5, 12 + j * 3, 1.1, '#cfc8ba'); g.set(x + 1 + i * 2.5, 12 + j * 3, '#26221c'); }
    for (let j = 21; j < 29; j += 2) for (let i = x + 1; i < x + 7; i += 2) g.set(i, j, rnd() < 0.5 ? '#f28a2c' : '#514a42');
  });
  g.rect(0, 35, FW, 2, '#77848c'); for (let x = 2; x < FW; x += 4) g.set(x, 35, '#cfc8ba');
  gear(g, 34, 39, 3.5, 8, '#8f887c', '#26221c');
  g.disc(5, 41, 4, '#fcf9f1'); g.disc(5, 41, 1.5, '#8f887c');
  for (let x = 8; x < 30; x++) { g.set(x, 39, '#fcf9f1'); g.set(x, 40, '#fcf9f1'); if (x % 2 && rnd() < 0.5) g.set(x, 39 + (x % 4 ? 0 : 1), '#26221c'); }
};

/* ===== AI ===== */
/* 大規模言語モデル：下からのぼってくる言葉（トークン）が、大きなふきだしの文章になる。次の1語が光る */
FULL.llm = (g, rnd) => {
  vgrad(g, ['#07020f', '#1f0c3a', '#3a1a66', '#1f0c3a', '#06020c']);
  stars(g, rnd, 18, ['#d2adf6', '#ffffff'], 44);
  g.rect(4, 3, 32, 19, '#fcf9f1'); g.hl(5, 2, 30, '#fcf9f1'); g.hl(5, 22, 30, '#fcf9f1');
  g.line(10, 23, 8, 27, '#fcf9f1'); g.line(11, 23, 9, 27, '#fcf9f1'); g.line(12, 23, 9, 27, '#fcf9f1');
  const lines = [[6, 9, 6], [6, 5, 8, 7], [6, 10, 7], [6, 6, 4]];
  lines.forEach((ws, r) => { let x = 7; ws.forEach((w, i) => { g.rect(x, 6 + r * 4, w, 2, i % 2 ? '#9d62da' : '#64399d'); x += w + 2; }); });
  g.rect(21, 18, 7, 2, '#f7d14a'); g.rect(29, 17, 1, 4, '#26221c');
  halo(g, 24, 19, 5, '#f7d14a', 0.35);
  for (let i = 0; i < 16; i++) {
    const x = 3 + Math.floor(rnd() * 32), y = 26 + Math.floor(rnd() * 16), w = 2 + Math.floor(rnd() * 4), c = ['#9d62da', '#d2adf6', '#4cc6d8', '#c8f0ff'][i % 4];
    g.rect(x, y, w, 2, c); g.vl(x + Math.floor(w / 2), y + 3, 2, '#3a1a66');
  }
};
/* 拡散モデル：ノイズ（ざらざら）から、だんだん絵が見えてくる */
FULL.diffusion = (g, rnd) => {
  vgrad(g, ['#2c56aa', '#6aa0e8', '#f6d0a8', '#f28a2c'], 0, 30);
  g.disc(29, 12, 5, '#fff3b0'); g.disc(29, 12, 3.5, '#f7d14a');
  for (let x = 0; x < FW; x++) {
    const h1 = 22 + Math.round(Math.sin(x * 0.25) * 4 + Math.sin(x * 0.6) * 1.5), h2 = 28 + Math.round(Math.sin(x * 0.18 + 2) * 3);
    g.vl(x, h1, 40, '#64399d'); g.vl(x, h2, 40, '#2b7a40');
    if (x % 2 === 0) g.set(x, h1, '#9d62da');
  }
  vgrad(g, ['#2b7a40', '#1f5a35', '#123d24'], 34, 55);
  g.vl(12, 26, 12, '#52b562'); g.line(12, 31, 15, 29, '#52b562'); g.line(12, 33, 9, 31, '#52b562');
  [[0, -2.5], [2.5, 0], [0, 2.5], [-2.5, 0], [1.8, -1.8], [-1.8, -1.8], [1.8, 1.8], [-1.8, 1.8]].forEach(([dx, dy]) => g.disc(12 + dx, 24 + dy, 1.4, '#f6a497'));
  g.disc(12, 24, 1.3, '#f7d14a');
  // 左上ほどノイズが多い（右下はすっかり絵になっている）
  const NC = ['#e2493b', '#52b562', '#4c88ea', '#f7d14a', '#fcf9f1', '#26221c', '#9d62da', '#4cc6d8'];
  g.each((x, y) => { const p = 0.82 - (x / FW) * 0.8 - (y / FH) * 0.45; if (rnd() < p) g.set(x, y, NC[Math.floor(rnd() * NC.length)]); });
};

/* ===== 無色 ===== */
/* チューリングマシン：どこまでも続くテープと、読み書きするヘッド */
FULL.turing = (g, rnd) => {
  vgrad(g, ['#0a0908', '#1e1c18', '#2c2924', '#1a1815', '#080706']);
  gear(g, 6, 8, 6, 10, '#2c2924', '#1e1c18'); gear(g, 34, 40, 7, 11, '#2c2924', '#1e1c18');
  const bits = '0110100111010';
  for (let i = 0; i < 9; i++) {
    const x = -2 + i * 5;
    g.rect(x, 22, 5, 9, '#efe2bf'); g.vl(x, 22, 9, '#7d7564'); g.hl(x, 22, 5, '#7d7564'); g.hl(x, 30, 5, '#7d7564');
    g.text(x + 1, 24, bits[i], i === 4 ? '#c0392b' : '#26221c');
  }
  halo(g, 20, 26, 7, '#efe2bf', 0.3);
  g.rect(13, 6, 14, 10, '#2c5fae'); g.hl(13, 6, 14, '#4c88ea'); g.hl(13, 15, 14, '#163a7a');
  label(g, 16, 8, 'S1', '#fcf9f1'); // 状態（ステート）
  for (let i = 0; i < 4; i++) g.hl(20 - 3 + i, 16 + i, 7 - i * 2, '#4c88ea');
  label(g, 2, 34, '<', '#8f887c'); label(g, 35, 34, '>', '#8f887c');
  g.text(15, 36, '...', '#514a42');
};
/* コンパイラ：人が書いたプログラムが、歯車を通って機械の言葉（0と1）になる */
FULL.compiler = (g, rnd) => {
  vgrad(g, ['#06080c', '#111820', '#1a2430', '#0e141a', '#05070a']);
  g.rect(2, 5, 14, 26, '#fcf9f1'); g.rect(2, 5, 14, 2, '#cfc8ba');
  [[3, 9, 4, '#9d62da'], [8, 9, 6, '#514a42'], [4, 12, 5, '#514a42'], [10, 12, 4, '#52b562'], [4, 15, 7, '#514a42'], [5, 18, 3, '#9d62da'], [9, 18, 5, '#514a42'], [4, 21, 6, '#e2493b'], [3, 24, 2, '#514a42'], [3, 27, 5, '#9d62da']].forEach(([x, y, w, c]) => g.hl(x, y, w, c));
  g.rect(24, 9, 14, 26, '#0b1210'); g.hl(24, 9, 14, '#2b7a40');
  for (let r = 0; r < 6; r++) for (let k = 0; k < 3; k++) g.text(25 + k * 4, 11 + r * 4, rnd() < 0.5 ? '0' : '1', '#52b562');
  gear(g, 20, 22, 7, 11, '#bcc6cb', '#514a42'); g.disc(20, 22, 1.2, '#f7d14a');
  g.thick(13, 22, 15, 22, '#f7d14a', 1); g.thick(25, 22, 23, 22, '#f7d14a', 1);
  g.set(24, 21, '#f7d14a'); g.set(24, 23, '#f7d14a'); g.set(25, 20, '#f7d14a'); g.set(25, 24, '#f7d14a');
};
/* TRON：家の中のあらゆるものにコンピュータ（チップ）が入って、つながっている */
FULL.tronex = (g, rnd) => {
  vgrad(g, ['#04060f', '#0c1430', '#1a2450', '#0c1430', '#04060c']);
  stars(g, rnd, 22, ['#dfeaff', '#ffffff'], 14);
  for (let y = 4; y <= 14; y++) { const w = (y - 4) * 1.7; g.hl(Math.round(20 - w), y, Math.round(w * 2), '#7d3a1a'); }
  g.hl(2, 14, 36, '#5a2a10');
  g.rect(5, 15, 30, 27, '#efe2bf'); g.hl(5, 28, 30, '#b59a6a');
  g.rect(8, 30, 6, 11, '#cfc8ba'); g.hl(8, 34, 6, '#8f887c');
  g.rect(25, 31, 7, 11, '#744a2a'); g.set(30, 36, '#f7d14a');
  g.rect(26, 17, 7, 7, '#2c56aa'); g.vl(29, 17, 7, '#efe2bf'); g.hl(26, 20, 7, '#efe2bf'); g.set(31, 18, '#fcf9f1');
  g.rect(8, 17, 9, 3, '#fcf9f1'); g.hl(8, 19, 9, '#cfc8ba');
  g.vl(19, 15, 4, '#514a42'); g.rect(17, 19, 5, 2, '#f7d14a');
  const chips = [[13, 22], [16, 32], [29, 25], [24, 38], [11, 38]];
  chips.forEach(([x, y]) => g.line(20, 26, x, y, '#c79427'));
  chips.forEach(([x, y]) => { halo(g, x, y, 3, '#f7d14a', 0.5); g.rect(x - 1, y - 1, 2, 2, '#f7d14a'); });
  g.rect(19, 25, 3, 3, '#f28a2c'); g.set(20, 26, '#fff3b0');
  g.hl(0, 42, FW, '#1a2410');
};
/* null²：鏡のような膜でできた建物。空と光がゆがんで映る */
FULL.null2 = (g, rnd) => {
  vgrad(g, ['#c8e6ff', '#9fc8f2', '#6aa0e8', '#2c56aa', '#0c1a30']);
  const sky = ['#ffffff', '#e4f2ff', '#c8e6ff', '#9fc8f2', '#6aa0e8', '#4c88ea', '#2c56aa'];
  g.each((x, y, px, py) => {
    if (x < 3 || x > 36 || y < 9 || y > 40) return;
    const bulge = Math.sin((px - 3) / 34 * Math.PI) * Math.sin((py - 9) / 32 * Math.PI);
    const v = (40 - py) / 31 + Math.sin(px * 0.45 + py * 0.2) * 0.12 + bulge * 0.35;
    g.set(x, y, sky[Math.max(0, Math.min(sky.length - 1, Math.floor((1 - v) * sky.length)))]);
  });
  for (let x = 3; x <= 36; x += 8) g.vl(x, 9, 32, '#dfe7ec');
  for (let y = 9; y <= 40; y += 8) g.hl(3, y, 34, '#dfe7ec');
  halo(g, 14, 18, 6, '#ffffff', 0.7);
  for (let y = 42; y < FH; y += 2) for (let x = 0; x < FW; x++) if (Math.sin(x * 0.5 + y) > 0.6) g.set(x, y, '#4c88ea');
};

/* ===== 人物カード（顔は描かず、研究や作品の場面） ===== */
/* アラン・チューリング：暗号を解く機械（ボンブ）のならんだドラムと、エニグマの円盤と、テープ */
FULL.alan = (g, rnd) => {
  vgrad(g, ['#05080c', '#0f161c', '#18222a', '#0c1218', '#04070a']);
  g.rect(1, 2, 38, 28, '#1e1c18'); g.hl(1, 2, 38, '#514a42'); g.hl(1, 29, 38, '#0a0908');
  const rings = ['#e2493b', '#52b562', '#f7d14a'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x = 6 + c * 9.3, y = 8 + r * 8;
    g.disc(x, y, 3.6, '#26221c'); g.ring(x, y, 3.6, 1, rings[r]); g.set(x + Math.round(Math.cos(c + r) * 2), y + Math.round(Math.sin(c + r) * 2), '#fcf9f1');
  }
  gear(g, 11, 40, 7, 26, '#8f887c', '#26221c');
  g.ring(11, 40, 4.5, 1, '#cfc8ba');
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.set(11 + Math.cos(a) * 3, 40 + Math.sin(a) * 3, '#fcf9f1'); }
  for (let x = 20; x < FW; x++) { const y = 34 + Math.round((x - 20) * 0.35); g.vl(x, y, 5, '#efe2bf'); if (x % 3 === 0) g.set(x, y + 2, rnd() < 0.5 ? '#26221c' : '#c0392b'); }
};
/* ジョン・フォン・ノイマン：プログラムもデータも同じメモリに入れて、CPU が順に読む（ノイマン型） */
FULL.neumann = (g, rnd) => {
  vgrad(g, ['#03060f', '#0a1328', '#101d3c', '#0a1328', '#03050c']);
  for (let x = 0; x < FW; x += 5) g.vl(x, 0, 46, '#0c1830');
  g.rect(3, 3, 34, 13, '#16408a'); g.hl(3, 3, 34, '#4c88ea');
  label(g, 4, 4, 'MEMORY', '#cfe0ff');
  for (let i = 0; i < 16; i++) g.rect(4 + i * 2, 10, 1, 4, i < 7 ? '#52b562' : '#a3c8ff'); // 命令（緑）とデータ（青）が同じ場所に
  g.rect(11, 22, 18, 11, '#9e4a14'); g.hl(11, 22, 18, '#f28a2c'); g.vl(20, 23, 10, '#5a2a0a');
  label(g, 14, 24, 'CPU', '#fff3e0');
  g.rect(13, 30, 5, 2, '#f7d14a'); g.rect(22, 30, 5, 2, '#52b562');
  g.rect(1, 38, 10, 6, '#2b5a3a'); label(g, 2, 39, 'IN', '#cfe8d6');
  g.rect(28, 38, 11, 6, '#5a2b5a'); label(g, 29, 39, 'OUT', '#ecd0ec');
  g.thick(18, 16, 18, 21, '#f7d14a', 1); g.thick(22, 16, 22, 21, '#f7d14a', 1);
  g.set(17, 20, '#f7d14a'); g.set(19, 20, '#f7d14a'); g.set(21, 17, '#f7d14a'); g.set(23, 17, '#f7d14a');
  g.line(10, 38, 13, 34, '#7fe39a'); g.line(27, 34, 30, 37, '#d2adf6');
};
/* クロード・シャノン：迷路をとく機械のネズミと、0と1 */
FULL.shannon = (g, rnd) => {
  vgrad(g, ['#0c0804', '#1e140a', '#2a1c0e', '#140c06', '#060402']);
  g.rect(2, 6, 36, 32, '#3a2410'); g.rect(3, 7, 34, 30, '#5a3a1a');
  const W = [[0, 0, 5, 0], [0, 0, 0, 5], [5, 0, 5, 5], [0, 5, 5, 5], [1, 0, 1, 2], [2, 1, 4, 1], [3, 1, 3, 3], [1, 3, 2, 3], [2, 3, 2, 4], [4, 2, 4, 4], [1, 4, 3, 4]];
  W.forEach(([a, b, c, d]) => g.thick(3 + a * 6.8, 7 + b * 6, 3 + c * 6.8, 7 + d * 6, '#c79427', 1));
  [[6, 34], [6, 28], [12, 28], [12, 22], [18, 22], [25, 22]].reduce((p, q) => { g.line(p[0], p[1], q[0], q[1], '#52b562'); return q; });
  g.ell(27, 22, 2.6, 1.7, '#bcc6cb'); g.set(29, 21, '#e2493b'); g.disc(26, 20.5, 0.9, '#cfc8ba'); g.disc(26, 23.5, 0.9, '#cfc8ba');
  g.line(30, 22, 32, 21, '#8f887c'); g.line(30, 23, 32, 24, '#8f887c'); g.line(24, 22, 21, 24, '#8f887c');
  g.disc(33, 31, 1.6, '#f7d14a');
  label(g, 4, 0, '0110 1', '#f7d14a', '#3a2410');
  for (let x = 3; x < 38; x += 3) { g.rect(x, 40, 2, 3, '#26221c'); g.set(x, 40, rnd() < 0.5 ? '#f28a2c' : '#514a42'); }
};
/* エイダ・ラブレス：解析機関の歯車の柱と、つながってながれるパンチカード */
FULL.ada = (g, rnd) => {
  vgrad(g, ['#0c0418', '#1f0c3a', '#2e1450', '#1a0a30', '#06020c']);
  stars(g, rnd, 14, ['#d2adf6', '#ffffff'], 30);
  g.vl(12, 1, 42, '#8f887c'); g.vl(22, 5, 36, '#77848c');
  [5, 12, 19, 26, 33].forEach((y, i) => { gear(g, 12, y, 5, 12, i % 2 ? '#c79427' : '#a8781f', '#3a2a0a'); g.text(10, y - 2, String(i), '#3a2a0a'); });
  [9, 16, 23, 30, 37].forEach(y => gear(g, 22, y, 3.5, 9, '#7a5a14', '#3a2a0a'));
  for (let i = 0; i < 6; i++) {
    const x = 26 + i * 1.2 - (i > 2 ? (i - 2) * 3 : 0), y = 3 + i * 7;
    g.rect(x, y, 11, 5, '#efe2bf'); g.hl(x, y, 11, '#fcf9f1');
    for (let k = 0; k < 4; k++) g.set(x + 2 + k * 2 + (i % 2), y + 2 + (k % 2), '#26221c');
    if (i) g.line(x + 5, y, x + 5, y - 2, '#8f887c');
  }
};
/* グレース・ホッパー：リレーの並ぶ計算機と、日誌にテープでとめた本物の「バグ（虫）」 */
FULL.hopper = (g, rnd) => {
  vgrad(g, ['#03060f', '#0a1530', '#10204a', '#0a1530', '#03050c']);
  g.rect(1, 1, 38, 22, '#1e1c18');
  for (let y = 3; y < 22; y += 4) for (let x = 3; x < 38; x += 4) { g.rect(x, y, 2, 3, '#8f887c'); g.set(x, y + 1, '#cf6420'); g.set(x + 1, y, rnd() < 0.3 ? '#f7d14a' : '#514a42'); }
  g.rect(6, 21, 29, 22, '#020408'); g.rect(5, 20, 29, 22, '#fcf9f1');
  for (let y = 24; y < 42; y += 3) g.hl(6, y, 27, '#cfe0ff');
  g.vl(9, 21, 21, '#f6a497');
  const mx = 20, my = 29;
  g.ell(mx - 4, my - 1, 4, 2.6, '#8f887c'); g.ell(mx + 4, my - 1, 4, 2.6, '#8f887c'); g.ell(mx - 3, my + 2, 3, 1.8, '#77848c'); g.ell(mx + 3, my + 2, 3, 1.8, '#77848c');
  g.vl(mx, my - 3, 7, '#514a42'); g.line(mx, my - 3, mx - 2, my - 6, '#514a42'); g.line(mx, my - 3, mx + 2, my - 6, '#514a42');
  [[mx - 8, my - 3], [mx + 4, my - 3]].forEach(([x, y]) => { for (let k = 0; k < 5; k++) g.hl(x, y + k, 5, k % 2 ? '#f6d0a8' : '#efc89a'); });
  label(g, 15, 36, 'BUG', '#26221c');
};
/* マーク・ワイザー：壁の大きな画面（ボード）、机の上のパッド、手のひらのタブ。部屋にとけこむコンピュータ */
FULL.weiser = (g, rnd) => {
  vgrad(g, ['#1a120c', '#2e2016', '#4a3424', '#3a2818', '#120c08']);
  for (let i = 0; i < 6; i++) g.line(38 - i * 2, 0, 24 - i * 4, 34, '#5a4230');
  g.rect(3, 3, 26, 15, '#26221c'); g.rect(4, 4, 24, 13, '#16324a');
  g.line(6, 14, 11, 9, '#4cc6d8'); g.line(11, 9, 15, 12, '#4cc6d8'); g.line(15, 12, 21, 6, '#4cc6d8'); g.rect(22, 11, 4, 4, '#f7d14a');
  g.rect(31, 5, 6, 8, '#c8e6ff'); g.vl(34, 5, 8, '#5a4230'); g.hl(31, 9, 6, '#5a4230');
  g.rect(2, 33, 36, 3, '#744a2a'); g.hl(2, 33, 36, '#a86a3a'); g.vl(5, 36, 8, '#5a3a20'); g.vl(34, 36, 8, '#5a3a20');
  g.rect(8, 27, 11, 6, '#26221c'); g.rect(9, 28, 9, 4, '#cfe0ff'); g.hl(10, 29, 5, '#4c88ea'); g.hl(10, 31, 3, '#8f887c');
  g.rect(25, 26, 4, 7, '#26221c'); g.rect(26, 27, 2, 4, '#a8de7c');
  [[5, 22], [14, 21], [36, 18], [22, 22], [33, 28]].forEach(([x, y]) => { halo(g, x, y, 2.5, '#f7d14a', 0.4); g.set(x, y, '#fff3b0'); });
};
/* 落合陽一：鏡のような湖に、デジタルの森がうつる。空中には、音の波で浮かぶ光の粒（顔は描かない） */
FULL.ochiai = (g, rnd) => {
  vgrad(g, ['#0a1a2a', '#1f3a5a', '#4a6a8a', '#c8b8a0'], 0, 25);
  for (let i = 0; i < 7; i++) {
    const x = 3 + i * 5.5 + rnd() * 2, h = 7 + Math.floor(rnd() * 7);
    for (let k = 0; k < h; k++) { const w = Math.floor(k / 2.4); g.hl(Math.round(x - w), 25 - h + k, w * 2 + 1, k % 3 ? '#2b7a40' : '#52b562'); }
  }
  g.hl(0, 25, FW, '#e4f2ff');
  for (let y = 26; y < 46; y++) {
    const sy = 25 - (y - 25), off = Math.round(Math.sin(y * 0.9) * (y - 25) * 0.08);
    for (let x = 0; x < FW; x++) { const c = g.get(x - off, sy); g.set(x, y, c === '#2b7a40' || c === '#52b562' ? '#1f5a6a' : (bay(x, y) < 0.5 ? '#3a6a8a' : '#2a5070')); }
  }
  vgrad(g, ['#1a3a50', '#0a1a28', '#050c14'], 46, 55);
  g.hl(4, 1, 32, '#514a42'); for (let x = 5; x < 36; x += 3) g.set(x, 2, '#8f887c');
  for (let i = 0; i < 9; i++) for (let k = 0; k < 4; k++) {
    const x = 6 + i * 3.5, y = 5 + k * 4 + Math.sin(i * 0.8) * 1.2;
    halo(g, x, y, 1.8, '#c8f0ff', 0.4); g.set(x, y, '#ffffff');
  }
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; if (i % 2) g.set(20 + Math.cos(a) * 16, 14 + Math.sin(a) * 3.2, '#c8f0ff'); }
};

/* ---------- 画像にする ---------- */
const FULL_CACHE = {};
function fullURL(id) {
  if (FULL_CACHE[id]) return FULL_CACHE[id];
  const d = DEF[id], g = grid(FW, FH), rnd = frand(fseed(id));
  if (FULL[id]) FULL[id](g, rnd, d, id); else defaultFull(g, rnd, d, id);
  const S = 6, cv = document.createElement('canvas');
  cv.width = FW * S; cv.height = FH * S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, cv.width, cv.height);
  g.each((x, y) => { const c = g.a[y][x]; if (c) { ctx.fillStyle = fcol(c); ctx.fillRect(x * S, y * S, S, S); } });
  return (FULL_CACHE[id] = cv.toDataURL('image/png'));
}
