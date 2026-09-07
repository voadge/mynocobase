async function main(context) {
  const db = context.db;
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();
  const safetyRecords = await db.getRepository('safety_pre_shift').find({ filter: { meeting_date: { $gte: weekAgo } } });
  const constructionLogs = await db.getRepository('construction_daily_log').find({ filter: { log_date: { $gte: weekAgo } } });
  const issues = [];
  for (const s of safetyRecords) { if (s.issues_reported) issues.push({ source: '安全会', date: s.meeting_date, content: s.issues_reported }); }
  for (const l of constructionLogs) { if (l.safety_issues) issues.push({ source: '日志', date: l.log_date, content: l.safety_issues }); }
  return { period: `过7天 (${weekAgo.slice(0,10)} ~ ${new Date().toISOString().slice(0,10)})`, issueCount: issues.length, issues };
}