"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = isAuthenticated;
exports.authCheckHandler = authCheckHandler;
/**
 * Authentication middleware for Dashboard Home plugin
 */
const http_1 = __importDefault(require("http"));
async function isAuthenticated(ctx) {
    if (ctx.state.currentUser)
        return true;
    const authHeader = ctx.get('Authorization') || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
        token = ctx.cookies.get('nb_token') || ctx.cookies.get('NOCOBASE_token');
    }
    if (!token)
        return false;
    // JWT tokens via auth:check
    try {
        const result = await new Promise((resolve, reject) => {
            const req = http_1.default.get({
                hostname: '127.0.0.1',
                port: 13000,
                path: '/api/auth:check',
                headers: { 'Authorization': 'Bearer ' + token },
                timeout: 5000,
            }, (res) => {
                let body = '';
                res.on('data', (c) => body += c);
                res.on('end', () => resolve({ status: res.statusCode, body }));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        if (result.status === 200) {
            try {
                const data = JSON.parse(result.body);
                const userData = data && data.data ? data.data : data;
                if (userData && userData.id) {
                    ctx.state.currentUser = userData;
                    return true;
                }
            }
            catch (e) { }
            return false;
        }
    }
    catch (e) { }
    return false;
}
/**
 * Auth check endpoint for nginx auth_request
 */
async function authCheckHandler(ctx) {
    ctx.withoutDataWrapping = true;
    if (await isAuthenticated(ctx)) {
        ctx.status = 200;
        ctx.body = 'OK';
    }
    else {
        ctx.status = 401;
        ctx.body = 'Unauthorized';
    }
}
