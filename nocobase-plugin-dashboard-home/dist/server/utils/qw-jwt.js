"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QW_GEO_HOST = exports.QW_WEATHER_HOST = void 0;
exports.qwJwt = qwJwt;
exports.qwFetch = qwFetch;
/**
 * QWeather (和风天气) JWT token generation and API fetch
 */
const https_1 = __importDefault(require("https"));
const zlib_1 = __importDefault(require("zlib"));
const crypto_1 = __importDefault(require("crypto"));
const QW_KEY_ID = 'KAGXVT4Y78';
const QW_PROJECT_ID = '3MTGWKPJXJ';
const QW_WEATHER_HOST = 'ke7p448t6h.re.qweatherapi.com';
exports.QW_WEATHER_HOST = QW_WEATHER_HOST;
const QW_GEO_HOST = 'ke7p448t6h.re.qweatherapi.com';
exports.QW_GEO_HOST = QW_GEO_HOST;
const QW_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHwCpGLzy/EZjEdh4WJlKI081vmFXEUhCMFkGqs2dEj6
-----END PRIVATE KEY-----`;
/**
 * Generate QWeather JWT token (EdDSA)
 */
function qwJwt() {
    const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: QW_KEY_ID })).toString('base64url');
    const iat = Math.floor(Date.now() / 1000) - 30;
    const exp = iat + 900;
    const payload = Buffer.from(JSON.stringify({ sub: QW_PROJECT_ID, iat, exp })).toString('base64url');
    const data = header + '.' + payload;
    const key = crypto_1.default.createPrivateKey(QW_PRIVATE_KEY);
    const signature = crypto_1.default.sign(null, Buffer.from(data), key).toString('base64url');
    return data + '.' + signature;
}
/**
 * Fetch from QWeather API with JWT authentication and gzip handling
 */
function qwFetch(url) {
    return new Promise((resolve, reject) => {
        const jwt = qwJwt();
        const opts = new URL(url);
        https_1.default.get({
            hostname: opts.hostname,
            path: opts.pathname + opts.search,
            headers: { 'Authorization': 'Bearer ' + jwt, 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                let buf = Buffer.concat(chunks);
                try {
                    if (res.headers['content-encoding'] === 'gzip') {
                        buf = zlib_1.default.gunzipSync(buf);
                    }
                    resolve(JSON.parse(buf.toString()));
                }
                catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}
