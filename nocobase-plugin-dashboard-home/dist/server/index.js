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
const dept_admin_api_1 = require("./middleware/dept-admin-api");
const dept_admin_pages_1 = require("./middleware/dept-admin-pages");
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
        // Register virtual computed fields on users collection (Plan B: native ACL)
        const usersCol = db.getCollection('users');
        if (usersCol) {
            if (!usersCol.hasField('departmentIds')) {
                usersCol.addField('departmentIds', {
                    type: 'virtual',
                    async value(user, ctx) {
                        const departments = ctx?.state?.currentUser?.departments;
                        if (departments)
                            return departments.map((d) => d.id);
                        const dus = await ctx.db.getRepository('departmentsUsers').find({
                            filter: { userId: user.id },
                            fields: ['departmentId']
                        });
                        return dus.map((d) => d.departmentId);
                    }
                });
            }
            if (!usersCol.hasField('childDepartmentIds')) {
                usersCol.addField('childDepartmentIds', {
                    type: 'virtual',
                    async value(user, ctx) {
                        const deptIds = await user.get('departmentIds') || [];
                        if (!Array.isArray(deptIds) || !deptIds.length)
                            return [];
                        const allIds = new Set(deptIds);
                        const queue = [...deptIds];
                        while (queue.length) {
                            const pid = queue.shift();
                            const children = await ctx.db.getRepository('departments').find({
                                filter: { parentId: pid },
                                fields: ['id']
                            });
                            for (const c of children) {
                                if (!allIds.has(c.id)) {
                                    allIds.add(c.id);
                                    queue.push(c.id);
                                }
                            }
                        }
                        return Array.from(allIds);
                    }
                });
            }
            if (!usersCol.hasField('accessibleProjectIds')) {
                usersCol.addField('accessibleProjectIds', {
                    type: 'virtual',
                    async value(user, ctx) {
                        const deptIds = await user.get('childDepartmentIds') || [];
                        if (!Array.isArray(deptIds) || !deptIds.length)
                            return [];
                        const projects = await ctx.db.getRepository('projects').find({
                            filter: { departmentId: { $in: deptIds } },
                            fields: ['id']
                        });
                        return projects.map((p) => p.id);
                    }
                });
            }
            // Restrict nickname modification to root users only
            usersCol.model.addHook('beforeUpdate', async (record, options) => {
                if (record.changed('nickname')) {
                    const ctx = options.ctx;
                    const isRoot = ctx?.state?.currentUser?.roles?.some((r) => r.name === 'root');
                    if (!isRoot) {
                        record.set('nickname', record.previous('nickname'));
                        console.log('[nickname-guard] Non-root user attempted to modify nickname, reverted');
                    }
                }
            });
        }
        // Auto-assign departmentId on new project creation
        const projCol = db.getCollection('projects');
        if (projCol) {
            if (!projCol.hasField('departmentId')) {
                projCol.addField('departmentId', { type: 'bigInt', nullable: true });
            }
            projCol.model.addHook('beforeCreate', async (record, options) => {
                if (!record.get('departmentId')) {
                    const userId = record.get('createdById');
                    if (userId) {
                        try {
                            const user = await db.getRepository('users').findOne({
                                filterByTk: userId,
                                fields: ['mainDepartmentId']
                            });
                            if (user?.mainDepartmentId) {
                                record.set('departmentId', user.mainDepartmentId);
                            }
                        }
                        catch (e) {
                            console.log('[proj-dept-hook] Error:', e.message);
                        }
                    }
                }
            });
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
            let content = fs_1.default.readFileSync(DEPT_BUNDLE_PATH, 'utf8');
            content = content.replace('owners:{title:\'{{t("Owners")}}\',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},footer:', 'owners:{title:\'{{t("Owners")}}\',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},manager_in_charge:{title:\'{{t("分管领导")}}\',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:');
            content = content.replace('roles:{"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.roles"},footer:', 'roles:{"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.roles"},manager_in_charge:{title:\'{{t("分管领导")}}\',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:');
            content = content.replace('appends:["parent(recursively=true)","roles","owners"]', 'appends:["parent(recursively=true)","roles","owners","manager_in_charge"]');
            content = content.replace(/departments_manager_users/g, 'departmentsUsers');
            patchedBundle = content;
            return patchedBundle;
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
        // Register department admin API
        (0, dept_admin_api_1.registerDeptAdminApi)(app, pluginRef);
        // Register department admin pages
        (0, dept_admin_pages_1.registerDeptAdminPages)(app);
        // Middleware: intercept construction_daily_log:trigger and create record first
        app.resourceManager.use(async (ctx, next) => {
            const action = ctx.action || {};
            const params = action.params || {};
            if (params.resourceName === 'construction_daily_log' && params.actionName === 'trigger' && !params.filterByTk) {
                const values = params.values || {};
                if (values.project_id || values.project_name_NO) {
                    try {
                        const repo = db.getRepository('construction_daily_log');
                        const created = await repo.create({ values });
                        ctx.action.params.filterByTk = created.id;
                        ctx.action.params.values = { ...values, id: created.id };
                    }
                    catch (e) {
                        console.log('[trigger-mw] create failed:', e.message);
                    }
                }
            }
            await next();
        }, { tag: 'dashboard-home-trigger', after: 'dataSource' });
        // Middleware: enrich auth:check response with departments (for linkage rules)
        app.resourceManager.use(async (ctx, next) => {
            await next();
            const action = ctx.action || {};
            if (action.resourceName === 'auth' && action.actionName === 'check') {
                const body = ctx.body;
                if (body && body.data && body.data.id && !body.data.departments) {
                    try {
                        const user = await db.getRepository('users').findOne({
                            filterByTk: body.data.id,
                            appends: ['departments']
                        });
                        if (user && user.departments) {
                            body.data.departments = user.departments;
                        }
                    }
                    catch (e) {
                        console.log('[auth-check-enrich] Error:', e.message);
                    }
                }
            }
        }, { tag: 'dashboard-home-auth-enrich', after: 'dataSource' });
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
                    const projectId = record.get('project_id');
                    const projectLookup = projectNameNo ? { project_code: projectNameNo } : (projectId ? { id: projectId } : null);
                    if (projectLookup) {
                        try {
                            const proj = await record.sequelize.model('projects').findOne({ where: projectLookup });
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
                // Auto-aggregate entries into the log
                const aggProjectId = record.get('project_id');
                const aggProjectNameNo = record.get('project_name_NO');
                let aggLogDate = record.get('log_date');
                if ((aggProjectId || aggProjectNameNo) && aggLogDate) {
                    try {
                        if (typeof aggLogDate === 'number' || /^\d{8}$/.test(String(aggLogDate))) {
                            const s = String(aggLogDate);
                            aggLogDate = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
                        }
                        const whereClause = { entry_date: aggLogDate };
                        if (aggProjectId)
                            whereClause.project_id = aggProjectId;
                        if (aggProjectNameNo)
                            whereClause.project_name_NO = aggProjectNameNo;
                        const entries = await record.sequelize.model('construction_daily_entries').findAll({
                            where: whereClause
                        });
                        if (entries && entries.length > 0) {
                            const workContent = [], qualityIssues = [];
                            const safetyIssues = [], others = [];
                            const personnelCount = [], equipmentUsage = [], materialUsage = [];
                            for (let i = 0; i < entries.length; i++) {
                                const e = entries[i];
                                const n = (i + 1) + '. ';
                                if (e.get('work_content'))
                                    workContent.push(n + e.get('work_content'));
                                if (e.get('quality_issues'))
                                    qualityIssues.push(n + e.get('quality_issues'));
                                if (e.get('safety_issues'))
                                    safetyIssues.push(n + e.get('safety_issues'));
                                if (e.get('others'))
                                    others.push(n + e.get('others'));
                                if (e.get('personnel_count'))
                                    personnelCount.push(n + e.get('personnel_count'));
                                if (e.get('equipment_usage'))
                                    equipmentUsage.push(n + e.get('equipment_usage'));
                                if (e.get('material_usage'))
                                    materialUsage.push(n + e.get('material_usage'));
                            }
                            record.set('work_content', workContent.join('\n'));
                            record.set('quality_issues', qualityIssues.join('\n'));
                            record.set('safety_issues', safetyIssues.join('\n'));
                            record.set('others', others.join('\n'));
                            record.set('personnel_count', personnelCount.join('\n'));
                            record.set('equipment_usage', equipmentUsage.join('\n'));
                            record.set('material_usage', materialUsage.join('\n'));
                        }
                    }
                    catch (e) {
                        console.log('[agg-hook] error:', e.message);
                    }
                }
            });
        }
        // ACL context endpoint for frontend department linkage (placed before auth-check)
        app.use(async (ctx, next) => {
            if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/acl-context') {
                return await next();
            }
            try {
                const user = ctx.state.currentUser;
                if (!user) {
                    ctx.status = 401;
                    ctx.body = { error: 'Unauthenticated' };
                    return;
                }
                ctx.body = {
                    user: {
                        id: user.id,
                        mainDepartmentId: user.mainDepartmentId,
                        departmentIds: user.departments?.map((d) => d.id) || [],
                        departments: user.departments || [],
                    },
                    attachRoles: ctx.state.attachRoles || [],
                };
            }
            catch (e) {
                console.error('[acl-context] Error:', e.message);
                ctx.status = 500;
                ctx.body = { error: 'Internal server error', message: e.message };
            }
        }, { tag: 'dashboard-home', before: 'dataSource' });
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
d.value=new Date().toISOString().split('T')[0];
try{
  var doc=parent.document;
  var items=doc.querySelectorAll('.ant-form-item');
  for(var i=0;i<items.length;i++){
    var lb=items[i].querySelector('.ant-form-item-label label');
    if(!lb)continue;
    var txt=lb.textContent,inp=items[i].querySelector('input');
    if(!inp)continue;
    if((txt.indexOf('项目')>=0||txt.indexOf('缩写')>=0)&&inp.value)c.value=inp.value;
    if(txt.indexOf('日期')>=0&&inp.value)d.value=inp.value;
  }
  if(c.value){c.style.background='#f0f5ff';c.style.borderColor='#91d5ff'}
  else console.log('[agg] project field not found in parent DOM');
}catch(e){console.log('[agg] parent access denied:',e.message)}
var up=new URLSearchParams(location.search),code=up.get('code'),dt=up.get('date');
if(!c.value)c.placeholder='手动输入项目编号';
if(code){c.value=code;c.style.background='#f0f5ff';c.style.borderColor='#91d5ff'}else if(!c.value)c.placeholder='手动输入项目编号';
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
