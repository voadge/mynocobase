var f = require.resolve('@nocobase/server');
var c = require('fs').readFileSync(f, 'utf8');
var i = c.indexOf('spa');
if(i>-1) console.log(c.substring(Math.max(0,i-200),i+800));
