try {
  const m = require('@nocobase/plugin-dashboard-home');
  console.log('exports:', Object.keys(m));
  console.log('type:', typeof m);
  console.log('prototype:', m.prototype ? Object.getOwnPropertyNames(m.prototype) : 'N/A');
} catch(e) {
  console.log('error:', e.message);
  console.log('stack:', e.stack.split('\n').slice(0,5).join('\n'));
}
