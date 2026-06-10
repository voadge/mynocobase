"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDashboardRoutes = registerDashboardRoutes;
// Convert YYYYMMDD integer to YYYY-MM-DD string (for dateOnly field matching)
function ymdToDateStr(ymd) {
    const s = String(ymd);
    return s.substring(0, 4) + '-' + s.substring(4, 6) + '-' + s.substring(6, 8);
}
// Render a Date object to YYYY-MM-DD string
function dateToDateStr(dt) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
}
function registerDashboardRoutes(app, plugin) {
    const { db } = plugin;
    // Workers API - server-side query bypasses ACL
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/workers') {
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
            const repo = db.getRepository('users');
            const users = await repo.find({
                filter: { 'roles.name': 'workers' },
                appends: ['roles', 'departments'],
                limit: 200
            });
            ctx.body = { data: users };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { data: [], error: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Batch collect - server-side location history filling (called by cron)
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/batch-collect') {
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
            const today = new Date().toISOString().substring(0, 10);
            const records = await db.getRepository('attendance_records').find({
                filter: { createdAt: { $dateBetween: [today + 'T00:00:00.000Z', today + 'T23:59:59.999Z'] } },
                appends: ['createdBy'],
                sort: '-check_time',
                limit: 2000
            });
            const userStatus = {};
            records.forEach((r) => {
                const uid = r.createdBy ? (r.createdBy.id || r.createdById) : null;
                if (!uid)
                    return;
                if (!userStatus[uid])
                    userStatus[uid] = { checkIn: null, checkOut: null, latestLat: null, latestLng: null, latestTime: null };
                const t = r.check_time || r.createdAt;
                if (r.check_type === '上班') {
                    if (!userStatus[uid].checkIn || t > userStatus[uid].checkIn)
                        userStatus[uid].checkIn = t;
                }
                if (r.check_type === '下班') {
                    if (!userStatus[uid].checkOut || t > userStatus[uid].checkOut)
                        userStatus[uid].checkOut = t;
                }
                if (r.latitude && r.longitude) {
                    if (!userStatus[uid].latestTime || t > userStatus[uid].latestTime) {
                        userStatus[uid].latestLat = r.latitude;
                        userStatus[uid].latestLng = r.longitude;
                        userStatus[uid].latestTime = t;
                    }
                }
            });
            const activeUsers = [];
            Object.keys(userStatus).forEach((uid) => {
                const s = userStatus[uid];
                if (s.checkIn && (!s.checkOut || s.checkOut < s.checkIn) && s.latestLat && s.latestLng) {
                    activeUsers.push({ uid: parseInt(uid), lat: s.latestLat, lng: s.latestLng, time: s.latestTime });
                }
            });
            const LocationHistory = db.getRepository('location_history');
            const written = [];
            for (let i = 0; i < activeUsers.length; i++) {
                const u = activeUsers[i];
                const hist = await LocationHistory.find({
                    filter: { createdById: u.uid },
                    sort: '-recorded_at',
                    limit: 1
                });
                const last = hist.length > 0 ? hist[0] : null;
                const skip = last && last.latitude === String(u.lat) && last.longitude === String(u.lng) &&
                    (Date.now() - new Date(last.recorded_at || last.createdAt).getTime()) < 5 * 60 * 1000;
                if (skip)
                    continue;
                await LocationHistory.create({
                    values: {
                        latitude: u.lat,
                        longitude: u.lng,
                        accuracy: null,
                        recorded_at: u.time || new Date().toISOString(),
                        createdById: u.uid
                    }
                });
                written.push(u.uid);
            }
            ctx.body = { data: { processed: activeUsers.length, written: written.length, userIds: written } };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { data: null, error: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Dashboard snapshot - aggregated data for people dynamic page
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/dashboard-snapshot') {
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
            const today = new Date().toISOString().substring(0, 10);
            const [workers, fences, records, latestLocs] = await Promise.all([
                db.getRepository('users').find({
                    filter: { roles: { name: { $in: ['workers', 'worker'] } } },
                    appends: ['departments', 'roles'],
                    sort: 'nickname'
                }),
                db.getRepository('geofences').find({
                    filter: { is_active: true },
                    sort: 'sort'
                }),
                db.getRepository('attendance_records').find({
                    filter: { createdAt: { $dateBetween: [today, today] } },
                    sort: '-check_time',
                    pageSize: 500,
                    appends: ['createdBy']
                }),
                db.getRepository('location_history').find({
                    filter: { recorded_at: { $dateBetween: [today, today] } },
                    sort: '-recorded_at',
                    pageSize: 500
                })
            ]);
            const onlineMap = {};
            const latestMap = {};
            const checkedInSet = new Set();
            for (const r of records) {
                const uid = r.createdBy && r.createdBy.id || r.createdById;
                if (!uid)
                    continue;
                if (!onlineMap[uid])
                    onlineMap[uid] = { checkIn: null, checkOut: null };
                if (r.check_type === '上班') {
                    if (!onlineMap[uid].checkIn || r.check_time > onlineMap[uid].checkIn) {
                        onlineMap[uid].checkIn = r.check_time;
                        checkedInSet.add(uid);
                    }
                }
                if (r.check_type === '下班') {
                    if (!onlineMap[uid].checkOut || r.check_time > onlineMap[uid].checkOut) {
                        onlineMap[uid].checkOut = r.check_time;
                    }
                }
            }
            const onlineStatus = {};
            for (const uid in onlineMap) {
                const u = onlineMap[uid];
                onlineStatus[uid] = !!(u.checkIn && (!u.checkOut || u.checkOut < u.checkIn));
            }
            for (const r of latestLocs) {
                const uid = r.createdById;
                if (!uid || latestMap[uid])
                    continue;
                latestMap[uid] = {
                    lat: parseFloat(r.latitude), lng: parseFloat(r.longitude),
                    accuracy: r.accuracy, source: r.source, trigger: r.trigger,
                    township: r.township, street: r.street, district: r.district,
                    recorded_at: r.recorded_at || r.createdAt
                };
            }
            const deptStats = {};
            for (const u of workers) {
                const deptName = u.departments && u.departments[0] && u.departments[0].title || '未分组';
                if (!deptStats[deptName])
                    deptStats[deptName] = { total: 0, online: 0, checkedIn: 0 };
                deptStats[deptName].total++;
                if (onlineStatus[u.id])
                    deptStats[deptName].online++;
                if (checkedInSet.has(u.id))
                    deptStats[deptName].checkedIn++;
            }
            ctx.body = {
                workers, fences, records,
                latestLocations: latestMap,
                online: onlineStatus,
                stats: {
                    totalCheckedIn: checkedInSet.size,
                    onlineCount: Object.values(onlineStatus).filter(Boolean).length,
                    deptStats
                },
                serverTime: new Date().toISOString(),
                pollInterval: { snapshot: 10000, fence: 30000 }
            };
        }
        catch (e) {
            ctx.status = 500;
            ctx.body = { error: e.message };
        }
    });
    // Batch create daily logs endpoint (for TIMER-2 workflow)
    app.use(async (ctx, next) => {
        if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/batch-create-logs') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const summaries = ctx.request.body && ctx.request.body.summaries ? ctx.request.body.summaries : [];
            if (!Array.isArray(summaries) || summaries.length === 0) {
                ctx.body = { code: 0, data: { created: 0, logs: [], briefings: [] } };
                return;
            }
            const logs = [];
            const briefings = [];
            const now = new Date();
            const todayNum = parseInt(now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0'));
            for (let i = 0; i < summaries.length; i++) {
                const s = summaries[i];
                const projectId = s.projectId;
                const weather = s.weather || '';
                const entryCount = s.entryCount || 0;
                const workerCount = s.workerCount || 0;
                let summaryDate = s.summaryDate;
                if (summaryDate && typeof summaryDate === 'string' && summaryDate.indexOf('-') > 0) {
                    summaryDate = parseInt(summaryDate.replace(/-/g, ''));
                }
                else if (!summaryDate) {
                    summaryDate = todayNum;
                }
                const bclDateStr = ymdToDateStr(summaryDate);
                const existingLog = await db.getRepository('construction_daily_log').findOne({
                    filter: { project_id: projectId, log_date: bclDateStr }
                });
                let logId = null;
                if (!existingLog) {
                    const logRecord = await db.getRepository('construction_daily_log').create({
                        values: {
                            project_id: projectId,
                            log_date: summaryDate,
                            weather: weather,
                            summary_content: '今日填报' + entryCount + '条，涉及' + workerCount + '人次',
                            status: '待审核',
                            previous_status: ''
                        }
                    });
                    logId = logRecord.id;
                    logs.push({ id: logId, project_id: projectId, created: true });
                }
                else {
                    logId = existingLog.id;
                    logs.push({ id: logId, project_id: projectId, created: false });
                }
                const existingBriefing = await db.getRepository('briefings').findOne({
                    filter: { project_id: projectId, briefing_date: summaryDate, briefing_type: 'construction_daily' }
                });
                if (!existingBriefing) {
                    const briefingRecord = await db.getRepository('briefings').create({
                        values: {
                            project_id: projectId,
                            briefing_type: 'construction_daily',
                            title: '施工日报 - ' + summaryDate,
                            summary: '项目ID:' + projectId + ' 填报' + entryCount + '条 工人' + workerCount + '人 天气:' + weather,
                            briefing_date: summaryDate,
                            source_workflow_id: 366321793040403
                        }
                    });
                    briefings.push({ id: briefingRecord.id, project_id: projectId, created: true });
                }
                else {
                    briefings.push({ id: existingBriefing.id, project_id: projectId, created: false });
                }
                if (logId) {
                    await db.getRepository('construction_daily_entries').update({
                        filter: { project_id: projectId, entry_date: summaryDate },
                        values: { log_id: logId }
                    });
                }
            }
            ctx.body = { code: 0, data: { created: logs.length, logs: logs, briefings: briefings } };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message, stack: e.stack };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Daily summary status endpoint
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/daily-summary-status') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const projectNameNo = ctx.query.projectNameNo;
            const date = parseInt(ctx.query.date);
            if (!projectNameNo || !date) {
                ctx.body = { code: -1, msg: 'Missing projectNameNo or date' };
                return;
            }
            const dateStr = ymdToDateStr(date);
            const entries = await db.getRepository('construction_daily_entries').find({
                filter: { project_name_NO: projectNameNo, entry_date: dateStr },
                sort: ['createdAt']
            });
            const reporterIds = [];
            const seen = {};
            for (let i = 0; i < entries.length; i++) {
                const rid = entries[i].reporter_id;
                if (rid && !seen[rid]) {
                    seen[rid] = true;
                    reporterIds.push(rid);
                }
            }
            const submitters = [];
            for (let j = 0; j < reporterIds.length; j++) {
                const user = await db.getRepository('users').findOne({
                    filter: { id: reporterIds[j] }
                });
                if (user) {
                    submitters.push({
                        id: user.id,
                        displayName: user.displayName || user.nickname || user.name || 'User#' + user.id
                    });
                }
            }
            const log = await db.getRepository('construction_daily_log').findOne({
                filter: { project_name_NO: projectNameNo, log_date: dateStr }
            });
            ctx.body = {
                code: 0,
                data: {
                    entryCount: entries.length,
                    submitters: submitters,
                    aggregated: !!(log && log.getDataValue && log.getDataValue('aggregated_up_to')),
                    logId: log ? log.get('id') : null
                }
            };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message, stack: e.stack };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // Aggregation endpoint — aggregates entry data into the log record
    app.use(async (ctx, next) => {
        if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/aggregate-log') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        try {
            const body = ctx.request.body || {};
            let logId = body.logId ? parseInt(body.logId) : null;
            let projectNameNo = body.projectNameNo ? body.projectNameNo : null;
            let date = body.date ? parseInt(body.date) : null;
            let log = null;
            if (logId) {
                log = await db.getRepository('construction_daily_log').findOne({
                    filter: { id: logId }
                });
            }
            else if (projectNameNo && date) {
                const dateStr = ymdToDateStr(date);
                log = await db.getRepository('construction_daily_log').findOne({
                    filter: { project_name_NO: projectNameNo, log_date: dateStr }
                });
                if (!log) {
                    const entriesForWeather = await db.getRepository('construction_daily_entries').find({
                        filter: { project_name_NO: projectNameNo, entry_date: dateStr },
                        sort: ['createdAt']
                    });
                    let weather = '';
                    for (let w = 0; w < entriesForWeather.length; w++) {
                        const ew = entriesForWeather[w].get('weather');
                        if (ew && typeof ew === 'string' && ew.trim()) {
                            weather = ew.trim();
                            break;
                        }
                    }
                    log = await db.getRepository('construction_daily_log').create({
                        values: {
                            project_name_NO: projectNameNo,
                            log_date: date,
                            weather: weather,
                            status: '待审核',
                            previous_status: ''
                        }
                    });
                }
            }
            else {
                ctx.body = { code: -1, msg: 'Missing logId or (projectNameNo + date)' };
                return;
            }
            if (!log) {
                ctx.body = { code: -1, msg: 'Log not found' };
                return;
            }
            projectNameNo = log.get('project_name_NO');
            const rawDate = log.get('log_date');
            const dateStr = typeof rawDate === 'object' && rawDate && rawDate.getTime
                ? dateToDateStr(rawDate)
                : ymdToDateStr(parseInt(rawDate));
            logId = log.get('id');
            const entries = await db.getRepository('construction_daily_entries').find({
                filter: { project_name_NO: projectNameNo, entry_date: dateStr },
                sort: ['createdAt']
            });
            const aggregatedUpTo = (log.getDataValue && log.getDataValue('aggregated_up_to')) || null;
            const newEntries = aggregatedUpTo
                ? entries.filter((e) => e.get('id') > aggregatedUpTo)
                : entries;
            if (newEntries.length === 0) {
                ctx.body = { code: 0, data: { updated: false, message: '没有新增的日志填报需要汇总' } };
                return;
            }
            const textFields = ['personnel_count', 'equipment_usage', 'material_usage', 'safety_issues', 'quality_issues', 'work_content', 'others'];
            function countNumberedLines(text) {
                if (!text || typeof text !== 'string')
                    return 0;
                let count = 0;
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (/^\d+\.\s/.test(lines[i]))
                        count++;
                }
                return count;
            }
            const updates = {};
            for (let f = 0; f < textFields.length; f++) {
                const fieldName = textFields[f];
                const existingText = log.get(fieldName) || '';
                let startNum = aggregatedUpTo ? countNumberedLines(existingText) : 0;
                const parts = [];
                for (let e = 0; e < newEntries.length; e++) {
                    const entry = newEntries[e];
                    const val = entry.get(fieldName);
                    if (val && typeof val === 'string' && val.trim()) {
                        startNum++;
                        parts.push(startNum + '. ' + val.trim());
                    }
                }
                if (parts.length > 0) {
                    const separator = existingText ? '\n' : '';
                    updates[fieldName] = existingText + separator + parts.join('\n');
                }
            }
            await db.getRepository('construction_daily_log').update({
                filter: { id: logId },
                values: updates
            });
            const maxEntryId = newEntries.reduce((max, e) => Math.max(max, e.get('id')), 0);
            await db.sequelize.query('UPDATE construction_daily_log SET aggregated_up_to = :val WHERE id = :id', { replacements: { val: maxEntryId, id: logId }, type: db.sequelize.QueryTypes.UPDATE });
            ctx.body = {
                code: 0,
                data: {
                    updated: true,
                    newEntryCount: newEntries.length,
                    totalEntryCount: entries.length,
                    fields: Object.keys(updates).filter((k) => k !== 'aggregated_up_to')
                }
            };
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message, stack: e.stack };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
}
