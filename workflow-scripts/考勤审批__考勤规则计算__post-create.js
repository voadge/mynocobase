// 写入考勤数据（请假/出差/调休）
// 对应服务端工作流「3.考勤打卡+审批v2.0」的写入考勤数据节点
// 上班/下班打卡数据由定时工作流「3.打卡考勤+计算v1.0」统一处理

async function main(context) {
  var record = context.data;
  if (!record) return;
  var checkType = record.check_type;
  var db = context.db;
  var repo = db.getRepository('attendance_records');

  // === 请假/出差/调休 处理 ===
  if (checkType === '请假' || checkType === '出差' || checkType === '调休') {
    var ws = record.workflow_status;
    if (ws === 'approved') {
      var leaveDays = record.days || 1;
      await repo.update({ filter: { id: record.id }, values: { check_result: 'leave', anomaly_reason: record.check_type === '出差' ? '出差中' : (record.check_type === '调休' ? '调休中' : '请假中'), is_overtime: false } });
      try {
        var userId = record.createdById || record.createdBy;
        if (userId) {
          var d = new Date();
          var period = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          var archRepo = db.getRepository('att_archives');
          var arch = await archRepo.findOne({ filter: { period: period, createdBy: userId } });
          if (!arch) {
            await archRepo.create({ values: { period: period, archive_year: String(d.getFullYear()), total_work_days: 0, total_leave_days: leaveDays, createdBy: userId, geofence_inside_days: 0, geofence_outside_days: 0, geofence_anomaly_count: 0 } });
          } else {
            await archRepo.update({ filter: { id: arch.id }, values: { total_leave_days: (arch.total_leave_days || 0) + leaveDays } });
          }
        }
      } catch (e) {}
      return;
    }
    if (ws === 'rejected') {
      await repo.update({ filter: { id: record.id }, values: { check_result: 'abnormal', anomaly_reason: '审批驳回', is_overtime: false } });
      return;
    }
    var sd = record.start_date;
    var ed = record.end_date;
    if (sd && ed) {
      var startMs = new Date(sd).getTime();
      var endMs = new Date(ed).getTime();
      var days = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1);
      await repo.update({ filter: { id: record.id }, values: { days: days } });
    }
    return;
  }

  // === 上班/下班：仅保存原始打卡数据（改 workflow_status 会触发循环）===
  if (checkType !== '上班' && checkType !== '下班' && checkType !== '签到' && checkType !== '签退') return;
  var uv = {};
  if (record.geofence_inside != null) uv.geofence_inside = record.geofence_inside;
  if (record.geofence_distance != null) uv.geofence_distance = record.geofence_distance;
  if (record.geofence_id != null) uv.geofence_id = record.geofence_id;
  if (record.latitude != null) uv.latitude = record.latitude;
  if (record.longitude != null) uv.longitude = record.longitude;
  if (record.gps_accuracy != null) uv.gps_accuracy = record.gps_accuracy;
  if (record.gps_state) uv.gps_state = record.gps_state;
  await repo.update({ filter: { id: record.id }, values: uv });
}
