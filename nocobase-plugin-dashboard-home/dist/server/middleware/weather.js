"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWeatherRoutes = registerWeatherRoutes;
const qw_jwt_1 = require("../utils/qw-jwt");
function registerWeatherRoutes(app) {
    // QWeather proxy - JWT auth, primary weather source
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/weather-qw') {
            return await next();
        }
        ctx.withoutDataWrapping = true;
        ctx.type = 'application/json; charset=utf-8';
        const lat = ctx.query.lat;
        const lng = ctx.query.lng;
        let city = ctx.query.city || '';
        city = city.replace(/市$/, '').replace(/地区$/, '');
        try {
            let loc = '';
            let locCity = '';
            if (lat && lng) {
                loc = lng + ',' + lat;
                try {
                    const geo = await (0, qw_jwt_1.qwFetch)('https://' + qw_jwt_1.QW_GEO_HOST + '/geo/v2/city/lookup?location=' + encodeURIComponent(loc) + '&range=cn');
                    if (geo && geo.code === '200' && geo.location && geo.location[0]) {
                        locCity = geo.location[0].name || '';
                        if (!locCity)
                            locCity = geo.location[0].adm1 || '';
                    }
                }
                catch (e) { }
            }
            else if (city) {
                try {
                    const geo = await (0, qw_jwt_1.qwFetch)('https://' + qw_jwt_1.QW_GEO_HOST + '/geo/v2/city/lookup?location=' + encodeURIComponent(city) + '&range=cn');
                    if (geo && geo.code === '200' && geo.location && geo.location[0]) {
                        loc = geo.location[0].id || city;
                        locCity = geo.location[0].name || city;
                    }
                    else {
                        loc = city;
                        locCity = city;
                    }
                }
                catch (e) {
                    loc = city;
                    locCity = city;
                }
            }
            if (!loc && !city) {
                ctx.body = { code: -1, msg: '缺少参数' };
                return;
            }
            const w = await (0, qw_jwt_1.qwFetch)('https://' + qw_jwt_1.QW_WEATHER_HOST + '/v7/weather/now?location=' + encodeURIComponent(loc || city));
            if (w && w.code === '200') {
                const n = w.now || {};
                ctx.body = {
                    code: 0, data: {
                        city: locCity || '',
                        weather: n.text || n.weather || '',
                        temperature: n.temp || n.temperature || '',
                        windDirection: n.windDir || '',
                        windPower: n.windScale || '',
                        humidity: n.humidity || '',
                        icon: n.icon || '',
                        time: w.updateTime || ''
                    }
                };
            }
            else {
                ctx.body = { code: -1, msg: 'QWeather: ' + (w && w.code || 'unknown error') };
            }
        }
        catch (e) {
            ctx.body = { code: -1, msg: e.message };
        }
    }, { tag: 'dashboard-home', before: 'dataSource' });
    // QWeather reverse geocode - lat/lng to location name (GeoAPI)
    app.use(async (ctx, next) => {
        if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__pd__/reverse-geocode-qw') {
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
            const geo = await (0, qw_jwt_1.qwFetch)('https://' + qw_jwt_1.QW_GEO_HOST + '/geo/v2/city/lookup?location=' + encodeURIComponent(lng + ',' + lat) + '&range=cn');
            if (geo && geo.code === '200' && geo.location && geo.location[0]) {
                const loc = geo.location[0];
                ctx.body = {
                    status: '1',
                    address: {
                        city: loc.adm2 || loc.name || '',
                        district: loc.adm3 || loc.adm1 || '',
                        name: loc.name || '',
                        type: loc.type || ''
                    }
                };
            }
            else {
                ctx.body = { status: '0', address: null, qw: geo };
            }
        }
        catch (e) {
            ctx.body = { status: '0', address: null, error: e.message };
        }
    });
}
