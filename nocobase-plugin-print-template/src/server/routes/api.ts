import { Application } from '@nocobase/server';

const BUILTIN_RELATIONS = ['belongsTo', 'hasOne', 'hasMany', 'belongsToMany'];

export function registerApiRoutes(app: Application, db: any) {
  // Register public (no-auth) middleware BEFORE the auth middleware
  app.use(async (ctx: any, next: () => Promise<void>) => {
    const path = ctx.path || '';

    // Only handle GET requests for specific print-template metadata endpoints
    if (ctx.method !== 'GET') return next();

    const handled = await tryHandlePublicEndpoint(ctx, db);
    if (handled) return;

    return next();
  }, { tag: 'print-template-public', before: 'dataSource' });

  app.resource({
    name: 'print_templates',
    actions: {
      /* =========================================================
       * GET /api/print_templates:getCollections
       * All non-system collections with field count
       * ========================================================= */
      async getCollections(ctx: any) {
        const collections = getCollectionsList(db);
        const result = collections
          .map((c: any) => ({
            name: c.name,
            title: c.options?.title || c.name,
            fieldsCount: getFieldsLength(c.fields),
          }))
          .sort((a: any, b: any) => (a.title || a.name).localeCompare(b.title || b.name));

        ctx.body = { data: result };
      },

      /* =========================================================
       * GET /api/print_templates:getCollectionSchema?name=xxx
       * Full collection definition: fields, indexes, options
       * ========================================================= */
      async getCollectionSchema(ctx: any) {
        const { name } = ctx.action.params ?? ctx.query;
        if (!name) {
          ctx.status = 400;
          ctx.body = { error: 'Missing name parameter' };
          return;
        }
        const collection = db.getCollection(name as string);
        if (!collection) {
          ctx.status = 404;
          ctx.body = { error: `Collection [${name}] not found` };
          return;
        }

        const fields = toArray(collection.fields)
          .filter((f: any) => !f.name.startsWith('__'))
          .map((f: any) => ({
            name: f.name,
            type: f.type,
            interface: f.options?.interface || f.type,
            title: f.options?.uiSchema?.title || f.options?.title || f.name,
            isRelation: BUILTIN_RELATIONS.includes(f.type),
            target: f.options?.target || null,
            foreignKey: f.options?.foreignKey || null,
            required: f.options?.required || false,
            primaryKey: f.options?.primaryKey || false,
            defaultValue: f.options?.defaultValue || null,
          }));

        ctx.body = {
          data: {
            name: collection.name,
            title: collection.options?.title || collection.name,
            fields,
          },
        };
      },

      /* =========================================================
       * GET /api/print_templates:getFieldTree?collectionName=xxx&depth=3
       * Full field tree with relation expansion
       * ========================================================= */
      async getFieldTree(ctx: any) {
        const { collectionName, depth: rawDepth } = ctx.action.params ?? ctx.query;
        if (!collectionName) {
          ctx.status = 400;
          ctx.body = { error: 'Missing collectionName parameter' };
          return;
        }

        const collection = db.getCollection(collectionName as string);
        if (!collection) {
          ctx.status = 404;
          ctx.body = { error: `Collection [${collectionName}] not found` };
          return;
        }

        const maxDepth = Math.min(parseInt(rawDepth as string) || 3, 5);

        function buildFieldTree(fields: any[], currentDepth: number, visited: Set<string>): any[] {
          if (currentDepth > maxDepth) return [];
          return fields
            .filter((f: any) => !f.name.startsWith('__'))
            .map((f: any) => {
              const isRelation = BUILTIN_RELATIONS.includes(f.type);
              const field: any = {
                name: f.name,
                type: f.type,
                interface: f.options?.interface || f.type,
                title: f.options?.uiSchema?.title || f.options?.title || f.name,
                isRelation,
                target: f.options?.target || null,
                foreignKey: f.options?.foreignKey || null,
                depth: currentDepth,
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

        const fields = buildFieldTree(toArray(collection.fields), 0, new Set([collectionName as string]));
        ctx.body = {
          data: {
            collectionName: collection.name,
            collectionTitle: collection.options?.title || collection.name,
            fields,
          },
        };
      },

      /* =========================================================
       * GET /api/print_templates:getRelationFields?collection=xxx&relationPath=createdBy
       * Expand a relation field's target collection fields
       * ========================================================= */
      async getRelationFields(ctx: any) {
        const { collection, relationPath } = ctx.action.params ?? ctx.query;
        if (!collection || !relationPath) {
          ctx.status = 400;
          ctx.body = { error: 'Missing collection or relationPath parameter' };
          return;
        }

        const coll = db.getCollection(collection as string);
        if (!coll) {
          ctx.status = 404;
          ctx.body = { error: `Collection [${collection}] not found` };
          return;
        }

        const relField = toArray(coll.fields).find((f: any) => f.name === relationPath);
        if (!relField || !BUILTIN_RELATIONS.includes(relField.type)) {
          ctx.status = 400;
          ctx.body = { error: `Field [${relationPath}] is not a relation` };
          return;
        }

        const targetName = relField.options?.target;
        if (!targetName) {
          ctx.status = 400;
          ctx.body = { error: `Field [${relationPath}] has no target collection` };
          return;
        }

        const targetColl = db.getCollection(targetName);
        if (!targetColl) {
          ctx.status = 404;
          ctx.body = { error: `Target collection [${targetName}] not found` };
          return;
        }

        const fields = toArray(targetColl.fields)
          .filter((f: any) => !f.name.startsWith('__'))
          .map((f: any) => ({
            name: f.name,
            type: f.type,
            interface: f.options?.interface || f.type,
            title: f.options?.uiSchema?.title || f.options?.title || f.name,
            isRelation: BUILTIN_RELATIONS.includes(f.type),
            target: f.options?.target || null,
          }));

        ctx.body = {
          data: {
            collection: targetName,
            collectionTitle: targetColl.options?.title || targetName,
            fields,
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

        if (!mainCollection) {
          ctx.body = '<div style="padding:20px;color:red">Please select a main collection</div>';
          return;
        }

        let sample: any = {};
        if (sampleData !== false) {
          try {
            const repo = db.getRepository(mainCollection);
            const one = await repo.findOne({});
            if (one) sample = one;
          } catch {}
        }

        try {
          const { HtmlRenderer } = require('../services/html-renderer');
          const renderer = new HtmlRenderer();
          const tpl = {
            templateSchema,
            mainCollection,
            pageSize: templateSchema?.page?.size || 'A4',
            orientation: templateSchema?.page?.orientation || 'portrait',
          };
          const html = renderer.render(tpl, { [mainCollection]: sample });
          ctx.body = html;
        } catch (err: any) {
          ctx.body = `<div style="padding:20px;color:red">Render error: <pre>${err.message}</pre></div>`;
        }
      },
    },
  });
}

/* =========================================================
 * Public endpoint handler - runs BEFORE auth middleware
 * Handles metadata queries for the editor
 * ========================================================= */
async function tryHandlePublicEndpoint(ctx: any, db: any): Promise<boolean> {
  const path = ctx.path || '';

  // Match /api/print_templates:getCollections
  if (path === '/api/print_templates:getCollections') {
    const collections = getCollectionsList(db);
    const result = collections
      .map((c: any) => ({
        name: c.name,
        title: c.options?.title || c.name,
        fieldsCount: getFieldsLength(c.fields),
      }))
      .sort((a: any, b: any) => (a.title || a.name).localeCompare(b.title || b.name));

    ctx.body = { data: result };
    return true;
  }

  // Match /api/print_templates:getFieldTree?collectionName=xxx
  if (path.startsWith('/api/print_templates:getFieldTree')) {
    const collectionName = ctx.query?.collectionName;
    if (!collectionName) {
      ctx.status = 400;
      ctx.body = { error: 'Missing collectionName parameter' };
      return true;
    }

    const collection = db.getCollection(collectionName as string);
    if (!collection) {
      ctx.status = 404;
      ctx.body = { error: `Collection [${collectionName}] not found` };
      return true;
    }

    const maxDepth = Math.min(parseInt(ctx.query?.depth as string) || 3, 5);
    const allFields = toArray(collection.fields);

    function buildFieldTree(fields: any[], currentDepth: number, visited: Set<string>): any[] {
      if (currentDepth > maxDepth) return [];
      return fields
        .filter((f: any) => !f.name.startsWith('__'))
        .map((f: any) => {
          const isRelation = BUILTIN_RELATIONS.includes(f.type);
          const field: any = {
            name: f.name,
            type: f.type,
            interface: f.options?.interface || f.type,
            title: f.options?.uiSchema?.title || f.options?.title || f.name,
            isRelation,
            target: f.options?.target || null,
            foreignKey: f.options?.foreignKey || null,
            depth: currentDepth,
          };

          if (isRelation && f.options?.target && !visited.has(f.options.target)) {
            const targetColl = db.getCollection(f.options.target);
            if (targetColl) {
              visited.add(f.options.target);
              field.subFields = toArray(targetColl.fields)
                .filter((sf: any) => !sf.name.startsWith('__'))
                .filter((sf: any) => {
                  if (sf.type === 'belongsTo' && sf.options?.target === collectionName) return false;
                  if (sf.type === 'hasMany' && sf.options?.target === collectionName) return false;
                  if (sf.type === 'hasOne' && sf.options?.target === collectionName) return false;
                  if (sf.type === 'belongsToMany' && sf.options?.target === collectionName) return false;
                  return true;
                })
                .map((sf: any) => ({
                  name: sf.name,
                  type: sf.type,
                  interface: sf.options?.interface || sf.type,
                  title: sf.options?.uiSchema?.title || sf.options?.title || sf.name,
                  isRelation: BUILTIN_RELATIONS.includes(sf.type),
                  target: sf.options?.target || null,
                  depth: currentDepth + 1,
                }));
              field.targetTitle = targetColl.options?.title || f.options.target;
              visited.delete(f.options.target);
            }
          }

          return field;
        });
    }

    const fields = buildFieldTree(allFields, 0, new Set([collectionName as string]));
    ctx.body = {
      data: {
        collectionName: collection.name,
        collectionTitle: collection.options?.title || collection.name,
        fields,
      },
    };
    return true;
  }

  // Match /api/print_templates:getCollectionSchema?name=xxx
  if (path.startsWith('/api/print_templates:getCollectionSchema')) {
    const name = ctx.query?.name;
    if (!name) {
      ctx.status = 400;
      ctx.body = { error: 'Missing name parameter' };
      return true;
    }
    const collection = db.getCollection(name as string);
    if (!collection) {
      ctx.status = 404;
      ctx.body = { error: `Collection [${name}] not found` };
      return true;
    }

    const fields = toArray(collection.fields)
      .filter((f: any) => !f.name.startsWith('__'))
      .map((f: any) => ({
        name: f.name,
        type: f.type,
        interface: f.options?.interface || f.type,
        title: f.options?.uiSchema?.title || f.options?.title || f.name,
        isRelation: BUILTIN_RELATIONS.includes(f.type),
        target: f.options?.target || null,
        foreignKey: f.options?.foreignKey || null,
      }));

    ctx.body = {
      data: {
        name: collection.name,
        title: collection.options?.title || collection.name,
        fields,
      },
    };
    return true;
  }

  // Match /api/print_templates:getRelationFields?collection=xxx&relationPath=yyy
  if (path.startsWith('/api/print_templates:getRelationFields')) {
    const collection = ctx.query?.collection;
    const relationPath = ctx.query?.relationPath;
    if (!collection || !relationPath) {
      ctx.status = 400;
      ctx.body = { error: 'Missing collection or relationPath parameter' };
      return true;
    }

    const coll = db.getCollection(collection as string);
    if (!coll) {
      ctx.status = 404;
      ctx.body = { error: `Collection [${collection}] not found` };
      return true;
    }

    const relField = (coll.fields || []).find((f: any) => f.name === relationPath);
    if (!relField || !BUILTIN_RELATIONS.includes(relField.type)) {
      ctx.status = 400;
      ctx.body = { error: `Field [${relationPath}] is not a relation` };
      return true;
    }

    const targetName = relField.options?.target;
    if (!targetName) {
      ctx.status = 400;
      ctx.body = { error: `Field [${relationPath}] has no target collection` };
      return true;
    }

    const targetColl = db.getCollection(targetName);
    if (!targetColl) {
      ctx.status = 404;
      ctx.body = { error: `Target collection [${targetName}] not found` };
      return true;
    }

    const fields = toArray(targetColl.fields)
      .filter((f: any) => !f.name.startsWith('__'))
      .map((f: any) => ({
        name: f.name,
        type: f.type,
        interface: f.options?.interface || f.type,
        title: f.options?.uiSchema?.title || f.options?.title || f.name,
        isRelation: BUILTIN_RELATIONS.includes(f.type),
        target: f.options?.target || null,
      }));

    ctx.body = {
      data: {
        collection: targetName,
        collectionTitle: targetColl.options?.title || targetName,
        fields,
      },
    };
    return true;
  }

  return false;
}

/* =========================================================
 * Helper: get collections as array (handles Map/object) + filter system tables
 * ========================================================= */
function getCollectionsList(db: any): any[] {
  const c = db.collections;
  if (!c) return [];
  let arr: any[];
  if (Array.isArray(c)) arr = c;
  else if (c instanceof Map || typeof c.values === 'function') arr = Array.from(c.values());
  else if (typeof c === 'object') arr = Object.values(c);
  else return [];

  // Filter system/internal tables
  return arr.filter((col: any) => {
    const name = col.name || '';
    const title = col.options?.title || col.options?.uiSchema?.title || name;
    
    // Skip internal tables
    if (name.startsWith('__')) return false;
    if (name.startsWith('t_')) return false;                    // temp tables
    if (name.startsWith('apiKeys')) return false;
    if (name.startsWith('authenticator')) return false;
    if (name.startsWith('attachment')) return false;
    if (name.startsWith('backupSetting')) return false;
    if (name.startsWith('blockTemplate')) return false;
    if (name.startsWith('chinaRegion')) return false;
    if (name.startsWith('collection')) return false;
    if (name.startsWith('customRequest')) return false;
    if (name.startsWith('dataSource')) return false;
    if (name.startsWith('department_')) return false;
    if (name.startsWith('departmentsRoles')) return false;
    if (name.startsWith('departmentsUsers')) return false;
    if (name.startsWith('desktopRoutes')) return false;
    if (name.startsWith('entry_')) return false;
    if (name.startsWith('environmentVariable')) return false;
    if (name.startsWith('execution')) return false;
    if (name.startsWith('field')) return false;
    if (name.startsWith('flow')) return false;
    if (name.startsWith('graphPosition')) return false;
    if (name.startsWith('iframeHtml')) return false;
    if (name.startsWith('notification')) return false;
    if (name.startsWith('issuedToken')) return false;
    if (name.startsWith('job')) return false;
    if (name.startsWith('leader_charge')) return false;
    if (name.startsWith('localization')) return false;
    if (name.startsWith('log_')) return false;
    if (name.startsWith('main_')) return false;
    if (name.startsWith('mapConfiguration')) return false;
    if (name.startsWith('migration')) return false;
    if (name.startsWith('mobileRoute')) return false;
    if (name.startsWith('oidcState')) return false;
    if (name.startsWith('otpRecord')) return false;
    if (name.startsWith('print_template')) return false;
    if (name.startsWith('publicForm')) return false;
    if (name.startsWith('role')) return false;
    if (name.startsWith('sequence')) return false;
    if (name.startsWith('storage')) return false;
    if (name.startsWith('systemSetting')) return false;
    if (name.startsWith('themeConfig')) return false;
    if (name.startsWith('token')) return false;
    if (name.startsWith('uiButton')) return false;
    if (name.startsWith('userDataSync')) return false;
    if (name.startsWith('userVerificator')) return false;
    if (name.startsWith('verification')) return false;
    if (name.startsWith('verificator')) return false;
    if (name.startsWith('verifier')) return false;
    if (name.startsWith('workerUser')) return false;
    if (name.startsWith('Manager_user')) return false;
    if (name.startsWith('notificationSendLog')) return false;
    if (name.startsWith('asyncTask')) return false;
    if (name.startsWith('applicationVersion')) return false;
    if (name.startsWith('print_template')) return false; // our own table
    
    // Skip if title is same as name (no proper title set)
    if (title === name) return false;
    // Skip i18n keys like {{t("...")}}
    if (typeof title === 'string' && title.startsWith('{{t(')) return false;
    
    return true;
  });
}

/* =========================================================
 * Helper: get fields length (handles array/Map/object)
 * ========================================================= */
function getFieldsLength(fields: any): number {
  if (!fields) return 0;
  if (Array.isArray(fields)) return fields.length;
  if (fields instanceof Map || typeof fields.values === 'function') return fields.size || Array.from(fields.values()).length;
  if (typeof fields === 'object') return Object.keys(fields).length;
  return 0;
}

/* =========================================================
 * Helper: ensure value is an array (handles array/Map/object)
 * ========================================================= */
function toArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map || typeof value.values === 'function') return Array.from(value.values());
  if (typeof value === 'object') return Object.values(value);
  return [];
}
