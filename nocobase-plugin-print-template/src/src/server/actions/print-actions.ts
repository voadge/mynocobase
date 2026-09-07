import type { Plugin } from '@nocobase/server';
import { ExcelExporter } from '../services/excel-exporter';

const MAX_BATCH = 5000;

export function registerPrintActions(app: Plugin['app'], db: any) {
  const exporter = new ExcelExporter(app, db);

  return {
    async printTemplateExport(ctx: any) {
      const { selectedIds, resourceName } = ctx.action.params;
      if (!selectedIds?.length) ctx.throw(400, '请选择记录');
      if (selectedIds.length > MAX_BATCH) ctx.throw(400, `单次导出不能超过 ${MAX_BATCH} 条`);

      const tpl = await db.getRepository('print_templates').findOne({
        filter: { mainCollection: resourceName, enabled: true },
        sort: '-createdAt',
      });
      if (!tpl) ctx.throw(400, '该集合无可用模板');

      const buf = await exporter.export(tpl, selectedIds);
      ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      ctx.attachment(`${sanitize(tpl.name)}_batch_${Date.now()}.xlsx`);
      ctx.body = buf;
    },

    async printTemplateExportItem(ctx: any) {
      const { filterByTk, resourceName } = ctx.action.params;
      const tpl = await db.getRepository('print_templates').findOne({
        filter: { mainCollection: resourceName, enabled: true },
        sort: '-createdAt',
      });
      if (!tpl) ctx.throw(400, '该集合无可用模板');

      const buf = await exporter.export(tpl, [filterByTk]);
      ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      ctx.attachment(`${sanitize(tpl.name)}_${filterByTk}.xlsx`);
      ctx.body = buf;
    },

    async printTemplatePreview(ctx: any) {
      const { filterByTk, resourceName } = ctx.action.params;
      const tpl = await db.getRepository('print_templates').findOne({
        filter: { mainCollection: resourceName, enabled: true },
        sort: '-createdAt',
      });
      if (!tpl?.templateSchema?.elements?.length && !tpl?.templateSchema?.blocks?.length) {
        ctx.throw(400, '该模板未配置打印模板');
      }
      ctx.body = { type: 'redirect', url: `/__pt__/print/${tpl.id}/${filterByTk}` };
    },
  };
}

function sanitize(name: string) {
  return name.replace(/[\\/:*?<>|"]/g, '_').slice(0, 100);
}
