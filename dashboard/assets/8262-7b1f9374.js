"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["8262"],{86949(e,o,t){t.r(o),t.d(o,{default:()=>s});let s={contexts:[t(64700).JSCollectionActionRunJSContext],prefix:"sn-act-iterate",label:"Iterate selected rows",description:"Loop through selected rows and process each record",locales:{"zh-CN":{label:"遍历选中行",description:"遍历选中行并处理每条记录"}},content:`
const rows = ctx.resource?.getSelectedRows?.() || [];
for (const row of rows) {
  console.log(ctx.t('Selected row:'), row);
}
ctx.message.success(ctx.t('Processed {{count}} rows', { count: rows.length }));
`}}}]);