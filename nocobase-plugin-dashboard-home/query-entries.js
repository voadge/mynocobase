const http = require('http');

function testGet(path) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: 80, path: path, method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.end();
  });
}

(async () => {
  // Get entries to find a real projectID + date combo
  let r = await testGet('/api/construction_daily_entries:list?pageSize=5&sort=-createdAt');
  console.log(r.body.substring(0, 1000));
})();
