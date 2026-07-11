"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["3989"],{35876(e,t,i){i.r(t),i.d(t,{default:()=>a});let a={contexts:[i(32221).JSItemRunJSContext],prefix:"sn-link-set",label:"Set field value",description:"Programmatically update another field in linkage scripts",locales:{"zh-CN":{label:"设置字段值",description:"在联动脚本中为其他字段设置值"}},content:`
// Update another field in the same form/block
const targetFieldUid = 'FIELD_UID_OR_NAME';
const nextValue = ctx.record?.status ?? ctx.t('Updated value');

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

fieldModel.setProps({ value: nextValue });
ctx.message?.success?.(
  ctx.t('Updated field {{name}}', { name: fieldModel?.props?.label || targetFieldUid }),
);
`}}}]);