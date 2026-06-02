#!/bin/bash
# Run on HOST at container startup. Modifies nocobase.conf and reloads nginx.
# Persists across container restarts via volume mount.
set -e

CONF=/opt/noco-base/storage/nocobase.conf
DASHBOARD_DIR=/opt/noco-base/dashboard
CONTAINER=noco-base_app_1

if [ ! -d "$DASHBOARD_DIR" ] || [ ! -f "$DASHBOARD_DIR/index.html" ]; then
  exit 0
fi

cp "$CONF" "${CONF}.bak.$(date +%s)" 2>/dev/null || true

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

awk '
BEGIN { blanks="" }
/^    location \/ \{/ { print blanks $0; blanks=""; next }
{ if (/^$/) { blanks=blanks $0 "\n" } else { printf "%s%s\n", blanks, $0; blanks="" } }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

awk '
/^    location \/ \{/ {
    print "    location = /__auth-check {"
    print "        internal;"
    print "        proxy_pass http://127.0.0.1:13000/api/auth:check;"
    print "        proxy_pass_request_body off;"
    print "        proxy_set_header Content-Length \"\";"
    print "        proxy_set_header Cookie $http_cookie;"
    print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
    print "        proxy_set_header X-Forwarded-Proto $upstream_x_forwarded_proto;"
    print "        proxy_set_header Host $final_host;"
    print "    }"
    print ""
    print "    location = / {"
    print "        return 302 /dashboard/index.html;"
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
    print "        return 302 $upstream_x_forwarded_proto://$http_host:668/signin;"
    print "    }"
    print ""
}
{ print }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Verify and reload
docker exec "$CONTAINER" nginx -t && docker exec "$CONTAINER" nginx -s reload