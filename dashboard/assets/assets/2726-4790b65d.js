"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["2726"],{37285(t,e,a){a.r(e),a.d(e,{default:()=>r});let r={contexts:[a(79271).JSBlockRunJSContext],prefix:"sn-echarts",label:"Init ECharts",description:"Load ECharts and render a simple chart inside the block",locales:{"zh-CN":{label:"初始化 ECharts",description:"加载 ECharts 并在区块内渲染示例图表"}},content:`
const container = document.createElement('div');
container.style.height = '400px';
container.style.width = '100%';
ctx.render(container);
const echarts = await ctx.requireAsync('echarts@5/dist/echarts.min.js');
if (!echarts) {
  throw new Error('ECharts library not loaded');
}

const chart = echarts.init(container);
chart.setOption({
  title: { text: ctx.t('ECharts') },
  series: [{ type: 'pie', data: [{ value: 1, name: ctx.t('A') }] }],
});

chart.resize();
`}}}]);