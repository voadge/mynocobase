import fs from 'fs';
import path from 'path';

const STORAGE_DIR = '/app/nocobase/storage/print-template';
const PLUGIN_DIR = '/app/nocobase/node_modules/@nocobase/plugin-print-template';

function serveFile(ctx: any, filePath: string) {
  ctx.withoutDataWrapping = true;
  ctx.type = 'text/html; charset=utf-8';
  try {
    ctx.body = fs.readFileSync(filePath, 'utf-8');
  } catch {
    ctx.status = 404;
    ctx.body = 'Page not found';
  }
}

export function registerAdminRoutes(app: any) {
  // Admin pages (list + edit)
  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'GET') return next();
    const reqPath = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');

    if (reqPath === '/__pt__/admin' || reqPath === '/__/admin') {
      serveFile(ctx, path.join(STORAGE_DIR, 'list.html'));
      return;
    }
    if (reqPath.startsWith('/__pt__/admin/edit') || reqPath.startsWith('/__/admin/edit')) {
      serveFile(ctx, path.join(STORAGE_DIR, 'edit.html'));
      return;
    }
    if (reqPath === '/__pt__/package.json' || reqPath === '/__/package.json') {
      ctx.withoutDataWrapping = true;
      ctx.type = 'application/json';
      try {
        ctx.body = fs.readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf-8');
      } catch {
        ctx.status = 404;
        ctx.body = 'Not found';
      }
      return;
    }

    return next();
  }, { tag: 'print-template-static', before: 'dataSource' });
}
