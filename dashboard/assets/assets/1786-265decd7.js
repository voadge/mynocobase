"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["1786"],{84529(e,n,t){t.r(n),t.d(n,{default:()=>r});var a=t(98542),l=t(25831);let r={contexts:[a.JSFieldRunJSContext,l.FormJSFieldItemRunJSContext],prefix:"sn-jsf-num",label:"Display number field as localized number",description:"Format numeric values with locale-aware separators before rendering",locales:{"zh-CN":{label:"将数字字段显示为本地化格式",description:"按本地化格式输出数值"}},content:`
// Format number using locale
const n = Number(ctx.value ?? 0);
ctx.render(String(Number.isFinite(n) ? n.toLocaleString() : ctx.value ?? ''));
`}}}]);