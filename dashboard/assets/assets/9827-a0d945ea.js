"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["9827"],{10782(e,l,t){t.r(l),t.d(l,{default:()=>s});let s={contexts:["*"],scenes:["tableFieldEvent"],prefix:"sn-table-cell-style",label:"Set table cell style",description:"Customize table field cell styles with onCell",locales:{"zh-CN":{label:"表格字段样式设置",description:"通过 onCell 自定义表格字段单元格样式"}},content:`
ctx.model.props.onCell = (record, rowIndex) => {
  return {
    style: {
      background: 'red',
    },
  };
};
`}}}]);