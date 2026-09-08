"use strict";
const PrintTemplates = {
    name: 'print_templates',
    fields: [
        { type: 'string', name: 'name' },
        { type: 'string', name: 'mainCollection' },
        { type: 'text', name: 'description', nullable: true },
        { type: 'json', name: 'excelColumns', defaultValue: [] },
        { type: 'json', name: 'extraDataSources', defaultValue: [] },
        { type: 'json', name: 'templateSchema', nullable: true },
        { type: 'string', name: 'pageSize', defaultValue: 'A4' },
        { type: 'string', name: 'orientation', defaultValue: 'portrait' },
        { type: 'boolean', name: 'enabled', defaultValue: true },
        { type: 'belongsTo', name: 'createdBy', target: 'users' },
        { type: 'belongsTo', name: 'updatedBy', target: 'users' },
    ],
};
module.exports = PrintTemplates;
