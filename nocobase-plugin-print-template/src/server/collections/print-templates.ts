export const PrintTemplateCollection = {
  name: 'print_templates',
  fields: [
    { type: 'string', name: 'name', required: true, uiSchema: { title: '模板名称' } },
    { type: 'string', name: 'mainCollection', required: true, uiSchema: { title: '主集合' } },
    { type: 'string', name: 'description', uiSchema: { title: '说明' } },
    {
      type: 'json',
      name: 'excelColumns',
      defaultValue: [],
      uiSchema: {
        type: 'array',
        'x-component': 'Collection',
        title: 'Excel 列',
        properties: {
          field: { type: 'string', title: '字段路径', required: true },
          header: { type: 'string', title: '表头', required: true },
          width: { type: 'number', title: '宽度', default: 15 },
          formatter: { type: 'string', title: '格式', enum: ['date', 'datetime', 'number', 'text'], default: 'text' },
        },
      },
    },
    {
      type: 'json',
      name: 'extraDataSources',
      defaultValue: [],
      uiSchema: {
        type: 'array',
        'x-component': 'Collection',
        title: '关联数据源',
        properties: {
          alias: { type: 'string', title: '别名', required: true },
          collectionName: { type: 'string', title: '集合', required: true },
          queryType: { type: 'string', enum: ['findOne', 'find'], default: 'find' },
          filter: { type: 'json', title: '固定过滤', 'x-component': 'JsonEditor' },
          appends: { type: 'array', items: { type: 'string' }, title: '关联预加载' },
          linkField: { type: 'string', title: '关联主表字段' },
        },
      },
    },
    {
      type: 'json',
      name: 'templateSchema',
      uiSchema: { title: '模板布局' },
    },
    { type: 'string', name: 'pageSize', defaultValue: 'A4', enum: ['A4', 'A3'] },
    { type: 'string', name: 'orientation', defaultValue: 'portrait', enum: ['portrait', 'landscape'] },
    { type: 'boolean', name: 'enabled', defaultValue: true, uiSchema: { title: '启用' } },
  ],
};
