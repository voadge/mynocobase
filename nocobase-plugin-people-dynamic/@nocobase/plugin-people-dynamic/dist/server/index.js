'use strict';

const { Plugin } = require('@nocobase/server');
const http = require('http');

const FENCE_POLL_INTERVAL_MS = parseInt(process.env.FENCE_POLL_INTERVAL || '30000');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

module.exports = class PeopleDynamicPlugin extends Plugin {
  async load() {
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/dashboard-snapshot') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; ctx.body = 'Unauthorized'; return; }
      ctx.withoutDataWrapping = true;

      const today = new Date().toISOString().substring(0, 10);
      const db = this.db;

      try {
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
            filter: {
              recorded_at: { $dateBetween: [today, today] },
              is_valid: true
            },
            sort: '-recorded_at',
            pageSize: 500
          })
        ]);

        const onlineMap = {};
        const latestMap = {};
        const checkedInSet = new Set();

        for (const r of records) {
          const uid = r.createdBy && r.createdBy.id || r.createdById;
          if (!uid) continue;
          if (!onlineMap[uid]) onlineMap[uid] = { checkIn: null, checkOut: null };
          if (['上班', '签到'].includes(r.check_type)) {
            if (!onlineMap[uid].checkIn || r.check_time > onlineMap[uid].checkIn) {
              onlineMap[uid].checkIn = r.check_time;
              checkedInSet.add(uid);
            }
          }
          if (['下班', '签退'].includes(r.check_type)) {
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
          if (!uid || latestMap[uid]) continue;
          latestMap[uid] = {
            lat: parseFloat(r.latitude), lng: parseFloat(r.longitude),
            accuracy: r.accuracy, source: r.source, trigger: r.trigger,
            township: r.township, street: r.street, district: r.district,
            recorded_at: r.recorded_at || r.createdAt
          };
        }

        const deptStats = {};
        for (const u of workers) {
          const deptName = u.departments && u.departments[0] && u.departments[0].title || '未分配';
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
          pollInterval: {
            snapshot: 10000,
            fence: FENCE_POLL_INTERVAL_MS
          }
        };
      } catch (e) {
        ctx.status = 500;
        ctx.body = { error: e.message };
      }
    });

    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/fences') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; return; }
      ctx.withoutDataWrapping = true;
      const fences = await this.db.getRepository('geofences').find({
        filter: { is_active: true },
        sort: 'sort'
      });
      ctx.body = { fences, serverTime: new Date().toISOString() };
    });

    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/workers') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; return; }
      ctx.withoutDataWrapping = true;
      const workers = await this.db.getRepository('users').find({
        filter: { roles: { name: { $in: ['workers', 'worker'] } } },
        appends: ['departments', 'roles'],
        sort: 'nickname'
      });
      ctx.body = { data: workers };
    });
  }

  async isAuthenticated(ctx) {
    if (ctx.state.currentUser) return true;
    const authHeader = ctx.get('Authorization') || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      token = ctx.cookies.get('nb_token') || ctx.cookies.get('NOCOBASE_token');
    }
    if (!token) return false;
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.get({
          hostname: '127.0.0.1', port: 13000,
          path: '/api/auth:check',
          headers: { 'Authorization': 'Bearer ' + token },
          timeout: 3000,
        }, (res) => {
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      return result === 200;
    } catch (e) {
      return false;
    }
  }
};
