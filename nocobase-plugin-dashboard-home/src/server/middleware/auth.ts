/**
 * Authentication middleware for Dashboard Home plugin
 */
import http from 'http';
import type { Context } from '@nocobase/server';

export async function isAuthenticated(ctx: Context): Promise<boolean> {
  if (ctx.state.currentUser) return true;

  const authHeader = ctx.get('Authorization') || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    token = ctx.cookies.get('nb_token') || ctx.cookies.get('NOCOBASE_token');
  }
  if (!token) return false;

  // JWT tokens via auth:check
  try {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: 13000,
        path: '/api/auth:check',
        headers: { 'Authorization': 'Bearer ' + token },
        timeout: 5000,
      }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });

    if (result.status === 200) {
      try {
        const data = JSON.parse(result.body);
        const userData = data && data.data ? data.data : data;
        if (userData && userData.id) {
          ctx.state.currentUser = userData;
          return true;
        }
      } catch (e) {}
      return false;
    }
  } catch (e) {}

  return false;
}

/**
 * Auth check endpoint for nginx auth_request
 */
export async function authCheckHandler(ctx: Context): Promise<void> {
  ctx.withoutDataWrapping = true;
  if (await isAuthenticated(ctx)) {
    ctx.status = 200;
    ctx.body = 'OK';
  } else {
    ctx.status = 401;
    ctx.body = 'Unauthorized';
  }
}