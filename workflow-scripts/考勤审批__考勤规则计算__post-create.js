// ---- WGS-84 → GCJ-02 坐标转换 ----
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

// ---- Haversine 距离 ----
function haversineDist(lat1, lon1, lat2, lon2) {
  var R = 6371000, toRad = _PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---- 点到折线最短距离 ----
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

// ---- 主入口 ----
async function main(context) {
  var record = context.data;
  if (!record) return;

  var checkType = record.check_type;
  var isLeave = (checkType === '请假' || checkType === '出差');
  var db = context.db;
  var repo = db.getRepository('attendance_records');

  // ---- 请假/出差：计算天数和审批级别 ----
  if (isLeave) {
    var sd = record.start_date;
    var ed = record.end_date;
    if (sd && ed) {
      var startMs = new Date(sd).getTime();
      var endMs = new Date(ed).getTime();
      var days = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
      var level, workflowStatus;
      if (days <= 1) { level = 1; workflowStatus = 'level1_pending'; }
      else if (days <= 3) { level = 2; workflowStatus = 'level2_pending'; }
      else if (days <= 7) { level = 3; workflowStatus = 'level3a_pending'; }
      else { level = 4; workflowStatus = 'level4_pending'; }
      await repo.update({ filter: { id: record.id }, values: { days: days, workflow_status: workflowStatus } });
    }
    return;
  }

  // ---- 签到/签退 统一为 上班/下班 ----
  if (checkType === '签到') checkType = '上班';
  if (checkType === '签退') checkType = '下班';

  var userId = record.createdById || record.createdBy;
  if (!userId) return;

  // ---- 坐标转换：WGS-84 → GCJ-02 ----
  var lat = record.latitude ? parseFloat(record.latitude) : null;
  var lng = record.longitude ? parseFloat(record.longitude) : null;
  var gcjLat = lat, gcjLng = lng;
  if (lat != null && lng != null) {
    var converted = wgs84ToGcj02(lat, lng);
    gcjLat = converted.lat; gcjLng = converted.lng;
  }

  // ---- 查用户部门作息 ----
  var deptName = '';
  try {
    var user = await db.getRepository('users').findOne({ filter: { id: userId }, appends: ['departments'] });
    if (user && user.departments && user.departments.length > 0) {
      deptName = user.departments[0].title || '';
    }
  } catch (e) {}

  var isProject = deptName.indexOf('项目') !== -1;
  var WORK_START = isProject ? 8 * 60 : 9 * 60;
  var WORK_END = isProject ? 18 * 60 : (17 * 60 + 30);
  var GRACE = 10;

  var checkTime = new Date(record.check_time);
  var ctMin = checkTime.getHours() * 60 + checkTime.getMinutes();
  var dow = checkTime.getDay();
  var isWeekend = (dow === 0 || dow === 6);

  // ---- 时间判定 ----
  var timeIssues = [];
  if (checkType === '上班' && ctMin > WORK_START + GRACE) {
    timeIssues.push('迟到' + (ctMin - WORK_START) + '分钟');
  } else if (checkType === '下班' && ctMin < WORK_END - GRACE) {
    timeIssues.push('早退' + (WORK_END - ctMin) + '分钟');
  }

  // ---- 围栏校验：全围栏匹配（合并原围栏校验工作流逻辑） ----
  var matchedFence = null, minDist = Infinity, insideAny = false;
  if (gcjLat != null && gcjLng != null) {
    try {
      var fences = await db.getRepository('geofences').find({ filter: { is_active: true }, limit: 100 });
      for (var fi = 0; fi < (fences || []).length; fi++) {
        var fence = fences[fi];
        var poly;
        try { poly = JSON.parse(fence.polyline_coords); } catch (e) { continue; }
        if (!Array.isArray(poly) || poly.length < 2) continue;

        // Bbox 预过滤加速
        if (fence.bbox_min_lat != null && fence.bbox_max_lat != null && fence.bbox_min_lng != null && fence.bbox_max_lng != null) {
          var bufDeg = (fence.buffer_radius || 200) / 111320;
          var bufDegLng = bufDeg / Math.cos(gcjLat * _PI / 180);
          if (gcjLat < fence.bbox_min_lat - bufDeg || gcjLat > fence.bbox_max_lat + bufDeg ||
              gcjLng < fence.bbox_min_lng - bufDegLng || gcjLng > fence.bbox_max_lng + bufDegLng) {
            continue;
          }
        }

        var dist = distanceToPolyline(gcjLat, gcjLng, poly);
        if (dist < minDist) { minDist = dist; matchedFence = fence; }
        if (dist <= (fence.buffer_radius || 200)) insideAny = true;
      }
    } catch (e) {}
  }

  var bufRadius = matchedFence ? matchedFence.buffer_radius : 200;
  var isInside = matchedFence ? minDist <= bufRadius : true;

  // ---- 基地外打卡 → 检查出差申请 ----
  var locIssues = [];
  if (!insideAny && lat != null && lng != null) {
    var today = record.check_time ? record.check_time.substring(0, 10) : new Date().toISOString().substring(0, 10);
    var bizTrip = await db.getRepository('attendance_records').findOne({
      filter: { createdById: userId, check_type: '出差', workflow_status: 'approved', start_date: { $lte: today }, end_date: { $gte: today } },
      limit: 1
    });
    if (!bizTrip) {
      locIssues.push('基地外打卡（无出差申请）');
    }
  }

  // ---- 综合结果 ----
  var allIssues = timeIssues.concat(locIssues);
  var checkResult = 'normal';
  if (isWeekend) { checkResult = 'overtime'; }
  else if (allIssues.length > 0) { checkResult = 'abnormal'; }

  var updateValues = {
    check_result: checkResult, is_overtime: isWeekend, workflow_status: 'approved',
    geofence_inside: isInside, geofence_distance: minDist < Infinity ? Math.round(minDist) : null,
    geofence_id: matchedFence ? matchedFence.id : null
  };

  if (isWeekend && allIssues.length === 0) { updateValues.anomaly_reason = '加班'; }
  else if (allIssues.length > 0) { updateValues.anomaly_reason = allIssues.join('; '); }
  else if (!isInside && matchedFence) { updateValues.anomaly_reason = '围栏外打卡(距最近围栏' + Math.round(minDist) + '米)'; }

  await repo.update({ filter: { id: record.id }, values: updateValues });

  // ---- 更新归档统计（按月 period = YYYY-MM，upsert 模式） ----
  try {
    var d = new Date();
    var period = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var archive = await db.getRepository('att_archives').findOne({ filter: { period: period, createdBy: userId } });
    if (!archive) {
      await db.getRepository('att_archives').create({
        values: {
          period: period, archive_year: String(d.getFullYear()),
          total_work_days: 1, total_leave_days: 0,
          createdBy: userId,
          geofence_inside_days: isInside ? 1 : 0, geofence_outside_days: isInside ? 0 : 1, geofence_anomaly_count: isInside ? 0 : 1
        }
      });
    } else {
      var uv = {};
      if (isInside) { uv.geofence_inside_days = (archive.geofence_inside_days || 0) + 1; }
      else { uv.geofence_outside_days = (archive.geofence_outside_days || 0) + 1; uv.geofence_anomaly_count = (archive.geofence_anomaly_count || 0) + 1; }
      uv.total_work_days = (archive.total_work_days || 0) + 1;
      await db.getRepository('att_archives').update({ filter: { id: archive.id }, values: uv });
    }
  } catch (e) {
    // 唯一约束冲突或并发创建时静默忽略
  }
}
