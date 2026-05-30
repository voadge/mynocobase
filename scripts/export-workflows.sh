#!/bin/bash
# 导出工作流 JavaScript 代码到文件（修复版）

WORKFLOW_DIR="/opt/noco-base/workflow-scripts"
mkdir -p "$WORKFLOW_DIR"

echo "导出工作流 JavaScript 代码..."

# 查询所有包含 JavaScript 代码的节点
docker compose -f /opt/noco-base/docker-compose.yml exec -T postgres psql -U nocobase -d nocobase -t -A -c "
SELECT 
  fn.id,
  fn.title,
  w.title as workflow_title,
  fn.config->>'expression' as expression
FROM flow_nodes fn
JOIN workflows w ON fn.\"workflowId\" = w.id
WHERE fn.config->>'expression' IS NOT NULL 
  AND fn.config->>'expression' != ''
ORDER BY w.title, fn.title;
" | while IFS='|' read -r id node_title workflow_title expression; do
  if [ -n "$expression" ]; then
    # 清理文件名
    clean_workflow=$(echo "$workflow_title" | tr ' /' '_' | tr -d '"' | tr -d '/')
    clean_node=$(echo "$node_title" | tr ' /' '_' | tr -d '"' | tr -d '/')
    filename="${WORKFLOW_DIR}/${clean_workflow}__${clean_node}__${id}.js"
    
    # 使用 printf 而不是 echo 来保留多行内容
    printf '%s' "$expression" > "$filename"
    echo "  已导出: $(basename "$filename") ($(wc -c < "$filename") bytes)"
  fi
done

echo ""
echo "导出完成！文件位置: $WORKFLOW_DIR"
echo "共导出 $(ls -1 "$WORKFLOW_DIR"/*.js 2>/dev/null | wc -l) 个文件"
