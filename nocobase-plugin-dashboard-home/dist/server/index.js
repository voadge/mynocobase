'use strict';

const { Plugin } = require('@nocobase/server');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PAGE_MAP = {
  '/api/__dh__': 'index.html',
  '/api/__tb__': '百宝箱.html',
  '/api/__fp__': '行程发票报销助手.html',
  '/api/__tp__': '智能排版打印助手.html',
  '/api/__gf__': 'geofence-manager.html',
  '/api/__pd__': '人员动态.html',
};

const STORAGE_DIR = '/app/nocobase/storage/dashboard';

module.exports = class DashboardHomePlugin extends Plugin {
  async load() {
    // Auth-check endpoint for nginx auth_request
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/plugin-dashboard-home/auth-check') {
        return await next();
      }
      ctx.status = await this.isAuthenticated(ctx) ? 200 : 401;
      ctx.body = ctx.status === 200 ? 'ok' : 'Unauthorized';
    });

    // Geocode + IP locate + reverse geocode proxy (via Amap, server-side to respect IP whitelist)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || !(ctx.path.endsWith('/geocode') || ctx.path.endsWith('/locate') || ctx.path.endsWith('/regeo'))) {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      var amapKey = '31e73c1d12b2848e7bd964774782a954';
      if (ctx.path.endsWith('/geocode')) {
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
      } else if (ctx.path.endsWith('/regeo')) {
        var location = ctx.query.location;
        if (!location) { ctx.body = { status: '0', regeocode: null }; return; }
        try {
          var url = 'https://restapi.amap.com/v3/geocode/regeo?key=' + amapKey + '&location=' + encodeURIComponent(location) + '&output=json&radius=1000&extensions=base';
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

    // Workers API - server-side query bypasses ACL
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/workers') {
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
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/batch-collect') {
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
          if (r.check_type === '上班' || r.check_type === '签到') {
            if (!userStatus[uid].checkIn || t > userStatus[uid].checkIn) userStatus[uid].checkIn = t;
          }
          if (r.check_type === '下班' || r.check_type === '签退') {
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

    // Page serving middleware
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || !PAGE_MAP[ctx.path]) {
        return await next();
      }

      if (await this.isAuthenticated(ctx)) {
        ctx.withoutDataWrapping = true;
        ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        ctx.set('Pragma', 'no-cache');
        ctx.set('Expires', '0');
        try {
          const fileName = PAGE_MAP[ctx.path];
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

    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.get({
          hostname: '127.0.0.1',
          port: 13000,
          path: '/api/auth:check',
          headers: { 'Authorization': 'Bearer ' + token },
          timeout: 3000,
        }, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
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
