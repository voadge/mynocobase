import https from 'https';
import http from 'http';
import fs from 'fs';
import type { Context } from '@nocobase/server';

const JWT_PATH = '/app/nocobase/node_modules/@nocobase/plugin-print-template/node_modules/jsonwebtoken';
const APP_KEY_PATH = '/run/secrets/app_key';
const WX_API = 'https://api.weixin.qq.com/sns/jscode2session';

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

export function registerMpLoginRoutes(app: any): void {
  // POST /api/__pd__/mp-login - exchange code for JWT token
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/mp-login') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const { code } = ctx.request.body || {};
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

      const wxResp = await wxRequest(`${WX_API}?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`);
      if (wxResp.errcode) {
        ctx.body = { code: -1, msg: `微信登录失败: ${wxResp.errmsg || wxResp.errcode}` };
        return;
      }

      const openid: string = wxResp.openid;
      if (!openid) {
        ctx.body = { code: -1, msg: '微信返回缺少openid' };
        return;
      }

      // Look up user by WeChat field (stores openid)
      const repo = ctx.db.getRepository('users');
      const user = await repo.findOne({ filter: { WeChat: openid } });
      if (!user) {
        // Not bound yet - return openid for binding
        ctx.body = { code: 0, data: { openid, needBind: true } };
        return;
      }

      // Generate JWT
      const appKey = readAppKey();
      const jwt = getJwt();
      const token = jwt.sign(
        { userId: user.id, role: user.role || 'member' },
        appKey,
        { expiresIn: '30d' }
      );

      ctx.body = {
        code: 0,
        data: {
          token,
          user: {
            id: user.id,
            nickname: user.nickname,
            email: user.email,
            phone: user.phone,
          },
        },
      };
    } catch (e) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // GET /api/__pd__/users-list - list available NocoBase users for Mini Program binding
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/users-list') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const repo = ctx.db.getRepository('users');
      const users = await repo.find({
        fields: ['id', 'nickname', 'email', 'phone'],
        appends: ['departments'],
        sort: ['nickname'],
      });
      const list = users.map((u: any) => ({
        id: u.id,
        nickname: u.nickname,
        email: u.email,
        phone: u.phone,
        department: u.departments && u.departments.length > 0 ? u.departments[0].name : '',
      }));
      ctx.body = { code: 0, data: { users: list } };
    } catch (e) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // POST /api/__pd__/bind-openid - bind openid to user's WeChat field
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__pd__/bind-openid') {
      return await next();
    }
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const { openid, userId } = ctx.request.body || {};
      if (!openid || !userId) {
        ctx.body = { code: -1, msg: '缺少参数openid或userId' };
        return;
      }

      // Verify the userId exists
      const userRepo = ctx.db.getRepository('users');
      const user = await userRepo.findOne({ filterByTk: userId });
      if (!user) {
        ctx.body = { code: -1, msg: '所选用户不存在' };
        return;
      }

      // Update user's WeChat field with openid
      await userRepo.update({
        filterByTk: userId,
        values: { WeChat: openid },
      });

      // Generate JWT so user can proceed immediately
      const appKey = readAppKey();
      const jwt = getJwt();
      const token = jwt.sign(
        { userId, role: user.role || 'member' },
        appKey,
        { expiresIn: '30d' }
      );

      ctx.body = {
        code: 0,
        data: {
          success: true,
          token,
          user: {
            id: user.id,
            nickname: user.nickname,
            email: user.email,
            phone: user.phone,
          },
        },
      };
    } catch (e) {
      ctx.body = { code: -1, msg: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });
}
