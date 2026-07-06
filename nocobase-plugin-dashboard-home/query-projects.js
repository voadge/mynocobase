const path = require('path');
process.env.NODE_PATH = '/app/nocobase/node_modules';
require('module').Module._initPaths();
const { Sequelize } = require('sequelize');
const seq = new Sequelize(process.env.DB_DIALECT + '://' + process.env.DB_USER + ':' + process.env.DB_PASSWORD + '@' + process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_DATABASE, { logging: false });
(async () => {
  try {
    const r = await seq.query("SELECT id, project_code, project_name FROM projects LIMIT 10");
    console.log(JSON.stringify(r[0], null, 2));
  } catch(e) {
    console.log('Error:', e.message);
  }
  await seq.close();
})();
