# あいことばの Worker（Cloudflare）

サイト版（GitHub Pages）のオンライン対戦で、6けたの「あいことば」でつなげるようにするための、小さなサーバーです。

- 2台を WebRTC で直接つなぐには、はじめに接続情報を1回ずつ交換します。この Worker は、それを6けたの数字で**10分だけ**預かります。
- つないだあとの対戦の通信は、ここを通りません。
- 部屋ごとに Durable Object（`Room`）を1つ使います。相手が入ってつながったら、部屋をつくった人の画面がすぐ部屋を消します。消えなかった部屋も、10分で自動で消えます。
- Worker の URL をゲームに書いていないときや、Worker に届かないときは、ゲームは今までの「リンク・QRコード」でつなぎます。

## はじめてのデプロイ（1回だけ）

1. Cloudflare のアカウントをつくる（無料プランでよい）。
2. パソコンで次を実行する（Node.js が必要）。

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

3. `wrangler login` ではブラウザが開くので、Cloudflare にログインして許可する。
4. `wrangler deploy` の最後に、Worker の URL が出る（例：`https://cs-card-signal.あなたのサブドメイン.workers.dev`）。
   - workers.dev のサブドメインをまだ決めていないときは、とちゅうで聞かれるので決める。
5. その URL を `src/p2p.js` の `SIGNAL_URL` に書く。
6. リポジトリのいちばん上で `python3 build.py` をして、docs/index.html といっしょに commit・push する。

## 設定

`wrangler.toml` の `ALLOWED_ORIGINS` に、この Worker を呼んでよいサイトを書きます（カンマ区切り）。

- いまは GitHub Pages の `https://chikin80100.github.io` です。
- 手元で確かめるための `http://localhost` / `http://127.0.0.1` は、いつでも呼べます。
- サイトの置き場所を変えたら、ここも変えて、もう一度 `npx wrangler deploy` します。

## 手元で動かす

```bash
cd worker
npx wrangler dev --port 8787              # http://127.0.0.1:8787/health が {"ok":true} なら動いている
npx wrangler dev --var ROOM_TTL_SEC:20    # 部屋の期限を20秒にする（テスト用）
```

ゲームとつないだ確認は、リポジトリのいちばん上で `python3 test/p2p_room.py` を実行します。このテストは、自分で Worker を立てます。

## 無料プランで足りるか

Cloudflare の無料プランでは、Workers は1日10万リクエストまで使えます。SQLite を使う Durable Objects も、無料プランで1日10万リクエストまでです。

1回つなぐのに使うリクエストは、だいたい次のとおりです。

| 何をするか | 回数 |
|---|---|
| 部屋をつくる | 1回 |
| 相手が入る | 2回 |
| 部屋をつくった人が、相手の参加を待つ | 1.5〜4秒ごとに1回 |
| 部屋を消す | 1回 |

Worker と Durable Object の両方に数えられるので、1回つなぐと数十リクエストです。1日に何千回つないでも足ります。上限はときどき変わるので、くわしくは Cloudflare の料金のページを見てください。

## API

| | |
|---|---|
| `POST /room` 本文 `{offer}` | 部屋をつくる → `{code, token, ttl}` |
| `GET /room/<code>` | 招待コードを受けとる → `{offer, taken}` |
| `POST /room/<code>/answer` 本文 `{answer}` | 参加コードをわたす（1回だけ） |
| `GET /room/<code>/answer?t=<token>` | 参加コードを待つ → `{answer}`（まだなら `null`） |
| `DELETE /room/<code>?t=<token>` | 部屋を消す |
| `GET /health` | 動いているか |

本文は `text/plain` で送る JSON です（ブラウザの事前確認を減らすため）。コードの形は `CS2.…` / `CS1Z.…`（`src/p2p.js` の `packCode`）だけを受けつけます。
