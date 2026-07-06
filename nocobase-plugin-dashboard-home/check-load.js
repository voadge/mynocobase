try {
  require('/app/nocobase/storage/plugins/@nocobase/plugin-dashboard-home/dist/server/middleware/dashboard.js');
  console.log('LOAD OK');
} catch(e) {
  console.log('LOAD ERROR:', e.message);
}
