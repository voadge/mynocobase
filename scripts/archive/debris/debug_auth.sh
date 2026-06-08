#!/bin/bash
sudo docker exec noco-base_app_1 sh -c 'cat > /tmp/test_loc.conf << EOF
    location = /__auth-test {
        auth_request /__auth-check;
        error_page 401 = @test_index;
        return 302 /dashboard/index.html;
    }
    location @test_index {
        default_type text/plain;
        return 200 "LOGIN REQUIRED - SERVED";
    }
EOF
'
echo "Done"