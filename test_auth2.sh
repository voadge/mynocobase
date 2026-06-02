#!/bin/bash
# Append test config to nocobase.conf on the HOST
cat >> /opt/noco-base/storage/nocobase.conf << 'NGINX_EOF'

    location = /__always-401 {
        internal;
        return 401;
    }
    location = /__always-200 {
        internal;
        return 200;
    }
    location = /__test-auth {
        auth_request /__always-401;
        error_page 401 = @test_401;
        return 200 "RETURN_WON";
    }
    location = /__test-auth-200 {
        auth_request /__always-200;
        error_page 401 = @test_401;
        return 200 "AUTH_PASSED";
    }
    location @test_401 {
        default_type text/plain;
        return 200 "ERROR_PAGE_WON";
    }
NGINX_EOF
docker exec noco-base_app_1 nginx -s reload
echo "Reloaded"