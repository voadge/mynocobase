import Handlebars from 'handlebars';
import DOMPurify from 'isomorphic-dompurify';
import { PrintTemplate, TemplateSchema, Block, BlockField, Element, TextElement, TableElement, ImageElement, DividerElement, GridElement } from '../types';

export class HtmlRenderer {
  render(template: PrintTemplate, data: any): string {
    const schema = template.templateSchema;
    if (!schema) {
      return '<div class="p-4">No print template configured</div>';
    }

    // Support v3 grid format, v2 blocks, or legacy elements
    const hasRows = schema.rows && schema.rows.length > 0;
    const hasBlocks = schema.blocks && schema.blocks.length > 0;
    const hasLegacy = schema.elements && schema.elements.length > 0;

    if (!hasRows && !hasBlocks && !hasLegacy) {
      return '<div class="p-4">No print template configured</div>';
    }

    const page = schema.page || { size: 'A4', orientation: 'portrait', margins: { top: 20, right: 15, bottom: 20, left: 15 } };

    let body = '';
    if (hasRows) {
      body = this.renderGridRows(schema, data);
    } else if (hasBlocks) {
      body = schema.blocks.map(block => this.renderBlock(block, data)).join('\n');
    } else if (hasLegacy) {
      body = schema.elements!.map(el => this.renderElement(el)).join('\n');
    }

    const rawHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      this.getBaseStyles(page) +
      '</style></head><body>' + body + '</body></html>';

    // Compile Handlebars template with data
    let compiledHtml = rawHtml;
    try {
      const template = Handlebars.compile(rawHtml, { noEscape: true });
      compiledHtml = template(data);
    } catch (err: any) {
      compiledHtml = '<div style="padding:20px;color:red">Handlebars error: ' + this.escapeHtml(err.message || String(err)) + '</div>';
    }

    return DOMPurify.sanitize(compiledHtml, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover'],
    });
  }

  private getBaseStyles(page: any): string {
    return '@page { size: ' + page.size + ' ' + page.orientation + '; margin: ' +
      page.margins.top + 'mm ' + page.margins.right + 'mm ' +
      page.margins.bottom + 'mm ' + page.margins.left + 'mm; }' +
      '@media print { .no-print { display: none !important; } body { margin: 0; } }' +
      'body { font-family: SimSun, serif; font-size: 14px; color: #000; }' +
      '.block { margin-bottom: 16px; }' +
      '.block-title { font-size: 16px; font-weight: bold; padding: 8px 12px; border-bottom: 2px solid #000; margin-bottom: 8px; }' +
      '.field-row { display: flex; padding: 4px 0; border-bottom: 1px solid #eee; }' +
      '.field-label { font-weight: bold; min-width: 100px; color: #333; }' +
      '.field-value { flex: 1; }' +
      '.nb-grid { display: flex; gap: 0; }' +
      '.nb-grid-col { flex: 1; }' +
      '.nb-table { width: 100%; border-collapse: collapse; }' +
      '.nb-table th, .nb-table td { border: 1px solid #000; padding: 6px 8px; text-align: left; }' +
      '.nb-table th { background: #f5f5f5; font-weight: bold; }' +
      '.nb-divider { border: none; border-top: 1px solid #000; margin: 8px 0; }' +
      '.nb-image { max-width: 100%; }' +
      '.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }' +
      '.form-grid .field-row { border-bottom: 1px solid #eee; }' +
      '';
  }

  /* =================================================================
   * Block rendering
   * ================================================================= */
  private renderBlock(block: Block, data: any): string {
    const style = block.style || {};
    const headerBg = style.headerBg || '#f5f5f5';
    const borderWidth = style.borderWidth ?? 1;
    const borderColor = style.borderColor ?? '#000';
    const titleFontSize = style.titleFontSize || 16;
    const titleAlign = style.titleAlign || 'left';

    let html = '<div class="block">';

    // Block title
    html += '<div class="block-title" style="background:' + headerBg + ';text-align:' + titleAlign + ';font-size:' + titleFontSize + 'px;border-bottom:' + borderWidth + 'px solid ' + borderColor + '">';
    html += this.escapeHtml(block.title);
    if (block.collection) {
      html += ' <span style="font-size:12px;color:#888;font-weight:normal">(' + this.escapeHtml(block.collection) + ')</span>';
    }
    html += '</div>';

    // Block content by type
    switch (block.type) {
      case 'details':
        html += this.renderDetailsBlock(block, data);
        break;
      case 'table':
        html += this.renderTableBlock(block, data);
        break;
      case 'form':
        html += this.renderFormBlock(block, data);
        break;
      default:
        html += '<div style="color:#999;padding:8px">Unknown block type: ' + block.type + '</div>';
    }

    html += '</div>';
    return html;
  }

  /* ----- Details Block: label-value pairs ----- */
  private renderDetailsBlock(block: Block, data: any): string {
    let html = '<div class="details-block">';
    for (const field of block.fields) {
      html += this.renderFieldRow(field, data);
    }
    html += '</div>';
    return html;
  }

  /* ----- Table Block: table with headers ----- */
  private renderTableBlock(block: Block, data: any): string {
    const ds = block.dataSource || 'items';
    const style = block.style || {};
    const borderWidth = style.borderWidth ?? 1;
    const borderColor = style.borderColor ?? '#000';
    const headerBg = style.headerBg ?? '#f5f5f5';

    let html = '<table class="nb-table" style="border:' + borderWidth + 'px solid ' + borderColor + '">';

    // Headers
    html += '<thead><tr>';
    for (const field of block.fields) {
      const w = field.width ? ' style="width:' + field.width + '"' : '';
      html += '<th' + w + ' style="background:' + headerBg + ';border:' + borderWidth + 'px solid ' + borderColor + '">' + this.escapeHtml(field.label) + '</th>';
    }
    html += '</tr></thead>';

    // Body with Handlebars each loop
    html += '<tbody>';
    html += '{{#each ' + ds + '}}<tr>';
    for (const field of block.fields) {
      const ref = '{{' + field.name + '}}';
      html += '<td style="border:' + borderWidth + 'px solid ' + borderColor + '">' + ref + '</td>';
    }
    html += '</tr>{{/each}}</tbody></table>';

    return html;
  }

  /* ----- Form Block: form-like grid layout ----- */
  private renderFormBlock(block: Block, data: any): string {
    let html = '<div class="form-block form-grid">';
    for (const field of block.fields) {
      const w = field.width || '100%';
      html += '<div class="field-row" style="width:' + w + '">';
      html += '<span class="field-label">' + this.escapeHtml(field.label) + ':</span>';
      html += '<span class="field-value">{{' + field.name + '}}</span>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ----- Single field row (for details block) ----- */
  private renderFieldRow(field: BlockField, data: any): string {
    const w = field.width || '100%';

    if (field.isRelation && field.subFields && field.subFields.length > 0) {
      // Relation with sub-fields: render as grouped section
      let html = '<div class="field-row" style="width:' + w + '">';
      html += '<div style="flex:1">';
      html += '<div class="field-label" style="color:#1890ff;margin-bottom:4px">' + this.escapeHtml(field.label) + '</div>';
      for (const sub of field.subFields) {
        html += this.renderFieldRow(sub, data);
      }
      html += '</div></div>';
      return html;
    }

    // Simple field
    const ref = '{{' + field.name + '}}';
    let html = '<div class="field-row" style="width:' + w + '">';
    html += '<span class="field-label">' + this.escapeHtml(field.label) + ':</span>';
    html += '<span class="field-value">' + ref + '</span>';
    html += '</div>';
    return html;
  }

  /* =================================================================
   * Legacy element rendering (for migration)
   * ================================================================= */
  private renderElement(el: Element): string {
    switch (el.type) {
      case 'text': return this.renderText(el as TextElement);
      case 'table': return this.renderLegacyTable(el as TableElement);
      case 'image': return this.renderImage(el as ImageElement);
      case 'divider': return this.renderDivider(el as DividerElement);
      case 'grid': return this.renderGrid(el as GridElement);
      default: return '';
    }
  }

  private renderText(el: TextElement): string {
    const s = el.style || {};
    const parts: string[] = [];
    if (s.fontSize) parts.push('font-size:' + s.fontSize + 'px');
    if (s.fontWeight) parts.push('font-weight:' + s.fontWeight);
    if (s.fontStyle) parts.push('font-style:' + s.fontStyle);
    if (s.textAlign) parts.push('text-align:' + s.textAlign);
    if (s.color) parts.push('color:' + s.color);
    if (s.fontFamily) parts.push('font-family:' + s.fontFamily);
    if (s.lineHeight) parts.push('line-height:' + s.lineHeight);
    const style = parts.join(';');
    return '<div style="' + style + '">' + el.content + '</div>';
  }

  private renderLegacyTable(el: TableElement): string {
    const border = el.borderWidth ?? 1;
    const borderC = el.borderColor ?? '#000';
    const headerBg = el.headerBg ?? '#f5f5f5';
    const ds = el.dataSource || 'items';

    let html = '<table class="nb-table" style="border:' + border + 'px solid ' + borderC + '">';
    html += '<thead><tr>';
    for (const col of el.columns) {
      const w = col.width ? ' style="width:' + col.width + '"' : '';
      html += '<th' + w + ' style="background:' + headerBg + ';border:' + border + 'px solid ' + borderC + '">' + col.header + '</th>';
    }
    html += '</tr></thead><tbody>';
    html += '{{#each ' + ds + '}}<tr>';
    for (const col of el.columns) {
      const ref = '{{' + col.field + '}}';
      html += '<td style="border:' + border + 'px solid ' + borderC + '">' + ref + '</td>';
    }
    html += '</tr>{{/each}}</tbody></table>';
    return html;
  }

  private renderImage(el: ImageElement): string {
    const fit = el.fit || 'contain';
    return '<img class="nb-image" src="' + el.src + '" alt="' + (el.alt || '') + '" style="object-fit:' + fit + '" />';
  }

  private renderDivider(el: DividerElement): string {
    const s = el.style || {};
    const w = s.borderWidth ?? 1;
    const c = s.borderColor ?? '#000';
    const style = s.borderStyle || 'solid';
    return '<hr class="nb-divider" style="border-top:' + w + 'px ' + style + ' ' + c + '" />';
  }

  private renderGridRows(schema: any, data: any): string {
    var rows = schema.rows || [];
    var h = '<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">';
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      h += '<tr>';
      var cells = row.cells || [];
      for (var ci = 0; ci < cells.length; ci++) {
        var cell = cells[ci];
        if (cell.skip) continue;
        var cs = cell.colspan || 1;
        var rs = cell.rowspan || 1;
        var bd = '';
        if (cell.border !== false) {
          var bw = (cell.borderWidth || 1) + 'px';
          var bc = cell.borderColor || '#000';
          var bs = cell.borderStyle || 'solid';
          bd = 'border-top:' + (cell.borderTop !== false ? bw + ' ' + bs + ' ' + bc : 'none') + ';' +
               'border-right:' + (cell.borderRight !== false ? bw + ' ' + bs + ' ' + bc : 'none') + ';' +
               'border-bottom:' + (cell.borderBottom !== false ? bw + ' ' + bs + ' ' + bc : 'none') + ';' +
               'border-left:' + (cell.borderLeft !== false ? bw + ' ' + bs + ' ' + bc : 'none') + ';';
        } else {
          bd = 'border:none;';
        }
        var content = '';
        if (cell.field) { content = '{{' + cell.field + '}}'; }
        else if (cell.text) { content = cell.text; }
        h += '<td colspan="' + cs + '" rowspan="' + rs + '" style="text-align:' + (cell.align || 'left') + ';font-weight:' + (cell.bold ? 'bold' : 'normal') + ';font-size:' + (cell.fontSize || 12) + 'px;color:' + (cell.color || '#000') + ';background:' + (cell.bgColor || 'transparent') + ';padding:6px 8px;' + bd + '">' + content + '</td>';
        for (var xc = 1; xc < cs; xc++) { ci++; }
      }
      h += '</tr>';
    }
    h += '</table>';
    return h;
  }

  private renderGrid(el: GridElement): string {
    const cols = el.columns || [];
    const parts = cols.map(col => {
      const inner = (col.elements || []).map(e => this.renderElement(e)).join('\n');
      return '<div class="nb-grid-col">' + inner + '</div>';
    });
    return '<div class="nb-grid">' + parts.join('') + '</div>';
  }

  private escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
