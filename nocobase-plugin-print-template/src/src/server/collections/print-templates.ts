import { defineCollection } from '@nocobase/database';

export default defineCollection({
  name: 'print_templates',
  fields: [
    { type: 'string', name: 'name', comment: '模板名称' },
    { type: 'string', name: 'mainCollection', comment: '主集合' },
    { type: 'text', name: 'description', nullable: true },
    { type: 'json', name: 'excelColumns', defaultValue: [] },
    { type: 'json', name: 'extraDataSources', defaultValue: [] },
    { type: 'json', name: 'templateSchema', nullable: true },
    { type: 'string', name: 'pageSize', defaultValue: 'A4' },
    { type: 'string', name: 'orientation', defaultValue: 'portrait' },
    { type: 'boolean', name: 'enabled', defaultValue: true },
  ],
});
