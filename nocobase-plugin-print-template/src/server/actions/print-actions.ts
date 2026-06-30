import { PrintTemplate } from '../types';
import { ExcelExporter } from '../services/excel-exporter';
import { HtmlRenderer } from '../services/html-renderer';

export function registerPrintActions(app: any, db: any) {
  const exporter = new ExcelExporter(app, db);
  const renderer = new HtmlRenderer();
  const MAX_BATCH = 5000;

  app.resourceManager.registerActionHandlers({
    'printTemplateExport': async (ctx: any, next: any) => {
      try {
        const { selectedIds, resourceName } = ctx.action.params;
        if (!selectedIds?.length) throw new BusinessError('请选择记录');
        if (selectedIds.length > MAX_BATCH) throw new BusinessError('单次导出不能超过 ' + MAX_BATCH + ' 条，当前 ' + selectedIds.length + ' 条');

        const tpl = await getEnabledTemplate(db, resourceName);
        if (!tpl) throw new BusinessError('该集合无可用模板');

        const buf = await exporter.export(tpl, selectedIds);
        ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        ctx.attachment(sanitizeFilename(tpl.name) + '_batch_' + Date.now() + '.xlsx');
        ctx.body = buf;
      } catch (err) {
        handleActionError(ctx, err);
      }
    },

    'printTemplateExportItem': async (ctx: any, next: any) => {
      try {
        const { filterByTk, resourceName } = ctx.action.params;
        const tpl = await getEnabledTemplate(db, resourceName);
        if (!tpl) throw new BusinessError('该集合无可用模板');

        const buf = await exporter.export(tpl, [filterByTk]);
        ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        ctx.attachment(sanitizeFilename(tpl.name) + '_' + filterByTk + '.xlsx');
        ctx.body = buf;
      } catch (err) {
        handleActionError(ctx, err);
      }
    },

    'printTemplatePreview': async (ctx: any, next: any) => {
      try {
        const { filterByTk, resourceName } = ctx.action.params;
        const tpl = await getEnabledTemplate(db, resourceName);
        if (!tpl?.templateSchema?.elements?.length) throw new BusinessError('该模板未配置打印模板');
        ctx.body = { type: 'redirect', url: '/__pt__/print/' + tpl.id + '/' + filterByTk };
      } catch (err) {
        handleActionError(ctx, err);
      }
    },
  });
}

async function getEnabledTemplate(db: any, collection: string): Promise<PrintTemplate | null> {
  return db.getRepository('print_templates').findOne({
    filter: { mainCollection: collection, enabled: true },
    sort: '-createdAt',
  });
}

class BusinessError extends Error {
  constructor(message: string) { super(message); this.name = 'BusinessError'; }
}

function handleActionError(ctx: any, err: Error) {
  ctx.logger?.error?.(['[print-template]', err]);
  if (err instanceof BusinessError) {
    ctx.status = 400; ctx.body = { error: err.message };
  } else {
    ctx.status = 500; ctx.body = { error: '导出失败，请联系管理员' };
  }
}

function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?<>|]/g, '_').slice(0, 100);
}
