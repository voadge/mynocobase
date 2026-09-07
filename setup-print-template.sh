#!/bin/bash
# =============================================================================
# setup-print-template.sh
# NocoBase 升级后恢复脚本
# 功能：
#   1. 校验插件目录完整性
#   2. 清理无效 DB 记录（packageName = NULL）
#   3. 重启 app + nginx
# =============================================================================

COMPOSE_DIR="/opt/noco-base"
PLUGIN_NAME="@nocobase/plugin-print-template"
PLUGIN_DIR="$COMPOSE_DIR/nocobase-plugin-print-template"
DB_NAME="nocobase"
DB_USER="nocobase"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

main() {
  echo "=========================================="
  echo "  print-template 插件恢复脚本"
  echo "=========================================="
  echo ""

  # 1) 校验插件目录
  if [ ! -f "$PLUGIN_DIR/package.json" ]; then
    log_error "插件目录不完整: $PLUGIN_DIR"
    exit 1
  fi
  if [ ! -f "$PLUGIN_DIR/dist/server/index.js" ]; then
    log_warn "插件未编译，尝试编译..."
    docker exec noco-base-app-1 bash -c "cd /app/nocobase/node_modules/$PLUGIN_NAME && npx tsc -p tsconfig.json" 2>/dev/null || true
  fi
  log_info "插件目录 OK"

  # 2) 清理无效 DB 记录
  log_info "清理无效插件记录 (packageName=NULL)..."
  cat > /tmp/cleanup_pt.sql << 'EOSQL'
DELETE FROM "applicationPlugins" WHERE name LIKE '@nocobase/%' AND "packageName" IS NULL;
EOSQL
  docker exec -i noco-base-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -f /dev/stdin < /tmp/cleanup_pt.sql 2>/dev/null || true
  log_info "DB 记录已清理"

  # 3) 重启服务
  cd "$COMPOSE_DIR"
  docker compose up -d app
  log_info "等待 app 启动..."
  for i in $(seq 1 30); do
    status=$(docker inspect --format '{{.State.Health.Status}}' noco-base-app-1 2>/dev/null)
    [ "$status" = "healthy" ] && break
    sleep 2
  done
  docker exec noco-base-nginx-proxy-1 nginx -s reload 2>/dev/null || true
  log_info "服务已重启"

  echo ""
  echo "=========================================="
  log_info "恢复完成"
  echo "  访问地址: https://voadge.top:668/print-template"
  echo "=========================================="
}

main "$@"
