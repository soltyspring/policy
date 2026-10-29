#!/bin/bash
# 한 번만 실행해요. DNS·TLS·방화벽은 바꾸지 않고 /policy/api/ 경로만 더해요.
# 백업 → include 추가 → nginx -t → reload. 검사가 실패하면 백업으로 되돌려요.
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'sudo로 실행해 주세요.'; exit 1; }
site=/etc/nginx/sites-available/bluecl.cloud
snippet=/etc/nginx/snippets/policy.conf
source=/home/solty/dev/policy/current/deploy/policy.nginx.conf
test -f "$site" && test -f "$source"
backup="/var/backups/policy/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup"
cp -a "$site" "$backup/bluecl.cloud"
if test -f "$snippet"; then cp -a "$snippet" "$backup/policy.conf"; fi
install -o root -g root -m 644 "$source" "$snippet"
python3 - "$site" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); s=p.read_text()
marker='    include /etc/nginx/snippets/tibo.conf;'
addition='    include /etc/nginx/snippets/policy.conf;'
if addition not in s:
    if s.count(marker)!=1: raise SystemExit('기존 include를 하나만 찾지 못했어요.')
    p.write_text(s.replace(marker, marker+'\n'+addition))
PY
if ! nginx -t; then
    cp -a "$backup/bluecl.cloud" "$site"
    if test -f "$backup/policy.conf"; then cp -a "$backup/policy.conf" "$snippet"; else rm -f "$snippet"; fi
    echo "검사 실패. 원래 설정으로 되돌렸어요. 백업: $backup"
    exit 1
fi
systemctl reload nginx
echo "policy HTTPS 경로를 설치했어요. 백업: $backup"
