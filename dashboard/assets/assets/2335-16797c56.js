"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["2335"],{74354(t,e,i){i.r(e),i.d(e,{default:()=>a});let a={contexts:[i(32221).JSItemRunJSContext],prefix:"sn-link-calc",label:"Calculate total price (quantity \xd7 price)",description:"Automatically calculate total when quantity or unit price changes",locales:{"zh-CN":{label:"计算总价（数量 \xd7 单价）",description:"当数量或单价变化时自动计算总价"}},content:`
// Get quantity and unit price from current record
const quantity = Number(ctx.record?.quantity) || 0;
const unitPrice = Number(ctx.record?.unitPrice) || 0;
const total = quantity * unitPrice;

// Find and update the 'totalPrice' field
const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);

const totalField = candidates.find((item) => item?.props?.name === 'totalPrice');

if (totalField) {
  totalField.setProps({ value: total.toFixed(2) });
} else {
  console.warn('[Form snippet] totalPrice field not found');
}
`}}}]);