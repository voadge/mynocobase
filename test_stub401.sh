#!/bin/bash
# Test: use a stub 401 endpoint to verify auth_request behavior in location = / 
sudo docker exec noco-base_app_1 sh -c '
CONF=/app/nocobase/storage/nocobase.conf
cp "$CONF" "${CONF}.bak4"

# 1. Add stub endpoint that always returns 401
sed -i "/^    location \/ {$/i\\
    location = \/__always-401 {\\
        internal;\\
        return 401;\\
    }\\
" "$CONF"

# 2. Change location = / to use the stub
sed -i "s|auth_request /__auth-check;|auth_request /__always-401;|" "$CONF"
echo "=== Modified blocks ==="
grep -A5 "location = / {" "$CONF"
echo ""
grep -A3 "__always-401" "$CONF"

nginx -s reload 2>&1
'