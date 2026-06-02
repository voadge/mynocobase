#!/bin/bash
# Properly test auth_request behavior with location = /
# Inserts test blocks INSIDE the server block (before location /)

CONF=/opt/noco-base/storage/nocobase.conf
cp "$CONF" "${CONF}.bak.test2"

# Remove any old test blocks
sed -i '/__always-401/,/^    }/d' "$CONF"
sed -i '/__test-auth/,/^    }/d' "$CONF"

# Insert test blocks before "location /" using sed
sed -i '/^    location \/ \{/i\
\
    location = /__always-401 {\
        internal;\
        return 401;\
    }\
    location = /__test-auth-401 {\
        auth_request /__always-401;\
        error_page 401 = @test_401;\
        return 200 "RETURN_WON";\
    }\
    location @test_401 {\
        default_type text/plain;\
        return 200 "ERROR_PAGE_WON";\
    }\
' "$CONF"

docker exec noco-base_app_1 nginx -t && docker exec noco-base_app_1 nginx -s reload
echo "=== Config updated ==="