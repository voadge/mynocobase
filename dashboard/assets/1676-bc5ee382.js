"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["1676"],{6551(e,a,t){t.r(a),t.d(a,{default:()=>o});let o={contexts:["*"],versions:["*"],prefix:"sn-open-drawer",label:"Open view (drawer)",description:"Open a view in drawer via ctx.openView",locales:{"zh-CN":{label:"打开视图（抽屉）",description:"通过 ctx.openView 以抽屉方式打开视图"}},content:`
// Open a view as drawer and pass arguments at top-level
const popupUid = ctx.model.uid + '-1'; // popupUid should be stable and better bound to ctx.model.uid
await ctx.openView(popupUid, {
  mode: 'drawer',
  title: ctx.t('Sample drawer'),
  size: 'large',
});
`}}}]);