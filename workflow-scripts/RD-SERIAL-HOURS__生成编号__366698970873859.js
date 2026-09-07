// genSerialNoV2 called with: dateFmt=yyyyMM, prefix=RD-GS, module=研发, field=year_month
{
  const now = new Date();
  let datePart;
  datePart = now.toISOString().slice(0, 7).replace('-', '');
  const fullPrefix = 'RD-GS-' + datePart + '-';
  const counterRepo = context.db.getRepository('sys_serial_counters');
  let counter = await counterRepo.findOne({ filter: { prefix: fullPrefix } });
  let result;
  if (!counter) {
    await counterRepo.create({ values: { prefix: fullPrefix, current_seq: 1, module: '研发' } });
    result = fullPrefix + '001';
  } else {
    const newSeq = counter.current_seq + 1;
    await counterRepo.update({ filter: { id: counter.id }, values: { current_seq: newSeq } });
    result = fullPrefix + String(newSeq).padStart(3, '0');
  }
  record.set('year_month', result);
  return result;
}