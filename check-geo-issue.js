// Script to run inside the container to debug geofences issue
const http = require('http');

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 13000, path, method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    };
    const r = http.request(opts, res => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  // First sign in to get a token
  const login = await req('POST', '/api/auth:signIn', {
    account: process.env.INITIAL_ADMIN_USER || process.env.__shared__?.env?.INITIAL_ADMIN_USER || 'admin@nocobase.com',
    password: process.env.INITIAL_ADMIN_PWD || process.env.__shared__?.env?.INITIAL_ADMIN_PWD || 'admin123'
  });
  const data = JSON.parse(login.body);
  console.log('LOGIN:', login.status, data?.data?.token ? 'TOKEN_OK' : 'NO_TOKEN');
  const token = data?.data?.token;
  if (!token) { console.log('Login failed, trying without auth'); return; }

  function authReq(method, path, body) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'localhost', port: 13000, path, method,
        headers: {
          'Content-Type': 'application/json', 'Accept': 'application/json',
          'Authorization': 'Bearer ' + token
        }
      };
      const r = http.request(opts, res => {
        let chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      r.on('error', reject);
      if (body) r.write(JSON.stringify(body));
      r.end();
    });
  }

  // Test 1: List geofences
  console.log('\n=== LIST geofences ===');
  const r1 = await authReq('GET', '/api/geofences:list?pageSize=3');
  console.log(r1.status, r1.body.substring(0, 300));

  // Test 2: Create geofence
  console.log('\n=== CREATE geofence ===');
  const r2 = await authReq('POST', '/api/geofences:create', {
    fence_name: 'test-fence',
    polyline_coords: '[[106.9,27.7],[107.0,27.8]]',
    buffer_radius: 200,
    is_active: true,
    bbox_min_lat: 27.7, bbox_max_lat: 27.8, bbox_min_lng: 106.9, bbox_max_lng: 107.0
  });
  console.log(r2.status, r2.body.substring(0, 500));

  // If error, try to get more info
  if (r2.status >= 400) {
    try {
      const err = JSON.parse(r2.body);
      console.log('ERROR DETAILS:', JSON.stringify(err, null, 2).substring(0, 1000));
    } catch(e) {
      console.log('RAW ERROR:', r2.body);
    }
  }
})();
