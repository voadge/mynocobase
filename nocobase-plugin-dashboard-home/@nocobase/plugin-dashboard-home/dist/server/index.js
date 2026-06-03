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

    // Geocode proxy (uses photon.komoot.io, accessible from China)
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || ctx.path !== '/api/__gf__/geocode') {
        return await next();
      }
      if (!await this.isAuthenticated(ctx)) {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
        return;
      }
      var q = ctx.query.q;
      if (!q) { ctx.body = { features: [] }; return; }
      try {
        var url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=7&lang=zh';
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
        ctx.body = { error: e.message };
      }
    });

    // Page serving middleware
    this.app.use(async (ctx, next) => {
      if (ctx.method !== 'GET' || !PAGE_MAP[ctx.path]) {
        return await next();
      }

      if (await this.isAuthenticated(ctx)) {
        ctx.withoutDataWrapping = true;
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
        ctx.redirect('/signin?redirect=' + ctx.path);
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
