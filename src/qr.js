/* =========================================================
   QRコードをつくる（外部のライブラリは使わない）
   バイトモード・誤り訂正レベルL・型番1〜20。仕様（JIS X 0510 / ISO/IEC 18004）どおりにつくる。
   qrMatrix(文字列) → 黒なら true の2次元配列。qrSVG(文字列) → SVGの文字列。
   ========================================================= */
const QR_ECC_L = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28]; // 1ブロックの誤り訂正コード語の数
const QR_BLOCKS_L = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8]; // ブロックの数

/* 型番ごとの、データに使えるマスの数 */
function qrRawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    r -= (25 * na - 10) * na - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const qrDataCodewords = ver => Math.floor(qrRawModules(ver) / 8) - QR_ECC_L[ver] * QR_BLOCKS_L[ver];

/* ガロア体 GF(256) のかけ算（リード・ソロモン符号用） */
function qrMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 255;
}
function qrRSDivisor(deg) {
  const r = Array(deg).fill(0);
  r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = qrMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = qrMul(root, 2);
  }
  return r;
}
function qrRSRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= qrMul(c, f); });
  }
  return r;
}

function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= 20; ver++) {
    const cnt = ver < 10 ? 8 : 16;
    if (4 + cnt + bytes.length * 8 <= qrDataCodewords(ver) * 8) break;
  }
  if (ver > 20) throw new Error('QRコードにするには長すぎます');
  const size = ver * 4 + 17;
  // データのビット列：モード（バイト）・文字数・中身・終わり・うめ草
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  const cap = qrDataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  // ブロックに分けて誤り訂正をつけ、交互にならべる
  const nb = QR_BLOCKS_L[ver], ecl = QR_ECC_L[ver], raw = Math.floor(qrRawModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = qrRSDivisor(ecl);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1));
    k += dat.length;
    const b = dat.concat(qrRSRemainder(dat, div));
    if (i < nShort) b.splice(shortLen - ecl, 0, null); // 短いブロックは1つ空ける
    blocks.push(b);
  }
  const all = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) all.push(b[i]); });

  // マスを用意して、決まった模様（位置・タイミング・位置合わせ）を描く
  const M = Array.from({ length: size }, () => Array(size).fill(false));
  const F = Array.from({ length: size }, () => Array(size).fill(false)); // 決まった模様のマス
  const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
    pos.forEach((x, i) => pos.forEach((y, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
  }
  const drawFormat = mask => {
    const d = (1 << 3) | mask; // 誤り訂正レベルL = 01
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0); // 場所を取っておく（あとで本物を描く）
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) {
      const d = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3);
      set(a, c, d); set(c, a, d);
    }
  }
  // データをジグザグに置く
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!F[y][x] && k < all.length * 8) { M[y][x] = ((all[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  // 8つのマスクをためして、いちばん読みやすい（減点の少ない）ものを使う
  const MASKS = [(x, y) => (x + y) % 2, (x, y) => y % 2, x => x % 3, (x, y) => (x + y) % 3, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2,
    (x, y) => ((x * y) % 2) + ((x * y) % 3), (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y) === 0) M[y][x] = !M[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    const line = get => { // 同じ色が5つ以上つづく所と、位置の模様に似た所
      let run = 0, prev = null;
      const seq = [];
      for (let i = 0; i < size; i++) {
        const c = get(i);
        seq.push(c ? 1 : 0);
        if (c === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { run = 1; prev = c; }
      }
      const s = seq.join('');
      for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
    };
    for (let y = 0; y < size; y++) line(x => M[y][x]);
    for (let x = 0; x < size; x++) line(y => M[y][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
    M.forEach(row => row.forEach(c => { if (c) dark++; }));
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const p = penalty();
    if (p < bestP) { bestP = p; best = m; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return M;
}

/* SVG にする（まわりに4マスの余白） */
function qrSVG(text, label) {
  const M = qrMatrix(text), n = M.length, q = 4;
  let d = '';
  M.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + q},${y + q}h1v1h-1z`; }));
  return `<svg class="qr" viewBox="0 0 ${n + q * 2} ${n + q * 2}" role="img" aria-label="${label || 'QRコード'}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
if (typeof module !== 'undefined') module.exports = { qrMatrix, qrSVG };
