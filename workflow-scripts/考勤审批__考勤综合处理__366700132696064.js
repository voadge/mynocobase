async function main(context) {
    var status = context.approval ? context.approval.status : 'approved';
    if (status === 'approved') {
        context.data.workflow_status = 'approved';
        
        // 更新请假归档统计
        try {
            var record = context.data;
            if (record.check_type === '请假' || record.check_type === '出差' || record.check_type === '调休') {
                var year = new Date().getFullYear().toString();
                var userId = record.createdById || record.createdBy;
                
                // 计算请假天数
                var startDate = new Date(record.start_date);
                var endDate = new Date(record.end_date);
                var leaveDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                if (leaveDays < 1) leaveDays = 1;
                
                // 查找或创建归档记录
                var archive = await context.db.getRepository('att_archives').findOne({
                    filter: { archive_year: year, createdBy: userId }
                });
                
                if (!archive) {
                    try {
                        await context.db.getRepository('att_archives').create({
                            values: {
                                archive_year: year,
                                total_work_days: 0,
                                total_leave_days: leaveDays,
                                createdBy: userId,
                                geofence_inside_days: 0,
                                geofence_outside_days: 0,
                                geofence_anomaly_count: 0
                            }
                        });
                    } catch(e) {}
                } else {
                    var updateValues = {
                        total_leave_days: (archive.total_leave_days || 0) + leaveDays
                    };
                    await context.db.getRepository('att_archives').update({
                        filter: { id: archive.id },
                        values: updateValues
                    });
                }
            }
        } catch(e) {}
        
        return true;
    } else {
        context.data.workflow_status = 'rejected';
        context.data.rejection_reason = context.approval.reason || '二级审批驳回';
        return false;
    }
}
