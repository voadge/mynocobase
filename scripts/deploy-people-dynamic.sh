#!/bin/bash
# deploy-people-dynamic.sh — 人员动态优化 v2.0 部署

set -e
echo "=== 步骤 0: 备份 ==="
bash scripts/backup.sh

echo "=== 步骤 1: DB migration ==="
docker exec -i noco-base-app-1 psql -U nocobase -d nocobase < migrations/migration_location_history_extend.sql

echo "=== 步骤 2: 上传前端文件 ==="
ASSETS_SRC="assets/location-service.js"
DASHBOARD_SRC="dashboard/人员动态.html dashboard/sw.js"
for f in assets/location-service.js assets/attend.js assets/core.js; do
  if [ -f "$f" ]; then
    docker cp "$f" noco-base-app-1:/app/nocobase/dashboard/"$f"
  fi
done
for f in dashboard/人员动态.html dashboard/sw.js; do
  if [ -f "$f" ]; then
    docker cp "$f" noco-base-app-1:/app/nocobase/dashboard/"$f"
  fi
done

echo "=== 步骤 3: 上传插件 ==="
docker cp nocobase-plugin-people-dynamic noco-base-app-1:/app/nocobase/packages/
docker exec noco-base-app-1 npx nocobase pm add @nocobase/plugin-people-dynamic
docker exec noco-base-app-1 npx nocobase pm enable @nocobase/plugin-people-dynamic

echo "=== 步骤 4: 更新 nginx ==="
if [ -f nginx.conf ]; then
  docker cp nginx.conf noco-base-nginx-proxy-1:/etc/nginx/nginx.conf
  docker exec noco-base-nginx-proxy-1 nginx -t
  docker exec noco-base-nginx-proxy-1 nginx -s reload
fi

echo "=== 部署完成 ==="
