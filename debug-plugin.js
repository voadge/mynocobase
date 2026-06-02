const { Plugin } = require('@nocobase/server');
const path = require('path');
const fs = require('fs');

async function main() {
  // Test 1: Check if the module can be loaded
  try {
    const m = require('@nocobase/plugin-dashboard-home');
    console.log('Test 1 - require works:', typeof m);
  } catch(e) {
    console.log('Test 1 FAILED:', e.message);
  }

  // Test 2: Check NODE_MODULES_PATH
  console.log('Test 2 - NODE_MODULES_PATH:', process.env.NODE_MODULES_PATH);

  // Test 3: Check if package.json exists at expected location
  const nmPath = process.env.NODE_MODULES_PATH || '/app/nocobase/node_modules';
  const pkgPath = path.join(nmPath, '@nocobase', 'plugin-dashboard-home', 'package.json');
  console.log('Test 3 - package.json exists:', fs.existsSync(pkgPath), 'at', pkgPath);

  // Test 4: Check symlink
  try {
    const linkPath = path.join(nmPath, '@nocobase', 'plugin-dashboard-home');
    const realPath = fs.realpathSync(linkPath);
    console.log('Test 4 - symlink target:', realPath);
  } catch(e) {
    console.log('Test 4 - symlink error:', e.message);
  }
}

main().catch(console.error);
