#!/bin/bash
set -e

APP_CONTAINER="noco-base_app_1"
PLUGIN_PATH="/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home"

echo "=== Step 1: Verify plugin files ==="
ls -la "$PLUGIN_PATH/dist/server/" "$PLUGIN_PATH/package.json"

echo ""
echo "=== Step 2: Register plugin in database ==="
docker exec -e PGPASSWORD=nocobase123 "$APP_CONTAINER" psql -h postgres -U nocobase -d nocobase <<'EOSQL'
BEGIN;

DELETE FROM public."applicationPlugins" WHERE name = 'dashboard-home';

INSERT INTO public."applicationPlugins" (createdAt, updatedAt, name, "packageName", version, enabled, installed, "builtIn", options)
VALUES (NOW(), NOW(), 'dashboard-home', '@nocobase/plugin-dashboard-home', '1.0.0', true, true, false, '{}');

SELECT name, "packageName", enabled FROM public."applicationPlugins" WHERE name = 'dashboard-home';

COMMIT;
EOSQL

echo ""
echo "=== Step 3: Update nginx config ==="
sudo cp /opt/noco-base/nginx.conf /opt/noco-base/nginx.conf.bak.$(date +%s)

# Add /home location and update / redirect
sudo sed -i 's|return 302 .*/dashboard/index.html;|return 302 /home;|' /opt/noco-base/nginx.conf

# Check if /home location exists
if grep -q "location /home" /opt/noco-base/nginx.conf; then
    echo "/home location already exists in nginx"
else
    echo "Adding /home location to nginx..."
    sudo sed -i '/^    location \/ {/i\    location /home {\n        proxy_pass http://app:13000;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n' /opt/noco-base/nginx.conf
fi

sudo cp /opt/noco-base/nginx.conf /opt/noco-base/storage/nocobase.conf

echo ""
echo "=== Step 4: Restart services ==="
docker restart "$APP_CONTAINER"
echo "Waiting 10s for app to start..."
sleep 10

echo ""
echo "=== Step 5: Check logs ==="
docker logs "$APP_CONTAINER" --tail 30

echo ""
echo "=== Done! ==="
