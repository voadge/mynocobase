/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ManualInstruction_exports = {};
__export(ManualInstruction_exports, {
  default: () => ManualInstruction_default
});
module.exports = __toCommonJS(ManualInstruction_exports);
var import_utils = require("@nocobase/utils");
var import_plugin_workflow = require("@nocobase/plugin-workflow");
var import_forms = __toESM(require("./forms"));
class ManualInstruction_default extends import_plugin_workflow.Instruction {
  constructor(workflow) {
    super(workflow);
    this.workflow = workflow;
    (0, import_forms.default)(this);
  }
  formTypes = new import_utils.Registry();
  async run(node, prevJob, processor) {
    const { mode, ...config } = node.config;
    const assignees = [...new Set(processor.getParsedValue(config.assignees, node.id).flat().filter(Boolean))];
    const job = processor.saveJob({
      status: assignees.length ? import_plugin_workflow.JOB_STATUS.PENDING : import_plugin_workflow.JOB_STATUS.RESOLVED,
      result: mode ? [] : null,
      nodeId: node.id,
      nodeKey: node.key,
      upstreamId: (prevJob == null ? void 0 : prevJob.id) ?? null
    });
    if (!assignees.length) {
      return job;
    }
    const title = config.title ? processor.getParsedValue(config.title, node.id) : node.title;
    const TaskRepo = this.workflow.app.db.getRepository("workflowManualTasks");
    await TaskRepo.createMany({
      records: assignees.map((userId) => ({
        userId,
        jobId: job.id,
        nodeId: node.id,
        executionId: job.executionId,
        workflowId: node.workflowId,
        status: import_plugin_workflow.JOB_STATUS.PENDING,
        title
      }))
    });
    return job;
  }
  async resume(node, job, processor) {
    processor.logger.debug(`manual resume job and next status: ${job.status}`);
    return job;
  }
}
