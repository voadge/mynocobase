const crypto = require('crypto');
const password = 'admin123';
const salt = crypto.randomBytes(8).toString('hex');
crypto.scrypt(password, salt, 24, (err, key) => {
  if (err) { console.error(err); process.exit(1); }
  const hash = salt + key.toString('hex');
  console.log(hash);
});
