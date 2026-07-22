"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["5761"],{30008(e,i,t){t.r(i),t.d(i,{default:()=>d});let d={contexts:[t(32221).JSItemRunJSContext],prefix:"sn-link-visibility",label:"Toggle visible",description:"Show or hide another field within linkage scripts",locales:{"zh-CN":{label:"切换可见性",description:"在联动脚本中设置字段显示或隐藏"}},content:`
const targetFieldUid = 'FIELD_UID_OR_NAME';
const shouldHide = true;

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

fieldModel.setProps({ hiddenModel: shouldHide });
ctx.message?.success?.(
  ctx.t(shouldHide ? 'Hidden field {{name}}' : 'Shown field {{name}}', {
    name: fieldModel?.props?.label || targetFieldUid,
  }),
);
`}}}]);