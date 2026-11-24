'use strict';
/* =========================================================
   CS用語カードバトル — カードデータ
   ユニット = ポケポケの「ポケモン」にあたるカード
   v1 = たね / v2 = 1進化 / v3 = 2進化
   コスト記号: A=アルゴリズム D=データ N=ネットワーク S=セキュリティ H=ハードウェア I=AI C=無色
   ========================================================= */

const TYPES = {
  algo: { name: 'アルゴリズム', k: '算', c: '#2f8a4f' },
  data: { name: 'データ', k: '記', c: '#2c5fae' },
  net: { name: 'ネットワーク', k: '網', c: '#b07f06' },
  sec: { name: 'セキュリティ', k: '鍵', c: '#c0392b' },
  hw: { name: 'ハードウェア', k: '機', c: '#cf6420' },
  ai: { name: 'AI', k: '脳', c: '#7547ad' },
  none: { name: '無色', k: '無', c: '#7d7564' },
};
const TYPE_ORDER = ['algo', 'data', 'net', 'sec', 'hw', 'ai', 'none'];

/* 弱点：キーのタイプは、値のタイプのワザで +20 ダメージを受ける */
const WEAK = { algo: 'hw', data: 'algo', ai: 'data', sec: 'ai', net: 'sec', hw: 'net', none: null };
const WEAK_WHY = {
  algo: '圧倒的な計算性能による「力わざ」が、工夫したアルゴリズムを上回ることがある',
  data: 'データはアルゴリズムによって整理・処理される',
  ai: 'AIの性能は学習データしだい（Garbage In, Garbage Out）',
  sec: 'AIで自動化された攻撃は、守る側にとって大きな脅威',
  net: 'ファイアウォールなどのセキュリティが通信を遮断する',
  hw: '大量の通信（DDoS攻撃）は機器の処理能力をあふれさせる',
};

const STATUS = {
  bug: { name: 'バグ', short: 'BUG', text: '番の終わりのチェックごとに10ダメージ。' },
  sleep: { name: 'スリープ', short: 'SLP', text: 'ワザもにげるも使えない。チェックごとにコインを投げ、オモテで回復。' },
  freeze: { name: 'フリーズ', short: 'FRZ', text: 'ワザもにげるも使えない。自分の次の番の終わりに回復。' },
  garble: { name: '文字化け', short: '???', text: 'ワザを使うときコインを投げ、ウラならワザは失敗。' },
};

/* ---------- ユニット ---------- */
const MONSTERS = [
  /* ===== アルゴリズム ===== */
  {
    id: 'brute', name: '全探索', en: 'Brute-force search', type: 'algo', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: 'しらみつぶし', cost: 'A', dmg: 0, label: '10×', text: 'コインを3回投げ、オモテの数×10ダメージ。',
      dmgFn: async c => { c.dmg = 10 * await c.heads(3); },
    }],
    desc: '考えられるすべての候補を、ひとつずつ順番に調べる方法。必ず答えが見つかるが、候補が増えると計算時間が爆発的に増える。',
  },
  {
    id: 'memo', name: 'メモ化再帰', en: 'Memoization', type: 'algo', stage: 2, from: '全探索', hp: 90, retreat: 1,
    atk: [{
      name: '計算結果の再利用', cost: 'AC', dmg: 40, label: '40+', text: '前の自分の番にも、このユニットがこのワザを使っていたら、40ダメージ追加。',
      dmgFn: async c => { if (c.usedLastTurn('計算結果の再利用')) c.dmg += 40; },
    }],
    desc: '一度計算した結果をメモ（記録）しておき、同じ計算をくり返さないようにした再帰。フィボナッチ数の計算などが劇的に速くなる。',
  },
  {
    id: 'dp', name: '動的計画法', en: 'Dynamic programming', type: 'algo', stage: 3, from: 'メモ化再帰', hp: 140, retreat: 2,
    atk: [{
      name: '最適部分構造', cost: 'AAC', dmg: 60, label: '60+', text: '自分のベンチのユニットの数×20ダメージ追加。',
      dmgFn: async c => { c.dmg += 20 * c.p.bench.length; },
    }],
    desc: '大きな問題を小さな部分問題に分け、その答えを表に記録しながら積み上げて解く手法。ナップサック問題や最短経路問題などに使われる。',
  },
  {
    id: 'bubble', name: 'バブルソート', en: 'Bubble sort', type: 'algo', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: '隣と交換', cost: 'A', dmg: 20 }],
    desc: '隣り合う要素を比べ、順番が逆なら入れ替える操作をくり返して並べる整列（ソート）法。単純だが遅く、計算量はO(n²)。',
  },
  {
    id: 'quick', name: 'クイックソート', en: 'Quicksort', ex: true, type: 'algo', stage: 2, from: 'バブルソート', hp: 150, retreat: 1,
    atk: [
      { name: 'ピボット選択', cost: 'A', dmg: 30 },
      {
        name: '分割統治', cost: 'AAC', dmg: 120, label: '120', text: 'コインを1回投げ、ウラならこのワザのダメージは60になる（最悪ケース）。',
        dmgFn: async c => { if (!await c.flip()) { c.dmg = 60; c.say('最悪ケース O(n²)…'); } },
      },
    ],
    desc: '基準値（ピボット）を選んで「小さいグループ」と「大きいグループ」に分ける操作を、再帰的にくり返すソート。平均O(n log n)と高速だが、最悪の場合はO(n²)になる。',
  },
  {
    id: 'dijkstra', name: 'ダイクストラ法', en: "Dijkstra's algorithm", ex: true, type: 'algo', stage: 1, hp: 140, retreat: 2,
    atk: [
      { name: '経路探索', cost: 'A', dmg: 20 },
      { name: '最短経路', cost: 'AAC', dmg: 80, pick: true, text: '相手のユニット1体を選び、そのユニットに80ダメージ。（ベンチのユニットには弱点を計算しない）' },
    ],
    desc: '各辺に「距離（重み）」がついたグラフで、ある地点から各地点への最短経路を求めるアルゴリズム。重みが負でないことが条件。カーナビや乗換案内などの経路探索の基礎になっている。',
  },
  {
    id: 'binsearch', name: '二分探索', en: 'Binary search', type: 'algo', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '範囲をしぼる', cost: 'AC', dmg: 30, label: '30+', text: '相手のバトル場のユニットの残りHPが、最大HPの半分以下なら40ダメージ追加。',
      dmgFn: async c => { if (c.foe && c.hpLeft(c.foe) * 2 <= c.maxHp(c.foe)) c.dmg += 40; },
    }],
    desc: '並べ替え済みのデータの真ん中と比べ、探す範囲を半分ずつにしぼり込む探索法。100万件のデータでも、約20回の比較で見つけられる。',
  },

  {
    id: 'greedy', name: '貪欲法', en: 'Greedy algorithm', type: 'algo', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: '目先の最善', cost: 'AC', dmg: 40, pick: 'lowest', text: '相手のユニットのうち、残りHPがいちばん少ないユニットに40ダメージ。（ベンチのユニットには弱点を計算しない）' }],
    desc: 'その時点でいちばん良さそうな選択を、先のことは考えずにくり返す方法。速くて単純だが、全体として最善の答えになるとは限らない。おつりの硬貨を大きい順に選ぶ問題などで使われる。',
  },
  {
    id: 'merge', name: 'マージソート', en: 'Merge sort', type: 'algo', stage: 2, from: 'バブルソート', hp: 100, retreat: 1,
    atk: [{ name: '分割して統合', cost: 'AC', dmg: 60 }],
    desc: 'データを半分ずつに分けて並べ、それを合わせ（マージし）ながら整列するソート。最悪でもO(n log n)で、同じ値の順番がくずれない「安定ソート」。1945年にフォン・ノイマンが考えた。',
  },
  {
    id: 'bfs', name: '幅優先探索', en: 'Breadth-first search', type: 'algo', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: '近い順に探索', cost: 'A', dmg: 20, text: '相手のベンチのユニット全員にも、10ダメージずつ。',
      after: async c => { c.hitBench(10); },
      ai: (g, p) => other(g, p).bench.length * 6,
    }],
    desc: 'スタート地点から近い順に、同じ距離のところをすべて調べてから次へ進む探索法。重みのないグラフなら最短経路が求められる。',
  },
  {
    id: 'astar', name: 'A*探索', en: 'A* search', ex: true, type: 'algo', stage: 2, from: '幅優先探索', hp: 160, retreat: 2,
    atk: [
      { name: '推定コスト', cost: 'A', dmg: 30 },
      { name: '最適経路', cost: 'AAC', dmg: 100 },
    ],
    desc: '「ここまでのコスト」と「ゴールまでの推定コスト（ヒューリスティック）」の合計が小さい順に調べる探索法。ゲームのキャラクターの移動などに使われる。',
  },
  /* ===== データ ===== */
  {
    id: 'tree', name: 'ツリー', en: 'Tree', type: 'data', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: '枝分かれ', cost: 'D', dmg: 20 }],
    desc: 'データを親子関係で階層的に表すデータ構造。いちばん上を「根（ルート）」、末端を「葉（リーフ）」と呼ぶ。パソコンのフォルダ構造もツリーになっている。',
  },
  {
    id: 'bst', name: '二分探索木', en: 'Binary search tree', type: 'data', stage: 2, from: 'ツリー', hp: 90, retreat: 1,
    atk: [{ name: '左右に振り分け', cost: 'DC', dmg: 50 }],
    desc: '各ノードについて「左側の子孫は小さく、右側の子孫は大きい」というルールを守る二分木。探索・追加・削除が平均O(log n)でできるが、木がかたよると遅くなる。',
  },
  {
    id: 'rbtree', name: '赤黒木', en: 'Red-black tree', type: 'data', stage: 3, from: '二分探索木', hp: 150, retreat: 2,
    atk: [{
      name: '回転操作', cost: 'DDC', dmg: 100, text: 'このユニットのHPを20回復する。',
      after: async c => { c.heal(c.me, 20); },
      ai: (g, p, m) => Math.min(20, m.dmg) * 0.6,
    }],
    desc: 'ノードを赤と黒に塗り分けるルールで、木の高さがかたよらないよう自動で調整する「平衡二分探索木」。最悪でもO(log n)を保証し、JavaのTreeMapなどの実装に使われている。',
  },
  {
    id: 'stack', name: 'スタック', en: 'Stack', type: 'data', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '積み上げ', cost: 'D', dmg: 0, label: '20×', text: 'このユニットについているエネルギーの数×20ダメージ。',
      dmgFn: async c => { c.dmg = 20 * c.me.energy.length; },
    }],
    desc: '最後に入れたデータを最初に取り出す（LIFO: Last In, First Out）データ構造。関数呼び出しの管理や「元に戻す」機能に使われる。',
  },
  {
    id: 'queue', name: 'キュー', en: 'Queue', type: 'data', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '順番待ち', cost: 'DC', dmg: 30, label: '30+', text: 'このユニットが前の自分の番からバトル場にいるなら、30ダメージ追加。',
      dmgFn: async c => { if (c.me.activeSince <= c.g.turn - 2) c.dmg += 30; },
    }],
    desc: '最初に入れたデータを最初に取り出す（FIFO: First In, First Out）データ構造。プリンタの印刷待ちなど、順番を守る処理に使われる。',
  },
  {
    id: 'hash', name: 'ハッシュテーブル', en: 'Hash table', ex: true, type: 'data', stage: 1, hp: 150, retreat: 2,
    atk: [
      { name: 'キー検索', cost: 'D', dmg: 20 },
      { name: 'O(1)アクセス', cost: 'DDC', dmg: 80, pierce: true, text: 'このワザのダメージは、相手のユニットの特性やワザの効果で減らされない。' },
    ],
    desc: 'キーからハッシュ関数で格納場所を計算し、データを平均O(1)で取り出せるデータ構造。辞書（連想配列）の実装などに使われる。',
  },

  {
    id: 'array', name: '配列', en: 'Array', type: 'data', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: 'インデックス指定', cost: 'C', dmg: 20, pick: true, text: '相手のユニット1体を選び、そのユニットに20ダメージ。（ベンチのユニットには弱点を計算しない）' }],
    desc: '同じ種類のデータを、番号（インデックス）つきで一列に並べたデータ構造。番号を指定すれば、どの要素にもすぐにアクセスできる。',
  },
  {
    id: 'pqueue', name: '優先度付きキュー', en: 'Priority queue', type: 'data', stage: 2, from: 'キュー', hp: 90, retreat: 1,
    atk: [{
      name: '優先処理', cost: 'DC', dmg: 40, text: '自分のユニットのうち、いちばんダメージを受けているユニットのHPを20回復する。',
      after: async c => { c.healMostDamaged(20); },
      ai: (g, p) => Math.min(20, Math.max(0, ...inPlay(p).map(m => m.dmg))) * 0.6,
    }],
    desc: '入れた順ではなく、「優先度」の高いものから取り出すキュー。ヒープを使って効率よく実装でき、OSのタスク管理やダイクストラ法などに使われる。',
  },
  {
    id: 'graph', name: 'グラフ', en: 'Graph', type: 'data', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '辺でつなぐ', cost: 'CC', dmg: 0, label: '10×', text: 'おたがいのベンチのユニットの数の合計×10ダメージ。',
      dmgFn: async c => { c.dmg = 10 * (c.p.bench.length + c.o.bench.length); },
    }],
    desc: '「頂点（ノード）」と、それらを結ぶ「辺（エッジ）」で関係を表すデータ構造。路線図やSNSの友だち関係、Webページどうしのリンクなどを表せる。',
  },
  {
    id: 'rdb', name: 'リレーショナルDB', en: 'Relational database', ex: true, type: 'data', stage: 1, hp: 150, retreat: 2,
    atk: [
      {
        name: 'SELECT', cost: 'D', dmg: 20, text: '自分の山札からランダムなコマンドを1枚、手札に加える。',
        after: async c => { c.searchDeck(d => d.kind !== 'mon', 'コマンド'); },
        ai: (g, p) => (p.deck.some(x => DEF[x.id].kind !== 'mon') ? 8 : 0),
      },
      {
        name: 'JOIN', cost: 'DDC', dmg: 40, label: '40+', text: '自分のベンチのデータタイプのユニットの数×20ダメージ追加。',
        dmgFn: async c => { c.dmg += 20 * c.p.bench.filter(m => DEF[m.id].type === 'data').length; },
      },
    ],
    desc: 'データを行と列からなる「表（テーブル）」で管理し、表どうしを関連づけて使うデータベース。SQLという言語でデータを検索・更新する。',
  },
  /* ===== ネットワーク ===== */
  {
    id: 'ip', name: 'IP', en: 'Internet Protocol', type: 'net', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: 'パケット送信', cost: 'N', dmg: 30, text: 'コインを1回投げ、ウラならこのワザは失敗（パケットロス）。',
      dmgFn: async c => { if (!await c.flip()) { c.dmg = 0; c.say('パケットロス！'); } },
    }],
    desc: 'データを小さな「パケット」に分け、IPアドレスを宛先にして届けるための通信ルール（プロトコル）。届くことを保証しない「ベストエフォート」型。',
  },
  {
    id: 'tcp', name: 'TCP', en: 'Transmission Control Protocol', type: 'net', stage: 2, from: 'IP', hp: 90, retreat: 1,
    atk: [{ name: '確実な配達', cost: 'NC', dmg: 50 }],
    desc: '通信の前に相手と接続を確立し（3ウェイハンドシェイク）、届かなかったデータは再送して、正しい順番で確実に届ける通信ルール。',
  },
  {
    id: 'http', name: 'HTTP', en: 'Hypertext Transfer Protocol', type: 'net', stage: 3, from: 'TCP', hp: 140, retreat: 2,
    atk: [{
      name: 'ステータスコード', cost: 'NNC', dmg: 80, label: '80+', text: 'コインを1回投げ、オモテなら40ダメージ追加（200 OK）。ウラなら追加なし（404 Not Found）。',
      dmgFn: async c => { if (await c.flip()) { c.dmg += 40; c.say('200 OK'); } else c.say('404 Not Found'); },
    }],
    desc: 'WebブラウザとWebサーバーがやりとりするための通信ルール。ブラウザが「リクエスト」を送ると、サーバーが「200 OK」や「404 Not Found」などのステータスコードつきの「レスポンス」を返す。',
  },
  {
    id: 'dns', name: 'DNS', en: 'Domain Name System', type: 'net', stage: 1, hp: 70, retreat: 1,
    atk: [
      {
        name: '名前解決', cost: 'C', dmg: 0, text: '自分の山札からランダムなv1ユニットを1枚、ベンチに出す。',
        after: async c => { c.benchFromDeck(d => d.stage === 1); },
        ai: (g, p) => (p.bench.length < BENCH_MAX && p.deck.some(isBasic) ? 30 : -20),
      },
      { name: '問い合わせ', cost: 'NC', dmg: 30 },
    ],
    desc: '「example.com」のようなドメイン名を、コンピュータが使うIPアドレスに変換するしくみ。インターネットの「電話帳」とも呼ばれる。',
  },
  {
    id: 'router', name: 'ルーター', en: 'Router', type: 'net', stage: 1, hp: 80, retreat: 1,
    ability: { name: 'ルーティング', kind: 'active', text: '自分の番に1回使える。自分のベンチのユニットについているエネルギーを1個、バトル場のユニットに付け替える。' },
    atk: [{ name: '転送', cost: 'NC', dmg: 30 }],
    desc: '異なるネットワーク同士をつなぎ、パケットの宛先を見て次の転送先（経路）を決める機器。家庭のWi-Fiルーターもその一種。',
  },
  {
    id: 'cloud', name: 'クラウド', en: 'Cloud computing', ex: true, type: 'net', stage: 1, hp: 150, retreat: 2,
    atk: [{
      name: 'スケールアウト', cost: 'NN', dmg: 0, label: '30×', text: '自分のベンチのユニットの数×30ダメージ。',
      dmgFn: async c => { c.dmg = 30 * c.p.bench.length; },
    }],
    desc: 'サーバーやストレージなどを、インターネット経由で必要なときに必要な分だけ借りて使うしくみ。負荷に応じてサーバーの台数を増やす「スケールアウト」が簡単にできる。',
  },

  {
    id: 'udp', name: 'UDP', en: 'User Datagram Protocol', type: 'net', stage: 2, from: 'IP', hp: 90, retreat: 1,
    atk: [{
      name: '投げっぱなし送信', cost: 'NC', dmg: 0, label: '30×', text: 'コインを4回投げ、オモテの数×30ダメージ。',
      dmgFn: async c => { c.dmg = 30 * await c.heads(4); },
    }],
    desc: '接続の確立や再送をせずに、データを送りっぱなしにする通信ルール。届く保証はないがとても速いので、動画配信やオンラインゲームなどに使われる。',
  },
  {
    id: 'wlan', name: '無線LAN', en: 'Wireless LAN', type: 'net', stage: 1, hp: 60, retreat: 0,
    atk: [{ name: '電波を飛ばす', cost: 'N', dmg: 20 }],
    desc: 'ケーブルを使わず、電波でつながるネットワーク。よく聞く「Wi-Fi」は、無線LANの規格（IEEE 802.11）に対応していることを示すブランド名。',
  },
  {
    id: 'vpn', name: 'VPN', en: 'Virtual Private Network', type: 'net', stage: 1, hp: 80, retreat: 1,
    atk: [{
      name: 'トンネリング', cost: 'NC', dmg: 30, text: 'ワザのあと、このユニットを自分のベンチのユニットと入れ替える。',
      after: async c => { await c.switchSelf(); },
      ai: (g, p) => (p.bench.length ? 6 : 0),
    }],
    desc: 'インターネットの上に、暗号化された仮想の専用線（トンネル）を作るしくみ。外出先から会社のネットワークに安全につなぐときなどに使われる。',
  },
  {
    id: 'cdn', name: 'CDN', en: 'Content Delivery Network', ex: true, type: 'net', stage: 1, hp: 140, retreat: 2,
    atk: [
      { name: 'キャッシュ配信', cost: 'N', dmg: 20 },
      {
        name: 'エッジ配信', cost: 'NNC', dmg: 40, text: '相手のベンチのユニット全員にも、30ダメージずつ。',
        after: async c => { c.hitBench(30); },
        ai: (g, p) => other(g, p).bench.length * 18,
      },
    ],
    desc: '世界中に置いたサーバー（エッジ）にWebページや動画のコピーを配っておき、利用者のいちばん近くから届けるしくみ。アクセスの集中にも強い。',
  },
  /* ===== セキュリティ ===== */
  {
    id: 'password', name: 'パスワード', en: 'Password', type: 'sec', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: 'ログイン', cost: 'S', dmg: 20 }],
    desc: '本人であることを確かめるための秘密の文字列。短いもの・推測しやすいもの・使い回しは危険で、長くて推測されにくいものが安全。',
  },
  {
    id: 'twofa', name: '二段階認証', en: 'Two-step verification', type: 'sec', stage: 2, from: 'パスワード', hp: 90, retreat: 1,
    atk: [{
      name: 'ワンタイムコード', cost: 'SC', dmg: 40, text: '次の相手の番、このユニットが受けるワザのダメージを-20する。',
      after: async c => { c.me.shield = { turn: c.g.turn + 1, amt: 20 }; c.log(`${c.name(c.me)}は次の相手の番、ダメージ-20`); },
      ai: () => 10,
    }],
    desc: 'パスワードに加えて、スマホに届く確認コードなどで2段階の本人確認を行うしくみ。パスワードがもれても不正ログインされにくくなる。',
  },
  {
    id: 'zerotrust', name: 'ゼロトラスト', en: 'Zero trust', type: 'sec', stage: 3, from: '二段階認証', hp: 150, retreat: 2,
    ability: { name: '常に検証', kind: 'passive', reduce: 20, text: 'このユニットが受けるワザのダメージを-20する。' },
    atk: [{ name: '全アクセス検証', cost: 'SSC', dmg: 90 }],
    desc: '「社内のネットワークだから安全」とは考えず、すべてのアクセスを毎回検証するセキュリティの考え方。「決して信頼せず、常に検証せよ」が基本原則。',
  },
  {
    id: 'firewall', name: 'ファイアウォール', en: 'Firewall', type: 'sec', stage: 1, hp: 90, retreat: 3,
    ability: { name: 'パケットフィルタ', kind: 'passive', reduce: 20, text: 'このユニットが受けるワザのダメージを-20する。' },
    atk: [{
      name: '遮断', cost: 'SCC', dmg: 40, text: 'コインを1回投げ、オモテなら相手のバトル場のユニットをフリーズにする。',
      after: async c => { if (c.foeAlive() && await c.flip()) c.status(c.foe, 'freeze'); },
      ai: () => 10,
    }],
    desc: 'ネットワークの出入口で通信を監視し、決められたルールに従って、許可されていない通信を遮断するしくみ。名前は建物の「防火壁」に由来する。',
  },
  {
    id: 'caesar', name: 'シーザー暗号', en: 'Caesar cipher', type: 'sec', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: '文字ずらし', cost: 'S', dmg: 10, text: 'コインを1回投げ、オモテなら相手のバトル場のユニットを文字化けにする。',
      after: async c => { if (c.foeAlive() && await c.flip()) c.status(c.foe, 'garble'); },
      ai: (g, p) => { const f = other(g, p).active; return f && !f.status.garble ? 10 : 0; },
    }],
    desc: 'アルファベットを決まった数だけずらして暗号にする、もっとも古典的な暗号のひとつ。ユリウス・カエサルが使ったとされる。ずらし方は25通りしかないので、総当たりですぐに解読できる。',
  },
  {
    id: 'pubkey', name: '公開鍵暗号', en: 'Public-key cryptography', ex: true, type: 'sec', stage: 2, from: 'シーザー暗号', hp: 160, retreat: 2,
    atk: [
      {
        name: '公開鍵で暗号化', cost: 'SC', dmg: 20, text: '相手のバトル場のユニットを文字化けにする。',
        after: async c => { if (c.foeAlive()) c.status(c.foe, 'garble'); },
        ai: (g, p) => { const f = other(g, p).active; return f && !f.status.garble ? 24 : 0; },
      },
      { name: '秘密鍵で復号', cost: 'SSC', dmg: 110 },
    ],
    desc: '暗号化用の「公開鍵」と復号用の「秘密鍵」をペアで使う暗号方式。公開鍵は誰に配っても安全で、HTTPSの通信や電子署名を支えている。',
  },
  {
    id: 'virus', name: 'ウイルス', en: 'Computer virus', type: 'sec', stage: 1, hp: 50, retreat: 1,
    atk: [
      {
        name: '自己複製', cost: 'C', dmg: 0, text: '自分の山札から「ウイルス」を1枚、ベンチに出す。',
        after: async c => { c.benchFromDeck(d => d.id === 'virus'); },
        ai: (g, p) => (p.bench.length < BENCH_MAX && p.deck.some(x => x.id === 'virus') ? 26 : -20),
      },
      {
        name: '感染', cost: 'S', dmg: 10, text: '相手のバトル場のユニットをバグ状態にする。',
        after: async c => { if (c.foeAlive()) c.status(c.foe, 'bug'); },
        ai: (g, p) => { const f = other(g, p).active; return f && !f.status.bug ? 18 : 0; },
      },
    ],
    desc: 'ほかのプログラムやファイルに入り込んで自分を複製し、感染を広げる悪意のあるプログラム。マルウェアの一種。',
  },

  {
    id: 'hashfn', name: 'ハッシュ関数', en: 'Hash function', type: 'sec', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: 'ダイジェスト', cost: 'S', dmg: 20 }],
    desc: 'どんな長さのデータからも、決まった長さの値（ハッシュ値）を計算する関数。元のデータが少しでも変わるとまったく違う値になり、ハッシュ値から元のデータを求めるのは非常に難しい。',
  },
  {
    id: 'digsig', name: 'デジタル署名', en: 'Digital signature', type: 'sec', stage: 2, from: 'ハッシュ関数', hp: 90, retreat: 1,
    atk: [{
      name: '改ざん検知', cost: 'SC', dmg: 40, label: '40+', text: '相手のバトル場のユニットがv2かv3なら、30ダメージ追加。',
      dmgFn: async c => { if (c.foe && DEF[c.foe.id].stage >= 2) c.dmg += 30; },
    }],
    desc: 'データのハッシュ値を秘密鍵で暗号化して添える、電子的な署名。公開鍵で確かめることで「本人が作ったこと」と「途中で改ざんされていないこと」がわかる。',
  },
  {
    id: 'blockchain', name: 'ブロックチェーン', en: 'Blockchain', type: 'sec', stage: 3, from: 'デジタル署名', hp: 150, retreat: 2,
    atk: [{
      name: 'ブロック連結', cost: 'SSC', dmg: 60, label: '60+', text: 'このユニットがこれまでにこのワザを使った回数×20ダメージ追加。',
      dmgFn: async c => { c.dmg += 20 * (c.me.chain || 0); },
      after: async c => { c.me.chain = (c.me.chain || 0) + 1; },
    }],
    desc: '取引の記録を「ブロック」にまとめ、前のブロックのハッシュ値を含めて鎖のようにつなげたデータ構造。たくさんのコンピュータで同じ記録を持ち合うため、改ざんがきわめて難しい。',
  },
  {
    id: 'phishing', name: 'フィッシング', en: 'Phishing', type: 'sec', stage: 1, hp: 50, retreat: 1,
    atk: [{
      name: 'なりすましメール', cost: 'S', dmg: 10, text: '相手の手札からランダムに1枚、トラッシュする。',
      after: async c => { c.discardOppHand(1); },
      ai: (g, p) => (other(g, p).hand.length ? 16 : 0),
    }],
    desc: '本物そっくりのメールや偽サイトで、パスワードやカード番号などをだまし取る詐欺。名前は「釣り（fishing）」に由来するとされる。',
  },
  {
    id: 'ransom', name: 'ランサムウェア', en: 'Ransomware', ex: true, type: 'sec', stage: 1, hp: 140, retreat: 2,
    atk: [
      { name: 'ファイル暗号化', cost: 'S', dmg: 20 },
      {
        name: '身代金要求', cost: 'SSC', dmg: 60, text: 'コインを1回投げ、オモテなら次の相手の番、相手はエネルギーゾーンからエネルギーをつけられない。',
        after: async c => { if (await c.flip()) c.lockOppEnergy(); },
        ai: () => 8,
      },
    ],
    desc: 'パソコンのファイルを勝手に暗号化して使えなくし、元に戻すかわりに身代金を要求するマルウェア。日ごろのバックアップが最大の対策になる。',
  },
  /* ===== ハードウェア ===== */
  {
    id: 'transistor', name: 'トランジスタ', en: 'Transistor', type: 'hw', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: 'スイッチOFF', cost: 'H', dmg: 10, text: 'コインを1回投げ、オモテなら相手のバトル場のユニットをスリープにする。',
      after: async c => { if (c.foeAlive() && await c.flip()) c.status(c.foe, 'sleep'); },
      ai: (g, p) => { const f = other(g, p).active; return f && !f.status.sleep ? 10 : 0; },
    }],
    desc: '電気信号を増幅したり、ON/OFFを切り替えたりする半導体素子。現代のCPUには、これが数十億個以上も詰め込まれている。',
  },
  {
    id: 'gate', name: '論理ゲート', en: 'Logic gate', type: 'hw', stage: 2, from: 'トランジスタ', hp: 90, retreat: 1,
    atk: [{
      name: 'ANDゲート', cost: 'HC', dmg: 40, label: '40+', text: 'コインを2回投げ、両方オモテなら40ダメージ追加。',
      dmgFn: async c => { if (await c.heads(2) === 2) { c.dmg += 40; c.say('1 AND 1 = 1'); } },
    }],
    desc: 'AND・OR・NOTなどの論理演算を行う電子回路。トランジスタを組み合わせて作られ、あらゆるデジタル回路の部品になる。',
  },
  {
    id: 'cpu', name: 'CPU', en: 'Central Processing Unit', type: 'hw', stage: 3, from: '論理ゲート', hp: 140, retreat: 2,
    atk: [
      { name: '命令実行', cost: 'HHC', dmg: 80 },
      {
        name: 'オーバークロック', cost: 'HHHC', dmg: 150, text: 'このユニットにも30ダメージ。',
        after: async c => { c.selfDmg(30); },
        ai: (g, p, m) => (hpLeft(m) <= 30 ? -300 : -12),
      },
    ],
    desc: 'プログラムの命令を読み取り、計算や制御を行う「コンピュータの頭脳」。膨大な数の論理ゲートが組み合わさってできている。',
  },
  {
    id: 'cache', name: 'キャッシュメモリ', en: 'Cache memory', type: 'hw', stage: 1, hp: 60, retreat: 0,
    atk: [{
      name: 'キャッシュヒット', cost: 'H', dmg: 10, label: '10+', text: 'コインを1回投げ、オモテなら30ダメージ追加（キャッシュヒット）。',
      dmgFn: async c => { if (await c.flip()) { c.dmg += 30; c.say('キャッシュヒット！'); } else c.say('キャッシュミス…'); },
    }],
    desc: 'CPUとメインメモリの速度差を埋めるため、よく使うデータを一時的に置いておく、小さくて高速な記憶装置。',
  },
  {
    id: 'gpu', name: 'GPU', en: 'Graphics Processing Unit', ex: true, type: 'hw', stage: 1, hp: 150, retreat: 2,
    atk: [
      { name: '描画', cost: 'HC', dmg: 30 },
      {
        name: '並列演算', cost: 'HHC', dmg: 0, label: '40×', text: 'コインを4回投げ、オモテの数×40ダメージ。',
        dmgFn: async c => { c.dmg = 40 * await c.heads(4); },
      },
    ],
    desc: '大量の単純な計算を同時に（並列に）こなすのが得意なプロセッサ。もとは画像処理用だったが、今ではAIの学習にも欠かせない。',
  },

  {
    id: 'vacuum', name: '真空管', en: 'Vacuum tube', type: 'hw', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '増幅', cost: 'HC', dmg: 40, text: 'コインを1回投げ、ウラならこのユニットにも10ダメージ（発熱）。',
      after: async c => { if (!await c.flip()) { c.say('アチチ…'); c.selfDmg(10); } },
      ai: () => -3,
    }],
    desc: 'ガラス管の中の電子の流れで、信号を増幅したり切り替えたりする部品。トランジスタが広まる前の初期のコンピュータで使われ、ENIAC（1946年公開）には約1万8000本も使われていた。',
  },
  {
    id: 'mainmem', name: 'メインメモリ', en: 'Main memory', type: 'hw', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: 'データ読み込み', cost: 'HC', dmg: 30, label: '30+', text: '自分の場に「キャッシュメモリ」がいるなら、30ダメージ追加。',
      dmgFn: async c => { if (inPlay(c.p).some(m => m.id === 'cache')) c.dmg += 30; },
    }],
    desc: 'CPUが実行中のプログラムやデータを置いておく記憶装置（RAM）。電源を切ると内容が消える。容量が大きいほど、多くの作業を同時にこなせる。',
  },
  {
    id: 'quantum', name: '量子コンピュータ', en: 'Quantum computer', ex: true, type: 'hw', stage: 1, hp: 140, retreat: 2,
    atk: [
      { name: '量子ビット', cost: 'H', dmg: 20 },
      {
        name: '重ね合わせ', cost: 'HHC', dmg: 0, label: '120', text: 'コインを1回投げる。オモテなら相手のバトル場のユニットに120ダメージ。ウラなら相手のベンチのユニット全員に50ダメージずつ。',
        dmgFn: async c => { if (await c.flip()) c.dmg = 120; else { c.dmg = 0; c.flag = 'spread'; c.say('|0⟩ + |1⟩'); } },
        after: async c => { if (c.flag === 'spread') c.hitBench(50); },
        ai: (g, p) => other(g, p).bench.length * 10,
      },
    ],
    desc: '0と1を同時にとる「重ね合わせ」などの量子力学の性質を使って計算するコンピュータ。素因数分解や物質のシミュレーションなど特定の問題を、従来のコンピュータより圧倒的に速く解けると期待されている。',
  },
  /* ===== AI ===== */
  {
    id: 'perceptron', name: 'パーセプトロン', en: 'Perceptron', type: 'ai', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: '線形分離', cost: 'I', dmg: 20 }],
    desc: '入力に「重み」をかけて足し合わせ、しきい値を超えるかどうかで出力を決めるモデル（1958年発表）。ニューラルネットワークの元祖だが、1層だけでは直線で分けられない問題（XORなど）は解けない。',
  },
  {
    id: 'nn', name: 'ニューラルネットワーク', en: 'Neural network', type: 'ai', stage: 2, from: 'パーセプトロン', hp: 90, retreat: 1,
    atk: [{
      name: '誤差逆伝播', cost: 'IC', dmg: 40, label: '40+', text: 'このユニットがダメージを受けているなら、30ダメージ追加。',
      dmgFn: async c => { if (c.me.dmg > 0) c.dmg += 30; },
    }],
    desc: '脳の神経細胞（ニューロン）のつながりをまねて、多数のパーセプトロンを層状につないだモデル。出力の誤差を逆向きに伝える「誤差逆伝播法」で重みを学習する。',
  },
  {
    id: 'dl', name: 'ディープラーニング', en: 'Deep learning', type: 'ai', stage: 3, from: 'ニューラルネットワーク', hp: 140, retreat: 2,
    atk: [{
      name: '多層学習', cost: 'IIC', dmg: 0, label: '30×', text: 'このユニットについているエネルギーの数×30ダメージ。',
      dmgFn: async c => { c.dmg = 30 * c.me.energy.length; },
    }],
    desc: '何層にも重ねた（深い）ニューラルネットワークで学習する手法。画像認識・音声認識・翻訳などで大きな成果を上げ、現在のAIブームの中心になった。',
  },
  {
    id: 'dtree', name: '決定木', en: 'Decision tree', type: 'ai', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '条件分岐', cost: 'IC', dmg: 30, label: '30+', text: '相手のバトル場のユニットがexなら、30ダメージ追加。',
      dmgFn: async c => { if (c.foe && DEF[c.foe.id].ex) c.dmg += 30; },
    }],
    desc: '「はい／いいえ」で答えられる質問を木の形に並べて、分類や予測を行う機械学習モデル。なぜその判断になったのかが人間にもわかりやすい。',
  },
  {
    id: 'rl', name: '強化学習', en: 'Reinforcement learning', type: 'ai', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '試行錯誤', cost: 'I', dmg: 40, label: '40', text: 'コインを1回投げ、ウラならダメージを与えず、かわりに自分のエネルギーゾーンからエネルギーを1個このユニットにつける。',
      dmgFn: async c => { if (!await c.flip()) { c.dmg = 0; c.flag = 'learn'; c.say('失敗から学習…'); } },
      after: async c => { if (c.flag === 'learn') c.attachFromZone(c.me, 1); },
      ai: () => 8,
    }],
    desc: '試行錯誤をくり返し、うまくいったときにもらえる「報酬」が最大になるような行動を学ぶ機械学習の手法。囲碁AIやロボットの制御などに使われる。',
  },
  {
    id: 'llm', name: '大規模言語モデル', en: 'Large language model', ex: true, type: 'ai', stage: 1, hp: 140, retreat: 2,
    atk: [
      {
        name: 'プロンプト応答', cost: 'I', dmg: 20, text: '自分の山札を1枚引く。',
        after: async c => { c.draw(1); },
        ai: (g, p) => (p.deck.length ? 6 : 0),
      },
      {
        name: '文章生成', cost: 'IIC', dmg: 130, label: '130', text: 'コインを1回投げ、ウラならこのワザのダメージは30になる（ハルシネーション）。',
        dmgFn: async c => { if (!await c.flip()) { c.dmg = 30; c.say('ハルシネーション！'); } },
      },
    ],
    desc: '大量の文章から学習し、「次に来る単語（トークン）」を予測することで文章を生成するAI。もっともらしい誤り（ハルシネーション）を出すことがある。',
  },

  {
    id: 'cnn', name: 'CNN', en: 'Convolutional neural network', type: 'ai', stage: 3, from: 'ニューラルネットワーク', hp: 140, retreat: 2,
    atk: [{ name: '特徴抽出', cost: 'IIC', dmg: 90, alwaysWeak: true, label: '90+', text: '相手のバトル場のユニットが弱点でなくても、弱点と同じように+20ダメージ。' }],
    desc: '画像の小さな範囲を少しずつずらしながら特徴を取り出す「畳み込み」を使うニューラルネットワーク（畳み込みニューラルネットワーク）。画像認識で大きな成果を上げた。',
  },
  {
    id: 'knn', name: 'k近傍法', en: 'k-nearest neighbors', type: 'ai', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '多数決', cost: 'I', dmg: 0, label: '10×', text: '自分の場のユニットの数×10ダメージ。',
      dmgFn: async c => { c.dmg = 10 * inPlay(c.p).length; },
    }],
    desc: '新しいデータを、近くにある既存のデータk個の多数決で分類する機械学習の手法。しくみが単純でわかりやすい。',
  },
  {
    id: 'diffusion', name: '拡散モデル', en: 'Diffusion model', ex: true, type: 'ai', stage: 1, hp: 140, retreat: 2,
    atk: [
      { name: 'ノイズ追加', cost: 'I', dmg: 20 },
      {
        name: 'ノイズ除去', cost: 'IIC', dmg: 90, text: 'このユニットのHPを20回復する。',
        after: async c => { c.heal(c.me, 20); },
        ai: (g, p, m) => Math.min(20, m.dmg) * 0.6,
      },
    ],
    desc: '画像に少しずつノイズを加える過程を学習し、逆に「ノイズを取り除く」ことで、ノイズだけの状態から新しい画像を生成するAI。多くの画像生成AIで使われている。',
  },
  /* ===== 無色（プログラミングの基礎） ===== */
  {
    id: 'variable', name: '変数', en: 'Variable', type: 'none', stage: 1, hp: 50, retreat: 1,
    atk: [{
      name: '代入', cost: 'C', dmg: 10, text: '自分の山札を1枚引く。',
      after: async c => { c.draw(1); },
      ai: (g, p) => (p.deck.length ? 6 : 0),
    }],
    desc: '値を入れておくための、名前のついた入れ物。「x = 5」のように値を代入し、あとで取り出したり書き換えたりできる。',
  },
  {
    id: 'loop', name: 'ループ', en: 'Loop', type: 'none', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: 'while文', cost: 'CC', dmg: 0, label: '30×', text: 'ウラが出るまでコインを投げ、オモテの数×30ダメージ。',
      dmgFn: async c => { c.dmg = 30 * await c.headsUntilTails(); },
    }],
    desc: '条件を満たしているあいだ、または決まった回数だけ、同じ処理をくり返すプログラムの構造。終了条件をまちがえると「無限ループ」になる。',
  },
  {
    id: 'func', name: '関数', en: 'Function', type: 'none', stage: 1, hp: 70, retreat: 1,
    atk: [{ name: '呼び出し', cost: 'CC', dmg: 30 }],
    desc: '入力（引数）を受け取って処理を行い、結果（戻り値）を返す、ひとまとまりの手順。同じ処理を何度でも使い回せる。',
  },
  {
    id: 'recursion', name: '再帰', en: 'Recursion', type: 'none', stage: 2, from: '関数', hp: 90, retreat: 1,
    atk: [{
      name: '自己呼び出し', cost: 'CCC', dmg: 90, text: 'コインを1回投げ、ウラならこのユニットにも20ダメージ（スタックオーバーフロー）。',
      after: async c => { if (!await c.flip()) { c.say('スタックオーバーフロー！'); c.selfDmg(20); } },
      ai: (g, p, m) => (hpLeft(m) <= 20 ? -40 : -6),
    }],
    desc: '関数が自分自身を呼び出すこと。問題を「同じ形の小さな問題」に分けて解ける。終了条件がないと呼び出しが積み重なり、スタックオーバーフローを起こす。',
  },
  {
    id: 'turing', name: 'チューリングマシン', en: 'Turing machine', ex: true, type: 'none', stage: 1, hp: 160, retreat: 3,
    atk: [
      { name: 'テープの読み書き', cost: 'CC', dmg: 40 },
      { name: '万能シミュレーション', cost: 'CCC', dmg: 0, copy: true, text: '相手のバトル場のユニットのワザを1つ選び、このワザとして使う。' },
    ],
    desc: '1936年にアラン・チューリングが考えた、無限に長いテープと読み書きヘッドからなる計算の数学モデル。「計算できるとはどういうことか」を定義し、現代のコンピュータの理論的な基礎になった。',
  },
  {
    id: 'hello', name: 'Hello, World!', en: 'Hello, World!', type: 'none', stage: 1, hp: 50, retreat: 0,
    atk: [{ name: 'はじめの出力', cost: 'C', dmg: 20 }],
    desc: '画面に「Hello, World!」と表示するだけのプログラム。新しいプログラミング言語を学ぶとき、最初に書くことが多い。1978年の本『プログラミング言語C』で広く知られるようになった。',
  },
  {
    id: 'ifstmt', name: 'if文', en: 'If statement', type: 'none', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: '条件判定', cost: 'CC', dmg: 20, label: '20+', text: '相手のバトル場のユニットの残りHPが、このユニットの残りHPより多いなら40ダメージ追加。',
      dmgFn: async c => { if (c.foe && hpLeft(c.foe) > hpLeft(c.me)) c.dmg += 40; },
    }],
    desc: '「もし〜なら、この処理をする」と、条件によって実行する処理を切り替える文。「else（そうでなければ）」と組み合わせて使うことも多い。',
  },
  {
    id: 'lambda', name: 'ラムダ式', en: 'Lambda expression', type: 'none', stage: 2, from: '関数', hp: 80, retreat: 0,
    atk: [{ name: '無名関数', cost: 'C', dmg: 30 }],
    desc: '名前をつけずに、その場で短く書ける関数（無名関数）。数学者アロンゾ・チャーチが考えた「ラムダ計算」が名前の由来。',
  },
  {
    id: 'compiler', name: 'コンパイラ', en: 'Compiler', ex: true, type: 'none', stage: 1, hp: 150, retreat: 2,
    atk: [
      {
        name: 'ビルド', cost: 'CC', dmg: 20, text: '自分のベンチのユニット1体を選び、エネルギーゾーンからエネルギーを2個つける。',
        after: async c => { await c.chargeBench(2); },
        ai: (g, p) => (p.bench.length ? 26 : 0),
      },
      { name: '実行ファイル生成', cost: 'CCC', dmg: 90 },
    ],
    desc: '人間が書いたプログラム（ソースコード）を、コンピュータが実行できる機械語などにまとめて翻訳するソフトウェア。翻訳しながら1行ずつ実行するものは「インタプリタ」と呼ぶ。',
  },
  /* ===== 「コンピュータの父」シリーズ：アラン・チューリング ===== */
  {
    id: 'enigma', set: 'father', name: 'エニグマ', en: 'Enigma machine', type: 'sec', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: 'ローター暗号', cost: 'SC', dmg: 20, text: '相手のバトル場のユニットを文字化けにする。',
      after: async c => { if (c.foeAlive()) c.status(c.foe, 'garble'); },
      ai: (g, p) => { const f = other(g, p).active; return f && !f.status.garble ? 20 : 0; },
    }],
    desc: '第二次世界大戦中にドイツ軍が使った暗号機。キーを押すたびに中の回転子（ローター）が回り、文字の置きかえ方が変わる。ポーランドの数学者たちが解読の糸口を見つけ、イギリスのブレッチリー・パークで解読が進められた。',
  },
  {
    id: 'bombe', set: 'father', name: 'ボンブ', en: 'Bombe', type: 'hw', stage: 1, hp: 100, retreat: 2,
    atk: [{
      name: '総当たり解読', cost: 'HC', dmg: 40, label: '40+', text: '相手のバトル場のユニットがセキュリティタイプなら、50ダメージ追加。',
      dmgFn: async c => { if (c.target && DEF[c.target.id].type === 'sec') c.dmg += 50; },
    }],
    desc: 'エニグマの設定を見つけるために、アラン・チューリングらが設計した電気機械式の装置。暗号文にふくまれていそうな単語（クリブ）を手がかりに、ありえる回転子の位置を高速に調べた。',
  },
  {
    id: 'colossus', set: 'father', name: 'コロッサス', en: 'Colossus', type: 'hw', stage: 2, from: '真空管', hp: 110, retreat: 2,
    atk: [{
      name: '並列テープ読み取り', cost: 'HC', dmg: 40, label: '40+', text: '相手のバトル場のユニットが文字化けなら、40ダメージ追加。',
      dmgFn: async c => { if (c.target && c.target.status.garble) c.dmg += 40; },
    }],
    desc: '1944年にイギリスのブレッチリー・パークで動き出した、真空管を使った電子式の計算機。技術者トミー・フラワーズが設計し、ドイツ軍の上層部が使った暗号の解読に使われた。存在は戦後も長く秘密にされていた。',
  },
  {
    id: 'ace', set: 'father', name: 'ACE', en: 'Automatic Computing Engine', type: 'hw', stage: 3, from: 'コロッサス', hp: 150, retreat: 2,
    atk: [
      { name: 'パイロット運転', cost: 'H', dmg: 30 },
      { name: '自動計算', cost: 'HHC', dmg: 100 },
    ],
    desc: '1945年にアラン・チューリングが設計した、プログラムをメモリにしまって動かすコンピュータ。小型版の「パイロットACE」が1950年にイギリス国立物理学研究所で動き、当時もっとも速いコンピュータのひとつだった。',
  },
  {
    id: 'halting', set: 'father', name: '停止性問題', en: 'Halting problem', type: 'none', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: '止まるか？', cost: 'CC', dmg: 20, text: 'コインを1回投げ、オモテなら相手のバトル場のユニットをスリープにする。',
      after: async c => { if (c.foeAlive() && await c.flip()) c.status(c.foe, 'sleep'); },
      ai: (g, p) => { const f = other(g, p).active; return f && !f.status.sleep ? 10 : 0; },
    }],
    desc: 'どんなプログラムと入力についても「いつか止まるか、永遠に動き続けるか」を判定する問題。1936年にアラン・チューリングは、これを必ず正しく判定できる一般的な手順（アルゴリズム）は存在しないことを証明した。',
  },
  {
    id: 'eliza', set: 'father', name: 'イライザ', en: 'ELIZA', type: 'ai', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: 'オウム返し', cost: 'IC', dmg: 0, label: '20×', text: '相手のバトル場のユニットについているエネルギーの数×20ダメージ。',
      dmgFn: async c => { c.dmg = 20 * (c.target ? c.target.energy.length : 0); },
    }],
    desc: '1966年にジョセフ・ワイゼンバウムがつくった、初期のチャットボット（会話プログラム）。相手の言葉の一部をオウム返しにして質問で返すだけの単純なしくみだったが、本当に話を聞いてもらえていると感じる人も多かった。',
  },
  /* ===== 「コンピュータの父」シリーズ：ジョン・フォン・ノイマン ===== */
  {
    id: 'punch', set: 'father', name: 'パンチカード', en: 'Punched card', type: 'data', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: '読み取り', cost: 'C', dmg: 10, text: '自分の山札からランダムなハードウェアタイプのv1ユニットを1枚、ベンチに出す。',
      after: async c => { c.benchFromDeck(d => d.type === 'hw' && d.stage === 1); },
      ai: (g, p) => (p.bench.length < BENCH_MAX && p.deck.some(x => DEF[x.id].kind === 'mon' && DEF[x.id].type === 'hw' && DEF[x.id].stage === 1) ? 24 : 0),
    }],
    desc: '厚紙のカードにあけた穴の位置で、データや命令を表したもの。19世紀初めに織機の模様の制御に使われ、1890年のアメリカの国勢調査ではホレリスのパンチカード集計機が活躍した。その後も長く、コンピュータへの入力に使われた。',
  },
  {
    id: 'diffeng', set: 'father', name: '階差機関', en: 'Difference engine', type: 'hw', stage: 1, hp: 80, retreat: 2,
    atk: [{ name: '歯車計算', cost: 'HC', dmg: 40 }],
    desc: 'イギリスのチャールズ・バベッジが1820年代に設計した、歯車で動く計算機。「差分（階差）」を足し合わせるしくみで、数表を自動で計算しようとした。彼の設計をもとに、1991年にロンドンの科学博物館で組み立てられ、正しく動いた。',
  },
  {
    id: 'analytic', set: 'father', name: '解析機関', en: 'Analytical engine', type: 'hw', stage: 2, from: '階差機関', hp: 110, retreat: 2,
    atk: [{
      name: 'カード制御', cost: 'HHC', dmg: 50, label: '50+', text: '自分の場に「パンチカード」がいるなら、40ダメージ追加。',
      dmgFn: async c => { if (inPlay(c.p).some(m => m.id === 'punch')) c.dmg += 40; },
    }],
    desc: 'バベッジが1830年代に考えた、パンチカードでプログラムできる汎用の計算機（完成はしなかった）。計算する部分（ミル）と記憶する部分（ストア）を分けた設計は、今のCPUとメモリにあたる。エイダ・ラブレスはこの機械のための計算手順を書いた。',
  },
  {
    id: 'stored', set: 'father', name: 'ノイマン型コンピュータ', en: 'Von Neumann architecture', type: 'hw', stage: 3, from: '解析機関', hp: 150, retreat: 2,
    atk: [
      {
        name: 'フェッチ', cost: 'C', dmg: 20, text: '自分の山札を1枚引く。',
        after: async c => { c.draw(1); },
        ai: (g, p) => (p.deck.length ? 6 : 0),
      },
      {
        name: 'プログラム内蔵', cost: 'HHC', dmg: 100, text: '自分のトラッシュからコマンドを1枚選び、手札にもどす。',
        after: async c => { await c.recallCommands(1); },
        ai: (g, p) => (p.discard.some(x => DEF[x.id].kind !== 'mon') ? 8 : 0),
      },
    ],
    desc: 'プログラムをデータと同じようにメモリにしまい、そこから命令を1つずつ取り出して実行する方式のコンピュータ。1945年にフォン・ノイマンがまとめた報告書で広まり、今のほとんどのコンピュータがこの方式で動いている。',
  },
  {
    id: 'eniac', set: 'father', name: 'ENIAC', en: 'ENIAC', ex: true, type: 'hw', stage: 1, hp: 150, retreat: 3,
    atk: [
      { name: '弾道計算', cost: 'HC', dmg: 40 },
      {
        name: '全力演算', cost: 'HHC', dmg: 120, text: 'このユニットについているエネルギーを2個トラッシュする。',
        after: async c => { c.discardOwnEnergy(2); },
        ai: () => -12,
      },
    ],
    desc: '1946年に公開された、初期の汎用電子計算機。アメリカのペンシルベニア大学でつくられ、約1万8000本の真空管を使った部屋いっぱいの大きさだった。最初は、プログラムを変えるたびに配線をつなぎ替えていた。',
  },
  {
    id: 'montecarlo', set: 'father', name: 'モンテカルロ法', en: 'Monte Carlo method', type: 'algo', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: 'ランダムサンプリング', cost: 'AC', dmg: 0, label: '20×', text: 'コインを4回投げ、オモテの数×20ダメージ。',
      dmgFn: async c => { c.dmg = 20 * await c.heads(4); },
    }],
    desc: '乱数を使って何度も試し、その結果から答えを近似的に求める方法。1940年代にウラムとフォン・ノイマンらが研究し、カジノで有名なモナコの地区「モンテカルロ」にちなんで名づけられた。',
  },
  {
    id: 'minimax', set: 'father', name: 'ミニマックス法', en: 'Minimax', type: 'algo', stage: 1, hp: 70, retreat: 1,
    atk: [{
      name: '最悪を最小に', cost: 'AC', dmg: 30, text: '次の相手の番、このユニットが受けるワザのダメージを-20する。',
      after: async c => { c.me.shield = { turn: c.g.turn + 1, amt: 20 }; c.log(`${c.name(c.me)}は次の相手の番、ダメージ-20`); },
      ai: () => 10,
    }],
    desc: '対戦ゲームで「相手は自分にいちばん不利な手を選ぶ」と考え、その中で損がいちばん小さくなる手を選ぶ方法。将棋やチェスのAIの基本で、もとになる「ミニマックス定理」は1928年にフォン・ノイマンが証明した。',
  },
  /* ===== 「コンピュータの父」シリーズ：クロード・シャノン ===== */
  {
    id: 'bit', set: 'father', name: 'ビット', en: 'Bit', type: 'none', stage: 1, hp: 50, retreat: 1,
    atk: [{
      name: '3ビット', cost: 'CC', dmg: 0, label: '10×', text: 'コインを3回投げる。オモテを1、ウラを0として、出た順に3けたの2進数として読み、その数×10ダメージ（例：オモテ・ウラ・オモテ → 101 → 5 → 50ダメージ）。',
      dmgFn: async c => {
        const r = await c.coins(3);
        const v = r.reduce((s, h) => s * 2 + (h ? 1 : 0), 0);
        c.dmg = 10 * v;
        c.log(`2進数の${r.map(h => (h ? 1 : 0)).join('')}は${v}`);
        c.say(`${r.map(h => (h ? 1 : 0)).join('')} → ${v}`);
      },
    }],
    desc: '0か1かの、情報のいちばん小さな単位（binary digit の略）。コインを1回投げた結果は、ちょうど1ビットの情報になる。1948年にシャノンが論文で使い、情報の量をはかる単位として広まった（名前を考えたのは同僚のジョン・テューキー）。8ビットで1バイト。',
  },
  {
    id: 'parity', set: 'father', name: 'パリティビット', en: 'Parity bit', type: 'data', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: 'パリティチェック', cost: 'DC', dmg: 20, label: '20+', text: '自分の手札の枚数が偶数（0枚もふくむ）なら、30ダメージ追加。',
      dmgFn: async c => { if (c.p.hand.length % 2 === 0) c.dmg += 30; },
    }],
    desc: 'データの誤りを見つけるために足す1ビット。たとえば「1の数がいつも偶数になる」ように最後の1ビットを決めておくと、とちゅうで1か所だけビットが反転したとき、1の数が奇数になって誤りに気づける。',
  },
  {
    id: 'hamming', set: 'father', name: 'ハミング符号', en: 'Hamming code', type: 'data', stage: 2, from: 'パリティビット', hp: 90, retreat: 1,
    atk: [{
      name: '1ビット訂正', cost: 'DC', dmg: 40, text: 'このユニットのHPを20回復する。',
      after: async c => { c.heal(c.me, 20); },
      ai: (g, p, m) => (m.dmg > 0 ? 8 : 0),
    }],
    desc: '1950年にベル研究所のリチャード・ハミングが発表した、誤りを見つけるだけでなく直せる符号。4ビットのデータに3ビットのパリティを足して7ビットにすると、どこか1ビットが反転しても、その位置がわかって元にもどせる。今もサーバーのメモリ（ECCメモリ）などで使われている。',
  },
  {
    id: 'ldpc', set: 'father', name: 'LDPC符号', en: 'Low-density parity-check code', type: 'data', stage: 3, from: 'ハミング符号', hp: 150, retreat: 2,
    ability: { name: '誤り訂正', kind: 'passive', noStatus: true, text: 'このユニットは特殊状態にならない。' },
    atk: [
      { name: '反復復号', cost: 'C', dmg: 30 },
      { name: 'シャノン限界', cost: 'DDC', dmg: 100 },
    ],
    desc: 'たくさんのパリティを、少しずつ（低い密度で）組み合わせた誤り訂正符号。受け取った側が推測を何度もくり返して直していく。1960年代はじめにロバート・ギャラガーが考え、1990年代に再発見されると、シャノンが示した限界（通信路容量）にかなり近い性能が出ることがわかった。今はWi-Fiや5G、衛星放送などで使われている。',
  },
  {
    id: 'relay', set: 'father', name: 'リレー回路', en: 'Relay circuit', type: 'hw', stage: 1, hp: 80, retreat: 2,
    atk: [
      {
        name: 'AND回路', cost: 'H', dmg: 0, label: '70', text: 'コインを2回投げ、2回ともオモテなら70ダメージ。',
        dmgFn: async c => { const r = await c.coins(2); c.dmg = r[0] && r[1] ? 70 : 0; },
      },
      {
        name: 'OR回路', cost: 'HC', dmg: 0, label: '50', text: 'コインを2回投げ、1回でもオモテなら50ダメージ。',
        dmgFn: async c => { const r = await c.coins(2); c.dmg = r[0] || r[1] ? 50 : 0; },
      },
    ],
    desc: '電磁石の力でスイッチを入れたり切ったりする部品「リレー」をつないだ回路。1937年、21歳のシャノンは修士論文で、スイッチを直列につなぐとAND（両方オンのときだけオン）、並列につなぐとOR（どちらかがオンならオン）になり、回路の設計を論理の計算（ブール代数）で考えられることを示した。これがデジタル回路の設計の土台になった。',
  },
  {
    id: 'theseus', set: 'father', name: 'テセウス', en: 'Theseus', type: 'ai', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: '迷路学習', cost: 'IC', dmg: 20, label: '20+', text: '前の自分の番にも、このユニットが「迷路学習」を使っていたら、50ダメージ追加。',
      dmgFn: async c => { if (c.usedLastTurn('迷路学習')) c.dmg += 50; },
    }],
    desc: '1950年にシャノンがつくった、迷路を解く機械のネズミ。迷路の床の下にあるリレー回路が、どの道を通ったかを覚えていて、2回目からはまよわずにゴールへ向かった。機械が「学習」できることを見せた、初期の例として知られる。',
  },
  {
    id: 'otp', set: 'father', name: 'ワンタイムパッド', en: 'One-time pad', type: 'sec', stage: 1, hp: 60, retreat: 1,
    atk: [
      { name: '暗号化', cost: 'C', dmg: 10 },
      { name: '一度きりの鍵', cost: 'SC', dmg: 70, once: true, text: 'このワザは、このユニットが場にいるあいだに1回しか使えない。' },
    ],
    desc: '送りたい文と同じ長さの、まったくでたらめな鍵を使い、その鍵を一度しか使わない暗号。1949年にシャノンは、この方法なら、どれだけ計算しても元の文の手がかりが何も得られない（完全秘匿）ことを証明した。鍵を安全にわたすのが大変なので、ふだんの通信ではあまり使われない。',
  },
  /* ===== 「プログラミングの先駆者」シリーズ：エイダ・ラブレス ===== */
  {
    id: 'noteg', set: 'pioneer', name: 'ノートG', en: 'Note G', type: 'algo', stage: 1, ex: true, hp: 150, retreat: 2,
    atk: [
      { name: '変数の表', cost: 'A', dmg: 20 },
      {
        name: 'ベルヌーイ数', cost: 'AC', dmg: 40, label: '40×', text: 'このユニットがこのワザを使うのが何回目かを数え、その回数×40ダメージ（1回目40、2回目80、3回目120…）。',
        dmgFn: async c => { c.dmg = 40 * ((c.me.loops || 0) + 1); },
        after: async c => { c.me.loops = (c.me.loops || 0) + 1; c.say(`ループ ${c.me.loops}回目`); },
      },
    ],
    desc: 'エイダの注釈のうち、最後の「ノートG」に書かれた、解析機関でベルヌーイ数という数を計算する手順（1843年）。同じ計算をくり返す「ループ」を使っていて、コンピュータのために書かれた世界で最初のプログラムといわれる。解析機関は完成しなかったので、当時は動かせなかった。',
  },
  {
    id: 'nestloop', set: 'pioneer', name: '二重ループ', en: 'Nested loop', type: 'none', stage: 2, from: 'ループ', hp: 90, retreat: 1,
    atk: [{
      name: 'n²回のくり返し', cost: 'CCC', dmg: 0, label: '20×', text: 'コインを3回投げる。オモテの数を2乗した数×20ダメージ（オモテ2回なら 2×2=4 → 80ダメージ）。',
      dmgFn: async c => { const h = (await c.coins(3)).filter(Boolean).length; c.dmg = 20 * h * h; c.say(`${h}×${h}＝${h * h}回`); },
    }],
    desc: 'ループの中にループを入れたもの。外側が n 回、内側が n 回まわると、中の命令は n×n 回くり返される。表のすべてのマスを順に調べるときなどに使う。エイダのノートにも、くり返しの中のくり返し（cycle of cycles）が出てくる。',
  },
  {
    id: 'jacquard', set: 'pioneer', name: 'ジャカード織機', en: 'Jacquard loom', type: 'hw', stage: 1, hp: 80, retreat: 2,
    atk: [{
      name: '模様を織る', cost: 'HC', dmg: 30, label: '30+', text: 'コインを4回投げる。オモテとウラが交互に出たら（オウオウ・ウオウオ）、70ダメージ追加。',
      dmgFn: async c => { const r = await c.coins(4); if (r.every((h, i) => i === 0 || h !== r[i - 1])) { c.dmg += 70; c.say('市松模様！'); } },
    }],
    desc: '1804年ごろ、フランスのジョゼフ・マリー・ジャカールが発明した織機。穴をあけたカード（パンチカード）を順に読みこんで糸の上げ下げを決め、複雑な模様を自動で織る。カードを取りかえれば、ちがう模様が織れる。エイダは「解析機関は、ジャカード織機が花や葉を織るように、代数の模様を織る」と書いた。',
  },
  {
    id: 'compose', set: 'pioneer', name: '自動作曲', en: 'Algorithmic composition', type: 'ai', stage: 1, hp: 60, retreat: 1,
    atk: [{
      name: 'ハーモニー', cost: 'IC', dmg: 0, label: '20×', text: '自分の場にいるユニットのタイプの数×20ダメージ（同じタイプは1つと数える）。',
      dmgFn: async c => { c.dmg = 20 * new Set([c.p.active, ...c.p.bench].filter(Boolean).map(m => DEF[m.id].type)).size; },
    }],
    desc: 'コンピュータが曲をつくること。エイダは1843年に、音の高さや和音の関係を記号であらわせれば、解析機関は複雑な曲をつくれるかもしれないと書いた。今はAIがメロディや伴奏をつくるようになっている。',
  },
  {
    id: 'adalang', set: 'pioneer', name: 'Ada言語', en: 'Ada (programming language)', type: 'sec', stage: 1, hp: 60, retreat: 1,
    ability: { name: '型チェック', kind: 'passive', reduce: 20, text: 'このユニットが受けるワザのダメージを-20する。' },
    atk: [{ name: '安全な実行', cost: 'SC', dmg: 30 }],
    desc: 'アメリカ国防総省のために作られ、エイダの名前がつけられたプログラミング言語（1980年に規格になった。規格の番号「1815」は、エイダが生まれた年）。まちがいをプログラムを動かす前に見つけるしくみが強く、飛行機や鉄道など、止まってはこまるシステムで使われてきた。',
  },
  /* ===== 「プログラミングの先駆者」シリーズ：グレース・ホッパー ===== */
  {
    id: 'machinecode', set: 'pioneer', name: '機械語', en: 'Machine code', type: 'data', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: '0と1の命令', cost: 'D', dmg: 20 }],
    desc: 'CPUが直接読める、0と1の並びでできた命令。人には読みにくいので、最初のころのプログラマーは、命令を数字の表とくらべながら1つずつ書いていた。',
  },
  {
    id: 'flowmatic', set: 'pioneer', name: 'FLOW-MATIC', en: 'FLOW-MATIC', type: 'data', stage: 2, from: '機械語', hp: 80, retreat: 1,
    atk: [{ name: '英語で書く', cost: 'DC', dmg: 40, text: '自分の山札を1枚引く。', after: async c => { c.draw(1); } }],
    desc: '1955年ごろからホッパーのチームがつくった、英語に近い言葉で事務の計算が書ける、最初のプログラミング言語。「数式が苦手な人にも使えるように」という考えから生まれ、COBOLのもとになった。',
  },
  {
    id: 'cobol', set: 'pioneer', name: 'COBOL', en: 'COBOL', type: 'data', stage: 3, from: 'FLOW-MATIC', hp: 120, retreat: 2,
    ability: { name: 'レガシー', kind: 'passive', endure: true, text: 'このユニットがワザのダメージでダウンするとき、1回だけ、かわりにHPが10残る（残りHPが10以下のときははたらかない）。' },
    atk: [
      { name: '事務処理', cost: 'CC', dmg: 40 },
      { name: '大量のデータ処理', cost: 'DDC', dmg: 80 },
    ],
    desc: '1959年に生まれた、事務の仕事のためのプログラミング言語（COmmon Business-Oriented Language の略）。英語の文のように書ける。60年以上たった今も、銀行や役所の大きなシステムで動きつづけている。',
  },
  {
    id: 'mark1', set: 'pioneer', name: 'ハーバード・マークI', en: 'Harvard Mark I', type: 'hw', stage: 1, ex: true, hp: 160, retreat: 3,
    atk: [
      { name: '歯車の計算', cost: 'HC', dmg: 30 },
      { name: '紙テープの命令', cost: 'HHC', dmg: 120, text: '次の自分の番、このユニットはワザを使えない。', after: async c => { c.me.restTurn = c.g.turn + 2; } },
    ],
    desc: '1944年に動きはじめた、リレーと歯車で動く大きな計算機（長さ約15m、重さ約5トン）。紙テープの命令を読んで計算した。足し算に約0.3秒、かけ算に約6秒かかった。ホッパーは、この機械の最初のプログラマーの1人だった。',
  },
  {
    id: 'moth', set: 'pioneer', name: '本物のバグ', en: 'The first actual bug', type: 'none', stage: 1, hp: 40, retreat: 1,
    atk: [{ name: 'リレーにはさまる', cost: 'C', dmg: 10, text: '相手のバトル場のユニットをバグにする。', after: async c => { if (c.foeAlive()) c.status(c.foe, 'bug'); } }],
    desc: '1947年、計算機ハーバード・マークIIのリレーに蛾がはさまって、正しく動かなくなった。ホッパーのチームは蛾を作業日誌にテープで貼り「バグ（虫）が見つかった最初の本物の例」と書いた。「バグ」という言葉はそれより前からあったが、この話で有名になった。',
  },
  /* ===== 「遍在する計算機」シリーズ：マーク・ワイザー ===== */
  {
    id: 'pc', set: 'ubicomp', name: 'パソコン', en: 'Personal computer', type: 'hw', stage: 1, hp: 70, retreat: 1,
    atk: [{ name: '1人1台', cost: 'HC', dmg: 30 }],
    desc: '1人が1台を使うコンピュータ（パーソナルコンピュータ）。ワイザーは、コンピュータの時代を、1台をみんなで使う「メインフレーム」、1人1台の「パソコン」、1人のまわりにたくさんある「ユビキタス」の3つに分けた。',
  },
  {
    id: 'ubiq', set: 'ubicomp', name: 'ユビキタス', en: 'Ubiquitous computing', type: 'hw', stage: 2, from: 'パソコン', hp: 100, retreat: 1,
    atk: [{
      name: 'どこにでもある', cost: 'HC', dmg: 0, label: '20×', text: '自分の場にいるユニットの数×20ダメージ。',
      dmgFn: async c => { c.dmg = 20 * [c.p.active, ...c.p.bench].filter(Boolean).length; },
    }],
    desc: 'コンピュータが、家具や道具や壁の中など、身のまわりのあらゆる所に入りこみ、意識しなくても使える状態。ワイザーの言う3つめの時代で、1人のまわりにたくさんのコンピュータがある。今は「IoT」とも呼ばれる。',
  },
  ...[['tab', 'タブ', 'Tab', 50, 0, 'C', 10, '手のひらサイズの小さなコンピュータ。動く付せんのように、部屋のあちこちで気軽に使うことを考えていた。研究所では「タブ」「パッド」「ボード」の大きさのちがう3種類をそろえ、部屋じゅうで使う実験をした。'],
    ['pad', 'パッド', 'Pad', 60, 1, 'C', 20, 'ノートくらいの大きさのコンピュータ。紙のノートのように、机の上に何枚も置いて使うことを考えていた。今のタブレットにつながる考え方。'],
    ['board', 'ボード', 'Board', 90, 2, 'NCC', 30, '黒板くらいの大きさのコンピュータ。ペンで書きこめる大きな画面で、部屋にいるみんなが同じ画面を見ながら話し合えた。今の電子黒板につながる考え方。'],
  ].map(([id, name, en, hp, retreat, cost, dmg, desc]) => ({
    id, set: 'ubicomp', name, en, type: 'net', stage: 1, hp, retreat,
    atk: [{
      name: 'そろう', cost, dmg, label: `${dmg}+`, text: '自分の場に「タブ」「パッド」「ボード」のうち2種類がいれば20ダメージ、3種類そろっていれば40ダメージ追加。',
      dmgFn: async c => { const ids = new Set([c.p.active, ...c.p.bench].filter(Boolean).map(m => m.id)); const n = ['tab', 'pad', 'board'].filter(x => ids.has(x)).length; if (n === 3) c.dmg += 40; else if (n === 2) c.dmg += 20; },
    }],
    desc: `1990年代のはじめに、ワイザーたちの研究所（ゼロックスのパロアルト研究所）でつくられた、${desc}`,
  })),
  {
    id: 'sensor', set: 'ubicomp', name: 'センサー', en: 'Sensor', type: 'net', stage: 1, hp: 30, retreat: 1,
    ability: { name: '見張り', kind: 'passive', watch: true, text: 'このユニットがベンチにいるとき、相手のワザで自分のバトル場のユニットがダメージを受けたら、ワザを使ったユニットに10ダメージ。' },
    atk: [{ name: 'はかる', cost: 'C', dmg: 10 }],
    desc: '温度・光・動き・音などをはかって、電気の信号にかえる部品。ユビキタスやIoTでは、たくさんのセンサーがまわりのようすを見張り、データを送りつづける。',
  },
  /* ===== 「遍在する計算機」シリーズ：TRON ===== */
  {
    id: 'tronex', set: 'ubicomp', name: 'TRON', en: 'TRON', type: 'none', stage: 1, ex: true, hp: 140, retreat: 2,
    ability: { name: '組込みOS', kind: 'passive', embed: true, text: 'このユニットがベンチにいるとき、自分のワザの、相手のバトル場のユニットへのダメージを+10する。' },
    atk: [
      { name: 'リアルタイム処理', cost: 'CC', dmg: 30 },
      { name: 'どこでもコンピュータ', cost: 'CCC', dmg: 80 },
    ],
    desc: '1984年に坂村健が始めた、日本のコンピュータのプロジェクト。家電や自動車、工場の機械など、あらゆる物の中にコンピュータが入る「どこでもコンピュータ」の社会をめざした。物の中で動く組込み用のOSは、カメラや自動車のエンジン制御など、世界中の機器で使われている。2018年には、そのしくみがIEEEの国際標準になった。',
  },
  {
    id: 'embedded', set: 'ubicomp', name: '組込みシステム', en: 'Embedded system', type: 'hw', stage: 1, hp: 70, retreat: 1,
    atk: [{ name: '決められた仕事', cost: 'H', dmg: 20 }],
    desc: '電子レンジ・炊飯器・自動車・エレベーターなど、機械の中に組みこまれて、決まった仕事をするコンピュータ。ふだんは見えないが、身のまわりのコンピュータのほとんどはこちら。',
  },
  {
    id: 'rtos', set: 'ubicomp', name: 'リアルタイムOS', en: 'Real-time OS', type: 'algo', stage: 1, hp: 60, retreat: 1,
    atk: [{ name: '締め切りを守る', cost: 'AC', dmg: 40, sure: true, text: 'このワザは、文字化けでも失敗しない。' }],
    desc: '決められた時間までに、必ず処理を終わらせることを大事にするOS。エンジンの点火やブレーキの制御のように、少しでも遅れるとこまる機械で使われる。TRONの組込み用のOS（ITRONなど）もこの仲間。',
  },
  {
    id: 'iot', set: 'ubicomp', name: 'IoT', en: 'Internet of Things', type: 'net', stage: 1, hp: 50, retreat: 1,
    atk: [{
      name: 'モノのインターネット', cost: 'CCC', dmg: 0, label: '10×', text: 'おたがいの場にいるユニットの数×10ダメージ。',
      dmgFn: async c => { c.dmg = 10 * [c.p, c.o].reduce((n, pl) => n + [pl.active, ...pl.bench].filter(Boolean).length, 0); },
    }],
    desc: 'Internet of Things（モノのインターネット）の略。家電・車・センサーなど、コンピュータ以外の「モノ」がインターネットにつながり、データをやりとりすること。1999年ごろから使われはじめた言葉。',
  },
  /* ===== 「遍在する計算機」シリーズ：落合陽一 ===== */
  {
    id: 'dnature', set: 'ubicomp', name: 'デジタルネイチャー', en: 'Digital nature', type: 'hw', stage: 3, from: 'ユビキタス', hp: 150, retreat: 2,
    ability: { name: '境界がない', kind: 'passive', noWeak: true, text: 'このユニットには弱点がない。' },
    atk: [
      { name: '溶け合う', cost: 'CC', dmg: 40 },
      { name: '計算機自然', cost: 'HHC', dmg: 100 },
    ],
    desc: '落合陽一が提唱する、コンピュータと人間・自然の区別がなくなっていく未来の世界像（計算機自然）。物と情報、自然と人工が溶け合った新しい「自然」の姿。コンピュータがまわりに溶けこむユビキタスの考えを、人間や自然にまで広げたものともいえる。',
  },
  {
    id: 'levitation', set: 'ubicomp', name: '音響浮揚', en: 'Acoustic levitation', type: 'hw', stage: 1, hp: 50, retreat: 1,
    ability: { name: '浮遊', kind: 'passive', float: true, text: 'このユニットがベンチにいるとき、自分のバトル場のユニットがにげるのに必要なエネルギーを1個少なくする。' },
    atk: [{ name: '粒を浮かせる', cost: 'C', dmg: 10 }],
    desc: '強い超音波を重ね合わせて、小さな粒を空中に浮かせたり動かしたりする技術。落合陽一たちは、空中に浮かべた粒で絵や文字をえがく研究を発表した（2014年）。',
  },
  {
    id: 'hologram', set: 'ubicomp', name: '計算機ホログラム', en: 'Computer-generated hologram', type: 'data', stage: 1, hp: 60, retreat: 1,
    ability: { name: '実体がない', kind: 'passive', phantom: true, text: 'このユニットが最初に受けるワザのダメージは0になる（1回だけ）。' },
    atk: [{ name: '光をえがく', cost: 'DC', dmg: 30 }],
    desc: '光の波の重なり方をコンピュータで計算してつくるホログラム。目の前に立体が浮かんで見えたり、光の形を自由に変えたりできる。落合陽一の研究テーマの1つ。',
  },
  {
    id: 'twin', set: 'ubicomp', name: 'デジタルツイン', en: 'Digital twin', type: 'data', stage: 1, hp: 70, retreat: 1,
    ability: { name: '分身', kind: 'passive', twin: true, text: 'このユニットがダウンしたとき、自分の山札から「デジタルツイン」を1枚、ベンチに出す（ベンチがあいていれば）。' },
    atk: [{ name: '写しとる', cost: 'DC', dmg: 30 }],
    desc: '現実の物や人を、センサーのデータをもとにコンピュータの中にそっくり写しとった「双子」。工場や町のようすをコンピュータの中で試してから、現実に反映するのに使われる。',
  },
  {
    id: 'null2', set: 'ubicomp', name: 'null²', en: 'null²', type: 'none', stage: 1, ex: true, hp: 150, retreat: 2,
    ability: { name: '鏡', kind: 'passive', mirror: true, text: 'このユニットがバトル場で相手のワザのダメージを受けたとき、そのダメージの半分（一の位は切り捨て）を、ワザを使ったユニットにもあたえる。' },
    atk: [
      { name: 'ミラー膜', cost: 'CC', dmg: 40 },
      { name: 'null', cost: 'CCC', dmg: 70, text: '相手のバトル場のユニットについているどうぐをトラッシュする。', after: async c => { if (c.foeAlive() && c.foe.tool) { c.o.discard.push(c.foe.tool); c.log(`${DEF[c.foe.tool.id].name}を null にした（トラッシュ）`); c.foe.tool = null; } } },
    ],
    desc: '2025年の大阪・関西万博で、落合陽一がプロデュースしたパビリオン。外がわは伸び縮みする鏡のような膜でおおわれ、形が変わる。名前の「null」はプログラミングで「値がない」ことを表す言葉で、ヌルの2乗で「ヌルヌル」と読む。',
  },
];

/* ---------- コマンド ---------- */
const TRAINERS = [
  { id: 'import', name: 'インポート', en: 'Import', kind: 'item', rar: 1, text: '自分の山札からランダムなv1ユニットを1枚、手札に加える。', desc: 'ほかのファイルやライブラリに書かれたプログラムを読み込んで、使えるようにすること（例: Pythonのimport文）。' },
  { id: 'grep', name: 'grep', en: 'grep', kind: 'item', rar: 1, text: '自分の山札からランダムな進化ユニット（v2・v3）を1枚、手札に加える。', desc: 'ファイルの中から、指定した文字列やパターンに当てはまる行を探し出すコマンド。名前は、エディタedのコマンド g/re/p（全体から正規表現を探して表示）に由来する。' },
  { id: 'patch', name: 'パッチ', en: 'Patch', kind: 'item', rar: 1, text: '自分のユニット1体のHPを20回復する。', desc: 'ソフトウェアの不具合（バグ）や脆弱性を修正するための更新プログラム。' },
  { id: 'alttab', name: 'Alt+Tab', en: 'Alt+Tab', kind: 'item', rar: 1, text: 'この番、自分のバトル場のユニットがにげるためのエネルギーを1個少なくする。', desc: '開いているウィンドウ（アプリ）をすばやく切り替えるショートカットキー。MacではCommand+Tab。' },
  { id: 'reboot', name: '再起動', en: 'Reboot', kind: 'item', rar: 2, text: '相手は手札をすべて山札にもどして切り、山札を3枚引く。', desc: 'コンピュータをいったん終了させて、もう一度起動し直すこと。調子が悪いときの定番の対処法。' },
  { id: 'update', name: 'メジャーアップデート', en: 'Major update', kind: 'item', rar: 3, text: '自分の場のv1ユニット1体を、手札のv3ユニットに進化させる（v2をとばす）。最初の自分の番や、この番に出したユニットには使えない。', desc: 'ソフトウェアの大規模なバージョンアップ。バージョン番号のいちばん左の数字が上がる（例: 1.9 → 2.0）。' },
  { id: 'ram', name: 'メモリ増設', en: 'Memory upgrade', kind: 'tool', rar: 2, hp: 20, text: 'これをつけたユニットの最大HPを+20する。', desc: 'パソコンにメモリ（RAM）を追加して容量を増やすこと。一度にたくさんの処理を扱えるようになる。' },
  { id: 'honeypot', name: 'ハニーポット', en: 'Honeypot', kind: 'tool', rar: 2, text: 'これをつけたユニットがバトル場で相手のワザのダメージを受けたとき、ワザを使ったユニットに20ダメージ。', desc: '攻撃者をおびき寄せるために、わざと無防備に見せかけた「おとり」のシステム。攻撃の手口を調べるのに使われる。' },
  { id: 'pair', name: 'ペアプログラミング', en: 'Pair programming', kind: 'sup', rar: 1, text: '自分の山札を2枚引く。', desc: '2人1組で1台のコンピュータを使ってプログラムを書く開発手法。1人が書き、もう1人がその場でレビューする。' },
  { id: 'optimize', name: '最適化', en: 'Optimization', kind: 'sup', rar: 2, text: 'この番、自分のユニットが使うワザの、相手のバトル場のユニットへのダメージを+10する。', desc: 'プログラムの処理速度やメモリの使用量などを改善すること。' },
  { id: 'lb', name: 'ロードバランシング', en: 'Load balancing', kind: 'sup', rar: 2, text: '相手のバトル場のユニットを、ベンチのユニットと入れ替える（入れ替えるユニットは相手が選ぶ）。', desc: '処理の負荷を複数のサーバーに振り分けて分散させるしくみ。アクセスが集中しても止まりにくくなる。' },
  { id: 'pentest', name: 'ペネトレーションテスト', en: 'Penetration test', kind: 'sup', rar: 3, text: '相手のベンチの、ダメージを受けているユニット1体を選び、相手のバトル場のユニットと入れ替える。', desc: '攻撃者と同じ手法で実際にシステムへの侵入を試み、弱点（脆弱性）を見つけるテスト。' },
  { id: 'hackathon', name: 'ハッカソン', en: 'Hackathon', kind: 'sup', rar: 3, text: 'ウラが出るまでコインを投げる。オモテの数だけ、自分のエネルギーゾーンからエネルギーを出して、バトル場のユニットにつける。', desc: '短期間（1〜2日など）でチームを組み、集中してアイデアを形にする開発イベント。「ハック」と「マラソン」を組み合わせた造語。' },
  { id: 'debug', name: 'デバッグ', en: 'Debugging', kind: 'sup', rar: 2, text: '自分のバトル場のユニットのHPを50回復し、特殊状態をすべて回復する。', desc: 'プログラムの誤り（バグ）を見つけて取り除く作業。' },
  { id: 'ctrlz', name: 'Ctrl+Z', en: 'Undo', kind: 'item', rar: 2, text: '自分のトラッシュからユニットを1枚選び、手札に加える。', desc: '直前の操作を取り消して元に戻す（アンドゥ）ショートカットキー。MacではCommand+Z。' },
  { id: 'search', name: '検索エンジン', en: 'Search engine', kind: 'item', rar: 1, text: '自分の山札の上から3枚を見て、そのうち1枚を手札に加える。残りは山札にもどして切る。', desc: 'インターネット上のWebページを集めて索引を作り、キーワードに合うページを探し出すシステム。結果を表示する順番の決め方が重要になる。' },
  { id: 'opensource', name: 'オープンソース', en: 'Open source', kind: 'sup', rar: 2, text: '自分の山札を3枚引く。そのあと、相手も山札を1枚引く。', desc: 'ソースコードを公開し、誰でも利用・改良・再配布できるようにしたソフトウェア。LinuxやPythonなど、世界中の人の協力で開発されているものが多い。' },
  { id: 'ups', name: 'UPS', en: 'Uninterruptible power supply', kind: 'tool', rar: 3, text: 'これをつけたユニットがワザのダメージでダウンするとき、かわりにHPが10残る（残りHPが10以下のときははたらかない）。そのあと、このどうぐをトラッシュする。', desc: '停電したときに、内蔵のバッテリーからしばらく電気を送り続ける装置（無停電電源装置）。そのあいだにデータを保存して、安全に電源を切れる。' },
  /* 「コンピュータの父」シリーズ */
  { id: 'alan', set: 'father', leg: true, name: 'アラン・チューリング', en: 'Alan Turing', kind: 'sup', rar: 4, text: '自分の山札から好きなカードを1枚選んで、手札に加える。そのあと山札を切る。', desc: 'イギリスの数学者（1912〜1954年）。1936年に「チューリングマシン」を考え、「計算できる」とはどういうことかを数学的に定めた。第二次世界大戦中は暗号エニグマの解読で活躍し、1950年には「チューリングテスト」を提案した。「コンピュータ科学の父」「人工知能の父」と呼ばれる。' },
  { id: 'turtest', set: 'father', name: 'チューリングテスト', en: 'Turing test', kind: 'item', rar: 2, text: 'この番、自分のAIタイプのユニットが使うワザの、相手のバトル場のユニットへのダメージを+20する。', desc: '1950年にアラン・チューリングが提案した、機械に知能があるかを確かめるテスト。審査員が文字だけで機械と人間の両方と会話し、どちらが機械かを見分けられなければ、その機械は合格とする。' },
  { id: 'codebreak', set: 'father', name: '暗号解読', en: 'Cryptanalysis', kind: 'sup', rar: 3, text: '相手の手札をすべて見て、その中から1枚選び、相手の山札にもどして切る。そのあと、自分の山札を1枚引く。', desc: '鍵を知らないまま、暗号文から元の文を見つけ出すこと。文字の出てくる回数のかたよりや、文に入っていそうな言葉などを手がかりにする。第二次世界大戦中の暗号解読は、戦争の行方に大きな影響を与えたといわれる。' },
  { id: 'neumann', set: 'father', leg: true, name: 'ジョン・フォン・ノイマン', en: 'John von Neumann', kind: 'sup', rar: 4, text: '自分のトラッシュから、コマンドを2枚まで選んで手札に加える（「ジョン・フォン・ノイマン」はのぞく）。', desc: 'ハンガリー生まれのアメリカの数学者（1903〜1957年）。1945年の報告書で、プログラムをデータと同じようにメモリにしまって実行する「ノイマン型コンピュータ」の設計をまとめた。ゲーム理論をつくったひとりで、マージソートやモンテカルロ法の研究でも知られる。' },
  { id: 'gametheory', set: 'father', name: 'ゲーム理論', en: 'Game theory', kind: 'sup', rar: 3, text: '相手は自分の手札を1枚選んでトラッシュする。そのあと、自分の山札を1枚引く。', desc: 'たがいの行動を読み合いながら決める状況を、数学で分析する学問。1944年のフォン・ノイマンとモルゲンシュテルンの本から本格的に始まった。一方の得が、そのままもう一方の損になる状況を「ゼロサムゲーム」という。' },
  { id: 'shannon', set: 'father', leg: true, name: 'クロード・シャノン', en: 'Claude Shannon', kind: 'sup', rar: 4, text: '自分の山札の上から5枚を見て、その中から2枚まで選んで手札に加える。残りは山札にもどして切る。', desc: 'アメリカの数学者・技術者（1916〜2001年）。1948年の論文「通信の数学的理論」で、情報の量を「ビット」ではかる方法と、雑音（ノイズ）のある通信路でどこまで正確に速く送れるかの限界を示し、「情報理論の父」と呼ばれる。21歳のときの修士論文では、デジタル回路の設計のもとをつくった。ジャグリングや一輪車が好きで、おもしろい機械をたくさんつくった。' },
  { id: 'compress', set: 'father', name: 'データ圧縮', en: 'Data compression', kind: 'item', rar: 2, text: 'この番、自分のワザに必要な無色エネルギーを1個少なくする（この番に何枚使っても1個まで）。', desc: '情報を、中身を変えずに、より少ないビットで表すこと。よく出る記号に短い符号を、まれな記号に長い符号をわりあてると短くできる（ハフマン符号など）。シャノンは、どこまで短くできるかの限界が「エントロピー（情報量）」で決まることを示した。ZIPやPNGなどで使われている。' },
  { id: 'ada', set: 'pioneer', leg: true, name: 'エイダ・ラブレス', en: 'Ada Lovelace', kind: 'sup', rar: 4, text: '自分の山札から、コマンドを2枚まで選んで手札に加える（「エイダ・ラブレス」はのぞく）。そのあと山札を切る。', desc: 'イギリスの数学者（1815〜1852年）。チャールズ・バベッジが考えた「解析機関」を紹介する論文を英語に訳し、もとの論文の3倍ほどの長さの注釈（ノート）をつけた。その中で、ベルヌーイ数を計算する手順を書き、機械が数だけでなく音楽のような記号もあつかえるかもしれないと考えた。プログラミング言語「Ada」は、彼女の名前からつけられた。' },
  { id: 'poetical', set: 'pioneer', name: '詩的科学', en: 'Poetical science', kind: 'item', rar: 2, text: 'この番、自分のワザに必要なエネルギーは、色に関係なく、どのタイプのエネルギーでも使える。', desc: 'エイダは、想像力と数学を組み合わせる自分の考え方を「詩的な科学（poetical science）」と呼んだ。計算の正しさだけでなく、まだない機械の使い道を思いえがく力を大切にした。' },
  { id: 'lovelace', set: 'pioneer', name: 'ラブレスの反論', en: "Lady Lovelace's objection", kind: 'tool', rar: 2, text: 'これをつけたユニットが、AIタイプのユニットのワザで受けるダメージを-30する。', desc: 'エイダは「解析機関は、自分から何かを生み出すことはない。わたしたちが命令の仕方を知っていることなら何でもできる」と書いた。1950年にチューリングは、機械は考えられるかを論じた論文の中で、この考えを「ラブレス夫人の反論」として取り上げた。' },
  { id: 'hopper', set: 'pioneer', leg: true, name: 'グレース・ホッパー', en: 'Grace Hopper', kind: 'sup', rar: 4, text: '自分の山札から、進化ユニット（v2・v3）を2枚まで選んで手札に加える。そのあと山札を切る。', desc: 'アメリカの計算機科学者で、海軍の軍人（1906〜1992年）。最初期の計算機「ハーバード・マークI」のプログラマーになり、1952年には、プログラムを自動で機械語に変換する初期のコンパイラ「A-0」をつくった。英語に近い言葉で書けるプログラミング言語を進め、COBOLのもとをつくった。最後は海軍少将になった。' },
  { id: 'nanosec', set: 'pioneer', name: 'ナノ秒の針金', en: 'Nanosecond wire', kind: 'item', rar: 2, text: '自分のユニットについているエネルギーを1個、別の自分のユニットにつけかえる。', desc: 'ホッパーは講演で、長さ約30cmの針金を配った。光や電気の信号が1ナノ秒（10億分の1秒）に進むのが、ちょうどそのくらいだから。「遠くまでつなぐと、それだけ時間がかかる」ことを、目で見えるようにした。' },
  { id: 'logbook', set: 'pioneer', name: '作業日誌', en: 'Logbook', kind: 'tool', rar: 2, text: 'これをつけたユニットが特殊状態になるとき、かわりにならない。そのあと、このどうぐをトラッシュする。', desc: 'コンピュータの作業や、起きたトラブルを書きとめておく記録（ログ）。いつ何が起きたかを残しておくと、原因を見つけて直しやすくなる。ハーバード・マークIIの作業日誌には、本物のバグ（蛾）がテープで貼られている。' },
  { id: 'weiser', set: 'ubicomp', leg: true, name: 'マーク・ワイザー', en: 'Mark Weiser', kind: 'sup', rar: 4, text: '自分のベンチにいるユニットの数だけ、山札を引く。', desc: 'アメリカの計算機科学者（1952〜1999年）。ゼロックスのパロアルト研究所で、1988年ごろ「ユビキタスコンピューティング」という考えを打ち出した。1991年の論文「21世紀のコンピュータ」では、すぐれた技術ほど生活に溶けこんで見えなくなると書き、たくさんの小さなコンピュータが身のまわりにある未来をえがいた。' },
  { id: 'calm', set: 'ubicomp', name: 'カーム・テクノロジー', en: 'Calm technology', kind: 'sup', rar: 2, text: '自分のバトル場のユニットと、ベンチのユニット1体を入れかえる（にげるエネルギーはいらない）。そのあと、山札を1枚引く。', desc: 'ワイザーとジョン・シーリー・ブラウンが1995年ごろに唱えた考え。すぐれた技術は、必要なときだけ注意の中心に出てきて、ふだんはまわり（周辺）で静かにはたらく。' },
  { id: 'ictag', set: 'ubicomp', name: 'ICタグ', en: 'RFID tag', kind: 'item', rar: 1, text: 'この番、自分のバトル場のユニットがにげるのに、エネルギーはいらない。', desc: '電波で読み書きできる、小さなICチップとアンテナ。電池がなくても、読み取り機の電波から電気をもらって動く。交通系ICカードや、お店の商品管理、図書館の本の貸し出しなどで使われている。' },
  { id: 'harvest', set: 'ubicomp', name: '環境発電', en: 'Energy harvesting', kind: 'tool', rar: 2, text: 'これをつけたユニットがベンチにいるとき、自分の番のはじめに、エネルギーゾーンからエネルギーを1個つける。', desc: '光・振動・熱・電波など、まわりにある小さなエネルギーを集めて電気をつくる技術。電池を取りかえなくても、センサーなどを長く動かしつづけられる。' },
  { id: 'tronhouse', set: 'ubicomp', name: 'TRONハウス', en: 'TRON House', kind: 'field', rar: 3, text: '場にあるあいだ、番のおわりに、おたがいのベンチのユニット全員のHPを10回復する。', desc: '1989年に東京に建てられた、TRONの考えで家じゅうにコンピュータとセンサーを組みこんだ実験住宅。窓・照明・空調などが連携して、住む人に合わせて自動で動いた。' },
  { id: 'ochiai', set: 'ubicomp', leg: true, name: '落合陽一', en: 'Yoichi Ochiai', kind: 'sup', rar: 4, text: 'この番、自分のワザは、相手のバトル場のユニットの弱点を必ず突く（+20）。そのあと、山札を1枚引く。', desc: '日本の研究者・メディアアーティスト（1987年〜）。コンピュータと人間や自然が溶け合っていく未来の世界像「デジタルネイチャー（計算機自然）」を提唱し、超音波・レーザー・ホログラムなどを使った研究と作品をつくっている。2025年の大阪・関西万博では、パビリオン「null²」をプロデュースした。' },
  { id: 'plasma', set: 'ubicomp', name: '空中プラズマ', en: 'Aerial plasma', kind: 'item', rar: 2, text: '相手のベンチのユニット1体に、20ダメージ。', desc: 'とても短い時間（フェムト秒）だけ光るレーザーを空気中の1点に集めて、さわれる光の点（プラズマ）をつくる技術。落合陽一たちは、空中に光の点でえがいた絵にさわれる研究を発表した（2015年）。' },
  { id: 'ultimate', set: 'father', name: '究極の機械', en: 'Ultimate machine', kind: 'tool', rar: 3, text: 'これをつけたユニットがバトル場で相手のワザのダメージを受けたとき、ワザを使ったユニットをフリーズにする。そのあと、このどうぐをトラッシュする。', desc: 'スイッチが1つだけついた箱。スイッチを入れると、ふたが開いて中から手が出てきて、スイッチを切ってまたひっこむ。それしかしない機械。人工知能の研究者マービン・ミンスキーのアイデアを、シャノンが1950年代につくった。' },
];

const KIND = {
  item: { name: 'グッズ', c: '#4f6b7a', rule: 'グッズは自分の番に何枚でも使える。' },
  sup: { name: 'サポート', c: '#9a4f2c', rule: 'サポートは自分の番に1枚しか使えない。' },
  tool: { name: 'どうぐ', c: '#2f7a72', rule: 'どうぐは自分のユニットに1体につき1枚までつけられる。' },
  field: { name: 'フィールド', c: '#5b4a8a', rule: 'フィールドは場に1枚だけ置けて、おたがいに効く。新しいフィールドを出すと、前のフィールドはトラッシュへ。' },
};

/* ---------- プリセットデッキ（各20枚・同名2枚まで） ---------- */
const PRESETS = [
  {
    id: 'p_algo', name: 'アルゴリズム研究室', energy: ['algo'], key: ['dijkstra', 'quick'],
    blurb: 'ダイクストラ法exでベンチを狙い撃ち。動的計画法はベンチが多いほど強い。',
    cards: { brute: 2, memo: 2, dp: 1, bubble: 2, quick: 1, merge: 1, dijkstra: 1, pair: 2, import: 2, grep: 1, update: 1, optimize: 1, patch: 1, lb: 1, search: 1, },
  },
  {
    id: 'p_data', name: 'データ構造ラボ', energy: ['data'], key: ['hash', 'rbtree'],
    blurb: 'ハッシュテーブルexの軽減無視アタックと、回復する赤黒木で粘る。',
    cards: { tree: 2, bst: 2, rbtree: 1, stack: 1, queue: 1, pqueue: 1, hash: 1, rdb: 1, pair: 2, import: 2, grep: 1, update: 1, debug: 1, honeypot: 1, hackathon: 1, alttab: 1, },
  },
  {
    id: 'p_net', name: 'ネットワーク網', energy: ['net'], key: ['cloud', 'http'],
    blurb: 'ベンチを埋めてクラウドexのスケールアウト。ルーターでエネルギーを集める。',
    cards: { ip: 2, tcp: 1, udp: 1, http: 2, router: 1, cloud: 2, cdn: 1, pair: 2, import: 2, grep: 1, update: 1, optimize: 1, lb: 1, patch: 1, ram: 1, },
  },
  {
    id: 'p_sec', name: 'セキュリティ部隊', energy: ['sec'], key: ['pubkey', 'zerotrust'],
    blurb: '文字化け・バグで相手を乱し、ダメージ軽減の壁で耐える。',
    cards: { password: 2, twofa: 1, zerotrust: 1, firewall: 1, caesar: 2, pubkey: 2, virus: 2, pair: 2, import: 2, grep: 1, debug: 1, honeypot: 1, reboot: 1, update: 1 },
  },
  {
    id: 'p_hw', name: 'ハードウェア工房', energy: ['hw'], key: ['gpu', 'cpu'],
    blurb: 'GPU exの並列演算は最大160。CPUのオーバークロックで一撃必殺。',
    cards: { transistor: 2, gate: 2, cpu: 2, cache: 1, gpu: 2, pair: 2, import: 2, grep: 1, update: 1, ram: 1, optimize: 1, patch: 2, alttab: 1 },
  },
  {
    id: 'p_ai', name: 'AI研究所', energy: ['ai'], key: ['llm', 'dl'],
    blurb: 'エネルギーを貯めるほど強いディープラーニングと、一発逆転の大規模言語モデルex。',
    cards: { perceptron: 2, nn: 2, dl: 1, cnn: 1, dtree: 1, rl: 1, llm: 2, pair: 2, import: 2, grep: 1, update: 1, hackathon: 1, pentest: 1, turtest: 2, },
  },
  {
    id: 'p_base', name: 'プログラミング基礎', energy: ['algo', 'data'], key: ['turing', 'recursion'],
    blurb: '無色のユニットはどのエネルギーでも動く。ループは二重ループに進化し、チューリングマシンexは相手のワザをコピー。',
    cards: { nestloop: 1, loop: 2, func: 2, recursion: 2, lambda: 1, turing: 2, pair: 2, import: 2, grep: 1, hackathon: 1, debug: 1, ram: 1, honeypot: 1, optimize: 1, },
  },
  {
    id: 'p_graph', name: 'グラフ探索隊', energy: ['algo'], key: ['astar', 'greedy'],
    blurb: '幅優先探索でベンチを削り、貪欲法と配列で弱ったユニットを狙い撃ち。',
    cards: { bfs: 2, astar: 2, greedy: 2, array: 2, graph: 1, binsearch: 1, pair: 2, import: 2, grep: 1, search: 1, optimize: 1, ctrlz: 1, patch: 1, ups: 1 },
  },
  {
    id: 'p_chain', name: 'ブロックチェーン同盟', energy: ['sec'], key: ['ransom', 'blockchain'],
    blurb: 'ブロックチェーンは使うほど強くなる。ランサムウェアexで相手のエネルギーを止める。',
    cards: { hashfn: 2, digsig: 2, blockchain: 2, phishing: 1, ransom: 2, firewall: 1, pair: 2, import: 2, grep: 1, update: 1, ups: 1, debug: 1, search: 1, honeypot: 1 },
  },
  {
    id: 'p_quantum', name: '量子とAI', energy: ['hw', 'ai'], key: ['quantum', 'diffusion'],
    blurb: '量子コンピュータexの重ね合わせと、回復する拡散モデルex。進化のいらない速攻デッキ。',
    cards: { quantum: 2, diffusion: 2, knn: 2, mainmem: 1, cache: 1, vacuum: 2, pair: 2, import: 2, opensource: 1, hackathon: 1, optimize: 1, turtest: 2, nanosec: 1 },
  },
  {
    id: 'p_turing', name: '暗号解読班', energy: ['hw', 'sec'], key: ['ace', 'enigma'],
    blurb: 'エニグマで文字化けさせて、コロッサスとボンブで解読。チューリングマシンexと、アラン・チューリングで欲しいカードを呼ぶ。',
    cards: { enigma: 2, bombe: 2, vacuum: 2, colossus: 2, ace: 1, turing: 1, alan: 1, codebreak: 1, pair: 2, import: 2, grep: 1, update: 1, debug: 1, ups: 1 },
  },
  {
    id: 'p_neumann', name: 'ノイマン型研究所', energy: ['hw'], key: ['eniac', 'stored'],
    blurb: 'パンチカードで機械を呼び、解析機関からノイマン型コンピュータへ。使ったコマンドはノイマンで再利用。',
    cards: { punch: 2, diffeng: 2, analytic: 2, stored: 1, eniac: 2, vacuum: 1, neumann: 1, gametheory: 1, pair: 2, import: 2, grep: 1, update: 1, hackathon: 1, optimize: 1 },
  },
  {
    id: 'p_shannon', name: '情報理論研究室', energy: ['data', 'hw'], key: ['ldpc', 'relay'],
    blurb: 'ビットの2進数でダメージを出しながら、パリティビットをLDPC符号まで育てる。データ圧縮でワザを早く使い、シャノンで山札から欲しいカードを選ぶ。',
    cards: { bit: 2, parity: 2, hamming: 2, ldpc: 2, relay: 1, shannon: 1, compress: 2, ultimate: 1, pair: 2, import: 2, grep: 1, update: 1, debug: 1 },
  },
  {
    id: 'p_ada', name: 'エイダのノート', energy: ['algo', 'ai'], key: ['noteg', 'nestloop'],
    blurb: 'ノートGの「ベルヌーイ数」は使うたびに強くなる。ループを二重ループに進化させ、自動作曲はタイプをそろえずに場をにぎやかに。詩的科学で、どの色のエネルギーでもワザが使える。',
    cards: { noteg: 2, loop: 2, nestloop: 2, compose: 2, func: 1, recursion: 1, ada: 1, poetical: 2, lovelace: 1, pair: 2, import: 2, grep: 1, debug: 1 },
  },
  {
    id: 'p_hopper', name: 'COBOL開発チーム', energy: ['data', 'hw'], key: ['cobol', 'mark1'],
    blurb: '機械語をFLOW-MATIC、COBOLへと進化させる。COBOLは1回だけHP10で持ちこたえる。ハーバード・マークIは大きな一撃のあと1回休み。ホッパーで進化カードを2枚まとめて探す。',
    cards: { machinecode: 2, flowmatic: 2, cobol: 2, mark1: 1, moth: 1, compiler: 1, hopper: 1, nanosec: 2, logbook: 1, pair: 2, import: 2, grep: 1, update: 1, debug: 1 },
  },
  {
    id: 'p_weiser', name: 'ユビキタス研究室', energy: ['net', 'hw'], key: ['ubiq', 'board'],
    blurb: 'タブ・パッド・ボードは、種類をそろえるほど強くなる。ベンチのセンサーが見張り、パソコンをユビキタスへ。ワイザーはベンチが多いほどたくさん引ける。',
    cards: { pc: 2, ubiq: 2, dnature: 1, tab: 2, pad: 2, board: 1, sensor: 2, weiser: 1, calm: 1, pair: 2, import: 2, grep: 1, debug: 1 },
  },
  {
    id: 'p_tron', name: 'どこでもコンピュータ', energy: ['hw', 'algo'], key: ['tronex', 'embedded'],
    blurb: 'ベンチのTRONがワザのダメージを底上げし、環境発電でベンチにエネルギーをためる。IoTは場のユニットが多いほど強い。TRONハウスを置けば、ベンチは毎番回復。',
    cards: { tronex: 2, embedded: 2, rtos: 2, iot: 1, pc: 2, ubiq: 1, ictag: 1, harvest: 2, tronhouse: 1, pair: 2, import: 2, grep: 1, debug: 1 },
  },
  {
    id: 'p_ochiai', name: '溶け合う世界', energy: ['hw', 'data'], key: ['dnature', 'null2'],
    blurb: 'ベンチの音響浮揚で入れかえやすく、ホログラムとデジタルツインはしぶとい。null²はダメージを鏡ではね返す。落合陽一でどのタイプの弱点も突く。',
    cards: { levitation: 2, hologram: 2, twin: 2, null2: 1, pc: 2, ubiq: 2, dnature: 2, ochiai: 1, plasma: 2, pair: 2, import: 2 },
  },
  {
    id: 'p_compile', name: 'コンパイラ工房', energy: ['net'], key: ['compiler', 'lambda'],
    blurb: 'コンパイラexのビルドでベンチを育て、低コストのラムダ式で攻める。無色だけのデッキ。',
    cards: { hello: 2, ifstmt: 2, func: 2, lambda: 2, compiler: 2, pair: 2, opensource: 1, import: 2, grep: 1, hackathon: 1, debug: 1, ram: 1, alttab: 1 },
  },
];

/* ---------- レア度とパック ---------- */
const RARITY_MARK = { 1: '◆', 2: '◆◆', 3: '◆◆◆', 4: '◆◆◆◆' };
function rarityOf(d) { return d.kind === 'mon' ? (d.ex ? 4 : d.stage) : (d.rar || 1); }
const SERIES = [
  { id: 'ubicomp', name: '「遍在する計算機」シリーズ', short: '遍在する計算機', isNew: true, blurb: '「遍在（へんざい）」は、どこにでもあること。コンピュータが見えなくなり、物の中に入り、やがて自然と区別がつかなくなっていく流れをたどるパック。シリーズのカードは、このパックからしか出ない。' },
  { id: 'pioneer', name: '「プログラミングの先駆者」シリーズ', short: 'プログラミングの先駆者', blurb: '「プログラムを書く」ことを切りひらいた人の名前がついたパック。シリーズのカードは、このパックからしか出ない。' },
  { id: 'father', name: '「コンピュータの父」シリーズ', short: 'コンピュータの父', blurb: 'コンピュータ科学の土台をきずいた3人の名前がついたパック。シリーズのカードは、このパックからしか出ない。' },
  { id: 'base', name: 'スタンダード', blurb: 'ふつうのカードとコマンドが入ったパック。' },
];
const PACKS = [
  {
    id: 'turing', series: 'father', name: 'アラン・チューリング', en: 'ALAN TURING', cover: 'alan', feature: 'alan', c1: '#2e6b4f', c2: '#1d3557',
    tagline: '計算の理論・暗号解読・AI',
    ids: ['alan', 'enigma', 'bombe', 'colossus', 'ace', 'halting', 'eliza', 'turtest', 'codebreak', 'turing', 'vacuum', 'caesar'],
  },
  {
    id: 'neumann', series: 'father', name: 'ジョン・フォン・ノイマン', en: 'JOHN VON NEUMANN', cover: 'neumann', feature: 'neumann', c1: '#2c5fae', c2: '#4a2f7a',
    tagline: 'コンピュータの設計・ゲーム理論',
    ids: ['neumann', 'punch', 'diffeng', 'analytic', 'stored', 'eniac', 'montecarlo', 'minimax', 'gametheory', 'bubble', 'merge', 'mainmem'],
  },
  {
    id: 'shannon', series: 'father', name: 'クロード・シャノン', en: 'CLAUDE SHANNON', cover: 'shannon', feature: 'shannon', c1: '#1f7a8c', c2: '#8a2f3c',
    tagline: '情報理論・デジタル回路・誤り訂正',
    ids: ['shannon', 'bit', 'parity', 'hamming', 'ldpc', 'relay', 'theseus', 'otp', 'compress', 'ultimate', 'transistor', 'gate'],
  },
  {
    id: 'ada', series: 'pioneer', name: 'エイダ・ラブレス', en: 'ADA LOVELACE', cover: 'ada', feature: 'ada', c1: '#6b3fa0', c2: '#b03a5b',
    tagline: '世界初のプログラム・ループ・詩的科学',
    ids: ['ada', 'noteg', 'nestloop', 'jacquard', 'compose', 'adalang', 'poetical', 'lovelace', 'loop', 'variable', 'func'],
  },
  {
    id: 'hopper', series: 'pioneer', name: 'グレース・ホッパー', en: 'GRACE HOPPER', cover: 'hopper', feature: 'hopper', c1: '#1f3a68', c2: '#a8742a',
    tagline: 'コンパイラ・COBOL・バグの語源',
    ids: ['hopper', 'machinecode', 'flowmatic', 'cobol', 'mark1', 'moth', 'nanosec', 'logbook', 'compiler', 'hello', 'debug'],
  },
  {
    id: 'weiser', series: 'ubicomp', name: 'マーク・ワイザー', en: 'MARK WEISER', cover: 'weiser', feature: 'weiser', c1: '#2f7d6b', c2: '#c98a2e', isNew: true,
    tagline: 'ユビキタス・見えなくなるコンピュータ',
    ids: ['weiser', 'pc', 'ubiq', 'tab', 'pad', 'board', 'sensor', 'calm', 'wlan', 'router'],
  },
  {
    id: 'tron', series: 'ubicomp', name: 'TRON', en: 'TRON PROJECT', cover: 'tronex', feature: 'tronex', c1: '#b23a3a', c2: '#2b2f6b', isNew: true,
    tagline: 'どこでもコンピュータ・組込み・IoT',
    ids: ['tronex', 'embedded', 'rtos', 'iot', 'ictag', 'harvest', 'tronhouse', 'cache', 'mainmem'],
  },
  {
    id: 'ochiai', series: 'ubicomp', name: '落合陽一', en: 'YOICHI OCHIAI', cover: 'ochiai', feature: 'ochiai', c1: '#3c4a5c', c2: '#7fb7c9', isNew: true,
    tagline: 'デジタルネイチャー・浮遊・ホログラム',
    ids: ['ochiai', 'dnature', 'levitation', 'hologram', 'twin', 'null2', 'plasma', 'gpu', 'array'],
  },
  { id: 'logic', series: 'base', name: '論理と構造', en: 'LOGIC & STRUCTURE', types: ['algo', 'data', 'none'], cover: 'astar', c1: '#2f8a4f', c2: '#2c5fae' },
  { id: 'world', series: 'base', name: 'つながる世界', en: 'CONNECTED WORLD', types: ['net', 'sec'], cover: 'ransom', c1: '#b07f06', c2: '#c0392b' },
  { id: 'mind', series: 'base', name: '機械と知能', en: 'MACHINE & MIND', types: ['hw', 'ai'], cover: 'quantum', c1: '#cf6420', c2: '#7547ad' },
];
const PACK_POINT = 5; // 1パックあたりのパックポイント
const MULTI_PACKS = 10; // 「10連」でまとめてひらくパックの数（チケットも同じ枚数を使う）
// もらえるパックチケット（はじめ・勝ち・負け・引き分け・毎日）。降参したときは0枚
const REWARD = { start: 30, win: 5, lose: 3, draw: 3, daily: 10 };
const REWARD_TEXT = `勝ち+${REWARD.win}、負け・引き分け+${REWARD.lose}`;
const EXCHANGE_COST = { 1: 35, 2: 70, 3: 150, 4: 400 };
