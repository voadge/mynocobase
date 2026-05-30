#!/usr/bin/env python3
# 导出工作流 JavaScript 代码到文件（最终版）

import subprocess
import json
import os

WORKFLOW_DIR = "/opt/noco-base/workflow-scripts"
os.makedirs(WORKFLOW_DIR, exist_ok=True)

print("导出工作流 JavaScript 代码...")

# 查询所有包含 JavaScript 代码的节点
query = """
SELECT 
  fn.id,
  fn.title,
  w.title as workflow_title,
  fn.config
FROM flow_nodes fn
JOIN workflows w ON fn."workflowId" = w.id
WHERE fn.config->>'expression' IS NOT NULL 
  AND fn.config->>'expression' != ''
ORDER BY w.title, fn.title;
"""

cmd = [
    "docker", "compose", "-f", "/opt/noco-base/docker-compose.yml",
    "exec", "-T", "postgres", "psql", "-U", "nocobase", "-d", "nocobase",
    "-t", "-A", "-c", query
]

result = subprocess.run(cmd, capture_output=True, text=True)
count = 0

for line in result.stdout.strip().split('\n'):
    if not line:
        continue
    
    parts = line.split('|')
    if len(parts) >= 4:
        node_id = parts[0].strip()
        node_title = parts[1].strip()
        workflow_title = parts[2].strip()
        config_str = parts[3].strip()
        
        try:
            config = json.loads(config_str)
            expression = config.get('expression', '')
            
            if expression:
                # 清理文件名
                clean_workflow = workflow_title.replace(' ', '_').replace('/', '_').replace('"', '').replace('(', '').replace(')', '')
                clean_node = node_title.replace(' ', '_').replace('/', '_').replace('"', '').replace('(', '').replace(')', '')
                filename = f"{WORKFLOW_DIR}/{clean_workflow}__{clean_node}__{node_id}.js"
                
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(expression)
                
                print(f"  已导出: {os.path.basename(filename)} ({len(expression)} bytes)")
                count += 1
        except json.JSONDecodeError:
            print(f"  跳过: 无法解析 JSON (节点 {node_id})")

print(f"\n导出完成！文件位置: {WORKFLOW_DIR}")
print(f"共导出 {count} 个文件")
