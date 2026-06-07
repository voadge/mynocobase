'use strict';

const { Plugin } = require('@nocobase/server');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AMAP_KEY = '31e73c1d12b2848e7bd964774782a954';

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

    // Geocode + IP locate proxy (via Amap, server-side to respect IP whitelist)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || !(ctx.path.endsWith('/geocode') || ctx.path.endsWith('/locate'))) {
        return await next();
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

    // Dashboard snapshot - aggregated data for people dynamic page
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/dashboard-snapshot') {
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
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Search API - AMAP inputtips proxy (no auth check, page-level auth already done by nginx)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/search') {
        return await next();
      }
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json; charset=utf-8';
      var amapKey = '31e73c1d12b2848e7bd964774782a954';
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
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/reverse-geocode') {
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
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/weather-qw') {
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
      if (ctx.method !== 'GET' || ctx.path !== '/api/__pd__/reverse-geocode-qw') {
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
