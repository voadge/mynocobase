async function main(context) {
  const db = context.db;
  const today = new Date();
  const thirtyDays = new Date(today.getTime() + 30*24*60*60*1000).toISOString();
  const quals = await db.getRepository('qualifications').find({ filter: { expiry_date: { $lte: thirtyDays } } });
  const certs = await db.getRepository('contracts').find({ filter: { expiry_date: { $lte: thirtyDays }, status: { $ne: '已归档' } } });
  const warnings = [];
  for (const q of quals) { warnings.push({ type: '资质', name: q.qual_name, expiry: q.expiry_date }); }
  for (const c of certs) { warnings.push({ type: '合同', name: c.contract_name, expiry: c.expiry_date }); }
  return { today: today.toISOString(), warningCount: warnings.length, warnings };
}