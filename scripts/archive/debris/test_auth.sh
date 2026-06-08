#!/bin/bash
# Test auth_request behavior on exact match location
# Create a test endpoint that always returns 401
sudo docker exec noco-base_app_1 sh -c '
cat >> /app/nocobase/storage/nocobase.conf << "TESTEOF"

    location = /__test-auth-deny {
        internal;
        return 401;
    }

    location = /__test-root {
        auth_request /__test-auth-deny;
        error_page 401 = @test_unauthenticated;
        return 302 /dashboard/index.html;
    }
    location @test_unauthenticated {
        default_type text/plain;
        return 200 "TEST: UNAUTHENTICATED ROOT";
    }
TESTEOF
nginx -s reload 2>&1
echo "--- Config appended ---"
'