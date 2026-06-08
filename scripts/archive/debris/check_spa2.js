var path = require('path');
// Find @nocobase/server from the app directory
var base = process.cwd();
var serverPath = path.join(base, 'node_modules', '@nocobase', 'server', 'dist', 'application.js');
var fs = require('fs');
if (!fs.existsSync(serverPath)) {
  serverPath = path.join(base, 'node_modules', '@nocobase', 'server', 'src', 'application.ts');
}
if (!fs.existsSync(serverPath)) {
  // Search wider
  var glob = path.join(base, 'node_modules', '@nocobase', '**', 'application.{js,ts}');
  console.log('Looking for', glob);
  // simple walk
  var walk = function(dir) {
    try {
      var files = fs.readdirSync(dir);
      files.forEach(function(f) {
        var p = path.join(dir, f);
        var stat = fs.statSync(p);
        if (stat.isDirectory() && f !== 'node_modules') walk(p);
        else if (f === 'application.js' || f === 'application.ts') console.log(p);
      });
    } catch(e) {}
  };
  walk(path.join(base, 'node_modules', '@nocobase', 'server'));
} else {
  var c = fs.readFileSync(serverPath, 'utf8');
  var i = c.indexOf('spa');
  if (i > -1) console.log(c.substring(Math.max(0,i-300), i+800));
  else console.log('spa not found in', serverPath);
}
