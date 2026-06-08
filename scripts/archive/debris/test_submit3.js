var http = require('http');
var data = JSON.stringify({test:1});
var req = http.request({
  hostname: 'localhost',
  port: 13000,
  path: '/__pd__/attendance/submit',
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Accept': 'application/json'}
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
