// load-test.js — 性能压测脚本
// 测试关键端点：聚合API、围栏列表、位置历史
// 用法: node scripts/load-test.js

const BASE = 'https://voadge.top:668';
const AUTH = { account: 'voadge@voadge.cn', password: '875253tz@' };

async function getToken() {
  const r = await fetch(`${BASE}/api/auth:signIn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(AUTH)
  });
  const d = await r.json();
  const t = d.data?.token;
  if (!t) throw new Error('TOKEN_FAIL: ' + JSON.stringify(d));
  return t;
}

async function timeOne(url, token, label) {
  const start = Date.now();
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const body = await r.text();
  const ms = Date.now() - start;
  let size = 0, parsed = null;
  try { parsed = JSON.parse(body); size = body.length; } catch(e) {}
  return { label, url, ms, status: r.status, size, ok: r.ok, data: parsed };
}

async function warmup(token) {
  // 先发一个请求热身
  await timeOne(`${BASE}/api/__pd__/dashboard-snapshot`, token, 'warmup');
}

async function runSingleTests(token) {
  console.log('\n=== 单请求耗时测试 (各5次取中位数) ===\n');

  const endpoints = [
    { label: '聚合API dashboard-snapshot', url: `${BASE}/api/__pd__/dashboard-snapshot` },
    { label: '工作者列表 workers',          url: `${BASE}/api/__pd__/workers` },
    { label: '围栏列表 geofences',          url: `${BASE}/api/geofences:list?sort=sort&pageSize=100` },
    { label: '今日考勤 attendance',         url: `${BASE}/api/attendance_records:list?pageSize=50&sort=-check_time&filter[createdAt][$dateBetween]=${new Date().toISOString().slice(0,10)}` },
  ];

  for (const ep of endpoints) {
    const times = [];
    for (let i = 0; i < 5; i++) {
      const r = await timeOne(ep.url, token, ep.label);
      times.push(r.ms);
    }
    times.sort((a, b) => a - b);
    const median = times[2];
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = times[0], max = times[4];
    console.log(`  ${ep.label}`);
    console.log(`    最快: ${min}ms | 最慢: ${max}ms | 中位数: ${median}ms | 平均: ${avg.toFixed(0)}ms`);
  }
}

async function runConcurrentTest(token, label, url, concurrency, iterations) {
  const allTimes = [];
  let errors = 0;
  let totalSize = 0;
  const startAll = Date.now();

  for (let iter = 0; iter < iterations; iter++) {
    const batch = [];
    for (let i = 0; i < concurrency; i++) {
      batch.push(timeOne(url, token, label));
    }
    const results = await Promise.all(batch);
    for (const r of results) {
      allTimes.push(r.ms);
      totalSize += r.size;
      if (!r.ok) errors++;
    }
  }

  allTimes.sort((a, b) => a - b);
  const total = allTimes.length;
  const avg = allTimes.reduce((a, b) => a + b, 0) / total;
  const p50 = allTimes[Math.floor(total * 0.50)];
  const p90 = allTimes[Math.floor(total * 0.90)];
  const p99 = allTimes[Math.floor(total * 0.99)];
  const elapsed = Date.now() - startAll;
  const rps = (total / (elapsed / 1000)).toFixed(1);
  const avgSize = (totalSize / total / 1024).toFixed(1);

  console.log(`  ${label} (${concurrency}并发 × ${iterations}轮 = ${total}请求)`);
  console.log(`    耗时: ${elapsed}ms | RPS: ${rps} | 错误: ${errors}`);
  console.log(`    平均: ${avg.toFixed(0)}ms | P50: ${p50}ms | P90: ${p90}ms | P99: ${p99}ms`);
  console.log(`    平均响应体: ${avgSize}KB`);
  console.log('');
}

async function profileResponse(token) {
  console.log('\n=== 聚合API 响应体分析 ===\n');
  const r = await timeOne(`${BASE}/api/__pd__/dashboard-snapshot`, token, 'profile');
  if (!r.data) { console.log('  无法解析响应\n'); return; }
  const d = r.data;
  console.log(`  workers:         ${(d.workers || []).length} 人`);
  console.log(`  fences:          ${(d.fences || []).length} 个`);
  console.log(`  records (今日):  ${(d.records || []).length} 条`);
  console.log(`  latestLocations: ${Object.keys(d.latestLocations || {}).length} 人`);
  console.log(`  online:          ${Object.values(d.online || {}).filter(Boolean).length} 人在线`);
  console.log(`  serverTime:      ${d.serverTime}`);
  console.log(`  pollInterval:    ${JSON.stringify(d.pollInterval)}`);
  console.log(`  响应体大小:       ${r.size} bytes (${(r.size/1024).toFixed(1)}KB)`);
  if (d.stats) {
    const s = d.stats;
    console.log(`  stats.totalCheckedIn: ${s.totalCheckedIn}`);
    console.log(`  stats.onlineCount:    ${s.onlineCount}`);
    if (s.deptStats) console.log(`  stats.deptStats:      ${Object.keys(s.deptStats).length} 个部门`);
  }
  console.log('');
}

async function testSearchEndpoint(token) {
  console.log('\n=== 地图搜索 API 测试 ===\n');
  const queries = ['遵义', '仁怀', '项目部', '大桥'];
  for (const q of queries) {
    const r = await timeOne(`${BASE}/api/__pd__/search?q=${encodeURIComponent(q)}`, token, 'search');
    const tips = r.data?.tips || [];
    console.log(`  搜索 "${q}": ${r.ms}ms → ${tips.length} 结果 (HTTP ${r.status})`);
  }
  console.log('');
}

async function main() {
  console.log('========================================');
  console.log('  考勤+人员动态 性能压测');
  console.log('  服务器: ' + BASE);
  console.log('  时间: ' + new Date().toISOString());
  console.log('========================================\n');

  // 1. 获取 token
  console.log('获取 token...');
  const token = await getToken();
  console.log('Token 获取成功: ' + token.slice(0, 16) + '...\n');

  // 2. 热身
  await warmup(token);

  // 3. 单请求耗时
  await runSingleTests(token);

  // 4. 并发测试 - 聚合API
  console.log('=== 并发压力测试 ===\n');
  const aggUrl = `${BASE}/api/__pd__/dashboard-snapshot`;
  await runConcurrentTest(token, '聚合API dashboard-snapshot', aggUrl, 5, 4);   // 5并发×4轮=20请求
  await runConcurrentTest(token, '聚合API dashboard-snapshot', aggUrl, 10, 4);  // 10并发×4轮=40请求
  await runConcurrentTest(token, '聚合API dashboard-snapshot', aggUrl, 20, 2);  // 20并发×2轮=40请求

  // 5. 响应体分析
  await profileResponse(token);

  // 6. 搜索测试
  await testSearchEndpoint(token);

  console.log('=== 压测完成 ===');
}

main().catch(e => {
  console.error('压测失败:', e.message);
  process.exit(1);
});
