import { Plugin } from '@nocobase/server';
import PrintTemplateCollection from './collections/print-templates';
import { registerMetadataActions } from './routes/api';
import { registerPrintActions } from './actions/print-actions';
import { registerAdminRoutes } from './routes/admin';
import { registerRenderRoute } from './routes/render';

class PrintTemplatePlugin extends Plugin {
  async load() {
    this.db.collection(PrintTemplateCollection);

    const metadataActions = registerMetadataActions(this.db);
    const printActions = registerPrintActions(this.app, this.db);

    this.app.resourceManager.define({
      name: 'print_templates',
      actions: { ...metadataActions, ...printActions },
    });

    this.app.acl.allow('print_templates', ['getCollections', 'getCollectionSchema', 'getFieldTree', 'getRelationFields', 'preview'], 'public');

    registerAdminRoutes(this.app);
    registerRenderRoute(this.app, this.db);
  }

  async afterLoad() {
    await this.db.sync();
  }
}

module.exports = PrintTemplatePlugin;
