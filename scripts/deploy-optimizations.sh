#!/bin/bash
# deploy-optimizations.sh — 考勤+人员动态优化批量部署
# 执行全部 11 项优化变更的部署
set -e

SSH_KEY="E:/voadge.pem"
SERVER="ubuntu@110.42.236.231"
REMOTE="/opt/noco-base"

echo "=== 部署优化: 考勤打卡 + 人员动态 + 围栏管理 ==="
echo ""

# ============================================================
# 0. 备份
# ============================================================
echo "[0/9] 备份数据库和配置..."
ssh -i "$SSH_KEY" "$SERVER" "bash $REMOTE/backup.sh" 2>&1 || echo "备份脚本未找到，跳过..."

# ============================================================
# 1. 推送 env 配置（含 AMAP_KEY 等新变量）
# ============================================================
echo "[1/9] 推送 env/app.env..."
scp -i "$SSH_KEY" env/app.env "$SERVER:$REMOTE/env/app.env"

# ============================================================
# 2. 推送 migration SQL
# ============================================================
echo "[2/9] 推送 SQL 迁移文件..."
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE/migrations"
scp -i "$SSH_KEY" migrations/migration_merge_user_id.sql "$SERVER:$REMOTE/migrations/"
scp -i "$SSH_KEY" migrations/migration_cleanup_location_history.sql "$SERVER:$REMOTE/migrations/"
scp -i "$SSH_KEY" migrations/migration_location_history_extend.sql "$SERVER:$REMOTE/migrations/"

# ============================================================
# 3. 执行数据库迁移
# ============================================================
echo "[3/9] 执行 SQL 迁移..."
ssh -i "$SSH_KEY" "$SERVER" "docker exec -i noco-base-app-1 psql -U nocobase -d nocobase < $REMOTE/migrations/migration_location_history_extend.sql" 2>&1 || echo "  → migration_location_history_extend 已执行或跳过"
ssh -i "$SSH_KEY" "$SERVER" "docker exec -i noco-base-app-1 psql -U nocobase -d nocobase < $REMOTE/migrations/migration_merge_user_id.sql" 2>&1 || echo "  → migration_merge_user_id 已执行或跳过"
ssh -i "$SSH_KEY" "$SERVER" "docker exec -i noco-base-app-1 psql -U nocobase -d nocobase < $REMOTE/migrations/migration_cleanup_location_history.sql" 2>&1 || echo "  → migration_cleanup_location_history 已执行或跳过"

# ============================================================
# 4. 上传前端文件（人员动态 / 围栏管理 / location-service）
# ============================================================
echo "[4/9] 上传前端文件..."
scp -i "$SSH_KEY" dashboard/人员动态.html "$SERVER:$REMOTE/dashboard/人员动态.html"
scp -i "$SSH_KEY" dashboard/geofence-manager.html "$SERVER:$REMOTE/dashboard/geofence-manager.html"
scp -i "$SSH_KEY" server-location-service.js "$SERVER:$REMOTE/dashboard/assets/location-service.js"

# ============================================================
# 5. 上传插件 dist 文件（dashboard-home + people-dynamic）
# ============================================================
echo "[5/9] 上传插件更新..."
scp -i "$SSH_KEY" nocobase-plugin-dashboard-home/dist/server/index.js \
    "$SERVER:$REMOTE/plugin-dashboard-home/dist/server/index.js"

# people-dynamic 插件
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE/packages/nocobase-plugin-people-dynamic/@nocobase/plugin-people-dynamic/dist/server"
scp -i "$SSH_KEY" nocobase-plugin-people-dynamic/@nocobase/plugin-people-dynamic/dist/server/index.js \
    "$SERVER:$REMOTE/packages/nocobase-plugin-people-dynamic/@nocobase/plugin-people-dynamic/dist/server/index.js"

# 共享 auth 模块
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE/plugin-dashboard-home/lib"
scp -i "$SSH_KEY" nocobase-plugin-dashboard-home/lib/auth.js \
    "$SERVER:$REMOTE/plugin-dashboard-home/lib/auth.js"

# ============================================================
# 6. 上传工作流脚本
# ============================================================
echo "[6/9] 上传考勤规则计算工作流脚本..."
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE/workflow-scripts"
scp -i "$SSH_KEY" workflow-scripts/考勤审批__考勤规则计算__post-create.js \
    "$SERVER:$REMOTE/workflow-scripts/"

# ============================================================
# 7. 更新容器内文件（docker cp）
# ============================================================
echo "[7/9] 复制文件到容器..."
ssh -i "$SSH_KEY" "$SERVER" << 'DOCKER_CP'
# 前端文件
docker cp /opt/noco-base/dashboard/人员动态.html noco-base-app-1:/app/nocobase/storage/dashboard/人员动态.html
docker cp /opt/noco-base/dashboard/geofence-manager.html noco-base-app-1:/app/nocobase/storage/dashboard/geofence-manager.html
docker cp /opt/noco-base/dashboard/assets/location-service.js noco-base-app-1:/app/nocobase/storage/dashboard/assets/location-service.js

# 插件文件
docker cp /opt/noco-base/plugin-dashboard-home/dist/server/index.js \
    noco-base-app-1:/app/nocobase/node_modules/@nocobase/plugin-dashboard-home/dist/server/index.js
docker cp /opt/noco-base/plugin-dashboard-home/lib/auth.js \
    noco-base-app-1:/app/nocobase/node_modules/@nocobase/plugin-dashboard-home/lib/auth.js

# people-dynamic 插件
docker cp /opt/noco-base/packages/nocobase-plugin-people-dynamic \
    noco-base-app-1:/app/nocobase/packages/
DOCKER_CP

# ============================================================
# 8. 重启服务
# ============================================================
echo "[8/9] 重启 app 容器..."
ssh -i "$SSH_KEY" "$SERVER" "docker restart noco-base-app-1"
echo "等待 20 秒让 app 启动..."
sleep 20

# 检查容器健康状态
ssh -i "$SSH_KEY" "$SERVER" "docker ps --filter name=noco-base-app-1 --format '{{.Status}}'"

# 重启 nginx 使 env 生效
echo "重启 nginx..."
ssh -i "$SSH_KEY" "$SERVER" "docker exec noco-base-nginx-proxy-1 nginx -s reload" 2>&1 || true

# ============================================================
# 9. 验证
# ============================================================
echo ""
echo "[9/9] 验证部署..."
# 获取 token
TOKEN=$(ssh -i "$SSH_KEY" "$SERVER" "docker exec noco-base-app-1 sh -c 'curl -s -X POST http://127.0.0.1:13000/api/user:signin -H \"Content-Type: application/json\" -d \"{\\\"account\\\":\\\"voadge@voadge.cn\\\",\\\"password\\\":\\\"Abc123456!\\\"}\" 2>/dev/null | python3 -c \"import sys,json; print(json.load(sys.stdin).get(\\\"data\\\",{}).get(\\\"token\\\",\\\"\\\"))\"'" 2>/dev/null || echo "")

if [ -n "$TOKEN" ]; then
  echo "Token 获取成功"

  # 验证插件
  echo -n "验证 dashboard-home 插件: "
  curl -s -o /dev/null -w "%{http_code}" --cookie "nb_token=$TOKEN" https://voadge.top:668/ 2>/dev/null || echo "skip"

  echo ""
  echo -n "验证 人员动态 页面: "
  curl -s -o /dev/null -w "%{http_code}" --cookie "nb_token=$TOKEN" https://voadge.top:668/peopledynamic 2>/dev/null || echo "skip"

  echo ""
  echo -n "验证 围栏管理 页面: "
  curl -s -o /dev/null -w "%{http_code}" --cookie "nb_token=$TOKEN" https://voadge.top:668/geofence 2>/dev/null || echo "skip"

  echo ""
  echo -n "验证 geofences 表: "
  curl -s --cookie "nb_token=$TOKEN" https://voadge.top:668/api/geofences:list?pageSize=1 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK (' + str(d.get('meta',{}).get('count',0)) + ' fences)')" 2>/dev/null || echo "skip"

  echo ""
  echo -n "验证 dashboard-snapshot: "
  curl -s --cookie "nb_token=$TOKEN" https://voadge.top:668/api/__pd__/dashboard-snapshot 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK (' + str(len(d.get('workers',[]))) + ' workers)')" 2>/dev/null || echo "skip"
else
  echo "⚠ 无法获取 token，跳过验证"
fi

echo ""
echo "=== 部署完成! ==="
echo "请手动检查:"
echo "  1. 浏览器打开 https://voadge.top:668/ 确认看板正常"
echo "  2. 打开 https://voadge.top:668/peopledynamic 验证人员动态"
echo "  3. 打开 https://voadge.top:668/geofence 验证围栏管理"
echo "  4. 测试打卡流程"
echo "  5. 检查容器日志: docker logs noco-base-app-1 --tail 30"
echo ""
echo "如遇问题执行回滚: ssh -i $SSH_KEY $SERVER 'bash $REMOTE/scripts/rollback.sh'"
