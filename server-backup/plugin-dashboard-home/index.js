'use strict';

const { Plugin } = require('@nocobase/server');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AMAP_KEY = process.env.AMAP_KEY || '31e73c1d12b2848e7bd964774782a954';

// Haversine distance between two points in meters
function haversineDist(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Point-to-segment distance for polyline geofence check
function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
  var dAC = haversineDist(lat, lon, lat1, lon1);
  var dBC = haversineDist(lat, lon, lat2, lon2);
  var dAB = haversineDist(lat1, lon1, lat2, lon2);
  if (dAB < 1) return dAC;
  var cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
  var cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
  if (cosA <= 0) return dAC;
  if (cosB <= 0) return dBC;
  var s = (dAC + dBC + dAB) / 2;
  var area = Math.sqrt(Math.max(0, s * (s - dAC) * (s - dBC) * (s - dAB)));
  return area * 2 / dAB;
}

// QWeather JWT config
const QW_KEY_ID = 'KAGXVT4Y78';
const QW_PROJECT_ID = '3MTGWKPJXJ';
const QW_WEATHER_HOST = 'ke7p448t6h.re.qweatherapi.com';
const QW_GEO_HOST = 'ke7p448t6h.re.qweatherapi.com';
const QW_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHwCpGLzy/EZjEdh4WJlKI081vmFXEUhCMFkGqs2dEj6
-----END PRIVATE KEY-----`;

function qwJwt() {
  var h = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: QW_KEY_ID })).toString('base64url');
  var iat = Math.floor(Date.now() / 1000) - 30;
  var exp = iat + 900;
  var p = Buffer.from(JSON.stringify({ sub: QW_PROJECT_ID, iat: iat, exp: exp })).toString('base64url');
  var d = h + '.' + p;
  var k = crypto.createPrivateKey(QW_PRIVATE_KEY);
  var s = crypto.sign(null, Buffer.from(d), k).toString('base64url');
  return d + '.' + s;
}

const PAGE_MAP = {
  '/__dh__': 'index.html',
  '/__tb__': '百宝箱.html',
  '/__fp__': '行程发票报销助手.html',
  '/__tp__': '智能排版打印助手.html',
  '/__gf__': 'geofence-manager.html',
  '/__pd__': '人员动态.html',
};

const STORAGE_DIR = '/app/nocobase/storage/dashboard';

module.exports = class DashboardHomePlugin extends Plugin {
  async load() {
    // Ensure approval trigger fields exist on attendance_records
    var arCol = this.db.getCollection('attendance_records');
    if (arCol) {
      if (!arCol.hasField('approval_action')) arCol.addField('approval_action', { type: 'string', nullable: true });
      if (!arCol.hasField('approval_remark')) arCol.addField('approval_remark', { type: 'text', nullable: true });
      if (!arCol.hasField('approved_by')) arCol.addField('approved_by', { type: 'bigInt', nullable: true });
      if (!arCol.hasField('approval_trigger_at')) arCol.addField('approval_trigger_at', { type: 'date', nullable: true });
      if (!arCol.hasField('days')) arCol.addField('days', { type: 'integer', nullable: true });
      if (!arCol.hasField('is_overtime')) arCol.addField('is_overtime', { type: 'boolean', nullable: true, defaultValue: false });
      if (!arCol.hasField('check_result')) arCol.addField('check_result', { type: 'string', nullable: true });
      if (!arCol.hasField('anomaly_reason')) arCol.addField('anomaly_reason', { type: 'text', nullable: true });
      if (!arCol.hasField('workflow_status')) arCol.addField('workflow_status', { type: 'string', nullable: true, defaultValue: 'normal' });
      arCol.sync({ alter: true });
    }

    // Normalize path — strip /api prefix for consistent path matching
    this.app.use(async (ctx, next) => {
      ctx.state.reqPath = ctx.path.replace(/^\/api/, '');
      await next();
    }, { before: 'dataSource' });

    // Auth-check endpoint for nginx auth_request
    this.app.use(async (ctx, next) => {
      var p = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
      if (ctx.method !== 'GET' || p !== '/plugin-dashboard-home/auth-check') {
        return await next();
      }
      ctx.status = await this.isAuthenticated(ctx) ? 200 : 401;
      ctx.body = ctx.status === 200 ? 'ok' : 'Unauthorized';
    });

    // Geocode + IP locate proxy (via Amap, server-side to respect IP whitelist)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || !(ctx.state.reqPath.endsWith('/geocode') || ctx.state.reqPath.endsWith('/locate') || ctx.state.reqPath.endsWith('/regeo'))) {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      var amapKey = process.env.AMAP_KEY || '31e73c1d12b2848e7bd964774782a954';
      if (ctx.state.reqPath.endsWith('/geocode')) {
        var q = ctx.query.q;
        if (!q) { ctx.body = { status: '0', tips: [] }; return; }
        try {
          var url = 'https://restapi.amap.com/v3/assistant/inputtips?key=' + amapKey + '&keywords=' + encodeURIComponent(q) + '&output=json&offset=20';
          var data = await new Promise(function(resolve, reject) {
            https.get(url, function(res) {
              var body = '';
              res.on('data', function(c) { body += c; });
              res.on('end', function() {
                try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
              });
            }).on('error', reject);
          });
          ctx.body = data;
        } catch(e) {
          ctx.status = 502;
          ctx.body = { status: '0', tips: [], error: e.message };
        }
      } else if (ctx.state.reqPath.endsWith('/regeo')) {
        var location = ctx.query.location;
        if (!location) { ctx.body = { status: '0', regeocode: null }; return; }
        try {
          var url = 'https://restapi.amap.com/v3/geocode/regeo?key=' + amapKey + '&location=' + encodeURIComponent(location) + '&output=json&radius=1000';
          var data = await new Promise(function(resolve, reject) {
            https.get(url, function(res) {
              var body = '';
              res.on('data', function(c) { body += c; });
              res.on('end', function() {
                try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
              });
            }).on('error', reject);
          });
          ctx.body = data;
        } catch(e) {
          ctx.status = 502;
          ctx.body = { status: '0', regeocode: null, error: e.message };
        }
      } else {
        try {
          var url = 'https://restapi.amap.com/v3/ip?key=' + amapKey + '&output=json';
          var data = await new Promise(function(resolve, reject) {
            https.get(url, function(res) {
              var body = '';
              res.on('data', function(c) { body += c; });
              res.on('end', function() {
                try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
              });
            }).on('error', reject);
          });
          ctx.body = data;
        } catch(e) {
          ctx.status = 502;
          ctx.body = { status: '0', rectangle: null, city: null, province: null, error: e.message };
        }
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Unified attendance submission endpoint – frontend only collects, backend processes
    this.app.use(async (ctx, next) => {
      var p = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
      if (ctx.method !== 'POST' || p !== '/__pd__/attendance/submit') return await next();
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        var body = ctx.request.body || {};
        var user = ctx.state.currentUser;
        var isLeave = (body.check_type === '请假' || body.check_type === '出差');
        var vals = {
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
        var record = await this.db.getRepository('attendance_records').create({ values: vals });
        ctx.body = { status: 'ok', data: record, message: isLeave ? '已提交审批' : '打卡成功' };
      } catch(e) {
        ctx.status = 500;
        ctx.body = { status: 'error', message: e.message };
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Leave/Travel approval pending list
    // Permission model:
    //   level1_pending → department owners (departments.owners, isOwner=true)
    //   level2/3a_pending → department Person_in_charge
    //   level3b_pending → hr_admin role
    //   level4_pending → GeneralManager role
    //   admin/root → all
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/approvals/pending') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        var user = ctx.state.currentUser;
        var userId = user.id;
        var roles = user.roles ? user.roles.map(function(r) { return r.name; }) : [];
        var isAdmin = roles.indexOf('admin') !== -1 || roles.indexOf('root') !== -1;

        if (isAdmin) {
          var allRecs = await this.db.getRepository('attendance_records').find({
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

        // Build OR conditions based on user's department authority
        var orConditions = [];

        // a) Department owner → level1_pending
        var ownerDepts = await this.db.getRepository('departments').find({
          filter: { 'owners.id': userId },
          limit: 50
        });
        if (ownerDepts && ownerDepts.length > 0) {
          var oids = ownerDepts.map(function(d) { return d.id; });
          orConditions.push({
            $and: [
              { workflow_status: 'level1_pending' },
              { 'createdBy.departments.id': { $in: oids } }
            ]
          });
        }

        // b) Person_in_charge → level2_pending, level3a_pending
        var picDepts = await this.db.getRepository('departments').find({
          filter: { 'Person_in_charge.id': userId },
          limit: 50
        });
        if (picDepts && picDepts.length > 0) {
          var pids = picDepts.map(function(d) { return d.id; });
          orConditions.push({
            $and: [
              { workflow_status: { $in: ['level2_pending', 'level3a_pending'] } },
              { 'createdBy.departments.id': { $in: pids } }
            ]
          });
        }

        // c) hr_admin role → level3b_pending (all departments)
        if (roles.indexOf('hr_admin') !== -1) {
          orConditions.push({ workflow_status: 'level3b_pending' });
        }

        // d) GeneralManager role → level4_pending (all)
        if (roles.indexOf('GeneralManager') !== -1) {
          orConditions.push({ workflow_status: 'level4_pending' });
        }

        if (orConditions.length === 0) {
          ctx.body = { data: [], roles: roles, reason: 'no_authority' };
          return;
        }

        var recs = await this.db.getRepository('attendance_records').find({
          filter: { $or: orConditions, check_type: { $in: ['请假', '出差'] } },
          appends: ['createdBy', 'createdBy.departments'],
          sort: '-check_time',
          limit: 50
        });
        ctx.body = { data: recs, roles: roles };
      } catch(e) {
        ctx.status = 500;
        ctx.body = { data: [], error: e.message };
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/approvals/process') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        var body = ctx.request.body || {};
        var recordId = body.recordId;
        var action = body.action;
        var remark = body.remark || '';
        if (!recordId || !action) {
          ctx.body = { status: 'error', message: '缺少参数 recordId 或 action' };
          return;
        }
        var repo = this.db.getRepository('attendance_records');
        var record = await repo.findOne({ filter: { id: recordId }, appends: ['createdBy'] });
        if (!record) {
          ctx.body = { status: 'error', message: '记录不存在' };
          return;
        }
        var user = ctx.state.currentUser;
        var userId = user.id;
        var roles = user.roles ? user.roles.map(function(r) { return r.name; }) : [];
        var isAdmin = roles.indexOf('admin') !== -1 || roles.indexOf('root') !== -1;
        var curStatus = record.workflow_status;
        var creatorId = record.createdById || (record.createdBy && record.createdBy.id);

        // Check permission based on department relationships
        async function isDeptOwner(uid, cid) {
          if (isAdmin) return true;
          var depts = await ctx.db.getRepository('departments').find({
            filter: { 'members.id': cid },
            limit: 20
          });
          for (var i = 0; i < depts.length; i++) {
            var d = await ctx.db.getRepository('departments').findOne({
              filter: { id: depts[i].id, 'owners.id': uid },
              limit: 1
            });
            if (d) return true;
          }
          return false;
        }
        async function isDeptPic(uid, cid) {
          if (isAdmin) return true;
          var depts = await ctx.db.getRepository('departments').find({
            filter: { 'members.id': cid },
            limit: 20
          });
          for (var i = 0; i < depts.length; i++) {
            var d = await ctx.db.getRepository('departments').findOne({
              filter: { id: depts[i].id, 'Person_in_charge.id': uid },
              limit: 1
            });
            if (d) return true;
          }
          return false;
        }

        var allowed = false;
        if (curStatus === 'level1_pending') allowed = await isDeptOwner(userId, creatorId);
        else if (curStatus === 'level2_pending') allowed = await isDeptPic(userId, creatorId);
        else if (curStatus === 'level3a_pending') allowed = await isDeptPic(userId, creatorId);
        else if (curStatus === 'level3b_pending') allowed = isAdmin || roles.indexOf('hr_admin') !== -1;
        else if (curStatus === 'level4_pending') allowed = isAdmin || roles.indexOf('GeneralManager') !== -1;
        else if (isAdmin) allowed = true;

        if (!allowed) {
          ctx.body = { status: 'error', message: '您没有权限处理此审批' };
          return;
        }
        if (action === 'reject') {
          await repo.update({ filter: { id: recordId }, values: { workflow_status: 'rejected', verify_status: 'rejected:' + remark } });
          ctx.body = { status: 'ok', message: '已驳回' };
          return;
        }
        var nextStatus = 'approved';
        if (curStatus === 'level1_pending') nextStatus = 'approved';
        else if (curStatus === 'level2_pending') nextStatus = 'approved';
        else if (curStatus === 'level3a_pending') nextStatus = 'level3b_pending';
        else if (curStatus === 'level3b_pending') nextStatus = 'approved';
        else if (curStatus === 'level4_pending') nextStatus = 'approved';
        await repo.update({ filter: { id: recordId }, values: { workflow_status: nextStatus, verify_status: 'approved_by_' + curStatus } });
        // 请假/出差审批最终通过 → 更新归档统计
        if (nextStatus === 'approved' && (record.check_type === '请假' || record.check_type === '出差')) {
          try {
            var archRepo = ctx.db.getRepository('att_archives');
            var dd = new Date();
            var period = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0');
            var arch = await archRepo.findOne({ filter: { period: period, createdBy: creatorId } });
            var leaveDays = record.days || 1;
            if (!arch) {
              await archRepo.create({
                values: { period: period, archive_year: String(dd.getFullYear()), total_work_days: 0, total_leave_days: leaveDays, createdBy: creatorId, geofence_inside_days: 0, geofence_outside_days: 0, geofence_anomaly_count: 0 }
              });
            } else {
              await archRepo.update({ filter: { id: arch.id }, values: { total_leave_days: (arch.total_leave_days || 0) + leaveDays } });
            }
          } catch(e) { /* archive update non-fatal */ }
        }
        ctx.body = { status: 'ok', message: '已审批', nextStatus: nextStatus };
      } catch(e) {
        ctx.status = 500;
        ctx.body = { status: 'error', message: e.message };
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Workers API - server-side query bypasses ACL
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/workers') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        const repo = this.db.getRepository('users');
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
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Batch collect - server-side location history filling (called by cron)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/batch-collect') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        var today = new Date().toISOString().substring(0, 10);
        var records = await this.db.getRepository('attendance_records').find({
          filter: { createdAt: { $dateBetween: [today + 'T00:00:00.000Z', today + 'T23:59:59.999Z'] } },
          appends: ['createdBy'],
          sort: '-check_time',
          limit: 2000
        });
        var userStatus = {};
        records.forEach(function(r){
          var uid = r.createdBy ? (r.createdBy.id || r.createdById) : null;
          if (!uid) return;
          if (!userStatus[uid]) userStatus[uid] = { checkIn: null, checkOut: null, latestLat: null, latestLng: null, latestTime: null };
          var t = r.check_time || r.createdAt;
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
        var activeUsers = [];
        Object.keys(userStatus).forEach(function(uid){
          var s = userStatus[uid];
          if (s.checkIn && (!s.checkOut || s.checkOut < s.checkIn) && s.latestLat && s.latestLng) {
            activeUsers.push({ uid: parseInt(uid), lat: s.latestLat, lng: s.latestLng, time: s.latestTime });
          }
        });
        var LocationHistory = this.db.getRepository('location_history');
        var written = [];
        for (var i = 0; i < activeUsers.length; i++) {
          var u = activeUsers[i];
          var hist = await LocationHistory.find({
            filter: { createdById: u.uid },
            sort: '-recorded_at',
            limit: 1
          });
          var last = hist.length > 0 ? hist[0] : null;
          var skip = last && last.latitude === String(u.lat) && last.longitude === String(u.lng) &&
                     (Date.now() - new Date(last.recorded_at || last.createdAt).getTime()) < 5 * 60 * 1000;
          if (skip) continue;
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
      } catch (e) {
        ctx.status = 500;
        ctx.body = { data: null, error: e.message };
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Dashboard snapshot - aggregated data for people dynamic page
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/dashboard-snapshot') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        const today = new Date().toISOString().substring(0, 10);
        const db = this.db;
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

    // Attendance CSV export
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/attendance/export') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; ctx.body = 'Unauthorized'; return; }
      ctx.withoutDataWrapping = true;
      ctx.type = 'text/csv; charset=utf-8';
      ctx.set('Content-Disposition', 'attachment; filename="attendance_export.csv"');
      try {
        var period = ctx.query.period || '';
        var userId = ctx.query.userId ? parseInt(ctx.query.userId) : 0;
        var filter = {};
        if (period) filter.period = period;
        if (userId) filter.createdBy = userId;
        var records = await this.db.getRepository('attendance_records').find({
          filter: filter,
          appends: ['createdBy'],
          sort: '-check_time',
          limit: 5000
        });
        var csv = '\uFEFF'; // BOM for Excel Chinese
        csv += 'ID,姓名,部门,打卡类型,打卡时间,经度,纬度,精度(米),打卡结果,异常原因,围栏内,围栏距离(米),审批状态\n';
        for (var i = 0; i < records.length; i++) {
          var r = records[i];
          var uname = '', dept = '';
          if (r.createdBy) {
            uname = r.createdBy.nickname || r.createdBy.username || '';
            dept = (r.createdBy.departments && r.createdBy.departments[0] && r.createdBy.departments[0].title) || '';
          }
          var row = [
            r.id, uname, dept, r.check_type, r.check_time,
            r.longitude || '', r.latitude || '', r.gps_accuracy || '',
            r.check_result || '', (r.anomaly_reason || '').replace(/"/g,'""'),
            r.geofence_inside != null ? (r.geofence_inside ? '是' : '否') : '',
            r.geofence_distance || '', r.workflow_status || ''
          ].map(function(v){ return '"' + String(v) + '"'; }).join(',');
          csv += row + '\n';
        }
        ctx.body = csv;
      } catch(e) {
        ctx.status = 500;
        ctx.body = '导出失败: ' + e.message;
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Archive monthly summary export (CSV)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/archive/export') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) { ctx.status = 401; ctx.body = 'Unauthorized'; return; }
      ctx.withoutDataWrapping = true;
      ctx.type = 'text/csv; charset=utf-8';
      ctx.set('Content-Disposition', 'attachment; filename="archive_monthly.csv"');
      try {
        var period = ctx.query.period || '';
        var userId = ctx.query.userId ? parseInt(ctx.query.userId) : 0;
        var filter = {};
        if (period) filter.period = period;
        if (userId) filter.createdBy = userId;
        var archives = await this.db.getRepository('att_archives').find({
          filter: filter,
          appends: ['createdBy'],
          sort: '-period',
          limit: 500
        });
        var csv = '\uFEFF';
        csv += '姓名,月份,工作日,请假天数,围栏内天数,围栏外天数,异常次数\n';
        for (var i = 0; i < archives.length; i++) {
          var a = archives[i];
          var uname = a.createdBy ? (a.createdBy.nickname || a.createdBy.username || '') : '';
          var row = [uname, a.period, a.total_work_days || 0, a.total_leave_days || 0,
            a.geofence_inside_days || 0, a.geofence_outside_days || 0, a.geofence_anomaly_count || 0
          ].map(function(v){ return '"' + String(v) + '"'; }).join(',');
          csv += row + '\n';
        }
        ctx.body = csv;
      } catch(e) {
        ctx.status = 500;
        ctx.body = '导出失败: ' + e.message;
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Search API - AMAP inputtips proxy (no auth check, page-level auth already done by nginx)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/search') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      var amapKey = process.env.AMAP_KEY || '31e73c1d12b2848e7bd964774782a954';
      var q = ctx.query.q;
      if (!q) { ctx.body = { status: '0', tips: [] }; return; }
      try {
        var data = await new Promise(function(resolve, reject) {
          https.get('https://restapi.amap.com/v3/assistant/inputtips?key=' + amapKey + '&keywords=' + encodeURIComponent(q) + '&output=json&offset=20', function(res) {
            var body = '';
            res.on('data', function(c) { body += c; });
            res.on('end', function() {
              try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
            });
          }).on('error', reject);
        });
        ctx.body = data;
      } catch(e) {
        ctx.status = 502;
        ctx.body = { status: '0', tips: [], error: e.message };
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Reverse geocode - convert lat/lng to address via AMAP regeo
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/reverse-geocode') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      var lat = ctx.query.lat;
      var lng = ctx.query.lng;
      if (!lat || !lng) { ctx.body = { status: '0', address: null }; return; }
      try {
        var data = await new Promise(function(resolve, reject) {
          https.get('https://restapi.amap.com/v3/geocode/regeo?key=' + AMAP_KEY + '&location=' + encodeURIComponent(lng + ',' + lat) + '&output=json&radius=1000', function(res) {
            var body = '';
            res.on('data', function(c) { body += c; });
            res.on('end', function() {
              try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
            });
          }).on('error', reject);
        });
        if (data.status === '1' && data.regeocode) {
          var ac = data.regeocode.addressComponent || {};
          var street = ac.streetNumber && ac.streetNumber.street || ac.street || '';
          var township = ac.township || '';
          var district = ac.district || '';
          var city = ac.city || '';
          var province = ac.province || '';
          ctx.body = {
            status: '1',
            adcode: ac.adcode || '',
            address: {
              province: province,
              city: city,
              district: district,
              township: township,
              street: street,
              formatted: data.regeocode.formatted_address || ''
            }
          };
        } else {
          ctx.body = { status: '0', address: null, amap: data };
        }
      } catch(e) {
        ctx.status = 502;
        ctx.body = { status: '0', address: null, error: e.message };
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // QWeather proxy - JWT auth, primary weather source
    function qwFetch(url) {
      return new Promise(function(resolve, reject) {
        var jwt = qwJwt();
        var opts = new URL(url);
        https.get({
          hostname: opts.hostname, path: opts.pathname + opts.search,
          headers: { 'Authorization': 'Bearer ' + jwt, 'User-Agent': 'Mozilla/5.0' }
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                var buf = Buffer.concat(chunks);
                try {
                    if (res.headers['content-encoding'] === 'gzip') {
                        buf = zlib.gunzipSync(buf);
                    }
                    resolve(JSON.parse(buf.toString()));
                } catch(e) { reject(e); }
            });
        }).on('error', reject);
      });
    }
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/weather-qw') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      var lat = ctx.query.lat;
      var lng = ctx.query.lng;
      var city = ctx.query.city || '';
      city = city.replace(/市$/, '').replace(/地区$/, '');
      try {
        // If lat/lng provided, use directly (QWeather supports lon,lat format)
        // If only city name, look up via GeoAPI first
        var loc = '';
        var locCity = '';
        if (lat && lng) {
          loc = lng + ',' + lat;
          // Try GeoAPI to get city name from coords
          try {
            var geo = await qwFetch('https://' + QW_GEO_HOST + '/geo/v2/city/lookup?location=' + encodeURIComponent(loc) + '&range=cn');
            if (geo && geo.code === '200' && geo.location && geo.location[0]) {
              locCity = geo.location[0].name || '';
              if (!locCity) locCity = geo.location[0].adm1 || '';
            }
          } catch(e) {}
        } else if (city) {
          try {
            var geo = await qwFetch('https://' + QW_GEO_HOST + '/geo/v2/city/lookup?location=' + encodeURIComponent(city) + '&range=cn');
            if (geo && geo.code === '200' && geo.location && geo.location[0]) {
              loc = geo.location[0].id || city;
              locCity = geo.location[0].name || city;
            } else {
              loc = city;
              locCity = city;
            }
          } catch(e) { loc = city; locCity = city; }
        }
        if (!loc && !city) { ctx.body = { code: -1, msg: '缺少参数' }; return; }
        var w = await qwFetch('https://' + QW_WEATHER_HOST + '/v7/weather/now?location=' + encodeURIComponent(loc || city));
        if (w && w.code === '200') {
          var n = w.now || {};
          ctx.body = { code: 0, data: {
            city: locCity || '',
            weather: n.text || n.weather || '',
            temperature: n.temp || n.temperature || '',
            windDirection: n.windDir || '',
            windPower: n.windScale || '',
            humidity: n.humidity || '',
            icon: n.icon || '',
            time: w.updateTime || ''
          }};
        } else {
          ctx.body = { code: -1, msg: 'QWeather: ' + (w && w.code || 'unknown error') };
        }
      } catch(e) {
        ctx.body = { code: -1, msg: e.message };
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // QWeather reverse geocode - lat/lng to location name (GeoAPI)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/reverse-geocode-qw') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      var lat = ctx.query.lat;
      var lng = ctx.query.lng;
      if (!lat || !lng) { ctx.body = { status: '0', address: null }; return; }
      try {
        var geo = await qwFetch('https://' + QW_GEO_HOST + '/geo/v2/city/lookup?location=' + encodeURIComponent(lng + ',' + lat) + '&range=cn');
        if (geo && geo.code === '200' && geo.location && geo.location[0]) {
          var loc = geo.location[0];
          ctx.body = {
            status: '1',
            address: {
              city: loc.adm2 || loc.name || '',
              district: loc.adm3 || loc.adm1 || '',
              name: loc.name || '',
              type: loc.type || ''
            }
          };
        } else {
          ctx.body = { status: '0', address: null, qw: geo };
        }
      } catch(e) {
        ctx.body = { status: '0', address: null, error: e.message };
      }
    });

    // Pinyin initials endpoint
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/pinyin-initials') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        var text = ctx.query.text;
        if (!text) { ctx.body = { code: -1, msg: '缺少参数text' }; return; }
        var p = require('/app/nocobase/storage/node_modules/pinyin-pro');
        var initials = p.pinyin(text, { pattern: 'first', toneType: 'none' }).replace(/ /g, '').toUpperCase();
        ctx.body = { code: 0, data: { text: text, initials: initials } };
      } catch(e) {
        ctx.body = { code: -1, msg: e.message };
      }
    });

    // Next serial number endpoint (atomic increment)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/next-serial') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        var prefix = ctx.query.prefix || 'SG';
        var dateStr = ctx.query.date;
        var projectId = ctx.query.project_id;
        if (!dateStr || !projectId) {
          ctx.body = { code: -1, msg: '缺少参数date或project_id' };
          return;
        }
        var result = await ctx.db.sequelize.query(
          "INSERT INTO sys_serial_counters (id, prefix, date_str, project_id, current_seq, module, \"createdAt\", \"updatedAt\") VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM sys_serial_counters), :prefix, :dateStr, :projectId, 1, 'construction_daily', NOW(), NOW()) ON CONFLICT (prefix, date_str, project_id) DO UPDATE SET current_seq = sys_serial_counters.current_seq + 1, \"updatedAt\" = NOW() RETURNING current_seq",
          {
            replacements: { prefix: prefix, dateStr: dateStr, projectId: parseInt(projectId) },
            type: 'SELECT'
          }
        );
        var seq = result[0][0].current_seq;
        ctx.body = { code: 0, data: { prefix: prefix, date: dateStr, project_id: projectId, seq: seq } };
      } catch(e) {
        ctx.body = { code: -1, msg: e.message };
      }
    });

    // Batch create daily logs endpoint (for TIMER-2 workflow)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/batch-create-logs') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      try {
        var summaries = ctx.request.body && ctx.request.body.summaries ? ctx.request.body.summaries : [];
        if (!Array.isArray(summaries) || summaries.length === 0) {
          ctx.body = { code: 0, data: { created: 0, logs: [], briefings: [] } };
          return;
        }
        var logs = [];
        var briefings = [];
        var today = new Date().toISOString().slice(0, 10);
        var db = ctx.db;
        for (var i = 0; i < summaries.length; i++) {
          var s = summaries[i];
          var projectId = s.projectId;
          var weather = s.weather || '';
          var entryCount = s.entryCount || 0;
          var workerCount = s.workerCount || 0;
          var summaryDate = s.summaryDate || today;

          // 1. Create construction_daily_log if not exists
          var existingLog = await db.getRepository('construction_daily_log').findOne({
            filter: { project_id: projectId, log_date: summaryDate }
          });
          var logId = null;
          if (!existingLog) {
            var logRecord = await db.getRepository('construction_daily_log').create({
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
          } else {
            logId = existingLog.id;
            logs.push({ id: logId, project_id: projectId, created: false });
          }

          // 2. Create briefings if not exists
          var existingBriefing = await db.getRepository('briefings').findOne({
            filter: { project_id: projectId, briefing_date: summaryDate, briefing_type: 'construction_daily' }
          });
          if (!existingBriefing) {
            var briefingRecord = await db.getRepository('briefings').create({
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
          } else {
            briefings.push({ id: existingBriefing.id, project_id: projectId, created: false });
          }

          // 3. Update entries to link to log
          if (logId) {
            await db.getRepository('construction_daily_entries').update({
              filter: { project_id: projectId, entry_date: summaryDate },
              values: { log_id: logId }
            });
          }
        }
        ctx.body = { code: 0, data: { created: logs.length, logs: logs, briefings: briefings } };
      } catch(e) {
        ctx.body = { code: -1, msg: e.message, stack: e.stack };
      }
    });

    // Page serving middleware
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || !PAGE_MAP[ctx.state.reqPath]) {
        return await next();
      }

      if (await this.isAuthenticated(ctx)) {
        ctx.withoutDataWrapping = true;
        ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        ctx.set('Pragma', 'no-cache');
        ctx.set('Expires', '0');
        try {
          const fileName = PAGE_MAP[ctx.state.reqPath];
          const htmlPath = path.join(STORAGE_DIR, fileName);
          const html = fs.readFileSync(htmlPath, 'utf-8');
          ctx.type = 'text/html; charset=utf-8';
          ctx.body = html;
        } catch (e) {
          ctx.status = 500;
          ctx.body = 'Page file not found';
        }
      } else {
        ctx.redirect('/signin');
      }
    }, { tag: 'dashboard-home', before: 'dataSource' });
  }

  async isAuthenticated(ctx) {
    if (ctx.state.currentUser) return true;

    const authHeader = ctx.get('Authorization') || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      token = ctx.cookies.get('nb_token') || ctx.cookies.get('NOCOBASE_token');
    }
    if (!token) return false;

    // Known custom token -> user 19 (HR6666)
    if (token === 'ee2ccf0c-6e29-4e18-8bac-e5e145bc4726') {
      try {
        var u = await this.db.getRepository('users').findOne({
          filter: { id: 19 },
          appends: ['roles', 'departments']
        });
        if (u) { ctx.state.currentUser = u; return true; }
      } catch(e) {}
    }

    // Fallback: JWT tokens via auth:check
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.get({
          hostname: '127.0.0.1', port: 13000,
          path: '/api/auth:check',
          headers: { 'Authorization': 'Bearer ' + token },
          timeout: 5000,
        }, (res) => {
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => resolve({ status: res.statusCode, body: body }));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });

      if (result.status === 200) {
        try {
          var data = JSON.parse(result.body);
          var userData = data && data.data ? data.data : data;
          if (userData && userData.id) {
            ctx.state.currentUser = userData;
          }
        } catch(e) {}
        return true;
      }
    } catch(e) {}

    return false;
  }
};
