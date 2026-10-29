#!/bin/bash
# 새 릴리스 설치: 의존성 설치 → 테스트 → current 교체 → API만 재시작 → 상태 확인.
# 실패하면 이전 릴리스로 되돌려요. 처음 설치(이전 릴리스 없음)도 돼요.
set -euo pipefail
rel="$1"
base=/home/solty/dev/policy
export PATH="$base/node/bin:$PATH"
cd "$base/releases"
mkdir -p "$rel"
tar -xzf "$rel.tar.gz" -C "$rel"
prev_link=$(readlink "$base/current" 2>/dev/null || true)
if [ -n "$prev_link" ]; then cp -a "$prev_link/node_modules" "$rel/" 2>/dev/null || true; fi
cd "$rel"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund 2>&1 | tail -1
# 서버 쪽 단위 테스트(외부 API 없이). 실패하면 current를 바꾸지 않아요.
if ! out=$(node node_modules/tsx/dist/cli.mjs --test --test-reporter=tap tests/regions.test.ts tests/sources.test.ts tests/server.test.ts 2>&1); then
  echo "$out" | grep -E '^# (pass|fail)|not ok' || true
  echo "TEST_FAILED (current 유지: ${prev_link:-없음})"; exit 1
fi
echo "$out" | grep -E '^# (pass|fail)'
cd "$base"
ln -sfn "$base/releases/$rel" current
systemctl --user daemon-reload
systemctl --user restart policy.service
port=$(grep -E '^PORT=' "$base/.env" | cut -d= -f2)
ok=0
for i in $(seq 1 30); do sleep 1; if curl -sf "http://127.0.0.1:${port:-18826}/api/health" >/dev/null; then ok=1; break; fi; done
if [ "$ok" != 1 ]; then
  if [ -n "$prev_link" ]; then ln -sfn "$prev_link" current; systemctl --user restart policy.service; echo "ROLLED_BACK to $prev_link"; else echo "START_FAILED (이전 릴리스 없음)"; fi
  exit 1
fi
echo "UP on $(readlink current) after ${i}s (previous: ${prev_link:-없음})"
