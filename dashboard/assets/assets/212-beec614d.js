"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["212"],{97487(e,t,n){n.r(t),n.d(t,{default:()=>c});let c={contexts:[n(79271).JSBlockRunJSContext],prefix:"sn-jsb-click",label:"Add click listener",description:"Render a button and bind a click event handler",locales:{"zh-CN":{label:"添加点击监听",description:"渲染按钮并绑定点击事件处理"}},content:`
// Render a button and bind a click handler
const button = document.createElement('button');
button.textContent = ctx.t('Click me');
button.style.padding = '6px 12px';
button.addEventListener('click', () => ctx.message.success(ctx.t('Clicked!')));

const wrapper = document.createElement('div');
wrapper.style.padding = '12px';
wrapper.appendChild(button);

ctx.render(wrapper);
`}}}]);