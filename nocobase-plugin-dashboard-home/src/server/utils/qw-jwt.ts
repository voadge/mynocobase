/**
 * QWeather (和风天气) JWT token generation and API fetch
 */
import https from 'https';
import zlib from 'zlib';
import crypto from 'crypto';

declare var Buffer: any;

const QW_KEY_ID = 'KAGXVT4Y78';
const QW_PROJECT_ID = '3MTGWKPJXJ';
const QW_WEATHER_HOST = 'ke7p448t6h.re.qweatherapi.com';
const QW_GEO_HOST = 'ke7p448t6h.re.qweatherapi.com';
const QW_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHwCpGLzy/EZjEdh4WJlKI081vmFXEUhCMFkGqs2dEj6
-----END PRIVATE KEY-----`;

/**
 * Generate QWeather JWT token (EdDSA)
 */
export function qwJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: QW_KEY_ID })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 900;
  const payload = Buffer.from(JSON.stringify({ sub: QW_PROJECT_ID, iat, exp })).toString('base64url');
  const data = header + '.' + payload;
  const key = crypto.createPrivateKey(QW_PRIVATE_KEY);
  const signature = crypto.sign(null, Buffer.from(data), key).toString('base64url');
  return data + '.' + signature;
}

/**
 * Fetch from QWeather API with JWT authentication and gzip handling
 */
export function qwFetch(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const jwt = qwJwt();
    const opts = new URL(url);
    https.get({
      hostname: opts.hostname,
      path: opts.pathname + opts.search,
      headers: { 'Authorization': 'Bearer ' + jwt, 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      const chunks: any[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        try {
          if (res.headers['content-encoding'] === 'gzip') {
            buf = zlib.gunzipSync(buf);
          }
          resolve(JSON.parse(buf.toString()));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

export { QW_WEATHER_HOST, QW_GEO_HOST };