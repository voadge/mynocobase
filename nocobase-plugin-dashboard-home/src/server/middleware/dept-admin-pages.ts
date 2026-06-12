import type { Context } from '@nocobase/server';

function adminPageHtml(title: string, tableConfig: string, extraJs: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:20px;color:#333;font-size:14px}
h2{margin-bottom:16px;font-weight:600}
.card{background:#fff;border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,.06);padding:20px 24px;margin-bottom:20px}
.toolbar{display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.toolbar input,.toolbar select{padding:4px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;height:32px}
.toolbar button{padding:4px 15px;height:32px;background:#1890ff;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px}
.toolbar button:hover{background:#096dd9}
table{width:100%;border-collapse:collapse;font-size:14px;line-height:1.5715}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid #f0f0f0}
th{background:#fafafa;font-weight:600;color:#262626;white-space:nowrap}
tr:hover{background:#f5f5f5}
.btn-sm{padding:4px 8px;font-size:12px;line-height:1;border-radius:4px;border:1px solid #d9d9d9;cursor:pointer;background:#fff;margin-right:4px;color:#333}
.btn-sm.edit{color:#1890ff;border-color:#1890ff}
.btn-sm.del{color:#ff4d4f;border-color:#ff4d4f}
/* Ant Design Drawer */
.drawer-overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.45);z-index:1000}
.drawer-overlay.show{display:block}
.drawer{position:fixed;top:0;right:-480px;width:480px;height:100%;background:#fff;z-index:1001;transition:right .3s ease;display:flex;flex-direction:column;box-shadow:-6px 0 16px rgba(0,0,0,.08)}
.drawer-overlay.show+.drawer,.drawer.show{right:0}
.drawer-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #f0f0f0;flex-shrink:0}
.drawer-header h3{margin:0;font-size:16px;font-weight:600;color:#262626}
.drawer-close{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;font-size:16px;color:#8c8c8c;border-radius:4px}
.drawer-close:hover{background:#f5f5f5;color:#333}
.drawer-body{flex:1;overflow-y:auto;padding:24px}
.drawer-footer{flex-shrink:0;padding:10px 24px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end}
.form-row{margin-bottom:16px}
.form-row label{display:block;font-size:14px;color:#262626;margin-bottom:4px;font-weight:500}
.form-row .hint{font-size:12px;color:#8c8c8c;margin-top:4px;line-height:1.4}
.form-row input,.form-row select{width:100%;padding:4px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;height:32px;box-sizing:border-box;color:#262626;background:#fff}
.form-row input:focus,.form-row select:focus{border-color:#1890ff;outline:none;box-shadow:0 0 0 2px rgba(24,144,255,.2)}
.form-row textarea{width:100%;padding:4px 11px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px;box-sizing:border-box;font-family:monospace;min-height:60px;resize:vertical;color:#262626}
.form-row textarea:focus{border-color:#1890ff;outline:none;box-shadow:0 0 0 2px rgba(24,144,255,.2)}
.form-row .scope-presets{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.form-row .scope-presets button{padding:3px 10px;font-size:12px;border:1px solid #d9d9d9;border-radius:4px;cursor:pointer;background:#fff;color:#333;height:26px}
.form-row .scope-presets button.active{border-color:#1890ff;color:#1890ff;background:#e6f7ff}
.drawer-footer button{padding:4px 15px;height:32px;border-radius:6px;cursor:pointer;font-size:14px;border:1px solid #d9d9d9;background:#fff;color:#333}
.drawer-footer button:hover{border-color:#1890ff;color:#1890ff}
.drawer-footer .primary{background:#1890ff;color:#fff;border-color:#1890ff}
.drawer-footer .primary:hover{background:#096dd9}
.tag{padding:2px 8px;border-radius:4px;font-size:12px;background:#e6f7ff;color:#1890ff}
.action-grid{display:flex;flex-wrap:wrap;gap:6px}
.action-grid label{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid #d9d9d9;border-radius:6px;cursor:pointer;font-size:13px;transition:all .2s;background:#fff;user-select:none}
.action-grid label:hover{border-color:#1890ff;color:#1890ff}
.action-grid input[type=checkbox]{display:none}
.action-grid input[type=checkbox]:checked+span{color:#1890ff}
.action-grid label:has(input:checked){border-color:#1890ff;background:#e6f7ff}
.action-grid label:has(input[value="*"]:checked){border-color:#52c41a;background:#f6ffed}
.action-grid label:has(input[value="*"]:checked) span{color:#52c41a}
.action-grid label.disabled{opacity:.4;cursor:not-allowed;border-color:#e8e8e8;background:#fafafa}
.action-grid .action-count{font-size:11px;color:#8c8c8c;margin-left:4px}
.tag.yes{background:#f6ffed;color:#52c41a;border:1px solid #b7eb8f}
.tag.no{background:#fff2f0;color:#ff4d4f;border:1px solid #ffccc7}
.empty{text-align:center;color:#8c8c8c;padding:40px 0;font-size:14px}
.loading{text-align:center;color:#8c8c8c;padding:30px 0;font-size:14px}
.loading::before{content:'';display:inline-block;width:14px;height:14px;border:2px solid #e8e8e8;border-top-color:#1890ff;border-radius:50%;animation:spin .6s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:600px){.drawer{width:100%;right:-100%}}
</style></head><body>
<div class="card"><h2>${title}</h2>
<div class="toolbar">${tableConfig}</div>
<table><thead><tr id="thead"></tr></thead><tbody id="tbody"></tbody></table>
<div id="empty" class="empty">暂无数据</div></div>
<div class="drawer-overlay" id="overlay" onclick="closeModal()"></div>
<div class="drawer" id="drawer"><div class="drawer-header"><h3 id="modalTitle">编辑</h3><button class="drawer-close" onclick="closeModal()">&#x2715;</button></div>
<div class="drawer-body" id="modalBody"></div>
<div class="drawer-footer"><button onclick="closeModal()">取消</button><button class="primary" onclick="saveItem()">保存</button></div></div>
<script>
let EDIT_ID = null, DEPTS = [], ROLES = [], COLLS = [];
const SCOPE_VALS = ['', '{"departmentId":"$user.departmentId"}', '{"createdById":"$user.id"}', '_custom_'];
const SCOPE_FIELDS = [null, 'departmentId', 'createdById', null]; // required field per preset index
const API_BASE = '/api/__da__';
function msg(s){alert(s)}
async function loadRefs(){try{
  const [d,r,c]=await Promise.all([
    fetch('/api/__da__/departments').then(x=>x.json()),
    fetch('/api/__da__/roles').then(x=>x.json()),
    fetch('/api/__da__/collections').then(x=>x.json()),
  ]);
  DEPTS=d.data||[]; ROLES=r.data||[]; COLLS=c.data||[];
}catch(e){console.log('refs',e)}}
async function api(method,path,body){return fetch(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):void 0}).then(r=>r.json())}
function closeModal(){document.getElementById('overlay').classList.remove('show');document.getElementById('drawer').classList.remove('show')}
function openModal(){document.getElementById('overlay').classList.add('show');document.getElementById('drawer').classList.add('show');setTimeout(()=>{const e=document.querySelector('.drawer-body input:not([type=hidden]),.drawer-body select');if(e)e.focus()},350)}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal()})
${extraJs}
loadRefs();
</script></body></html>`;
}

export function registerDeptAdminPages(app: any): void {
  // ACL rules management page
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/acl-ui') return await next();
    ctx.withoutDataWrapping = true;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = adminPageHtml('部门权限管理',
      `<button onclick="editItem(null)">+ 新建规则</button><label style="margin-left:auto">部门筛选：<select id="deptFilter" onchange="loadData()"><option value="">全部部门</option></select></label>`,
      `
async function loadData() {
  const deptId = document.getElementById('deptFilter').value;
  const data = await api('GET','/api/__da__/acl-rules'+(deptId?'?departmentId='+deptId:''));
  const rules = data.data||[];
  document.getElementById('empty').style.display = rules.length?'none':'';
  const th = document.getElementById('thead');
  th.innerHTML = '<th>编号</th><th>部门</th><th>数据表</th><th>动作</th><th>权限</th><th>模式</th><th>角色</th><th>优先级</th><th>数据范围</th><th>状态</th><th>备注</th><th>操作</th>';
  const tb = document.getElementById('tbody');
  tb.innerHTML = rules.map(r => \`<tr>
    <td>\${r.ruleNo||'-'}</td>
    <td>\${(DEPTS.find(d=>d.id==r.departmentId)||{}).title||r.departmentId}</td>
    <td>\${r.resourceName||'*'}</td>
    <td>\${r.action==='*'?'所有操作':(r.action||'*').split(',').map(a=>{const m={create:'新增',view:'查看',update:'编辑',delete:'删除',list:'列表',get:'详情'};return m[a.trim()]||a.trim()}).join(', ')}</td>
    <td><span class="tag \${r.allow?'yes':'no'}">\${r.allow?'允许':'拒绝'}</span></td>
    <td>\${r.mode==='dept_and_role'?'部门+角色':'仅部门'}</td>
    <td>\${r.roleId||'-'}</td>
    <td>\${r.priority||100}</td>
    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">\${r.dataScope?JSON.stringify(r.dataScope):'-'}</td>
    <td><span class="tag \${r.enabled===false?'no':'yes'}">\${r.enabled===false?'禁用':'启用'}</span></td>
    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">\${r.remark||'-'}</td>
    <td><button class="btn-sm edit" onclick="editItem(\${r.id})">编辑</button><button class="btn-sm del" onclick="delItem(\${r.id})">删除</button></td>
  </tr>\`).join('');
}
async function editItem(id) {
  EDIT_ID = id;
  document.getElementById('modalTitle').textContent = '编辑规则';
  await loadRefs();
  const mBody = document.getElementById('modalBody');
  mBody.innerHTML = \`
    <div class="form-row"><label>部门</label><select id="f_dept">\${DEPTS.map(d=>'<option value="'+d.id+'">'+d.title+'</option>').join('')}</select><div class="hint">规则适用的部门</div></div>
    <div class="form-row"><label>数据表</label><select id="f_resource" onchange="renderActions();updateScopePresets()"><option value="*">* 所有表</option>\${COLLS.map(c=>'<option value="'+c.name+'">'+(c.title||c.name)+'</option>').join('')}</select><div class="hint">选择要控制权限的数据表</div></div>
    <div class="form-row"><label>动作</label><div id="f_action_group" style="margin-top:4px"></div><div class="hint">勾选操作，选「所有操作」则忽略其他勾选</div></div>
    <div class="form-row"><label>允许/拒绝</label><select id="f_allow"><option value="true">允许</option><option value="false">拒绝</option></select><div class="hint">允许=放行，拒绝=拦截</div></div>
    <div class="form-row"><label>模式</label><select id="f_mode" onchange="toggleRoleField()"><option value="dept">仅部门</option><option value="dept_and_role">部门+角色</option></select><div class="hint">仅部门=部门内所有人；部门+角色=部门中特定角色的人</div></div>
    <div class="form-row" id="roleRow" style="display:none"><label>角色</label><select id="f_role"><option value="">-</option>\${ROLES.map(r=>'<option value="'+r.name+'">'+r.title+'</option>').join('')}</select><div class="hint">选择部门中的哪个角色有此权限</div></div>
    <div class="form-row"><label>优先级</label><input id="f_priority" type="number" value="100"/><div class="hint">数字越小优先级越高，多个规则冲突时生效优先级高的</div></div>
    <div class="form-row"><label>数据范围</label>
      <div class="scope-presets" id="scopePresets">
        <button onclick="setScope(0)" class="active">全部数据</button>
        <button onclick="setScope(1)">本部门及下属</button>
        <button onclick="setScope(2)">仅自己</button>
        <button onclick="setScope(3)">自定义</button>
      </div>
      <textarea id="f_scope" rows="2" style="display:none">{"departmentId":"$user.departmentId"}</textarea>
      <div class="hint">限制该角色只能看到符合条件的数据。可选变量：\\$user.id \\$user.departmentId \\$nRole.name \\$date \\$now</div>
    </div>
    <div class="form-row"><label>规则编号</label><input id="f_ruleNo" placeholder="如 ACL-001，留空自动生成"/><div class="hint">便于识别和检索的编号</div></div>
    <div class="form-row"><label>备注</label><textarea id="f_remark" rows="2" placeholder="此规则的用途说明"></textarea><div class="hint">可选，描述规则创建原因或注意事项</div></div>
    <div class="form-row"><label>启用</label><select id="f_enabled"><option value="true">启用</option><option value="false">禁用</option></select><div class="hint">禁用后该规则暂不生效</div></div>
  \`;
  renderActions(id?undefined:'*');
  if(!id) setScope(0);
  updateScopePresets();
  openModal();
  if(id) loadAclItem(id);
}
async function loadAclItem(id) {
  const d=await api('GET','/api/__da__/acl-rules/'+id);
  const r=d.data; if(!r)return;
  document.getElementById('f_dept').value=r.departmentId||'';
  document.getElementById('f_resource').value=r.resourceName||'*';
  renderActions(r.action||'*');
  updateScopePresets();
  document.getElementById('f_allow').value=r.allow===false?'false':'true';
  document.getElementById('f_mode').value=r.mode||'dept'; toggleRoleField();
  if(r.roleId) document.getElementById('f_role').value=r.roleId;
  document.getElementById('f_priority').value=r.priority||100;
  const scopeStr=r.dataScope?JSON.stringify(r.dataScope):'';
  document.querySelectorAll('#scopePresets button').forEach(b=>b.classList.remove('active'));
  const si = SCOPE_VALS.indexOf(scopeStr);
  const ta=document.getElementById('f_scope');
  const btns=document.querySelectorAll('#scopePresets button');
  if(si>=0 && btns[si] && btns[si].style.display!=='none'){
    btns[si].classList.add('active');ta.style.display='none'
  }else{
    btns[3].classList.add('active');ta.style.display=''
  }
  ta.value=scopeStr;
  document.getElementById('f_ruleNo').value=r.ruleNo||'';
  document.getElementById('f_remark').value=r.remark||'';
  document.getElementById('f_enabled').value=r.enabled===false?'false':'true';
}
function toggleRoleField() {
  document.getElementById('roleRow').style.display = document.getElementById('f_mode').value==='dept_and_role'?'':'none';
}
function renderActions(selected) {
  const labels={create:'新增',view:'查看',update:'编辑',delete:'删除',list:'列表',get:'详情'};
  const g=document.getElementById('f_action_group');
  if(!g)return;
  const allActions=['create','view','update','delete','list','get'];
  const isAll=!selected||selected==='*';
  g.innerHTML='<div class="action-grid">'+
    '<label><input type="checkbox" value="*" onchange="onActionCheck(this)"><span>\u2605 所有操作</span></label>'+
    allActions.map(a=>'<label><input type="checkbox" value="'+a+'" onchange="onActionCheck(this)"><span>'+(labels[a]||a)+'</span></label>').join('')+
    '</div>';
  if(isAll){g.querySelector('input[value="*"]').checked=true;actionSetDisabled(true)}
  else{const s=selected.split(',').map(x=>x.trim());g.querySelectorAll('input[type=checkbox]').forEach(c=>{if(s.includes(c.value))c.checked=true});actionSetDisabled(false)}
  actionUpdateCount();
}
function onActionCheck(el) {
  if(el.value==='*'){actionSetDisabled(el.checked);actionUpdateCount();return}
  const checked=document.querySelectorAll('#f_action_group input[type=checkbox]:checked:not([value="*"])').length;
  if(checked===0){document.querySelector('#f_action_group input[value="*"]').checked=true;actionSetDisabled(true)}
  actionUpdateCount();
}
function actionSetDisabled(hide){
  document.querySelectorAll('#f_action_group input[type=checkbox]:not([value="*"])').forEach(c=>{c.disabled=hide;if(hide)c.checked=false;c.closest('label').classList.toggle('disabled',hide)})
}
function actionUpdateCount(){
  const total=document.querySelectorAll('#f_action_group input[type=checkbox]:not([value="*"])').length;
  const checked=document.querySelectorAll('#f_action_group input[type=checkbox]:checked:not([value="*"])').length;
  const all=document.querySelector('#f_action_group input[value="*"]');
  const ct=document.querySelector('.action-count');
  if(!ct){const el=document.createElement('span');el.className='action-count';el.textContent=all&&all.checked?'全部':('已选 '+checked+'/'+total);document.getElementById('f_action_group').appendChild(el)}
  else ct.textContent=all&&all.checked?'全部':('已选 '+checked+'/'+total);
}
function getSelectedActions() {
  const all=document.querySelector('#f_action_group input[value="*"]');
  if(all&&all.checked)return '*';
  return Array.from(document.querySelectorAll('#f_action_group input[type=checkbox]:checked:not([value="*"])')).map(c=>c.value).sort().join(',');
}
function setScope(idx) {
  document.querySelectorAll('#scopePresets button').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('#scopePresets button')[idx].classList.add('active');
  const ta=document.getElementById('f_scope');const v=SCOPE_VALS[idx];
  if(v==='_custom_'){ta.style.display='';ta.value='';setTimeout(()=>ta.focus(),100)}else{ta.value=v;ta.style.display='none'}
}
function updateScopePresets() {
  const res = document.getElementById('f_resource')?.value;
  const col = COLLS.find(c => c.name===res);
  const flds = col && col.fields ? col.fields : [];
  document.querySelectorAll('#scopePresets button').forEach((btn, i) => {
    const required = SCOPE_FIELDS[i];
    if (!required) return; // 全部数据/自定义 always shown
    const exists = flds.indexOf(required) !== -1;
    btn.style.display = exists ? '' : 'none';
    // If current active preset is now hidden, switch to 全部数据
    if (btn.classList.contains('active') && !exists) {
      // Check if 全部数据 button is the one being hidden (shouldn't happen, but safe)
    }
  });
  // Check if active button got hidden
  const active = document.querySelector('#scopePresets button.active');
  if (!active || active.style.display==='none') setScope(0);
}
async function saveItem() {
  const v = {
    departmentId: parseInt(document.getElementById('f_dept').value),
    resourceName: document.getElementById('f_resource').value,
    action: getSelectedActions(),
    allow: document.getElementById('f_allow').value==='true',
    mode: document.getElementById('f_mode').value,
    priority: parseInt(document.getElementById('f_priority').value)||100
  };
  const roleV = document.getElementById('f_role')?.value;
  if(v.mode==='dept_and_role' && roleV) v.roleId = roleV;
  const scopeV = document.getElementById('f_scope').value;
  if(scopeV) {
    try{v.dataScope=JSON.parse(scopeV)}catch(e){msg('数据范围 JSON 格式错误');return}
    if(v.resourceName && v.resourceName!=='*' && v.dataScope && typeof v.dataScope==='object') {
      const col = COLLS.find(c => c.name===v.resourceName);
      if(col && col.fields) {
        const missing = Object.keys(v.dataScope).filter(k => !k.startsWith('$') && !k.includes('.') && col.fields.indexOf(k)===-1);
        if(missing.length > 0) {
          if(!confirm('以下字段在表「'+col.title+'」中不存在，查询时可能报错：\\n  '+missing.join(', ')+'\\n确定继续保存？')) return;
        }
      }
    }
  } else {
    v.dataScope = null;
  }
  v.ruleNo = document.getElementById('f_ruleNo').value||undefined;
  v.remark = document.getElementById('f_remark').value||undefined;
  v.enabled = document.getElementById('f_enabled').value==='true';
  await api(EDIT_ID?'PUT':'POST', EDIT_ID?'/api/__da__/acl-rules/'+EDIT_ID:'/api/__da__/acl-rules', v);
  closeModal(); loadData();
}
async function delItem(id) {
  if(!confirm('确认删除？')) return;
  await api('DELETE','/api/__da__/acl-rules/'+id);
  loadData();
}
loadData();
loadRefs();`
    );
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // Approval routes management page
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/route-ui') return await next();
    ctx.withoutDataWrapping = true;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = adminPageHtml('审批路由管理',
      `<button onclick="editItem(null)">+ 新建路由</button>`,
      `
async function loadData() {
  const data = await api('GET','/api/__da__/approval-routes');
  const routes = data.data||[];
  document.getElementById('empty').style.display = routes.length?'none':'';
  document.getElementById('thead').innerHTML = '<th>名称</th><th>层级</th><th>模式</th><th>部门</th><th>角色</th><th>状态</th><th>备注</th><th>操作</th>';
  document.getElementById('tbody').innerHTML = routes.map(r => \`<tr>
    <td>\${r.name}</td>
    <td><span class="tag">\${r.levelKey}</span></td>
    <td>\${r.mode==='dept_and_role'?'部门+角色':'仅部门'}</td>
    <td>\${(DEPTS.find(d=>d.id==r.departmentId)||{}).title||r.departmentId}</td>
    <td>\${r.roleId||'-'}</td>
    <td><span class="tag \${r.enabled===false?'no':'yes'}">\${r.enabled===false?'禁用':'启用'}</span></td>
    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">\${r.remark||'-'}</td>
    <td><button class="btn-sm edit" onclick="editItem(\${r.id})">编辑</button><button class="btn-sm del" onclick="delItem(\${r.id})">删除</button></td>
  </tr>\`).join('');
}
async function editItem(id) {
  EDIT_ID = id;
  document.getElementById('modalTitle').textContent = id?'编辑路由':'新建路由';
  await loadRefs();
  document.getElementById('modalBody').innerHTML = \`
    <div class="form-row"><label>名称</label><input id="f_name" placeholder="如 行政部-部门负责人审批"/><div class="hint">路由名称，便于识别</div></div>
    <div class="form-row"><label>层级</label><select id="f_level">
      <option value="level1_pending">level1_pending（专业负责人）</option>
      <option value="level2_pending">level2_pending（部门负责人）</option>
      <option value="level3_pending">level3_pending（分管领导）</option>
      <option value="level4_pending">level4_pending（总经理）</option>
      <option value="level5_pending">level5_pending（董事长）</option>
    </select><div class="hint">审批流程中的层级</div></div>
    <div class="form-row"><label>模式</label><select id="f_mode" onchange="toggleRoleF()"><option value="dept">仅部门</option><option value="dept_and_role">部门+角色</option></select><div class="hint">仅部门=部门内所有人都能批；部门+角色=还需匹配指定角色</div></div>
    <div class="form-row"><label>部门</label><select id="f_dept"><option value="">-</option>\${DEPTS.map(d=>'<option value="'+d.id+'">'+d.title+'</option>').join('')}</select><div class="hint">该路由适用的部门</div></div>
    <div class="form-row" id="roleRowA" style="display:none"><label>角色</label><select id="f_role"><option value="">-</option>\${ROLES.map(r=>'<option value="'+r.name+'">'+r.title+'</option>').join('')}</select><div class="hint">选择该部门中谁有此审批权限</div></div>
    <div class="form-row"><label>备注</label><textarea id="f_remark" rows="2" placeholder="此路由的用途说明"></textarea><div class="hint">可选</div></div>
    <div class="form-row"><label>启用</label><select id="f_enabled"><option value="true">启用</option><option value="false">禁用</option></select><div class="hint">禁用后该路由暂不生效</div></div>
  \`;
  toggleRoleF();
  if(id) loadItem(id);
  openModal();
}
function toggleRoleF(){document.getElementById('roleRowA').style.display=document.getElementById('f_mode').value==='dept_and_role'?'':'none'}
async function loadItem(id){
  const d=await api('GET','/api/__da__/approval-routes/'+id);
  const r=d.data; if(!r)return;
  document.getElementById('f_name').value=r.name||'';
  document.getElementById('f_level').value=r.levelKey||'';
  document.getElementById('f_mode').value=r.mode||'dept';
  document.getElementById('f_dept').value=r.departmentId||'';
  if(r.roleId) document.getElementById('f_role').value=r.roleId;
  document.getElementById('f_remark').value=r.remark||'';
  document.getElementById('f_enabled').value=r.enabled===false?'false':'true';
  toggleRoleF();
}
async function saveItem() {
  const v = {
    name: document.getElementById('f_name').value,
    levelKey: document.getElementById('f_level').value,
    mode: document.getElementById('f_mode').value,
    departmentId: parseInt(document.getElementById('f_dept').value)||null,
    enabled: document.getElementById('f_enabled').value==='true'
  };
  v.remark = document.getElementById('f_remark')?.value||undefined;
  const roleV = document.getElementById('f_role')?.value;
  if(v.mode==='dept_and_role' && roleV) v.roleId = roleV;
  if(!v.name||!v.departmentId){msg('请填写名称和部门');return}
  await api(EDIT_ID?'PUT':'POST', EDIT_ID?'/api/__da__/approval-routes/'+EDIT_ID:'/api/__da__/approval-routes', v);
  closeModal(); loadData();
}
async function delItem(id){if(!confirm('确认删除？'))return;await api('DELETE','/api/__da__/approval-routes/'+id);loadData();}
loadData();
loadRefs();`
    );
  }, { tag: 'dashboard-home', before: 'dataSource' });
}
