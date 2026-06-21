var _PI = 3.141592653589793;
var _A = 6378245.0;
var _EE = 0.00669342162296594323;
function _outOfChina(lat, lng) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
function _transformLat(x, y) {
  var ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  ret += (20*Math.sin(6*x*_PI) + 20*Math.sin(2*x*_PI)) * 2/3;
  ret += (20*Math.sin(y*_PI) + 40*Math.sin(y/3*_PI)) * 2/3;
  ret += (160*Math.sin(y/12*_PI) + 320*Math.sin(y*_PI/30)) * 2/3;
  return ret;
}
function _transformLng(x, y) {
  var ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
  ret += (20*Math.sin(6*x*_PI) + 20*Math.sin(2*x*_PI)) * 2/3;
  ret += (20*Math.sin(x*_PI) + 40*Math.sin(x/3*_PI)) * 2/3;
  ret += (150*Math.sin(x/12*_PI) + 300*Math.sin(x*_PI/30)) * 2/3;
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
  return {
    lat: lat + (dLat * 180) / ((_A * (1 - _EE)) / (magic * sqrtMagic) * _PI),
    lng: lng + (dLng * 180) / (_A / sqrtMagic * Math.cos(radLat) * _PI)
  };
}
function haversineDist(lat1, lon1, lat2, lon2) {
  var R = 6371000, toRad = _PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
  var dAC = haversineDist(lat, lon, lat1, lon1);
  var dBC = haversineDist(lat, lon, lat2, lon2);
  var dAB = haversineDist(lat1, lon1, lat2, lon2);
  if (dAB < 1) return dAC;
  var cosA = (dAC*dAC + dAB*dAB - dBC*dBC) / (2*dAC*dAB);
  var cosB = (dBC*dBC + dAB*dAB - dAC*dAC) / (2*dBC*dAB);
  if (cosA <= 0) return dAC;
  if (cosB <= 0) return dBC;
  var s = (dAC + dBC + dAB) / 2;
  var area = Math.sqrt(Math.max(0, s*(s-dAC)*(s-dBC)*(s-dAB)));
  return area * 2 / dAB;
}
function distanceToPolyline(lat, lon, polyline) {
  var minDist = Infinity;
  for (var i = 0; i < polyline.length - 1; i++) {
    var d = pointToSegmentDistance(lat, lon, polyline[i][1], polyline[i][0], polyline[i+1][1], polyline[i+1][0]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}
async function main(context) {
  var db = context.db;
  var repo = db.getRepository('attendance_records');
  var archRepo = db.getRepository('att_archives');
  // Query previous day's records (上班/下班/签到/签退 only)
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  var ymd = yesterday.toISOString().substring(0, 10);
  var startStr = ymd + 'T00:00:00.000Z';
  var endStr = ymd + 'T23:59:59.999Z';
  var records = await repo.find({
    filter: {
      check_time: { $dateBetween: [startStr, endStr] },
      check_type: { $in: ['上班', '下班', '签到', '签退'] }
    },
    appends: ['createdBy.departments'],
    sort: ['createdById', 'check_time']
  });
  if (!records || records.length === 0) return;
  // Group by user
  var groups = {};
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var uid = r.createdById || r.createdBy;
    if (!uid) continue;
    if (!groups[uid]) groups[uid] = { userId: uid, records: [] };
    groups[uid].records.push(r);
  }
  var userIds = Object.keys(groups);
  for (var gi = 0; gi < userIds.length; gi++) {
    var g = groups[userIds[gi]];
    var userRecs = g.records;
    // Mark duplicates: earliest 上班 = valid, latest 下班 = valid
    var earliestIn = null, latestOut = null;
    for (var ri = 0; ri < userRecs.length; ri++) {
      var rec = userRecs[ri];
      var ct = rec.check_type;
      if (ct === '签到') ct = '上班';
      if (ct === '签退') ct = '下班';
      rec._normType = ct;
      if (ct === '上班') {
        if (!earliestIn || rec.check_time < earliestIn.check_time) earliestIn = rec;
      } else if (ct === '下班') {
        if (!latestOut || rec.check_time > latestOut.check_time) latestOut = rec;
      }
    }
    // Mark selected records
    var selectedIds = {};
    if (earliestIn) selectedIds[earliestIn.id] = true;
    if (latestOut) selectedIds[latestOut.id] = true;
    // Process valid check-in
    if (earliestIn) {
      var rec = earliestIn;
      var userId = rec.createdById || rec.createdBy;
      var lat = rec.latitude ? parseFloat(rec.latitude) : null;
      var lng = rec.longitude ? parseFloat(rec.longitude) : null;
      var gcjLat = lat, gcjLng = lng;
      if (lat != null && lng != null) {
        var conv = wgs84ToGcj02(lat, lng);
        gcjLat = conv.lat; gcjLng = conv.lng;
      }
      var deptName = '';
      try {
        if (rec.createdBy && rec.createdBy.departments && rec.createdBy.departments.length > 0) {
          deptName = rec.createdBy.departments[0].title || '';
        } else {
          var user = await db.getRepository('users').findOne({ filter: { id: userId }, appends: ['departments'] });
          if (user && user.departments && user.departments.length > 0) deptName = user.departments[0].title || '';
        }
      } catch (e) {}
      var isProject = deptName.indexOf('项目') !== -1;
      var WORK_START = isProject ? 8 * 60 : 9 * 60;
      var WORK_END = isProject ? 18 * 60 : (17 * 60 + 30);
      var GRACE = 10;
      var checkTime = new Date(rec.check_time);
      var ctMin = checkTime.getHours() * 60 + checkTime.getMinutes();
      var dow = checkTime.getDay();
      var isWeekend = (dow === 0 || dow === 6);
      var timeIssues = [];
      if (ctMin > WORK_START + GRACE) timeIssues.push('迟到' + (ctMin - WORK_START) + '分钟');
      // Geofence
      var matchedFence = null, minDist = Infinity, insideAny = false;
      if (gcjLat != null && gcjLng != null) {
        try {
          var fences = await db.getRepository('geofences').find({ filter: { is_active: true }, limit: 100 });
          for (var fi = 0; fi < (fences || []).length; fi++) {
            var fence = fences[fi];
            var poly;
            try { poly = JSON.parse(fence.polyline_coords); } catch (e) { continue; }
            if (!Array.isArray(poly) || poly.length < 2) continue;
            if (fence.bbox_min_lat != null && fence.bbox_max_lat != null && fence.bbox_min_lng != null && fence.bbox_max_lng != null) {
              var bufDeg = (fence.buffer_radius || 200) / 111320;
              var bufDegLng = bufDeg / Math.cos(gcjLat * _PI / 180);
              if (gcjLat < fence.bbox_min_lat - bufDeg || gcjLat > fence.bbox_max_lat + bufDeg || gcjLng < fence.bbox_min_lng - bufDegLng || gcjLng > fence.bbox_max_lng + bufDegLng) continue;
            }
            var dist = distanceToPolyline(gcjLat, gcjLng, poly);
            if (dist < minDist) { minDist = dist; matchedFence = fence; }
            if (dist <= (fence.buffer_radius || 200)) insideAny = true;
          }
        } catch (e) {}
      }
      var isInside = matchedFence ? minDist <= (matchedFence.buffer_radius || 200) : true;
      // Check result for check-in
      var checkResult = 'normal';
      var isOvertime = false;
      if (isProject) {
        if (timeIssues.length > 0) checkResult = 'abnormal';
      } else {
        if (isWeekend) { checkResult = 'overtime'; isOvertime = true; }
        else if (timeIssues.length > 0) checkResult = 'abnormal';
      }
      var uv = {
        check_result: checkResult, is_overtime: isOvertime,
        geofence_inside: isInside, geofence_distance: minDist < Infinity ? Math.round(minDist) : null,
        geofence_id: matchedFence ? matchedFence.id : null
      };
      if (!isProject && isWeekend && timeIssues.length === 0) uv.anomaly_reason = '加班';
      else if (timeIssues.length > 0) uv.anomaly_reason = timeIssues.join('; ');
      else if (!isInside && matchedFence) uv.anomaly_reason = '围栏外(距离围栏' + Math.round(minDist) + '米)';
      await repo.update({ filter: { id: rec.id }, values: uv });
    }
    // Process valid check-out
    if (latestOut && latestOut.id !== (earliestIn ? earliestIn.id : null)) {
      var rec = latestOut;
      var userId = rec.createdById || rec.createdBy;
      var lat = rec.latitude ? parseFloat(rec.latitude) : null;
      var lng = rec.longitude ? parseFloat(rec.longitude) : null;
      var gcjLat = lat, gcjLng = lng;
      if (lat != null && lng != null) {
        var conv = wgs84ToGcj02(lat, lng);
        gcjLat = conv.lat; gcjLng = conv.lng;
      }
      var deptName = '';
      try {
        if (rec.createdBy && rec.createdBy.departments && rec.createdBy.departments.length > 0) {
          deptName = rec.createdBy.departments[0].title || '';
        } else {
          var user = await db.getRepository('users').findOne({ filter: { id: userId }, appends: ['departments'] });
          if (user && user.departments && user.departments.length > 0) deptName = user.departments[0].title || '';
        }
      } catch (e) {}
      var isProject = deptName.indexOf('项目') !== -1;
      var WORK_END = isProject ? 18 * 60 : (17 * 60 + 30);
      var GRACE = 10;
      var checkTime = new Date(rec.check_time);
      var ctMin = checkTime.getHours() * 60 + checkTime.getMinutes();
      var timeIssues = [];
      if (ctMin < WORK_END - GRACE) timeIssues.push('早退' + (WORK_END - ctMin) + '分钟');
      // Geofence for check-out
      var matchedFence = null, minDist = Infinity, insideAny = false;
      if (gcjLat != null && gcjLng != null) {
        try {
          var fences = await db.getRepository('geofences').find({ filter: { is_active: true }, limit: 100 });
          for (var fi = 0; fi < (fences || []).length; fi++) {
            var fence = fences[fi];
            var poly;
            try { poly = JSON.parse(fence.polyline_coords); } catch (e) { continue; }
            if (!Array.isArray(poly) || poly.length < 2) continue;
            if (fence.bbox_min_lat != null && fence.bbox_max_lat != null && fence.bbox_min_lng != null && fence.bbox_max_lng != null) {
              var bufDeg = (fence.buffer_radius || 200) / 111320;
              var bufDegLng = bufDeg / Math.cos(gcjLat * _PI / 180);
              if (gcjLat < fence.bbox_min_lat - bufDeg || gcjLat > fence.bbox_max_lat + bufDeg || gcjLng < fence.bbox_min_lng - bufDegLng || gcjLng > fence.bbox_max_lng + bufDegLng) continue;
            }
            var dist = distanceToPolyline(gcjLat, gcjLng, poly);
            if (dist < minDist) { minDist = dist; matchedFence = fence; }
            if (dist <= (fence.buffer_radius || 200)) insideAny = true;
          }
        } catch (e) {}
      }
      var isInside = matchedFence ? minDist <= (matchedFence.buffer_radius || 200) : true;
      var uv = { geofence_inside: isInside, geofence_distance: minDist < Infinity ? Math.round(minDist) : null, geofence_id: matchedFence ? matchedFence.id : null };
      if (timeIssues.length > 0) { uv.check_result = 'abnormal'; uv.anomaly_reason = timeIssues.join('; '); }
      else { uv.check_result = 'normal'; }
      await repo.update({ filter: { id: rec.id }, values: uv });
    }
    // Mark duplicates
    for (var ri = 0; ri < userRecs.length; ri++) {
      var rec = userRecs[ri];
      if (!selectedIds[rec.id]) {
        await repo.update({ filter: { id: rec.id }, values: { check_result: 'duplicate', anomaly_reason: '重复打卡', is_overtime: false } });
      }
    }
    // Update archive for this user for this day
    if (earliestIn || latestOut) {
      var userId = g.userId;
      var d = new Date(ymd);
      var period = ymd.substring(0, 7);
      try {
        var archive = await archRepo.findOne({ filter: { period: period, createdBy: userId } });
        if (!archive) {
          await archRepo.create({ values: {
            period: period, archive_year: String(d.getFullYear()),
            total_work_days: 1, total_leave_days: 0,
            createdBy: userId,
            geofence_inside_days: 0, geofence_outside_days: 0, geofence_anomaly_count: 0
          } });
        } else {
          var av = { total_work_days: (archive.total_work_days || 0) + 1 };
          await archRepo.update({ filter: { id: archive.id }, values: av });
        }
      } catch (e) {}
    }
  }
}