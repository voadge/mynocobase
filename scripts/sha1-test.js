const crypto = require('crypto');
// NocoBase v2 uses sha1 of the password
const pwd = 'admin123';
const hash = crypto.createHash('sha1').update(pwd).digest('hex');
console.log('SHA1(admin123) =', hash);
console.log('Length:', hash.length);
