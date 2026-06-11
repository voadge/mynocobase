"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["6373"],{25716(e,n,t){t.r(n),t.d(n,{default:()=>o});let o={contexts:["*"],prefix:"sn-import",label:"Import ESM module",description:"Dynamically import an ESM module by URL",locales:{"zh-CN":{label:"导入 ESM 模块",description:"按 URL 动态导入 ESM 模块"}},content:`
// Import an ESM module by URL
// Works in yarn dev and yarn start
const mod = await ctx.importAsync('lit-html@2');
const { html, render } = mod;

const container = document.createElement('div');
container.style.padding = '8px';
container.style.border = '1px dashed #999';
ctx.render(container);

render(html\`<span style="color:#52c41a;">lit-html loaded and rendered</span>\`, container);
`}}}]);