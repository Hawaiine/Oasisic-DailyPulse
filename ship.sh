#!/usr/bin/env bash
set -euo pipefail
cd /opt/daily-pulse
CF_BASE="${CF_BASE:-https://news.noah-hermes.workers.dev}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

echo "== 1/5 构建 =="
npx --no-install esbuild src/server/index.ts --bundle --platform=node --format=esm --target=node22 --outfile=dist/server.mjs

echo "== 2/5 重启 =="
sudo systemctl restart daily-pulse
sleep 4
systemctl is-active daily-pulse

echo "== 3/5 自检 =="
PT="$(grep -m1 '^PULSE_TOKEN=' .env | cut -d= -f2- || true)"
curl -s -m 10 -H "x-pulse-token: $PT" http://127.0.0.1:8790/api/health; echo

echo "== 4/5 静态指纹（盒子 vs CF assets） =="
tmpd="$(mktemp -d)"
trap 'rm -rf "$tmpd"' EXIT
(cd public && find . -type f | sort | while read -r f; do printf '%s %s\n' "$f" "$(md5sum "$f" | cut -d' ' -f1)"; done) > "$tmpd/box.txt"
while read -r f _; do
  url="$CF_BASE/${f#./}"
  [ "$f" = "./index.html" ] && url="$CF_BASE/"
  h=$(curl -sS -m 25 -A "$UA" "$url" | md5sum | cut -d' ' -f1)
  printf '%s %s\n' "$f" "$h"
done < "$tmpd/box.txt" > "$tmpd/cf.txt"

box_fp=$(md5sum "$tmpd/box.txt" | cut -d' ' -f1)
cf_fp=$(md5sum "$tmpd/cf.txt" | cut -d' ' -f1)
echo "  box: $box_fp"
echo "  cf : $cf_fp"
if [ "$box_fp" != "$cf_fp" ]; then
  echo "!! 静态资源不一致 —— CF assets 需要重发："
  diff -u "$tmpd/box.txt" "$tmpd/cf.txt" | sed -n '3,40p' || true
  exit 1
fi
echo "  ✓ 一致"

echo "== 5/5 历史保留 =="
wc -l data/history.ndjson 2>/dev/null || echo "  (无历史文件)"
du -sh data 2>/dev/null || true
