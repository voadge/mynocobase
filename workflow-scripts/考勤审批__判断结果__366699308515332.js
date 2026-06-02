async function main(context) {
    // 一级审批结果判断
    // context.approval.status: 'approved' | 'rejected'
    var status = context.approval ? context.approval.status : 'approved';
    if (status === 'approved') {
        context.data.workflow_status = 'level1_approved';
    } else {
        context.data.workflow_status = 'rejected';
        context.data.rejection_reason = context.approval.reason || '一级审批驳回';
    }
    return true;
}
