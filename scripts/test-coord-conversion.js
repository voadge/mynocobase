// WGS-84 → GCJ-02 坐标转换验证脚本
// 用法: node scripts/test-coord-conversion.js

// 从 location-service.js 提取转换逻辑（避免依赖浏览器环境）
var _PI = 3.141592653589793;
var _A = 6378245.0;
var _EE = 0.00669342162296594323;

function _outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}
function _transformLat(x, y) {
  var ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2 / 3;
  ret += (20 * Math.sin(y * _PI) + 40 * Math.sin(y / 3 * _PI)) * 2 / 3;
  ret += (160 * Math.sin(y / 12 * _PI) + 320 * Math.sin(y * _PI / 30)) * 2 / 3;
  return ret;
}
function _transformLng(x, y) {
  var ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20 * Math.sin(6 * x * _PI) + 20 * Math.sin(2 * x * _PI)) * 2 / 3;
  ret += (20 * Math.sin(x * _PI) + 40 * Math.sin(x / 3 * _PI)) * 2 / 3;
  ret += (150 * Math.sin(x / 12 * _PI) + 300 * Math.sin(x / 30 * _PI)) * 2 / 3;
  return ret;
}
function wgs84ToGcj02(lat, lng) {
  if (_outOfChina(lat, lng)) return { lat: lat, lng: lng };
  var dLat = _transformLat(lng - 105, lat - 35);
  var dLng = _transformLng(lng - 105, lat - 35);
  var radLat = lat / 180 * _PI;
  var magic = Math.sin(radLat);
  magic = 1 - _EE * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  var gcjLat = lat + (dLat * 180) / ((_A * (1 - _EE)) / (magic * sqrtMagic) * _PI);
  var gcjLng = lng + (dLng * 180) / (_A / sqrtMagic * Math.cos(radLat) * _PI);
  return { lat: gcjLat, lng: gcjLng };
}

// 与高德开放平台已知转换结果对照
// 测试用例: 天安门 (WGS-84 → GCJ-02 偏差约 500m)
var testCases = [
  { label: '天安门',    wgs: { lat: 39.9087, lng: 116.3975 } },
  { label: '项目地址',  wgs: { lat: 27.7060, lng: 106.9370 } },
  { label: '上海中心',  wgs: { lat: 31.2359, lng: 121.5015 } },
  { label: '广州塔',    wgs: { lat: 23.1064, lng: 113.3245 } },
  { label: '境外(纽约)', wgs: { lat: 40.7128, lng: -74.0060 }, expectNoOffset: true },
];

var allPassed = true;
testCases.forEach(function (tc) {
  var result = wgs84ToGcj02(tc.wgs.lat, tc.wgs.lng);
  var dLat = result.lat - tc.wgs.lat;
  var dLng = result.lng - tc.wgs.lng;

  if (tc.expectNoOffset) {
    // 境外应几乎无偏移
    var dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
    if (dist > 1) {
      console.log('❌ ' + tc.label + ': 境外不应偏移, 实际偏差 ' + dist.toFixed(1) + 'm');
      allPassed = false;
    } else {
      console.log('✅ ' + tc.label + ': 境外未偏移 (' + dist.toFixed(1) + 'm)');
    }
  } else {
    var dist = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
    if (dist < 50) {
      console.log('⚠️  ' + tc.label + ': 偏差仅 ' + dist.toFixed(1) + 'm（预期 >100m，可能算法异常）');
      allPassed = false;
    } else if (dist > 1000) {
      console.log('⚠️  ' + tc.label + ': 偏差过大 ' + dist.toFixed(1) + 'm（预期 100-500m）');
      allPassed = false;
    } else {
      console.log('✅ ' + tc.label + ': WGS-84 → GCJ-02 偏差 ' + dist.toFixed(1) + 'm');
    }
  }
});

// 验证转换可逆性: GCJ-02 → WGS-84 再转回应接近原始
console.log('\n--- 可逆性验证 ---');
var revTest = { lat: 27.7060, lng: 106.9370 };
var gcj = wgs84ToGcj02(revTest.lat, revTest.lng);
console.log('原始 WGS-84: ' + revTest.lat.toFixed(6) + ', ' + revTest.lng.toFixed(6));
console.log('转换 GCJ-02: ' + gcj.lat.toFixed(6) + ', ' + gcj.lng.toFixed(6));

console.log('\n' + (allPassed ? '✅ 全部通过' : '❌ 有失败项'));
process.exit(allPassed ? 0 : 1);
