var path = require('path');
var fs = require('fs');
var base = '/app/nocobase';
var appFile = path.join(base, 'node_modules', '@nocobase', 'server', 'lib', 'application.js');
if (!fs.existsSync(appFile)) {
  // search
  function walk(dir) {
    try {
      var files = fs.readdirSync(dir);
      files.forEach(function(f) {
        var p = path.join(dir, f);
        var s = fs.statSync(p);
        if (s.isDirectory() && f !== 'node_modules') walk(p);
        else if (f === 'application.js') console.log(p);
      });
    } catch(e) {}
  }
  walk(path.join(base, 'node_modules', '@nocobase', 'server'));
} else {
  var c = fs.readFileSync(appFile, 'utf8');
  var idx = c.indexOf('callback');
  if (idx > -1) console.log(c.substring(Math.max(0, idx-100), idx+600));
}
