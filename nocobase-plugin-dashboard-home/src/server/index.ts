/**
 * Dashboard Home Plugin - Main entry point
 * Modularized from monolithic index.js into separate middleware files
 */
import { Plugin } from '@nocobase/server';
import fs from 'fs';
import path from 'path';
import { isAuthenticated, authCheckHandler } from './middleware/auth';
import { registerProxyRoutes } from './middleware/proxy';
import { registerPageRoutes } from './middleware/pages';
import { registerAttendanceRoutes } from './middleware/attendance';
import { registerDashboardRoutes } from './middleware/dashboard';
import { registerWeatherRoutes } from './middleware/weather';
import { registerPeopleDynamicRoutes } from './middleware/people-dynamic';
import { qwFetch, QW_WEATHER_HOST } from './utils/qw-jwt';

const STORAGE_DIR = '/app/nocobase/storage/dashboard';

module.exports = class DashboardHomePlugin extends Plugin {
  async load() {
    const app = this.app;
    const db = this.db;

    // Ensure approval trigger fields exist on attendance_records
    const arCol = db.getCollection('attendance_records');
    if (arCol) {
      if (!arCol.hasField('approval_action')) arCol.addField('approval_action', { type: 'string', nullable: true });
      if (!arCol.hasField('approval_remark')) arCol.addField('approval_remark', { type: 'text', nullable: true });
      if (!arCol.hasField('approved_by')) arCol.addField('approved_by', { type: 'bigInt', nullable: true });
      if (!arCol.hasField('approval_trigger_at')) arCol.addField('approval_trigger_at', { type: 'date', nullable: true });
      if (!arCol.hasField('days')) arCol.addField('days', { type: 'integer', nullable: true });
      if (!arCol.hasField('is_overtime')) arCol.addField('is_overtime', { type: 'boolean', nullable: true, defaultValue: false });
      if (!arCol.hasField('check_result')) arCol.addField('check_result', { type: 'string', nullable: true });
      if (!arCol.hasField('anomaly_reason')) arCol.addField('anomaly_reason', { type: 'text', nullable: true });
      if (!arCol.hasField('workflow_status')) arCol.addField('workflow_status', { type: 'string', nullable: true, defaultValue: 'normal' });
      arCol.sync({ alter: true });
    }

    // Normalize path — strip /api prefix for consistent path matching
    app.use(async (ctx: any, next: () => Promise<void>) => {
      ctx.state.reqPath = ctx.path.replace(/^\/api/, '');
      await next();
    }, { before: 'dataSource' });

    // Route: Serve patched plugin-departments bundle with manager_in_charge field injected
    let DEPT_BUNDLE_PATH: string | null = null;
    try {
      DEPT_BUNDLE_PATH = require.resolve('@nocobase/plugin-departments/dist/client/index.js');
    } catch (e) {
      const altPath = path.join(process.cwd(), 'node_modules/@nocobase/plugin-departments/dist/client/index.js');
      if (fs.existsSync(altPath)) DEPT_BUNDLE_PATH = altPath;
    }
    let patchedBundle: string | null = null;
    function getPatchedBundle(): string | null {
      if (patchedBundle) return patchedBundle;
      if (!DEPT_BUNDLE_PATH) return null;
      const content = fs.readFileSync(DEPT_BUNDLE_PATH, 'utf8');
      content.replace(
        'owners:{title:\'{{t("Owners")}}\',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},footer:',
        'owners:{title:\'{{t("Owners")}}\',"x-component":"DepartmentOwnersField","x-decorator":"FormItem"},manager_in_charge:{title:\'{{t("分管领导")}}\',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:'
      );
      content.replace(
        'roles:{"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.roles"},footer:',
        'roles:{"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.roles"},manager_in_charge:{title:\'{{t("分管领导")}}\',"x-component":"CollectionField","x-decorator":"FormItem","x-collection-field":"departments.manager_in_charge"},footer:'
      );
      content.replace(
        'appends:["parent(recursively=true)","roles","owners"]',
        'appends:["parent(recursively=true)","roles","owners","manager_in_charge"]'
      );
      content.replace(/departments_manager_users/g, 'departmentsUsers');
      patchedBundle = content;
      return content;
    }

    app.use(async (ctx: any, next: () => Promise<void>) => {
      if (ctx.method !== 'GET') return await next();
      if (ctx.state.reqPath && ctx.state.reqPath === '/__pd__/dept-bundle') {
        const p = getPatchedBundle();
        if (!p) {
          ctx.status = 404;
          ctx.body = 'Bundle not found';
          return;
        }
        ctx.type = 'application/javascript; charset=utf-8';
        ctx.body = p;
        return;
      }
      await next();
    }, { before: 'dataSource' });

    // Resource middleware: Mirror owner pattern for manager_in_charge
    app.resourceManager.use(async (ctx: any, next: () => Promise<void>) => {
      const action = ctx.action || {};
      const params = action.params || {};
      const values = params.values || {};
      const managerInCharge = values.manager_in_charge;
      if (params.resourceName === 'departments' && (params.actionName === 'update' || params.actionName === 'create') && managerInCharge && Array.isArray(managerInCharge)) {
        const managerIds = managerInCharge.map((m: any) => {
          return typeof m === 'object' ? parseInt(m.id, 10) : parseInt(m, 10);
        }).filter((id: number) => id > 0);
        const newValues: Record<string, any> = {};
        for (const k in values) {
          if (k !== 'manager_in_charge') newValues[k] = values[k];
        }
        params.values = newValues;
        ctx.action.params = params;
        await next();
        try {
          const deptId = params.actionName === 'update' ? params.filterByTk : (ctx.body && ctx.body.data && ctx.body.data.id);
          if (!deptId) return;
          const repo = db.getRepository('departmentsUsers');
          await db.sequelize.transaction(async (t: any) => {
            await repo.update({
              filter: { departmentId: deptId },
              values: { is_manager_in_charge: false },
              transaction: t
            });
            await repo.update({
              filter: { departmentId: deptId, userId: { $in: managerIds } },
              values: { is_manager_in_charge: true },
              transaction: t
            });
            const existing = await repo.find({
              filter: { departmentId: deptId },
              transaction: t
            });
            const existingIds = existing.map((d: any) => d.userId);
            for (let i = 0; i < managerIds.length; i++) {
              if (existingIds.indexOf(managerIds[i]) < 0) {
                await repo.create({
                  values: { departmentId: deptId, userId: managerIds[i], is_manager_in_charge: true },
                  transaction: t
                });
              }
            }
          });
        } catch (e) {
          console.log('[manager-resource-mw] Error:', e.message);
        }
      } else {
        await next();
      }
    });

    // Register all route modules
    const pluginRef = { db, isAuthenticated: isAuthenticated.bind(this) };
    registerProxyRoutes(app);
    registerAttendanceRoutes(app, pluginRef);
    registerDashboardRoutes(app, pluginRef);
    registerWeatherRoutes(app);
    registerPeopleDynamicRoutes(app);

    // Auto-fill hooks for construction daily entries and logs
    const entriesCol = db.getCollection('construction_daily_entries');
    const logCol = db.getCollection('construction_daily_log');

    // Add aggregated_up_to field for tracking aggregation state
    if (logCol) {
      try { logCol.addField('aggregated_up_to', { type: 'bigint' }); } catch (e) {}
    }

    // Auto-fill entry_date, weather, entry_no on entry creation
    if (entriesCol) {
      entriesCol.model.addHook('beforeCreate', async (record: any, options: any) => {
        const logId = record.get('log_id');
        if (logId && !record.get('project_name_NO')) {
          try {
            const parentLog = await record.sequelize.model('construction_daily_log').findByPk(logId);
            if (parentLog) {
              const projectNameNo = parentLog.get('project_name_NO');
              if (projectNameNo) {
                record.set('project_name_NO', projectNameNo);
              }
            }
          } catch (e) {
            console.log('[entry-hook] copy project_name_NO failed:', e.message);
          }
        }
      });

      entriesCol.model.addHook('beforeCreate', async (record: any, options: any) => {
        if (!record.get('entry_no')) {
          const now = new Date();
          const datePart = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
          const fullPrefix = 'SG-' + datePart + '-';
          try {
            const repo = record.sequelize.model('sys_serial_counters');
            const counter = await repo.findOne({ where: { prefix: fullPrefix } });
            let seq: number;
            if (!counter) {
              await repo.create({ prefix: fullPrefix, current_seq: 1, module: 'construction_daily' });
              seq = 1;
            } else {
              seq = counter.current_seq + 1;
              await repo.update({ current_seq: seq }, { where: { id: counter.id } });
            }
            record.set('entry_no', fullPrefix + String(seq).padStart(3, '0'));
          } catch (e) {
            record.set('entry_no', fullPrefix + '001');
          }
        }
      });
    }

    // Copy project_name_NO from parent log when entry's log_id is updated
    if (entriesCol) {
      entriesCol.model.addHook('beforeUpdate', async (record: any, options: any) => {
        const logId = record.get('log_id');
        if (logId && record.changed('log_id') && !record.get('project_name_NO')) {
          try {
            const parentLog = await record.sequelize.model('construction_daily_log').findByPk(logId);
            if (parentLog) {
              const projectNameNo = parentLog.get('project_name_NO');
              if (projectNameNo) {
                record.set('project_name_NO', projectNameNo);
              }
            }
          } catch (e) {
            console.log('[entry-hook] copy project_name_NO on update failed:', e.message);
          }
        }
      });
    }

    // Auto-fill log_date, log_no and weather on log creation
    if (logCol) {
      logCol.model.addHook('beforeCreate', async (record: any, options: any) => {
        if (!record.get('log_date')) {
          const now = new Date();
          const datePart = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
          record.set('log_date', parseInt(datePart));
        }
        if (!record.get('log_no')) {
          const now = new Date();
          const datePart = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
          const fullPrefix = 'LG-' + datePart + '-';
          try {
            const repo = record.sequelize.model('sys_serial_counters');
            const counter = await repo.findOne({ where: { prefix: fullPrefix } });
            let seq: number;
            if (!counter) {
              await repo.create({ prefix: fullPrefix, current_seq: 1, module: 'construction_daily' });
              seq = 1;
            } else {
              seq = counter.current_seq + 1;
              await repo.update({ current_seq: seq }, { where: { id: counter.id } });
            }
            record.set('log_no', fullPrefix + String(seq).padStart(3, '0'));
          } catch (e) {
            record.set('log_no', fullPrefix + '001');
          }
        }
        // Auto-fill weather from project location
        if (!record.get('weather')) {
          const projectNameNo = record.get('project_name_NO');
          if (projectNameNo) {
            try {
              const proj = await record.sequelize.model('projects').findByPk(projectNameNo);
              if (proj && proj.location_lat && proj.location_lon) {
                const weather = await qwFetch('https://' + QW_WEATHER_HOST + '/v7/weather/now?location=' + encodeURIComponent(proj.location_lon + ',' + proj.location_lat));
                if (weather && weather.code === '200' && weather.now) {
                  const n = weather.now;
                  const weatherStr = n.text + ' ' + (n.temp || '') + 'C ' + (n.windDir || '');
                  record.set('weather', weatherStr);
                }
              }
            } catch (e) {
              console.log('[weather-auto-log] fetch failed:', e.message);
            }
          }
        }
      });
    }

    // Auth-check endpoint for nginx auth_request
    app.use(async (ctx: any, next: () => Promise<void>) => {
      if (ctx.method !== 'GET' || ctx.state.reqPath !== '/__auth_check__') {
        return await next();
      }
      await authCheckHandler(ctx);
    }, { tag: 'dashboard-home', before: 'dataSource' });

    // Register page serving routes (must be last)
    registerPageRoutes(app);
  }

  async isAuthenticated(ctx: any): Promise<boolean> {
    return isAuthenticated(ctx);
  }
};
