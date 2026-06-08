var http = require('http');
var d = JSON.stringify({check_type:'上班',check_time:'2026-06-08T09:05:00Z',gps_state:'ok',latitude:27.73,longitude:107.0985});
var opts = {hostname:'127.0.0.1',port:13000,path:'/__pd__/attendance/submit',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}};
var req = http.request(opts, function(res) {
  var b = '';
  res.on('data', function(c) { b += c; });
  res.on('end', function() { console.log('R:'+res.statusCode+' B:'+b.substring(0,500)); process.exit(0); });
});
req.on('error', function(e) { console.log('E:'+e.message); process.exit(1); });
req.setTimeout(10000, function() { console.log('TO'); process.exit(1); });
req.write(d); req.end();
