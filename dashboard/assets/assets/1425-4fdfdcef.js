"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["1425"],{57064(e,t,a){a.r(t),a.d(t,{default:()=>l});let l={contexts:[a(98542).JSFieldRunJSContext],prefix:"sn-jsf-copy",label:"Display text field with copy button",description:"Render the text field value with a copy-to-clipboard button",locales:{"zh-CN":{label:"将文本字段显示为复制按钮",description:"展示字段值并提供快捷复制到剪贴板的按钮"}},content:`
const text = String(ctx.value ?? '');

const wrapper = document.createElement('span');
wrapper.style.display = 'inline-flex';
wrapper.style.alignItems = 'center';
wrapper.style.gap = '8px';

const valueEl = document.createElement('span');
valueEl.textContent = text;
valueEl.style.color = '#666';

const copyEl = document.createElement('a');
copyEl.textContent = ctx.t('Copy');
copyEl.style.cursor = 'pointer';
copyEl.style.color = '#1677ff';

copyEl.addEventListener('click', async () => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  ctx.message.success(ctx.t('Copied'));
});

wrapper.appendChild(valueEl);
wrapper.appendChild(copyEl);

ctx.render(wrapper);
`}}}]);