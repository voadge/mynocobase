import type Database from '@nocobase/database';
import { HtmlRenderer } from '../services/html-renderer';

const BUILTIN_RELATIONS = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'];

export function registerMetadataActions(db: Database) {
  const renderer = new HtmlRenderer();

  return {
    /* =========================================================
     * GET /api/print_templates:getCollections
     * All user-defined collections with field count
     * ========================================================= */
    async getCollections(ctx: any) {
      const collections = getUserCollections(db);
      ctx.body = {
        data: collections.map((c: any) => ({
          name: c.name,
          title: c.options?.title || c.name,
          fieldsCount: c.fields ? (Array.isArray(c.fields) ? c.fields.length : Object.keys(c.fields).length) : 0,
        })).sort((a: any, b: any) => (a.title || a.name).localeCompare(b.title || b.name)),
      };
    },

    /* =========================================================
     * GET /api/print_templates:getCollectionSchema?name=xxx
     * Full collection definition: fields
     * ========================================================= */
    async getCollectionSchema(ctx: any) {
      const { name } = ctx.action.params;
      if (!name) { ctx.status = 400; ctx.body = { error: 'Missing name parameter' }; return; }

      const collection = db.getCollection(name);
      if (!collection) { ctx.status = 404; ctx.body = { error: `Collection [${name}] not found` }; return; }

      ctx.body = {
        data: {
          name: collection.name,
          title: collection.options?.title || collection.name,
          fields: toArray(collection.fields)
            .filter((f: any) => !f.name.startsWith('__'))
            .map((f: any) => ({
              name: f.name, type: f.type, interface: f.options?.interface || f.type,
              title: f.options?.uiSchema?.title || f.options?.title || f.name,
              isRelation: BUILTIN_RELATIONS.includes(f.type),
              target: f.options?.target || null, foreignKey: f.options?.foreignKey || null,
              required: !!f.options?.required, primaryKey: !!f.options?.primaryKey,
            })),
        },
      };
    },

    /* =========================================================
     * GET /api/print_templates:getFieldTree?collectionName=xxx&depth=3
     * Full field tree with relation expansion
     * ========================================================= */
    async getFieldTree(ctx: any) {
      const { collectionName, depth: rawDepth } = ctx.action.params;
      if (!collectionName) { ctx.status = 400; ctx.body = { error: 'Missing collectionName parameter' }; return; }

      const collection = db.getCollection(collectionName);
      if (!collection) { ctx.status = 404; ctx.body = { error: `Collection [${collectionName}] not found` }; return; }

      const maxDepth = Math.min(parseInt(rawDepth) || 3, 5);

      function buildFieldTree(fields: any[], currentDepth: number, visited: Set<string>): any[] {
        if (currentDepth > maxDepth) return [];
        return fields
          .filter((f: any) => !f.name.startsWith('__'))
          .map((f: any) => {
            const isRelation = BUILTIN_RELATIONS.includes(f.type);
            const field: any = {
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
                  .filter((sf: any) => !sf.name.startsWith('__'))
                  .filter((sf: any) => {
                    if (sf.type === 'belongsTo' && sf.options?.target === collectionName) return false;
                    if (sf.type === 'hasMany' && sf.options?.target === collectionName) return false;
                    if (sf.type === 'hasOne' && sf.options?.target === collectionName) return false;
                    if (sf.type === 'belongsToMany' && sf.options?.target === collectionName) return false;
                    return true;
                  });
                field.subFields = buildFieldTree(subFields, currentDepth + 1, visited);
                field.targetTitle = targetColl.options?.title || f.options.target;
                visited.delete(f.options.target);
              }
            }
            return field;
          });
      }

      const fields = buildFieldTree(toArray(collection.fields), 0, new Set([collectionName]));
      ctx.body = { data: { collectionName: collection.name, collectionTitle: collection.options?.title || collection.name, fields } };
    },

    /* =========================================================
     * GET /api/print_templates:getRelationFields?collection=xxx&relationPath=createdBy
     * Expand a relation field's target collection fields
     * ========================================================= */
    async getRelationFields(ctx: any) {
      const { collection, relationPath } = ctx.action.params;
      if (!collection || !relationPath) { ctx.status = 400; ctx.body = { error: 'Missing collection or relationPath parameter' }; return; }

      const coll = db.getCollection(collection);
      if (!coll) { ctx.status = 404; ctx.body = { error: `Collection [${collection}] not found` }; return; }

      const relField = toArray(coll.fields).find((f: any) => f.name === relationPath);
      if (!relField || !BUILTIN_RELATIONS.includes(relField.type)) {
        ctx.status = 400; ctx.body = { error: `Field [${relationPath}] is not a relation` }; return;
      }

      const targetName = relField.options?.target;
      if (!targetName) { ctx.status = 400; ctx.body = { error: `Field [${relationPath}] has no target collection` }; return; }

      const targetColl = db.getCollection(targetName);
      if (!targetColl) { ctx.status = 404; ctx.body = { error: `Target collection [${targetName}] not found` }; return; }

      ctx.body = {
        data: {
          collection: targetName, collectionTitle: targetColl.options?.title || targetName,
          fields: toArray(targetColl.fields)
            .filter((f: any) => !f.name.startsWith('__'))
            .map((f: any) => ({
              name: f.name, type: f.type, interface: f.options?.interface || f.type,
              title: f.options?.uiSchema?.title || f.options?.title || f.name,
              isRelation: BUILTIN_RELATIONS.includes(f.type), target: f.options?.target || null,
            })),
        },
      };
    },

    /* =========================================================
     * POST /api/print_templates:preview
     * Live preview with sample data
     * ========================================================= */
    async preview(ctx: any) {
      const { templateSchema, mainCollection, sampleData } = ctx.request.body || {};

      if (!templateSchema) {
        ctx.body = '<div style="padding:20px;color:#999">Please design a print template first</div>';
        return;
      }

      let sample: any = {};
      if (sampleData !== false && mainCollection) {
        try {
          const one = await db.getRepository(mainCollection).findOne({});
          if (one) sample = one;
        } catch {}
      }

      try {
        const html = renderer.render({
          templateSchema, mainCollection,
          pageSize: templateSchema?.page?.size || 'A4',
          orientation: templateSchema?.page?.orientation || 'portrait',
        }, { [mainCollection]: sample });
        ctx.body = html;
      } catch (err: any) {
        ctx.body = `<div style="padding:20px;color:red">Render error: <pre>${err.message}</pre></div>`;
      }
    },
  };
}

function getUserCollections(db: Database): any[] {
  const collections = db.collections;
  const arr = toArray(collections);
  return arr.filter((col: any) => {
    const name = col.name || '';
    const options = col.options || {};
    if (name.startsWith('_')) return false;
    if (options.isThrough) return false;
    if (options.inherit === false && !options.title) return false;
    const title = options.title || options.uiSchema?.title || name;
    if (typeof title === 'string' && title.startsWith('{{t(')) return false;
    if (title === name && !name.includes('_')) return false;
    return true;
  });
}

function toArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map || typeof value.values === 'function') return Array.from(value.values());
  if (typeof value === 'object') return Object.values(value);
  return [];
}
