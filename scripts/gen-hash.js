const crypto = require('crypto');
const password = 'admin123';
const salt = crypto.randomBytes(8).toString('hex');
const key = crypto.scryptSync(password, salt, 24);
const hash = salt + key.toString('hex');
console.log(hash);
