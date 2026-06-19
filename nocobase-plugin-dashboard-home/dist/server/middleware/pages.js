"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPageRoutes = registerPageRoutes;
/**
 * Page serving middleware
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("./auth");
const PAGE_MAP = {
    '/__dh__': 'index.html',
    '/__tb__': '百宝箱.html',
    '/__fp__': '行程发票报销助手.html',
    '/__tp__': '智能排版打印助手.html',
    '/__gf__': 'geofence-manager.html',
    '/__pd__': '人员动态.html',
};
const STORAGE_DIR = '/app/nocobase/storage/dashboard';
function registerPageRoutes(app) {
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || !PAGE_MAP[ctx.state.reqPath]) {
            return await next();
        }
        if (await (0, auth_1.isAuthenticated)(ctx)) {
            ctx.withoutDataWrapping = true;
            ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            ctx.set('Pragma', 'no-cache');
            ctx.set('Expires', '0');
            try {
                const fileName = PAGE_MAP[ctx.state.reqPath];
                const htmlPath = path_1.default.join(STORAGE_DIR, fileName);
                const html = fs_1.default.readFileSync(htmlPath, 'utf-8');
                ctx.type = 'text/html; charset=utf-8';
                ctx.body = html;
            }
            catch (e) {
                ctx.status = 500;
                ctx.body = 'Page file not found';
            }
        }
        else {
            ctx.redirect('/signin');
        }
    }, { tag: 'dashboard-home', after: 'dataWrapping', before: 'dataSource' });
}
