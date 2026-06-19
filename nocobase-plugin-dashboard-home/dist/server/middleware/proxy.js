"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProxyRoutes = registerProxyRoutes;
/**
 * AMAP (高德) geocoding/geolocation proxy middleware
 */
const https_1 = __importDefault(require("https"));
const AMAP_KEY = process.env.AMAP_KEY || '31e73c1d12b2848e7bd964774782a954';
async function amapGet(url) {
    return new Promise((resolve, reject) => {
        https_1.default.get(url, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                }
                catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}
function registerProxyRoutes(app) {
    // Geocode + IP locate proxy
    app.use(async (ctx, next) => {
        const path = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
        if (ctx.method !== 'GET' || !(path.endsWith('/geocode') || path.endsWith('/locate') || path.endsWith('/regeo'))) {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        if (path.endsWith('/geocode')) {
            const q = ctx.query.q;
            if (!q) {
                ctx.body = { status: '0', tips: [] };
                return;
            }
            try {
                const data = await amapGet(`https://restapi.amap.com/v3/assistant/inputtips?key=${AMAP_KEY}&keywords=${encodeURIComponent(q)}&output=json&offset=20`);
                ctx.body = data;
            }
            catch (e) {
                ctx.status = 502;
                ctx.body = { status: '0', tips: [], error: e.message };
            }
        }
        else if (path.endsWith('/regeo')) {
            const location = ctx.query.location;
            if (!location) {
                ctx.body = { status: '0', regeocode: null };
                return;
            }
            try {
                const data = await amapGet(`https://restapi.amap.com/v3/geocode/regeo?key=${AMAP_KEY}&location=${encodeURIComponent(location)}&output=json&radius=1000`);
                ctx.body = data;
            }
            catch (e) {
                ctx.status = 502;
                ctx.body = { status: '0', regeocode: null, error: e.message };
            }
        }
        else {
            // /locate - IP location
            try {
                const data = await amapGet(`https://restapi.amap.com/v3/ip?key=${AMAP_KEY}&output=json`);
                ctx.body = data;
            }
            catch (e) {
                ctx.status = 502;
                ctx.body = { status: '0', rectangle: null, city: null, province: null, error: e.message };
            }
        }
    }, { tag: 'dashboard-home', after: 'dataWrapping', before: 'dataSource' });
    // Search API - AMAP inputtips proxy
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/search') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        const q = ctx.query.q;
        if (!q) {
            ctx.body = { status: '0', tips: [] };
            return;
        }
        try {
            const data = await amapGet(`https://restapi.amap.com/v3/assistant/inputtips?key=${AMAP_KEY}&keywords=${encodeURIComponent(q)}&output=json&offset=20`);
            ctx.body = data;
        }
        catch (e) {
            ctx.status = 502;
            ctx.body = { status: '0', tips: [], error: e.message };
        }
    }, { tag: 'dashboard-home', after: 'dataWrapping', before: 'dataSource' });
    // Reverse geocode via AMAP
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/reverse-geocode') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        const lat = ctx.query.lat;
        const lng = ctx.query.lng;
        if (!lat || !lng) {
            ctx.body = { status: '0', address: null };
            return;
        }
        try {
            const data = await amapGet(`https://restapi.amap.com/v3/geocode/regeo?key=${AMAP_KEY}&location=${encodeURIComponent(lng + ',' + lat)}&output=json&radius=1000`);
            if (data.status === '1' && data.regeocode) {
                const ac = data.regeocode.addressComponent || {};
                const street = ac.streetNumber && ac.streetNumber.street || ac.street || '';
                const township = ac.township || '';
                const district = ac.district || '';
                const city = ac.city || '';
                const province = ac.province || '';
                ctx.body = {
                    status: '1',
                    adcode: ac.adcode || '',
                    address: {
                        province, city, district, township, street,
                        formatted: data.regeocode.formatted_address || ''
                    }
                };
            }
            else {
                ctx.body = { status: '0', address: null, amap: data };
            }
        }
        catch (e) {
            ctx.status = 502;
            ctx.body = { status: '0', address: null, error: e.message };
        }
    }, { tag: 'dashboard-home', after: 'dataWrapping', before: 'dataSource' });
}
