const { Sequelize } = require('sequelize');
const config = require('/app/nocobase/storage/app/main/database.json');
const seq = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect || 'postgres',
  logging: false
});
async function main() {
  const [rows] = await seq.query('SELECT id, log_date, status, "project_name_NO", createdById FROM construction_daily_log ORDER BY id');
  console.log(JSON.stringify(rows, null, 2));
  await seq.close();
}
main().catch(e => { console.error(e); process.exit(1); });
