/**
 * Mini Program login routes - code exchange, user list, and openid binding
 * 1-to-1 binding: one WeChat openid = one NocoBase user
 */
import https from 'https';
import fs from 'fs';
// import type { Context } from '@nocobase/server';

const JWT_PATH = '/app/nocobase/node_modules/@nocobase/plugin-print-template/node_modules/jsonwebtoken';
const APP_KEY_PATH = '/run/secrets/app_key';
const WX_OAUTH_TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token';
const WX_USERINFO_URL = 'https://api.weixin.qq.com/sns/userinfo';

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

async function getWxUserInfo(appId: string, appSecret: string, code: string): Promise<{ openid: string; nickname: string } | null> {
  // Step1: exchange code for access_token
  const tokenResp = await wxRequest(
    `${WX_OAUTH_TOKEN_URL}?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`
  );
  if (tokenResp.errcode || !tokenResp.access_token || !tokenResp.openid) {
    return null;
  }
  // Step2: get user info
  const infoResp = await wxRequest(
    `${WX_USERINFO_URL}?access_token=${tokenResp.access_token}&openid=${tokenResp.openid}&lang=zh_CN`
  );
  if (infoResp.errcode || !infoResp.openid) {
    return { openid: tokenResp.openid, nickname: '' };
  }
  return { openid: infoResp.openid, nickname: infoResp.nickname || '' };
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
      const wxInfo = await getWxUserInfo(appId, appSecret, code);
      if (!wxInfo || !wxInfo.openid) {
        ctx.body = { code: -1, msg: '微信登录失败' };
        return;
      }
      const { openid, nickname: wxNickname } = wxInfo;
      const repo = ctx.db.getRepository('users');
      const user = await repo.findOne({ filter: { WeChat: openid } });
      if (!user) {
        ctx.body = { code: 0, data: { openid, wxNickname, needBind: true } };
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
      const list = users.map((u: any) => ({
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

      // 1-to-1 check: openid must not be bound to another user
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

      // If target user already has a different openid, clear it first
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
}
