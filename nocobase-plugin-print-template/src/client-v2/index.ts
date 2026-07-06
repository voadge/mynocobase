export default class PrintTemplateClientPluginV2 {
  constructor(protected app: any) {}

  async load() {
    if (this.app.router) {
      this.app.router.add('print-template-admin', {
        path: '/admin/print-templates',
        Component: () => {
          window.location.href = '/api/__pt__/admin';
          return null;
        },
      });
    }
  }
}
