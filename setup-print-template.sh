#!/bin/bash
# =============================================================================
# setup-print-template.sh
# 一劳永逸的升级恢复脚本 — 升级 NocoBase 后运行一次即可
# 功能：
#   1. 检查并修复 docker-compose.yml 中的 volume mount
#   2. 检查并修复 nginx.conf 中的 print-template 路由规则
#   3. 检查并注册 print-template 插件到数据库
#   4. 重启必要的服务
# =============================================================================

# 不使用 set -e，让脚本继续运行

COMPOSE_DIR="/opt/noco-base"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
NGINX_CONF="$COMPOSE_DIR/nginx.conf"
PLUGIN_NAME="@nocobase/plugin-print-template"
PLUGIN_DIR="$COMPOSE_DIR/nocobase-plugin-print-template"
DB_NAME="nocobase"
DB_USER="nocobase"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# -------------------------------------------------------
# 1. 检查 docker-compose.yml volume mount
# -------------------------------------------------------
fix_compose_mount() {
    log_info "检查 docker-compose.yml volume mount..."
    
    if ! grep -q "nocobase-plugin-print-template" "$COMPOSE_FILE"; then
        log_warn "volume mount 缺失，正在添加..."
        
        # 在 dashboard-home mount 行之后插入
        sed -i '/nocobase-plugin-dashboard-home/a\      - ./nocobase-plugin-print-template:/app/nocobase/node_modules/@nocobase/plugin-print-template' "$COMPOSE_FILE"
        
        # 验证
        if grep -q "nocobase-plugin-print-template" "$COMPOSE_FILE"; then
            log_info "volume mount 已添加"
        else
            log_error "volume mount 添加失败！"
            return 1
        fi
    else
        log_info "volume mount 已存在"
    fi
}

# -------------------------------------------------------
# 2. 检查 nginx.conf 路由规则
# -------------------------------------------------------
fix_nginx_rules() {
    log_info "检查 nginx.conf print-template 路由规则..."
    
    if ! grep -q "print-template" "$NGINX_CONF"; then
        log_warn "nginx 规则缺失，正在添加..."
        
        # 在 "location /api/" 之前插入 print-template 规则
        sed -i '/# Print Template plugin - clean URL redirect/!{
            /location \/api\//i\
    # Print Template plugin - clean URL redirect\
    location = /print-template {\
        rewrite ^/print-template$ /api/__pt__/admin last;\
    }\
    location /print-template/ {\
        rewrite ^/print-template/(.*)$ /api/__pt__/admin/$1 last;\
    }\
\
    # Print Template plugin - admin routes (rewrite to /api/ for middleware)\
    location ^~ /__/ {\
        rewrite ^/__(.*)$ /api/__$1 last;\
    }\
\
    # Print Template plugin - pt routes (rewrite to /api/ for middleware)\
    location ^~ /__pt__/ {\
        rewrite ^/__pt__/(.*)$ /api/__pt__/$1 last;\
    }
        }' "$NGINX_CONF"
        
        # 如果上面的方法不生效，用更简单的方法
        if ! grep -q "print-template" "$NGINX_CONF"; then
            # 创建临时文件，在 /api/ location 之前插入规则
            tmpfile=$(mktemp)
            awk '
            /# API - all proxied to app/ {
                print "    # Print Template plugin - clean URL redirect"
                print "    location = /print-template {"
                print "        rewrite ^/print-template$ /api/__pt__/admin last;"
                print "    }"
                print "    location /print-template/ {"
                print "        rewrite ^/print-template/(.*)$ /api/__pt__/admin/$1 last;"
                print "    }"
                print ""
                print "    # Print Template plugin - admin routes"
                print "    location ^~ /__/ {"
                print "        rewrite ^/__(.*)$ /api/__$1 last;"
                print "    }"
                print ""
                print "    # Print Template plugin - pt routes"
                print "    location ^~ /__pt__/ {"
                print "        rewrite ^/__pt__/(.*)$ /api/__pt__/$1 last;"
                print "    }"
                print ""
            }
            { print }
            ' "$NGINX_CONF" > "$tmpfile"
            mv "$tmpfile" "$NGINX_CONF"
        fi
        
        # 验证
        if grep -q "print-template" "$NGINX_CONF"; then
            log_info "nginx 规则已添加"
        else
            log_error "nginx 规则添加失败！"
            return 1
        fi
    else
        log_info "nginx 规则已存在"
    fi
}

# -------------------------------------------------------
# 3. 检查并注册插件到数据库
# -------------------------------------------------------
fix_plugin_registration() {
    log_info "检查 print-template 插件注册状态..."
    
    # 创建 SQL 文件避免转义问题
    SQL_CHECK=$(mktemp /tmp/check_plugin_XXXXXX.sql)
    SQL_INSERT=$(mktemp /tmp/insert_plugin_XXXXXX.sql)
    SQL_CLEANUP=$(mktemp /tmp/cleanup_plugin_XXXXXX.sql)
    
    # 清理无效记录（name 以 @nocobase/ 开头但 packageName 为空的）
    cat > "$SQL_CLEANUP" << 'EOSQL'
DELETE FROM "applicationPlugins" WHERE name LIKE '@nocobase/%' AND "packageName" IS NULL;
EOSQL
    docker exec -i noco-base-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -f /dev/stdin < "$SQL_CLEANUP" 2>/dev/null || true
    
    # 检查是否已注册
    cat > "$SQL_CHECK" << 'EOSQL'
SELECT COUNT(*) FROM "applicationPlugins" WHERE name = 'print-template';
EOSQL
    
    result=$(docker exec -i noco-base-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -t -A -f /dev/stdin < "$SQL_CHECK" 2>/dev/null || echo "0")
    result=$(echo "$result" | tr -d '[:space:]')
    
    if [ "$result" = "0" ]; then
        log_warn "插件未注册，正在注册..."
        
        # 获取当前最大 ID
        cat > "$SQL_CHECK" << 'EOSQL'
SELECT COALESCE(MAX(id), 0) FROM "applicationPlugins";
EOSQL
        max_id=$(docker exec -i noco-base-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -t -A -f /dev/stdin < "$SQL_CHECK" 2>/dev/null || echo "90")
        max_id=$(echo "$max_id" | tr -d '[:space:]')
        new_id=$((max_id + 1))
        
        cat > "$SQL_INSERT" << EOSQL
INSERT INTO "applicationPlugins" (id, name, "packageName", version, enabled, installed, "createdAt", "updatedAt") 
VALUES ($new_id, 'print-template', '@nocobase/plugin-print-template', '1.0.0', true, true, NOW(), NOW());
EOSQL
        
        docker exec -i noco-base-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -f /dev/stdin < "$SQL_INSERT" 2>/dev/null
        
        log_info "插件已注册 (ID: $new_id)"
    else
        log_info "插件已注册"
    fi
    
    rm -f "$SQL_CHECK" "$SQL_INSERT" "$SQL_CLEANUP"
}

# -------------------------------------------------------
# 4. 验证插件目录
# -------------------------------------------------------
check_plugin_dir() {
    log_info "检查插件目录..."
    
    if [ ! -f "$PLUGIN_DIR/package.json" ]; then
        log_error "插件目录不存在或不完整: $PLUGIN_DIR"
        return 1
    fi
    
    if [ ! -f "$PLUGIN_DIR/dist/server/index.js" ]; then
        log_warn "插件未编译，正在编译..."
        docker exec noco-base-app-1 bash -c "cd /app/nocobase/node_modules/$PLUGIN_NAME && node node_modules/typescript/bin/tsc -p tsconfig.json" 2>/dev/null || true
    fi
    
    log_info "插件目录检查完成"
}

# -------------------------------------------------------
# 5. 验证 nginx 配置
# -------------------------------------------------------
verify_nginx() {
    log_info "验证 nginx 配置..."
    
    if docker exec noco-base-nginx-proxy-1 nginx -t 2>/dev/null; then
        log_info "nginx 配置验证通过"
        return 0
    else
        log_error "nginx 配置验证失败！"
        return 1
    fi
}

# -------------------------------------------------------
# 6. 重启服务
# -------------------------------------------------------
restart_services() {
    log_info "重启服务..."
    
    cd "$COMPOSE_DIR"
    
    # 重启 app（如果 volume mount 变了）
    if ! docker exec noco-base-app-1 ls "/app/nocobase/node_modules/$PLUGIN_NAME/package.json" >/dev/null 2>&1; then
        log_info "重启 app 容器..."
        docker compose up -d app 2>/dev/null
        log_info "等待 app 启动..."
        sleep 10
    fi
    
    # 重载 nginx（如果配置变了）
    if docker exec noco-base-nginx-proxy-1 nginx -t 2>/dev/null; then
        docker exec noco-base-nginx-proxy-1 nginx -s reload 2>/dev/null
        log_info "nginx 已重载"
    fi
}

# -------------------------------------------------------
# 7. 验证插件功能
# -------------------------------------------------------
verify_plugin() {
    log_info "验证插件功能..."
    
    # 等待 app 完全启动
    for i in $(seq 1 30); do
        status=$(curl -sk -o /dev/null -w '%{http_code}' "https://voadge.top/api/print_templates:list" 2>/dev/null || echo "000")
        if [ "$status" = "401" ] || [ "$status" = "200" ]; then
            log_info "插件 API 响应正常 (HTTP $status)"
            return 0
        fi
        sleep 2
    done
    
    log_warn "插件 API 暂未响应，请稍后重试"
    return 0
}

# -------------------------------------------------------
# 主流程
# -------------------------------------------------------
main() {
    echo "=========================================="
    echo "  print-template 插件升级恢复脚本"
    echo "=========================================="
    echo ""
    
    fix_compose_mount
    fix_nginx_rules
    fix_plugin_registration
    check_plugin_dir
    
    if verify_nginx; then
        restart_services
        verify_plugin
    fi
    
    echo ""
    echo "=========================================="
    log_info "设置完成！"
    echo ""
    echo "  访问地址: https://voadge.top/print-template"
    echo "  API 地址: https://voadge.top/api/print_templates:list"
    echo "=========================================="
}

main "$@"
