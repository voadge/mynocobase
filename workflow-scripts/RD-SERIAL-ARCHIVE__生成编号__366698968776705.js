// genSerialNoV2 called with: dateFmt=yyyy, prefix=RD-GD, module=研发, field=archive_no
{
  const now = new Date();
  let datePart;
  datePart = String(now.getFullYear());
  const fullPrefix = 'RD-GD-' + datePart + '-';
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
  record.set('archive_no', result);
  return result;
}