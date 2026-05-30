#!/bin/bash
# 从云端一键备份到本地
# 使用方法: bash backup-from-cloud.sh

set -e

# 配置
SSH_KEY="E:/voadge.pem"
SERVER="ubuntu@110.42.236.231"
REMOTE_DIR="/opt/noco-base"
LOCAL_DIR="E:/my-project/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "=========================================="
echo "  NocoBase 云端数据备份到本地"
echo "=========================================="
echo ""

# 创建本地备份目录
mkdir -p "$LOCAL_DIR"

# 1. 在服务器上执行备份
echo "1/4 在服务器上执行数据库备份..."
ssh -i "$SSH_KEY" "$SERVER" "cd $REMOTE_DIR && bash backup.sh" 2>/dev/null

# 2. 获取最新的备份文件名
echo "2/4 获取备份文件信息..."
LATEST_BACKUP=$(ssh -i "$SSH_KEY" "$SERVER" "ls -t $REMOTE_DIR/backups/*.sql.gz 2>/dev/null | head -1")
if [ -z "$LATEST_BACKUP" ]; then
    echo "错误: 未找到备份文件"
    exit 1
fi
BACKUP_NAME=$(basename "$LATEST_BACKUP")
echo "   备份文件: $BACKUP_NAME"

# 3. 下载备份文件
echo "3/4 下载备份文件到本地..."
scp -i "$SSH_KEY" "$SERVER:$LATEST_BACKUP" "$LOCAL_DIR/"
echo "   已下载到: $LOCAL_DIR/$BACKUP_NAME"

# 4. 下载 NocoBase 配置
echo "4/4 下载 NocoBase 配置文件..."
scp -i "$SSH_KEY" "$SERVER:$REMOTE_DIR/docker-compose.yml" "$LOCAL_DIR/docker-compose-$DATE.yml"
scp -i "$SSH_KEY" "$SERVER:$REMOTE_DIR/env/app.env" "$LOCAL_DIR/app-$DATE.env"
scp -i "$SSH_KEY" "$SERVER:$REMOTE_DIR/env/postgres.env" "$LOCAL_DIR/postgres-$DATE.env"

echo ""
echo "=========================================="
echo "  备份完成！"
echo "=========================================="
echo ""
echo "备份文件位置:"
echo "  数据库: $LOCAL_DIR/$BACKUP_NAME"
echo "  配置:   $LOCAL_DIR/docker-compose-$DATE.yml"
echo "          $LOCAL_DIR/app-$DATE.env"
echo "          $LOCAL_DIR/postgres-$DATE.env"
echo ""
echo "备份时间: $(date '+%Y-%m-%d %H:%M:%S')"
