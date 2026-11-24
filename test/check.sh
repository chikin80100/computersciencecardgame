#!/usr/bin/env bash
# 変更のあとに毎回まわす：ビルドと、すぐ終わるテスト（あわせて10秒ほど）
#   bash test/check.sh
# ひとつでも失敗したら、そこで止まって 0 以外で終わる
set -eo pipefail
cd "$(dirname "$0")/.."
python3 build.py
echo '== sim.js（CPU同士の対戦でルールを検査）'
node test/sim.js | sed -n '/^problems:/,$p'
echo '== determinism.js（同じ種なら同じ対戦になるか）'
node test/determinism.js
echo '== shannon.js（シャノンのパックのカードの効果）'
node test/shannon.js
echo '== pioneer.js（プログラミングの先駆者シリーズのカードの効果）'
node test/pioneer.js
echo '== odds.js（パックから全カードが出るか）'
node test/odds.js | grep -E 'never pulled|no pack|god'
echo 'OK'
