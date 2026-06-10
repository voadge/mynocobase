"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAttendanceRoutes = registerAttendanceRoutes;
function registerAttendanceRoutes(app, plugin) {
    const { db } = plugin;
    // Unified attendance submission endpoint
    app.use(async (ctx, next) => {
        const p = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
        if (ctx.method !== 'POST' || p !== '/__pd__/attendance/submit')
            return await next();
        if (!await plugin.isAuthenticated(ctx)) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            const user = ctx.state.currentUser;
            const isLeave = (body.check_type === '请假' || body.check_type === '出差');
            const vals = {
                check_type: body.check_type,
                check_time: body.check_time,
                latitude: body.latitude,
                longitude: body.longitude,
                gps_accuracy: body.gps_accuracy,
                verify_status: body.verify_status,
                anomaly_reason: body.anomaly_reason,
                photo_hash: body.photo_hash,
                device_fingerprint: body.device_fingerprint,
                reason: body.reason,
                start_date: body.start_date,
                end_date: body.end_date,
                workflow_status: isLeave ? 'level1_pending' : 'normal',
                createdById: user && user.id || 19
            };
            const record = await db.getRepository('attendance_records').create({ values: vals });
            ctx.body = { status: 'ok', data: record, message: isLeave ? '已提交审批' : '打卡成功' };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { status: 'error', message: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Leave/Travel approval pending list
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/approvals/pending') {
            return await next();
        }
        if (!await plugin.isAuthenticated(ctx)) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const user = ctx.state.currentUser;
            const userId = user.id;
            const roles = user.roles ? user.roles.map((r) => r.name) : [];
            const isAdmin = roles.indexOf('admin') !== -1 || roles.indexOf('root') !== -1;
            if (isAdmin) {
                const allRecs = await db.getRepository('attendance_records').find({
                    filter: {
                        workflow_status: { $in: ['level1_pending', 'level2_pending', 'level3a_pending', 'level3b_pending', 'level4_pending'] },
                        check_type: { $in: ['请假', '出差'] }
                    },
                    appends: ['createdBy', 'createdBy.departments'],
                    sort: '-check_time',
                    limit: 50
                });
                ctx.body = { data: allRecs, roles: roles };
                return;
            }
            const orConditions = [];
            // a) Department owner → level1_pending
            const ownerDepts = await db.getRepository('departments').find({
                filter: { 'owners.id': userId },
                limit: 50
            });
            if (ownerDepts && ownerDepts.length > 0) {
                const oids = ownerDepts.map((d) => d.id);
                orConditions.push({
                    $and: [
                        { workflow_status: 'level1_pending' },
                        { 'createdBy.departments.id': { $in: oids } }
                    ]
                });
            }
            // b) manager_in_charge → level2_pending, level3a_pending
            const picDepts = await db.getRepository('departments').find({
                filter: { 'manager_in_charge.id': userId },
                limit: 50
            });
            if (picDepts && picDepts.length > 0) {
                const pids = picDepts.map((d) => d.id);
                orConditions.push({
                    $and: [
                        { workflow_status: { $in: ['level2_pending', 'level3a_pending'] } },
                        { 'createdBy.departments.id': { $in: pids } }
                    ]
                });
            }
            // c) hr_admin role → level3b_pending
            if (roles.indexOf('hr_admin') !== -1) {
                orConditions.push({ workflow_status: 'level3b_pending' });
            }
            // d) GeneralManager role → level4_pending
            if (roles.indexOf('GeneralManager') !== -1) {
                orConditions.push({ workflow_status: 'level4_pending' });
            }
            if (orConditions.length === 0) {
                ctx.body = { data: [], roles: roles, reason: 'no_authority' };
                return;
            }
            const recs = await db.getRepository('attendance_records').find({
                filter: { $or: orConditions, check_type: { $in: ['请假', '出差'] } },
                appends: ['createdBy', 'createdBy.departments'],
                sort: '-check_time',
                limit: 50
            });
            ctx.body = { data: recs, roles: roles };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { data: [], error: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Approval process endpoint
    app.use(async (ctx, next) => {
        if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/approvals/process') {
            return await next();
        }
        if (!await plugin.isAuthenticated(ctx)) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            const recordId = body.recordId;
            const action = body.action;
            const remark = body.remark || '';
            if (!recordId || !action) {
                ctx.body = { status: 'error', message: '缺少参数 recordId 或 action' };
                return;
            }
            const repo = db.getRepository('attendance_records');
            const record = await repo.findOne({ filter: { id: recordId }, appends: ['createdBy'] });
            if (!record) {
                ctx.body = { status: 'error', message: '记录不存在' };
                return;
            }
            const user = ctx.state.currentUser;
            const userId = user.id;
            const roles = user.roles ? user.roles.map((r) => r.name) : [];
            const isAdmin = roles.indexOf('admin') !== -1 || roles.indexOf('root') !== -1;
            const curStatus = record.workflow_status;
            const creatorId = record.createdById || (record.createdBy && record.createdBy.id);
            async function isDeptOwner(uid, cid) {
                if (isAdmin)
                    return true;
                const depts = await db.getRepository('departments').find({
                    filter: { 'members.id': cid },
                    limit: 20
                });
                for (let i = 0; i < depts.length; i++) {
                    const d = await db.getRepository('departments').findOne({
                        filter: { id: depts[i].id, 'owners.id': uid },
                        limit: 1
                    });
                    if (d)
                        return true;
                }
                return false;
            }
            async function isDeptPic(uid, cid) {
                if (isAdmin)
                    return true;
                const depts = await db.getRepository('departments').find({
                    filter: { 'members.id': cid },
                    limit: 20
                });
                for (let i = 0; i < depts.length; i++) {
                    const d = await db.getRepository('departments').findOne({
                        filter: { id: depts[i].id, 'manager_in_charge.id': uid },
                        limit: 1
                    });
                    if (d)
                        return true;
                }
                return false;
            }
            let allowed = false;
            if (curStatus === 'level1_pending')
                allowed = await isDeptOwner(userId, creatorId);
            else if (curStatus === 'level2_pending')
                allowed = await isDeptPic(userId, creatorId);
            else if (curStatus === 'level3a_pending')
                allowed = await isDeptPic(userId, creatorId);
            else if (curStatus === 'level3b_pending')
                allowed = isAdmin || roles.indexOf('hr_admin') !== -1;
            else if (curStatus === 'level4_pending')
                allowed = isAdmin || roles.indexOf('GeneralManager') !== -1;
            else if (isAdmin)
                allowed = true;
            if (!allowed) {
                ctx.body = { status: 'error', message: '您没有权限处理此审批' };
                return;
            }
            if (action === 'reject') {
                await repo.update({ filter: { id: recordId }, values: { workflow_status: 'rejected', verify_status: 'rejected:' + remark } });
                ctx.body = { status: 'ok', message: '已驳回' };
                return;
            }
            let nextStatus = 'approved';
            if (curStatus === 'level1_pending')
                nextStatus = 'approved';
            else if (curStatus === 'level2_pending')
                nextStatus = 'approved';
            else if (curStatus === 'level3a_pending')
                nextStatus = 'level3b_pending';
            else if (curStatus === 'level3b_pending')
                nextStatus = 'approved';
            else if (curStatus === 'level4_pending')
                nextStatus = 'approved';
            await repo.update({ filter: { id: recordId }, values: { workflow_status: nextStatus, verify_status: 'approved_by_' + curStatus } });
            // 请假/出差审批最终通过 → 更新归档统计
            if (nextStatus === 'approved' && (record.check_type === '请假' || record.check_type === '出差')) {
                try {
                    const archRepo = db.getRepository('att_archives');
                    const dd = new Date();
                    const period = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');
                    const arch = await archRepo.findOne({ filter: { period: period, createdBy: creatorId } });
                    const leaveDays = record.days || 1;
                    if (!arch) {
                        await archRepo.create({
                            values: { period: period, archive_year: String(dd.getFullYear()), total_work_days: 0, total_leave_days: leaveDays, createdBy: creatorId, geofence_inside_days: 0, geofence_outside_days: 0, geofence_anomaly_count: 0 }
                        });
                    }
                    else {
                        await archRepo.update({ filter: { id: arch.id }, values: { total_leave_days: (arch.total_leave_days || 0) + leaveDays } });
                    }
                }
                catch (e) { /* archive update non-fatal */ }
            }
            ctx.body = { status: 'ok', message: '已审批', nextStatus: nextStatus };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { status: 'error', message: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Attendance CSV export
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/attendance/export') {
            return await next();
        }
        if (!await plugin.isAuthenticated(ctx)) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'text/csv; charset=utf-8';
        ctx.set('Content-Disposition', 'attachment; filename="attendance_export.csv"');
        try {
            const period = ctx.query.period || '';
            const userId = ctx.query.userId ? parseInt(ctx.query.userId) : 0;
            const filter = {};
            if (period)
                filter.period = period;
            if (userId)
                filter.createdBy = userId;
            const records = await db.getRepository('attendance_records').find({
                filter: filter,
                appends: ['createdBy'],
                sort: '-check_time',
                limit: 5000
            });
            let csv = '\uFEFF';
            csv += 'ID,姓名,部门,打卡类型,打卡时间,经度,纬度,精度(米),打卡结果,异常原因,围栏内,围栏距离(米),审批状态\n';
            for (let i = 0; i < records.length; i++) {
                const r = records[i];
                let uname = '', dept = '';
                if (r.createdBy) {
                    uname = r.createdBy.nickname || r.createdBy.username || '';
                    dept = (r.createdBy.departments && r.createdBy.departments[0] && r.createdBy.departments[0].title) || '';
                }
                const row = [
                    r.id, uname, dept, r.check_type, r.check_time,
                    r.longitude || '', r.latitude || '', r.gps_accuracy || '',
                    r.check_result || '', (r.anomaly_reason || '').replace(/"/g, '""'),
                    r.geofence_inside != null ? (r.geofence_inside ? '是' : '否') : '',
                    r.geofence_distance || '', r.workflow_status || ''
                ].map((v) => '"' + String(v) + '"').join(',');
                csv += row + '\n';
            }
            ctx.body = csv;
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = '导出失败: ' + e.message;
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Archive monthly summary export (CSV)
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/archive/export') {
            return await next();
        }
        if (!await plugin.isAuthenticated(ctx)) {
            ctx.status = 401;
            ctx.body = 'Unauthorized';
            return;
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'text/csv; charset=utf-8';
        ctx.set('Content-Disposition', 'attachment; filename="archive_monthly.csv"');
        try {
            const period = ctx.query.period || '';
            const userId = ctx.query.userId ? parseInt(ctx.query.userId) : 0;
            const filter = {};
            if (period)
                filter.period = period;
            if (userId)
                filter.createdBy = userId;
            const archives = await db.getRepository('att_archives').find({
                filter: filter,
                appends: ['createdBy'],
                sort: '-period',
                limit: 500
            });
            let csv = '\uFEFF';
            csv += '姓名,月份,工作日,请假天数,围栏内天数,围栏外天数,异常次数\n';
            for (let i = 0; i < archives.length; i++) {
                const a = archives[i];
                const uname = a.createdBy ? (a.createdBy.nickname || a.createdBy.username || '') : '';
                const row = [uname, a.period, a.total_work_days || 0, a.total_leave_days || 0,
                    a.geofence_inside_days || 0, a.geofence_outside_days || 0, a.geofence_anomaly_count || 0
                ].map((v) => '"' + String(v) + '"').join(',');
                csv += row + '\n';
            }
            ctx.body = csv;
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = '导出失败: ' + e.message;
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
}
