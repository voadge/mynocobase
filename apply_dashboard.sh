#!/bin/bash
# Run this on the HOST (/opt/noco-base). Modifies nocobase.conf and reloads nginx inside the container.
set -e

CONF=/opt/noco-base/storage/nocobase.conf
DASHBOARD_DIR=/opt/noco-base/dashboard

if [ ! -d "$DASHBOARD_DIR" ] || [ ! -f "$DASHBOARD_DIR/index.html" ]; then
  echo "Dashboard not found at $DASHBOARD_DIR, skipping"
  exit 0
fi

# Backup
cp "$CONF" "${CONF}.bak.$(date +%s)"

# Remove previously injected blocks
for pattern in \
  '^    location \/dashboard\/ \{' \
  '^    location = \/__auth-check \{' \
  '^    location = \/__always-401 \{' \
  '^    location @login_redirect \{' \
  '^    location @nocobase_index \{' \
  '^    location = \/ \{'
do
  awk "/$pattern/{skip=1} skip&&/^    }$/{skip=0;next} !skip" \
    "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"
done

# Remove trailing blank lines before location /
awk '
BEGIN { blanks="" }
/^    location \/ \{/ { print blanks $0; blanks=""; next }
{ if (/^$/) { blanks=blanks $0 "\n" } else { printf "%s%s\n", blanks, $0; blanks="" } }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Inject auth-check + dashboard + login-redirect blocks
awk '
/^    location \/ \{/ {
    print "    # Auth endpoint — reads token from nb_token cookie, passes as Bearer"
    print "    location = /__auth-check {"
    print "        internal;"
    print "        proxy_set_header Authorization \"Bearer \$cookie_nb_token\";"
    print "        proxy_pass http://127.0.0.1:13000/api/auth:check;"
    print "        proxy_pass_request_body off;"
    print "        proxy_set_header Content-Length \"\";"
    print "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    print "        proxy_set_header X-Forwarded-Proto \$upstream_x_forwarded_proto;"
    print "        proxy_set_header Host \$final_host;"
    print "    }"
    print ""
    print "    location /dashboard/ {"
    print "        auth_request /__auth-check;"
    print "        error_page 401 = @login_redirect;"
    print "        alias /app/nocobase/storage/dashboard/;"
    print "        add_header Cache-Control no-store;"
    print "    }"
    print ""
    print "    location @login_redirect {"
    print "        return 302 \$upstream_x_forwarded_proto://\$http_host:668/signin;"
    print "    }"
    print ""
}
{ print }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Test and reload
docker exec noco-base_app_1 nginx -t && docker exec noco-base_app_1 nginx -s reload
echo "=== Done ==="
