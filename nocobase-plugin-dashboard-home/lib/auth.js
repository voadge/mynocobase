'use strict';
const http = require('http');

// Unified auth check shared by all plugins.
// Token sources (in order): ctx.state.currentUser → Authorization header → cookies
//
// Usage:
//   const { isAuthenticated } = require('../lib/auth');
//   if (!await isAuthenticated(ctx)) { ctx.status = 401; return; }

async function isAuthenticated(ctx) {
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

module.exports = { isAuthenticated };

// ---- Env helpers ----
function getAmapKey() {
  return process.env.AMAP_KEY || '31e73c1d12b2848e7bd964774782a954';
}

function getFencePollInterval() {
  return parseInt(process.env.FENCE_POLL_INTERVAL || '30000');
}

module.exports.getAmapKey = getAmapKey;
module.exports.getFencePollInterval = getFencePollInterval;
