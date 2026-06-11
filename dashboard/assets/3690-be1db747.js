"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["3690"],{92625(e,t,s){s.r(t),s.d(t,{default:()=>o});let o={contexts:[s(64700).JSCollectionActionRunJSContext],prefix:"sn-act-destroy-selected",label:"Destroy selected rows",description:"Delete selected rows via resource.destroySelectedRows()",locales:{"zh-CN":{label:"删除选中行",description:"通过 resource.destroySelectedRows() 删除选中行"}},content:`
const rows = ctx.resource?.getSelectedRows?.() || [];
if (!rows.length) {
  ctx.message.warning(ctx.t('Please select data'));
  return;
}

await ctx.resource.destroySelectedRows();
ctx.message.success(ctx.t('Deleted {{count}} rows', { count: rows.length }));
`}}}]);