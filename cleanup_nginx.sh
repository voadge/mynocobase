#!/bin/bash
set -e
CONF=/opt/noco-base/storage/nocobase.conf
cp "$CONF" "${CONF}.bak.$(date +%s)"

# Remove unused __auth-check
awk '/^    location = \/__auth-check \{/{skip=1} skip&&/^    }$/{skip=0;next} !skip' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Remove unused @login_redirect
awk '/^    location @login_redirect \{/{skip=1} skip&&/^    }$/{skip=0;next} !skip' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Remove double blank lines
awk '!(!$0 && wasempty) {print} {wasempty=!$0}' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

docker exec noco-base_app_1 nginx -t && docker exec noco-base_app_1 nginx -s reload && echo "=== CLEAN ==="
