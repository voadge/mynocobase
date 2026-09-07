"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("@nocobase/server");
const print_templates_1 = __importDefault(require("./collections/print-templates"));
const html_renderer_1 = require("./services/html-renderer");
const excel_exporter_1 = require("./services/excel-exporter");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const STORAGE_DIR = path_1.default.join(process.cwd(), 'storage', 'print-template');
const PLUGIN_DIR = path_1.default.join(__dirname, '..', '..');
const MAX_BATCH = 5000;
function toArray(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value;
    if (typeof value.values === 'function')
        return Array.from(value.values());
    return Object.values(value);
}
module.exports = class PrintTemplatePlugin extends server_1.Plugin {
    async load() {
        const app = this.app;
        const db = this.db;
        // Register collection
        db.collection(print_templates_1.default);
        // Path normalization middleware
        app.use(async (ctx, next) => {
            ctx.state.reqPath = ctx.path.replace(/^\/api/, '');
            await next();
        }, { before: 'dataSource' });
        // Unified API middleware: handles metadata + print actions
        app.use(async (ctx, next) => {
            const reqPath = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
            const method = ctx.method;
            // ---- Admin pages ----
            if (method === 'GET') {
                if (reqPath === '/__pt__/admin') {
                    return serveHtml(ctx, path_1.default.join(STORAGE_DIR, 'list.html'));
                }
                if (reqPath.startsWith('/__pt__/admin/edit')) {
                    return serveHtml(ctx, path_1.default.join(STORAGE_DIR, 'edit.html'));
                }
                if (reqPath === '/__pt__/package.json') {
                    ctx.withoutDataWrapping = true;
                    ctx.type = 'application/json';
                    ctx.body = fs_1.default.readFileSync(path_1.default.join(PLUGIN_DIR, 'package.json'), 'utf-8');
                    return;
                }
            }
            // ---- Print template custom actions ----
            const actionMatch = reqPath.match(/^\/print_templates:(getCollections|getCollectionSchema|getFieldTree|getRelationFields|preview|printTemplateExport|printTemplateExportItem|printTemplatePreview)$/);
            if (actionMatch) {
                return handleResourceAction(ctx, app, db, actionMatch[1]);
            }
            // Let standard CRUD flow through to NocoBase resource manager
            return next();
        }, { tag: 'print-template', before: 'dataSource' });
        // Print render endpoint (public, no auth)
        const renderer = new html_renderer_1.HtmlRenderer();
        app.use(async (ctx, next) => {
            if (ctx.method !== 'GET')
                return next();
            const reqPath = ctx.state.reqPath || ctx.path.replace(/^\/api/, '');
            const match = reqPath.match(/^\/__pt__\/print\/([^/]+)\/([^/]+)$/);
            if (!match)
                return next();
            const [, templateId, recordId] = match;
            const tpl = await db.getRepository('print_templates').findOne({ filterByTk: templateId, filter: { enabled: true } });
            if (!tpl) {
                ctx.status = 404;
                ctx.body = 'Template not found or disabled';
                return;
            }
            const schema = tpl.templateSchema;
            if (!schema?.blocks?.length && !schema?.elements?.length) {
                ctx.status = 404;
                ctx.body = 'Template has no content configured';
                return;
            }
            const appends = extractAppends(tpl);
            const record = await db.getRepository(tpl.mainCollection).findOne({ filterByTk: recordId, appends });
            if (!record) {
                ctx.status = 404;
                ctx.body = 'Record not found';
                return;
            }
            const data = { [tpl.mainCollection]: record, _user: ctx.state.currentUser, _now: new Date() };
            for (const ds of tpl.extraDataSources || []) {
                const repo = db.getRepository(ds.collectionName);
                const filter = ds.linkField ? { [ds.linkField]: recordId } : (ds.filter || {});
                data[ds.alias] = ds.queryType === 'findOne'
                    ? await repo.findOne({ filter, appends: ds.appends })
                    : await repo.find({ filter, appends: ds.appends, sort: ds.sort });
            }
            ctx.withoutDataWrapping = true;
            ctx.type = 'text/html; charset=utf-8';
            ctx.body = renderer.render(tpl, data);
        }, { tag: 'print-template-render', before: 'dataSource' });
    }
};
// ---- Action handler ----
async function handleResourceAction(ctx, app, db, actionName) {
    const exporter = new excel_exporter_1.ExcelExporter(app, db);
    const renderer = new html_renderer_1.HtmlRenderer();
    switch (actionName) {
        // ---- Metadata actions ----
        case 'getCollections': {
            const collections = getUserCollections(db);
            ctx.body = {
                data: collections.map((c) => ({
                    name: c.name,
                    title: c.options?.title || c.name,
                    fieldsCount: c.fields ? (Array.isArray(c.fields) ? c.fields.length : Object.keys(c.fields).length) : 0,
                })).sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name)),
            };
            return;
        }
        case 'getCollectionSchema': {
            const { name } = ctx.query;
            if (!name) {
                ctx.status = 400;
                ctx.body = { errors: [{ message: 'Missing name parameter' }] };
                return;
            }
            const collection = db.getCollection(name);
            if (!collection) {
                ctx.status = 404;
                ctx.body = { errors: [{ message: `Collection [${name}] not found` }] };
                return;
            }
            ctx.body = {
                data: {
                    name: collection.name, title: collection.options?.title || collection.name,
                    fields: toArray(collection.fields)
                        .filter((f) => !isSystemField(f))
                        .map((f) => ({
                        name: f.name, type: f.type, interface: f.options?.interface || f.type,
                        title: f.options?.uiSchema?.title || f.options?.title || f.name,
                        isRelation: ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(f.type),
                        target: f.options?.target || null, foreignKey: f.options?.foreignKey || null,
                        required: !!f.options?.required, primaryKey: !!f.options?.primaryKey,
                    })),
                },
            };
            return;
        }
        case 'getFieldTree': {
            const { collectionName, depth: rawDepth } = ctx.query;
            if (!collectionName) {
                ctx.status = 400;
                ctx.body = { errors: [{ message: 'Missing collectionName parameter' }] };
                return;
            }
            const collection = db.getCollection(collectionName);
            if (!collection) {
                ctx.status = 404;
                ctx.body = { errors: [{ message: `Collection [${collectionName}] not found` }] };
                return;
            }
            const maxDepth = Math.min(parseInt(rawDepth) || 3, 5);
            const fields = buildFieldTree(db, toArray(collection.fields), 0, maxDepth, new Set([collectionName]), collectionName);
            ctx.body = { data: { collectionName: collection.name, collectionTitle: collection.options?.title || collection.name, fields } };
            return;
        }
        case 'getRelationFields': {
            const { collection: relCollection, relationPath } = ctx.query;
            if (!relCollection || !relationPath) {
                ctx.status = 400;
                ctx.body = { errors: [{ message: 'Missing collection or relationPath parameter' }] };
                return;
            }
            const coll = db.getCollection(relCollection);
            if (!coll) {
                ctx.status = 404;
                ctx.body = { errors: [{ message: `Collection [${relCollection}] not found` }] };
                return;
            }
            const relField = toArray(coll.fields).find((f) => f.name === relationPath);
            if (!relField || !['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(relField.type)) {
                ctx.status = 400;
                ctx.body = { errors: [{ message: `Field [${relationPath}] is not a relation` }] };
                return;
            }
            const targetName = relField.options?.target;
            if (!targetName) {
                ctx.status = 400;
                ctx.body = { errors: [{ message: `Field [${relationPath}] has no target collection` }] };
                return;
            }
            const targetColl = db.getCollection(targetName);
            if (!targetColl) {
                ctx.status = 404;
                ctx.body = { errors: [{ message: `Target collection [${targetName}] not found` }] };
                return;
            }
            ctx.body = {
                data: {
                    collection: targetName, collectionTitle: targetColl.options?.title || targetName,
                    fields: toArray(targetColl.fields)
                        .filter((f) => !isSystemField(f))
                        .map((f) => ({
                        name: f.name, type: f.type, interface: f.options?.interface || f.type,
                        title: f.options?.uiSchema?.title || f.options?.title || f.name,
                        isRelation: ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(f.type),
                        target: f.options?.target || null,
                    })),
                },
            };
            return;
        }
        case 'preview': {
            const { templateSchema, mainCollection, sampleData } = ctx.request.body || {};
            if (!templateSchema) {
                ctx.body = '<div style="padding:20px;color:#999">Please design a print template first</div>';
                return;
            }
            let sample = {};
            if (sampleData !== false && mainCollection) {
                try {
                    const one = await db.getRepository(mainCollection).findOne({});
                    if (one)
                        sample = one;
                }
                catch { }
            }
            try {
                const html = renderer.render({
                    templateSchema, mainCollection,
                    pageSize: templateSchema?.page?.size || 'A4',
                    orientation: templateSchema?.page?.orientation || 'portrait',
                }, { [mainCollection]: sample });
                ctx.body = html;
            }
            catch (err) {
                ctx.body = `<div style="padding:20px;color:red">Render error: <pre>${err.message}</pre></div>`;
            }
            return;
        }
        // ---- Print/Export actions ----
        case 'printTemplateExport':
        case 'printTemplateExportItem': {
            const isBatch = actionName === 'printTemplateExport';
            const { selectedIds, filterByTk, resourceName } = isBatch
                ? { ...ctx.request.body, resourceName: ctx.query.resourceName }
                : { filterByTk: ctx.query.filterByTk, resourceName: ctx.query.resourceName };
            if (isBatch) {
                if (!selectedIds?.length)
                    ctx.throw(400, '请选择记录');
                if (selectedIds.length > MAX_BATCH)
                    ctx.throw(400, `单次导出不能超过 ${MAX_BATCH} 条`);
            }
            if (!resourceName)
                ctx.throw(400, 'Missing resourceName');
            const tpl = await db.getRepository('print_templates').findOne({
                filter: { mainCollection: resourceName, enabled: true },
                sort: '-createdAt',
            });
            if (!tpl)
                ctx.throw(400, '该集合无可用模板');
            const ids = isBatch ? selectedIds : [filterByTk];
            const buf = await exporter.export(tpl, ids);
            ctx.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            ctx.attachment(`${sanitize(tpl.name)}${isBatch ? '_batch_' + Date.now() : '_' + filterByTk}.xlsx`);
            ctx.body = buf;
            return;
        }
        case 'printTemplatePreview': {
            const { filterByTk, resourceName } = { ...ctx.query, ...ctx.request.body };
            if (!filterByTk || !resourceName)
                ctx.throw(400, 'Missing filterByTk or resourceName');
            const tpl = await db.getRepository('print_templates').findOne({
                filter: { mainCollection: resourceName, enabled: true },
                sort: '-createdAt',
            });
            if (!tpl?.templateSchema?.elements?.length && !tpl?.templateSchema?.blocks?.length) {
                ctx.throw(400, '该模板未配置打印模板');
            }
            ctx.body = { type: 'redirect', url: `/__pt__/print/${tpl.id}/${filterByTk}` };
            return;
        }
        default:
            ctx.status = 404;
            ctx.body = { errors: [{ message: `Unknown action: ${actionName}` }] };
    }
}
const SYSTEM_FIELD_NAMES = new Set([
    'id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
    'createdById', 'updatedById', 'deletedAt', 'deletedById',
    'password', 'token', 'refreshToken', 'encryptionKey',
    'appKey', 'appSecret',
]);
// Common system field patterns but NOT user foreign keys like projectID
const SYSTEM_FIELD_PREFIXES = ['__'];
const SYSTEM_FIELD_SUFFIXES = ['ById', 'ByDepartmentId', 'DepartmentId'];
function isSystemField(field) {
    const name = field.name || '';
    if (SYSTEM_FIELD_NAMES.has(name))
        return true;
    for (const p of SYSTEM_FIELD_PREFIXES) {
        if (name.startsWith(p))
            return true;
    }
    for (const s of SYSTEM_FIELD_SUFFIXES) {
        if (name.endsWith(s))
            return true;
    }
    // Only filter fields named exactly like system patterns, not all _id endings
    // (that would exclude projectID, reporter_id etc.)
    return false;
}
// ---- Helpers ----
function buildFieldTree(db, fields, currentDepth, maxDepth, visited, rootCollectionName) {
    if (currentDepth > maxDepth)
        return [];
    return fields
        .filter((f) => !isSystemField(f))
        .map((f) => {
        const isRelation = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'].includes(f.type);
        const field = {
            name: f.name, type: f.type, interface: f.options?.interface || f.type,
            title: f.options?.uiSchema?.title || f.options?.title || f.name,
            isRelation, target: f.options?.target || null,
            foreignKey: f.options?.foreignKey || null, depth: currentDepth,
        };
        if (isRelation && f.options?.target && !visited.has(f.options.target)) {
            const targetColl = db.getCollection(f.options.target);
            if (targetColl) {
                visited.add(f.options.target);
                const subFields = toArray(targetColl.fields)
                    .filter((sf) => !isSystemField(sf))
                    .filter((sf) => {
                    if (sf.type === 'belongsTo' && sf.options?.target === rootCollectionName)
                        return false;
                    if (sf.type === 'hasMany' && sf.options?.target === rootCollectionName)
                        return false;
                    if (sf.type === 'hasOne' && sf.options?.target === rootCollectionName)
                        return false;
                    if (sf.type === 'belongsToMany' && sf.options?.target === rootCollectionName)
                        return false;
                    return true;
                });
                field.subFields = buildFieldTree(db, subFields, currentDepth + 1, maxDepth, visited, rootCollectionName);
                field.targetTitle = targetColl.options?.title || f.options.target;
                visited.delete(f.options.target);
            }
        }
        return field;
    });
}
function getUserCollections(db) {
    const SYSTEM_COLLECTIONS = new Set([
        'users', 'roles', 'rolesUsers', 'permissions', 'attachments',
        'collections', 'fields', 'views', 'viewColumns',
        'links', 'snippets', 'notificationChannels', 'notificationLogs',
        'dataSources', 'dataSourcesCollections', 'dataSourcesFields',
        'workflows', 'workflowNodes', 'workflowConfigs',
        'auditLogs', 'auditChanges',
        'executions', 'jobs', 'flowNodes', 'flowNodePaths',
        'uiSchemas', 'uiSchemaTemplates', 'uiSchemaTreePath',
        'usersDepartments', 'departments',
        'rolesResourcesActions', 'rolesResourcesScopes',
        'collectionCategories', 'collectionCategoryMaps',
    ]);
    const collections = db.collections;
    const arr = toArray(collections);
    return arr.filter((col) => {
        const name = col.name || '';
        const options = col.options || {};
        if (!name)
            return false;
        if (name.startsWith('_'))
            return false; // all system internal tables
        if (SYSTEM_COLLECTIONS.has(name))
            return false;
        if (options.isThrough)
            return false;
        if (options.inherit === false && !options.title)
            return false;
        if (options.system === true || options.system === 'true')
            return false;
        if (options.hidden === true)
            return false;
        if (options.origin === 'pm' || options.origin === 'plugin')
            return false;
        const title = options.title || options.uiSchema?.title || name;
        if (typeof title === 'string' && title.startsWith('{{t('))
            return false;
        if (title === name || title === options.name)
            return false;
        if (name.includes('_settings') || name.includes('_config'))
            return false;
        return true;
    });
}
function extractAppends(tpl) {
    const seen = new Set();
    const appends = [];
    const schema = tpl.templateSchema;
    if (schema?.blocks) {
        for (const block of schema.blocks) {
            for (const a of block.appends || []) {
                if (a && !seen.has(a)) {
                    seen.add(a);
                    appends.push(a);
                }
            }
            for (const f of block.fields || []) {
                const root = (f.name || '').split('.')[0];
                if (root && !seen.has(root) && (f.isRelation || f.name.includes('.'))) {
                    seen.add(root);
                    appends.push(root);
                }
            }
        }
    }
    for (const c of tpl.excelColumns || []) {
        const root = (c.field || '').split('.')[0];
        if (root && !seen.has(root)) {
            seen.add(root);
            appends.push(root);
        }
    }
    return appends;
}
function serveHtml(ctx, filePath) {
    ctx.withoutDataWrapping = true;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = fs_1.default.readFileSync(filePath, 'utf-8');
}
function sanitize(name) {
    return name.replace(/[\\/:*?<>|"]/g, '_').slice(0, 100);
}
