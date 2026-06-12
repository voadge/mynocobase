const crypto = require('crypto');
const salt = 'adff111e6bedd7c8';
const expectedKey = 'e67224a2bd737517d836dea5b03870ea8e6ec4c49c58524f';
crypto.scrypt('admin123', salt, 24, (err, key) => {
  if (err) { console.error('scrypt err:', err); return; }
  const match = key.toString('hex') === expectedKey;
  console.log('Match:', match);
  console.log('Got:', key.toString('hex'));
  console.log('Exp:', expectedKey);

  if (!match) {
    // Generate new hash
    const newSalt = crypto.randomBytes(8).toString('hex');
    crypto.scrypt('admin123', newSalt, 24, (err2, newKey) => {
      if (err2) { console.error(err2); return; }
      console.log('NEW hash:', newSalt + newKey.toString('hex'));
    });
  }
});
