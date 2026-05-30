#!/usr/bin/env python3
# 直接查询数据库获取完整的 JavaScript 代码

import subprocess
import json

# 查询一个节点的完整配置
query = "SELECT config FROM flow_nodes WHERE id = 366698941513730;"

cmd = [
    "docker", "compose", "-f", "/opt/noco-base/docker-compose.yml",
    "exec", "-T", "postgres", "psql", "-U", "nocobase", "-d", "nocobase",
    "-t", "-A", "-c", query
]

result = subprocess.run(cmd, capture_output=True, text=True)
print("Raw output:")
print(repr(result.stdout))
print("\nFormatted output:")
print(result.stdout)

# 尝试解析 JSON
if result.stdout.strip():
    try:
        config = json.loads(result.stdout.strip())
        print("\nParsed expression:")
        print(config.get('expression', 'No expression field'))
    except:
        print("\nFailed to parse as JSON")
