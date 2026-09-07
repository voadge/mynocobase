import type { Plugin } from '@nocobase/server';
import { HtmlRenderer } from '../services/html-renderer';

export function registerRenderRoute(app: Plugin['app'], db: any) {
  const renderer = new HtmlRenderer();

  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'GET') return next();
    const reqPath = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
    const match = reqPath.match(/^\/__pt__\/print\/([^/]+)\/([^/]+)$/);
    if (!match) return next();

    const [, templateId, recordId] = match;
    const tpl = await db.getRepository('print_templates').findOne({ filterByTk: templateId, filter: { enabled: true } });
    if (!tpl) {
      ctx.status = 404; ctx.body = 'Template not found or disabled';
      return;
    }

    const schema = tpl.templateSchema;
    const hasContent = schema?.blocks?.length > 0 || schema?.elements?.length > 0;
    if (!hasContent) {
      ctx.status = 404; ctx.body = 'Template has no content configured';
      return;
    }

    const appends = extractAppends(tpl);
    const record = await db.getRepository(tpl.mainCollection).findOne({ filterByTk: recordId, appends });
    if (!record) {
      ctx.status = 404; ctx.body = 'Record not found';
      return;
    }

    const data: any = { [tpl.mainCollection]: record, _user: ctx.state.user, _now: new Date() };
    for (const ds of tpl.extraDataSources || []) {
      const repo = db.getRepository(ds.collectionName);
      const filter = ds.linkField ? { [ds.linkField]: recordId } : (ds.filter || {});
      data[ds.alias] = ds.queryType === 'findOne'
        ? await repo.findOne({ filter, appends: ds.appends })
        : await repo.find({ filter, appends: ds.appends, sort: ds.sort });
    }

    ctx.withoutDataWrapping = true;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = renderer.render(tpl, data);
  }, { before: 'dataSource' });
}

function extractAppends(tpl: any): string[] {
  const seen = new Set<string>();
  const appends: string[] = [];
  const schema = tpl.templateSchema;
  if (schema?.blocks) {
    for (const block of schema.blocks) {
      for (const a of block.appends || []) {
        if (a && !seen.has(a)) { seen.add(a); appends.push(a); }
      }
      for (const f of block.fields || []) {
        const root = (f.name || '').split('.')[0];
        if (root && !seen.has(root) && (f.isRelation || f.name.includes('.'))) {
          seen.add(root); appends.push(root);
        }
      }
    }
  }
  for (const c of tpl.excelColumns || []) {
    const root = (c.field || '').split('.')[0];
    if (root && !seen.has(root)) { seen.add(root); appends.push(root); }
  }
  return appends;
}
