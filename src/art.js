'use strict';
/* =========================================================
   CS用語カードバトル — カードの絵柄（ドット絵）
   24×24 のマスに図形を描き、外側に自動でふち取りをつけて画像にする
   ========================================================= */

const PAL = {
  k: '#26221c', K: '#514a42', g: '#8f887c', l: '#cfc8ba', w: '#fcf9f1',
  r: '#e2493b', R: '#9e2e25', n: '#f6a497', q: '#d9707f',
  o: '#f28a2c', O: '#b0571b', y: '#f7d14a', Y: '#c79427',
  e: '#52b562', E: '#2b7a40', f: '#a8de7c',
  b: '#4c88ea', B: '#2c56aa', u: '#a3c8ff', c: '#4cc6d8', C: '#23889a',
  p: '#9d62da', P: '#64399d', v: '#d2adf6',
  s: '#f6d0a8', S: '#d39a69', t: '#b57c4b', T: '#744a2a', m: '#bcc6cb', M: '#77848c',
};
const SHADE = { r: 'R', o: 'O', y: 'Y', e: 'E', b: 'B', c: 'C', p: 'P', s: 'S', t: 'T', m: 'M', l: 'g', w: 'l', u: 'b', f: 'e', n: 'q', v: 'p', g: 'K' };

/* 3×5 の小さな文字 */
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101110100110101',
  L: '100100100100111', M: '1000111011101011000110001', N: '10011101101110011001', O: '111101101101111', P: '110101110100100',
  R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  X: '101101010101101', Y: '101101010010010', Z: '111001010100111', '?': '111001011000010', '!': '010010010000010',
  '$': '011110010011110', '>': '100010001010100',
   '<': '001010100010001', '.': '000000000000010', '/': '001001010100100', '-': '000000111000000',
};

/* W×H のマス（ふつうの絵は 24×24。★フルアートの絵は fullart.js で 40×56） */
function grid(W, H) {
  W = W || 24; H = H || W;
  const a = Array.from({ length: H }, () => new Array(W).fill(null));
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const g = {
    a, W, H,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (inb(x, y)) a[y][x] = c; return g; },
    get(x, y) { return inb(x, y) ? a[y][x] : null; },
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(x + i, y + j, c); return g; },
    hl(x, y, n, c) { return g.rect(x, y, n, 1, c); },
    vl(x, y, n, c) { return g.rect(x, y, 1, n, c); },
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        g.set(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      return g;
    },
    thick(x0, y0, x1, y1, c, w) {
      w = w || 2;
      const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
      for (let i = 0; i < w; i++) {
        const ox = steep ? i : 0, oy = steep ? 0 : i;
        g.line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, c);
      }
      return g;
    },
    each(fn) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fn(x, y, x + 0.5, y + 0.5); return g; },
    disc(cx, cy, r, c) { return g.each((x, y, px, py) => { if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) g.set(x, y, c); }); },
    ring(cx, cy, r, t, c) {
      return g.each((x, y, px, py) => { const d = Math.hypot(px - cx, py - cy); if (d <= r && d > r - t) g.set(x, y, c); });
    },
    arc(cx, cy, r, t, c, a0, a1) {
      return g.each((x, y, px, py) => {
        const d = Math.hypot(px - cx, py - cy);
        if (d > r || d <= r - t) return;
        let a = Math.atan2(py - cy, px - cx) * 180 / Math.PI;
        if (a < 0) a += 360;
        const inside = a0 <= a1 ? a >= a0 && a <= a1 : a >= a0 || a <= a1;
        if (inside) g.set(x, y, c);
      });
    },
    ell(cx, cy, rx, ry, c) { return g.each((x, y, px, py) => { if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1) g.set(x, y, c); }); },
    dia(cx, cy, r, c) { return g.each((x, y, px, py) => { if (Math.abs(px - cx) + Math.abs(py - cy) <= r) g.set(x, y, c); }); },
    str(x, y, s) {
      s.split('\n').map(r => r.trim()).filter(r => r.length).forEach((row, j) => {
        [...row].forEach((ch, i) => { if (ch !== '.') g.set(x + i, y + j, ch === '_' ? null : ch); });
      });
      return g;
    },
    text(x, y, t, c) {
      [...String(t)].forEach(ch => {
        const f = FONT[ch];
        if (!f) { x += 4; return; }
        const w = f.length / 5;
        for (let j = 0; j < 5; j++) for (let i = 0; i < w; i++) if (f[j * w + i] === '1') g.set(x + i, y + j, c);
        x += w + 1;
      });
      return g;
    },
    recolor(fn) { return g.each((x, y) => { const c = a[y][x]; if (c) { const n = fn(c, x, y); if (n !== undefined) a[y][x] = n; } }); },
  };
  return g;
}

/* 小さな部品 */
const arrowR = (g, x, y, len, c) => { g.hl(x, y, len - 1, c); g.set(x + len - 2, y - 1, c); g.set(x + len - 2, y + 1, c); g.set(x + len - 1, y, c); };
const arrowL = (g, x, y, len, c) => { g.hl(x + 1, y, len - 1, c); g.set(x + 1, y - 1, c); g.set(x + 1, y + 1, c); g.set(x, y, c); };
const server = (g, x, y) => { g.rect(x, y, 5, 5, 'K'); g.hl(x + 1, y + 1, 2, 'g'); g.hl(x + 1, y + 3, 2, 'g'); g.set(x + 3, y + 1, 'e'); g.set(x + 3, y + 3, 'e'); };
const bolt = (g, x, y) => g.str(x, y, `
  ...yy
  ..yy.
  .yyyy
  yyyy.
  ..yy.
  .yy..
  .y...`);

const ART = {};

/* ===== アルゴリズム ===== */
ART.brute = g => {
  g.thick(15, 15, 20, 20, 'T', 3);
  g.line(16, 15, 21, 20, 't');
  g.disc(10, 10, 7.5, 'M');
  g.disc(10, 10, 5.5, 'u');
  [[7, 7], [11, 7], [7, 11]].forEach(([x, y]) => g.rect(x, y, 2, 2, 'b'));
  g.rect(11, 11, 2, 2, 'r');
  g.set(6, 6, 'w'); g.set(7, 5, 'w'); g.set(5, 7, 'w');
};
ART.memo = g => {
  g.rect(3, 4, 13, 17, 'w');
  g.rect(3, 4, 13, 3, 'r');
  [5, 8, 11, 14].forEach(x => g.vl(x, 2, 3, 'M'));
  [10, 13, 16, 19].forEach(y => g.hl(5, y, 9, 'u'));
  g.hl(5, 9, 5, 'K'); g.hl(5, 12, 8, 'K'); g.hl(5, 15, 4, 'K'); g.hl(10, 15, 3, 'K'); g.hl(5, 18, 6, 'K');
  g.rect(18, 2, 3, 2, 'n'); g.rect(18, 4, 3, 1, 'm');
  g.rect(18, 5, 3, 11, 'y'); g.vl(20, 5, 11, 'Y');
  g.rect(18, 16, 3, 2, 's'); g.set(19, 18, 's'); g.set(19, 19, 'K');
};
ART.dp = g => {
  g.rect(3, 3, 17, 17, 'K');
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    let c = 'w';
    if (i <= j) c = (i + j) % 2 ? 'f' : 'e';
    if (i === 0 && j === 0) c = 'b';
    if (i === 3 && j === 3) c = 'y';
    g.rect(4 + i * 4, 4 + j * 4, 3, 3, c);
  }
};
ART.bubble = g => {
  const b = (cx, cy, r) => { g.disc(cx, cy, r, 'C'); g.disc(cx, cy, r - 1.2, 'u'); g.disc(cx - r * 0.35, cy - r * 0.35, Math.max(0.9, r * 0.28), 'w'); };
  b(14.5, 7.5, 5.5); b(7, 13.5, 4); b(14.5, 18, 3); b(6, 20, 1.8);
};
ART.quick = g => {
  [6, 9, 12, 15, 18].forEach((h, i) => {
    const x = 2 + i * 4, piv = i === 2;
    g.rect(x, 21 - h, 3, h, piv ? 'r' : 'e');
    g.vl(x + 2, 21 - h, h, piv ? 'R' : 'E');
  });
  g.str(3, 1, `
    ....yyyy
    ...yyyy.
    ..yyyY..
    .yyyyyyy
    ....yyY.
    ...yyY..
    ..yY....
    .yY.....`);
};
ART.dijkstra = g => {
  g.rect(2, 3, 20, 17, 'w');
  g.rect(9, 3, 6, 17, 'l');
  g.line(5, 16, 9, 7, 'g'); g.line(9, 7, 18, 9, 'g');
  g.thick(5, 16, 13, 15, 'r', 2); g.thick(13, 15, 18, 9, 'r', 2);
  [[9, 7], [13, 15]].forEach(([x, y]) => g.rect(x - 1, y - 1, 3, 3, 'B'));
  g.rect(4, 15, 3, 3, 'e');
  g.vl(18, 4, 6, 'K'); g.rect(19, 4, 3, 3, 'r');
};
ART.binsearch = g => {
  for (let i = 0; i < 7; i++) {
    const x = 1 + i * 3;
    const c = i < 3 ? 'l' : i === 3 ? 'y' : 'b';
    g.rect(x, 14, 3, 6, c); g.vl(x + 2, 14, 6, SHADE[c]);
  }
  g.rect(10, 3, 3, 6, 'r');
  g.str(8, 9, `
    rrrrrrr
    .rrrrr.
    ..rrr..`);
  g.hl(13, 21, 9, 'B');
};
ART.greedy = g => {
  const coin = (cx, cy, r) => { g.disc(cx, cy, r, 'Y'); g.disc(cx - 0.6, cy - 0.6, r - 1.3, 'y'); };
  coin(15, 9, 7);
  g.text(10, 7, '500', 'O');
  coin(6, 16.5, 4.5);
  coin(15, 19, 3);
  g.str(2, 2, `
    ..w..
    ..w..
    wwyww
    ..w..
    ..w..`);
};
ART.bfs = g => {
  g.disc(12, 12, 10, 'M');
  g.disc(12, 12, 9, 'K');
  g.ring(12, 12, 6.8, 1, 'E');
  g.ring(12, 12, 3.6, 1, 'E');
  g.rect(11, 11, 2, 2, 'f');
  [[11, 8], [8, 13], [15, 13]].forEach(([x, y]) => g.rect(x, y, 2, 2, 'f'));
  [[6, 8], [16, 6], [18, 14], [8, 17], [14, 18]].forEach(([x, y]) => g.rect(x, y, 2, 2, 'e'));
};
ART.astar = g => {
  g.str(9, 2, `
    ......y......
    .....yyy.....
    .....yyy.....
    ....yyyyy....
    yyyyyyyyyyyyy
    .yyyyyyyyyyy.
    ..yyyyyyyyy..
    ...yyyyyyy...
    ...yyyyyyy...
    ..yyyy.yyyy..
    ..yyy...yyy..
    .yyy.....yyy.
    .yy.......yy.`);
  g.recolor((c, x, y) => (c === 'y' && (x >= 17 || y >= 11) ? 'Y' : undefined));
  g.text(14, 6, 'A', 'O');
  [[1, 20], [3.6, 17], [6, 14.5]].forEach(([x, y]) => g.rect(Math.round(x), Math.round(y), 2, 2, 'r'));
};
ART.merge = g => {
  [[2, 3], [5, 5], [8, 7]].forEach(([x, h]) => g.rect(x, 10 - h, 2, h, 'b'));
  [[14, 4], [17, 6], [20, 8]].forEach(([x, h]) => g.rect(x, 10 - h, 2, h, 'p'));
  g.str(7, 10, `
    KK......KK
    .KK....KK.
    ..KK..KK..
    ...KKKK...`);
  [3, 4, 5, 6, 7, 8].forEach((h, i) => g.rect(3 + i * 3, 22 - h, 2, h, i % 2 ? 'p' : 'b'));
};

/* ===== データ ===== */
ART.tree = g => {
  g.rect(10, 14, 4, 8, 't'); g.vl(13, 14, 8, 'T');
  g.disc(12, 9, 7.5, 'e'); g.disc(7, 12, 4.5, 'e'); g.disc(17, 12, 4.5, 'e');
  g.disc(9.5, 6.5, 3, 'f'); g.disc(6, 11, 1.8, 'f');
  g.disc(16, 14, 2.5, 'E'); g.disc(12, 14.5, 2, 'E');
};
const TREE_N = [[12, 4], [7, 11], [17, 11], [4, 18], [9, 18], [15, 18], [20, 18]];
const TREE_E = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]];
function nodeTree(g, colors, edge) {
  TREE_E.forEach(([a, b]) => g.thick(TREE_N[a][0], TREE_N[a][1], TREE_N[b][0], TREE_N[b][1], edge, 2));
  TREE_N.forEach(([x, y], i) => {
    g.disc(x + 0.5, y + 0.5, 2.6, colors[i]);
    g.set(x - 1, y - 1, colors[i] === 'K' ? 'g' : 'w');
  });
}
ART.bst = g => nodeTree(g, ['b', 'u', 'u', 'c', 'c', 'c', 'c'], 'T');
ART.rbtree = g => nodeTree(g, ['K', 'r', 'r', 'K', 'K', 'K', 'K'], 'g');
ART.stack = g => {
  [['b', 'B'], ['c', 'C'], ['e', 'E'], ['o', 'O']].forEach(([c, d], i) => {
    const y = 19 - i * 4;
    g.rect(4, y, 16, 3, c); g.hl(4, y + 2, 16, d); g.hl(5, y, 3, 'w');
  });
  g.rect(11, 1, 2, 3, 'r');
  g.str(9, 4, `
    rrrrrr
    .rrrr.`);
};
ART.queue = g => {
  g.rect(2, 8, 20, 9, 'l'); g.hl(2, 9, 20, 'w'); g.hl(2, 16, 20, 'g');
  [['r', 6], ['y', 12], ['e', 18]].forEach(([c, x]) => { g.disc(x, 12.5, 3, c); g.set(x - 2, 11, 'w'); });
  g.hl(6, 20, 11, 'K');
  g.str(16, 18, `
    K..
    KK.
    KKK
    KK.
    K..`);
};
ART.hash = g => {
  for (let y = 3; y <= 20; y++) {
    const off = Math.floor((20 - y) / 6);
    g.rect(6 + off, y, 3, 1, 'b'); g.rect(13 + off, y, 3, 1, 'b');
    g.set(6 + off, y, 'u'); g.set(13 + off, y, 'u');
  }
  g.rect(3, 7, 18, 3, 'b'); g.hl(3, 9, 18, 'B');
  g.rect(2, 14, 18, 3, 'b'); g.hl(2, 16, 18, 'B');
};
ART.array = g => {
  g.rect(1, 5, 2, 14, 'K'); g.rect(3, 5, 2, 2, 'K'); g.rect(3, 17, 2, 2, 'K');
  g.rect(21, 5, 2, 14, 'K'); g.rect(19, 5, 2, 2, 'K'); g.rect(19, 17, 2, 2, 'K');
  ['r', 'y', 'e', 'b'].forEach((c, i) => {
    const x = 5 + i * 4 - (i === 3 ? 1 : 0);
    g.rect(x, 9, 3, 6, c); g.hl(x, 14, 3, SHADE[c]); g.set(x, 9, 'w');
  });
};
ART.pqueue = g => {
  g.rect(1, 18, 22, 2, 'K');
  [3, 8, 13, 18].forEach(x => g.rect(x, 20, 2, 2, 'M'));
  g.rect(2, 13, 4, 5, 'u');
  g.rect(7, 11, 5, 7, 'b'); g.vl(11, 11, 7, 'B');
  g.rect(13, 6, 8, 12, 'r'); g.vl(20, 6, 12, 'R'); g.hl(13, 17, 8, 'R');
  g.rect(16, 8, 2, 5, 'w'); g.rect(16, 14, 2, 2, 'w');
  g.str(13, 2, `
    y..y..y.
    yy.yy.yy
    yyyyyyyy`);
};
ART.graph = g => {
  const N = [[12, 3], [20, 9], [17, 19], [7, 19], [4, 9], [12, 12]];
  [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 5], [5, 2], [5, 4], [1, 5]].forEach(([a, b]) => g.line(N[a][0], N[a][1], N[b][0], N[b][1], 'K'));
  N.forEach(([x, y], i) => { g.disc(x + 0.5, y + 0.5, 2.5, i === 5 ? 'y' : 'b'); g.set(x - 1, y - 1, i === 5 ? 'w' : 'u'); });
};
ART.rdb = g => {
  g.rect(4, 6, 16, 13, 'b');
  g.ell(12, 18.5, 8, 2.6, 'b');
  for (const yy of [10.5, 14.5]) {
    for (let x = 4; x < 20; x++) {
      const t = (x + 0.5 - 12) / 8;
      g.set(x, Math.floor(yy + 2.4 * Math.sqrt(Math.max(0, 1 - t * t))), 'B');
    }
  }
  g.vl(5, 8, 11, 'u');
  g.ell(12, 6, 8, 2.6, 'u');
  g.ell(11, 5.5, 5, 1.2, 'w');
};

/* ===== ネットワーク ===== */
ART.ip = g => {
  g.rect(2, 6, 20, 13, 'w');
  g.thick(2, 6, 11, 13, 'l', 1); g.line(21, 6, 12, 13, 'l');
  g.line(2, 18, 8, 13, 'l'); g.line(21, 18, 15, 13, 'l');
  g.disc(12, 13.5, 2.3, 'r'); g.set(11, 13, 'n');
};
ART.tcp = g => {
  const mon = x => { g.rect(x, 7, 7, 6, 'K'); g.rect(x + 1, 8, 5, 4, 'c'); g.set(x + 2, 9, 'w'); g.rect(x + 2, 13, 3, 2, 'K'); g.rect(x + 1, 15, 5, 1, 'g'); };
  mon(1); mon(16);
  arrowR(g, 8, 8, 8, 'b'); arrowL(g, 8, 11, 8, 'y'); arrowR(g, 8, 14, 8, 'e');
};
ART.http = g => {
  g.rect(2, 3, 20, 18, 'w');
  g.rect(2, 3, 20, 4, 'l');
  g.rect(3, 4, 2, 2, 'r'); g.rect(6, 4, 2, 2, 'y'); g.rect(9, 4, 2, 2, 'e');
  g.rect(12, 4, 9, 2, 'w');
  g.text(6, 9, '200', 'E');
  g.hl(5, 16, 14, 'l'); g.hl(5, 18, 9, 'l');
};
ART.dns = g => {
  g.rect(3, 2, 15, 20, 'B');
  g.rect(3, 2, 2, 20, 'b');
  g.rect(18, 4, 2, 3, 'r'); g.rect(18, 9, 2, 3, 'y'); g.rect(18, 14, 2, 3, 'e');
  g.rect(4, 7, 14, 7, 'w');
  g.text(5, 8, 'DNS', 'K');
  g.hl(6, 17, 9, 'u'); g.hl(6, 19, 6, 'u');
};
ART.router = g => {
  g.rect(2, 12, 20, 7, 'K'); g.hl(2, 12, 20, 'g');
  [[5, 'e'], [8, 'e'], [11, 'y'], [14, 'r']].forEach(([x, c]) => g.rect(x, 15, 2, 1, c));
  g.rect(18, 15, 2, 2, 'M');
  g.rect(5, 3, 2, 9, 'K'); g.rect(17, 3, 2, 9, 'K');
  g.rect(5, 2, 2, 1, 'g'); g.rect(17, 2, 2, 1, 'g');
  g.rect(4, 19, 3, 2, 'K'); g.rect(17, 19, 3, 2, 'K');
  g.arc(6, 4, 4.5, 1.3, 'c', 300, 60);
  g.arc(18, 4, 4.5, 1.3, 'c', 120, 240);
};
ART.cloud = g => {
  g.disc(8, 13, 4.5, 'w'); g.disc(13, 10, 6, 'w'); g.disc(17.5, 13.5, 4, 'w'); g.rect(6, 13, 13, 5, 'w');
  g.hl(5, 17, 15, 'u'); g.disc(17.5, 14.5, 2.5, 'u');
  g.vl(10, 10, 6, 'b'); g.set(9, 11, 'b'); g.set(11, 11, 'b');
  g.vl(15, 10, 6, 'B'); g.set(14, 14, 'B'); g.set(16, 14, 'B');
};
ART.udp = g => {
  const env = (x, y) => { g.rect(x, y, 8, 6, 'w'); g.line(x, y, x + 3, y + 3, 'l'); g.line(x + 7, y, x + 4, y + 3, 'l'); };
  [[6, 4], [3, 11], [7, 18]].forEach(([x, y]) => { g.rect(x, y, 5, 1, 'c'); g.rect(x + 2, y + 2, 4, 1, 'c'); });
  env(13, 2); env(10, 9); env(14, 16);
};
ART.wlan = g => {
  [15, 10, 5].forEach(r => g.arc(12, 19, r, 2.6, 'b', 222, 318));
  g.disc(12, 19, 1.9, 'b');
  g.recolor((c, x, y) => (c === 'b' && y <= 8 ? 'B' : undefined));
};
ART.vpn = g => {
  g.disc(12, 17, 10, 'g'); g.disc(12, 17, 6.5, 'K');
  g.rect(0, 18, 24, 6, null);
  [[4, 12], [6, 9], [9, 8], [15, 8], [18, 9], [20, 12]].forEach(([x, y]) => g.set(x, y, 'l'));
  g.hl(1, 18, 22, 'E');
  g.arc(12.5, 13, 2.5, 1, 'm', 180, 360);
  g.rect(10, 13, 5, 4, 'y'); g.set(12, 14, 'k'); g.set(12, 15, 'k');
};
ART.cdn = g => {
  g.thick(5, 5, 9, 9, 'M', 2); g.thick(18, 5, 14, 9, 'M', 2); g.thick(5, 18, 9, 14, 'M', 2); g.thick(18, 18, 14, 14, 'M', 2);
  server(g, 1, 1); server(g, 18, 1); server(g, 1, 18); server(g, 18, 18);
  g.disc(12, 12, 6, 'b');
  g.rect(9, 9, 3, 2, 'e'); g.rect(13, 12, 3, 3, 'e'); g.rect(10, 14, 2, 2, 'e'); g.rect(12, 8, 2, 1, 'e');
  g.set(9, 11, 'u'); g.set(10, 8, 'u');
};

/* ===== セキュリティ ===== */
ART.password = g => {
  g.disc(5, 5, 3, 'y'); g.rect(4, 4, 2, 2, null);
  g.rect(8, 4, 10, 2, 'y'); g.hl(8, 5, 10, 'Y');
  g.rect(15, 6, 2, 2, 'y'); g.rect(12, 6, 2, 1, 'y');
  g.rect(1, 11, 22, 9, 'w'); g.hl(1, 19, 22, 'l');
  [3, 9, 15].forEach(x => g.str(x, 13, `
    ..K..
    K.K.K
    .KKK.
    K.K.K
    ..K..`));
  g.rect(21, 13, 1, 5, 'b');
};
ART.twofa = g => {
  g.rect(6, 1, 12, 22, 'K');
  g.rect(7, 3, 10, 16, 'u');
  g.hl(10, 2, 4, 'g'); g.rect(10, 20, 4, 1, 'g');
  [8, 11, 14].forEach(x => g.rect(x, 5, 2, 3, 'B'));
  g.str(8, 10, `
    ........e
    .......ee
    e.....ee.
    ee...ee..
    .ee.ee...
    ..eee....
    ...e.....`);
};
ART.zerotrust = g => {
  const shield = (inset, c) => {
    for (let y = 2 + inset; y <= 21 - inset; y++) {
      const t = y - 2;
      const hw = (t < 9 ? 9 : Math.max(0.5, 9 - (t - 9) * 0.82)) - inset;
      for (let x = Math.round(12 - hw); x < Math.round(12 + hw); x++) g.set(x, y, c);
    }
  };
  shield(0, 'B'); shield(1.5, 'b');
  g.ell(12, 10, 5.5, 3, 'w'); g.disc(12, 10, 2.2, 'c'); g.disc(12, 10, 1, 'k'); g.set(11, 9, 'w');
};
ART.firewall = g => {
  g.str(2, 1, `
    ....o.........o....
    ...oyo.....o..oo...
    ...oyoo...oyo.oyo..
    ..oyyyo..oyyyooyyo.
    .oyyyyyooyywyyyyyo.
    .oyywyyyyyywwyyyyoo
    ooyywwyyyyyywwyyyyo
    oyywwwyyyywwwwyyyyo`);
  g.rect(2, 9, 20, 13, 'l');
  for (let row = 0; row < 4; row++) {
    const y = 9 + row * 3, off = row % 2 ? 3 : 0;
    for (let x = 2 - off; x < 22; x += 6) {
      const x0 = Math.max(2, x), x1 = Math.min(21, x + 4);
      if (x1 >= x0) { g.rect(x0, y, x1 - x0 + 1, 2, 'r'); g.hl(x0, y + 1, x1 - x0 + 1, 'R'); }
    }
  }
};
ART.caesar = g => {
  g.rect(4, 4, 16, 15, 's');
  g.rect(3, 2, 18, 3, 'T'); g.hl(3, 2, 18, 't');
  g.rect(3, 18, 18, 3, 'T'); g.hl(3, 18, 18, 't');
  g.text(6, 6, 'ABC', 'K');
  g.text(6, 12, 'DEF', 'R');
  g.vl(18, 7, 5, 'S'); g.hl(17, 11, 3, 'S'); g.set(18, 12, 'S');
};
ART.pubkey = g => {
  g.arc(8.5, 9.5, 4.6, 2, 'M', 180, 360);
  g.rect(3, 9, 12, 11, 'y'); g.vl(14, 9, 11, 'Y'); g.hl(3, 19, 12, 'Y');
  g.disc(9, 13, 1.4, 'k'); g.rect(8, 14, 2, 3, 'k');
  g.disc(18.5, 6, 3, 'e'); g.disc(18.5, 6, 1.2, null);
  g.rect(18, 9, 2, 12, 'e'); g.vl(19, 9, 12, 'E');
  g.rect(20, 16, 2, 2, 'e'); g.rect(20, 19, 2, 2, 'e');
};
ART.virus = g => {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, x = 12 + Math.cos(a) * 9, y = 12 + Math.sin(a) * 9;
    g.line(12, 12, Math.round(x - 0.5), Math.round(y - 0.5), 'E');
    g.disc(x, y, 1.6, 'f');
  }
  g.disc(12, 12, 6.5, 'e');
  g.disc(10, 9.5, 2, 'f');
  g.rect(9, 11, 2, 3, 'k'); g.rect(13, 11, 2, 3, 'k');
  g.set(9, 11, 'w'); g.set(13, 11, 'w');
  g.line(8, 9, 10, 10, 'k'); g.line(15, 9, 13, 10, 'k');
  g.hl(10, 16, 4, 'k');
};
ART.hashfn = g => {
  g.str(5, 1, `
    rrybbppeerr..
    .llllllllll..
    ..llllllll...
    ...llllll....`);
  g.rect(4, 5, 15, 8, 'M'); g.rect(5, 6, 13, 6, 'g'); g.rect(7, 8, 9, 2, 'K'); g.set(16, 7, 'e');
  g.rect(10, 13, 3, 2, 'M');
  g.rect(5, 15, 13, 6, 'K');
  ['y', 'c', 'y', 'c'].forEach((c, i) => g.rect(6 + i * 3, 17, 2, 2, c));
};
ART.digsig = g => {
  g.rect(3, 2, 15, 19, 'w');
  [5, 8, 11].forEach((y, i) => g.hl(5, y, 11 - i * 2, 'l'));
  g.str(5, 14, `
    .B...B..
    B.B.B.BB
    ...B....`);
  g.disc(16.5, 17, 3.6, 'r'); g.disc(16.5, 17, 2, 'R'); g.set(15, 16, 'n');
  g.rect(14, 20, 2, 3, 'r'); g.rect(18, 20, 2, 3, 'r');
};
ART.blockchain = g => {
  const cube = (x, y, c) => {
    g.rect(x, y + 2, 6, 6, c); g.rect(x + 2, y, 6, 2, SHADE[c] === 'B' ? 'u' : 'w');
    g.rect(x + 6, y + 1, 2, 6, SHADE[c]); g.set(x + 1, y + 1, 'w');
  };
  const link = (x, y) => { g.ring(x, y, 1.8, 0.9, 'M'); };
  cube(1, 14, 'b'); cube(8, 8, 'c'); cube(15, 2, 'b');
  link(8.5, 15.5); link(15.5, 9.5);
  g.text(3, 17, '1', 'w'); g.text(10, 11, '2', 'w'); g.text(17, 5, '3', 'w');
};
ART.phishing = g => {
  g.vl(6, 1, 6, 'M');
  g.rect(5, 6, 3, 2, 'M');
  g.vl(6, 8, 7, 'm'); g.vl(7, 8, 7, 'M');
  g.arc(10, 14.5, 3.8, 2, 'm', 0, 180);
  g.rect(12, 10, 2, 4, 'm'); g.set(13, 9, 'm'); g.set(14, 10, 'm');
  g.rect(12, 4, 10, 7, 'w'); g.line(12, 4, 16, 7, 'l'); g.line(21, 4, 17, 7, 'l');
  g.set(13, 5, 'r');
};
ART.ransom = g => {
  g.rect(2, 2, 20, 14, 'K');
  g.rect(3, 3, 18, 12, 'r');
  g.arc(12, 8, 3.2, 1.4, 'w', 180, 360);
  g.rect(8, 8, 8, 6, 'y'); g.vl(15, 8, 6, 'Y'); g.set(12, 10, 'k'); g.set(12, 11, 'k');
  g.rect(9, 16, 6, 2, 'K');
  g.rect(5, 18, 14, 3, 'g'); g.hl(5, 18, 14, 'l');
};

/* ===== ハードウェア ===== */
ART.transistor = g => {
  g.disc(12, 8, 6, 'K');
  g.rect(6, 8, 12, 6, 'K');
  g.rect(7, 6, 2, 7, 'g');
  g.hl(10, 10, 5, 'g');
  [8, 11, 14].forEach(x => { g.rect(x, 14, 2, 8, 'm'); g.vl(x + 1, 14, 8, 'M'); });
};
ART.gate = g => {
  g.disc(12, 12, 8, 'o');
  g.rect(0, 0, 6, 24, null);
  g.rect(6, 4, 6, 16, 'o');
  g.rect(7, 6, 2, 12, 'y');
  g.recolor((c, x, y) => (c === 'o' && (x >= 16 || y >= 17) ? 'O' : undefined));
  g.rect(1, 7, 5, 2, 'M'); g.rect(1, 15, 5, 2, 'M');
  g.rect(20, 11, 3, 2, 'M');
};
ART.cpu = g => {
  for (let i = 0; i < 6; i++) {
    const p = 6 + i * 2;
    g.rect(p, 2, 1, 3, 'Y'); g.rect(p, 19, 1, 3, 'Y'); g.rect(2, p, 3, 1, 'Y'); g.rect(19, p, 3, 1, 'Y');
  }
  g.rect(5, 5, 14, 14, 'K');
  g.rect(8, 8, 8, 8, 'm'); g.hl(8, 15, 8, 'M'); g.vl(15, 8, 8, 'M');
  g.set(9, 9, 'w'); g.set(10, 9, 'w'); g.set(9, 10, 'w');
  g.set(6, 6, 'Y');
};
ART.cache = g => {
  g.rect(3, 2, 14, 20, 'g');
  for (let i = 0; i < 3; i++) {
    const y = 3 + i * 6;
    g.rect(4, y, 12, 5, 'l'); g.hl(4, y + 4, 12, 'm'); g.rect(8, y + 2, 4, 1, 'Y');
  }
  bolt(g, 15, 7);
  g.recolor((c, x, y) => (c === 'y' && x >= 18 ? 'Y' : undefined));
};
ART.gpu = g => {
  g.rect(1, 5, 2, 13, 'm');
  g.rect(3, 6, 19, 10, 'K');
  g.hl(3, 6, 19, 'r');
  [7.5, 16.5].forEach(cx => {
    g.disc(cx, 11, 4.2, 'M'); g.disc(cx, 11, 3, 'g'); g.disc(cx, 11, 1.4, 'K');
    g.set(cx - 2.5, 9, 'M'); g.set(cx + 1.5, 8, 'M'); g.set(cx + 2, 12, 'M'); g.set(cx - 2, 13, 'M');
  });
  g.rect(3, 16, 19, 2, 'E');
  for (let x = 6; x <= 18; x += 2) g.rect(x, 18, 1, 2, 'Y');
};
ART.vacuum = g => {
  g.ell(12, 9, 6, 7.5, 'u');
  g.ell(9.5, 6.5, 1.5, 3, 'w');
  g.rect(10, 8, 4, 6, 'M');
  g.vl(11, 4, 4, 'o'); g.vl(12, 4, 4, 'o'); g.set(11, 4, 'y'); g.set(12, 4, 'y');
  g.rect(7, 16, 10, 4, 'K'); g.hl(7, 16, 10, 'g');
  [8, 11, 14].forEach(x => g.rect(x, 20, 1, 2, 'm'));
};
ART.mainmem = g => {
  g.rect(1, 7, 22, 10, 'E'); g.hl(1, 7, 22, 'e');
  [3, 8, 13, 18].forEach(x => { g.rect(x, 9, 3, 4, 'K'); g.set(x, 9, 'g'); });
  for (let x = 2; x < 22; x += 2) g.rect(x, 15, 1, 2, 'Y');
  g.rect(11, 14, 2, 3, null);
};
ART.quantum = g => {
  [6, 11, 12, 17].forEach(x => g.vl(x, 5, 4, 'm'));
  [8, 11, 12, 15].forEach(x => g.vl(x, 11, 4, 'm'));
  g.vl(11, 17, 2, 'm'); g.vl(12, 17, 2, 'm');
  g.rect(3, 3, 18, 2, 'Y'); g.hl(3, 3, 18, 'y');
  g.rect(5, 9, 14, 2, 'Y'); g.hl(5, 9, 14, 'y');
  g.rect(7, 15, 10, 2, 'Y'); g.hl(7, 15, 10, 'y');
  g.vl(8, 5, 4, 'O'); g.vl(15, 5, 4, 'O');
  g.rect(9, 19, 6, 3, 'p'); g.hl(10, 20, 4, 'v');
};

/* ===== AI ===== */
ART.perceptron = g => {
  const ins = [[4, 5], [3, 12], [4, 19]];
  ins.forEach(([x, y]) => g.thick(x, y, 12, 12, 'P', 2));
  ins.forEach(([x, y]) => g.disc(x + 0.5, y + 0.5, 2.3, 'v'));
  g.disc(13.5, 12.5, 5, 'p'); g.disc(12, 11, 1.6, 'v');
  g.str(11, 11, `
    ...ww
    ...w.
    .www.`);
  g.rect(18, 12, 3, 2, 'P');
  g.str(20, 10, `
    P..
    PP.
    PPP
    PPP
    PP.
    P..`);
};
ART.nn = g => {
  g.rect(1, 2, 22, 20, 'K');
  [[1, 2], [22, 2], [1, 21], [22, 21]].forEach(([x, y]) => g.set(x, y, null));
  const L = [[4, [6, 11, 16]], [12, [4, 9, 14, 19]], [19, [8, 15]]];
  for (let l = 0; l < 2; l++) for (const y0 of L[l][1]) for (const y1 of L[l + 1][1]) g.line(L[l][0], y0, L[l + 1][0], y1, 'P');
  L.forEach(([x, ys], li) => ys.forEach(y => g.disc(x + 0.5, y + 0.5, 1.8, li === 2 ? 'c' : 'v')));
};
ART.dl = g => {
  g.disc(8, 9, 5.5, 'n'); g.disc(15, 9, 5.5, 'n'); g.disc(6.5, 14, 4.5, 'n'); g.disc(16.5, 14, 4.5, 'n');
  g.rect(5, 9, 14, 7, 'n');
  g.recolor((c, x) => (c === 'n' && x >= 12 ? 'v' : undefined));
  g.line(5, 8, 8, 7, 'q'); g.line(6, 11, 10, 10, 'q'); g.line(4, 14, 8, 13, 'q'); g.line(7, 16, 10, 15, 'q'); g.line(9, 5, 10, 7, 'q');
  g.vl(12, 4, 15, 'P');
  g.hl(13, 7, 4, 'P'); g.set(17, 7, 'w');
  g.vl(15, 7, 4, 'P'); g.hl(15, 11, 4, 'P'); g.set(19, 11, 'w');
  g.hl(13, 14, 5, 'P'); g.set(18, 14, 'w'); g.vl(14, 14, 3, 'P'); g.set(14, 17, 'w');
  g.rect(10, 18, 3, 3, 'q');
};
ART.dtree = g => {
  g.thick(9, 8, 5, 13, 'K', 2); g.thick(15, 8, 19, 13, 'K', 2);
  g.dia(12.5, 6.5, 5, 'y'); g.dia(12.5, 6.5, 5, 'y');
  g.text(11, 4, '?', 'O');
  g.rect(1, 13, 8, 7, 'e'); g.text(3, 14, 'Y', 'w');
  g.rect(15, 13, 8, 7, 'r'); g.text(17, 14, 'N', 'w');
};
ART.rl = g => {
  g.ring(5, 7, 3, 1.4, 'y'); g.ring(19, 7, 3, 1.4, 'y');
  g.rect(6, 3, 12, 6, 'y');
  g.ell(12, 8.5, 6, 4.5, 'y');
  g.recolor((c, x) => (c === 'y' && x >= 15 ? 'Y' : undefined));
  g.rect(11, 13, 2, 3, 'Y');
  g.rect(8, 16, 8, 2, 'y');
  g.rect(6, 18, 12, 3, 'T'); g.hl(6, 18, 12, 't');
  g.str(10, 5, `
    ..w..
    .www.
    wwwww
    .w.w.`);
};
ART.llm = g => {
  g.rect(2, 4, 18, 12, 'w');
  [[2, 4], [19, 4], [2, 15], [19, 15]].forEach(([x, y]) => g.set(x, y, null));
  g.str(5, 16, `
    www
    ww.
    w..`);
  g.hl(5, 7, 12, 'B'); g.hl(5, 10, 8, 'B'); g.hl(14, 10, 3, 'p'); g.hl(5, 13, 10, 'B');
  g.str(18, 1, `
    ..p..
    ..p..
    ppvpp
    ..p..
    ..p..`);
};
ART.cnn = g => {
  g.rect(2, 3, 20, 17, 'w');
  g.rect(3, 4, 18, 15, 'u');
  g.disc(17, 8, 2.4, 'y');
  for (let x = 3; x <= 20; x++) {
    const h1 = 10 - Math.abs(x - 8), h2 = 8 - Math.abs(x - 15) * 0.9, h = Math.max(h1, h2, 3);
    g.vl(x, 19 - Math.round(h), Math.round(h), h === h1 ? 'e' : 'E');
  }
  g.hl(5, 6, 8, 'o'); g.hl(5, 13, 8, 'o'); g.vl(5, 6, 8, 'o'); g.vl(12, 6, 8, 'o');
};
ART.knn = g => {
  g.rect(2, 2, 20, 20, 'w');
  g.vl(4, 3, 17, 'K'); g.hl(4, 19, 17, 'K');
  [[7, 6], [10, 9], [6, 12], [14, 5]].forEach(([x, y]) => g.rect(x, y, 2, 2, 'b'));
  [[16, 15], [18, 11], [17, 17], [12, 16]].forEach(([x, y]) => g.rect(x, y, 2, 2, 'r'));
  g.ring(12, 12.5, 5.5, 1, 'g');
  g.rect(11, 11, 3, 3, 'y'); g.set(12, 12, 'O');
};
ART.diffusion = g => {
  g.rect(2, 3, 20, 18, 'w');
  const noise = ['g', 'l', 'v', 'p', 'u', 'n', 'K', 'c'];
  for (let y = 4; y <= 19; y++) for (let x = 3; x <= 20; x++) {
    const t = (x - 3) / 17;
    const h = Math.abs((x * 73856093) ^ (y * 19349663)) >>> 0;
    g.set(x, y, (h % 100) / 100 > t * 1.25 ? noise[h % noise.length] : 'u');
  }
  g.vl(16, 12, 7, 'E'); g.set(15, 15, 'e'); g.set(17, 14, 'e');
  g.disc(16.5, 10.5, 3, 'n'); g.disc(16.5, 10.5, 1.3, 'y');
};

/* ===== 無色 ===== */
ART.variable = g => {
  g.line(4, 11, 1, 8, 't'); g.line(5, 11, 2, 8, 't'); g.line(19, 11, 22, 8, 't'); g.line(18, 11, 21, 8, 't');
  g.rect(4, 11, 16, 10, 't'); g.hl(4, 11, 16, 'T'); g.vl(19, 11, 10, 'T');
  g.rect(8, 14, 8, 5, 'w'); g.text(10, 14, 'X', 'K');
  g.rect(9, 1, 6, 7, 'b'); g.vl(14, 1, 7, 'B'); g.text(10, 2, '5', 'w');
};
ART.loop = g => {
  g.arc(12, 12, 8.5, 3, 'e', 200, 340);
  g.arc(12, 12, 8.5, 3, 'e', 20, 160);
  g.str(17, 10, `
    eeeee
    .eee.
    ..e..`);
  g.str(3, 11, `
    ..e..
    .eee.
    eeeee`);
  g.recolor((c, x, y) => (c === 'e' && y >= 13 ? 'E' : undefined));
};
ART.func = g => {
  g.rect(6, 5, 12, 14, 'g'); g.rect(7, 6, 10, 12, 'l');
  g.str(9, 7, `
    ..BBB
    .BB..
    .BB..
    BBBB.
    .BB..
    .BB..
    BB...
    B....`);
  g.str(14, 12, `
    B.B
    .B.
    B.B`);
  g.rect(1, 11, 4, 2, 'e'); g.str(4, 10, `
    e.
    ee
    ee
    e.`);
  g.rect(18, 11, 3, 2, 'r'); g.str(21, 10, `
    r.
    rr
    rr
    r.`);
  g.rect(8, 19, 2, 2, 'K'); g.rect(14, 19, 2, 2, 'K');
};
ART.recursion = g => {
  ['p', 'b', 'c', 'e', 'y'].forEach((c, i) => {
    const s = 20 - i * 4, x = 2 + i * 2;
    g.rect(x, x, s, s, c); g.hl(x, x + s - 1, s, SHADE[c]); g.vl(x + s - 1, x, s, SHADE[c]);
  });
};
ART.turing = g => {
  g.rect(0, 13, 24, 7, 'w');
  [4, 9, 14, 19].forEach(x => g.vl(x, 13, 7, 'l'));
  ['0', '1', '1', '0', '1'].forEach((b, i) => g.text(i * 5 + 1, 14, b, i === 2 ? 'r' : 'K'));
  g.rect(7, 2, 10, 8, 'M'); g.rect(8, 3, 8, 3, 'K');
  g.set(9, 4, 'e'); g.set(11, 4, 'y'); g.set(13, 4, 'r');
  g.hl(8, 7, 8, 'm');
  g.str(10, 10, `
    MMMM
    .MM.`);
};
ART.hello = g => {
  g.rect(3, 2, 18, 14, 'l'); g.hl(3, 15, 18, 'g'); g.vl(20, 2, 14, 'g');
  g.rect(5, 4, 14, 9, 'K');
  g.text(6, 6, '>HI', 'e');
  g.rect(9, 16, 6, 2, 'g');
  g.rect(4, 18, 16, 4, 'l'); g.hl(4, 21, 16, 'g');
  for (let x = 6; x < 18; x += 2) g.set(x, 19, 'g');
};
ART.ifstmt = g => {
  g.rect(11, 4, 2, 18, 'T'); g.vl(11, 4, 18, 't');
  g.rect(13, 4, 7, 5, 'e'); g.str(20, 4, `
    e..
    ee.
    eee
    ee.
    e..`);
  g.rect(4, 11, 7, 5, 'r'); g.str(1, 11, `
    ..r
    .rr
    rrr
    .rr
    ..r`);
  g.str(15, 5, `
    ...w
    ..w.
    w.w.
    .w..`);
  g.str(5, 12, `
    w.w
    .w.
    w.w`);
  g.rect(8, 21, 8, 1, 'E');
};
ART.lambda = g => {
  g.str(6, 4, `
    BBB........
    .BBB.......
    ..BBB......
    ...BB......
    ...BBB.....
    ....BB.....
    ...BBBB....
    ..BBBBB....
    ..BB.BBB...
    .BBB..BB...
    .BB...BBB..
    BBB....BB..
    BB.....BBBB
    BB......BBB`);
  g.recolor((c, x, y) => (c === 'B' && (x + y) % 7 === 0 ? 'b' : undefined));
};
ART.compiler = g => {
  g.rect(1, 2, 9, 11, 'w');
  g.hl(2, 4, 5, 'r'); g.hl(3, 6, 5, 'b'); g.hl(3, 8, 4, 'e'); g.hl(2, 10, 6, 'p');
  arrowR(g, 10, 7, 3, 'K');
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    g.rect(Math.round(17 + 5.2 * Math.cos(a)) - 1, Math.round(7.5 + 5.2 * Math.sin(a)) - 1, 2, 2, 'M');
  }
  g.disc(17, 7.5, 4.5, 'M'); g.disc(17, 7.5, 3.3, 'g'); g.disc(17, 7.5, 1.6, 'K');
  g.vl(17, 13, 2, 'K');
  g.rect(2, 15, 20, 7, 'K');
  g.text(3, 16, '1011', 'e'); g.text(19, 16, '0', 'f');
};

/* ===== コマンド ===== */
ART.import = g => {
  g.line(3, 12, 1, 9, 't'); g.line(4, 12, 2, 9, 't'); g.line(20, 12, 22, 9, 't'); g.line(19, 12, 21, 9, 't');
  g.rect(3, 12, 18, 10, 't'); g.hl(3, 12, 18, 'T'); g.vl(20, 12, 10, 'T');
  g.rect(10, 1, 4, 7, 'e'); g.vl(13, 1, 7, 'E');
  g.str(6, 8, `
    eeeeeeeeeeee
    .eeeeeeeeee.
    ..eeeeeeee..
    ...eeeeee...
    ....eeee....`);
};
ART.grep = g => {
  g.rect(2, 2, 13, 18, 'w');
  [5, 8, 14, 17].forEach(y => g.hl(4, y, 9, 'l'));
  g.rect(3, 10, 11, 3, 'y'); g.hl(4, 11, 8, 'K');
  g.thick(17, 17, 21, 21, 'T', 2);
  g.disc(15, 15, 4.5, 'M'); g.disc(15, 15, 3, 'u'); g.set(14, 13, 'w'); g.set(13, 14, 'w');
};
ART.patch = g => {
  const cs = Math.SQRT1_2;
  g.each((x, y, px, py) => {
    const dx = px - 12, dy = py - 12;
    const u = (dx - dy) * cs, v = (dx + dy) * cs;
    if (Math.abs(u) > 10 || Math.abs(v) > 4) return;
    if (Math.abs(u) > 8.3 && Math.abs(v) > 2.4) return;
    let col = 's';
    if (Math.abs(u) <= 3.2) col = 'w';
    if (Math.abs(v) >= 3.2) col = 'S';
    g.set(x, y, col);
  });
  [[7, 14], [9, 16], [16, 7], [14, 9]].forEach(([x, y]) => g.set(x, y, 'S'));
  [[11, 11], [13, 11], [11, 13], [13, 13]].forEach(([x, y]) => g.set(x, y, 'l'));
};
ART.alttab = g => {
  const key = (x, y, label) => { g.rect(x, y, 15, 9, 'l'); g.rect(x + 1, y, 13, 6, 'w'); g.hl(x, y + 8, 15, 'g'); g.text(x + 2, y + 1, label, 'K'); };
  key(1, 2, 'ALT'); key(8, 13, 'TAB');
};
ART.reboot = g => {
  g.arc(12, 13, 8.5, 2.8, 'e', 300, 240);
  g.rect(11, 2, 2, 10, 'e'); g.vl(12, 2, 10, 'E');
  g.str(16, 3, `
    eee
    .ee
    ..e`);
  g.recolor((c, x, y) => (c === 'e' && y >= 17 ? 'E' : undefined));
};
ART.update = g => {
  g.str(4, 1, `
    .......ee.......
    ......eeee......
    .....eeeeee.....
    ....eeeeeeee....
    ...eeeeeeeeee...
    ..eeeeeeeeeeee..
    .eeeeeeeeeeeeee.
    eeeeeeeeeeeeeeee`);
  g.rect(9, 9, 6, 6, 'e'); g.vl(14, 9, 6, 'E');
  g.recolor((c, x) => (c === 'e' && x >= 15 ? 'E' : undefined));
  g.rect(4, 16, 16, 6, 'w'); g.hl(4, 21, 16, 'l');
  g.text(7, 17, '2.0', 'B');
};
ART.ram = g => {
  g.rect(1, 10, 20, 9, 'E'); g.hl(1, 10, 20, 'e');
  [3, 8, 13].forEach(x => { g.rect(x, 12, 3, 3, 'K'); g.set(x, 12, 'g'); });
  for (let x = 2; x < 20; x += 2) g.rect(x, 17, 1, 2, 'Y');
  g.rect(10, 16, 2, 3, null);
  g.disc(18, 6, 4.5, 'b'); g.rect(17, 3, 2, 6, 'w'); g.rect(15, 5, 6, 2, 'w');
};
ART.honeypot = g => {
  g.ell(12, 14.5, 8, 6.5, 'o');
  g.ell(9.5, 13, 3, 3.5, 'y');
  g.rect(6, 6, 12, 3, 'O');
  g.rect(8, 3, 8, 3, 't'); g.hl(8, 3, 8, 'T');
  g.rect(8, 9, 2, 3, 'y'); g.rect(14, 9, 2, 2, 'y');
  g.rect(12, 14, 5, 4, 's'); g.set(14, 15, 'Y'); g.set(13, 16, 'Y'); g.set(15, 16, 'Y');
  g.rect(19, 3, 3, 2, 'y'); g.set(20, 3, 'k'); g.set(19, 2, 'w'); g.set(21, 2, 'w');
};
ART.pair = g => {
  g.rect(3, 9, 7, 6, 'b');
  g.disc(6.5, 6, 2.8, 's'); g.rect(4, 3, 6, 2, 'T'); g.set(5, 6, 'k'); g.set(8, 6, 'k');
  g.rect(14, 9, 7, 6, 'r');
  g.disc(17.5, 6, 2.8, 's'); g.rect(15, 3, 6, 2, 'K'); g.set(16, 6, 'k'); g.set(19, 6, 'k');
  g.rect(6, 10, 12, 8, 'M'); g.rect(7, 11, 10, 6, 'g'); g.rect(11, 13, 2, 2, 'w');
  g.rect(4, 18, 16, 3, 'l'); g.hl(4, 20, 16, 'g');
};
ART.optimize = g => {
  g.str(5, 12, `
    ..r
    .rr
    rrr
    rrr`);
  g.str(16, 12, `
    r..
    rr.
    rrr
    rrr`);
  g.ell(12, 9, 4, 8, 'w');
  g.recolor((c, x, y) => (c === 'w' && y <= 4 ? 'r' : c === 'w' && x >= 14 ? 'l' : undefined));
  g.disc(12, 8.5, 2, 'c'); g.set(11, 7, 'w');
  g.str(9, 17, `
    oooooo
    .oyyo.
    .oyyo.
    ..yy..
    ..y...`);
};
ART.lb = g => {
  g.vl(4, 6, 6, 'M'); g.vl(19, 6, 6, 'M');
  g.rect(11, 4, 2, 15, 'Y');
  g.rect(7, 19, 10, 2, 'Y');
  g.rect(3, 4, 18, 2, 'Y'); g.hl(3, 4, 18, 'y');
  g.disc(12, 3, 1.6, 'y');
  g.rect(1, 12, 8, 2, 'y'); g.rect(15, 12, 8, 2, 'y');
  server(g, 2, 7); server(g, 17, 7);
};
ART.pentest = g => {
  g.rect(5, 12, 14, 8, 'K'); g.rect(6, 13, 12, 6, 'c');
  g.rect(3, 20, 18, 2, 'l');
  g.str(9, 14, `
    .....e
    ....ee
    e..ee.
    ee.e..
    .ee...`);
  g.ell(12, 9.5, 9, 1.8, 'w');
  g.rect(7, 3, 10, 6, 'w'); g.rect(7, 6, 10, 2, 'K'); g.vl(16, 3, 3, 'l');
};
ART.hackathon = g => {
  g.rect(2, 8, 13, 10, 'K'); g.rect(3, 9, 11, 8, 'B');
  g.hl(4, 11, 6, 'e'); g.hl(5, 13, 7, 'y'); g.hl(4, 15, 5, 'c');
  g.rect(1, 18, 15, 3, 'l'); g.hl(1, 20, 15, 'g');
  g.disc(17.5, 7.5, 5, 'r'); g.disc(17.5, 7.5, 3.8, 'w');
  g.rect(17, 1, 2, 2, 'r');
  g.vl(17, 5, 3, 'k'); g.hl(17, 7, 3, 'k');
};
ART.debug = g => {
  g.line(8, 11, 5, 9, 'K'); g.line(8, 13, 5, 13, 'K'); g.line(8, 15, 5, 17, 'K');
  g.line(15, 11, 18, 9, 'K'); g.line(15, 13, 18, 13, 'K'); g.line(15, 15, 18, 17, 'K');
  g.line(11, 6, 9, 3, 'K'); g.line(12, 6, 14, 3, 'K');
  g.ell(11.5, 13, 4, 5, 'e'); g.vl(11, 9, 9, 'E');
  g.disc(11.5, 7.5, 2.2, 'K');
  g.ring(12, 12, 10.5, 2.4, 'r');
  g.thick(5, 5, 18, 18, 'r', 3);
};
ART.ctrlz = g => {
  g.arc(12, 13, 7.5, 3, 'b', 180, 360);
  g.str(1, 13, `
    bbbbbbb
    .bbbbb.
    ..bbb..
    ...b...`);
  g.recolor((c, x) => (c === 'b' && x >= 15 ? 'B' : undefined));
  g.rect(14, 15, 9, 8, 'l'); g.rect(15, 15, 7, 6, 'w'); g.text(17, 16, 'Z', 'K');
};
ART.search = g => {
  g.rect(1, 4, 22, 8, 'w'); g.hl(1, 11, 22, 'l');
  g.rect(3, 7, 9, 2, 'l');
  g.disc(17.5, 7.5, 2.6, 'B'); g.disc(17.5, 7.5, 1.4, 'w'); g.set(20, 10, 'B'); g.set(21, 10, 'B');
  g.rect(2, 14, 12, 2, 'b'); g.hl(2, 17, 18, 'g');
  g.rect(2, 19, 9, 2, 'b'); g.hl(13, 20, 7, 'g');
};
ART.opensource = g => {
  g.str(1, 5, `
    ....ee
    ...ee.
    ..ee..
    .ee...
    ee....
    .ee...
    ..ee..
    ...ee.
    ....ee`);
  g.str(17, 5, `
    ee....
    .ee...
    ..ee..
    ...ee.
    ....ee
    ...ee.
    ..ee..
    .ee...
    ee....`);
  g.thick(13, 4, 10, 14, 'E', 2);
  g.str(8, 17, `
    .rr.rr.
    rrrrrrr
    .rrrrr.
    ..rrr..
    ...r...`);
};
ART.ups = g => {
  g.rect(6, 4, 12, 18, 'K');
  g.rect(9, 2, 6, 2, 'M');
  [17, 13].forEach(y => g.rect(8, y, 8, 3, 'e'));
  bolt(g, 10, 5);
};

/* ===== 「コンピュータの父」シリーズ ===== */
// アラン・チューリング：状態遷移図とテープを書いた黒板
ART.alan = g => {
  g.rect(1, 2, 22, 16, 't'); g.hl(1, 2, 22, 'T'); g.vl(22, 2, 16, 'T'); g.hl(1, 17, 22, 'T');
  g.rect(2, 3, 20, 14, 'E');
  g.ring(6.5, 6.5, 3, 1, 'w'); g.ring(17, 6.5, 3, 1, 'w'); g.ring(17, 6.5, 1.6, 0.7, 'w');
  arrowR(g, 10, 6, 4, 'w');
  g.rect(3, 12, 18, 3, 'w');
  [6, 9, 12, 15, 18].forEach(x => g.vl(x, 12, 3, 'l'));
  [[4, 'K'], [7, 'K'], [13, 'K'], [16, 'K']].forEach(([x, c]) => g.rect(x, 13, 1, 1, c));
  g.rect(10, 13, 2, 1, 'R');
  g.hl(10, 10, 2, 'y'); g.set(10, 11, 'y'); g.set(11, 11, 'y');
  g.hl(3, 18, 18, 'T'); g.rect(6, 18, 3, 1, 'w');
};
// ジョン・フォン・ノイマン：ノイマン型の設計図（青焼き）
ART.neumann = g => {
  g.rect(1, 1, 22, 22, 'B');
  for (let i = 5; i < 23; i += 6) { g.vl(i, 1, 22, 'b'); g.hl(1, i, 22, 'b'); }
  g.rect(3, 4, 7, 7, 'w'); g.rect(4, 5, 5, 5, 'B'); g.rect(5, 6, 3, 3, 'y');
  g.rect(14, 3, 7, 13, 'w'); g.rect(15, 4, 5, 11, 'B');
  for (let y = 5; y <= 13; y += 2) g.hl(15, y, 5, 'u');
  arrowR(g, 10, 6, 4, 'y'); arrowL(g, 10, 9, 4, 'y');
  g.vl(6, 11, 4, 'y'); g.set(5, 12, 'y'); g.set(7, 12, 'y');
  g.rect(3, 15, 7, 6, 'w'); g.rect(4, 16, 5, 4, 'B'); g.hl(5, 17, 3, 'u'); g.hl(5, 19, 3, 'u');
};
ART.enigma = g => {
  g.rect(1, 9, 22, 13, 't'); g.hl(1, 9, 22, 'T'); g.vl(22, 9, 13, 'T'); g.hl(1, 21, 22, 'T');
  g.rect(6, 4, 12, 5, 'K');
  [7, 11, 15].forEach(x => { g.rect(x, 2, 2, 6, 'm'); g.vl(x + 1, 2, 6, 'M'); g.set(x, 3, 'w'); g.set(x, 5, 'w'); });
  for (let x = 3; x <= 19; x += 4) g.rect(x, 11, 2, 2, x === 11 ? 'y' : 'l');
  for (let x = 3; x <= 19; x += 4) { g.rect(x, 15, 2, 2, 'K'); g.set(x, 15, 'w'); }
  for (let x = 5; x <= 17; x += 4) { g.rect(x, 18, 2, 2, 'K'); g.set(x, 18, 'w'); }
};
ART.bombe = g => {
  g.rect(1, 1, 22, 22, 'K'); g.hl(1, 1, 22, 'g');
  const cols = ['r', 'e', 'y', 'b'];
  [5, 11.5, 18].forEach((cy, row) => [4.5, 9.5, 14.5, 19.5].forEach((cx, i) => {
    g.disc(cx, cy, 2.3, 'M'); g.ring(cx, cy, 2.3, 0.9, cols[(i + row) % 4]); g.set(Math.floor(cx), Math.floor(cy), 'w');
  }));
};
ART.colossus = g => {
  g.rect(1, 2, 15, 20, 'K'); g.hl(1, 2, 15, 'g');
  for (let row = 0; row < 4; row++) for (let i = 0; i < 4; i++) {
    const x = 2 + i * 3 + (i > 1 ? 1 : 0), y = 4 + row * 4 + (row > 1 ? 1 : 0);
    g.rect(x, y, 2, 3, 'u'); g.set(x, y, 'o'); g.set(x + 1, y, 'y');
  }
  g.ring(19.5, 5.5, 3.4, 1.2, 'l'); g.disc(19.5, 5.5, 1, 'M');
  g.rect(18, 9, 4, 13, 'w');
  for (let y = 10; y < 21; y += 2) { g.set(19, y, 'K'); if (y % 4 === 2) g.set(20, y, 'K'); }
};
ART.ace = g => {
  g.text(7, 1, 'ACE', 'Y');
  g.rect(2, 7, 20, 15, 'M'); g.hl(2, 7, 20, 'm');
  g.disc(7, 12.5, 3.3, 'K'); g.disc(7, 12.5, 2.3, 'E'); g.hl(5, 13, 5, 'f'); g.set(6, 12, 'f'); g.set(8, 14, 'f');
  for (let x = 12; x <= 20; x += 2) g.set(x, 10, (x / 2) % 2 ? 'y' : 'r');
  for (let x = 12; x <= 20; x += 2) { g.vl(x, 12, 2, 'w'); g.set(x, 14, 'K'); }
  for (let x = 4; x <= 19; x += 3) g.rect(x, 18, 2, 2, 'l');
};
// 停止性問題：「止まれ」の標識に「？」
ART.halting = g => {
  for (let y = 2; y <= 17; y++) { const h = (17.5 - y) * 0.66; g.hl(Math.round(12 - h), y, Math.round(h * 2), 'w'); }
  for (let y = 3; y <= 15; y++) { const h = (15.6 - y) * 0.6; g.hl(Math.round(12 - h), y, Math.round(h * 2), 'r'); }
  g.str(10, 4, `
    .www.
    w...w
    ...w.
    ..w..
    .....
    ..w..`);
  g.rect(11, 18, 2, 5, 'M');
};
ART.eliza = g => {
  g.rect(1, 2, 15, 8, 'w'); g.str(3, 10, `
    ww
    w.`);
  [4, 7, 10].forEach(x => g.rect(x, 5, 2, 2, 'g'));
  g.rect(8, 12, 15, 8, 'v'); g.str(18, 20, `
    vv
    .v`);
  g.str(13, 13, `
    .PPP.
    P...P
    ...P.
    ..P..
    .....
    ..P..`);
};
ART.turtest = g => {
  g.disc(5.5, 8.5, 3.3, 's'); g.rect(3, 4, 6, 2, 'T'); g.set(4, 8, 'k'); g.set(7, 8, 'k');
  g.rect(2, 13, 8, 8, 'b');
  g.rect(15, 6, 7, 6, 'm'); g.hl(15, 11, 7, 'M'); g.rect(16, 8, 2, 1, 'c'); g.rect(19, 8, 2, 1, 'c');
  g.vl(18, 3, 3, 'M'); g.set(18, 2, 'r');
  g.rect(14, 13, 9, 8, 'M');
  g.rect(11, 6, 2, 17, 'T');
  g.str(9, 0, `
    .yyy.
    y...y
    ...y.
    ..y..`);
};
ART.codebreak = g => {
  g.rect(1, 1, 17, 20, 'w'); g.vl(17, 1, 20, 'l'); g.hl(1, 20, 17, 'l');
  [3, 6].forEach(y => { for (let x = 3; x < 16; x += 3) g.hl(x, y, 2, 'g'); });
  g.disc(10, 13, 6.5, 'u');
  g.text(5, 11, 'ABC', 'R');
  g.ring(10, 13, 6.5, 1, 'M');
  g.thick(15, 18, 19, 22, 'T', 2);
};
ART.punch = g => {
  g.rect(1, 5, 22, 14, 's');
  for (let i = 0; i < 4; i++) for (let j = 0; j <= 3 - i; j++) g.set(1 + j, 5 + i, null);
  for (let y = 7; y <= 17; y += 2) for (let x = 3; x <= 21; x += 2) g.set(x, y, 'S');
  [[3, 9], [5, 13], [7, 7], [9, 11], [11, 15], [13, 9], [15, 7], [17, 13], [19, 11], [21, 15], [5, 7], [13, 15], [17, 9], [9, 15], [19, 7]]
    .forEach(([x, y]) => { g.set(x, y, 'K'); g.set(x, y + 1, 'K'); });
};
ART.diffeng = g => {
  g.rect(1, 2, 18, 2, 'T'); g.rect(1, 20, 18, 2, 'T');
  [3, 9, 15].forEach(x => {
    g.vl(x + 1, 4, 16, 'M');
    for (let k = 0; k < 5; k++) { const y = 5 + k * 3; g.rect(x - 1, y, 5, 2, 'y'); g.hl(x - 1, y + 1, 5, 'Y'); }
  });
  g.ring(21, 11, 2.1, 0.9, 'M'); g.rect(21, 6, 2, 3, 't'); g.vl(21, 9, 1, 'M');
};
ART.analytic = g => {
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; g.rect(Math.round(7.5 + Math.cos(a) * 6) - 1, Math.round(8.5 + Math.sin(a) * 6) - 1, 2, 2, 'Y'); }
  g.disc(7.5, 8.5, 5.4, 'y'); g.disc(7.5, 8.5, 2.2, 'Y'); g.disc(7.5, 8.5, 1, 'T');
  [16, 19, 22].forEach(x => { g.vl(x, 1, 15, 'M'); for (let k = 0; k < 5; k++) g.hl(x - 1, 2 + k * 3, 3, 'y'); });
  for (let i = 0; i < 4; i++) { const x = 1 + i * 6; g.rect(x, 18, 5, 4, 's'); g.set(x + 1, 19, 'K'); g.set(x + 3, 20, 'K'); }
};
ART.stored = g => {
  g.rect(2, 1, 20, 22, 'l'); g.vl(21, 1, 22, 'g'); g.hl(2, 22, 20, 'g');
  [7, 16].forEach(cx => { g.disc(cx, 6.5, 4, 'K'); g.ring(cx, 6.5, 4, 1, 'M'); g.disc(cx, 6.5, 1.3, 'm'); g.set(cx - 2, 5, 'g'); g.set(cx + 1, 8, 'g'); });
  g.hl(7, 11, 10, 'T');
  g.rect(4, 13, 16, 8, 'K');
  [['y', 5], ['r', 8], ['e', 11], ['y', 14], ['e', 17]].forEach(([c, x]) => g.rect(x, 15, 2, 1, c));
  [['e', 5], ['y', 8], ['y', 11], ['r', 14], ['y', 17]].forEach(([c, x]) => g.rect(x, 18, 2, 1, c));
};
ART.eniac = g => {
  [1, 9, 17].forEach(x => { g.rect(x, 2, 6, 20, 'K'); g.hl(x, 2, 6, 'g'); });
  [1, 9, 17].forEach(x => { for (let y = 4; y <= 10; y += 2) for (let i = 0; i < 3; i++) g.set(x + 1 + i * 2, y, (x + y + i) % 3 ? 'y' : 'o'); });
  [1, 9, 17].forEach(x => { for (let y = 13; y <= 19; y += 3) for (let i = 0; i < 3; i++) g.set(x + 1 + i * 2, y, 'g'); });
  g.line(2, 13, 10, 16, 'r'); g.line(4, 19, 12, 13, 'y'); g.line(12, 19, 20, 13, 'e'); g.line(14, 16, 21, 19, 'c');
};
ART.montecarlo = g => {
  g.rect(1, 1, 17, 17, 'w');
  g.arc(1, 18, 17, 1, 'K', 270, 360);
  [[4, 4], [8, 3], [13, 2], [15, 6], [16, 10], [15, 13], [11, 8], [6, 9], [3, 13], [9, 14], [13, 15], [16, 16], [5, 16], [12, 5], [2, 7], [10, 11], [7, 12], [16, 2]]
    .forEach(([x, y]) => g.set(x, y, Math.hypot(x + 0.5 - 1, y + 0.5 - 18) < 16.4 ? 'r' : 'b'));
  g.rect(16, 15, 7, 7, 'k'); g.rect(17, 16, 5, 5, 'w'); g.set(18, 17, 'K'); g.set(19, 18, 'K'); g.set(20, 19, 'K');
};
ART.minimax = g => {
  g.line(12, 5, 6, 10, 'K'); g.line(12, 5, 18, 10, 'K');
  g.line(6, 13, 3, 19, 'K'); g.line(6, 13, 9, 19, 'K'); g.line(18, 13, 15, 19, 'K'); g.line(18, 13, 21, 19, 'K');
  g.line(12, 5, 6, 10, 'y'); g.line(6, 13, 9, 19, 'y');
  g.str(9, 1, `
    ...r...
    ..rrr..
    .rrrrr.
    rrrrrrr`);
  [3, 15].forEach(x => g.str(x, 10, `
    bbbbbbb
    .bbbbb.
    ..bbb..
    ...b...`));
  [[2, 'e'], [8, 'y'], [14, 'r'], [20, 'e']].forEach(([x, c]) => g.rect(x, 19, 3, 3, c));
};
ART.gametheory = g => {
  g.rect(2, 2, 20, 20, 'w');
  g.vl(12, 2, 20, 'K'); g.hl(2, 12, 20, 'K');
  g.text(4, 5, '3', 'r'); g.text(8, 5, '3', 'b');
  g.text(14, 5, '0', 'r'); g.text(18, 5, '5', 'b');
  g.text(4, 15, '5', 'r'); g.text(8, 15, '0', 'b');
  g.text(14, 15, '1', 'r'); g.text(18, 15, '1', 'b');
};

/* ===== 「コンピュータの父」シリーズ：クロード・シャノン ===== */
// クロード・シャノン：1948年の論文「通信の数学的理論」と、その図（情報源→送信機→雑音の入る通信路→受信機→受信者）
ART.shannon = g => {
  g.rect(1, 2, 22, 20, 'w'); g.hl(1, 21, 22, 'l'); g.vl(22, 2, 20, 'l');
  [[2, 'b'], [7, 'e'], [14, 'e'], [19, 'b']].forEach(([x, c]) => { g.rect(x, 5, 3, 4, c); g.hl(x, 5, 3, c === 'b' ? 'u' : 'f'); });
  arrowR(g, 5, 6, 2, 'K'); arrowR(g, 17, 6, 2, 'K');
  [[10, 6], [11, 5], [12, 7], [13, 6]].forEach(([x, y]) => g.set(x, y, 'r'));
  g.vl(11, 9, 2, 'R'); g.vl(12, 9, 2, 'R'); g.set(10, 10, 'R'); g.set(13, 10, 'R');
  g.hl(3, 13, 7, 'l'); g.hl(13, 13, 8, 'l');
  g.text(4, 15, '1948', 'K');
  g.hl(3, 3, 4, 'l');
};
// ビット：「1」の金のコインと「0」の銀のコイン
ART.bit = g => {
  g.disc(17.5, 7.5, 5.5, 'M'); g.disc(17.5, 7.5, 4.5, 'm'); g.text(17, 5, '0', 'M'); g.set(15, 4, 'w');
  g.disc(9, 14, 7.5, 'Y'); g.disc(9, 14, 6.5, 'y'); g.ring(9, 14, 5.2, 1, 'Y');
  g.text(8, 12, '1', 'O'); g.set(5, 10, 'w'); g.set(6, 9, 'w');
};
// パリティビット：1011 のあとに足したパリティ「1」（1の数が偶数になる）
ART.parity = g => {
  g.rect(1, 6, 22, 10, 'w'); g.hl(1, 15, 22, 'l');
  ['1', '0', '1', '1'].forEach((d, i) => g.text(3 + i * 4, 8, d, 'K'));
  g.vl(17, 7, 8, 'l');
  g.rect(18, 7, 4, 8, 'y'); g.text(19, 8, '1', 'R');
  g.thick(14, 18, 16, 20, 'E', 2); g.thick(16, 20, 21, 15 + 2, 'E', 2);
};
// ハミング符号：3つの円（パリティ）でかこんだ7ビット。反転した1ビットを見つけて直す
ART.hamming = g => {
  g.rect(1, 1, 22, 22, 'w');
  g.ring(9, 9.5, 6.5, 1, 'r'); g.ring(15, 9.5, 6.5, 1, 'b'); g.ring(12, 14.5, 6.5, 1, 'E');
  [[11, 11, 'K'], [11, 5, 'K'], [7, 13, 'l'], [15, 13, 'K'], [5, 7, 'l'], [17, 7, 'K']].forEach(([x, y, c]) => g.rect(x, y, 2, 2, c));
  g.rect(11, 17, 2, 2, 'R'); g.set(10, 16, 'y'); g.set(13, 16, 'y'); g.set(10, 19, 'y'); g.set(13, 19, 'y');
};
// LDPC符号：上の丸（ビット）と下の四角（パリティのチェック）を、少しの線でつないだ図
ART.ldpc = g => {
  g.rect(1, 1, 22, 22, 'K');
  const vars = [3, 7, 11, 15, 19], checks = [5, 12, 19];
  const links = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 3], [2, 2], [2, 3], [2, 4]];
  links.forEach(([ci, vi]) => g.line(checks[ci], 17, vars[vi] + 0.5, 6, 'C'));
  vars.forEach((x, i) => { g.rect(x, 4, 2, 2, i === 2 ? 'y' : 'u'); });
  checks.forEach(x => { g.rect(x - 1, 17, 3, 3, 'c'); g.set(x, 18, 'w'); });
};
// リレー回路：電磁石（コイル）がアームを引きよせて、接点がつながる
ART.relay = g => {
  g.rect(1, 19, 22, 3, 'K'); g.hl(1, 19, 22, 'g');
  g.rect(4, 8, 5, 11, 'M');
  for (let y = 9; y <= 17; y += 2) { g.hl(3, y, 7, 'o'); g.hl(3, y + 1, 7, 'O'); }
  g.rect(18, 6, 3, 13, 'M'); g.vl(18, 6, 13, 'm');
  g.thick(4, 6, 17, 6, 'm', 2); g.rect(15, 8, 2, 1, 'y');
  g.rect(13, 11, 5, 2, 'g'); g.rect(15, 10, 2, 1, 'y');
  g.set(14, 9, 'w'); g.set(17, 9, 'y'); g.set(13, 8, 'y');
};
// テセウス：迷路と、道を覚えた機械のネズミ。通った道（緑）とゴール（チーズ）
ART.theseus = g => {
  g.rect(1, 1, 22, 22, 'w');
  g.hl(1, 1, 22, 'K'); g.hl(1, 22, 22, 'K'); g.vl(1, 1, 22, 'K'); g.vl(22, 1, 22, 'K');
  g.hl(1, 7, 16, 'K'); g.hl(7, 12, 15, 'K'); g.hl(1, 17, 16, 'K');
  for (let x = 13; x <= 19; x += 2) g.set(x, 4, 'e');
  for (let y = 6; y <= 9; y += 2) g.set(19, y, 'e');
  for (let x = 4; x <= 17; x += 2) g.set(x, 9, 'e');
  for (let y = 11; y <= 13; y += 2) g.set(4, y, 'e');
  for (let x = 6; x <= 19; x += 2) g.set(x, 14, 'e');
  for (let y = 16; y <= 18; y += 2) g.set(19, y, 'e');
  for (let x = 9; x <= 17; x += 2) g.set(x, 19, 'e');
  g.rect(3, 18, 4, 3, 'y'); g.hl(3, 18, 4, 'Y'); g.set(4, 19, 'Y');
  g.ell(6.5, 4.5, 3.6, 2.1, 'M'); g.hl(4, 3, 4, 'm'); g.disc(10.5, 4, 1.8, 'M');
  g.set(9, 2, 'n'); g.set(10, 2, 'n'); g.set(11, 4, 'k'); g.set(12, 4, 'q');
  g.line(3, 5, 2, 6, 'K'); g.set(12, 3, 'O'); g.set(12, 5, 'O');
};
// ワンタイムパッド：でたらめな数字が書かれたメモ帳。鍵は1回だけ
ART.otp = g => {
  g.rect(3, 3, 16, 19, 'w'); g.hl(3, 21, 16, 'l');
  g.rect(3, 3, 16, 2, 'M'); for (let x = 5; x <= 17; x += 3) g.set(x, 3, 'K');
  const rows = ['101101101', '011010110', '110110011', '010011101'];
  rows.forEach((r, j) => [...r].forEach((b, i) => { if (b === '1') g.rect(5 + i * 1.5, 7 + j * 3, 1, 2, 'K'); }));
  g.disc(17.5, 17.5, 4.5, 'r'); g.disc(17.5, 17.5, 3.5, 'R'); g.text(17, 15, '1', 'w');
};
// データ圧縮：両がわから押しちぢめたZIPファイル（ファスナーつき）
ART.compress = g => {
  g.rect(6, 2, 12, 20, 'y'); g.vl(17, 2, 20, 'Y'); g.hl(6, 21, 12, 'Y');
  for (let y = 2; y <= 14; y++) { g.set(11, y, y % 2 ? 'K' : 'm'); g.set(12, y, y % 2 ? 'm' : 'K'); }
  g.rect(10, 15, 4, 5, 'M'); g.rect(11, 17, 2, 2, 'K');
  arrowR(g, 0, 11, 5, 'r'); arrowL(g, 19, 11, 5, 'r');
};
// 究極の機械：スイッチを入れると、箱から手が出てきてスイッチを切る
ART.ultimate = g => {
  g.rect(2, 13, 20, 9, 't'); g.hl(2, 21, 20, 'T'); g.vl(21, 13, 9, 'T');
  g.rect(3, 11, 19, 2, 'S'); g.hl(3, 11, 19, 's');
  g.rect(13, 11, 6, 2, 'K');
  g.thick(18, 11, 21, 5, 'T', 2);
  g.rect(4, 9, 5, 2, 'K'); g.thick(6, 9, 4, 5, 'm', 2); g.rect(3, 4, 2, 2, 'r');
  g.thick(15, 11, 11, 7, 'g', 3);
  g.rect(7, 5, 4, 3, 'w'); g.hl(5, 6, 2, 'w'); g.set(10, 7, 'l'); g.set(8, 7, 'l');
};

/* ===== 「プログラミングの先駆者」シリーズ ===== */
// まるい矢印（ループ）：中心 (cx, cy)・半径 r。右上にすきまと矢じり
const loopArrow = (g, cx, cy, r, w, c) => {
  g.ring(cx, cy, r, w, c);
  const gx = Math.round(cx + r * 0.55), gy = Math.round(cy - r * 0.85);
  g.rect(gx - 1, gy - 1, 3, w + 2, null);
  g.set(gx - 2, gy - 2, c); g.set(gx - 2, gy + w + 1, c); g.set(gx - 3, gy, c); g.set(gx - 3, gy + w - 1, c);
};
// エイダ・ラブレス：ノートGの表を書いた、開いたノートと羽根ペン
ART.ada = g => {
  g.rect(1, 6, 11, 15, 'w'); g.rect(12, 6, 11, 15, 'w'); g.vl(11, 6, 15, 'l'); g.vl(12, 6, 15, 'l'); g.hl(1, 20, 22, 'l');
  for (let y = 9; y <= 17; y += 2) g.hl(2, y, 9, 'l');
  g.vl(5, 8, 10, 'l'); g.vl(8, 8, 10, 'l');
  [[3, 10], [6, 10], [9, 12], [3, 14], [6, 16], [9, 16], [3, 18]].forEach(([x, y]) => g.set(x, y, 'K'));
  g.text(13, 8, 'G', 'p'); g.hl(13, 15, 6, 'l'); g.hl(13, 17, 7, 'l');
  g.thick(22, 1, 17, 11, 'v', 2); g.line(23, 1, 18, 11, 'p'); g.set(16, 13, 'K'); g.set(17, 12, 'K');
};
// ノートG：ベルヌーイ数を計算する手順の表と、くり返しの矢印
ART.noteg = g => {
  g.rect(2, 2, 19, 20, 'w'); g.hl(2, 21, 19, 'l'); g.vl(20, 2, 20, 'l');
  g.rect(3, 3, 17, 2, 'v');
  for (let y = 7; y <= 19; y += 3) g.hl(3, y, 17, 'l');
  for (let x = 7; x <= 15; x += 4) g.vl(x, 5, 16, 'l');
  [[4, 6], [9, 6], [13, 9], [4, 9], [9, 12], [4, 15], [13, 15]].forEach(([x, y]) => g.hl(x, y, 2, 'K'));
  loopArrow(g, 16, 16, 5, 2, 'r');
};
// 二重ループ：外のループ（青）の中に、内のループ（緑）
ART.nestloop = g => {
  loopArrow(g, 12, 12, 10, 2, 'b');
  loopArrow(g, 12, 12, 5.5, 2, 'E');
  g.rect(11, 11, 2, 2, 'y');
};
// ジャカード織機：上のパンチカードの列と、交互に織った市松模様
ART.jacquard = g => {
  g.rect(2, 3, 20, 3, 'w'); for (let x = 3; x <= 20; x += 2) g.set(x, 4, x % 4 === 1 ? 'K' : 'l');
  g.vl(1, 2, 20, 't'); g.vl(22, 2, 20, 't'); g.hl(1, 2, 22, 'T');
  for (let x = 4; x <= 19; x += 3) g.vl(x, 6, 4, 'm');
  for (let y = 10; y <= 19; y++) for (let x = 3; x <= 20; x++) g.set(x, y, ((x >> 1) + (y >> 1)) % 2 ? 'r' : 'w');
  g.hl(2, 20, 20, 'T'); g.hl(2, 21, 20, 't');
};
// 自動作曲：五線譜の音符と、きらきら
ART.compose = g => {
  g.rect(1, 4, 22, 15, 'w');
  for (let y = 7; y <= 15; y += 2) g.hl(2, y, 20, 'l');
  g.disc(6, 14, 1.8, 'K'); g.vl(7, 7, 7, 'K');
  g.disc(12, 12, 1.8, 'K'); g.vl(13, 5, 7, 'K');
  g.thick(7, 7, 13, 5, 'K', 2);
  g.disc(18, 10, 1.8, 'p'); g.vl(19, 4, 6, 'p'); g.set(20, 5, 'p'); g.set(21, 6, 'p');
  g.set(3, 3, 'y'); g.set(21, 17, 'y'); g.set(16, 17, 'y');
};
// Ada言語：まちがいを動かす前に止める、たて（型チェック）
ART.adalang = g => {
  g.rect(4, 3, 16, 10, 'b'); for (let y = 13; y <= 20; y++) { const w = Math.round(8 - (y - 13) * 1.05); g.hl(12 - w, y, w * 2, 'b'); }
  g.hl(4, 3, 16, 'u'); g.vl(4, 3, 10, 'u');
  g.thick(8, 11, 11, 14, 'w', 2); g.thick(11, 14, 17, 7, 'w', 2);
  g.set(19, 1, 'y'); g.set(2, 6, 'y');
};
// ラブレスの反論：アイデア（電球）に、ななめの線（機械は自分からは生み出さない）
ART.lovelace = g => {
  g.disc(12, 9, 6.5, 'y'); g.disc(10.5, 7.5, 2, 'w');
  g.rect(9, 15, 6, 2, 'm'); g.rect(9, 17, 6, 2, 'M'); g.rect(10, 19, 4, 2, 'K');
  g.thick(4, 20, 20, 3, 'r', 3);
};
// 詩的科学：羽根ペンと、波の線（数式のグラフ）と星
ART.poetical = g => {
  for (let x = 2; x <= 15; x++) g.set(x, Math.round(16 + 3 * Math.sin((x - 2) / 2.2)), 'u');
  g.thick(21, 2, 14, 15, 'v', 3); g.line(22, 2, 15, 15, 'p'); g.set(13, 17, 'K'); g.set(14, 16, 'K');
  g.set(4, 5, 'y'); g.set(3, 4, 'y'); g.set(5, 4, 'y'); g.set(4, 3, 'y'); g.set(4, 4, 'Y');
  g.set(10, 8, 'y'); g.set(16, 20, 'y');
};
// グレース・ホッパー：1947年の作業日誌。テープで貼られた本物のバグ（蛾）
ART.hopper = g => {
  g.rect(2, 2, 20, 20, 'w'); g.hl(2, 21, 20, 'l'); g.vl(21, 2, 20, 'l');
  for (let y = 4; y <= 8; y += 2) g.hl(4, y, 15, 'l');
  g.rect(5, 10, 14, 5, 'm'); g.rect(6, 10, 12, 5, 'l');
  g.ell(9, 12.5, 3, 2, 't'); g.ell(15, 12.5, 3, 2, 't'); g.vl(12, 10, 5, 'K'); g.set(11, 9, 'K'); g.set(13, 9, 'K');
  g.text(4, 16, '9/9', 'K'); g.hl(16, 18, 4, 'l');
};
// 機械語：黒い画面に 0 と 1 の命令
ART.machinecode = g => {
  g.rect(1, 2, 22, 20, 'K'); g.rect(2, 3, 20, 18, 'k');
  ['1011', '0110', '1101'].forEach((r, j) => g.text(4, 4 + j * 6, r, 'e'));
  g.rect(20, 16, 1, 3, 'E');
};
// FLOW-MATIC：英語に近い言葉で書いたプログラム（ADD・MOVE）
ART.flowmatic = g => {
  g.rect(2, 2, 20, 20, 'w'); g.hl(2, 21, 20, 'l'); g.vl(21, 2, 20, 'l');
  g.text(4, 4, 'ADD', 'b'); g.text(4, 11, 'MOVE', 'b');
  g.hl(4, 18, 8, 'l'); g.hl(14, 18, 5, 'l');
  arrowR(g, 15, 6, 5, 'E');
};
// COBOL：銀行の大きなシステムで今も動く、緑の画面
ART.cobol = g => {
  g.rect(1, 2, 22, 16, 'M'); g.rect(2, 3, 20, 14, 'K');
  g.text(3, 5, 'COBOL', 'e');
  g.hl(4, 12, 9, 'E'); g.hl(4, 14, 6, 'E'); g.rect(11, 14, 2, 1, 'e');
  g.rect(9, 18, 6, 2, 'M'); g.rect(5, 20, 14, 2, 'm');
};
// ハーバード・マークI：長い計算機。ならんだ歯車のダイヤルと、紙テープ
ART.mark1 = g => {
  g.rect(1, 4, 22, 14, 'm'); g.hl(1, 4, 22, 'w'); g.rect(1, 17, 22, 2, 'M');
  for (let x = 2; x <= 20; x += 6) g.rect(x, 6, 5, 9, 'u');
  for (let x = 3; x <= 21; x += 2) for (let y = 7; y <= 13; y += 3) g.set(x, y, 'K');
  g.rect(16, 19, 4, 4, 'w'); g.set(17, 20, 'K'); g.set(18, 22, 'K');
};
// 本物のバグ：はねを広げた蛾
ART.moth = g => {
  g.ell(7, 10, 5.5, 4.5, 't'); g.ell(17, 10, 5.5, 4.5, 't');
  g.ell(8, 17, 4, 3, 'T'); g.ell(16, 17, 4, 3, 'T');
  g.disc(6, 10, 1.6, 'S'); g.disc(18, 10, 1.6, 'S');
  g.rect(11, 7, 2, 13, 'K');
  g.line(11, 6, 8, 2, 'K'); g.line(12, 6, 15, 2, 'K');
};
// ナノ秒の針金：約30cmの銅線と、その上を走る信号
ART.nanosec = g => {
  g.text(3, 2, '30', 'K'); g.text(13, 2, 'CM', 'K');
  g.rect(1, 9, 22, 3, 'O'); g.hl(1, 9, 22, 'o');
  g.disc(14, 10, 2.6, 'y'); g.set(14, 10, 'w');
  g.rect(1, 15, 22, 4, 'y'); for (let x = 1; x <= 22; x += 3) g.vl(x, 15, x % 6 === 1 ? 3 : 2, 'K');
};
// 作業日誌：とじたノート（緑の表紙）とえんぴつ
ART.logbook = g => {
  g.rect(3, 2, 15, 20, 'E'); g.rect(4, 3, 13, 18, 'e'); g.vl(3, 2, 20, 'K');
  g.rect(6, 6, 9, 4, 'w'); g.hl(7, 7, 7, 'l'); g.hl(7, 8, 5, 'l');
  g.thick(21, 4, 15, 19, 'y', 2); g.set(14, 20, 'K'); g.set(21, 3, 'n'); g.set(22, 3, 'n');
};

/* ===== 「遍在する計算機」シリーズ ===== */
// 電波の弧（右上に向かって3本）
const waves = (g, x, y, c) => { g.set(x + 1, y - 1, c); g.set(x + 2, y, c); g.set(x + 1, y - 3, c); g.set(x + 3, y - 2, c); g.set(x + 4, y, c); g.set(x + 1, y - 5, c); g.set(x + 3, y - 4, c); g.set(x + 5, y - 2, c); g.set(x + 6, y, c); };
// マーク・ワイザー：部屋の中のボード（大）・パッド（中）・タブ（小）が、電波でつながっている
ART.weiser = g => {
  g.rect(1, 1, 22, 15, 'l'); g.rect(1, 16, 22, 6, 't'); g.hl(1, 16, 22, 'T');
  g.rect(3, 3, 11, 8, 'k'); g.rect(4, 4, 9, 6, 'C'); g.line(5, 8, 8, 5, 'w'); g.line(8, 5, 11, 8, 'y');
  g.rect(14, 12, 6, 6, 'K'); g.rect(15, 13, 4, 4, 'u'); g.set(16, 14, 'w');
  g.rect(5, 15, 3, 4, 'K'); g.rect(6, 16, 1, 2, 'e');
  waves(g, 15, 9, 'o'); g.set(9, 13, 'o'); g.set(10, 14, 'o');
};
// パソコン：1人1台のデスクトップ
ART.pc = g => {
  g.rect(3, 2, 18, 13, 's'); g.rect(5, 4, 14, 9, 'B'); g.rect(6, 5, 12, 7, 'b'); g.hl(7, 6, 6, 'u'); g.hl(7, 8, 9, 'u'); g.hl(7, 10, 4, 'u');
  g.hl(3, 14, 18, 'S'); g.rect(10, 15, 4, 2, 'S');
  g.rect(2, 18, 20, 4, 's'); for (let x = 3; x <= 20; x += 2) { g.set(x, 19, 'S'); g.set(x + 1, 20, 'S'); }
};
// ユビキタス：人のまわりの、たくさんの小さなコンピュータ（点線でつながる）
ART.ubiq = g => {
  g.rect(0, 0, 24, 24, 'w');
  const dev = [[1, 1, 'b'], [19, 1, 'e'], [0, 10, 'y'], [20, 10, 'r'], [2, 19, 'p'], [18, 19, 'c']];
  dev.forEach(([x, y]) => { const n = 12; for (let i = 2; i < n - 2; i += 2) g.set(Math.round(x + 1.5 + (12 - x - 1.5) * i / n), Math.round(y + 1.5 + (12 - y - 1.5) * i / n), 'm'); });
  dev.forEach(([x, y, c]) => { g.rect(x, y, 4, 4, 'K'); g.rect(x + 1, y + 1, 2, 2, c); });
  g.disc(12, 7.5, 2.6, 'S'); g.rect(9, 11, 7, 6, 'o'); g.rect(10, 17, 2, 4, 'K'); g.rect(13, 17, 2, 4, 'K');
};
// タブ：手のひらサイズ
ART.tab = g => {
  g.vl(11, 1, 6, 'r'); g.vl(12, 1, 6, 'r');
  g.rect(7, 7, 10, 15, 'K'); g.rect(8, 8, 8, 9, 'c'); g.hl(9, 10, 5, 'w'); g.hl(9, 12, 3, 'w'); g.hl(9, 14, 4, 'w');
  for (let x = 8; x <= 14; x += 3) g.rect(x, 18, 2, 2, 'm');
};
// パッド：ノートサイズ（ペンつき）
ART.pad = g => {
  g.rect(3, 3, 16, 19, 'K'); g.rect(4, 4, 14, 16, 'w'); for (let y = 6; y <= 18; y += 3) g.hl(5, y, 12, 'u');
  g.line(6, 16, 10, 11, 'b'); g.line(10, 11, 13, 14, 'b');
  g.thick(21, 3, 18, 15, 'y', 2); g.set(17, 16, 'K');
};
// ボード：黒板サイズの大きな画面と、話し合う2人
ART.board = g => {
  g.rect(1, 2, 22, 13, 'K'); g.rect(2, 3, 20, 11, 'E'); g.line(4, 11, 9, 6, 'w'); g.line(9, 6, 13, 9, 'w'); g.line(13, 9, 19, 5, 'y'); g.rect(16, 10, 4, 2, 'w');
  g.vl(6, 15, 4, 'M'); g.vl(17, 15, 4, 'M');
  g.disc(4, 18, 1.6, 'S'); g.rect(3, 20, 3, 3, 'b'); g.disc(20, 18, 1.6, 'S'); g.rect(19, 20, 3, 3, 'r');
};
// センサー：まわりを見張る小さな部品（電波を出している）
ART.sensor = g => {
  g.rect(5, 10, 10, 10, 'E'); for (let y = 11; y <= 18; y += 2) { g.set(4, y, 'M'); g.set(15, y, 'M'); }
  g.disc(10, 15, 3, 'k'); g.disc(10, 15, 2, 'C'); g.set(9, 14, 'w');
  waves(g, 13, 8, 'c'); waves(g, 3, 7, 'c');
  g.rect(16, 19, 6, 2, 'g');
};
// カーム・テクノロジー：ネットワークの流れで静かにゆれる、天井からたれたひも
ART.calm = g => {
  g.rect(0, 0, 24, 24, 'v'); g.disc(12, 13, 9, 'w');
  g.rect(8, 0, 8, 2, 'T'); g.rect(11, 2, 2, 1, 'K');
  for (let y = 3; y <= 21; y++) { const x = Math.round(12 + 3 * Math.sin((y - 3) / 2.6)); g.set(x, y, 'r'); g.set(x + 1, y, 'R'); }
};
// TRON：「TRON」と書かれたチップと、のびる配線
ART.tronex = g => {
  for (let i = 3; i <= 19; i += 4) { g.vl(i + 1, 0, 4, 'Y'); g.vl(i + 1, 20, 4, 'Y'); g.hl(0, i + 1, 4, 'Y'); g.hl(20, i + 1, 4, 'Y'); }
  g.rect(4, 4, 16, 16, 'K'); g.rect(5, 5, 14, 14, 'k');
  g.text(5, 9, 'TR', 'r'); g.text(12, 9, 'ON', 'w');
  g.hl(6, 16, 12, 'R'); g.set(18, 6, 'y');
};
// 組込みシステム：電子レンジの中に、小さなコンピュータ
ART.embedded = g => {
  g.rect(1, 5, 22, 15, 'm'); g.hl(1, 5, 22, 'w'); g.rect(2, 7, 14, 11, 'K'); g.rect(3, 8, 12, 9, 'M'); g.disc(9, 13, 3, 'y');
  g.rect(17, 7, 5, 4, 'k'); g.text(17, 7, '88', 'e'); g.rect(18, 13, 3, 3, 'E'); g.set(19, 14, 'y');
  g.rect(3, 20, 3, 2, 'K'); g.rect(18, 20, 3, 2, 'K');
};
// リアルタイムOS：締め切りの時計と、間に合った旗
ART.rtos = g => {
  g.rect(10, 1, 4, 2, 'M'); g.disc(12, 12, 9, 'k'); g.disc(12, 12, 8, 'w');
  for (let a = 0; a < 12; a++) g.set(Math.round(12 + 6.8 * Math.sin(a * Math.PI / 6)), Math.round(12 - 6.8 * Math.cos(a * Math.PI / 6)), 'M');
  g.thick(12, 12, 12, 6, 'K', 1); g.thick(12, 12, 16, 14, 'r', 1); g.rect(11, 11, 2, 2, 'K');
  g.vl(19, 15, 8, 'T'); g.rect(20, 15, 3, 3, 'e');
};
// IoT：電球・家・車が、まん中につながる
ART.iot = g => {
  g.line(12, 12, 5, 5, 'C'); g.line(12, 12, 19, 5, 'C'); g.line(12, 12, 12, 20, 'C');
  g.disc(12, 12, 2.5, 'c'); g.set(12, 12, 'w');
  g.disc(5, 4, 2.6, 'y'); g.rect(4, 7, 3, 2, 'M');
  g.rect(16, 5, 6, 4, 'w'); g.line(15, 5, 19, 1, 'r'); g.line(19, 1, 22, 5, 'r'); g.rect(18, 7, 2, 2, 'T');
  g.rect(8, 18, 9, 3, 'b'); g.rect(10, 16, 5, 2, 'u'); g.set(9, 21, 'K'); g.set(15, 21, 'K');
};
// ICタグ：うずまきのアンテナと、小さなチップ
ART.ictag = g => {
  g.rect(2, 4, 20, 16, 'w');
  for (let k = 0; k < 4; k++) { const x0 = 4 + k * 2, y0 = 6 + k * 2, x1 = 19 - k * 2, y1 = 17 - k * 2; g.hl(x0, y0, x1 - x0 + 1, 'O'); g.hl(x0, y1, x1 - x0 + 1, 'O'); g.vl(x0, y0, y1 - y0 + 1, 'O'); g.vl(x1, y0, y1 - y0 + 1, 'O'); }
  g.rect(10, 10, 4, 4, 'k'); g.set(11, 11, 'm');
};
// 環境発電：小さな太陽電池と、まわりの光・振動から集めた電気
ART.harvest = g => {
  g.disc(5, 5, 3, 'y'); [[5, 0], [0, 5], [9, 1], [1, 9], [10, 5]].forEach(([x, y]) => g.set(x, y, 'Y'));
  g.rect(8, 11, 14, 9, 'B'); for (let x = 11; x <= 19; x += 4) g.vl(x, 11, 9, 'u'); g.hl(8, 15, 14, 'u');
  g.thick(4, 13, 7, 17, 'y', 2); g.thick(7, 17, 3, 20, 'y', 2);
  g.rect(13, 20, 4, 2, 'M');
};
// TRONハウス：家じゅうにコンピュータとセンサーがある家
ART.tronhouse = g => {
  g.thick(1, 11, 12, 2, 'r', 2); g.thick(12, 2, 23, 11, 'r', 2);
  g.rect(3, 11, 18, 11, 'w'); g.hl(3, 21, 18, 'l');
  [[5, 13], [15, 13]].forEach(([x, y]) => { g.rect(x, y, 4, 4, 'u'); g.set(x + 1, y + 1, 'w'); });
  g.rect(10, 15, 4, 7, 'T'); g.set(13, 18, 'y');
  [[12, 7], [4, 19], [20, 19], [7, 11], [17, 11]].forEach(([x, y]) => g.set(x, y, 'e'));
  g.set(12, 6, 'c');
};
// 落合陽一：鏡（銅鏡のようなまるい鏡）に映る、ピクセルの自然の景色（自然と計算機が溶け合う）
ART.ochiai = g => {
  g.disc(12, 11.5, 10.5, 'Y'); g.ring(12, 11.5, 10.5, 1, 'O');
  for (let y = 2; y <= 21; y++) for (let x = 2; x <= 22; x++) {
    const dx = x - 12, dy = y - 11.5;
    if (dx * dx + dy * dy > 8.4 * 8.4) continue;
    const ridge = 13 + Math.round(2.5 * Math.sin(x / 2.2) + (x > 13 ? -2 : 0));
    g.set(x, y, y >= ridge ? ((x + y) % 4 === 0 ? 'f' : 'e') : y >= 9 ? 'c' : 'u');
  }
  g.disc(15.5, 6.5, 1.6, 'y');
  [[6, 5], [9, 8], [18, 10], [7, 17], [16, 18]].forEach(([x, y]) => g.set(x, y, 'w'));
  g.rect(10, 21, 4, 2, 'O');
};
// デジタルネイチャー：葉がピクセル、根が配線の木
ART.dnature = g => {
  for (let y = 2; y <= 12; y++) for (let x = 3; x <= 20; x++) { const dx = (x - 11.5) / 9, dy = (y - 7.5) / 5.8; if (dx * dx + dy * dy <= 1) g.set(x, y, (x * 7 + y * 3) % 5 === 0 ? 'c' : (x + y) % 3 === 0 ? 'f' : 'e'); }
  g.rect(10, 12, 3, 6, 'T');
  g.hl(5, 19, 14, 'Y'); g.line(11, 17, 6, 19, 'Y'); g.line(12, 17, 17, 19, 'Y'); g.vl(5, 19, 3, 'Y'); g.vl(18, 19, 3, 'Y'); g.vl(11, 18, 4, 'Y');
  [[5, 21], [18, 21], [11, 21]].forEach(([x, y]) => g.set(x, y, 'y'));
};
// 音響浮揚：上下の超音波の装置のあいだに、浮かぶ小さな粒
ART.levitation = g => {
  g.rect(1, 4, 22, 16, 'B');
  for (let x = 1; x <= 20; x += 3) { g.rect(x, 1, 3, 3, 'M'); g.set(x + 1, 2, 'k'); g.rect(x, 20, 3, 3, 'M'); g.set(x + 1, 21, 'k'); }
  for (let y = 6; y <= 18; y += 4) for (let x = 3; x <= 20; x += 2) g.set(x, y, 'C');
  [[5, 8], [9, 7], [13, 8], [17, 7], [7, 12], [11, 12], [15, 12], [9, 16], [13, 16]].forEach(([x, y]) => { g.rect(x, y, 2, 2, 'w'); });
};
// 計算機ホログラム：台の上に浮かぶ、光でできた立体
ART.hologram = g => {
  g.rect(4, 19, 16, 3, 'K'); g.hl(4, 19, 16, 'M'); g.rect(10, 18, 4, 1, 'c');
  g.line(10, 18, 6, 10, 'u'); g.line(14, 18, 18, 10, 'u');
  const C = 'c';
  g.hl(8, 6, 8, C); g.hl(8, 13, 8, C); g.vl(8, 6, 8, C); g.vl(15, 6, 8, C);
  g.line(8, 6, 11, 3, C); g.line(15, 6, 18, 3, C); g.hl(11, 3, 8, C); g.vl(18, 3, 8, C); g.line(15, 13, 18, 10, C);
  g.set(11, 9, 'w'); g.set(13, 11, 'w');
};
// デジタルツイン：本物（左）と、データで写しとった分身（右）
ART.twin = g => {
  g.disc(6, 6, 2.6, 'S'); g.rect(3, 9, 7, 8, 'o'); g.rect(3, 17, 3, 5, 'K'); g.rect(7, 17, 3, 5, 'K');
  const C = 'c';
  g.ring(17, 6, 2.6, 1, C); g.hl(14, 9, 7, C); g.hl(14, 16, 7, C); g.vl(14, 9, 8, C); g.vl(20, 9, 8, C); g.vl(15, 17, 5, C); g.vl(19, 17, 5, C);
  for (let x = 15; x <= 19; x += 2) for (let y = 11; y <= 15; y += 2) g.set(x, y, 'u');
  g.set(11, 12, 'C'); g.set(12, 12, 'C');
};
// null²：伸び縮みする鏡の膜でおおわれた、キューブを積んだ建物
ART.null2 = g => {
  const cube = (x, y, s) => { g.rect(x, y, s, s, 'm'); g.hl(x, y, s, 'w'); g.vl(x, y, s, 'w'); g.line(x + 1, y + s - 2, x + s - 2, y + 1, 'u'); g.rect(x + s - 2, y + s - 2, 2, 2, 'M'); };
  cube(2, 12, 9); cube(11, 12, 9); cube(6, 3, 9); cube(15, 5, 6);
  g.set(9, 6, 'c'); g.set(4, 15, 'c'); g.set(14, 15, 'v');
};
// 空中プラズマ：レーザーを集めた点が光る（さわれる光）
ART.plasma = g => {
  g.rect(0, 0, 24, 24, 'k');
  g.line(4, 0, 11, 11, 'P'); g.line(19, 0, 12, 11, 'P'); g.line(11, 0, 11, 10, 'p');
  [[11, 12], [8, 16], [14, 16], [11, 20], [5, 19], [17, 19]].forEach(([x, y], i) => { g.disc(x + 0.5, y, i ? 1 : 1.6, 'w'); if (i) g.set(x + 2, y, 'v'); });
  g.disc(20, 21, 1.4, 's'); g.set(18, 20, 's');
};

ART._missing = g => { g.rect(6, 6, 12, 12, 'g'); g.text(10, 10, '?', 'w'); };

/* ---------- 画像に変換 ---------- */
function outlineGrid(g) {
  const mark = [];
  g.each((x, y) => {
    if (g.a[y][x]) return;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g.get(x + dx, y + dy))) mark.push([x, y]);
  });
  mark.forEach(([x, y]) => { g.a[y][x] = 'k'; });
}
const SPRITE_CACHE = {};
function spriteGrid(id) {
  const g = grid();
  (ART[id] || ART._missing)(g);
  outlineGrid(g);
  return g;
}
function spriteURL(id, mode) {
  const key = id + '|' + (mode || '');
  if (SPRITE_CACHE[key]) return SPRITE_CACHE[key];
  const g = spriteGrid(id);
  const S = 8;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 24 * S;
  const ctx = cv.getContext('2d');
  g.each((x, y) => {
    const c = g.a[y][x];
    if (!c) return;
    ctx.fillStyle = mode === 'sil' ? (c === 'k' ? '#2b2820' : '#4d4940') : PAL[c];
    ctx.fillRect(x * S, y * S, S, S);
  });
  SPRITE_CACHE[key] = cv.toDataURL('image/png');
  return SPRITE_CACHE[key];
}
function artImg(id, opts) {
  opts = opts || {};
  return `<img class="px ${opts.cls || ''}" src="${spriteURL(id, opts.sil ? 'sil' : '')}" alt="" draggable="false">`;
}

/* 絵の背景のもよう（タイプごと） */
function tileURL(key) {
  const T = 16, S = 4;
  const cv = document.createElement('canvas');
  cv.width = cv.height = T * S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(42,34,22,0.13)';
  const px = (x, y) => ctx.fillRect(((x % T) + T) % T * S, ((y % T) + T) % T * S, S, S);
  const pat = {
    algo: () => { for (let i = 0; i < 16; i += 2) px(i, i); px(12, 3); px(13, 4); px(12, 5); px(3, 12); px(4, 13); px(3, 14); },
    data: () => { for (let i = 0; i < 16; i++) { px(i, 0); px(0, i); px(i, 8); px(8, i); } },
    net: () => { for (let x = 0; x < 16; x++) { px(x, Math.round(4 + 2 * Math.sin((x / 16) * Math.PI * 2))); px(x, Math.round(12 + 2 * Math.sin((x / 16) * Math.PI * 2 + Math.PI))); } },
    sec: () => { [[3, 3], [11, 11]].forEach(([x, y]) => { px(x, y); px(x + 1, y); px(x, y + 1); px(x + 1, y + 1); px(x, y + 2); px(x + 1, y + 2); px(x, y - 1); px(x + 1, y - 1); px(x - 1, y); px(x + 2, y); }); },
    hw: () => { for (let x = 0; x < 7; x++) px(x, 4); for (let y = 4; y < 11; y++) px(6, y); for (let x = 6; x < 16; x++) px(x, 10); px(5, 3); px(7, 3); px(5, 5); px(7, 5); px(13, 9); px(13, 11); px(12, 10); px(14, 10); },
    ai: () => { [[3, 3], [12, 6], [6, 12]].forEach(([x, y]) => { px(x, y); px(x + 1, y); px(x, y + 1); px(x + 1, y + 1); }); for (let i = 0; i <= 8; i++) px(4 + i, 4 + Math.round(i * 2 / 8)); for (let i = 0; i <= 6; i++) px(12 - i, 7 + i); },
    none: () => { [['1', 2, 2], ['0', 10, 9]].forEach(([d, x, y]) => { const f = FONT[d]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (f[j * 3 + i] === '1') px(x + i, y + j); }); },
    item: () => { for (let i = 0; i < 16; i += 4) for (let j = 0; j < 16; j += 4) px(i + ((j / 4) % 2) * 2, j); },
    sup: () => { for (let i = 0; i < 16; i++) { px(i, i); px(i, (i + 8) % 16); } },
    tool: () => { for (let i = 0; i < 16; i++) { px(i, i); px(15 - i, i); } },
  };
  (pat[key] || pat.data)();
  return cv.toDataURL('image/png');
}
function injectArtCSS() {
  if (document.getElementById('art-tiles')) return;
  const keys = ['algo', 'data', 'net', 'sec', 'hw', 'ai', 'none', 'item', 'sup', 'tool'];
  const css = keys.map(k => `.tile-${k}{background-image:url(${tileURL(k)})}`).join('\n');
  const el = document.createElement('style');
  el.id = 'art-tiles';
  el.textContent = css;
  document.head.appendChild(el);
}
const tileClass = d => 'tile-' + (d.kind === 'mon' ? d.type : d.kind);
