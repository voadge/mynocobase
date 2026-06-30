/**
 * Dashboard snapshot, workers, batch-collect, and daily log aggregation middleware
 */
import type { Context } from '@nocobase/server';

type Db = any;
type PluginInstance = { db: Db; isAuthenticated: (ctx: Context) => Promise<boolean> };

// Convert YYYYMMDD integer to YYYY-MM-DD string (for dateOnly field matching)
function ymdToDateStr(ymd: number): string {
  const s = String(ymd);
  return s.substring(0, 4) + '-' + s.substring(4, 6) + '-' + s.substring(6, 8);
}

// Render a Date object to YYYY-MM-DD string
function dateToDateStr(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// Normalize various date formats to YYYY-MM-DD string
function normalizeDateStr(raw: any): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    return dateToDateStr(raw);
  }
  if (typeof raw === 'number') {
    const s = String(raw);
    if (s.length === 13) return dateToDateStr(new Date(raw)); // timestamp ms
    if (s.length === 10) return dateToDateStr(new Date(raw * 1000)); // timestamp s
    return ymdToDateStr(raw); // YYYYMMDD
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // YYYY-MM-DD
  if (/^\d{8}$/.test(s)) return ymdToDateStr(parseInt(s)); // YYYYMMDD
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? '' : dateToDateStr(dt);
}

export function registerDashboardRoutes(app: any, plugin: PluginInstance): void {
  const { db } = plugin;

  // Workers API - server-side query bypasses ACL
  app.use(async (ctx: Context, next: () => Promise<void>) => {
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
    } catch (e) {
      ctx.status = 500;
      ctx.body = { data: [], error: e.message };
    }
  }, { before: 'dataSource' });

  // Batch collect - server-side location history filling (called by cron)
  app.use(async (ctx: Context, next: () => Promise<void>) => {
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
      const userStatus: Record<number, any> = {};
      records.forEach((r: any) => {
        const uid = r.createdBy ? (r.createdBy.id || r.createdById) : null;
        if (!uid) return;
        if (!userStatus[uid]) userStatus[uid] = { checkIn: null, checkOut: null, latestLat: null, latestLng: null, latestTime: null };
        const t = r.check_time || r.createdAt;
        if (r.check_type === '上班') {
          if (!userStatus[uid].checkIn || t > userStatus[uid].checkIn) userStatus[uid].checkIn = t;
        }
        if (r.check_type === '下班') {
          if (!userStatus[uid].checkOut || t > userStatus[uid].checkOut) userStatus[uid].checkOut = t;
        }
        if (r.latitude && r.longitude) {
          if (!userStatus[uid].latestTime || t > userStatus[uid].latestTime) {
            userStatus[uid].latestLat = r.latitude;
            userStatus[uid].latestLng = r.longitude;
            userStatus[uid].latestTime = t;
          }
        }
      });
      const activeUsers: any[] = [];
      Object.keys(userStatus).forEach((uid) => {
        const s = userStatus[uid];
        if (s.checkIn && (!s.checkOut || s.checkOut < s.checkIn) && s.latestLat && s.latestLng) {
          activeUsers.push({ uid: parseInt(uid), lat: s.latestLat, lng: s.latestLng, time: s.latestTime });
        }
      });
      const LocationHistory = db.getRepository('location_history');
      const written: number[] = [];
      for (let i = 0; i < activeUsers.length; i++) {
        const u = activeUsers[i];
        const hist = await LocationHistory.find({
          filter: { createdById: u.uid },
          sort: '-createdAt',
          limit: 1
        });
        const last = hist.length > 0 ? hist[0] : null;
        const skip = last && last.latitude === String(u.lat) && last.longitude === String(u.lng) &&
          (Date.now() - new Date(last.createdAt).getTime()) < 5 * 60 * 1000;
        if (skip) continue;
        await LocationHistory.create({
          values: {
            latitude: u.lat,
            longitude: u.lng,
            accuracy: null,
            recorded_at: (u.time || new Date().toISOString()).slice(0, 10),
            createdById: u.uid
          }
        });
        written.push(u.uid);
      }
      ctx.body = { data: { processed: activeUsers.length, written: written.length, userIds: written } };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { data: null, error: e.message };
    }
  }, { before: 'dataSource' });

  // Dashboard snapshot - aggregated data for people dynamic page
  app.use(async (ctx: Context, next: () => Promise<void>) => {
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
      const onlineMap: Record<number, any> = {};
      const latestMap: Record<number, any> = {};
      const checkedInSet = new Set<number>();
      for (const r of records) {
        const uid = r.createdBy && r.createdBy.id || r.createdById;
        if (!uid) continue;
        if (!onlineMap[uid]) onlineMap[uid] = { checkIn: null, checkOut: null };
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
      const onlineStatus: Record<number, boolean> = {};
      for (const uid in onlineMap) {
        const u = onlineMap[uid];
        onlineStatus[uid] = !!(u.checkIn && (!u.checkOut || u.checkOut < u.checkIn));
      }
      for (const r of latestLocs) {
        const uid = r.createdById;
        if (!uid || latestMap[uid]) continue;
        latestMap[uid] = {
          lat: parseFloat(r.latitude), lng: parseFloat(r.longitude),
          accuracy: r.accuracy, source: r.source, trigger: r.trigger,
          township: r.township, street: r.street, district: r.district,
          recorded_at: r.recorded_at || r.createdAt
        };
      }
      const deptStats: Record<string, any> = {};
      for (const u of workers) {
        const deptName = u.departments && u.departments[0] && u.departments[0].title || '未分组';
        if (!deptStats[deptName]) deptStats[deptName] = { total: 0, online: 0, checkedIn: 0 };
        deptStats[deptName].total++;
        if (onlineStatus[u.id]) deptStats[deptName].online++;
        if (checkedInSet.has(u.id)) deptStats[deptName].checkedIn++;
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
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  });

  // Batch create daily logs endpoint (for TIMER-2 workflow)
  app.use(async (ctx: Context, next: () => Promise<void>) => {
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
      const logs: any[] = [];
      const briefings: any[] = [];
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
        } else if (!summaryDate) {
          summaryDate = todayNum;
        }
        const bclDateStr = ymdToDateStr(summaryDate);

        const existingLog = await db.getRepository('construction_daily_log').findOne({
          filter: { 'link-projectID': projectId, log_date: bclDateStr }
        });
        let logId = null;
        if (!existingLog) {
          const logRecord = await db.getRepository('construction_daily_log').create({
            values: {
              'link-projectID': projectId,
              log_date: summaryDate,
              weather: weather,
              summary_content: '\u4eca\u65e5\u586b\u62a5' + entryCount + '\u6761\uff0c\u6d89\u53ca' + workerCount + '\u4eba\u6b21',
              status: '\u5f85\u5ba1\u6838',
              previous_status: ''
            }
          });
          logId = logRecord.id;
          logs.push({ id: logId, project_id: projectId, created: true });
        } else {
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
              title: '\u65bd\u5de5\u65e5\u62a5 - ' + summaryDate,
              summary: '\u9879\u76eeID:' + projectId + ' \u586b\u62a5' + entryCount + '\u6761 \u5de5\u4eba' + workerCount + '\u4eba \u5929\u6c14:' + weather,
              briefing_date: summaryDate,
              source_workflow_id: 366321793040403
            }
          });
          briefings.push({ id: briefingRecord.id, project_id: projectId, created: true });
        } else {
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
    } catch (e) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { before: 'dataSource' });

  // Daily summary status endpoint
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/daily-summary-status') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      let projectID = parseInt(ctx.query.projectID);
      let date = parseInt(ctx.query.date);
      const projectNameNo = ctx.query.projectNameNo;
      if (!projectID && projectNameNo && date) {
        const proj = await db.getRepository('projects').findOne({ filter: { project_code: projectNameNo } });
        if (proj) projectID = proj.id;
      }
      if (!projectID || !date) {
        ctx.body = { code: -1, msg: 'Missing projectID or date' };
        return;
      }
      const dateStr = ymdToDateStr(date);
      const entries = await db.getRepository('construction_daily_entries').find({
        filter: { projectID: projectID, entry_date: dateStr },
        sort: ['createdAt']
      });
      const reporterIds: number[] = [];
      const seen: Record<number, boolean> = {};
      for (let i = 0; i < entries.length; i++) {
        const rid = entries[i].reporter_id;
        if (rid && !seen[rid]) { seen[rid] = true; reporterIds.push(rid); }
      }
      const submitters: any[] = [];
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
        filter: { 'link-projectID': projectID, log_date: dateStr }
      });
      ctx.body = {
        code: 0,
        data: {
          entryCount: entries.length,
          submitters: submitters,
          aggregated: !!(log?.exclude?.aggregated?.entryNo),
          logId: log ? log.get('id') : null
        }
      };
    } catch (e) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { before: 'dataSource' });

  // Aggregation GET endpoint — for iframe form submission (runs before dataSource to avoid 404)
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/aggregate-log') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const q = ctx.query;
      let projectID = q.projectID ? parseInt(q.projectID as string) : (q['link-projectID'] ? parseInt(q['link-projectID'] as string) : null);
      if (!projectID && q.projectNameNo) {
        let proj = await db.getRepository('projects').findOne({ filter: { project_code: q.projectNameNo } });
        if (!proj) proj = await db.getRepository('projects').findOne({ filter: { project_name: q.projectNameNo } });
        if (proj) projectID = proj.id;
      }
      const rawDate = q.date || q.log_date;
      let date: number | null = null;
      if (rawDate) {
        const s = String(rawDate);
        if (s.includes('-')) date = parseInt(s.replace(/-/g, ''));
        else date = parseInt(s);
      }
      if (!projectID || !date) {
        ctx.body = { code: -1, msg: 'Missing projectID or date' };
        return;
      }
      const dateStr = ymdToDateStr(date);

      // Dedup: find the MAX aggregated_up_to across ALL logs for this project+date
      const allLogs = await db.getRepository('construction_daily_log').find({
        filter: { 'link-projectID': projectID, log_date: dateStr }
      });
      let globalMaxUpTo: number | null = null;
      for (const lg of allLogs) {
        const excludeRaw = lg.get('exclude');
        const excludeObj = typeof excludeRaw === 'string' ? JSON.parse(excludeRaw) : excludeRaw;
        const upToFromExclude = excludeObj?.aggregated?.entryNo || null;
        const upToFromField = lg.get('aggregated_up_to') || null;
        const upTo = upToFromExclude || upToFromField;
        if (upTo && (!globalMaxUpTo || upTo > globalMaxUpTo)) {
          globalMaxUpTo = upTo;
        }
      }

      const allEntries = await db.getRepository('construction_daily_entries').find({
        filter: { projectID: projectID, entry_date: dateStr },
        sort: ['createdAt']
      });

      // Dedup: only aggregate entries newer than global max
      const entries = globalMaxUpTo
        ? allEntries.filter((e: any) => e.get('id') > globalMaxUpTo)
        : allEntries;

      if (!entries || entries.length === 0) {
        ctx.body = { code: 0, data: { work_content: '', quality_issues: '', safety_issues: '', others: '', personnel_count: '', equipment_usage: '', material_usage: '', weather: '', attachments: [] }, entryCount: 0, skipped: allEntries.length > 0, message: allEntries.length > 0 ? '已汇总过，无新增填报' : '暂无填报数据' };
        return;
      }
      const textFields = ['work_content', 'quality_issues', 'safety_issues', 'others', 'personnel_count', 'equipment_usage', 'material_usage'];
      const result: Record<string, any> = {};
      for (const f of textFields) {
        const parts: string[] = [];
        let n = 0;
        for (const e of entries) {
          const v = e.get(f);
          if (v && typeof v === 'string' && v.trim()) {
            parts.push((++n) + '. ' + v.trim());
          }
        }
        result[f] = parts.join('\n');
      }
      let weather = '';
      for (const e of entries) {
        const w = e.get('weather');
        if (w && typeof w === 'string' && w.trim()) { weather = w.trim(); break; }
      }
      result.weather = weather;

      // Query attachments: merge entry_attachments (new) + log_attachments (already aggregated)
      const entryIds = entries.map((e: any) => e.get('id'));
      let attIdSet = new Set<number>();
      // 1. entry_attachments from new entries
      if (entryIds.length > 0) {
        const placeholders = entryIds.map((_: any, i: number) => ':id' + i).join(',');
        const replacements: Record<string, any> = {};
        entryIds.forEach((id: any, i: number) => { replacements['id' + i] = id; });
        const links = await db.sequelize.query(
          'SELECT attachment_id FROM entry_attachments WHERE entry_id IN (' + placeholders + ')',
          { replacements, type: db.sequelize.QueryTypes.SELECT }
        );
        for (const l of links) { if (l.attachment_id) attIdSet.add(l.attachment_id); }
      }
      // 2. log_attachments by project_id + log_date (already aggregated)
      const logAttLinks = await db.sequelize.query(
        'SELECT attachment_id FROM log_attachments WHERE project_id = :pid AND log_date = :dt',
        { replacements: { pid: projectID, dt: dateStr }, type: db.sequelize.QueryTypes.SELECT }
      );
      for (const l of logAttLinks) { if (l.attachment_id) attIdSet.add(l.attachment_id); }
      // 3. Query attachment details
      let attachments: any[] = [];
      if (attIdSet.size > 0) {
        const attIds = Array.from(attIdSet);
        const attPlaceholders = attIds.map((_: any, i: number) => ':att' + i).join(',');
        const attReplacements: Record<string, any> = {};
        attIds.forEach((id: any, i: number) => { attReplacements['att' + i] = id; });
        attachments = await db.sequelize.query(
          'SELECT id, title, path, filename, size, mimetype FROM attachments WHERE id IN (' + attPlaceholders + ')',
          { replacements: attReplacements, type: db.sequelize.QueryTypes.SELECT }
        );
      }
      result.attachments = attachments;

      ctx.body = { code: 0, data: result, entryCount: entries.length, totalEntries: allEntries.length, alreadyAggregated: allEntries.length - entries.length };
    } catch (e) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { before: 'dataSource' });

  // Aggregation POST endpoint — aggregates entry data into the log record
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    const reqPath = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
    if (reqPath !== '/__pd__/aggregate-log') {
      return await next();
    }
    if (ctx.method !== 'POST') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const body = ctx.request.body || {};
      let logId = body.logId ? parseInt(body.logId) : null;
      let projectID = body.projectID ? parseInt(body.projectID) : (body['link-projectID'] ? parseInt(body['link-projectID']) : (body.project ? (typeof body.project === 'object' ? parseInt(body.project.id) : parseInt(body.project)) : null));
      if (!projectID && body.projectNameNo) {
        const proj = await db.getRepository('projects').findOne({ filter: { project_code: body.projectNameNo } });
        if (proj) projectID = proj.id;
      }
      let date = body.date ? (typeof body.date === 'string' && body.date.includes('-') ? parseInt(body.date.replace(/-/g, '')) : parseInt(body.date)) : null;
      let log: any = null;

      if (logId) {
        log = await db.getRepository('construction_daily_log').findOne({
          filter: { id: logId }
        });
      } else if (projectID && date) {
        const dateStr = ymdToDateStr(date);
        log = await db.getRepository('construction_daily_log').findOne({
          filter: { 'link-projectID': projectID, log_date: dateStr }
        });
        if (!log) {
          const isPreview = body.preview === true || body.preview === 'true';
          if (isPreview) {
            // Preview mode: return aggregated data without creating log
            const entries = await db.getRepository('construction_daily_entries').find({
              filter: { projectID: projectID, entry_date: dateStr },
              sort: ['createdAt']
            });
            const textFields = ['work_content', 'quality_issues', 'safety_issues', 'others', 'personnel_count', 'equipment_usage', 'material_usage'];
            const result: Record<string, string> = {};
            for (const f of textFields) {
              const parts: string[] = [];
              let n = 0;
              for (const e of entries) {
                const v = e.get(f);
                if (v && typeof v === 'string' && v.trim()) {
                  parts.push((++n) + '. ' + v.trim());
                }
              }
              result[f] = parts.join('\n');
            }
            ctx.body = { code: 0, data: { entries: entries.length, result } };
            return;
          }
          const entriesForWeather = await db.getRepository('construction_daily_entries').find({
            filter: { projectID: projectID, entry_date: dateStr },
            sort: ['createdAt']
          });
          let weather = '';
          for (let w = 0; w < entriesForWeather.length; w++) {
            const ew = entriesForWeather[w].get('weather');
            if (ew && typeof ew === 'string' && ew.trim()) { weather = ew.trim(); break; }
          }
          log = await db.getRepository('construction_daily_log').create({
            values: {
              'link-projectID': projectID,
              log_date: dateStr,
              weather: weather,
              status: '\u5f85\u5ba1\u6838',
              previous_status: ''
            }
          });
        }
      } else {
        ctx.body = { code: -1, msg: 'Missing logId or (projectID + date)' };
        return;
      }
      if (!log) {
        ctx.body = { code: -1, msg: 'Log not found' };
        return;
      }
      projectID = log.get('link-projectID');
      const rawDate: any = log.get('log_date');
      const dateStr = normalizeDateStr(rawDate);
      logId = log.get('id');
      const entries = await db.getRepository('construction_daily_entries').find({
        filter: { projectID: projectID, entry_date: dateStr },
        sort: ['createdAt']
      });
      const isPreview2 = body.preview === true || body.preview === 'true';
      const aggregatedUpTo = isPreview2 ? null : (log.exclude?.aggregated?.entryNo || null);
      const newEntries = aggregatedUpTo
        ? entries.filter((e: any) => e.get('id') > aggregatedUpTo)
        : entries;
      const textFields = ['work_content', 'quality_issues', 'safety_issues', 'others', 'personnel_count', 'equipment_usage', 'material_usage'];
      if (newEntries.length === 0) {
        const emptyResult: Record<string, string> = {};
        textFields.forEach(f => emptyResult[f] = '');
        ctx.body = { code: 0, data: { updated: false, message: '\u6ca1\u6709\u65b0\u589e\u7684\u65e5\u5fd7\u586b\u62a5\u9700\u8981\u6c47\u603b', result: emptyResult } };
        return;
      }
      const countNumberedLines = (text: string): number => {
        if (!text || typeof text !== 'string') return 0;
        let count = 0;
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (/^\d+\.\s/.test(lines[i])) count++;
        }
        return count;
      };
      const updates: Record<string, string> = {};
      for (let f = 0; f < textFields.length; f++) {
        const fieldName = textFields[f];
        const existingText = log.get(fieldName) || '';
        let startNum = countNumberedLines(existingText);
        const parts: string[] = [];
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
      const maxEntryId = newEntries.reduce((max: number, e: any) => Math.max(max, e.get('id')), 0);
      const existingExclude = typeof log.exclude === 'object' && log.exclude ? log.exclude : {};
      const writeValues = { ...updates, exclude: { ...existingExclude, aggregated: { entryNo: maxEntryId } }, aggregated_up_to: maxEntryId };
      await db.getRepository('construction_daily_log').update({
        filter: { id: logId },
        values: writeValues
      });
      if (maxEntryId > 0) {
        await db.sequelize.query('UPDATE construction_daily_log SET aggregated_up_to = :val WHERE id = :id', { replacements: { val: maxEntryId, id: logId }, type: db.sequelize.QueryTypes.UPDATE });
      }

      // Copy attachments from entry_attachments -> log_attachments
      const newEntryIds = newEntries.map((e: any) => e.get('id'));
      let copiedAttachments = 0;
      if (newEntryIds.length > 0) {
        const placeholders = newEntryIds.map((_: any, i: number) => ':eid' + i).join(',');
        const entryReplacements: Record<string, any> = {};
        newEntryIds.forEach((id: any, i: number) => { entryReplacements['eid' + i] = id; });
        const links = await db.sequelize.query(
          'SELECT DISTINCT attachment_id FROM entry_attachments WHERE entry_id IN (' + placeholders + ')',
          { replacements: entryReplacements, type: db.sequelize.QueryTypes.SELECT }
        );
        // Delete existing log_attachments for this log (idempotent re-aggregate)
        await db.sequelize.query(
          'DELETE FROM log_attachments WHERE log_id = :logId',
          { replacements: { logId }, type: db.sequelize.QueryTypes.DELETE }
        );
        for (const link of links) {
          const attId = link.attachment_id;
          if (!attId) continue;
          try {
            await db.sequelize.query(
              "INSERT INTO log_attachments (log_id, attachment_id, project_id, log_date, \"createdAt\", \"updatedAt\") VALUES (:logId, :attId, :pid, :ldt, NOW(), NOW()) ON CONFLICT DO NOTHING",
              { replacements: { logId, attId, pid: projectID, ldt: dateStr }, type: db.sequelize.QueryTypes.INSERT }
            );
            copiedAttachments++;
          } catch (_e) { /* skip duplicates */ }
        }
      }

      const resultData: any = {
        updated: true,
        newEntryCount: newEntries.length,
        totalEntryCount: entries.length,
        fields: Object.keys(updates),
        values: updates,
        attachmentsCopied: copiedAttachments,
      };
      if (isPreview2) {
        resultData.result = updates;
      }
      ctx.body = { code: 0, data: resultData };
      return;
    } catch (e) {
      ctx.body = { code: -1, msg: e.message };
      return;
    }
  }, { tag: 'dashboard-home', before: 'resourcer' });

}
