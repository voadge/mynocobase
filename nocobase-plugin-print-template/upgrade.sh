#!/bin/bash
# =============================================================================
# upgrade.sh - NocoBase 一键升级脚本
# 用法: bash upgrade.sh
# =============================================================================

set -e

COMPOSE_DIR="/opt/noco-base"
SCRIPT_DIR="$COMPOSE_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

main() {
    echo "=========================================="
    echo "  NocoBase 升级脚本"
    echo "=========================================="
    echo ""
    
    cd "$COMPOSE_DIR"
    
    # 1. 备份
    log_info "备份配置文件..."
    timestamp=$(date +%Y%m%d_%H%M%S)
    cp docker-compose.yml "docker-compose.yml.bak.$timestamp"
    cp nginx.conf "nginx.conf.bak.$timestamp"
    log_info "备份完成: docker-compose.yml.bak.$timestamp, nginx.conf.bak.$timestamp"
    
    # 2. 拉取新镜像
    log_info "拉取最新镜像..."
    docker compose pull app
    
    # 3. 重启容器
    log_info "重启容器..."
    docker compose up -d app
    
    # 4. 等待启动
    log_info "等待应用启动 (30秒)..."
    sleep 30
    
    # 5. 恢复插件配置
    log_info "恢复 print-template 插件配置..."
    bash "$SCRIPT_DIR/setup-print-template.sh"
    
    echo ""
    echo "=========================================="
    log_info "升级完成！"
    echo "=========================================="
}

main "$@"
