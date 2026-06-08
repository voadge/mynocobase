var http = require('http');
var req = http.request({
  hostname: '127.0.0.1',
  port: 80,
  path: '/api/plugin-dashboard-home/auth-check',
  method: 'GET',
  headers: {'Authorization': 'Bearer ee2ccf0c-6e29-4e18-8bac-e5e145bc4726'}
}, function(res) {
  var body = '';
  res.on('data', function(c) { body += c; });
  res.on('end', function() {
    console.log('STATUS:', res.statusCode);
    console.log('BODY:', body);
  });
});
req.end();
