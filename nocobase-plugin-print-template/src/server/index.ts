import { Plugin } from '@nocobase/server';
import { PrintTemplateCollection } from './collections/print-templates';
import { registerPrintActions } from './actions/print-actions';
import { registerAdminRoutes } from './routes/admin';
import { registerRenderRoute } from './routes/render';
import { registerApiRoutes } from './routes/api';

class PrintTemplatePlugin extends Plugin {
  async load() {
    const app = this.app;
    const db = this.db;

    (db as any).collection(PrintTemplateCollection);
    await (db as any).sync();

    registerPrintActions(app, db);
    registerAdminRoutes(app);
    registerRenderRoute(app, db);
    registerApiRoutes(app, db);
  }
}

module.exports = PrintTemplatePlugin;
