#!/bin/bash
# Test: insert test location blocks inside server block using awk
CONF=/opt/noco-base/storage/nocobase.conf
cp "$CONF" "${CONF}.bak.test3"

# Clean any previous test blocks
awk '
/__always-401/ {skip=1}
skip && /^    }$/ {skip=0; next}
!skip
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

awk '
/__test-auth/ {skip=1}
skip && /^    }$/ {skip=0; next}
!skip
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

# Insert test blocks before location /
awk '
/^    location \/ \{/ {
    print ""
    print "    location = /__always-401 {"
    print "        internal;"
    print "        return 401;"
    print "    }"
    print "    location = /__test-auth {"
    print "        auth_request /__always-401;"
    print "        error_page 401 = @test_401;"
    print "        return 200 \"RETURN_WON\";"
    print "    }"
    print "    location @test_401 {"
    print "        default_type text/plain;"
    print "        return 200 \"ERROR_PAGE_WON\";"
    print "    }"
    print ""
}
{ print }
' "$CONF" > "${CONF}.tmp" && mv "${CONF}.tmp" "$CONF"

docker exec noco-base_app_1 nginx -t && docker exec noco-base_app_1 nginx -s reload
echo "=== Config updated ==="