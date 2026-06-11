"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["8562"],{25417(e,t,a){a.r(t),a.d(t,{default:()=>r});let r={contexts:[a(79271).JSBlockRunJSContext],prefix:"sn-jsb-iframe",label:"Render iframe",description:"Embed example.com as a sandboxed iframe inside the block element",locales:{"zh-CN":{label:"渲染 iframe",description:"在区块中以 sandbox 限制嵌入 example.com 页面"}},content:`
// Create an iframe that fills the current block container
const iframe = document.createElement('iframe');
iframe.src = 'https://example.com';
iframe.setAttribute('sandbox', 'allow-scripts');
iframe.style.width = '100%';
iframe.style.height = '100%';
iframe.style.border = 'none';

// Render the iframe as the only content
ctx.render(iframe);
`}}}]);