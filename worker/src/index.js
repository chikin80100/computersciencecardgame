/* =========================================================
   CS用語カードバトル：サイト版オンライン対戦の「あいことば」を預かる Cloudflare Worker

   2台を WebRTC で直接つなぐには、はじめに接続情報（招待コード・参加コード）を1回ずつ
   交換する必要がある。この Worker は、それを6けたの「あいことば」で少しのあいだ預かるだけ。
   つないだあとの対戦の通信は、ここを通らない。

   部屋ごとに Durable Object（Room）を1つ使う（あいことばが名前）。10分たつと自動で消える。

   POST   /room                    本文 {offer}   → {code, token}   部屋をつくる
   GET    /room/<code>                            → {offer, taken}  相手：招待コードを受けとる
   POST   /room/<code>/answer      本文 {answer}  → {ok}            相手：参加コードをわたす（1回だけ）
   GET    /room/<code>/answer?t=<token>           → {answer|null}   部屋をつくった人：参加コードを待つ
   DELETE /room/<code>?t=<token>                  → {ok}            部屋をつくった人：部屋を消す
   GET    /health                                 → {ok}

   本文は text/plain の JSON で受けとる（ブラウザの事前確認 OPTIONS を減らすため）。
   ========================================================= */
import { DurableObject } from 'cloudflare:workers';

const DEFAULT_TTL_SEC = 10 * 60; // 部屋は10分で消える（テストのときだけ ROOM_TTL_SEC で短くできる）
const ttlMs = env => Math.max(1, Number(env && env.ROOM_TTL_SEC) || DEFAULT_TTL_SEC) * 1000;
const CODE_RE = /^\d{6}$/;
const SDP_RE = /^(CS2|CS1Z?)\.[A-Za-z0-9_-]{16,4000}$/; // ゲームのコードの形（p2p.js の packCode）
const TOKEN_RE = /^[0-9a-f]{32}$/;
const MAX_BODY = 8192;

const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
const newCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));

/* 1つの部屋 */
export class Room extends DurableObject {
  async load() {
    const r = await this.ctx.storage.get('room');
    if (r && Date.now() - r.created > ttlMs(this.env)) { await this.ctx.storage.deleteAll(); return null; }
    return r || null;
  }
  async create(offer, token) {
    if (await this.load()) return false; // このあいことばは使用中
    await this.ctx.storage.put('room', { offer, token, answer: null, created: Date.now() });
    await this.ctx.storage.setAlarm(Date.now() + ttlMs(this.env));
    return true;
  }
  async getOffer() {
    const r = await this.load();
    return r ? { offer: r.offer, taken: !!r.answer } : null;
  }
  async putAnswer(answer) {
    const r = await this.load();
    if (!r) return 'gone';
    if (r.answer) return 'taken';
    r.answer = answer;
    await this.ctx.storage.put('room', r);
    return 'ok';
  }
  async getAnswer(token) {
    const r = await this.load();
    if (!r) return { status: 'gone' };
    if (r.token !== token) return { status: 'forbidden' };
    return { status: 'ok', answer: r.answer };
  }
  async remove(token) {
    const r = await this.load();
    if (r && r.token !== token) return false;
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
    return true;
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

/* どのサイトから呼んでよいか：ALLOWED_ORIGINS（カンマ区切り）と、手元の確認用の localhost / 127.0.0.1 */
function allowedOrigin(req, env) {
  const o = req.headers.get('Origin');
  if (!o) return null;
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (list.includes('*') || list.includes(o)) return o;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return o;
  return null;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = allowedOrigin(req, env);
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
    const json = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });
    if (req.headers.get('Origin') && !origin) return json({ error: 'origin' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const body = async () => {
      const t = await req.text();
      if (t.length > MAX_BODY) throw new Error('big');
      return JSON.parse(t);
    };
    const room = code => env.ROOMS.get(env.ROOMS.idFromName(code));
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (parts[0] === 'health' && parts.length === 1) return json({ ok: true });
      if (parts[0] !== 'room') return json({ error: 'not_found' }, 404);

      // 部屋をつくる
      if (parts.length === 1 && req.method === 'POST') {
        const { offer } = await body();
        if (typeof offer !== 'string' || !SDP_RE.test(offer)) return json({ error: 'bad_offer' }, 400);
        const token = hex(16);
        for (let i = 0; i < 8; i++) { // あいことばが使用中なら、べつの数字で
          const code = newCode();
          if (await room(code).create(offer, token)) return json({ code, token, ttl: ttlMs(env) });
        }
        return json({ error: 'busy' }, 503);
      }

      const code = parts[1];
      if (!CODE_RE.test(code || '')) return json({ error: 'bad_code' }, 400);
      const token = url.searchParams.get('t') || '';

      if (parts.length === 2 && req.method === 'GET') {
        const r = await room(code).getOffer();
        return r ? json(r) : json({ error: 'gone' }, 404);
      }
      if (parts.length === 2 && req.method === 'DELETE') {
        if (!TOKEN_RE.test(token)) return json({ error: 'forbidden' }, 403);
        return (await room(code).remove(token)) ? json({ ok: true }) : json({ error: 'forbidden' }, 403);
      }
      if (parts.length === 3 && parts[2] === 'answer' && req.method === 'POST') {
        const { answer } = await body();
        if (typeof answer !== 'string' || !SDP_RE.test(answer)) return json({ error: 'bad_answer' }, 400);
        const st = await room(code).putAnswer(answer);
        return st === 'ok' ? json({ ok: true }) : json({ error: st }, st === 'gone' ? 404 : 409);
      }
      if (parts.length === 3 && parts[2] === 'answer' && req.method === 'GET') {
        if (!TOKEN_RE.test(token)) return json({ error: 'forbidden' }, 403);
        const r = await room(code).getAnswer(token);
        if (r.status === 'gone') return json({ error: 'gone' }, 404);
        if (r.status === 'forbidden') return json({ error: 'forbidden' }, 403);
        return json({ answer: r.answer });
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'bad_request' }, 400);
    }
  },
};
