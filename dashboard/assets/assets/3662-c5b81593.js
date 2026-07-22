"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["3662"],{44637(e,i,t){t.r(i),t.d(i,{default:()=>d});let d={contexts:[t(32221).JSItemRunJSContext],prefix:"sn-link-required",label:"Set required",description:"Toggle required rule for another field within linkage",locales:{"zh-CN":{label:"设置必填",description:"在联动脚本中控制字段是否必填"}},content:`
const targetFieldUid = 'FIELD_UID_OR_NAME';
const required = true;

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

fieldModel.setProps({ required });
ctx.message?.success?.(
  ctx.t(required ? 'Set field {{name}} as required' : 'Field {{name}} is optional', {
    name: fieldModel?.props?.label || targetFieldUid,
  }),
);
`}}}]);