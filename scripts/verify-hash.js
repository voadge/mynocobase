const bcrypt = require('bcryptjs');
const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
console.log('Testing hash for admin123...');
console.log('Match:', bcrypt.compareSync('admin123', hash));
// Generate new hash
const newHash = bcrypt.hashSync('admin123', 10);
console.log('New hash:', newHash);
console.log('New verifies:', bcrypt.compareSync('admin123', newHash));
