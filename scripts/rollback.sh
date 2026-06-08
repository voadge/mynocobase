#!/bin/bash
# rollback.sh <BACKUP_DIR>
# 回滚脚本 — 从备份目录恢复数据库、前端文件、插件、nginx配置
BACKUP_DIR="$1"
if [ -z "$BACKUP_DIR" ]; then echo "用法: bash rollback.sh /opt/noco-base/backups/备份目录"; exit 1; fi

echo "=== 回滚开始: $BACKUP_DIR ==="

# 1. 恢复数据库
echo "[1/5] 恢复数据库..."
docker exec -i -e PGPASSWORD=nocobase123 noco-base-app-1 psql -h postgres -U nocobase -d nocobase < "$BACKUP_DIR/db.sql"

# 2. 恢复前端文件
echo "[2/5] 恢复前端文件..."
cp -r "$BACKUP_DIR/dashboard/"* /opt/noco-base/dashboard/

# 3. 恢复插件
echo "[3/5] 恢复插件..."
cp -r "$BACKUP_DIR/plugin-dashboard-home/"* /opt/noco-base/plugin-dashboard-home/
# 恢复共享 auth 模块
if [ -f "$BACKUP_DIR/plugin-dashboard-home/lib/auth.js" ]; then
  mkdir -p /opt/noco-base/plugin-dashboard-home/lib
  cp "$BACKUP_DIR/plugin-dashboard-home/lib/auth.js" /opt/noco-base/plugin-dashboard-home/lib/auth.js
fi

# 4. 恢复 nginx
echo "[4/5] 恢复 nginx..."
cp "$BACKUP_DIR/nginx.conf" /opt/noco-base/
docker exec noco-base-nginx-proxy-1 nginx -s reload

# 5. 重启 app
echo "[5/5] 重启 app..."
docker restart noco-base-app-1

echo "=== 回滚完成 ==="
echo "请检查: docker logs noco-base-app-1 --tail 20"
