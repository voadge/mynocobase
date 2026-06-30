import XLSX from 'xlsx';
import dayjs from 'dayjs';
import { PrintTemplate, ExcelColumn, Block, BlockField } from '../types';

export class ExcelExporter {
  private db: any;

  constructor(private app: any, db: any) {
    this.db = db;
  }

  async export(template: PrintTemplate, recordIds: string[]): Promise<Buffer> {
    const wb = XLSX.utils.book_new();
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
            XLSX.utils.book_append_sheet(wb, sheet, this.safeSheetName(block.title || block.collection));
          }
        } else if (block.type === 'details' || block.type === 'form') {
          // Details/form block: export as main sheet
          const mainRows = await this.fetchMainData(template, recordIds);
          const cols = this.blockFieldsToExcelColumns(block.fields);
          const sheet = this.buildSheet(cols, mainRows);
          XLSX.utils.book_append_sheet(wb, sheet, this.safeSheetName(block.title || 'Main'));
        }
      }
    } else {
      // Legacy: Use excelColumns
      const mainRows = await this.fetchMainDataLegacy(template, recordIds);
      const mainSheet = this.buildSheet(template.excelColumns, mainRows);
      XLSX.utils.book_append_sheet(wb, mainSheet, this.safeSheetName(template.name));

      for (const ds of template.extraDataSources || []) {
        const rows = await this.fetchExtraData(ds, recordIds);
        if (rows.length) {
          const cols = this.inferColumns(rows[0]);
          const sheet = this.buildSheet(cols, rows);
          XLSX.utils.book_append_sheet(wb, sheet, this.safeSheetName(ds.alias));
        }
      }
    }

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private blockFieldsToExcelColumns(fields: BlockField[]): ExcelColumn[] {
    return fields.map(f => ({
      field: f.name,
      header: f.label || f.name,
      width: this.parseWidth(f.width) || 15,
      formatter: this.interfaceToFormatter(f.interface, f.format),
    }));
  }

  private interfaceToFormatter(iface: string, format?: string): ExcelColumn['formatter'] {
    if (iface === 'date') return 'date';
    if (iface === 'datetime' || iface === 'updatedAt' || iface === 'createdAt') return 'datetime';
    if (iface === 'number' || iface === 'integer' || iface === 'decimal' || iface === 'percent') return 'number';
    return 'text';
  }

  private parseWidth(w?: string): number | undefined {
    if (!w) return undefined;
    const n = parseInt(w);
    return isNaN(n) ? undefined : n;
  }

  private async fetchMainData(template: PrintTemplate, ids: string[]) {
    const schema = template.templateSchema!;
    const appends = this.extractAppendsFromBlocks(schema.blocks || []);
    return this.db.getRepository(template.mainCollection).find({
      filter: { id: { $in: ids } },
      appends,
      sort: 'createdAt',
    });
  }

  private async fetchBlockData(block: Block, mainCollection: string, mainIds: string[]) {
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
    } else {
      // Direct collection
      const repo = this.db.getRepository(block.collection);
      return repo.find({
        filter: block.filter || {},
        appends,
        sort: block.sort || 'createdAt',
      });
    }
  }

  private extractAppendsFromBlocks(blocks: Block[]): string[] {
    const appends = new Set<string>();
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

  private extractAppendsFromFields(fields: BlockField[]): string[] {
    const appends = new Set<string>();
    for (const field of fields) {
      if (field.isRelation && field.target) {
        appends.add(field.name);
      }
    }
    return Array.from(appends);
  }

  /* ----- Legacy methods ----- */

  private async fetchMainDataLegacy(template: PrintTemplate, ids: string[]) {
    const appends = this.extractAppendsLegacy(template.excelColumns);
    return this.db.getRepository(template.mainCollection).find({
      filter: { id: { $in: ids } },
      appends,
      sort: 'createdAt',
    });
  }

  private async fetchExtraData(ds: any, mainIds: string[]) {
    const repo = this.db.getRepository(ds.collectionName);
    const filter = ds.linkField ? { [ds.linkField]: { $in: mainIds } } : (ds.filter || {});
    return repo.find({ filter, appends: ds.appends, sort: ds.sort });
  }

  private extractAppendsLegacy(columns: ExcelColumn[]): string[] {
    const appends = new Set<string>();
    for (const col of columns) {
      const parts = col.field.split('.');
      if (parts.length > 1) appends.add(parts[0]);
    }
    return Array.from(appends);
  }

  private buildSheet(columns: ExcelColumn[], rows: any[]) {
    const data = rows.map((r) => {
      const row: Record<string, any> = {};
      for (const col of columns) {
        row[col.header] = this.getValue(r, col.field, col.formatter);
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = columns.map((c) => ({ wch: c.width || 15 }));
    return ws;
  }

  private getValue(obj: any, path: string, formatter: ExcelColumn['formatter']) {
    const val = path.split('.').reduce((o, k) => o?.[k], obj);
    return this.formatValue(val, formatter);
  }

  private formatValue(val: any, formatter: ExcelColumn['formatter']) {
    if (val == null) return '';
    if (formatter === 'date') return dayjs(val).format('YYYY-MM-DD');
    if (formatter === 'datetime') return dayjs(val).format('YYYY-MM-DD HH:mm:ss');
    if (formatter === 'number') return Number(val);
    return String(val);
  }

  private inferColumns(sample: any): ExcelColumn[] {
    return Object.keys(this.flatten(sample)).map((k) => ({
      field: k,
      header: k,
      width: 15,
      formatter: 'text' as const,
    }));
  }

  private flatten(obj: any, prefix = ''): any {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(out, this.flatten(v, prefix + k + '_'));
      } else {
        out[prefix + k] = v;
      }
    }
    return out;
  }

  private safeSheetName(name: string) {
    return name.replace(/[\\/*?:[\]]/g, '').slice(0, 31);
  }
}
