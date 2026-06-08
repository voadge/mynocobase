// 每日 03:00 执行: node scripts/batch-reverse-geocode.js
// 处理前日 township 为空的记录
// 需在 NocoBase 容器内或配置 DB 连接串执行

const AMAP_KEY = process.env.AMAP_KEY || '31e73c1d12b2848e7bd964774782a954';
const BATCH_SIZE = 20;
const BASE_URL = 'https://restapi.amap.com/v3/geocode/regeo';

async function process() {
  var db = null;
  try {
    db = await require('./nocobase-api').getDb();
  } catch (e) {
    console.error('请配置 DB 连接或使用 nocobase-api.js');
    return;
  }

  var records = await db.query(`
    SELECT id, latitude, longitude FROM location_history
    WHERE is_valid = true
      AND (township IS NULL OR township = '')
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND recorded_at >= NOW() - INTERVAL '7 days'
    LIMIT 500
  `);

  for (var i = 0; i < records.length; i += BATCH_SIZE) {
    var batch = records.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(function (record) {
      var location = record.longitude + ',' + record.latitude;
      return fetch(BASE_URL + '?key=' + AMAP_KEY + '&location=' + encodeURIComponent(location) + '&radius=1000')
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var addr = d.regeocode && d.regeocode.addressComponent;
          if (!addr) return;
          return db.query(`
            UPDATE location_history
            SET township = $1, street = $2, district = $3
            WHERE id = $4
          `, [addr.township || '', addr.street || '', addr.district || '', record.id]);
        })
        .catch(function () { });
    }));
    await new Promise(function (r) { return setTimeout(r, 1000); });
  }
  console.log('batch-reverse-geocode 完成，处理 ' + records.length + ' 条');
}

process().catch(function (e) { console.error(e); });
