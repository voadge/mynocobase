/**
 * Mini Program login routes - code exchange, user list, openid binding,
 * server-side geofence evaluation, and authoritative clock-in.
 * 1-to-1 binding: one WeChat openid = one NocoBase user
 */
import https from 'https';
import fs from 'fs';
import { convertToGCJ02 } from '../utils/geo';
import * as auth from './auth';
// import type { Context } from '@nocobase/server';

const JWT_PATH = '/app/nocobase/node_modules/@nocobase/plugin-print-template/node_modules/jsonwebtoken';
const APP_KEY_PATH = '/run/secrets/app_key';
const WX_JSCODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

function readAppKey(): string {
  return fs.readFileSync(APP_KEY_PATH, 'utf8').trim();
}

function getJwt() {
  return require(JWT_PATH);
}

function wxRequest(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getWxOpenid(appId: string, appSecret: string, code: string): Promise<string | null> {
  const resp = await wxRequest(
    `${WX_JSCODE2SESSION_URL}?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`
  );
  if (resp.errcode || !resp.openid) {
    return null;
  }
  return resp.openid;
}

// ----------------------------------------------------------------------------
// Geofence helpers (server-side, shared single source of truth)
// ----------------------------------------------------------------------------
const _fenceCache: { time: number; data: any[] | null } = { time: 0, data: null };

async function loadFences(db: any): Promise<any[]> {
  const now = Date.now();
  if (_fenceCache.data && (now - _fenceCache.time) < 300000) return _fenceCache.data;
  const fences = await db.getRepository('geofences').find({ filter: { is_active: true }, sort: 'sort' });
  _fenceCache.data = fences || [];
  _fenceCache.time = now;
  return _fenceCache.data;
}

function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistance(lat: number, lon: number, lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dAC = haversineDist(lat, lon, lat1, lon1);
  const dBC = haversineDist(lat, lon, lat2, lon2);
  const dAB = haversineDist(lat1, lon1, lat2, lon2);
  if (dAB < 1) return dAC;
  const cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
  const cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
  if (cosA <= 0) return dAC;
  if (cosB <= 0) return dBC;
  const s = (dAC + dBC + dAB) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - dAC) * (s - dBC) * (s - dAB)));
  return area * 2 / dAB;
}

function distanceToPolyline(lat: number, lon: number, polyline: number[][]): number {
  let minDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const dist = pointToSegmentDistance(lat, lon, polyline[i][1], polyline[i][0], polyline[i + 1][1], polyline[i + 1][0]);
    if (dist < minDist) minDist = dist;
  }
  return Math.round(minDist);
}

async function checkFenceAt(db: any, lat: number, lng: number) {
  const fences = await loadFences(db);
  if (!fences || fences.length === 0) {
    return { inside: true, matched: false, distance: null, fenceId: null, fenceName: null, bufferRadius: null };
  }
  let minDist = Infinity, matchedFence: any = null;
  for (const fence of fences) {
    if (fence.bbox_min_lat != null && fence.bbox_max_lat != null &&
      fence.bbox_min_lng != null && fence.bbox_max_lng != null) {
      const bufDeg = (fence.buffer_radius || 200) / 111320;
      const bufDegLng = bufDeg / Math.cos(lat * Math.PI / 180);
      if (lat < fence.bbox_min_lat - bufDeg || lat > fence.bbox_max_lat + bufDeg ||
        lng < fence.bbox_min_lng - bufDegLng || lng > fence.bbox_max_lng + bufDegLng) {
        continue;
      }
    }
    let polyline: number[][];
    try { polyline = JSON.parse(fence.polyline_coords); } catch (e) { continue; }
    if (!Array.isArray(polyline) || polyline.length < 2) continue;
    const dist = distanceToPolyline(lat, lng, polyline);
    if (dist < minDist) { minDist = dist; matchedFence = fence; }
  }
  if (!matchedFence) {
    return { inside: true, matched: false, distance: null, fenceId: null, fenceName: null, bufferRadius: null };
  }
  const bufferRadius = matchedFence.buffer_radius || 200;
  const inside = minDist <= bufferRadius;
  return {
    inside,
    matched: true,
    distance: Math.round(minDist),
    fenceId: matchedFence.id,
    fenceName: matchedFence.fence_name,
    bufferRadius,
  };
}

export function registerMpLoginRoutes(app: any): void {
  // POST /api/__pd__/mp-login - exchange code for JWT token
  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/mp-login') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const { code, wxNickname } = ctx.request.body || {};
      if (!code) {
        ctx.body = { code: -1, msg: '缺少参数code' };
        return;
      }
      const appId = 'wx88d11e7c8fd8c950';
      const appSecret = process.env.WX_APP_SECRET;
      if (!appSecret) {
        ctx.body = { code: -1, msg: 'WX_APP_SECRET not configured' };
        return;
      }
      const openid = await getWxOpenid(appId, appSecret, code);
      if (!openid) {
        ctx.body = { code: -1, msg: '微信登录失败' };
        return;
      }
      const repo = ctx.db.getRepository('users');
      const user = await repo.findOne({ filter: { WeChat: openid } });
      if (!user) {
        ctx.body = { code: 0, data: { openid, wxNickname: wxNickname || '', needBind: true } };
        return;
      }
      const appKey = readAppKey();
      const jwt = getJwt();
      const token = jwt.sign({ userId: user.id, role: user.role || 'member' }, appKey, { expiresIn: '30d' });
      ctx.body = {
        code: 0,
        data: {
          token,
          user: { id: user.id, nickname: user.nickname, email: user.email, phone: user.phone, wxNickname: user.WeChatNickname || '' },
        },
      };
    } catch (e: any) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // GET /api/__pd__/users-list - list available NocoBase users for binding
  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/users-list') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const repo = ctx.db.getRepository('users');
      const users = await repo.find({
        fields: ['id', 'nickname', 'email', 'phone', 'WeChat'],
        appends: ['departments'],
        sort: ['nickname'],
      });
      const list = users
        .filter((u: any) => !u.WeChat)
        .map((u: any) => ({
          id: u.id,
          nickname: u.nickname,
          email: u.email,
          phone: u.phone,
          department: u.departments && u.departments.length > 0 ? u.departments[0].name : '',
          bound: !!u.WeChat,
        }));
      ctx.body = { code: 0, data: { users: list } };
    } catch (e: any) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // POST /api/__pd__/bind-openid - 1-to-1 bind openid to user's WeChat field
  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/bind-openid') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const { openid, userId, wxNickname } = ctx.request.body || {};
      if (!openid || !userId) {
        ctx.body = { code: -1, msg: '缺少参数openid或userId' };
        return;
      }
      const userRepo = ctx.db.getRepository('users');
      const existingUser = await userRepo.findOne({ filter: { WeChat: openid } });
      if (existingUser && String(existingUser.id) !== String(userId)) {
        ctx.body = { code: -1, msg: '该微信已绑定账号「' + existingUser.nickname + '」，请先解绑后再绑定' };
        return;
      }
      const user = await userRepo.findOne({ filterByTk: userId });
      if (!user) {
        ctx.body = { code: -1, msg: '所选用户不存在' };
        return;
      }
      if (user.WeChat && user.WeChat !== openid) {
        await userRepo.update({ filterByTk: userId, values: { WeChat: null, WeChatNickname: null } });
      }
      await userRepo.update({
        filterByTk: userId,
        values: { WeChat: openid, WeChatNickname: wxNickname || '' },
      });
      const appKey = readAppKey();
      const jwt = getJwt();
      const token = jwt.sign({ userId, role: user.role || 'member' }, appKey, { expiresIn: '30d' });
      ctx.body = {
        code: 0,
        data: {
          success: true,
          token,
          user: { id: user.id, nickname: user.nickname, email: user.email, phone: user.phone, wxNickname: wxNickname || '' },
        },
      };
    } catch (e: any) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // GET /api/__pd__/mp-fence-check - server-side geofence evaluation (display use)
  // Accepts cs=gcj02|wgs84 (default gcj02) for coordinate system normalization (C3/C4)
  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/mp-fence-check') {
      return await next();
    }
    if (!(await (auth as any).isAuthenticated(ctx))) { ctx.status = 401; ctx.body = 'Unauthorized'; return; }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const rawLat = parseFloat(ctx.query.lat), rawLng = parseFloat(ctx.query.lng);
      if (isNaN(rawLat) || isNaN(rawLng)) { ctx.body = { code: -1, msg: '缺少有效经纬度' }; return; }
      const cs = (ctx.query.cs || 'gcj02') as 'gcj02' | 'wgs84';
      const [lat, lng] = convertToGCJ02(rawLat, rawLng, cs);
      const verdict = await checkFenceAt(ctx.db, lat, lng);
      ctx.body = { code: 0, data: verdict };
    }
    catch (e: any) { ctx.body = { code: -1, msg: e.message }; }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // POST /api/__pd__/mp-attendance-submit - authoritative clock-in (server computes fence)
  // Accepts cs in body for coordinate system normalization (C3/C4)
  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/mp-attendance-submit') {
      return await next();
    }
    if (!(await (auth as any).isAuthenticated(ctx))) { ctx.status = 401; ctx.body = 'Unauthorized'; return; }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const body = ctx.request.body || {};
      const user = ctx.state.currentUser;
      if (!user || !user.id) { ctx.body = { code: -1, msg: '未识别用户' }; return; }
      ctx.state.user = user;
      if (ctx.db && ctx.db.context) ctx.db.context.user = user;
      const isLeave = (body.check_type === '请假' || body.check_type === '调休' || body.check_type === '出差');
      if (!body.check_type) { ctx.body = { code: -1, msg: '缺少打卡类型' }; return; }
      if (isLeave && !body.reason) { ctx.body = { code: -1, msg: '请填写事由说明' }; return; }

      const cs = (body.cs || 'gcj02') as 'gcj02' | 'wgs84';
      const rawLat = body.latitude != null ? parseFloat(body.latitude) : null;
      const rawLng = body.longitude != null ? parseFloat(body.longitude) : null;
      const validLoc = rawLat != null && rawLng != null && !isNaN(rawLat) && !isNaN(rawLng);
      const [lat, lng] = validLoc ? convertToGCJ02(rawLat!, rawLng!, cs) : [null as any, null as any];

      const verdict = validLoc ? await checkFenceAt(ctx.db, lat, lng) : null;

      if (!isLeave && verdict && verdict.matched && !verdict.inside) {
        ctx.body = { code: -1, msg: '⛔ 不在打卡围栏内（距围栏 ' + verdict.distance + 'm）', data: { verdict } };
        return;
      }

      if (validLoc) {
        const recent = await ctx.db.getRepository('attendance_records').find({
          filter: { createdById: user.id, check_type: body.check_type, check_time: { $gte: new Date(Date.now() - 120000).toISOString() } },
          sort: '-check_time', pageSize: 1,
        });
        if (recent && recent.length) {
          ctx.body = { code: 0, duplicated: true, data: recent[0], verdict };
          return;
        }
      }

      const vals: Record<string, any> = {
        check_type: body.check_type,
        check_time: body.check_time || new Date().toISOString(),
        gps_state: body.gps_state || (validLoc ? 'ok' : 'fail'),
        workflow_status: isLeave ? 'pending' : 'normal',
        createdById: user.id,
      };
      if (validLoc) {
        vals.latitude = lat;
        vals.longitude = lng;
        vals.gps_accuracy = Math.round(parseFloat(body.gps_accuracy) || 0);
      }
      if (verdict && verdict.matched) {
        vals.geofence_inside = verdict.inside;
        vals.geofence_distance = verdict.distance;
        vals.geofence_id = verdict.fenceId;
      }
      const methods: string[] = [];
      if (validLoc && body.gps_state === 'ok') methods.push('gps');
      if (body.photo_hash) methods.push('photo_only');
      vals.verify_status = methods.length ? methods.join('+') : 'none';
      if (body.device_fingerprint) vals.device_fingerprint = String(body.device_fingerprint).substring(0, 255);
      if (isLeave) {
        vals.reason = body.reason || '';
        vals.start_date = body.start_date || new Date().toISOString();
        vals.end_date = body.end_date || new Date().toISOString();
      }
      const repo = ctx.db.getRepository('attendance_records');
      const record = await repo.create({ values: vals });
      try {
        if (!record.createdById || record.createdById !== user.id) {
          await repo.update({ filterByTk: record.id, values: { createdById: user.id } });
          record.createdById = user.id;
        }
      } catch (e) { /* non-fatal */ }
      ctx.body = { code: 0, data: record, verdict };
    }
    catch (e: any) {
      ctx.status = 500;
      ctx.body = { code: -1, msg: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });
}
