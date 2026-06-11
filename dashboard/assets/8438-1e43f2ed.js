"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["8438"],{7765(s,t,e){e.r(t),e.d(t,{default:()=>n});var o=e(98542),a=e(25831),l=e(96108);let n={contexts:[o.JSFieldRunJSContext,a.FormJSFieldItemRunJSContext,l.JSColumnRunJSContext],scenes:["detail","table"],prefix:"sn-jsf-status-tag",label:"Display status field as colored tag",description:"Display status values using colored tags",locales:{"zh-CN":{label:"将状态字段显示为彩色标签",description:"根据状态值显示不同颜色的标签"}},content:`
const statusColors = {
  active: 'green',
  pending: 'orange',
  inactive: 'gray',
  error: 'red',
  success: 'blue',
};

const status = String(ctx.value || 'unknown');
const color = statusColors[status] || 'default';

ctx.render(\`
  <span style="
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    background-color: var(--\${color}-1, #f0f0f0);
    color: var(--\${color}-6, #333);
    border: 1px solid var(--\${color}-3, #d9d9d9);
  ">
    \${ctx.t(status)}
  </span>
\`);
`}}}]);