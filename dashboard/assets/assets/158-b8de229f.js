"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["158"],{37517(e,i,r){r.r(i),r.d(i,{default:()=>s});let s={contexts:[r(32221).JSItemRunJSContext],prefix:"sn-link-require",label:"Conditional required field",description:"Make a field required based on another field's value",locales:{"zh-CN":{label:"条件必填",description:"根据另一个字段的值动态设置必填状态"}},content:`
// When 'needsApproval' is true, make 'approver' field required
const needsApproval = ctx.record?.needsApproval;

const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);

const approverField = candidates.find((item) => item?.props?.name === 'approver');

if (approverField) {
  approverField.setProps({
    required: !!needsApproval,
    // Also toggle visibility if needed
    // display: needsApproval ? 'visible' : 'hidden',
  });
} else {
  console.warn('[Form snippet] approver field not found');
}
`}}}]);