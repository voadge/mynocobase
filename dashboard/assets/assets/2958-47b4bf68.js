"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["2958"],{93117(e,t,l){l.r(t),l.d(t,{default:()=>o});var r=l(79271),c=l(98542),n=l(25831);let o={contexts:[r.JSBlockRunJSContext,c.JSFieldRunJSContext,n.FormJSFieldItemRunJSContext],prefix:"sn-query-selector",label:"Query selector",description:"Find a child element inside rendered DOM using querySelector",locales:{"zh-CN":{label:"查询子元素",description:"使用 querySelector 在渲染的 DOM 内查找子元素"}},content:`
const wrapper = document.createElement('div');
wrapper.innerHTML = '<div class="child-class"></div>';

ctx.render(wrapper);

const child = wrapper.querySelector('.child-class');
if (child) {
  child.textContent = ctx.t('Hello from querySelector');
}
`}}}]);