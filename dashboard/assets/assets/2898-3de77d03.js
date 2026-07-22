"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["2898"],{17689(e,n,o){o.r(n),o.d(n,{default:()=>t});var s=o(98542),l=o(25831);let t={contexts:[s.JSFieldRunJSContext,l.FormJSFieldItemRunJSContext],prefix:"sn-jsf-color",label:"Display number field as colored text",description:"Display numeric values using colors based on their sign",locales:{"zh-CN":{label:"将数字字段显示为彩色文本",description:"根据数值正负设置显示颜色"}},content:`
// Colorize based on numeric sign
const n = Number(ctx.value ?? 0);
const color = Number.isFinite(n) ? (n > 0 ? 'green' : n < 0 ? 'red' : '#999') : '#555';
ctx.render('<span style=' + JSON.stringify('color:' + color) + '>' + String(ctx.value ?? '') + '</span>');
`}}}]);