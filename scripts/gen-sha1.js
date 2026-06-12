const crypto = require('crypto');
const hash = crypto.createHash('sha1').update('admin123').digest('hex');
console.log('SHA1(admin123):', hash);
