define(function () {
  function ApprovalCnPlugin(options, app) {
    this.options = options;
    this.app = app;
  }
  ApprovalCnPlugin.prototype.afterAdd = function () {};
  ApprovalCnPlugin.prototype.beforeLoad = function () {};
  ApprovalCnPlugin.prototype.load = function () {};
  return ApprovalCnPlugin;
});