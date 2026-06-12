try {
  var bcrypt = require('bcryptjs');
  var h1 = bcrypt.hashSync('admin123', 10);
  console.log('hash:', h1);
  console.log('prefix:', h1.substring(0, 4));
  console.log('verifies:', bcrypt.compareSync('admin123', h1));
  
  // Try $2a$ prefix
  var h2a = h1.replace('$2b$', '$2a$');
  console.log('2a verifies:', bcrypt.compareSync('admin123', h2a));
} catch(e) {
  console.error('Error:', e.message);
}
