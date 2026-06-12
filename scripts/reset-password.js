const crypto = require('crypto');
const { Pool } = require('pg');

async function main() {
  const password = 'admin123';
  const salt = crypto.randomBytes(8).toString('hex');
  const key = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 24, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  const hash = salt + key.toString('hex');
  console.log('New hash:', hash);
  console.log('Length:', hash.length);

  const pool = new Pool({
    host: 'postgres',
    port: 5432,
    user: 'nocobase',
    password: process.env.DB_PASSWORD || 'nocobase123',
    database: 'nocobase',
  });

  await pool.query('UPDATE users SET password = $1 WHERE id = 1', [hash]);
  console.log('Password updated for admin user');

  // Test the login
  const http = require('http');
  const r = http.request({
    hostname: 'localhost', port: 13000,
    path: '/api/auth:signIn', method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, s => {
    let d = '';
    s.on('data', c => d += c);
    s.on('end', () => {
      const result = JSON.parse(d);
      if (result.data && result.data.token) {
        console.log('Login successful! Token:', result.data.token.slice(0, 20) + '...');
      } else {
        console.log('Login failed:', d.slice(0, 200));
      }
      process.exit(0);
    });
  });
  r.write(JSON.stringify({ account: 'voadge@voadge.cn', password }));
  r.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
