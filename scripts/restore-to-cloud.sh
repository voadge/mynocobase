#!/bin/bash
# 从本地一键恢复到云端
# 使用方法: bash restore-to-cloud.sh [备份文件名]
# 示例: bash restore-to-cloud.sh nocobase_backup_20260530_120000.sql.gz

set -e

# 配置
SSH_KEY="E:/voadge.pem"
SERVER="ubuntu@110.42.236.231"
REMOTE_DIR="/opt/noco-base"
LOCAL_DIR="E:/my-project/backups"

echo "=========================================="
echo "  NocoBase 本地数据恢复到云端"
echo "=========================================="
echo ""

# 检查参数
if [ -z "$1" ]; then
    # 列出可用的备份文件
    echo "可用的备份文件:"
    echo "------------------------------------------"
    ls -lt "$LOCAL_DIR"/*.sql.gz 2>/dev/null | awk '{print NR". "$NF}' || echo "未找到备份文件"
    echo "------------------------------------------"
    echo ""
    read -p "请输入备份文件名 (或序号): " INPUT
    
    # 如果输入的是序号，则获取对应的文件名
    if [[ "$INPUT" =~ ^[0-9]+$ ]]; then
        BACKUP_FILE=$(ls -t "$LOCAL_DIR"/*.sql.gz 2>/dev/null | sed -n "${INPUT}p")
    else
        BACKUP_FILE="$LOCAL_DIR/$INPUT"
    fi
    
    if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
        echo "错误: 备份文件不存在"
        exit 1
    fi
else
    BACKUP_FILE="$LOCAL_DIR/$1"
    if [ ! -f "$BACKUP_FILE" ]; then
        # 尝试直接使用完整路径
        BACKUP_FILE="$1"
        if [ ! -f "$BACKUP_FILE" ]; then
            echo "错误: 备份文件不存在: $1"
            exit 1
        fi
    fi
fi

BACKUP_NAME=$(basename "$BACKUP_FILE")
echo "使用备份文件: $BACKUP_NAME"
echo ""

# 确认操作
read -p "确定要恢复此备份吗? 这将覆盖服务器上的数据 (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "操作已取消"
    exit 0
fi

echo ""
echo "1/4 上传备份文件到服务器..."
scp -i "$SSH_KEY" "$BACKUP_FILE" "$SERVER:$REMOTE_DIR/backups/"

echo "2/4 停止 NocoBase 服务..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR && docker compose stop app"

echo "3/4 恢复数据库..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR && docker compose exec -T postgres pg_restore -U nocobase -d nocobase --clean --if-exists < backups/$BACKUP_NAME" 2>/dev/null || \
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR && gunzip -c backups/$BACKUP_NAME | docker compose exec -T postgres psql -U nocobase -d nocobase"

echo "4/4 启动 NocoBase 服务..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR && docker compose start app"

echo ""
echo "=========================================="
echo "  恢复完成！"
echo "=========================================="
echo ""
echo "NocoBase 已恢复到备份时间点的状态"
echo "访问地址: https://voadge.top:668"
echo ""
echo "恢复时间: $(date '+%Y-%m-%d %H:%M:%S')"
