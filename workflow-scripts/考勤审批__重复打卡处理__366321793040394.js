async function main(context) {
  var record = context.data;
  if (!record || !['上班', '下班'].includes(record.check_type)) {
    return { action: 'normal' };
  }

  var db = context.db;
  var uid = record.createdById || record.createdBy;
  if (!uid) return { action: 'no_user' };

  var today = new Date();
  var todayStart = today.toISOString().substring(0, 10) + 'T00:00:00.000Z';
  var todayEnd = today.toISOString().substring(0, 10) + 'T23:59:59.999Z';

  var sortOrder = record.check_type === '上班' ? 'check_time' : '-check_time';

  try {
    var existing = await db.getRepository('attendance_records').find({
      filter: {
        createdById: uid,
        check_type: record.check_type,
        createdAt: { $between: [todayStart, todayEnd] },
        dedup_status: 'primary'
      },
      sort: sortOrder,
      pageSize: 1
    });

    if (!existing || existing.length === 0) {
      await db.getRepository('attendance_records').update({
        filter: { id: record.id },
        values: { dedup_status: 'primary' }
      });
      return { action: 'primary' };
    }

    await db.getRepository('attendance_records').update({
      filter: { id: record.id },
      values: { dedup_status: 'duplicate' }
    });
    return { action: 'duplicate' };
  } catch (e) {
    return { action: 'error', error: e.message };
  }
}
