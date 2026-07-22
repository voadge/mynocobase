"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["5064"],{35803(e,t,c){c.r(t),c.d(t,{default:()=>s});let s={contexts:[c(64700).JSCollectionActionRunJSContext],prefix:"sn-act-selected-count",label:"Selected count",description:"Show number of selected rows in list action",locales:{"zh-CN":{label:"选中数量",description:"提示当前选中行的数量"}},content:`
const rows = ctx.resource?.getSelectedRows?.() || [];
if (!rows.length) {
  ctx.message.warning(ctx.t('Please select data'));
} else {
  ctx.message.success(ctx.t('Selected {{count}} rows', { count: rows.length }));
}
`}}}]);