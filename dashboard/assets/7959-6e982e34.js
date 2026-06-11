"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["7959"],{79242(e,t,l){l.r(t),l.d(t,{default:()=>a});let a={contexts:[l(32221).JSItemRunJSContext],prefix:"sn-link-cascade",label:"Cascade select (load child roles)",description:"Load child roles based on the selected parent role",locales:{"zh-CN":{label:"级联选择（加载子角色）",description:"根据选择的父角色加载对应子角色"}},content:`
// Get selected parent role (adjust field name to match your form)
const parentRoleId = ctx.record?.parentRole?.id;

if (!parentRoleId) {
  return;
}

const res = await ctx.request({
  url: 'roles:list',
  method: 'get',
  params: {
    pageSize: 100,
    filter: {
      parentId: parentRoleId,
    },
  },
});

const childRoles = res?.data?.data || [];

const items = ctx.model?.subModels?.grid?.subModels?.items;
const candidates = Array.isArray(items) ? items : Array.from(items?.values?.() || items || []);

const roleField = candidates.find((item) => item?.props?.name === 'role');

if (roleField) {
  roleField.setProps({
    dataSource: childRoles.map((role) => ({
      value: role.id,
      label: role.name,
    })),
    value: undefined,
  });
}
`}}}]);