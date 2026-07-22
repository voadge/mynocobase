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
const dashboard_1 = require("./middleware/dashboard");
const weather_1 = require("./middleware/weather");
const people_dynamic_1 = require("./middleware/people-dynamic");
const dept_admin_api_1 = require("./middleware/dept-admin-api");
const dept_admin_pages_1 = require("./middleware/dept-admin-pages");
const department_acl_1 = require("./middleware/department-acl");
const mp_login_1 = require("./middleware/mp-login");
const qw_jwt_1 = require("./utils/qw-jwt");
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
        // Register department_acl_rules collection
        db.collection({
            name: 'department_acl_rules',
            fields: [
                { type: 'bigInt', name: 'id', primaryKey: true, autoIncrement: true },
                { type: 'belongsTo', name: 'department', target: 'departments', foreignKey: 'departmentId' },
                { type: 'integer', name: 'priority', defaultValue: 100 },
                { type: 'string', name: 'mode', defaultValue: 'dept' },
                { type: 'belongsTo', name: 'role', target: 'roles', foreignKey: 'roleId' },
                { type: 'string', name: 'resourceName' },
                { type: 'string', name: 'action' },
                { type: 'boolean', name: 'allow', defaultValue: true },
                { type: 'json', name: 'dataScope', nullable: true },
                { type: 'string', name: 'ruleNo', nullable: true },
                { type: 'text', name: 'remark', nullable: true },
                { type: 'boolean', name: 'enabled', defaultValue: true },
                { type: 'belongsTo', name: 'createdBy', target: 'users' },
            ],
        });
        // Register department_approval_routes collection
        db.collection({
            name: 'department_approval_routes',
            fields: [
                { type: 'bigInt', name: 'id', primaryKey: true, autoIncrement: true },
                { type: 'string', name: 'name' },
                { type: 'string', name: 'levelKey' },
                { type: 'string', name: 'mode', defaultValue: 'dept' },
                { type: 'belongsTo', name: 'department', target: 'departments', foreignKey: 'departmentId' },
                { type: 'belongsTo', name: 'role', target: 'roles', foreignKey: 'roleId' },
                { type: 'text', name: 'remark', nullable: true },
                { type: 'boolean', name: 'enabled', defaultValue: true },
                { type: 'belongsTo', name: 'createdBy', target: 'users' },
            ],
        });
        // Register user_openid collection for WeChat Mini Program mapping
        db.collection({
            name: 'user_openid',
            fields: [
                { type: 'bigInt', name: 'id', primaryKey: true, autoIncrement: true },
                { type: 'string', name: 'openid', unique: true },
                { type: 'belongsTo', name: 'user', target: 'users', foreignKey: 'userId' },
            ],
        });
        await db.sync();
        // Normalize path 鈥?strip /api prefix for consistent path matching
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
        (0, dashboard_1.registerDashboardRoutes)(app, pluginRef);
        (0, weather_1.registerWeatherRoutes)(app);
        (0, people_dynamic_1.registerPeopleDynamicRoutes)(app);
        (0, mp_login_1.registerMpLoginRoutes)(app);
        // Register department ACL middleware (injects into ACL pipeline before core)
        (0, department_acl_1.registerDepartmentAcl)(app, db);
        // Register department admin API
        (0, dept_admin_api_1.registerDeptAdminApi)(app, pluginRef);
        // Register department admin pages
        (0, dept_admin_pages_1.registerDeptAdminPages)(app);
        // Middleware: auto-fill weather for construction_daily_log create/trigger
        app.resourceManager.use(async (ctx, next) => {
            const action = ctx.action || {};
            const params = action.params || {};
            console.log('[weather-mw] ENTRY', { resourceName: ctx.action?.params?.resourceName, actionName: ctx.action?.params?.actionName, filterByTk: ctx.action?.params?.filterByTk });
            if (params.resourceName === 'construction_daily_log' && !params.filterByTk &&
                (params.actionName === 'create' || params.actionName === 'trigger')) {
                const values = params.values || {};
                console.log('[weather-mw] CONDITION MET', { actionName: params.actionName, fk: values['link-projectID'], pid: values.project_id, pno: values.project_name_NO });
                if (!values.weather) {
                    console.log('[weather-mw] filling weather...', values['link-projectID']);
                    try {
                        let proj = null;
                        const fk = values['link-projectID'];
                        if (fk)
                            proj = await db.getRepository('projects').findOne({ filter: { id: fk } });
                        else {
                            const pid = values.project_id;
                            const pno = values.project_name_NO;
                            if (pid)
                                proj = await db.getRepository('projects').findOne({ filter: { id: pid } });
                            else if (pno)
                                proj = await db.getRepository('projects').findOne({ filter: { project_code: pno } });
                        }
                        if (proj && proj.location_lat && proj.location_lon) {
                            const weather = await (0, qw_jwt_1.qwFetch)('https://' + qw_jwt_1.QW_WEATHER_HOST + '/v7/weather/now?location=' + encodeURIComponent(proj.location_lon + ',' + proj.location_lat));
                            if (weather && weather.code === '200' && weather.now) {
                                const weatherStr = weather.now.text + ' ' + (weather.now.temp || '') + 'C ' + (weather.now.windDir || '');
                                params.values.weather = weatherStr;
                                if (ctx.request.body)
                                    ctx.request.body.weather = weatherStr;
                            }
                        }
                    }
                    catch (e) {
                        console.log('[weather-mw] fetch failed:', e.message);
                    }
                }
            }
            await next();
        });
        // Middleware: pre-create for construction_daily_log trigger action
        app.resourceManager.use(async (ctx, next) => {
            const action = ctx.action || {};
            const params = action.params || {};
            if (params.resourceName === 'construction_daily_log' && params.actionName === 'trigger' && !params.filterByTk) {
                const values = params.values || {};
                if (values['link-projectID'] || values.project_id || values.project_name_NO) {
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
        });
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
        // Auto-copy attachments from entries to log after log creation
        if (logCol) {
            logCol.model.addHook('afterCreate', async (record, options) => {
                const logId = record.get('id');
                const projectId = record.get('link-projectID') || record.get('project_id');
                let logDate = record.get('log_date');
                if (!logId || !projectId || !logDate)
                    return;
                try {
                    if (typeof logDate === 'number' || /^\d{8}$/.test(String(logDate))) {
                        const s = String(logDate);
                        logDate = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
                    }
                    const entries = await record.sequelize.model('construction_daily_entries').findAll({
                        where: { projectID: projectId, entry_date: logDate }
                    });
                    if (!entries || entries.length === 0)
                        return;
                    const entryIds = entries.map((e) => e.get('id')).filter(Boolean);
                    if (entryIds.length === 0)
                        return;
                    const sequelize = record.sequelize;
                    const placeholders = entryIds.map((_, i) => ':eid' + i).join(',');
                    const replacements = {};
                    entryIds.forEach((id, i) => { replacements['eid' + i] = id; });
                    const links = await sequelize.query('SELECT DISTINCT attachment_id FROM entry_attachments WHERE entry_id IN (' + placeholders + ')', { replacements, type: sequelize.QueryTypes.SELECT });
                    if (!links || links.length === 0)
                        return;
                    // Delete existing log_attachments for idempotent re-aggregate
                    await sequelize.query('DELETE FROM log_attachments WHERE log_id = :logId', { replacements: { logId }, type: sequelize.QueryTypes.DELETE });
                    let copied = 0;
                    for (const link of links) {
                        const attId = link.attachment_id;
                        if (!attId)
                            continue;
                        try {
                            await sequelize.query("INSERT INTO log_attachments (log_id, attachment_id, project_id, log_date, \"createdAt\", \"updatedAt\") VALUES (:logId, :attId, :pid, :ldt, NOW(), NOW()) ON CONFLICT DO NOTHING", { replacements: { logId, attId, pid: projectId, ldt: logDate }, type: sequelize.QueryTypes.INSERT });
                            copied++;
                        }
                        catch (_e) { }
                    }
                    console.log('[log-attachment-hook] log#' + logId + ' copied ' + copied + ' attachments from ' + entryIds.length + ' entries');
                }
                catch (e) {
                    console.log('[log-attachment-hook] error:', e.message);
                }
            });
        }
        // Auto-fill log_date, log_no and auto-aggregate on log creation
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
                // Auto-aggregate entries into the log
                const aggProjectId = record.get('link-projectID') || record.get('project_id');
                let aggLogDate = record.get('log_date');
                if (aggProjectId && aggLogDate) {
                    try {
                        if (typeof aggLogDate === 'number' || /^\d{8}$/.test(String(aggLogDate))) {
                            const s = String(aggLogDate);
                            aggLogDate = s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
                        }
                        const whereClause = { entry_date: aggLogDate };
                        if (aggProjectId)
                            whereClause.projectID = aggProjectId;
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
            await next();
        }, { before: 'dataSource' });
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
<div class="row"><label>椤圭洰缂栧彿</label><input id="c" placeholder="璇诲彇涓?.."/></div>
<div class="row"><label>鏃ユ湡</label><input id="d" type="date"/></div>
<div class="info">宸插～鎶ワ細<span class="cnt" id="n">0</span> 浠?<span class="done" id="ok">&#x2713; 宸叉眹鎬?/span></div>
<button class="btn" id="b">&#x26A1; 姹囨€绘棩蹇?/button>
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
    if((txt.indexOf('椤圭洰')>=0||txt.indexOf('缂╁啓')>=0)&&inp.value)c.value=inp.value;
    if(txt.indexOf('鏃ユ湡')>=0&&inp.value)d.value=inp.value;
  }
  if(c.value){c.style.background='#f0f5ff';c.style.borderColor='#91d5ff'}
  else console.log('[agg] project field not found in parent DOM');
}catch(e){console.log('[agg] parent access denied:',e.message)}
var up=new URLSearchParams(location.search),code=up.get('code'),dt=up.get('date');
if(!c.value)c.placeholder='鎵嬪姩杈撳叆椤圭洰缂栧彿';
if(code){c.value=code;c.style.background='#f0f5ff';c.style.borderColor='#91d5ff'}else if(!c.value)c.placeholder='鎵嬪姩杈撳叆椤圭洰缂栧彿';
if(dt){var m=dt.match(/(\\d{4})[\\-\\/](\\d{1,2})[\\-\\/](\\d{1,2})/);if(m)d.value=m[1]+'-'+String(Number(m[2])).padStart(2,'0')+'-'+String(Number(m[3])).padStart(2,'0')}
else d.value=new Date().toISOString().split('T')[0];

async function rf(){var code=c.value.trim(),dt=d.value;if(!code||!dt){n.textContent='0';ok.style.display='none';return}try{var r=await fetch('/api/__pd__/daily-summary-status?projectNameNo='+encodeURIComponent(code)+'&date='+dt.replace(/-/g,''),{credentials:'same-origin'});var j=await r.json();if(j.code===0){n.textContent=j.data.entryCount||0;ok.style.display=j.data.aggregated?'inline':'none'}}catch(e){}}
c.addEventListener('change',rf);d.addEventListener('change',rf);
if(code&&d.value)setTimeout(rf,300);

b.addEventListener('click',async function(){var code=c.value.trim(),dt=d.value;if(!code||!dt){alert('璇峰～鍐欓」鐩紪鍙峰拰鏃ユ湡');return}var ymd=parseInt(dt.replace(/-/g,''));b.disabled=true;b.textContent='姹囨€讳腑...';try{var r=await fetch('/api/__pd__/aggregate-log',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({projectNameNo:code,date:ymd})});var j=await r.json();if(j.code===0&&j.data?.updated)alert('姹囨€诲畬鎴愶紝鏂板 '+j.data.newEntryCount+' 浠?);else if(j.code===0)alert(j.data?.message||'娌℃湁鏂板唴瀹归渶瑕佹眹鎬?);else alert('姹囨€诲け璐ワ細'+(j.msg||'鏈煡閿欒'));rf()}catch(e){alert('姹囨€诲け璐? '+e.message)}finally{b.disabled=false;b.textContent='\u26A1 姹囨€绘棩蹇?}});
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
