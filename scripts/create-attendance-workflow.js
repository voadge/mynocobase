// Creates the Post-create attendance calculation workflow via NocoBase API.
// Run: docker exec -it noco-base-app-1 node /app/nocobase/storage/scripts/create-attendance-workflow.js
// Or copy to container first: docker cp scripts/create-attendance-workflow.js noco-base-app-1:/app/nocobase/storage/

const BASE = process.env.NOCOBASE_API || 'http://127.0.0.1:13000/api';
const TOKEN = process.env.NOCOBASE_TOKEN || 'ee2ccf0c-6e29-4e18-8bac-e5e145bc4726';
const HEADERS = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN };

async function api(method, path, body) {
  const url = BASE + path;
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function main() {
  // The script node code (copied from 考勤审批__考勤规则计算__post-create.js)
  var scriptCode = `
async function main(context) {
  ...
}
`;

  // 1. Create the workflow
  console.log('Creating Post-create workflow...');
  var wf = await api('POST', '/workflows:create', {
    title: '考勤规则计算 (Post-create)',
    type: 'post-create',
    enabled: true,
    config: {
      collection: 'attendance_records',
      condition: { workflow_status: { $eq: 'pending' } }
    }
  });
  var wfId = wf.data.id;
  console.log('Workflow created, ID:', wfId);

  // 2. Create script node
  console.log('Creating Script node...');
  var scriptNode = await api('POST', '/workflows/' + wfId + '/nodes:create', {
    type: 'script',
    title: '考勤规则计算',
    config: {
      script: scriptCode
    },
    upstreamId: null,
    branchIndex: null
  });
  var scriptNodeId = scriptNode.data.id;
  console.log('Script node created, ID:', scriptNodeId);

  console.log('Done! Workflow ID:', wfId, '| Script Node ID:', scriptNodeId);
}

main().catch(function(e) {
  console.error('Failed:', e.message || e);
  process.exit(1);
});
