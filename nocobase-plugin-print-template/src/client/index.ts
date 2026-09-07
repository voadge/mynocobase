declare const define: (factory: (...args: any[]) => any) => void;

define(function(){
  function PrintTemplateClientPlugin(options: any, app: any) {
    this.options = options;
    this.app = app;
  }
  PrintTemplateClientPlugin.prototype.afterAdd = function() {};
  PrintTemplateClientPlugin.prototype.beforeLoad = function() {};
  PrintTemplateClientPlugin.prototype.load = function() {
    // 客户端插件入口 - 无前端逻辑
  };
  return PrintTemplateClientPlugin;
});
