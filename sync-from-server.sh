#!/bin/bash
# ============================================================
# sync-from-server.sh
# 从服务器拉取最新文件到本地 Git 仓库，作为备份快照
# 使用方式: ./sync-from-server.sh
# 工作原理: 服务器是唯一数据源，本地只做备份
# ============================================================
set -euo pipefail

SSH_KEY="${SSH_KEY:-~/.ssh/voadge.pem}"
REMOTE="${REMOTE:-ubuntu@110.42.236.231}"
REMOTE_DIR="/opt/noco-base"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== 从服务器同步文件到本地 ==="
echo "服务器: $REMOTE"
echo "远程目录: $REMOTE_DIR"
echo "本地目录: $LOCAL_DIR"
echo ""

# 需要同步的文件列表（排除敏感信息）
SYNC_ITEMS=(
  "docker-compose.yml"
  "nginx.conf"
  "nocobase.conf"
  "10-dashboard.sh"
  "entrypoint-wrapper.sh"
  "dashboard/index.html"
  "dashboard/briefing.html"
  "dashboard/百宝箱.html"
  "dashboard/行程发票报销助手.html"
  "dashboard/智能排版打印助手.html"
  "dashboard/sw.js"
  "dashboard/nb-version.json"
  "dashboard/mappings.json"
)

echo "1. 同步配置文件和 dashboard 页面..."
for item in "${SYNC_ITEMS[@]}"; do
  dir="$(dirname "$item")"
  mkdir -p "$LOCAL_DIR/$dir"
  scp -q -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    "$REMOTE:$REMOTE_DIR/$item" "$LOCAL_DIR/$item" \
    && echo "   ✓ $item" || echo "   ✗ $item (not found on server)"
done

echo ""
echo "2. 同步 dashboard/assets/ 目录..."
rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  "$REMOTE:$REMOTE_DIR/dashboard/assets/" "$LOCAL_DIR/dashboard/assets/" 2>/dev/null \
  && echo "   ✓ dashboard/assets/ synced" || echo "   - skipping (rsync not available, using scp)"

echo ""
echo "3. 同步插件 dist/ 目录..."
for plugin in nocobase-plugin-dashboard-home nocobase-plugin-print-template; do
  if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE" \
    "[ -d $REMOTE_DIR/$plugin/dist ]"; then
    mkdir -p "$LOCAL_DIR/$plugin"
    rsync -az --delete -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
      "$REMOTE:$REMOTE_DIR/$plugin/dist/" "$LOCAL_DIR/$plugin/dist/" 2>/dev/null \
      && echo "   ✓ $plugin/dist/ synced"
  fi
done

echo ""
echo "4. 记录同步时间..."
echo "$(date '+%Y-%m-%d %H:%M:%S')" > "$LOCAL_DIR/.last-sync"

echo ""
echo "=== 同步完成 ==="
echo ""
echo "检查本地变更..."
cd "$LOCAL_DIR"
git add -A
if git diff --cached --quiet; then
  echo "没有变更，服务器文件与本地一致。"
else
  echo "变更如下:"
  git diff --cached --stat
  echo ""
  read -p "提交备份快照? (Y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    git commit -m "sync: 从服务器同步备份 $(date '+%Y-%m-%d %H:%M')"
    echo ""
    read -p "推送到远程仓库? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git push
    fi
  fi
fi
