"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Dashboard Home Plugin - Main entry point
 * Modularized from monolithic index.js into separate middleware files
 */
const server_1 = require("@nocobase/server");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("./middleware/auth");
const proxy_1 = require("./middleware/proxy");
const pages_1 = require("./middleware/pages");
const attendance_1 = require("./middleware/attendance");
const dashboard_1 = require("./middleware/dashboard");
const weather_1 = require("./middleware/weather");
const people_dynamic_1 = require("./middleware/people-dynamic");
const qw_jwt_1 = require("./utils/qw-jwt");
const STORAGE_DIR = '/app/nocobase/storage/dashboard';
module.exports = class DashboardHomePlugin extends server_1.Plugin {
    async load() {
        const app = this.app;
        const db = this.db;
        // Ensure approval trigger fields exist on attendance_records
        const arCol = db.getCollection('attendance_records');
        if (arCol) {
            if (!arCol.hasField('approval_action'))
                arCol.addField('approval_action', { type: 'string', nullable: true });
            if (!arCol.hasField('approval_remark'))
                arCol.addField('approval_remark', { type: 'text', nullable: true });
            if (!arCol.hasField('approved_by'))
                arCol.addField('approved_by', { type: 'bigInt', nullable: true });
            if (!arCol.hasField('approval_trigger_at'))
                arCol.addField('approval_trigger_at', { type: 'date', nullable: true });
            if (!arCol.hasField('days'))
                arCol.addField('days', { type: 'integer', nullable: true });
            if (!arCol.hasField('is_overtime'))
                arCol.addField('is_overtime', { type: 'boolean', nullable: true, defaultValue: false });
            if (!arCol.hasField('check_result'))
                arCol.addField('check_result', { type: 'string', nullable: true });
            if (!arCol.hasField('anomaly_reason'))
                arCol.addField('anomaly_reason', { type: 'text', nullable: true });
            if (!arCol.hasField('workflow_status'))
                arCol.addField('workflow_status', { type: 'string', nullable: true, defaultValue: 'normal' });
            arCol.sync({ alter: true });
        }
        // Normalize path — strip /api prefix for consistent path matching
        app.use(async (ctx, next) => {
            ctx.state.reqPath = ctx.path.replace(/^\/api/, '');
            await next();
        }, { before: 'dataSource' });
        // Route: Serve patched plugin-departments bundle with manager_in_charge field injected
        let DEPT_BUNDLE_PATH = null;
        try {
            DEPT_BUNDLE_PATH = require.resolve('@nocobase/plugin-departments/dist/client/index.js');
        }
        catch (e) {
            const altPath = path_1.default.join(process.cwd(), 'node_modules/@nocobase/plugin-departments/dist/client/index.js');
            if (fs_1.default.existsSync(altPath))
                DEPT_BUNDLE_PATH = altPath;
        }
        let patchedBundle = null;
        function getPatchedBundle() {
            if (patchedBundle)
                return patchedBundle;
            if (!DEPT_BUNDLE_PATH)
                return null;
            const content = fs_1.default.readFileSync(DEPT_BUNDLE_PATH, 'utf8');
            content.replace('owners:{title:\'{{t("Owners")}}\',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},footer:', 'owners:{title:\'{{t("Owners")}}\',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},manager_in_charge:{title:\'{{t("分管领导")}}\',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:');
            content.replace('roles:{"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.roles"},footer:', 'roles:{"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.roles"},manager_in_charge:{title:\'{{t("分管领导")}}\',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:');
            content.replace('appends:["parent(recursively=true)","roles","owners"]', 'appends:["parent(recursively=true)","roles","owners","manager_in_charge"]');
            content.replace(/departments_manager_users/g, 'departmentsUsers');
            patchedBundle = content;
            return content;
        }
        app.use(async (ctx, next) => {
            if (ctx.method !== 'GET')
                return await next();
            if (ctx.state.reqPath && ctx.state.reqPath === '/__pd__/dept-bundle') {
                const p = getPatchedBundle();
                if (!p) {
                    ctx.status = 404;
                    ctx.body = 'Bundle not found';
                    return;
                }
                ctx.type = 'application/javascript; charset=utf-8';
                ctx.body = p;
                return;
            }
            await next();
        }, { before: 'dataSource' });
        // Resource middleware: Mirror owner pattern for manager_in_charge
        app.resourceManager.use(async (ctx, next) => {
            const action = ctx.action || {};
            const params = action.params || {};
            const values = params.values || {};
            const managerInCharge = values.manager_in_charge;
            if (params.resourceName === 'departments' && (params.actionName === 'update' || params.actionName === 'create') && managerInCharge && Array.isArray(managerInCharge)) {
                const managerIds = managerInCharge.map((m) => {
                    return typeof m === 'object' ? parseInt(m.id, 10) : parseInt(m, 10);
                }).filter((id) => id > 0);
                const newValues = {};
                for (const k in values) {
                    if (k !== 'manager_in_charge')
                        newValues[k] = values[k];
                }
                params.values = newValues;
                ctx.action.params = params;
                await next();
                try {
                    const deptId = params.actionName === 'update' ? params.filterByTk : (ctx.body && ctx.body.data && ctx.body.data.id);
                    if (!deptId)
                        return;
                    const repo = db.getRepository('departmentsUsers');
                    await db.sequelize.transaction(async (t) => {
                        await repo.update({
                            filter: { departmentId: deptId },
                            values: { is_manager_in_charge: false },
                            transaction: t
                        });
                        await repo.update({
                            filter: { departmentId: deptId, userId: { $in: managerIds } },
                            values: { is_manager_in_charge: true },
                            transaction: t
                        });
                        const existing = await repo.find({
                            filter: { departmentId: deptId },
                            transaction: t
                        });
                        const existingIds = existing.map((d) => d.userId);
                        for (let i = 0; i < managerIds.length; i++) {
                            if (existingIds.indexOf(managerIds[i]) < 0) {
                                await repo.create({
                                    values: { departmentId: deptId, userId: managerIds[i], is_manager_in_charge: true },
                                    transaction: t
                                });
                            }
                        }
                    });
                }
                catch (e) {
                    console.log('[manager-resource-mw] Error:', e.message);
                }
            }
            else {
                await next();
            }
        });
        // Register all route modules
        const pluginRef = { db, isAuthenticated: auth_1.isAuthenticated.bind(this) };
        (0, proxy_1.registerProxyRoutes)(app);
        (0, attendance_1.registerAttendanceRoutes)(app, pluginRef);
        (0, dashboard_1.registerDashboardRoutes)(app, pluginRef);
        (0, weather_1.registerWeatherRoutes)(app);
        (0, people_dynamic_1.registerPeopleDynamicRoutes)(app);
        // Auto-fill hooks for construction daily entries and logs
        const entriesCol = db.getCollection('construction_daily_entries');
        const logCol = db.getCollection('construction_daily_log');
        // Add aggregated_up_to field for tracking aggregation state
        if (logCol) {
            try {
                logCol.addField('aggregated_up_to', { type: 'bigint' });
            }
            catch (e) { }
        }
        // Auto-fill entry_date, weather, entry_no on entry creation
        if (entriesCol) {
            entriesCol.model.addHook('beforeCreate', async (record, options) => {
                const logId = record.get('log_id');
                if (logId && !record.get('project_name_NO')) {
                    try {
                        const parentLog = await record.sequelize.model('construction_daily_log').findByPk(logId);
                        if (parentLog) {
                            const projectNameNo = parentLog.get('project_name_NO');
                            if (projectNameNo) {
                                record.set('project_name_NO', projectNameNo);
                            }
                        }
                    }
                    catch (e) {
                        console.log('[entry-hook] copy project_name_NO failed:', e.message);
                    }
                }
            });
            entriesCol.model.addHook('beforeCreate', async (record, options) => {
                if (!record.get('entry_no')) {
                    const now = new Date();
                    const datePart = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                    const fullPrefix = 'SG-' + datePart + '-';
                    try {
                        const repo = record.sequelize.model('sys_serial_counters');
                        const counter = await repo.findOne({ where: { prefix: fullPrefix } });
                        let seq;
                        if (!counter) {
                            await repo.create({ prefix: fullPrefix, current_seq: 1, module: 'construction_daily' });
                            seq = 1;
                        }
                        else {
                            seq = counter.current_seq + 1;
                            await repo.update({ current_seq: seq }, { where: { id: counter.id } });
                        }
                        record.set('entry_no', fullPrefix + String(seq).padStart(3, '0'));
                    }
                    catch (e) {
                        record.set('entry_no', fullPrefix + '001');
                    }
                }
            });
        }
        // Copy project_name_NO from parent log when entry's log_id is updated
        if (entriesCol) {
            entriesCol.model.addHook('beforeUpdate', async (record, options) => {
                const logId = record.get('log_id');
                if (logId && record.changed('log_id') && !record.get('project_name_NO')) {
                    try {
                        const parentLog = await record.sequelize.model('construction_daily_log').findByPk(logId);
                        if (parentLog) {
                            const projectNameNo = parentLog.get('project_name_NO');
                            if (projectNameNo) {
                                record.set('project_name_NO', projectNameNo);
                            }
                        }
                    }
                    catch (e) {
                        console.log('[entry-hook] copy project_name_NO on update failed:', e.message);
                    }
                }
            });
        }
        // Auto-fill log_date, log_no and weather on log creation
        if (logCol) {
            logCol.model.addHook('beforeCreate', async (record, options) => {
                if (!record.get('log_date')) {
                    const now = new Date();
                    const datePart = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                    record.set('log_date', parseInt(datePart));
                }
                if (!record.get('log_no')) {
                    const now = new Date();
                    const datePart = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
                    const fullPrefix = 'LG-' + datePart + '-';
                    try {
                        const repo = record.sequelize.model('sys_serial_counters');
                        const counter = await repo.findOne({ where: { prefix: fullPrefix } });
                        let seq;
                        if (!counter) {
                            await repo.create({ prefix: fullPrefix, current_seq: 1, module: 'construction_daily' });
                            seq = 1;
                        }
                        else {
                            seq = counter.current_seq + 1;
                            await repo.update({ current_seq: seq }, { where: { id: counter.id } });
                        }
                        record.set('log_no', fullPrefix + String(seq).padStart(3, '0'));
                    }
                    catch (e) {
                        record.set('log_no', fullPrefix + '001');
                    }
                }
                // Auto-fill weather from project location
                if (!record.get('weather')) {
                    const projectNameNo = record.get('project_name_NO');
                    if (projectNameNo) {
                        try {
                            const proj = await record.sequelize.model('projects').findByPk(projectNameNo);
                            if (proj && proj.location_lat && proj.location_lon) {
                                const weather = await (0, qw_jwt_1.qwFetch)('https://' + qw_jwt_1.QW_WEATHER_HOST + '/v7/weather/now?location=' + encodeURIComponent(proj.location_lon + ',' + proj.location_lat));
                                if (weather && weather.code === '200' && weather.now) {
                                    const n = weather.now;
                                    const weatherStr = n.text + ' ' + (n.temp || '') + 'C ' + (n.windDir || '');
                                    record.set('weather', weatherStr);
                                }
                            }
                        }
                        catch (e) {
                            console.log('[weather-auto-log] fetch failed:', e.message);
                        }
                    }
                }
            });
        }
        // Auth-check endpoint for nginx auth_request
        app.use(async (ctx, next) => {
            if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__auth_check__') {
                return await next();
            }
            await (0, auth_1.authCheckHandler)(ctx);
        }, { tag: 'dashboard-home', before: 'dataSource' });
        // Standalone aggregation panel page (for Markdown block iframe embedding)
        app.use(async (ctx, next) => {
            if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/aggregate-panel') {
                return await next();
            }
            ctx.withoutDataWrapping = true;
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = `<html><head><meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:transparent;padding:12px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.row label{font-size:13px;color:#8c8c8c;white-space:nowrap}
.row input{flex:1;min-width:100px;padding:6px 10px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px}
.row input:focus{outline:none;border-color:#1890ff;box-shadow:0 0 0 2px rgba(24,144,255,.2)}
.info{font-size:13px;color:#8c8c8c;margin-bottom:10px}
.cnt{color:#52c41a;font-weight:500}
.done{color:#52c41a;display:none}
.btn{width:100%;padding:10px 0;font-size:15px;font-weight:600;color:#fff;background:#1890ff;border:none;border-radius:8px;cursor:pointer}
.btn:hover{background:#096dd9}
.btn:disabled{background:#bfbfbf;cursor:not-allowed}
</style></head><body>
<div class="row"><label>项目编号</label><input id="c" placeholder="读取中..."/></div>
<div class="row"><label>日期</label><input id="d" type="date"/></div>
<div class="info">已填报：<span class="cnt" id="n">0</span> 份 <span class="done" id="ok">&#x2713; 已汇总</span></div>
<button class="btn" id="b">&#x26A1; 汇总日志</button>
<script>
(function(){
var c=document.getElementById('c'),d=document.getElementById('d'),n=document.getElementById('n'),ok=document.getElementById('ok'),b=document.getElementById('b');
var code='',dt='';
try{
  var doc=parent.document;
  var inputs=doc.querySelectorAll('.ant-form-item');
  for(var i=0;i<inputs.length;i++){
    var item=inputs[i];
    var label=item.querySelector('.ant-form-item-label label');
    if(!label)continue;
    var txt=label.textContent;
    var inp=item.querySelector('input');
    if(!inp)continue;
    if(txt.indexOf('项目')>=0||txt.indexOf('缩写')>=0||txt.indexOf('编号')>=0){if(inp.value)code=inp.value}
    if(txt.indexOf('日期')>=0||txt.indexOf('录入')>=0){if(inp.value)dt=inp.value}
  }
}catch(e){console.log('[agg] DOM error',e)}
if(code){c.value=code;c.style.background='#f0f5ff';c.style.borderColor='#91d5ff'}else{c.placeholder='手动输入项目编号'}
if(dt){var m=dt.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);if(m)d.value=m[1]+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[3])).padStart(2,'0')}else d.value=new Date().toISOString().split('T')[0];
if(code){c.value=code;c.style.background='#f0f5ff';c.style.borderColor='#91d5ff'}else{c.placeholder='手动输入项目编号'}
if(dt){var m=dt.match(/(\\d{4})[\\-\\/](\\d{1,2})[\\-\\/](\\d{1,2})/);if(m)d.value=m[1]+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[3])).padStart(2,'0')}
else d.value=new Date().toISOString().split('T')[0];

async function rf(){var code=c.value.trim(),dt=d.value;if(!code||!dt){n.textContent='0';ok.style.display='none';return}try{var r=await fetch('/api/__pd__/daily-summary-status?projectNameNo='+encodeURIComponent(code)+'&date='+dt.replace(/-/g,''),{credentials:'same-origin'});var j=await r.json();if(j.code===0){n.textContent=j.data.entryCount||0;ok.style.display=j.data.aggregated?'inline':'none'}}catch(e){}}
c.addEventListener('change',rf);d.addEventListener('change',rf);
if(code&&d.value)setTimeout(rf,300);

b.addEventListener('click',async function(){var code=c.value.trim(),dt=d.value;if(!code||!dt){alert('请填写项目编号和日期');return}var ymd=parseInt(dt.replace(/-/g,''));b.disabled=true;b.textContent='汇总中...';try{var r=await fetch('/api/__pd__/aggregate-log',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({projectNameNo:code,date:ymd})});var j=await r.json();if(j.code===0&&j.data?.updated)alert('汇总完成，新增 '+j.data.newEntryCount+' 份');else if(j.code===0)alert(j.data?.message||'没有新内容需要汇总');else alert('汇总失败：'+(j.msg||'未知错误'));rf()}catch(e){alert('汇总失败: '+e.message)}finally{b.disabled=false;b.textContent='\u26A1 汇总日志'}});
})();
</script></body></html>`;
        }, { tag: 'dashboard-home', before: 'dataSource' });
        // Register page serving routes (must be last)
        (0, pages_1.registerPageRoutes)(app);
    }
    async isAuthenticated(ctx) {
        return (0, auth_1.isAuthenticated)(ctx);
    }
};
