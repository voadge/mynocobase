#!/bin/bash
# ============================================================
# deploy-attendance-new.sh — 考勤系统部署脚本 (v2)
# 修复: 禁用WF-41、自动获取token、Workflow类型修正
# ============================================================
set -e

SSH_KEY="E:/voadge.pem"
SERVER="ubuntu@110.42.236.231"
REMOTE="/opt/noco-base"

echo "=== 部署更新: 考勤系统 ==="
echo ""

# 0. Disable WF-41 (old duplicate checkin workflow)
echo "[0/7] 禁用旧工作流 WF-41..."
WF41_ID="366321793040394"
ssh -i "$SSH_KEY" "$SERVER" "docker exec noco-base-app-1 sh -c 'curl -s -X POST http://127.0.0.1:13000/api/workflows:update?filterByTk=$WF41_ID -H \"Content-Type: application/json\" -H \"Authorization: Bearer ee2ccf0c-6e29-4e18-8bac-e5e145bc4726\" -d \"{\\\"enabled\\\":false}\"'" 2>&1
echo "WF-41 disabled."

# 1. Plugin
echo "[1/7] 上传新 plugin..."
scp -i "$SSH_KEY" nocobase-plugin-dashboard-home/dist/server/index.js "$SERVER:$REMOTE/plugin-dashboard-home/dist/server/index.js"

# 2. Frontend: dashboard/index.html
echo "[2/7] 上传 dashboard/index.html..."
scp -i "$SSH_KEY" dashboard/index.html "$SERVER:$REMOTE/dashboard/index.html"

# 3. Frontend: attend.js
echo "[3/7] 上传 attend.js..."
scp -i "$SSH_KEY" dashboard/assets/attend.js "$SERVER:$REMOTE/dashboard/assets/attend.js"

# 4. attendance.html
echo "[4/7] 上传 attendance.html..."
scp -i "$SSH_KEY" attendance.html "$SERVER:$REMOTE/attendance.html"

# 5. Workflow scripts
echo "[5/7] 上传工作流脚本..."
ssh -i "$SSH_KEY" "$SERVER" "mkdir -p $REMOTE/workflow-scripts $REMOTE/scripts"
scp -i "$SSH_KEY" workflow-scripts/考勤审批__考勤规则计算__post-create.js "$SERVER:$REMOTE/workflow-scripts/"

# 6. Restart app container
echo "[6/7] 重启 app 容器..."
ssh -i "$SSH_KEY" "$SERVER" "docker restart noco-base-app-1"
echo "等待 20 秒让 app 启动..."
sleep 20

# 7. Create workflow via API using NocoBase native format
echo "[7/7] 创建考勤 Post-create 工作流..."

# Get fresh token
TOKEN=$(ssh -i "$SSH_KEY" "$SERVER" "docker exec noco-base-app-1 sh -c 'curl -s -X POST http://127.0.0.1:13000/api/auth:signIn -H \"Content-Type: application/json\" -d "{\\\"account\\\":\\\"voadge@voadge.cn\\\",\\\"password\\\":\\\"875253tz@\\\"}"' 2>/dev/null | python3 -c \"import sys,json; print(json.load(sys.stdin).get('data',{}).get('token',''))\"")

if [ -z "$TOKEN" ]; then
  echo "WARNING: 无法获取新token, 使用旧token..."
  TOKEN="ee2ccf0c-6e29-4e18-8bac-e5e145bc4726"
fi

# Read script content
SCRIPT_CODE=$(cat workflow-scripts/考勤审批__考勤规则计算__post-create.js | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")

echo "Creating Post-create workflow..."
WF_RESP=$(ssh -i "$SSH_KEY" "$SERVER" "docker exec noco-base-app-1 sh -c 'curl -s -X POST http://127.0.0.1:13000/api/workflows:create -H \"Content-Type: application/json\" -H \"Authorization: Bearer $TOKEN\" -d \"{\\\"title\\\":\\\"考勤规则计算 (Post-create)\\\",\\\"enabled\\\":true,\\\"type\\\":\\\"collection\\\",\\\"config\\\":{\\\"mode\\\":1,\\\"collection\\\":\\\"attendance_records\\\",\\\"condition\\\":{\\\"\\$and\\\":[{\\\"workflow_status\\\":{\\\"\\$eq\\\":\\\"pending\\\"}}]}}}\"'" 2>&1)

WF_ID=$(echo "$WF_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null || echo "")
echo "Workflow ID: $WF_ID"

if [ -n "$WF_ID" ]; then
  echo "Creating Script node..."
  NODE_RESP=$(ssh -i "$SSH_KEY" "$SERVER" "docker exec noco-base-app-1 sh -c 'curl -s -X POST http://127.0.0.1:13000/api/workflows/$WF_ID/nodes:create -H \"Content-Type: application/json\" -H \"Authorization: Bearer $TOKEN\" -d \"{\\\"title\\\":\\\"考勤规则计算\\\",\\\"type\\\":\\\"script\\\",\\\"config\\\":{\\\"script\\\":$SCRIPT_CODE}}\"'" 2>&1)
  echo "Node created."
  echo "Response: $NODE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Node ID:', d.get('data',{}).get('id','unknown'))" 2>/dev/null
fi

echo ""
echo "=== 部署完成! ==="
echo "请检查:"
echo "  1. 容器日志: docker logs noco-base-app-1 --tail 30"
echo "  2. 浏览器打开应用测试打卡"
echo "  3. 在围栏管理页创建 '基地' 折线围栏"
