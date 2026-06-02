async function main(context) {
    // 二级审批结果判断（最终审批）
    // context.approval.status: 'approved' | 'rejected'
    var status = context.approval ? context.approval.status : 'approved';
    if (status === 'approved') {
        context.data.workflow_status = 'approved';
    } else {
        context.data.workflow_status = 'rejected';
        context.data.rejection_reason = context.approval.reason || '二级审批驳回';
    }
    return true;
}
