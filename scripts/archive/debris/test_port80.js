var http = require('http');
var body = {
  check_type: '上班',
  check_time: new Date().toISOString(),
  latitude: 27.706,
  longitude: 106.937,
  gps_accuracy: 15,
  gps_state: 'ok',
  verify_status: 'gps+face+finger',
  photo_hash: 'ph_test1234',
  device_fingerprint: 'test_device_fp'
};
var data = JSON.stringify(body);
var req = http.request({
  hostname: '127.0.0.1',
  port: 80,
  path: '/api/__pd__/attendance/submit',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ee2ccf0c-6e29-4e18-8bac-e5e145bc4726',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, function(res) {
  var body = '';
  res.on('data', function(c) { body += c; });
  res.on('end', function() {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});
req.write(data);
req.end();
