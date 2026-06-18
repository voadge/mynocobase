const http = require('http');
const https = require('https');
const fs = require('fs');

const BASE = process.env.NOCOBASE_BASE || 'http://localhost:80';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30000', 10);
const HTML_PATH = process.env.HTML_PATH || '/opt/noco-base/dashboard/briefing-today.html';
const SHELL_TEMPLATE = process.env.SHELL_TEMPLATE || '/opt/noco-base/dashboard/briefing-shell.html';
const isHttps = BASE.startsWith('https');
const requester = isHttps ? https : http;

const { hostname, port } = parseUrl(BASE);

let authToken = '';

function localDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseUrl(url) {
  const u = new URL(url);
  return { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80) };
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const pathWithQuery = path.startsWith('/') ? path : '/api/' + path;
    const options = {
      hostname, port,
      path: pathWithQuery,
      method,
      rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/json' }
    };
    if (authToken) {
      options.headers['Authorization'] = 'Bearer ' + authToken;
    }
    const req = requester.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) {
      const str = JSON.stringify(body);
      req.setHeader('Content-Length', Buffer.byteLength(str));
      req.write(str);
    }
    req.end();
  });
}

async function signIn() {
  const email = process.env.NOCOBASE_EMAIL || 'admin@nocobase.com';
  const password = process.env.NOCOBASE_PASSWORD || 'admin123';
  try {
    const res = await apiRequest('POST', '/api/auth:signIn', { account: email, password });
    if (res && res.data && res.data.token) {
      authToken = res.data.token;
      console.log('[认证] 登录成功');
      return true;
    }
    console.log('[认证] 登录失败:', JSON.stringify(res));
    return false;
  } catch (e) {
    console.error('[认证] 错误:', e.message);
    return false;
  }
}

function makeBrief(log, project, reviewer, approver) {
  project = project || {};
  reviewer = reviewer || {};
  approver = approver || {};

  const date = log.log_date ? String(log.log_date).slice(0, 10) : '';
  const projectName = project.project_name || '';
  const reviewerName = reviewer.nickname || reviewer.username || '';
  const approverName = approver.nickname || approver.username || '';

  const datePart = date + (log.weather ? ' ' + log.weather : '');
  let items = [];
  if (log.weather) items.push('天气:' + log.weather);
  if (log.work_content) items.push('施工:' + log.work_content);
  let resources = '';
  if (log.equipment_usage) resources += log.equipment_usage;
  if (log.material_usage) resources += (resources ? ',材料:' : '材料:') + log.material_usage;
  if (log.personnel_count) resources += (resources ? ',人员:' : '人员:') + log.personnel_count;
  if (resources) items.push('投入:' + resources);
  items.push('安全:' + (log.safety_issues || '无'));
  if (log.tomorrow_plan) items.push('明日:' + log.tomorrow_plan);

  let summary = items.join(' | ');
  if (summary.length > 100) summary = summary.slice(0, 97) + '...';

  return { datePart, projectName, summary, reviewerName, approverName };
}

async function generateBriefingHtml() {
  try {
    if (fs.existsSync(HTML_PATH)) {
      return;
    }
    if (fs.existsSync(SHELL_TEMPLATE)) {
      const shell = fs.readFileSync(SHELL_TEMPLATE, 'utf8');
      fs.writeFileSync(HTML_PATH, shell, 'utf8');
      console.log('[HTML] 从模板拷贝 Shell 到 ' + HTML_PATH);
    } else {
      console.log('[HTML] 跳过: Shell 模板不存在于 ' + SHELL_TEMPLATE);
    }
  } catch (e) {
    console.error('[HTML] 错误:', e.message);
  }
}

async function processRecords() {
  try {
    const filter = encodeURIComponent('{"$and":[{"status":{"$ne":"已发布"}},{"status":{"$ne":"已归档"}},{"status":{"$ne":"已提交"}}]}');
    const res = await apiRequest('GET', `/api/construction_daily_log:list?pageSize=50&sort=updatedAt&filter=${filter}&appends=project_id_id,reviewer_id_id,approver_id_id`);
    const records = (res && res.data) || [];
    if (records.length === 0) return;

    for (const log of records) {
      const status = log.status;
      const projectId = log.project_id;

      if (status === '已复核') {
        console.log(`[处理] 已复核: ${log.id}`);
        const deptRes = await apiRequest('GET', `/api/departments:list?filter=${encodeURIComponent(JSON.stringify({ Proj_Department: projectId }))}`);
        const depts = (deptRes && deptRes.data) || [];
        if (depts.length > 0) {
          const usersRes = await apiRequest('GET', `/api/departmentsUsers:list?filter=${encodeURIComponent(JSON.stringify({ departmentId: depts[0].id }))}`);
          const userIds = ((usersRes && usersRes.data) || []).map(u => u.userId);
          for (const uid of userIds) {
            await apiRequest('POST', '/api/notifications:create', {
              userId: uid, subject: '施工日志待审核',
              content: `施工日志 ${log.log_no || ''} 已完成复核，请审核。`, read: false
            });
          }
        }
      }

      if (status === '已审核' && log.approve_opinion) {
        console.log(`[处理] 已审核(有意见) → 生成简报: ${log.id}`);
        let project = log.project_id_id;
        if (!project && log.project_id) {
          const pRes = await apiRequest('GET', `/api/projects:get?filterByTk=${log.project_id}`);
          if (pRes && pRes.data) project = pRes.data;
        }
        const reviewer = log.reviewer_id_id || {};
        const approver = log.approver_id_id || {};

        const brief = makeBrief(log, project, reviewer, approver);
        let title = brief.projectName;

        if (!title) {
          const deptRes = await apiRequest('GET', `/api/departments:list?filter=${encodeURIComponent(JSON.stringify({ Proj_Department: projectId }))}`);
          const depts = (deptRes && deptRes.data) || [];
          if (depts.length > 0) {
            title = depts[0].name || depts[0].title || '';
          }
        }
        if (!title) title = '施工日志';

        await apiRequest('POST', '/api/briefings:create', {
          title: title,
          summary: brief.summary,
          briefing_type: '施工日志',
          briefing_date: localDate(),
          project_id: projectId,
          source_workflow_id: log.id
        });

        await apiRequest('POST', '/api/construction_daily_log:update?filterByTk=' + log.id, { status: '已发布' });

        const deptRes = await apiRequest('GET', `/api/departments:list?filter=${encodeURIComponent(JSON.stringify({ Proj_Department: projectId }))}`);
        const depts = (deptRes && deptRes.data) || [];
        if (depts.length > 0) {
          const usersRes = await apiRequest('GET', `/api/departmentsUsers:list?filter=${encodeURIComponent(JSON.stringify({ departmentId: depts[0].id }))}`);
          const userIds = ((usersRes && usersRes.data) || []).map(u => u.userId);
          for (const uid of userIds) {
            await apiRequest('POST', '/api/notifications:create', {
              userId: uid, subject: '施工日志简报已发布',
              content: `${title} ${brief.datePart} 的施工日志简报已发布`, read: false
            });
          }
        }
      }

      if (status === '已审核' && !log.approve_opinion) {
        console.log(`[处理] 已审核(无意见): ${log.id}`);
        const deptRes = await apiRequest('GET', `/api/departments:list?filter=${encodeURIComponent(JSON.stringify({ Proj_Department: projectId }))}`);
        const depts = (deptRes && deptRes.data) || [];
        if (depts.length > 0) {
          const usersRes = await apiRequest('GET', `/api/departmentsUsers:list?filter=${encodeURIComponent(JSON.stringify({ departmentId: depts[0].id }))}`);
          const userIds = ((usersRes && usersRes.data) || []).map(u => u.userId);
          for (const uid of userIds) {
            await apiRequest('POST', '/api/notifications:create', {
              userId: uid, subject: '施工日志待审核',
              content: `施工日志 ${log.log_no || ''} 待填写审核意见。`, read: false
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('[错误]', e.message);
  }
}

async function poll() {
  const signedIn = await signIn();
  if (!signedIn) {
    console.log('[启动] 认证失败，10秒后重试...');
    setTimeout(poll, 10000);
    return;
  }
  console.log(`[启动] 简报工作器已启动，轮询间隔 ${POLL_INTERVAL}ms`);
  await generateBriefingHtml();
  await processRecords();
  setInterval(async () => {
    await processRecords();
  }, POLL_INTERVAL);
}

poll();
