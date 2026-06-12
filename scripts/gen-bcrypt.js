const bcrypt = require('bcryptjs');
bcrypt.hash('admin123', 10).then(h => {
  console.log(h);
  process.exit(0);
});
