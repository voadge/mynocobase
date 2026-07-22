/**
 * Page serving middleware
 */
import fs from 'fs';
import path from 'path';
import type { Context } from '@nocobase/server';
import { isAuthenticated } from './auth';

const PAGE_MAP: Record<string, string> = {
  '/__dh__': 'index.html',
  '/__tb__': '百宝箱.html',
  '/__fp__': '行程发票报销助手.html',
  '/__tp__': '智能排版打印助手.html',
  '/__gf__': 'geofence-manager.html',
  '/__pd__': '人员动态.html',
};

const STORAGE_DIR = '/app/nocobase/storage/dashboard';

export function registerPageRoutes(app: any): void {
  app.use(async (ctx: Context, next: () => Promise<void>) => {
    ctx.state.reqPath = ctx.path.replace(/^\/api/, '');
    if (ctx.method !== 'GET' || !PAGE_MAP[ctx.state.reqPath]) {
      return await next();
    }
      return await next();
    }

    if (await isAuthenticated(ctx)) {
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