define(function(){
  function DashboardHomePlugin(options, app) {
    this.options = options;
    this.app = app;
  }
  DashboardHomePlugin.prototype.afterAdd = function() {
    this.app.router.add('dashboard-home-redirect', {
      path: '/home',
      Component: function() {
        window.location.replace('/home');
        return null;
      }
    });
  };
  DashboardHomePlugin.prototype.beforeLoad = function() {};
  DashboardHomePlugin.prototype.load = function() {};
  return DashboardHomePlugin;
});
