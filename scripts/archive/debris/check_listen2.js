var path = require('path');
var fs = require('fs');
var base = '/app/nocobase';
var appFile = path.join(base, 'node_modules', '@nocobase', 'server', 'lib', 'application.js');
var c = fs.readFileSync(appFile, 'utf8');
// Find http.createServer or listen
var patterns = ['http.createServer', '.listen(', 'callback()', 'createContext'];
patterns.forEach(function(p) {
  var idx = c.indexOf(p);
  if (idx > -1) {
    console.log('--- Found "' + p + '" at position ' + idx + ' ---');
    console.log(c.substring(Math.max(0, idx-200), idx+500));
  }
});
// Also find the start method
var startIdx = c.indexOf('async start(');
if (startIdx > -1) {
  console.log('--- start() method ---');
  console.log(c.substring(startIdx, startIdx+1000));
}
