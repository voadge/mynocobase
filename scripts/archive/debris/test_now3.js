var http = require('http');
var paths = [
  '/api/__pd__/attendance/submit',
  '/__pd__/attendance/submit',
  '/api/plugin-dashboard-home/auth-check',
  '/plugin-dashboard-home/auth-check',
  '/api/__dh__/test',
  '/__dh__/test'
];
var results = [];
var pending = paths.length;
function done() {
  if (--pending > 0) return;
  results.sort(function(a,b){return a.idx-b.idx});
  results.forEach(function(r){console.log(r.idx+': '+r.path+' -> '+r.status+' '+r.body);});
  process.exit(0);
}
paths.forEach(function(p, i) {
  var opts = {hostname:'127.0.0.1',port:13000,path:p,method:'GET'};
  var req = http.request(opts, function(res) {
    var b = '';
    res.on('data', function(c) { b += c; });
    res.on('end', function() {
      results.push({idx:i, path:p, status:res.statusCode, body:b.substring(0,60)});
      done();
    });
  });
  req.on('error', function(e) { results.push({idx:i, path:p, status:'ERR', body:e.message}); done(); });
  req.setTimeout(3000, function() { results.push({idx:i, path:p, status:'TO', body:''}); done(); req.destroy(); });
  req.end();
});
