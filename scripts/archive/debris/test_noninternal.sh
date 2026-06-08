#!/bin/bash
# Test: replace auth_request target with non-internal test location
sudo docker exec noco-base_app_1 sh -c '
CONF=/app/nocobase/storage/nocobase.conf
cp "$CONF" "${CONF}.bak3"

# Change location = / to use /__test-check instead of /__auth-check
sed -i "s|auth_request /__auth-check;|auth_request /__test-check;|g" "$CONF"
echo "After sed:"
grep "auth_request" "$CONF"

# Add non-internal test-check location before location = /
# Find the line with "location = / {" and insert before it
sed -i "/^    location = \/ {$/i\\
    location = \/__test-check {\\
        proxy_pass http:\/\/127.0.0.1:13000\/api\/auth:check;\\
        proxy_pass_request_body off;\\
        proxy_set_header Content-Length \"\";\\
        proxy_set_header Cookie \$http_cookie;\\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\\
        proxy_set_header X-Forwarded-Proto \$upstream_x_forwarded_proto;\\
        proxy_set_header Host \$final_host;\\
    }\\
" "$CONF"

echo "After insert:"
grep -A9 "__test-check" "$CONF"
'