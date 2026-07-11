"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExcelExporter = void 0;
const xlsx_1 = __importDefault(require("xlsx"));
const dayjs_1 = __importDefault(require("dayjs"));
class ExcelExporter {
    constructor(app, db) {
        this.app = app;
        this.db = db;
    }
    async export(template, recordIds) {
        const wb = xlsx_1.default.utils.book_new();
        const schema = template.templateSchema;
        // v2: Use blocks for export columns
        if (schema?.blocks && schema.blocks.length > 0) {
            for (const block of schema.blocks) {
                if (block.type === 'table' && block.dataSource) {
                    // Table block: export as a separate sheet
                    const rows = await this.fetchBlockData(block, template.mainCollection, recordIds);
                    if (rows.length > 0) {
                        const cols = this.blockFieldsToExcelColumns(block.fields);
                        const sheet = this.buildSheet(cols, rows);
                        xlsx_1.default.utils.book_append_sheet(wb, sheet, this.safeSheetName(block.title || block.collection));
                    }
                }
                else if (block.type === 'details' || block.type === 'form') {
                    // Details/form block: export as main sheet
                    const mainRows = await this.fetchMainData(template, recordIds);
                    const cols = this.blockFieldsToExcelColumns(block.fields);
                    const sheet = this.buildSheet(cols, mainRows);
                    xlsx_1.default.utils.book_append_sheet(wb, sheet, this.safeSheetName(block.title || 'Main'));
                }
            }
        }
        else {
            // Legacy: Use excelColumns
            const mainRows = await this.fetchMainDataLegacy(template, recordIds);
            const mainSheet = this.buildSheet(template.excelColumns, mainRows);
            xlsx_1.default.utils.book_append_sheet(wb, mainSheet, this.safeSheetName(template.name));
            for (const ds of template.extraDataSources || []) {
                const rows = await this.fetchExtraData(ds, recordIds);
                if (rows.length) {
                    const cols = this.inferColumns(rows[0]);
                    const sheet = this.buildSheet(cols, rows);
                    xlsx_1.default.utils.book_append_sheet(wb, sheet, this.safeSheetName(ds.alias));
                }
            }
        }
        return Buffer.from(xlsx_1.default.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    }
    blockFieldsToExcelColumns(fields) {
        return fields.map(f => ({
            field: f.name,
            header: f.label || f.name,
            width: this.parseWidth(f.width) || 15,
            formatter: this.interfaceToFormatter(f.interface, f.format),
        }));
    }
    interfaceToFormatter(iface, format) {
        if (iface === 'date')
            return 'date';
        if (iface === 'datetime' || iface === 'updatedAt' || iface === 'createdAt')
            return 'datetime';
        if (iface === 'number' || iface === 'integer' || iface === 'decimal' || iface === 'percent')
            return 'number';
        return 'text';
    }
    parseWidth(w) {
        if (!w)
            return undefined;
        const n = parseInt(w);
        return isNaN(n) ? undefined : n;
    }
    async fetchMainData(template, ids) {
        const schema = template.templateSchema;
        const appends = this.extractAppendsFromBlocks(schema.blocks || []);
        return this.db.getRepository(template.mainCollection).find({
            filter: { id: { $in: ids } },
            appends,
            sort: 'createdAt',
        });
    }
    async fetchBlockData(block, mainCollection, mainIds) {
        // For table blocks with a dataSource path, resolve the relation
        const ds = block.dataSource || '';
        const appends = this.extractAppendsFromFields(block.fields);
        if (ds.includes('.')) {
            // Nested relation path like "items" or "createdBy.projects"
            const repo = this.db.getRepository(block.collection);
            return repo.find({
                filter: {},
                appends,
                sort: block.sort || 'createdAt',
            });
        }
        else {
            // Direct collection
            const repo = this.db.getRepository(block.collection);
            return repo.find({
                filter: block.filter || {},
                appends,
                sort: block.sort || 'createdAt',
            });
        }
    }
    extractAppendsFromBlocks(blocks) {
        const appends = new Set();
        for (const block of blocks) {
            for (const append of block.appends || []) {
                appends.add(append);
            }
            for (const field of block.fields || []) {
                if (field.isRelation && field.target) {
                    appends.add(field.name);
                }
            }
        }
        return Array.from(appends);
    }
    extractAppendsFromFields(fields) {
        const appends = new Set();
        for (const field of fields) {
            if (field.isRelation && field.target) {
                appends.add(field.name);
            }
        }
        return Array.from(appends);
    }
    /* ----- Legacy methods ----- */
    async fetchMainDataLegacy(template, ids) {
        const appends = this.extractAppendsLegacy(template.excelColumns);
        return this.db.getRepository(template.mainCollection).find({
            filter: { id: { $in: ids } },
            appends,
            sort: 'createdAt',
        });
    }
    async fetchExtraData(ds, mainIds) {
        const repo = this.db.getRepository(ds.collectionName);
        const filter = ds.linkField ? { [ds.linkField]: { $in: mainIds } } : (ds.filter || {});
        return repo.find({ filter, appends: ds.appends, sort: ds.sort });
    }
    extractAppendsLegacy(columns) {
        const appends = new Set();
        for (const col of columns) {
            const parts = col.field.split('.');
            if (parts.length > 1)
                appends.add(parts[0]);
        }
        return Array.from(appends);
    }
    buildSheet(columns, rows) {
        const data = rows.map((r) => {
            const row = {};
            for (const col of columns) {
                row[col.header] = this.getValue(r, col.field, col.formatter);
            }
            return row;
        });
        const ws = xlsx_1.default.utils.json_to_sheet(data);
        ws['!cols'] = columns.map((c) => ({ wch: c.width || 15 }));
        return ws;
    }
    getValue(obj, path, formatter) {
        const val = path.split('.').reduce((o, k) => o?.[k], obj);
        return this.formatValue(val, formatter);
    }
    formatValue(val, formatter) {
        if (val == null)
            return '';
        if (formatter === 'date')
            return (0, dayjs_1.default)(val).format('YYYY-MM-DD');
        if (formatter === 'datetime')
            return (0, dayjs_1.default)(val).format('YYYY-MM-DD HH:mm:ss');
        if (formatter === 'number')
            return Number(val);
        return String(val);
    }
    inferColumns(sample) {
        return Object.keys(this.flatten(sample)).map((k) => ({
            field: k,
            header: k,
            width: 15,
            formatter: 'text',
        }));
    }
    flatten(obj, prefix = '') {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                Object.assign(out, this.flatten(v, prefix + k + '_'));
            }
            else {
                out[prefix + k] = v;
            }
        }
        return out;
    }
    safeSheetName(name) {
        return name.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
    }
}
exports.ExcelExporter = ExcelExporter;
