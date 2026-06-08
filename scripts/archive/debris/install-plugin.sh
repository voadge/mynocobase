#!/bin/bash
set -e

########################################
# NocoBase Dashboard Home Plugin Setup
# Run on the server as root
########################################

PLUGIN_DIR="/opt/noco-base/nocobase-app/node_modules/@nocobase/plugin-dashboard-home"
STORAGE_DIR="/opt/noco-base/storage"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 1. Create plugin directory ==="
mkdir -p "$PLUGIN_DIR/dist/server"

echo "=== 2. Copy plugin files ==="
cp "$SCRIPT_DIR/@nocobase/plugin-dashboard-home/package.json" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/@nocobase/plugin-dashboard-home/dist/server/index.js" "$PLUGIN_DIR/dist/server/"
cp "$SCRIPT_DIR/client-v2.js" "$PLUGIN_DIR/"

echo "=== 3. Register plugin in database ==="
docker exec nocobase-db psql -U nocobase -d nocobase -c "
DELETE FROM \"applicationPlugins\" WHERE \"name\" = 'dashboard-home';
INSERT INTO \"applicationPlugins\" (\"createdAt\", \"updatedAt\", \"name\", \"packageName\", \"version\", \"enabled\", \"installed\", \"builtIn\", \"options\")
VALUES (NOW(), NOW(), 'dashboard-home', '@nocobase/plugin-dashboard-home', '1.0.0', true, true, false, '{}');
"

echo "=== 4. Update nginx config ==="
# Backup current config
cp "$STORAGE_DIR/nocobase.conf" "$STORAGE_DIR/nocobase.conf.bak.$(date +%Y%m%d%H%M%S)"

# Check if already configured
if grep -q "__dashboard-auth-check" "$STORAGE_DIR/nocobase.conf"; then
  echo "nginx already has auth_request, skipping"
else
  # Add auth_request to /dashboard/ location
  sed -i '/location \/dashboard\//,/^[[:space:]]*}/{
    /alias/a\
        auth_request /__dashboard-auth-check;
  }' "$STORAGE_DIR/nocobase.conf"

  # Add auth-check endpoint BEFORE the location /dashboard/ block
  sed -i '/^[[:space:]]*location \/dashboard\//i\
    # NocoBase auth check (used by auth_request)\
    location = /__dashboard-auth-check {\
        internal;\
        proxy_pass http://127.0.0.1:13000;\
        proxy_pass_request_body off;\
        proxy_set_header Content-Length "";\
        proxy_set_header X-Original-URI $request_uri;\
    }' "$STORAGE_DIR/nocobase.conf"
fi

echo "=== 5. Restart app ==="
docker restart nocobase-app

echo "=== 6. Reload nginx ==="
nginx -s reload

echo ""
echo "=== Done! Test at: https://voadge.top:668/ ==="
