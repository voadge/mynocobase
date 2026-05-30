async function main(context) {
  const db = context.db;
  const timers = ['TIMER-1','TIMER-2','TIMER-3','TIMER-4'];
  const status = {};
  for (const t of timers) {
    const wfs = await db.getRepository('workflows').find({ filter: { title: t } });
    status[t] = wfs.length > 0 ? (wfs[0].enabled ? 'OK' : 'DISABLED') : 'MISSING';
  }
  return { checkTime: new Date().toISOString(), timers: status };
}