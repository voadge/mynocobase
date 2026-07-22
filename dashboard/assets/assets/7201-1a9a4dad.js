"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["7201"],{93512(t,e,n){n.r(e),n.d(e,{default:()=>c});let c={contexts:[n(79271).JSBlockRunJSContext],prefix:"sn-jsb-button",label:"Render button handler",description:"Render a button and handle click events inside the block",locales:{"zh-CN":{label:"按钮事件处理",description:"在区块中渲染按钮并绑定点击处理逻辑"}},content:`
const { Button } = ctx.libs.antd;

ctx.render(
  <Button type="primary" onClick={() => ctx.message.success(ctx.t('Clicked!'))}>
    {ctx.t('Button')}
  </Button>
);
`}}}]);