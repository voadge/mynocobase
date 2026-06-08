var fs = require('fs');
fs.appendFileSync('/tmp/test_fs.log', Date.now() + ' hello\n');
console.log(fs.readFileSync('/tmp/test_fs.log', 'utf8'));
