import { HtmlRenderer } from '../services/html-renderer';

export function registerRenderRoute(app: any, db: any) {
  const renderer = new HtmlRenderer();

  app.use(async (ctx: any, next: () => Promise<void>) => {
    if (ctx.method !== 'GET') return next();
    const reqPath = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
    const match = reqPath.match(/^\/__pt__\/print\/([^/]+)\/([^/]+)$/);
    if (!match) return next();

    const [, templateId, recordId] = match;
    const tpl = await db.getRepository('print_templates').findOne({ filterByTk: templateId });
    if (!tpl || !tpl.enabled) {
      ctx.status = 404; ctx.body = 'Template not found or disabled';
      return;
    }

    const schema = tpl.templateSchema;
    const hasContent = schema?.blocks?.length > 0 || schema?.elements?.length > 0;
    if (!hasContent) {
      ctx.status = 404; ctx.body = 'Template has no content configured';
      return;
    }

    const repo = db.getRepository(tpl.mainCollection);
    const appends = extractAppendsFromTemplate(tpl);

    const record = await repo.findOne({ filterByTk: recordId, appends });
    if (!record) {
      ctx.status = 404; ctx.body = 'Record not found';
      return;
    }

    const data: any = { [tpl.mainCollection]: record, _user: ctx.state.user, _now: new Date() };
    for (const ds of tpl.extraDataSources || []) {
      const r = await fetchExtraData(db, ds, recordId);
      data[ds.alias] = r;
    }

    const html = renderer.render(tpl, data);
    ctx.withoutDataWrapping = true;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = html;
  }, { before: 'dataSource' });
}

function extractAppendsFromTemplate(tpl: any): string[] {
  const seen = new Set<string>();
  const appends: string[] = [];

  const schema = tpl.templateSchema;
  if (schema?.blocks) {
    for (const block of schema.blocks) {
      // Primary source: block.appends (editor populates this with root relation names)
      for (const a of block.appends || []) {
        if (a && !seen.has(a)) { seen.add(a); appends.push(a); }
      }
      // Also check fields for any root relation names not in appends
      for (const f of block.fields || []) {
        const root = (f.name || '').split('.')[0];
        if (root && !seen.has(root)) {
          // If the field is a relation or references a relation path, add root
          if (f.isRelation || f.name.includes('.')) {
            seen.add(root);
            appends.push(root);
          }
        }
      }
    }
  }

  for (const c of tpl.excelColumns || []) {
    const f = (c.field || '').split('.')[0];
    if (f && !seen.has(f)) { seen.add(f); appends.push(f); }
  }

  return appends;
}

async function fetchExtraData(db: any, ds: any, mainId: string) {
  const repo = db.getRepository(ds.collectionName);
  const filter = ds.linkField ? { [ds.linkField]: mainId } : ds.filter;
  if (ds.queryType === 'findOne') {
    return repo.findOne({ filter, appends: ds.appends });
  }
  return repo.find({ filter, appends: ds.appends, sort: ds.sort });
}
