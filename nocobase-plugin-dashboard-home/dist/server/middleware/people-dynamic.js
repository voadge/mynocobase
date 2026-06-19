"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPeopleDynamicRoutes = registerPeopleDynamicRoutes;
function registerPeopleDynamicRoutes(app) {
    // Pinyin initials endpoint (for serial number generation)
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/pinyin-initials') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const text = ctx.query.text;
            if (!text) {
                ctx.body = { code: -1, msg: '缺少参数text' };
                return;
            }
            const p = require('/app/nocobase/storage/node_modules/pinyin-pro');
            const initials = p.pinyin(text, { pattern: 'first', toneType: 'none' }).replace(/ /g, '').toUpperCase();
            ctx.body = { code: 0, data: { text: text, initials: initials } };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', after: 'dataWrapping', before: 'dataSource' });
    // Next serial number endpoint (atomic increment via PostgreSQL UPSERT)
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/next-serial') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const prefix = ctx.query.prefix || 'SG';
            const dateStr = ctx.query.date;
            const projectId = ctx.query.project_id;
            if (!dateStr || !projectId) {
                ctx.body = { code: -1, msg: '缺少参数date或project_id' };
                return;
            }
            const result = await ctx.db.sequelize.query("INSERT INTO sys_serial_counters (id, prefix, date_str, project_id, current_seq, module, \"createdAt\", \"updatedAt\") VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM sys_serial_counters), :prefix, :dateStr, :projectId, 1, 'construction_daily', NOW(), NOW()) ON CONFLICT (prefix, date_str, project_id) DO UPDATE SET current_seq = sys_serial_counters.current_seq + 1, \"updatedAt\" = NOW() RETURNING current_seq", {
                replacements: { prefix: prefix, dateStr: dateStr, projectId: parseInt(projectId) },
                type: 'SELECT'
            });
            const seq = result[0].current_seq;
            ctx.body = { code: 0, data: { prefix: prefix, date: dateStr, project_id: projectId, seq: seq } };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', after: 'dataWrapping', before: 'dataSource' });
}
