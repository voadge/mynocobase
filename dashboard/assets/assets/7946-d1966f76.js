"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["7946"],{66321(e,s,t){t.r(s),t.d(s,{default:()=>a});let a={contexts:["*"],prefix:"sn-api-request",label:"API request template",description:"Basic template to send HTTP requests via ctx.request",locales:{"zh-CN":{label:"API 请求模板",description:"使用 ctx.request 发送 HTTP 请求的基础模板"}},content:`
// Replace url/method/params/data as needed
const response = await ctx.request({
  url: 'users:list',
  method: 'get',
  params: {
    pageSize: 10,
  },
});

ctx.message.success(ctx.t('Request finished'));
console.log(ctx.t('Response data:'), response?.data);
`}}}]);