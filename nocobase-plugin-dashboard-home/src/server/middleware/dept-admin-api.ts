import type { Context } from '@nocobase/server';
import { isAuthenticated } from './auth';
import { resolveApproversByRoute } from './dept-helpers';

type Db = any;
type PluginInstance = { db: Db; isAuthenticated: typeof isAuthenticated };

export function registerDeptAdminApi(app: any, plugin: PluginInstance): void {
  const { db } = plugin;

  async function requireAdmin(ctx: Context): Promise<boolean> {
    if (!await plugin.isAuthenticated(ctx)) {
      ctx.status = 401;
      ctx.body = 'Unauthorized';
      return false;
    }
    const user = ctx.state.currentUser;
    const roles = user.roles ? user.roles.map((r: any) => r.name) : [];
    if (roles.indexOf('admin') === -1 && roles.indexOf('root') === -1) {
      ctx.status = 403;
      ctx.body = 'Forbidden';
      return false;
    }
    return true;
  }

  // === ACL Rules CRUD ===

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/acl-rules') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const filter: any = {};
      if (ctx.query.departmentId) filter.departmentId = parseInt(ctx.query.departmentId);
      const rules = await db.getRepository('department_acl_rules').find({
        filter,
        appends: ['department', 'role'],
        sort: ['departmentId', 'priority', 'id'],
      });
      ctx.body = { data: rules };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    const m = ctx.state.reqPath?.match(/^\/__da__\/acl-rules\/(\d+)$/);
    if (ctx.method !== 'GET' || !m) return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const id = parseInt(m[1]);
      const rule = await db.getRepository('department_acl_rules').findOne({ filterByTk: id, appends: ['department', 'role'] });
      ctx.body = { data: rule };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__da__/acl-rules') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const values = ctx.request.body || {};
      const created = await db.getRepository('department_acl_rules').create({ values });
      ctx.body = { data: created };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    const m = ctx.state.reqPath?.match(/^\/__da__\/acl-rules\/(\d+)$/);
    if (ctx.method !== 'PUT' || !m) return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const id = parseInt(m[1]);
      const values = ctx.request.body || {};
      await db.getRepository('department_acl_rules').update({ filterByTk: id, values });
      ctx.body = { status: 'ok' };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    const m = ctx.state.reqPath?.match(/^\/__da__\/acl-rules\/(\d+)$/);
    if (ctx.method !== 'DELETE' || !m) return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const id = parseInt(m[1]);
      await db.getRepository('department_acl_rules').destroy({ filterByTk: id });
      ctx.body = { status: 'ok' };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // === Approval Routes CRUD ===

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/approval-routes') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const routes = await db.getRepository('department_approval_routes').find({
        appends: ['department', 'role'],
        sort: ['levelKey', 'id'],
      });
      ctx.body = { data: routes };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    const m = ctx.state.reqPath?.match(/^\/__da__\/approval-routes\/(\d+)$/);
    if (ctx.method !== 'GET' || !m) return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const id = parseInt(m[1]);
      const route = await db.getRepository('department_approval_routes').findOne({ filterByTk: id, appends: ['department', 'role'] });
      ctx.body = { data: route };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'POST' || ctx.state.reqPath !== '/__da__/approval-routes') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const values = ctx.request.body || {};
      const created = await db.getRepository('department_approval_routes').create({ values });
      ctx.body = { data: created };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    const m = ctx.state.reqPath?.match(/^\/__da__\/approval-routes\/(\d+)$/);
    if (ctx.method !== 'PUT' || !m) return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const id = parseInt(m[1]);
      const values = ctx.request.body || {};
      await db.getRepository('department_approval_routes').update({ filterByTk: id, values });
      ctx.body = { status: 'ok' };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    const m = ctx.state.reqPath?.match(/^\/__da__\/approval-routes\/(\d+)$/);
    if (ctx.method !== 'DELETE' || !m) return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const id = parseInt(m[1]);
      await db.getRepository('department_approval_routes').destroy({ filterByTk: id });
      ctx.body = { status: 'ok' };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // === Departments & Roles for dropdowns (server-side, avoids NocoBase API auth issues) ===

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/departments') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const depts = await db.getRepository('departments').find({ sort: ['title'] });
      ctx.body = { data: depts };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/roles') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const roles = await db.getRepository('roles').find({ sort: ['title'] });
      ctx.body = { data: roles };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // === Collections & actions for dropdowns ===

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/collections') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const hasChinese = (s: string) => /[\u4e00-\u9fff]/.test(s);
      const collectionFields = (col: any): string[] => {
        if (!col) return [];
        const names = new Set<string>(Array.from(col.fields.keys()));
        col.fields.forEach((f: any) => {
          const fk = f.options?.foreignKey;
          if (fk && typeof fk === 'string') names.add(fk);
        });
        return Array.from(names);
      };
      let items: { name: string; title: string; actions: string[]; fields: string[] }[] = [];
      try {
        const sysCols = await db.getRepository('collections').find({
          filter: { isThrough: false },
        });
        items = sysCols.map((c: any) => {
          const col = db.collections.get(c.name);
          return {
            name: c.name,
            title: c.title || c.name,
            actions: ['*', 'create', 'view', 'update', 'delete', 'list', 'get'],
            fields: collectionFields(col),
          };
        });
      } catch (_e) {
        db.collections.forEach((col: any) => {
          if (col.isThrough && col.isThrough()) return;
          items.push({
            name: col.name,
            title: col.options?.title || col.name,
            actions: ['*', 'create', 'view', 'update', 'delete', 'list', 'get'],
            fields: collectionFields(col),
          });
        });
      }
      items = items.filter(c => hasChinese(c.title) || hasChinese(c.name));
      items.sort((a, b) => a.title.localeCompare(b.title));
      ctx.body = { data: items };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });

  // === Resolve approvers by route (forward mapping) ===

  app.use(async (ctx: Context, next: () => Promise<void>) => {
    if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__da__/resolve-approvers') return await next();
    if (!await requireAdmin(ctx)) return;
    ctx.withoutDataWrapping = true;
    ctx.type = 'application/json; charset=utf-8';
    try {
      const deptId = parseInt(ctx.query.departmentId) || 0;
      const levelKey = (ctx.query.levelKey as string) || '';
      if (!deptId || !levelKey) {
        ctx.status = 400;
        ctx.body = { error: 'departmentId and levelKey are required' };
        return;
      }
      const approvers = await resolveApproversByRoute(deptId, levelKey, db);
      ctx.body = { data: approvers };
    } catch (e) {
      ctx.status = 500;
      ctx.body = { error: e.message };
    }
  }, { tag: 'dashboard-home', before: 'dataSource' });
}
