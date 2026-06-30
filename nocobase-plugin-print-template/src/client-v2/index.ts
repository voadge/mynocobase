declare const define: (factory: (...args: any[]) => any) => void;
declare const window: any;

define(function(){
  function PrintTemplateClientPlugin(options: any, app: any) {
    this.options = options;
    this.app = app;
  }
  PrintTemplateClientPlugin.prototype.afterAdd = function() {};
  PrintTemplateClientPlugin.prototype.beforeLoad = function() {};
  PrintTemplateClientPlugin.prototype.load = function() {
    if (this.app.router) {
      this.app.router.add('print-template-admin', {
        path: '/__pt__/admin',
        Component: function() {
          window.location.replace('/api/__pt__/admin');
          return null;
        }
      });
      this.app.router.add('print-template-admin-edit', {
        path: '/__pt__/admin/edit*',
        Component: function() {
          window.location.replace('/api/__pt__/admin/edit');
          return null;
        }
      });
    }
  };
  return PrintTemplateClientPlugin;
});
