#!/bin/bash
set -e

echo "=== Dashboard Home Plugin Deployment ==="
echo ""

PLUGIN_SRC="/tmp/plugin-files"
APP_CONTAINER="noco-base_app_1"
DB_CONTAINER="2b8e4a8928bc_noco-base-postgres-1"

# Step 1: Copy plugin files into the app container
echo ">>> Step 1: Installing plugin files into container..."
docker cp "$PLUGIN_SRC/index.js" "$APP_CONTAINER:/app/nocobase/node_modules/@nocobase/plugin-dashboard-home/dist/server/index.js" 2>/dev/null || true
docker cp "$PLUGIN_SRC/package.json" "$APP_CONTAINER:/app/nocobase/node_modules/@nocobase/plugin-dashboard-home/package.json" 2>/dev/null || true

# Copy client-v2.js (v2 client bundle) to plugin root
docker cp "$PLUGIN_SRC/client-v2.js" "$APP_CONTAINER:/app/nocobase/node_modules/@nocobase/plugin-dashboard-home/client-v2.js" 2>/dev/null || true

# Alternative: copy to host storage/plugins (mounted into container)
echo ">>> Step 1b: Installing via storage/plugins..."
mkdir -p /opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/dist/server
cp "$PLUGIN_SRC/index.js" "/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/"
cp "$PLUGIN_SRC/package.json" "/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/"
cp "$PLUGIN_SRC/client-v2.js" "/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/"

# Step 2: Verify files are in place
echo ">>> Step 2: Verifying plugin files..."
ls -la "/opt/noco-base/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/"
docker exec "$APP_CONTAINER" ls -la "/app/nocobase/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/" 2>/dev/null || echo "(container file check skipped)"


# Step 3: Register plugin in database
echo ">>> Step 3: Registering plugin in database..."
docker exec -e PGPASSWORD=nocobase123 "$APP_CONTAINER" psql -h postgres -U nocobase -d nocobase -t -A <<'SQL_EOF'
SELECT name, packageName, enabled, builtIn FROM public."applicationPlugins" ORDER BY name;
SQL_EOF

echo "---"
echo "Deleting existing entry (if any)..."
docker exec -e PGPASSWORD=nocobase123 "$APP_CONTAINER" psql -h postgres -U nocobase -d nocobase <<'SQL_EOF'
DELETE FROM public."applicationPlugins" WHERE name = 'dashboard-home';
SQL_EOF

echo "Inserting new entry..."
docker exec -e PGPASSWORD=nocobase123 "$APP_CONTAINER" psql -h postgres -U nocobase -d nocobase <<'SQL_EOF'
INSERT INTO public."applicationPlugins" (createdAt, updatedAt, name, packageName, version, enabled, installed, builtIn, options)
VALUES (NOW(), NOW(), 'dashboard-home', '@nocobase/plugin-dashboard-home', '1.0.0', true, true, false, '{}');
SQL_EOF

echo "Verifying insert..."
docker exec -e PGPASSWORD=nocobase123 "$APP_CONTAINER" psql -h postgres -U nocobase -d nocobase -t -A <<'SQL_EOF'
SELECT name, packageName, enabled, installed FROM public."applicationPlugins" WHERE name = 'dashboard-home';
SQL_EOF


# Step 4: Update nginx config
echo ">>> Step 4: Updating nginx config..."
NGINX_CONF="/opt/noco-base/storage/nocobase.conf"
sudo cp "$NGINX_CONF" "$NGINX_CONF.bak.$(date +%s)"

# Read current config
echo "Current config size: $(wc -c < $NGINX_CONF) bytes"

# Check if /home redirect already exists
if grep -q "return 302 /home;" "$NGINX_CONF" 2>/dev/null; then
    echo "Nginx already has /home redirect, skipping"
else
    echo "Adding /home redirect..."

    # Replace the location / block (currently return 302 /dashboard/...)
    sudo sed -i 's|location / {|location = / {|' "$NGINX_CONF"
    sudo sed -i 's|return 302 .*dashboard/index.html;|return 302 /home;|' "$NGINX_CONF"

    echo "Done updating nginx"
fi

# Step 5: Check if /home proxy exists
if grep -q "location /home" "$NGINX_CONF" 2>/dev/null; then
    echo "/home location already exists"
else
    echo "Adding /home proxy..."
    # Insert before the location / block
    sudo sed -i '/^    location \/ {/i\
    location /home {\
        proxy_pass http://app:13000;\
        proxy_set_header Host \$host;\
        proxy_set_header X-Real-IP \$remote_addr;\
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto \$scheme;\
    }' "$NGINX_CONF"
fi

# Step 6: Update nginx inside container
echo ">>> Step 5: Reloading nginx..."
sudo cp "$NGINX_CONF" /opt/noco-base/nginx.conf
if docker exec "$APP_CONTAINER" nginx -t 2>/dev/null; then
    docker exec "$APP_CONTAINER" nginx -s reload 2>/dev/null || true
    echo "nginx in app container reloaded"
fi

# Also reload the nginx-proxy container
docker exec noco-base-nginx-proxy-1 nginx -s reload 2>/dev/null || \
docker restart noco-base-nginx-proxy-1 2>/dev/null || \
echo "nginx proxy restart skipped"

# Step 7: Restart app container
echo ">>> Step 6: Restarting app container..."
docker restart "$APP_CONTAINER"
echo "Waiting 10 seconds for app to start..."
sleep 10

# Step 7: Check logs
echo ">>> Step 7: Checking app logs (last 30 lines)..."
docker logs "$APP_CONTAINER" --tail 30

echo ""
echo "=== Deployment complete ==="
echo "Check if the plugin loaded successfully from the logs above."
echo "Then visit: https://voadge.top:668/home"
