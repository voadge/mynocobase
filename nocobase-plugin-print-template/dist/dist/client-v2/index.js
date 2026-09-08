define(function () {
    function PrintTemplateClientPlugin(options, app) {
        this.options = options;
        this.app = app;
    }
    PrintTemplateClientPlugin.prototype.afterAdd = function () { };
    PrintTemplateClientPlugin.prototype.beforeLoad = function () { };
    PrintTemplateClientPlugin.prototype.load = function () {
        // 前端路由：将 /__pt__/admin 重定向到 /api/__pt__/admin (由服务端中间件处理)
        if (this.app.router) {
            this.app.router.add('print-template-admin', {
                path: '/__pt__/admin',
                Component: function () {
                    window.location.replace('/api/__pt__/admin');
                    return null;
                }
            });
            this.app.router.add('print-template-admin-edit', {
                path: '/__pt__/admin/edit*',
                Component: function () {
                    window.location.replace('/api/__pt__/admin/edit');
                    return null;
                }
            });
        }
    };
    return PrintTemplateClientPlugin;
});
