#!/bin/bash
set -e
CONF=/opt/noco-base/storage/nocobase.conf
cp "$CONF" "${CONF}.bak.$(date +%s)"

# Remove auth_request from /dashboard/, keep it simple
awk '
/^    location \/dashboard\/ \{/ {
    print "    location /dashboard/ {"
    print "        alias /app/nocobase/storage/dashboard/;"
    print "        add_header Cache-Control no-store;"
    print "    }"
    skip=1
}
skip && /^    }$/ {skip=0; next}
!skip
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

docker exec noco-base_app_1 nginx -t && docker exec noco-base_app_1 nginx -s reload && echo "=== NGINX OK ==="
