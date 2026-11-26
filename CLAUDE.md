# CS用語カードバトル — 開発ガイド（Claude Code 用）

コンピュータ科学の用語をカードにした対戦カードゲーム。ルールは「ポケモンカードゲーム ポケット（ポケポケ）」を参考にしたオリジナル。
外部ライブラリなし・画像ファイルなし（絵はすべてコードで描くドット絵）。`python3 build.py` で src/ が1枚のHTMLにまとまる。

同じHTMLが、置き場所によって2通りに動く（`TRANSPORT()`：`window.claude.use` があれば `'claude'`、なければ `'p2p'`）。

| 置き場所 | セーブ | オンライン対戦 |
|---|---|---|
| Claude のアーティファクト（claude.ai） | アカウント（`window.claude` の db）＋ブラウザ | Claude の部屋（db + room）。あいことば6けたで入る。ログインが必要 |
| ふつうのWebサイト（GitHub Pages など） | ブラウザ（localStorage） | WebRTC の直接通信。あいことば6けた（Cloudflare Worker が接続情報を10分だけ預かる）。Worker がないとき・届かないときは、招待リンク・参加リンク（QRコード）を送り合う。ログイン不要 |

## 必ず守ること

1. **ゲームの状態にかかわる乱数は `RNG()` / `rnd(配列)` / `shuffle(配列)`（engine.js）だけ。`Math.random()` は使わない。**
   オンライン対戦は、2台が同じ種（seed）で同じエンジンを動かし、操作（手）だけを送り合うしくみ（ロックステップ）。乱数が1回でもずれると盤面がずれる。
   画面の演出だけの乱数は ui.js の `rndU` / `Math.random()` でよい（パック開封もこちら）。
2. **プレイヤーに何かを選ばせるときは engine.js の `pick(g, p, 見出し, 選択肢, CPU用の選び方)` を通す。** オンラインでは選んだ番号が手（`{t:'choice', i}`）として相手に送られる。
3. 実行のたびに順番が変わりうるもの（オブジェクトのキー、`Set`、`Promise` の終わる順など）で結果が変わらないようにする。迷ったら並べ替える（例：`makeDeck` はカードidの順、`energyTypes` は `TYPE_ORDER` の順、最初の配置のあと手札は uid の順）。
4. **engine.js から DOM を触らない。** 画面とのやりとりは `g.io` だけ（下の「IO」）。Node だけでテストできるようにするため。
5. 変更したら **`bash test/check.sh`**（ビルド＋すぐ終わるテスト、10秒ほど）。カードの数値やCPUの考え方を変えたら **`node test/rates.js 200`** も（全デッキの勝率が 40〜60% に入っているか。10秒ほど）。画面を変えたらブラウザのテストを動かして、スクリーンショットを目で見る。
6. セーブデータ（`STORE`）に項目を足すときは `normalizeStore()` に初期値を書き、古いセーブがそのまま読めるようにする。
7. 画面の言葉はやさしい日本語で（中高生が読む前提。むずかしい漢字・英語・記号は避ける）。コードのコメントも日本語。
8. JSの中に `</script` という文字列を書かない（1枚のHTMLにまとめるので、そこでHTMLが切れる。build.py が止める）。
9. アーティファクトの中では、ほかのサイトへの通信（fetch / WebSocket）や WebRTC はブロックされる。読みこめる外部のものは Google Fonts だけ。新しい外部ライブラリやCDNは入れない。

## コマンド

```bash
python3 build.py              # src/ → dist/index.html と docs/index.html（中身は同じ）
bash test/check.sh            # ビルド + sim / determinism / odds。どれかが失敗したら 0 以外で終わる
```

ルールエンジンのテスト（Node.js だけで動く。src/data.js と src/engine.js を `vm` で読みこむ）:

```bash
node test/sim.js                          # CPU同士で全デッキを対戦させ、ルールの不変条件を検査（problems: 0 ならOK）
node test/determinism.js                  # 同じ種なら同じ対戦になるか（same 27/27 ならOK）
node test/odds.js                         # パックの確率。全カードがどこかのパックから出るか
node test/shannon.js                      # 「クロード・シャノン」パックのカードの効果を、場面を作って1枚ずつ確かめる
node test/pioneer.js                      # 「プログラミングの先駆者」シリーズのカードの効果（場面づくりの道具は test/_scene.js）
node test/ubicomp.js                      # 「遍在する計算機」シリーズのカードの効果（フィールド・ベンチで働く特性など）
node test/rates.js 200                    # 全デッキ総当たりの勝率（先攻・後攻を入れ替えて。10秒ほど。少ない回数だと数%ぶれる）
node test/focus.js 100 p_turing,p_neumann # 指定したデッキだけの勝率
node test/matrix.js 80                    # 組み合わせごとの勝率と、ワザの使われ方
node test/usage.js                        # シリーズのカードが実際に使われているか（ログを数える）
```

ブラウザのテスト（Python + Playwright。先に `python3 build.py`）:

```bash
pip install playwright && python3 -m playwright install chromium   # はじめに1回だけ
python3 test/ui_test.py 2       # CPU戦を画面の操作で2回、最後まで
python3 test/ui2.py             # パック開封・図鑑・デッキ編集・対戦をひととおり
python3 test/father.py          # 「コンピュータの父」パックと、人物カード・新しいコマンドの操作
python3 test/shannon_ui.py      # 「クロード・シャノン」パック：開封・図鑑・1回だけのワザ・データ圧縮・究極の機械
python3 test/pioneer_ui.py      # 「プログラミングの先駆者」：開封・図鑑・詩的科学・ナノ秒の針金・ノートG・マークI・COBOL
python3 test/ubicomp_ui.py      # 「遍在する計算機」：NEWのしるし・開封・図鑑・フィールド（TRONハウス）・ベンチのTRONとセンサー・カーム・テクノロジー
python3 test/rare.py            # ゴッドパックとホロの見た目
python3 test/fullart.py         # ★フルアート：開封・10連・図鑑・デッキ編集・カードの説明（絵の切りかえ）・セーブ・マージ
python3 test/pack_fx.py         # パック開封で ex・★フルアートが出るときの演出（開ける前の光・光のすじ・めくったときの文字・10連の告知・動きを減らす設定）
python3 test/fullsheet.py       # ★フルアートの絵の一覧（ex と人物カード。types=1 でタイプごとの景色、ids=… でカードを指定、cards=1 で文字つきのカードの形）
python3 test/multi_ui.py        # はじめのチケット30枚と、10連（チケット・枚数・まとめ方・ならび順・もう10パック・スマホ/パソコン/動きを減らす設定）
python3 test/local2p.py         # この端末で2人対戦（端末を渡す画面）
python3 test/auto_ui.py         # CPU戦のオート：準備・番のとちゅうでオン、最後まで自動、もう一度でも続く、オフで手動にもどる
python3 test/online.py 0.3      # Claude内のオンライン対戦。偽の window.claude で2ページをつなぎ、手を30%落としても最後の盤面が一致するか
python3 test/online.py 0.3 '&noroom=1'   # room が使えないとき（db だけ）でも遊べるか
python3 test/online.py 0.3 '' p_tron,p_ochiai   # 3つめの引数で、部屋をつくる人・入る人のデッキを選べる。最後に、新しいしくみ（フィールドなど）が2人の画面で同じ回数おきたかを出す（events ... same: True）
python3 test/online_edge.py     # オンラインのはしっこ（まちがったあいことば・やめる・降参・見るだけの人）
python3 test/cloud.py           # アカウント保存（db）とブラウザ保存のマージ
python3 test/p2p.py 0.25        # サイト版のWebRTC対戦：コード交換・対戦・再戦・切断・手が落ちたときの回復
python3 test/p2p.py 0.25 p_ochiai,p_tron   # 2つめの引数でデッキを選べる
python3 test/p2p_connect.py 10  # つなぐところだけを10回くり返す
python3 test/p2p_room.py        # あいことば：Worker を手元で立てて（先に cd worker && npm install）、6けたでつながるか・まちがった数字・サーバーに届かない・期限切れ
python3 test/p2p_room.py https://cs-card-signal.chikin80100.workers.dev   # デプロイした本物の Worker でためす（期限切れはとばす）
python3 test/p2p_link.py        # リンク交換：QRコード（zxing-cpp があれば読み取りも）・招待リンクで開く・参加リンクを別のタブからわたす・見つからないとき
python3 test/visual.py          # 見た目を1回だけ撮る
python3 test/sheet.py set=ubicomp big=1  # 絵柄の一覧（set=father / pioneer / ubicomp、ids=enigma,alan でカードを指定）
```

- スクリーンショットは test/shots/ に出る（git には入れない）。
- 環境変数：`CHROME_PATH`（使う Chrome。なければ Playwright 付属の Chromium）、`FONTS_DIR`（本番と同じフォントで撮るとき。test/_env.py を参照）。
- テストの中では `UI.fast = true` で演出を速くしている。`#select` `#packs` `#dex` などのハッシュで、その画面から始められる。
- test/experiments/ は昔のバランス調整の実験（中の数値は古い）。新しい実験のひな形として使う。

## ファイル

| ファイル | 中身 |
|---|---|
| src/data.js | カードの定義：`TYPES` `WEAK`（弱点）`STATUS`（状態異常）`MONSTERS`（ユニット）`TRAINERS`（コマンド）`KIND` `PRESETS`（19個のデッキ）`SERIES` `PACKS` `REWARD` `EXCHANGE_COST` |
| src/engine.js | ルールエンジン（DOMなし・async）とCPUのAI。Node 用に `module.exports` もある |
| src/art.js | ドット絵。24×24 のマスに `PAL` の色の記号で描く。`ART[カードid] = g => {...}`、`spriteURL(id)` で画像に。`grid(W, H)` でほかの大きさのマスも作れる |
| src/fullart.js | ★フルアートの絵（40×56 マスのたて長）。`FULL[カードid]`（1枚ずつ描いた一枚絵）、`SCENE`（タイプごとの景色）、`fullURL(id)` で画像に。色は PAL の記号か `'#rrggbb'` |
| src/qr.js | QRコードをつくる（ライブラリなし。バイトモード・誤り訂正L・型番1〜20）。`qrSVG(文字列)` |
| src/p2p.js | サイト版の WebRTC 対戦（つなぐ・コード・あいことば・リンク・QR・再戦・切断）。`SIGNAL_URL` に Worker の URL |
| worker/ | あいことばを預かる Cloudflare Worker（Durable Object `Room`）。デプロイのしかたは worker/README.md。`npm install` すると node_modules ができる（git には入れない） |
| src/ui.js | 画面ぜんぶ：タイトル・デッキ選択・デッキ編集・図鑑・あそびかた・パック開封・対戦・結果・セーブ・オンライン対戦（`NET`） |
| src/style.css | 見た目 |
| src/index.html | ひな形。`/*STYLE*/` と `/*SCRIPT*/` に中身が入る |
| build.py | data → engine → art → fullart → qr → p2p → ui の順にJSをつなげて、1枚のHTMLにする |
| docs/index.html | ビルドしたもの（GitHub Pages 用に git に入れる）。src を変えたらビルドしてから commit |
| dist/index.html | ビルドしたもの（テストとアーティファクト用。git には入れない） |

## しくみ

### ことば（コードの名前と画面の名前）

| コード | 画面 |
|---|---|
| `MONSTERS` / `kind: 'mon'` | ユニット（ポケモンにあたる） |
| `TRAINERS` | コマンド（トレーナーズにあたる。画面の名前は「コマンド」に変えたが、コードは trainer のまま） |
| `kind: 'item' / 'sup' / 'tool' / 'field'` | グッズ / サポート（1番に1枚）/ どうぐ / フィールド（場に1枚だけ。おたがいに効く） |
| `stage: 1 / 2 / 3` | v1 / v2 / v3（たね・1進化・2進化）。進化元は `from: '名前'` |
| `ex: true` | ex ユニット（たおすと2ポイント） |
| `leg: true` | 人物カード（アラン・チューリングなど。金のふち） |
| `set: 'father'` / `'pioneer'` / `'ubicomp'` | 「コンピュータの父」／「プログラミングの先駆者」／「遍在する計算機」シリーズ。そのシリーズのパックからしか出ない。シリーズは `SERIES`（`short` は図鑑の絞り込みとパックの帯に出る短い名前）、画面では `seriesOf(id)` |
| ワザの `once: true` | 1回だけのワザ（ワンタイムパッド）。使ったワザの名前を、場のユニットの `onceUsed` に覚える |
| 特性の `noStatus: true` | 特殊状態にならない（LDPC符号）。`setStatus()` の中で止める |
| `p.t.costCut` | この番、ワザの無色エネルギーを1個へらす（データ圧縮）。コストは `atkCost(p, ワザ)` で求める |
| `p.t.anyColor` | この番、ワザのエネルギーの色を問わない（詩的科学）。`atkCost` でぜんぶ無色にしてから、データ圧縮をかける |
| 場のユニットの `loops` / `restTurn` / `endured` | ノートGが「ベルヌーイ数」を使った回数／ハーバード・マークIが休む番（`attackInfo` で止める）／COBOLの特性「レガシー」（`endure: true`）を使ったか |
| どうぐ `lovelace` / `logbook` | AIタイプのワザのダメージ-30（`lovelaceHit`）／特殊状態を1回ふせぐ（`setStatus` の中） |
| `g.field` | 場に出ているフィールド `{ card, owner }`（TRONハウス）。新しいフィールドを出すと、前のものは持ち主のトラッシュへ。`stateHash` に入っている。sim.js のカードの数の検査では、出した人の分として数える |
| `benchWith(pl, key)` | ベンチにいる、特性に `key` を持つユニットの数。ベンチで働く特性：`watch`（センサー：相手のワザでバトル場がダメージを受けたら、ワザを使ったユニットに10ずつ）・`embed`（TRON：自分のワザ +10ずつ）・`float`（音響浮揚：にげるエネルギー -1ずつ） |
| 特性の `noWeak` / `phantom` / `twin` / `mirror` | 弱点がない（デジタルネイチャー）／最初に受けるワザのダメージが0（計算機ホログラム。`phantomUsed`）／ダウンしたら山札から同じカードをベンチへ（デジタルツイン。`checkKOs` の中）／受けたダメージの半分をはね返す（null²） |
| ワザの `sure: true` | 文字化けでも失敗しない（リアルタイムOS） |
| `p.t.freeRetreat` / `p.t.allWeak` | この番、にげるのがただ（ICタグ）／この番、自分のワザは必ず弱点を突く（落合陽一。`ochiaiHit()`。弱点のないユニットには効かない） |
| どうぐ `harvest` / フィールド `tronhouse` | ベンチにいると番のはじめにエネルギー+1（環境発電。`beginTurn`）／番のおわりに、おたがいのベンチ全員のHPを10回復（`finishTurn`） |
| コストの文字 | A=アルゴリズム D=データ N=ネットワーク S=セキュリティ H=ハードウェア I=AI C=無色 |

コインは画面では 1＝オモテ・0＝ウラ（ビットの「3ビット」は、これを2進数として読む）。ワザの中でコインの順番が要るときは `c.coins(n)`（[オモテか, ...] を返す）。

ルールの数：ベンチ3体、3ポイントで勝ち、両者あわせて60ターンで引き分け（`BENCH_MAX` `WIN_POINTS` `TURN_LIMIT`）。

### ゲームエンジン（src/engine.js）

- `newGame({io, players})` で盤面 `g` を作り、`runGame(g)` で最後まで進める。`g.players[i]` は `deck hand discard active bench points energyTypes energyCur energyNext t（この番のフラグ）`。場のユニットは `mkMon()` の形（`uid id dmg energy tool status ...`）。
- 1つの番：`beginTurn` → CPU なら `cpuTurn`、人なら `g.io.humanTurn(p)` → `finishTurn`（状態異常のチェック・きぜつの処理）。
- 行動は `actBench` `actEvolve` `actAttach` `actTrainer` `actRetreat` `actAbility` `actAttack`。人の操作も、CPUも、オンラインの相手の手も、すべてこれを通る。できるかどうか（と、できない理由）は `handInfo` `attackInfo` `retreatInfo` `abilityInfo`。
- ワザ：`atk: [{ name, cost:'AC', dmg, label, text, dmgFn: async c => {...}, after: async c => {...}, ai: (g,p)=>点数 }]`。`c` は `mkCtx()` で作る道具箱（`c.heads(n)` `c.status(m,'garble')` `c.draw(n)` `c.hitBench(n)` `c.foeAlive()` など）。`dmgFn` でダメージを決め、`after` で追加の効果。
- 特性：`ability: { name, kind:'active'|'passive', reduce, text }`。
- コマンドの効果は `actTrainer()` の `switch (card.id)`、使えるかどうかは `handInfo()` の中。
- CPU：ワザは `evalAttack`（コインの結果を何回もためすモンテカルロ。`dry=true` の道具箱なので盤面を変えない）、サポートは `aiSupporter`、そのほか `aiDevelop` `aiLateItems` `aiMaybeRetreat` など。カードの値打ちは `aiHandValue` / `cmdValue`。

### IO（エンジン ↔ 画面）

`g.io` が持つもの：`choose(p, 見出し, 選択肢, opts)` `coin` `log` `render` `pause(ms)` `banner` `fx(uid, 種類, 数)` `say` `setup(p)`（最初の配置）`humanTurn(p)`。
テスト用に何もしない `NOOP_IO` がある。ui.js には3つ：`makeIO()`（CPU戦）、`makeLocalIO()`（この端末で2人。番や選択のたびに `handover()` で端末を渡す画面を出す）、`makeNetIO()`（オンライン。相手の番は `remoteTurn()` で手を待つ）。

### 対人戦（オンライン）のしくみ

- はじめに部屋を作った人が種（seed）とゲームid（gid）を決め、2人とも `setRNG(seededRNG(seed))` と `resetUid()` をしてから同じ `newGame` を作る。
- 手の形：`{t, s:通し番号, ...}`。`t` は `bench evolve attach trainer retreat ability attack`（盤面の操作）、`choice`（`pick` で選んだ番号 `i`）、`setup`（最初の配置 `a`, `b`）、`end`（番の終わり。盤面のしるし `h = stateHash(g)` つき）、`surrender`。
- 自分の手も相手の手も `applyMove(g, p, m)` で盤面に反映する。`end` で受け取った `h` が自分の `stateHash(g)` とちがったら `netDesync()`（引き分けで終わり、チケットなし）。
- Claude の中（`NET`、ui.js）：部屋は db の `pvp/<あいことば>`、手は `pvpm/<gid>_h` と `pvpm/<gid>_g<token>` に書き、room（チャンネル `'pvp-'+gid`）の `mv` / `need` で知らせる。room がなくても db だけで遊べる。
- サイト版（src/p2p.js）：`RTCPeerConnection`（STUN は Google と Cloudflare、TURN はなし）。データチャンネルは `{negotiated:true, id:0, ordered:true}`。コードは `CS2.` ＋ base64url（`packCode` / `unpackCode`）。SDP から ICE のユーザー名・パスワード、証明書の指紋（sha-256）、setup、UDP の候補（最大8つ）だけをバイト列につめ、受け取った側が決まった形の SDP を組み立てなおす（`compactSDP` / `expandSDP`）。候補が1つで90文字、3つで140文字ほど。この形にできない SDP（mid が 0 でないなど）は、古い形（SDP をまるごと deflate-raw した `CS1Z.`、600文字ほど）で出す。古い形も読める。
  - **あいことば（2026年11月26日〜）**：`SIGNAL_URL`（テストでは `window.CS_SIGNAL_URL`）に Worker の URL があれば、部屋をつくった人は招待コードを Worker に預け（`POST /room`）、6けたの数字をもらう。相手は数字で招待コードを受けとり、参加コードを Worker にわたす。部屋をつくった人は `p2pWaitAnswer` で1.5〜4秒ごとに聞きに行き、届いたら `connect` して部屋を消す。部屋は10分で消える。あいことばのQRコードは `#r=123456` のリンク（開くと数字が入る）。Worker に届かないときは `P2P.sigNote` を出して、下のリンク交換にもどる。リンク交換のテスト（p2p.py・p2p_connect.py・p2p_link.py）は `window.CS_SIGNAL_URL = ''` にして、Worker を使わずに動かす。はじめは「サーバーは使わない」と決めたが（11月25日）、自分の Cloudflare の Worker ならよいことにした。
  - コードは、このページへのリンクにして送ることもできる（`p2pLink`：招待は `#j=CS2.…`、参加は `#a=CS2.…`、140〜200文字ほど）。画面にはそのQRコードを出す。スマホのふつうのカメラで読めば、ゲームが開く。Worker があるときは、「あいことばが使えないとき」のたたみの中に出す。
  - 招待リンクで開くと、`p2pFromHash()`（boot から呼ぶ）が招待コードを入れた状態でオンライン対戦の画面を出し、アドレスからコードを消す。参加リンクで開くと、BroadcastChannel `cs-term-p2p` で、同じブラウザの「部屋をつくった画面」（`p2pListen()`）にわたして、そちらでつなぐ。見つからないときは、リンクをコピーして貼る案内を出す。
  - 「つなぐ」の欄は、コードだけでも、リンクのままでも読める。`BarcodeDetector` があるブラウザでは「カメラで読む」も出る（`p2pScan`）。
  - **待合室（2026年11月26日〜）**：つながっても対戦はすぐはじめない。デッキを選ぶ画面のまま、下の帯（`.matchbar`）に「準備OK」を出し、2人とも押したら部屋をつくった側が `start` を送る。準備OKのあとは「準備をやめる」（`p2pUnready`、メッセージ `unready`）。準備OKのあとでデッキを変えても自動で取り消す。
  - **相手のデッキは見せない**：待合室では「準備OK」かどうかだけを出す。対戦中も、盤面の相手の欄にデッキ名を出さない（`pbarHTML`、オンライン対戦のとき）。対戦が終わったら、結果の画面と盤面で見せる。盤面をつくるのに要るので、デッキの中身そのものは裏でおたがいに届いている（ゲスト → ホストは `again` の `deck`、ホスト → ゲストは `start`）。
  - メッセージは `again`（準備OK・ゲストはデッキつき）`unready`（準備をやめる）`start`（round, seed, gid, decks）`mv` `hb`（ハートビート）`need`（落ちた手の再送のお願い）`bye`。1.5秒ごとに `again` の再送とハートビート。

### 画面（src/ui.js）

- **iPad の Safari で気をつけること（2026年11月26日にわかった）**：
  - CSS の `filter`（`drop-shadow` `grayscale` `brightness` など）を、重ねたり、動き（アニメーション・`transform`）といっしょに使ったりすると、Safari では絵が四角く切れたり、ずれたりすることがある（パックの影・押せないパックの灰色・10連のうしろのパックでおきた）。パックや、めくるカードのまわりでは `filter` を使わない。影は `box-shadow`、暗くするのは上に色を重ねる `::after` にする。光らせる動きも `box-shadow` を動かす。
  - `:hover` は、iPad ではタップのあとも残る。マウスのときだけの見た目は `@media (hover: hover)` の中に書く。
  - Chromium のテストでは、このくずれは出ない。WebKit はこの環境に入っていない（ダウンロード先にも届かない）ので、見た目を大きく変えたら iPad で見てもらう。
- **class の名前のぶつかり**：シリーズのパックは `.pack.series`、シリーズの見出しの区切りは `section.series`。区切りのスタイルを `.series` だけで書くと、パックにも当たる（上18px・下8px の余白がついて、押せないパックの暗い色がはみ出した）。新しいスタイルは、ほかの部品と同じ名前にならないか `grep` してから書く。
- 見た目の決まり（2026年11月25日に見直し）：色は基板の緑・金・シルクの白・パンチカードの紙・インクの5つ（style.css の `:root`）。**金の塗りのボタン（`.btn.gold`）は、1つの画面（窓）にその画面の本命の操作1つだけ**（パックの画面は、パックごとの「ひらく」）。ほかは枠だけ（`.btn` / `.btn.ghost`）。押せない金ボタンは点線の枠になる。画面の言葉は日本語（盤面の「山札」「ベンチ」「バトル場」なども）。長い一覧は、選んだものだけをくわしく（`deckDetailHTML`）、一覧は小さいタイル（`.decks.compact`）にして、決める操作は下に固定する（`.matchbar`）。
- オート対戦（CPU戦だけ。`UI.auto`、操作バーの「オート」）：自分の席の `isCPU` を切りかえて、エンジンの `cpuTurn` と `pick` に任せる（`applyAuto` / `toggleAuto`）。オンはすぐ（準備のとちゅうなら並べかけをもどして `aiSetup` に任せ、番のとちゅうなら `UI.autoTakeover` で `humanTurn` の中から `cpuTurn` を続ける）、オフは次の番のはじめ（`banner` のとき）に反映する。ページを開いているあいだは「もう一度」でも続く（セーブはしない）。チケットはふつうの対戦と同じようにもらえる。
- `UI.me`：どちらの席の目線で盤面を見るか（CPU戦は0、オンラインは自分の席、この端末での2人対戦は操作している人）。`UI.vs`：`'cpu' | 'local' | 'online'`。
- 画面は `show(名前)` で切り替え（`ROUTES`）。対戦画面は `renderBattle()`、人の操作は `doMove()` → `applyMove()`、番の終わりは `finishHumanTurn()`。
- パック：`openPack(packId, n)` で開ける（n は 1 か `MULTI_PACKS`＝10。10連はチケット10枚・パックポイント10パック分）。中身は1パックずつ `rollPack(pack)`。10連は1枚ずつめくらず、`multiDoneHTML()` で、同じカード（ホロかどうかも同じ）をまとめて「×枚数」をつけ、ホロ → レア度の高い順にならべて、裏から順にめくれる絵で見せる（動きを減らす設定では、すぐ表）。おまけの確定枠はなく、確率は1パックずつと同じ。`rollPack` は test/odds.js が `function packPool` 〜 `function packHTML` の間を切り出して使うので、その間に画面の関数を入れない。5枚目と4枚目にレアが出やすい。シリーズのパックは目玉の人物カード（`feature`）が ◆◆◆◆ の半分をしめる（だいたい18%のパックに入る）。`isNew: true` のシリーズとパックには NEW のしるしがつく。シリーズは `SERIES` の順に、パックはシリーズの中で NEW が先頭に出る（いまは「遍在する計算機」のマーク・ワイザー・TRON・落合陽一）。ふつうのパックには `set` つきのカードは入らない。ゴッドパックは0.5%ほど。
- **パラレル**（同じカードの、めずらしい見た目。デッキではふつうのカードと同じ）：☆ホロ（`STORE.holo`、キラキラが流れる）と ★フルアート（`STORE.full`、2026年11月26日〜）。どちらもユニット（シリーズのパックでは、その人物カードも。`rollPack` の `holoPool`）から出る。
  - 確率（`rollPack`）：4枚目 ◆◆71% ◆◆◆18% ◆◆◆◆8% ☆ホロ2% ★フルアート1%、5枚目 ◆◆47% ◆◆◆28% ◆◆◆◆16% ☆ホロ6% ★フルアート3%（フルアートの分は ◆◆ から取った）。ゴッドパックでは ☆30%・★15%。`node test/odds.js` の `h:` `f:` で見る。
  - ★フルアートの絵（src/fullart.js、2026年11月26日に描きなおし）：40×56 マスのたて長の一枚絵を、カードの面ぜんたいに敷く（`fullBgHTML` → `.fa-bg`。文字の下は CSS のグラデーションで暗くする。Safari のために `filter` は使わない）。
    - ex（20枚）と人物カード（7枚）は、1枚ずつ描きおこした絵（`FULL[id]`）。人物カードは顔を描かず、研究や作品の場面（ボンブ・ノイマン型の図・迷路のネズミ・解析機関・日誌のバグ・ユビキタスの部屋・鏡の湖と浮かぶ光の粒）。
    - ほかのカードは、タイプごとの景色（`SCENE`：グラフの星座・データの塔・夕ぐれの街・金庫・基板・星雲・0と1の雨。コマンドは光のすじ）の上に、ふつうの絵を主役として置く（`defaultFull`）。星などの位置はカードの id から決まる乱数（`frand(fseed(id))`。画面の演出なので RNG は使わない）。
    - 下の14マスくらいには名前・HP の文字が重なるので、絵の大事なところは上に描く。小さい文字（`g.text`、FONT の3×5）には Q・W・J がない。
    - 新しい ex や人物カードを足したら、`FULL[id]` も描いて `python3 test/fullsheet.py` で目で見る（描かなくても `defaultFull` で出る）。
  - 図鑑・デッキ編集の一覧は、持っていれば ★フルアート → ☆ホロ の順に見せる（`bestLook`）。カードの説明では「絵を切りかえる」で、持っている見た目を順に見られる（`openCardInfo(id, look)`）。10連の結果では ★ → ☆ → レア度の順にならべる。
  - アカウントの保存とのマージは、☆も★もカードごとに多いほう（`mergeStore`）。
- **ex・★フルアートが出るときの演出**（2026年11月26日〜。★フルアートは虹色、ex は金色。★のほうを優先。`PACKFLOW.fx` = `packFx(pulls)`、カードごとは `spKind(pl)`）：
  - 開ける前：そのパックが光って、ゆれが速い（`.po-pack.fx-ex / .fx-full`）。
  - 破いたとき：画面いっぱいの光のすじと白いフラッシュ（`packBurst` → `.po-burst`。カードが出たあとも少し続く）。破く時間は 0.7秒 → 0.85秒。
  - 1枚ずつめくるとき：その番で裏が光ってゆれ、「光っている…！」。めくると、うしろで光のすじが回り「ex！」「★フルアート！」が飛び出す（`.po-stage.go`）。
  - 10連：結果の前に告知（`PACKFLOW.stage = 'cutin'`、`cutinHTML`。「★フルアート ×n」「ex ×n」）。タップで結果へ（`data-po="skipcut"`）、待っていても2.4秒で結果へ。結果でも、そのカードのまわりが光る（`.po-flip.sp-ex / .sp-full`）。ex はパックの2割ほどに入るので、10連ではほぼ毎回告知が出る。**10連を開けるテストは、告知が出たらタップして進める**（multi_ui.py の `skip_cutin`）。
  - 動きを減らす設定では、回したり光らせたりせず、文字だけを出す。Safari のために `filter` は使わない（回転・不透明度・`box-shadow`・`repeating-conic-gradient`）。
- チケット：`REWARD = {start:30, win:5, lose:3, draw:3, daily:10}`（`grantReward()`）。`start` は、はじめての人（セーブに `tickets` がない人）だけに配る。前の版のセーブの枚数は変えない（2026年11月24日に20→30。前に10→20にしたときは、`bonus2` で前のセーブにも差を配った）。降参した人・この端末での2人対戦・ずれて終わった対戦はもらえない。

### セーブ

- `STORE`：localStorage の `'cs-term-card-battle-v1'`。`{decks, coll(id→枚数), holo, stats, tickets, points, updatedAt, ...}`。
- Claude の中では db の `data/users/<id>/save` にも保存し、`mergeStore()` でブラウザの分とまぜる（カードはカードごとに多いほう、ほかは新しいほう。はじめてそろえるときはデッキを合わせる）。

## カードを1枚足す手順

1. **src/data.js**：`MONSTERS`（ユニット）か `TRAINERS`（コマンド）に足す。id は英小文字で、ほかと重ならないもの。`desc` には、その用語のやさしい説明を書く（このゲームは用語を学ぶためのもの）。シリーズのカードなら `set: 'father'` などをつけて、`PACKS` のそのパックの `ids` に入れる。山札から選ぶ効果は `tutorFromDeck()`、効果のテストは test/_scene.js で場面を作る。
2. **src/art.js**：`ART.<id> = g => { ... }` で絵を描く（絵がないと `ART._missing` の「？」になる）。`python3 test/sheet.py ids=<id> big=1` で目で確かめる。
3. **src/engine.js**：新しい効果なら、ワザは `dmgFn` / `after`（必要なら `mkCtx` に道具を足す）、コマンドは `handInfo` と `actTrainer`、CPUが使うための判断（`aiSupporter` など）も足す。選ばせるときは必ず `pick()`。
4. CPUのデッキで使わせたいなら `PRESETS` のどれかに入れる（1デッキ20枚・同じカードは2枚まで）。
5. `bash test/check.sh` → `node test/rates.js 200`（入れたデッキの勝率が 40〜60% か）→ `node test/usage.js` に言葉を足して、CPUが本当に使っているかを見る。

いまの数値の目安：v1 は HP 50〜100（多くは60）、v2 は 80〜110、v3 と ex は 140〜160。ワザの基本ダメージは、エネルギー1個で 0〜40、2個で 0〜60、3個で 0〜130。にげるは多くが1か2。

## 公開のしかた

- **GitHub Pages**：`python3 build.py` → docs/index.html を commit して push。リポジトリの Settings → Pages → 「Deploy from a branch」→ `main` の `/docs`。
- **Claude のアーティファクト**：slug `bab068e2-cfa2-4379-bf49-c553dfd2e285`（https://claude.ai/artifact/Q45rL3wkYszVFoTaqEKWRa）。だれでも見られる共有になっている。使っている機能（capabilities）は `{db:{}, user:{}, room:{topics:{mv:'interact', need:'interact'}}}`。アーティファクトを公開する道具は claude.ai のチャットにあるので、更新するときはそちらで dist/index.html をわたし「このアーティファクトに新しい版として公開して」とたのむ（共有中なので `shared_live:'public'` と今のタイトル「CS用語カードバトル」が要る）。最後に公開したのは「遍在する計算機」シリーズを入れた版（2026年11月24日、版 `1795506705-9ef3`）。

- **あいことばの Worker**：`https://cs-card-signal.chikin80100.workers.dev`（2026年11月26日にデプロイ。`src/p2p.js` の `SIGNAL_URL`）。Worker を変えたら、`worker/` で `npx wrangler deploy` をしなおす。
  - クラウドのセッションからデプロイするときは、環境「computersciencecardgame」を使う。この環境には、Cloudflare の API トークン（api.cloudflare.com のネットワークシークレット）と、Worker のホストを許す設定が入っている。
  - 実行するのは `CLOUDFLARE_API_TOKEN=dummy CLOUDFLARE_ACCOUNT_ID=<アカウントID> WRANGLER_SEND_METRICS=false npx wrangler deploy`。トークンは本物でなくてよい（ネットワークのしくみが差しかえる）。アカウントIDは `GET /client/v4/accounts` で調べる。
  - Cloudflare は Python の標準の User-Agent を断る（error 1010）ので、Python から呼ぶときは User-Agent をつける。

## 生きている人にかかわるカード（落合陽一・TRON など）

- カードの説明は、本人の経歴・研究・作品などの事実だけを書く。本人が言っていないセリフは作らない。
- 絵は顔を描かず、研究や作品（鏡・波・建物など）をえがく。
- 商標の名前（登録商標の作品名など）は使わず、ふつうの言葉にする（例：「デジタルツイン」）。
- TRONのパックの目玉は、人物ではなく「TRON」（プロジェクト。exユニット）にしてある。

## わかっている課題・まだ確かめていないこと

- Claude の中のオンライン対戦は、偽の `window.claude` でしか試していない（本当の2つのアカウントでは未確認）。
- サイト版の WebRTC 対戦は、同じパソコンの2つのページでしか試していない。TURN サーバーがないので、学校や会社のネットワーク・携帯回線の組み合わせによってはつながらないことがある（そのときは25秒ほどで「つながりませんでした」と出る）。
- 画面は主にスマホの縦長（390×844）とパソコン（1280×860）で確かめている。iPad（第9世代・Safari、横向きは 1080×810 ほど）は、使う人に実機で見てもらっている。
- バランス（`node test/rates.js 300`、2026年11月24日）：ネットワーク網 58%・COBOL開発チーム 57%・どこでもコンピュータ 56% が強いほう、量子とAI 40〜41% がいちばん弱い。19デッキすべて 40〜58%。「遍在する計算機」を入れたときの調整：TRON の HP 150→140、IoT のワザは無色3個（どこでもコンピュータはネットワークのエネルギーを使わないので）、タブ・パッド・ボードは2種類でも+20（3種類で+40）、タブのにげるは0、パッドのワザは無色1個。
- CPU同士の勝率は「CPUがそのデッキをどれだけうまく使えるか」も表す。たとえばリレー回路やワンタイムパッドを今のCPUデッキに入れると、CPUがそれを使いすぎて勝率が下がった（だから入れていない）。人が組んだ、1つの進化ラインに集中したデッキは、プリセットより強くなりやすい（ビット2枚＋パリティビットの系統2組＋データ圧縮で、プリセット相手に7〜8割勝つ）。

## 次にやれそうなこと

- 「プログラミングの先駆者」シリーズの3つめ（候補：ジョン・バッカス（FORTRAN）、デニス・リッチー（C言語・UNIX）、エドガー・ダイクストラ（構造化プログラミング））や、「コンピュータの父」シリーズの4つめ（ティム・バーナーズ＝リー、ジョン・マッカーシーなど）。前の `isNew` を消して、新しいものにつける。
- フィールドのカードをふやす（いまは TRONハウス だけ。しくみは `kind: 'field'` で、どのシリーズでも使える）。
- デジタルツインの「分身」は、CPU同士だとほとんど起きない（バトル場でダウンし、山札にもう1枚残っているときだけ）。もっと出番をふやすなら、効果を見直す。
- デッキをコードにして友だちと共有する。
- 効果音・BGM（Web Audio でその場で作る。音のファイルは使わない）。
- TURN サーバーを使えるようにして、サイト版の対戦をつながりやすくする（Cloudflare の TURN を使うなら、Worker で短い期限の資格情報をつくって渡す形になる）。
