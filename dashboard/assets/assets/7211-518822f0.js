"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["7211"],{29846(e,o,i){i.r(o),i.d(o,{default:()=>a});let a={contexts:["*"],versions:["*"],prefix:"sn-open-dialog",label:"Open view (dialog)",description:"Open a view in dialog via ctx.openView",locales:{"zh-CN":{label:"打开视图（对话框）",description:"通过 ctx.openView 以对话框方式打开视图"}},content:`
// Open a view as dialog and pass arguments at top-level
const popupUid = ctx.model.uid + '-1'; // popupUid should be stable and better bound to ctx.model.uid
await ctx.openView(popupUid, {
  mode: 'dialog',
  title: ctx.t('Sample dialog'),
  size: 'medium',
});
`}}}]);