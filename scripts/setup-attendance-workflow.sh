#!/bin/bash
# Run inside the noco-base-app-1 container:
#   docker exec -i noco-base-app-1 bash < scripts/setup-attendance-workflow.sh
# Or via API from host if nginx port is accessible:
#   NOCOBASE_API=http://localhost:13002/api bash scripts/setup-attendance-workflow.sh

API="${NOCOBASE_API:-http://127.0.0.1:13000/api}"
TOKEN="${NOCOBASE_TOKEN:-}"

# Script node code (read from workflow-scripts file)
SCRIPT_CODE=$(cat <<'SCRIPT'
async function main(context) { ... }
SCRIPT
)

# 注：完整脚本请参照 workflow-scripts/考勤审批__考勤规则计算__post-create.js
# 该文件已包含坐标转换(WGS-84→GCJ-02)、全围栏匹配、归档统计合并后的完整逻辑

FULL_SCRIPT=$(cat "E:\my-project\workflow-scripts\考勤审批__考勤规则计算__post-create.js")

echo "Creating Post-create workflow..."
WF=$(curl -s -X POST "$API/workflows:create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "考勤规则计算 (Post-create)",
    "type": "post_create",
    "enabled": true,
    "config": {
      "collection": "attendance_records",
      "condition": { "$and": [{ "workflow_status": { "$eq": "pending" } }] }
    }
  }')
WF_ID=$(echo "$WF" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "Workflow created, ID: $WF_ID"

# Escape the script code for JSON
ESCAPED_SCRIPT=$(echo "$FULL_SCRIPT" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || \
  echo "$FULL_SCRIPT" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.stringify(d.toString())))" 2>/dev/null)

echo "Creating Script node..."
NODE=$(curl -s -X POST "$API/workflows/$WF_ID/nodes:create" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"type\": \"script\",
    \"title\": \"考勤规则计算\",
    \"config\": { \"script\": $ESCAPED_SCRIPT }
  }")
echo "Node created. Response: $NODE"
echo "Done! Workflow ID: $WF_ID"
