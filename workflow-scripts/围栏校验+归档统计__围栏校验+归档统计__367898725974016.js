async function main(context) {
  const record = context.data;
  const { latitude, longitude, check_type } = record;

  // 非上班/下班直接跳过
  if (check_type !== '上班' && check_type !== '下班') {
    return { skipped: true, reason: '非上班/下班，跳过围栏校验' };
  }

  // 获取所有启用的围栏
  const geofences = await context.db.getRepository('geofences').find({
    where: { is_active: true }
  });

  if (!geofences || geofences.length === 0 || !latitude || !longitude) {
    await context.db.getRepository('attendance_records').update({
      filter: { id: record.id },
      values: {
        geofence_inside: true,
        geofence_distance: 0,
        geofence_id: null
      }
    });
    return { isInside: true, reason: '未配置围栏或无GPS，默认通过' };
  }

  // Haversine 公式
  function haversineDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
    const dAC = haversineDist(lat, lon, lat1, lon1);
    const dBC = haversineDist(lat, lon, lat2, lon2);
    const dAB = haversineDist(lat1, lon1, lat2, lon2);
    if (dAB < 1) return dAC;
    const cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
    const cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
    if (cosA <= 0) return dAC;
    if (cosB <= 0) return dBC;
    const s = (dAC + dBC + dAB) / 2;
    const area = Math.sqrt(Math.max(0, s * (s - dAC) * (s - dBC) * (s - dAB)));
    return area * 2 / dAB;
  }

  function distanceToPolyline(lat, lon, polyline) {
    let minDist = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
      const dist = pointToSegmentDistance(
        lat, lon,
        polyline[i][1], polyline[i][0],
        polyline[i + 1][1], polyline[i + 1][0]
      );
      if (dist < minDist) minDist = dist;
    }
    return Math.round(minDist);
  }

  // Bbox 预过滤 + 距离计算
  let minDist = Infinity;
  let matchedFence = null;

  for (const fence of geofences) {
    if (fence.bbox_min_lat != null && fence.bbox_max_lat != null &&
        fence.bbox_min_lng != null && fence.bbox_max_lng != null) {
      if (latitude < fence.bbox_min_lat || latitude > fence.bbox_max_lat ||
          longitude < fence.bbox_min_lng || longitude > fence.bbox_max_lng) {
        continue;
      }
    }
    let polyline;
    try { polyline = JSON.parse(fence.polyline_coords); } catch(e) { continue; }
    if (!Array.isArray(polyline) || polyline.length < 2) continue;
    const dist = distanceToPolyline(latitude, longitude, polyline);
    if (dist < minDist) { minDist = dist; matchedFence = fence; }
  }

  const bufferRadius = matchedFence ? matchedFence.buffer_radius : 200;
  const isInside = matchedFence ? minDist <= bufferRadius : true;

  // 更新 attendance_records
  await context.db.getRepository('attendance_records').update({
    filter: { id: record.id },
    values: {
      geofence_inside: isInside,
      geofence_distance: minDist < Infinity ? minDist : null,
      geofence_id: matchedFence ? matchedFence.id : null
    }
  });

  if (!isInside && matchedFence) {
    await context.db.getRepository('attendance_records').update({
      filter: { id: record.id },
      values: { anomaly_reason: '围栏外打卡(距最近围栏' + minDist + '米)' }
    });
  }

  // 更新 att_archives 统计
  try {
    const year = new Date().getFullYear().toString();
    let archive = await context.db.getRepository('att_archives').findOne({
      filter: { archive_year: year, createdBy: record.createdById || record.createdBy }
    });
    if (!archive) {
      try {
        await context.db.getRepository('att_archives').create({
          values: {
            archive_year: year,
            total_work_days: 1,
            total_leave_days: 0,
            createdBy: record.createdById || record.createdBy,
            geofence_inside_days: isInside ? 1 : 0,
            geofence_outside_days: isInside ? 0 : 1,
            geofence_anomaly_count: isInside ? 0 : 1
          }
        });
      } catch(e) {}
    } else {
      const uv = {};
      if (isInside) {
        uv.geofence_inside_days = (archive.geofence_inside_days || 0) + 1;
        uv.total_work_days = (archive.total_work_days || 0) + 1;
      } else {
        uv.geofence_outside_days = (archive.geofence_outside_days || 0) + 1;
        uv.geofence_anomaly_count = (archive.geofence_anomaly_count || 0) + 1;
        uv.total_work_days = (archive.total_work_days || 0) + 1;
      }
      await context.db.getRepository('att_archives').update({
        filter: { id: archive.id },
        values: uv
      });
    }
  } catch(e) {}

  return {
    isInside,
    distance: minDist,
    fenceName: matchedFence ? matchedFence.fence_name : null,
    bufferRadius,
    reason: isInside ? '围栏内打卡' : '围栏外打卡(' + minDist + '米)'
  };
}
