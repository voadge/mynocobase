declare const define: (factory: (...args: any[]) => any) => void;

define(function(){
  function PrintTemplateClientPlugin(options: any, app: any) {
    this.options = options;
    this.app = app;
  }
  PrintTemplateClientPlugin.prototype.afterAdd = function() {};
  PrintTemplateClientPlugin.prototype.beforeLoad = function() {};
  PrintTemplateClientPlugin.prototype.load = function() {
  };
  return PrintTemplateClientPlugin;
});
