"use strict";
/**
 * Approval CN Plugin - 桌面式流程审批
 * 复用原生 workflow manual 节点:
 *   - 任务源 workflowManualTasks (listMine/submit 原生, ACL loggedIn)
 *   - 会签/或签 = node.config.mode (0单人/1会签/-1或签)
 * 本插件提供:
 *   - approval_templates 元数据 + CRUD + bind + start
 *   - 桌面/详情/流程状态 API (/api/__appr__/*)
 *   - 审批桌面 SPA 页面服务
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Plugin } = require("@nocobase/server");
const { list, create, get, update, destroy } = require("@nocobase/actions");

const STORAGE_DIR = "/app/nocobase/storage/approval";

async function isAuthenticated(ctx) {
  if (ctx.state.currentUser) return true;
  const authHeader = ctx.get("Authorization") || "";
  let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) token = ctx.cookies.get("nb_token") || ctx.cookies.get("NOCOBASE_token");
  if (!token) return false;
  try {
    const result = await new Promise((resolve, reject) => {
      const req = http.get({
        hostname: "127.0.0.1", port: 13000, path: "/api/auth:check",
        headers: { Authorization: "Bearer " + token }, timeout: 5000,
      }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b })); });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    });
    if (result.status === 200) {
      const d = JSON.parse(result.body);
      const u = d && d.data ? d.data : d;
      if (u && u.id) { ctx.state.currentUser = u; return true; }
    }
    return false;
  } catch (e) { return false; }
}

async function authCheck(ctx) {
  ctx.withoutDataWrapping = true;
  if (await isAuthenticated(ctx)) { ctx.status = 200; ctx.body = { data: ctx.state.currentUser }; }
  else { ctx.status = 401; ctx.body = { errors: [{ message: "Unauthorized" }] }; }
}

function collectActions(cfg) {
  const out = [];
  const forms = (cfg && cfg.forms) || {};
  for (const fk in forms) {
    const f = forms[fk];
    (f.actions || []).forEach((a) => {
      out.push({ key: a.key, status: a.status, title: a.title || "", formKey: fk, formType: f.type || f.formType, values: a.values || {} });
    });
  }
  return out;
}

function resolveCollection(t) {
  const node = t.node || {};
  const forms = (node.config && node.config.forms) || {};
  const first = forms[Object.keys(forms)[0]];
  if (first && first.collection) return first.collection;
  if (t.workflow && t.workflow.config && t.workflow.config.collection) return t.workflow.config.collection;
  return null;
}

function getFieldMeta(db, collection) {
  if (!collection || !db.hasCollection(collection)) return {};
  const meta = {};
  const SYS_NAMES = ["id", "createdAt", "createdBy", "updatedAt", "updatedBy", "sort", "cron", "exclude", "__index"];
  try {
    const coll = db.getCollection(collection);
    coll.getFields().forEach((f) => {
      const o = f.options || {};
      const ui = o.uiSchema || {};
      const enumVal = Array.isArray(ui.enum) ? ui.enum : (Array.isArray(o.enum) ? o.enum : (Array.isArray(o.data) ? o.data : null));
      const cp = ui["x-component-props"] || {};
      const readOnly = !!(ui["x-read-pretty"] || cp.disabled || cp.read_only || o.readOnly || (ui["x-disabled"] === true));
      const required = !!ui["x-validator"] ? (JSON.stringify(ui["x-validator"]).indexOf("required") >= 0) : null;
      const dv = o.hasOwnProperty("defaultValue") ? o.defaultValue : (ui.hasOwnProperty("defaultValue") ? ui.defaultValue : null);
      meta[f.name] = {
        label: o.title || ui.title || f.name,
        system: !!(o.system || SYS_NAMES.indexOf(f.name) >= 0),
        interface: f.interface || o.interface || o.type || null,
        enum: enumVal ? enumVal.map((e) => ({ value: e.value != null ? e.value : e, label: e.label != null ? e.label : e.value })) : null,
        defaultValue: dv,
        readOnly: !!readOnly,
        required: required,
      };
    });
  } catch (e) {}
  return meta;
}

// 提取人工节点"流程待办"表单字段：schema 中 formKey 子树下的 CollectionField
// currentUser: {name, id} 当前操作人，用于解析 {{$user.nickname}}/$user.id
function extractApprovalForm(schema, forms, currentUser) {
  const out = { formKey: null, fields: [], actions: [] };
  if (!schema || typeof schema !== "object") return out;
  const formKeys = Object.keys(forms || {});
  const collected = [];
  const SKIP = ["x-component-props", "x-decorator-props", "x-schema-component-props", "x-action-props"];
  function walk(o, inForm) {
    if (!o) return;
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) walk(o[i], inForm); return; }
    if (typeof o !== "object") return;
    const name = o.name || "";
    let childInForm = inForm;
    if (formKeys.indexOf(name) >= 0) childInForm = name;
    if (childInForm && o["x-component"] === "CollectionField") collected.push(name);
    for (const k in o) {
      if (SKIP.indexOf(k) >= 0) continue;
      const v = o[k];
      if (v && typeof v === "object") walk(v, childInForm);
    }
  }
  walk(schema, false);
  out.formKey = formKeys[0] || null;
  out.fields = Array.from(new Set(collected));
  if (formKeys.length && forms[formKeys[0]]) {
    const cu = currentUser || {};
    out.actions = (forms[formKeys[0]].actions || []).map((a) => {
      const vals = {};
      const raw = a.values || {};
      for (const k in raw) {
        let v = raw[k];
        if (typeof v === "string") {
          if (cu.name && v.indexOf("{{$user.nickname}}") >= 0) v = cu.name;
          else if (cu.id != null && v.indexOf("{{$user.id}}") >= 0) v = cu.id;
        }
        vals[k] = v;
      }
      return { key: a.key, status: a.status, title: a.title || "", values: vals };
    });
  }
  return out;
}

function summarizeBusiness(data, limit = 6) {
  const pick = ["title", "name", "log_no", "project_name", "subject", "status", "amount", "log_date", "apply_date", "reason"];
  const res = {};
  const keys = Object.keys(data || {});
  for (const k of pick) {
    if (data[k] !== undefined && data[k] !== null) { res[k] = String(data[k]); }
  }
  const others = keys.filter((k) => res[k] === undefined && !["id", "createdAt", "updatedAt", "createdById", "updatedById", "projectID", "exclude", "cron", "status"].includes(k));
  let n = 0;
  for (const k of others) {
    if (n >= limit) break;
    if (res[k] !== undefined) continue;
    const v = data[k];
    if (typeof v === "object" && v !== null) continue;
    res[k] = String(v);
    n++;
  }
  return res;
}

async function desk(ctx, db) {
  ctx.withoutDataWrapping = true;
  if (!(await isAuthenticated(ctx))) { ctx.status = 401; ctx.body = { code: -1, msg: "Unauthorized" }; return; }
  const uid = ctx.state.currentUser.id;
  try {
    const repo = db.getRepository("workflowManualTasks");
    const tasks = await repo.find({
      filter: { userId: uid, status: 0 },
      appends: ["node", "execution", "workflow"],
      sort: "-createdAt",
    });
    const out = tasks.map((t) => {
      const node = t.node || {};
      const cfg = node.config || {};
      const exec = t.execution || {};
      const data = (exec.context && exec.context.data) || {};
      const collection = resolveCollection(t);
      return {
        taskId: t.id,
        title: t.title,
        workflowId: t.workflowId,
        workflowTitle: (t.workflow && t.workflow.title) || "",
        nodeId: t.nodeId,
        nodeTitle: node.title || "",
        nodeMode: cfg.mode ?? 0,
        actions: collectActions(cfg),
        executionId: t.executionId,
        createdAt: t.createdAt,
        business: summarizeBusiness(data),
        businessCollection: collection,
        fieldMeta: getFieldMeta(db, collection),
      };
    });
    ctx.body = { code: 0, data: out };
  } catch (e) {
    ctx.status = 500; ctx.body = { code: -1, msg: e.message };
  }
}

async function flowState(executionId, db) {
  const nodes = await db.sequelize.query(
    'SELECT id,key,title,type,"upstreamId","branchIndex","downstreamId",config FROM flow_nodes WHERE "workflowId"=(SELECT "workflowId" FROM executions WHERE id=?) ORDER BY id',
    { replacements: [executionId], type: db.sequelize.QueryTypes.SELECT }
  );
  const jobs = await db.sequelize.query(
    'SELECT id,"nodeId",status,result FROM jobs WHERE "executionId"=? ORDER BY id',
    { replacements: [executionId], type: db.sequelize.QueryTypes.SELECT }
  );
  return { nodes, jobs };
}

async function detail(ctx, db) {
  ctx.withoutDataWrapping = true;
  if (!(await isAuthenticated(ctx))) { ctx.status = 401; ctx.body = { code: -1, msg: "Unauthorized" }; return; }
  const id = ctx.params.taskId || ctx.query.taskId;
  if (!id) { ctx.body = { code: -1, msg: "taskId required" }; return; }
  try {
    const repo = db.getRepository("workflowManualTasks");
    const t = await repo.findOne({ filterByTk: id, appends: ["node", "execution", "workflow"] });
    if (!t) { ctx.body = { code: -1, msg: "task not found" }; return; }
    const node = t.node || {};
    const cfg = node.config || {};
    const exec = t.execution || {};
    const flow = await flowState(t.executionId, db);
    const collection = resolveCollection(t);
    const fieldMeta = getFieldMeta(db, collection);
    const cu = ctx.state.currentUser || (ctx.state.auth && ctx.state.auth.user) || {};
    const cuName = cu.name || cu.nickname || cu.username || "";
    const apf = extractApprovalForm(cfg.schema, cfg.forms, { name: cuName, id: cu.id });
    const formFields = apf.fields.map((name) => {
      const m = fieldMeta[name] || {};
      const preset = apf.actions.some((a) => a.values && Object.prototype.hasOwnProperty.call(a.values, name));
      return {
        name, label: m.label || name, interface: m.interface || null, enum: m.enum || null, preset: !!preset,
        defaultValue: m.defaultValue, readOnly: !!m.readOnly, required: m.required != null ? !!m.required : null,
      };
    });
    ctx.body = {
      code: 0,
      data: {
        task: { id: t.id, status: t.status, title: t.title, result: t.result },
        node: { id: node.id, title: node.title, mode: cfg.mode ?? 0, assignees: cfg.assignees || [], forms: cfg.forms || {} },
        execution: { id: exec.id, status: exec.status, startedAt: exec.startedAt, reason: exec.reason },
        workflow: { id: t.workflowId, title: (t.workflow && t.workflow.title) || "", config: (t.workflow && t.workflow.config) || {} },
        business: (exec.context && exec.context.data) || {},
        businessCollection: collection,
        fieldMeta,
        approvalForm: { formKey: apf.formKey, fields: formFields, actions: apf.actions, operatorName: cuName || null },
        flow,
      },
    };
  } catch (e) {
    ctx.status = 500; ctx.body = { code: -1, msg: e.message };
  }
}

async function bind(context, next) {
  const { filterByTk, values } = context.action.params;
  const repo = context.db.getRepository("approval_templates");
  const { targetCollections = [], trigger = "manual", deskConfig = {}, workflowId } = values || {};
  if (!filterByTk) return context.throw(400, "filterByTk required");
  if (!workflowId) return context.throw(400, "workflowId required");
  const record = await repo.findOne({ filterByTk });
  if (!record) return context.throw(404, "template not found");
  await repo.update({ filterByTk, values: { workflowId, targetCollections, trigger, deskConfig } });
  context.body = await repo.findOne({ filterByTk });
  await next();
}

/** 手动发起审批: 创建业务记录并触发绑定工作流 */
async function start(context) {
  const { filterByTk, values } = context.action.params;
  const db = context.db;
  try {
    const template = await db.getRepository("approval_templates").findOne({ filterByTk });
    if (!template || !template.workflowId) return context.throw(400, "template not found or no workflowId");
    const wf = await db.getRepository("workflows").findOne({ filterByTk: template.workflowId, fields: ["key", "title", "type", "config"] });
    let recordId = null;
    const collection = values && values.collection;
    const data = values && values.data;
    if (collection && data) {
      const rec = await db.getRepository(collection).create({ values: data, context });
      recordId = rec.id;
    }
    const key = (wf && wf.key) || "";
    context.body = {
      templateId: template.id,
      workflowId: template.workflowId,
      workflowKey: key,
      workflowTitle: (wf && wf.title) || "",
      workflowType: (wf && wf.type) || "",
      recordId,
      note: collection ? ("已创建业务记录；若工作流为 collection 触发器将自动进入审批。手动触发: POST /api/" + collection + ":create?triggerWorkflows=" + key) : ("手动触发: POST /api/" + (collection || "<collection>") + ":create?triggerWorkflows=" + key),
    };
  } catch (e) {
    context.throw(500, e.message);
  }
}

module.exports = class ApprovalCnPlugin extends Plugin {
  async load() {
    const app = this.app;
    const db = this.db;

    if (!db.hasCollection("approval_templates")) {
      db.collection({
        name: "approval_templates",
        fields: [
          { type: "string", name: "name" },
          { type: "bigInt", name: "workflowId" },
          { type: "json", name: "targetCollections" },
          { type: "string", name: "trigger" },
          { type: "json", name: "deskConfig" },
          { type: "json", name: "flowDefSnapshot" },
        ],
      });
    }
    if (!db.hasCollection("approval_audit_logs")) {
      db.collection({
        name: "approval_audit_logs",
        fields: [
          { type: "bigInt", name: "taskId" },
          { type: "bigInt", name: "executionId" },
          { type: "bigInt", name: "workflowId" },
          { type: "bigInt", name: "userId" },
          { type: "bigInt", name: "nodeId" },
          { type: "integer", name: "actionStatus" },
          { type: "string", name: "actionKey" },
          { type: "json", name: "result" },
        ],
      });
    }
    await db.getCollection("approval_templates").sync({ alter: true }).catch((e) => console.log("[approval-cn] sync templates error:", e.message));
    await db.getCollection("approval_audit_logs").sync({ alter: true }).catch((e) => console.log("[approval-cn] sync audit error:", e.message));

    // 审批操作审计: 记录任务状态变更
    db.on("workflowManualTasks.afterUpdate", async (task, options) => {
      try {
        const changed = task.changed && task.changed();
        if (!changed || changed.indexOf("status") < 0) return;
        await db.getRepository("approval_audit_logs").create({
          values: {
            taskId: task.get("id"),
            executionId: task.get("executionId"),
            workflowId: task.get("workflowId"),
            userId: task.get("userId"),
            nodeId: task.get("nodeId"),
            actionStatus: task.get("status"),
            actionKey: task.get("result") && task.get("result")._ || null,
            result: task.get("result"),
          },
        });
      } catch (e) {
        console.log("[approval-cn] audit error:", e.message);
      }
    });

    app.resourceManager.define({
      name: "approval_templates",
      actions: { list, create, get, update, destroy, bind, start },
    });
    app.acl.allow("approval_templates", ["list", "get"], "loggedIn");
    app.acl.allow("approval_templates", ["create", "update", "destroy", "bind", "start"], "admin");

    app.use(async (ctx, next) => { ctx.state.reqPath = ctx.path.replace(/^\/api/, ""); await next(); }, { before: "dataSource" });

    app.use(async (ctx, next) => {
      if (ctx.method !== "GET" || ctx.state.reqPath !== "/__appr_auth_check__") return next();
      await authCheck(ctx);
    }, { before: "dataSource" });

    // 页面服务
    app.use(async (ctx, next) => {
      const rp = ctx.state.reqPath;
      if (ctx.method !== "GET" || (rp !== "/__appr__" && rp !== "/__appr__/")) return next();
      if (!(await isAuthenticated(ctx))) { ctx.redirect("/signin"); return; }
      ctx.withoutDataWrapping = true;
      ctx.set("Cache-Control", "no-cache, no-store, must-revalidate");
      try { ctx.type = "text/html; charset=utf-8"; ctx.body = fs.readFileSync(path.join(STORAGE_DIR, "index.html"), "utf-8"); }
      catch (e) { ctx.status = 500; ctx.body = "Page file not found"; }
    }, { tag: "approval-cn", before: "dataSource" });

    // 静态资源 (JS/CSS)
    app.use(async (ctx, next) => {
      const rp = ctx.state.reqPath;
      if (ctx.method !== "GET" || rp.indexOf("/__appr__/assets/") !== 0) return next();
      if (!(await isAuthenticated(ctx))) { ctx.status = 401; return; }
      ctx.withoutDataWrapping = true;
      const file = rp.replace("/__appr__/assets/", "");
      const safe = path.basename(file);
      const full = path.join(STORAGE_DIR, "assets", safe);
      ctx.set("Cache-Control", "no-cache");
      if (safe.endsWith(".js")) ctx.type = "application/javascript; charset=utf-8";
      else if (safe.endsWith(".css")) ctx.type = "text/css; charset=utf-8";
      try { ctx.body = fs.readFileSync(full, "utf-8"); } catch (e) { ctx.status = 404; ctx.body = "not found"; }
    }, { tag: "approval-cn", before: "dataSource" });

    // API 路由
    app.use(async (ctx, next) => {
      const rp = ctx.state.reqPath;
      if (rp === "/__appr__/desk" && ctx.method === "GET") return desk(ctx, db);
      if (rp.indexOf("/__appr__/detail/") === 0 && ctx.method === "GET") { ctx.params = ctx.params || {}; ctx.params.taskId = rp.split("/")[3]; return detail(ctx, db); }
      if (rp === "/__appr__/ping") { ctx.withoutDataWrapping = true; ctx.body = { code: 0, data: { ok: true, ts: Date.now() } }; return; }
      return next();
    }, { tag: "approval-cn", before: "dataSource" });

    console.log("[approval-cn] plugin loaded");
  }
};