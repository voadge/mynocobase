var http = require('http');
var opts = {hostname:'127.0.0.1',port:13000,path:'/api/plugin-dashboard-home/geocode?q=test',method:'GET'};
var req = http.request(opts, function(res) {
  var b = '';
  res.on('data', function(c) { b += c; });
  res.on('end', function() { console.log('R:'+res.statusCode+' B:'+b.substring(0,200)); process.exit(0); });
});
req.on('error', function(e) { console.log('E:'+e.message); process.exit(1); });
req.setTimeout(8000, function() { console.log('TO'); process.exit(1); });
req.end();
