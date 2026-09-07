const http = require('http');

const WORKFLOW_ID = 366321765777420;
const NODE_QUERY = 366321765777421;
const NODE_UPDATE = 366321765777424;
const NODE_RESULT_COND = 366321765777425;

let TOKEN = '';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 80, path, method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN } };
    const req = http.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d }); } }); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function signIn() {
  const r = await api('POST', '/api/auth:signIn', { account: 'voadge@voadge.cn', password: 'admin123' });
  if (r.data && r.data.token) TOKEN = r.data.token;
  else throw new Error('Login failed');
}

function escJs(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
}

async function updateNode(id, fields) {
  const r = await api('POST', '/api/flow_nodes:update?filterByTk=' + id, fields);
  if (!r.data) console.error('  FAIL update ' + id + ': ' + JSON.stringify(r.errors || r).slice(0, 100));
  else console.log('  Updated [' + id + '] ' + (fields.title || ''));
}

async function deleteNode(id) {
  const r = await api('POST', '/api/flow_nodes:destroy?filterByTk=' + id, {});
  console.log('  Deleted [' + id + ']: ' + (r.data ? 'OK' : JSON.stringify(r.errors || r).slice(0, 80)));
}

async function createNode(title, type, config, upstreamId, downstreamId, branchIndex) {
  const body = { title, type, config, workflowId: WORKFLOW_ID };
  if (upstreamId != null) body.upstreamId = upstreamId;
  if (downstreamId != null) body.downstreamId = downstreamId;
  if (branchIndex != null) body.branchIndex = branchIndex;
  const r = await api('POST', '/api/flow_nodes:create', body);
  if (r.data && r.data.id) {
    console.log('  Created [' + r.data.id + '] ' + title + ' (' + type + ')');
    return r.data.id;
  } else {
    console.error('  FAIL create ' + title + ': ' + JSON.stringify(r.errors || r).slice(0, 200));
    return null;
  }
}

async function main() {
  console.log('=== WF-12-临时新增 部署 v2 ===\n');
  await signIn();
  console.log('Login OK\n');

  // 1. Update trigger config
  console.log('[1] Updating trigger...');
  await api('POST', '/api/workflows:' + WORKFLOW_ID + ':update', {
    config: { mode: 3, appends: ['project_id_id'], changed: [], condition: { $and: [{ estimated_cost: { $notEmpty: true } }] }, collection: 'temporary_additions' }
  });
  console.log('  Trigger OK\n');

  // 2. Update query node
  console.log('[2] Updating query node...');
  await updateNode(NODE_QUERY, {
    config: { collection: 'temporary_additions', multiple: false, params: { filter: { id: '{{$context.data.id}}' }, appends: ['project_id_id'] } }
  });

  // 3. Update "更新状态" node config
  console.log('\n[3] Updating update node...');
  await updateNode(NODE_UPDATE, {
    config: { collection: 'temporary_additions', params: { filter: { id: '{{$context.data.id}}' }, values: { status: '{{$context.data.status}}', approver_opinion: '{{$context.data.approverOpinion}}', approver_id: '{{$context.data.approverId}}' } } }
  });

  // 4. Delete old leftover nodes
  console.log('\n[4] Cleaning old nodes...');
  const oldNodes = [370253037240320, 370255096643584, 370255105032192];
  for (const id of oldNodes) await deleteNode(id);

  // 5. Create Level 1 Condition: cost < 500?
  console.log('\n[5] Building new workflow...');
  const cond1 = await createNode('预计造价<500?', 'condition', {
    rejectOnFalse: false, engine: 'formula.js',
    expression: '{{$jobsMapByNodeKey.lro3n3lg89c.estimated_cost}}-500<0'
  }, NODE_QUERY, null);
  // Connect query → cond1
  await updateNode(NODE_QUERY, { downstreamId: cond1 });

  // 6. Branch TRUE (cost < 500): 项目经理
  const scriptPM = await createNode('查找项目经理审批人', 'script', {
    expression: "async function main(context){var record=context.data;var project=await context.db.getRepository('projects').findOne({filter:{id:record.project_id}});if(!project||!project.departmentId)return false;var deptId=project.departmentId;var approverId=null;var subs=await context.db.getRepository('departments').find({filter:{parentId:deptId}});for(var i=0;i<subs.length;i++){var du=await context.db.getRepository('departmentsUsers').findOne({filter:{departmentId:subs[i].id,isOwner:true}});if(du){approverId=du.userId;break;}}if(!approverId){var dus=await context.db.getRepository('departmentsUsers').find({filter:{departmentId:deptId},appends:['user','user.roles']});for(var i=0;i<dus.length;i++){var u=dus[i].user;if(u&&u.roles){for(var j=0;j<u.roles.length;j++){if(u.roles[j].name==='project_manager'||u.roles[j].name==='ProjectManager'){approverId=u.id;break;}}}if(approverId)break;}}if(!approverId)return false;context.data.approver_id=approverId;return true;}"
  }, cond1, null, 0);

  const manualPM = await createNode('项目经理审批', 'manual', {
    assignees: ['{{$context.data.approver_id}}'],
    forms: { approval: { type: 'object', properties: { approver_opinion: { title: '审批意见', type: 'string', required: true, 'x-component': 'Input.TextArea', 'x-decorator': 'FormItem' }, approval_action: { title: '审批结果', type: 'string', required: true, enum: [{ label: '通过', value: 'approved' }, { label: '驳回', value: 'rejected' }], 'x-component': 'Radio.Group', 'x-decorator': 'FormItem' } } } },
    schema: {}
  }, scriptPM, null);

  // 7. Branch FALSE (cost >= 500): Level 2 Condition: cost > 2000?
  const cond2 = await createNode('预计造价>2000?', 'condition', {
    rejectOnFalse: false, engine: 'formula.js',
    expression: '{{$jobsMapByNodeKey.lro3n3lg89c.estimated_cost}}-2000>0'
  }, cond1, null, 1);

  const scriptFG = await createNode('查找分管领导审批人', 'script', {
    expression: "async function findUpward(deptId,db){var du=await db.getRepository('departmentsUsers').findOne({filter:{departmentId:deptId,is_manager_in_charge:true}});if(du)return du.userId;var dept=await db.getRepository('departments').findOne({filter:{id:deptId}});if(dept&&dept.parentId)return await findUpward(dept.parentId,db);return null;}async function main(context){var record=context.data;var project=await context.db.getRepository('projects').findOne({filter:{id:record.project_id}});if(!project||!project.departmentId)return false;var approverId=await findUpward(project.departmentId,context.db);if(!approverId)return false;context.data.approver_id=approverId;return true;}"
  }, cond2, null, 0);

  const manualFG = await createNode('分管领导审批', 'manual', {
    assignees: ['{{$context.data.approver_id}}'],
    forms: { approval: { type: 'object', properties: { approver_opinion: { title: '审批意见', type: 'string', required: true, 'x-component': 'Input.TextArea', 'x-decorator': 'FormItem' }, approval_action: { title: '审批结果', type: 'string', required: true, enum: [{ label: '通过', value: 'approved' }, { label: '驳回', value: 'rejected' }], 'x-component': 'Radio.Group', 'x-decorator': 'FormItem' } } } },
    schema: {}
  }, scriptFG, null);

  const scriptBM = await createNode('查找部门负责人审批人', 'script', {
    expression: "async function findUpward(deptId,db){var du=await db.getRepository('departmentsUsers').findOne({filter:{departmentId:deptId,isOwner:true}});if(du)return du.userId;var dept=await db.getRepository('departments').findOne({filter:{id:deptId}});if(dept&&dept.parentId)return await findUpward(dept.parentId,db);return null;}async function main(context){var record=context.data;var project=await context.db.getRepository('projects').findOne({filter:{id:record.project_id}});if(!project||!project.departmentId)return false;var approverId=await findUpward(project.departmentId,context.db);if(!approverId)return false;context.data.approver_id=approverId;return true;}"
  }, cond2, null, 1);

  const manualBM = await createNode('部门负责人审批', 'manual', {
    assignees: ['{{$context.data.approver_id}}'],
    forms: { approval: { type: 'object', properties: { approver_opinion: { title: '审批意见', type: 'string', required: true, 'x-component': 'Input.TextArea', 'x-decorator': 'FormItem' }, approval_action: { title: '审批结果', type: 'string', required: true, enum: [{ label: '通过', value: 'approved' }, { label: '驳回', value: 'rejected' }], 'x-component': 'Radio.Group', 'x-decorator': 'FormItem' } } } },
    schema: {}
  }, scriptBM, null);

  // 8. Merge point: 审批结果处理 (all 3 manual → scriptResult → NODE_UPDATE)
  const scriptResult = await createNode('审批结果处理', 'script', {
    expression: "async function main(context){var approval=context.approval||{};var status=approval.status||'approved';var formValues=approval.values||{};var record=context.data;var currentUserId=context.execution.context.userId;var approver=currentUserId?await context.db.getRepository('users').findOne({filter:{id:currentUserId}}):null;var approverNickname=(approver&&approver.nickname)||'';var newStatus=(status==='approved')?'已审批':'已驳回';var opinion=formValues.approver_opinion||(status==='approved'?'同意':'驳回');await context.db.getRepository('temporary_additions').update({filter:{id:record.id},values:{status:newStatus,approver_opinion:opinion,approver_id:currentUserId,approver_nickname:approverNickname}});if(status==='approved'){var project=record.project_id_id||{};function esc(s){if(!s)return '';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}var additionType=esc(record.addition_type||''),triggerReason=esc(record.trigger_reason||''),estimatedCost=record.estimated_cost!=null?record.estimated_cost:'',personnelPlan=esc(record.personnel_plan||''),materialPlan=esc(record.material_plan||''),migrantPlan=esc(record.migrant_plan||''),fundPlan=esc(record.fund_plan||''),opinionEsc=esc(opinion),approverNameEsc=esc(approverNickname),projectName=esc(project.project_name||'');var html='<div class=\"bc-card\"><div class=\"bc-hd\"><strong>'+projectName+'</strong><span>临时增项报备</span></div><div class=\"bc-sec\"><div class=\"bc-row\"><label>增项类型</label><p>'+additionType+'</p></div><div class=\"bc-row\"><label>触发原因</label><p>'+triggerReason+'</p></div><div class=\"bc-row\"><label>预计造价</label><p>'+estimatedCost+'</p></div><div class=\"bc-row\"><label>人员需求</label><p>'+personnelPlan+'</p></div><div class=\"bc-row\"><label>物料需求</label><p>'+materialPlan+'</p></div><div class=\"bc-row\"><label>用工需求</label><p>'+migrantPlan+'</p></div><div class=\"bc-row\"><label>资金需求</label><p>'+fundPlan+'</p></div><div class=\"bc-row\"><label>审批意见</label><p>'+opinionEsc+'</p></div><div class=\"bc-row\"><label>审批人</label><p>'+approverNameEsc+'</p></div></div><div class=\"bc-ft\">审批人: '+approverNameEsc+'</div></div>';try{await context.db.getRepository('briefings').create({values:{briefing_type:'报备简报',title:'['+projectName+'] 临时增项报备 - '+esc(record.addition_no||''),summary:html,briefing_date:new Date(),project_id:record.project_id,source_workflow_id:record.id}});}catch(e){}}if(record.applicant_id){try{await context.db.getRepository('notificationInAppMessages').create({values:{userId:record.applicant_id,title:'临时新增'+(status==='approved'?'审批通过':'被驳回'),content:'临时增项 ['+(record.addition_no||'')+'] 已'+(status==='approved'?'通过审批':'被驳回')+'。审批意见: '+opinion,status:'sent'}});}catch(e){}}return(status==='approved');}"
  }, null, NODE_UPDATE);

  // 9. Connect downstreams
  console.log('\n[6] Connecting nodes...');
  // cond1 true branch
  await updateNode(cond1, { downstreamId: scriptPM });
  // cond2 true branch
  await updateNode(cond2, { downstreamId: scriptFG });
  // Manual nodes → scriptResult
  await updateNode(manualPM, { downstreamId: scriptResult });
  await updateNode(manualFG, { downstreamId: scriptResult });
  await updateNode(manualBM, { downstreamId: scriptResult });

  // 10. Verify
  console.log('\n[7] Verification...');
  const verify = await api('GET', '/api/flow_nodes:list?filter=' + encodeURIComponent(JSON.stringify({ workflowId: WORKFLOW_ID })) + '&sort=id', null);
  if (verify.data) {
    console.log('\nFinal node list:');
    for (const n of verify.data) {
      console.log('  [' + n.id + '] ' + (n.title || '(no title)') + ' (' + n.type + ') up=' + (n.upstreamId || '-') + ' down=' + (n.downstreamId || '-') + ' br=' + (n.branchIndex != null ? n.branchIndex : '-'));
    }
  }

  console.log('\n=== Deployment complete! ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
