// 施工日志简报生成模板
// 输入：$context.data — construction_daily_log 记录
// 输出：对象 { title, summary, briefing_type, briefing_date, project_id }

function renderBriefing() {
  const log = $context.data || {};
  const project = log.project_id_id || {};
  const reviewer = log.reviewer_id_id || {};
  const approver = log.approver_id_id || {};

  var ts = log.log_date;
  var date = '未知日期';
  if (ts) {
    if (typeof ts === 'number') {
      date = new Date(ts * 1000).toISOString().slice(0, 10);
    } else if (typeof ts === 'string') {
      date = ts.slice(0, 10);
    }
  }

  // 安全转义
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var projectName = esc(project.project_name || '');
  var summaryContent = esc(log.summary_content || '');
  var equipmentUsage = esc(log.equipment_usage || '');
  var materialUsage = esc(log.material_usage || '');
  var personnelCount = log.personnel_count || '';
  var safetyIssues = esc(log.safety_issues || '无');
  var tomorrowPlan = esc(log.tomorrow_plan || '');
  var reviewerName = esc(reviewer.nickname || reviewer.username || '');
  var approverName = esc(approver.nickname || approver.username || '');

  var html = '<div class="bc-card">' +
    '<div class="bc-hd">' +
      '<strong>' + projectName + '</strong>' +
      '<span>' + date + (log.weather ? '  ' + esc(log.weather) : '') + '</span>' +
    '</div>' +
    '<div class="bc-sec">' +
      '<div class="bc-row"><label>施工内容</label><p>' + summaryContent + '</p></div>' +
      '<div class="bc-row"><label>资源投入</label><p>' +
        (equipmentUsage ? equipmentUsage + ' | ' : '') +
        (materialUsage ? '材料:' + materialUsage + ' | ' : '') +
        (personnelCount ? '人员:' + personnelCount : '') +
      '</p></div>' +
      '<div class="bc-row"><label>安全情况</label><p>' + safetyIssues + '</p></div>' +
      '<div class="bc-row"><label>明日计划</label><p>' + tomorrowPlan + '</p></div>' +
    '</div>' +
    '<div class="bc-ft">' +
      '资料员: ' + reviewerName + '  审批人: ' + approverName +
    '</div>' +
  '</div>';

  return {
    title: '[' + projectName + '] 施工日志日报 - ' + date,
    summary: html,
    briefing_type: '施工日志',
    briefing_date: { '$date': new Date().toISOString() },
    project_id: project.id || log.project_id || null
  };
}
