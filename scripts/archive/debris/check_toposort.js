var fs = require('fs');
var c = fs.readFileSync(require.resolve('@nocobase/utils'), 'utf8');
var idx = c.indexOf('Toposort');
if (idx > -1) console.log(c.substring(idx, idx + 4000));
