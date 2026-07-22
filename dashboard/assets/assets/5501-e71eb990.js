"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["5501"],{71868(e,t,c){c.r(t),c.d(t,{default:()=>n});let n={contexts:[c(79271).JSBlockRunJSContext],prefix:"sn-jsb-react",label:"Render React",description:"Render a React element inside the block container",locales:{"zh-CN":{label:"渲染 React",description:"在区块容器中渲染 React 组件"}},content:`
// Render a React element into the current container
const { Button } = ctx.libs.antd;

ctx.render(
  <div style={{ padding: 12 }}>
    <Button type="primary" onClick={() => ctx.message.success(ctx.t('Clicked!'))}>
      {ctx.t('Click')}
    </Button>
  </div>
);
`}}}]);