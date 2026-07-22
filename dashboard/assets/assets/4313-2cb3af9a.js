"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["4313"],{66656(e,i,t){t.r(i),t.d(i,{default:()=>d});let d={contexts:[t(32221).JSItemRunJSContext],prefix:"sn-link-disable",label:"Set disabled",description:"Enable or disable another field in linkage scripts",locales:{"zh-CN":{label:"设置禁用",description:"在联动脚本中启用或禁用字段"}},content:`
const targetFieldUid = 'FIELD_UID_OR_NAME';
const disabled = true;

const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items)
  ? items
  : Array.from(items?.values?.() || items || []);
const fieldModel =
  candidates.find((item) => item?.uid === targetFieldUid) ||
  candidates.find((item) => item?.props?.name === targetFieldUid);

if (!fieldModel) {
  ctx.message?.warning?.(ctx.t('Field {{name}} not found', { name: targetFieldUid }));
  return;
}

fieldModel.setProps({ disabled });
ctx.message?.success?.(
  ctx.t(disabled ? 'Disabled field {{name}}' : 'Enabled field {{name}}', {
    name: fieldModel?.props?.label || targetFieldUid,
  }),
);
`}}}]);