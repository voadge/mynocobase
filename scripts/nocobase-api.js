const http = require('http');

// NocoBase API 配置
const NOCOBASE_HOST = 'localhost';
const NOCOBASE_PORT = 80;
const MCP_TOKEN = 'nocobase-mcp-token';

// 调用 NocoBase API
function callNocoBase(method, params = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: method,
      params: params
    });

    const options = {
      hostname: NOCOBASE_HOST,
      port: NOCOBASE_PORT,
      path: '/api/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MCP_TOKEN}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 主函数
async function main() {
  console.log('正在连接 NocoBase...');
  
  try {
    // 测试连接
    const result = await callNocoBase('resources.list');
    console.log('API 响应:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('错误:', error.message);
  }
}

main();
