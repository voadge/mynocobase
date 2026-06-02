#!/bin/bash
set -e
CONF=/opt/noco-base/storage/nocobase.conf
cp "$CONF" "${CONF}.bak.$(date +%s)"

# Remove any dashboard blocks that might interfere
for pattern in \
  '^    location \/dashboard\/ \{' \
  '^    location = \/__auth-check \{' \
  '^    location @login_redirect \{' \
  '^    location = \/ \{'
do
  awk "/$pattern/{skip=1} skip&&/^    }$/{skip=0;next} !skip" "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"
done

# Remove trailing blank lines before location /
awk 'BEGIN { blanks="" } /^    location \/ \{/ { print blanks $0; blanks=""; next } { if (/^$/) { blanks=blanks $0 "\n" } else { printf "%s%s\n", blanks, $0; blanks="" } }' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Inject: / redirects to dashboard, dashboard is public
awk '
/^    location \/ \{/ {
    print "    location = / {"
    print "        return 302 $upstream_x_forwarded_proto://$host:668/dashboard/index.html;"
    print "    }"
    print ""
    print "    location /dashboard/ {"
    print "        alias /app/nocobase/storage/dashboard/;"
    print "        add_header Cache-Control no-store;"
    print "    }"
    print ""
}
{ print }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

docker exec noco-base_app_1 nginx -t && docker exec noco-base_app_1 nginx -s reload
echo "=== DONE ==="
