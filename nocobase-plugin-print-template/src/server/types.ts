export interface PrintTemplate {
  id: string;
  name: string;
  mainCollection: string;
  description?: string;
  excelColumns: ExcelColumn[];
  extraDataSources: ExtraDataSource[];
  templateSchema?: TemplateSchema;
  pageSize: 'A4' | 'A3';
  orientation: 'portrait' | 'landscape';
  enabled: boolean;
}

export interface ExcelColumn {
  field: string;
  header: string;
  width: number;
  formatter: 'date' | 'datetime' | 'number' | 'text';
}

export interface ExtraDataSource {
  alias: string;
  collectionName: string;
  queryType: 'findOne' | 'find';
  filter?: any;
  appends?: string[];
  linkField?: string;
}

/* =================================================================
 * TemplateSchema v2.0
 * Block-based layout: each Block binds to a Collection, contains Fields
 * ================================================================= */
export interface TemplateSchema {
  version?: string;
  page: PageConfig;
  blocks: Block[];
  /** @deprecated legacy elements */
  elements?: Element[];
}

export interface PageConfig {
  size: 'A4' | 'A3';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
}

/* ----- Block: binds to a collection ----- */
export type BlockType = 'details' | 'table' | 'form';

export interface Block {
  id: string;
  type: BlockType;
  collection: string;
  title: string;
  appends: string[];
  filter?: any;
  sort?: string;
  fields: BlockField[];
  dataSource?: string;
  style?: BlockStyle;
}

export interface BlockStyle {
  headerBg?: string;
  borderWidth?: number;
  borderColor?: string;
  fontSize?: number;
  titleFontSize?: number;
  titleAlign?: 'left' | 'center' | 'right';
}

/* ----- BlockField: field within a block ----- */
export interface BlockField {
  name: string;
  label: string;
  interface: string;
  format?: string;
  width?: string;
  target?: string;
  foreignKey?: string;
  isRelation?: boolean;
  subFields?: BlockField[];
}

/* ----- Legacy element types (kept for migration) ----- */
export type ElementType = 'text' | 'table' | 'image' | 'divider' | 'grid';

export interface BaseElement {
  id: string;
  type: ElementType;
}

export interface TextElement extends BaseElement {
  type: 'text';
  style: {
    fontSize?: number;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    fontFamily?: string;
    lineHeight?: number;
  };
  content: string;
}

export interface TableColumn {
  field: string;
  header: string;
  width?: string;
  format?: 'text' | 'date' | 'datetime' | 'number';
}

export interface TableElement extends BaseElement {
  type: 'table';
  columns: TableColumn[];
  dataSource: string;
  headerBg?: string;
  borderWidth?: number;
  borderColor?: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  fit?: 'contain' | 'cover' | 'fill';
  alt?: string;
}

export interface DividerElement extends BaseElement {
  type: 'divider';
  style?: {
    borderWidth?: number;
    borderColor?: string;
    borderStyle?: 'solid' | 'dashed' | 'dotted';
  };
}

export interface GridElement extends BaseElement {
  type: 'grid';
  columns: GridColumn[];
}

export interface GridColumn {
  span: number;
  elements: Element[];
}

export type Element = TextElement | TableElement | ImageElement | DividerElement | GridElement;
