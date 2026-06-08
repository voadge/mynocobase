#!/bin/bash
set -e
CONF=/opt/noco-base/storage/nocobase.conf
cp "$CONF" "${CONF}.bak.$(date +%s)"

# Remove location = / block (the root redirect)
awk '
/^    location = \/ \{/ {skip=1}
skip && /^    }$/ {skip=0; next}
!skip
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Simplify @login_redirect - remove redirect parameter
awk '
/^    location @login_redirect \{/ {
    print "    location @login_redirect {"
    print "        return 302 $upstream_x_forwarded_proto://$http_host:668/signin;"
    print "    }"
    skip=1
}
skip && /^    }$/ {skip=0; next}
!skip
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Remove trailing blank lines before location /
awk '
BEGIN { blanks="" }
/^    location \/ \{/ { print blanks $0; blanks=""; next }
{ if (/^$/) { blanks=blanks $0 "\n" } else { printf "%s%s\n", blanks, $0; blanks="" } }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

docker exec noco-base_app_1 nginx -t && docker exec noco-base_app_1 nginx -s reload && echo "=== DONE ==="
