// genSerialNoV2 called with: dateFmt=yyyyMMdd, prefix=JH, module=物资, field=plan_no
{
  const now = new Date();
  let datePart;
  datePart = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const fullPrefix = 'JH-' + datePart + '-';
  const counterRepo = context.db.getRepository('sys_serial_counters');
  let counter = await counterRepo.findOne({ filter: { prefix: fullPrefix } });
  let result;
  if (!counter) {
    await counterRepo.create({ values: { prefix: fullPrefix, current_seq: 1, module: '物资' } });
    result = fullPrefix + '001';
  } else {
    const newSeq = counter.current_seq + 1;
    await counterRepo.update({ filter: { id: counter.id }, values: { current_seq: newSeq } });
    result = fullPrefix + String(newSeq).padStart(3, '0');
  }
  record.set('plan_no', result);
  return result;
}