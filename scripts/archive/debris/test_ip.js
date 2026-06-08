var http = require('http');
var d = JSON.stringify({a:1});
var opts = {hostname:'172.18.0.4',port:13000,path:'/api/__pd__/attendance/submit',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}};
var req = http.request(opts, function(res) {
  var b = '';
  res.on('data', function(c) { b += c; });
  res.on('end', function() { console.log('R:'+res.statusCode+' B:'+b.substring(0,300)); process.exit(0); });
});
req.on('error', function(e) { console.log('E:'+e.message); process.exit(1); });
req.setTimeout(8000, function() { console.log('TO'); process.exit(1); });
req.write(d); req.end();
