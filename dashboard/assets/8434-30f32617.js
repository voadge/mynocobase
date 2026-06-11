"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["8434"],{84953(t,n,e){e.r(n),e.d(n,{default:()=>o});let o={contexts:[e(79271).JSBlockRunJSContext],prefix:"sn-jsb-antd-icons",label:"Render Ant Design icons",description:"Render Ant Design icons with buttons inside the block container",locales:{"zh-CN":{label:"渲染 Ant Design 图标",description:"在区块容器中使用 Ant Design 图标与按钮进行渲染"}},content:`
// Render Ant Design icons with buttons via ctx.libs
const { React, antd, antdIcons } = ctx.libs;
const { Button, Space } = antd;
const { PlusOutlined, EditOutlined, DeleteOutlined } = antdIcons;

const IconButtons = () => (
  <Space style={{ padding: 12 }}>
    <Button type="primary" icon={<PlusOutlined />}>
      {ctx.t('Add')}
    </Button>
    <Button icon={<EditOutlined />}>{ctx.t('Edit')}</Button>
    <Button danger icon={<DeleteOutlined />}>
      {ctx.t('Delete')}
    </Button>
  </Space>
);

ctx.render(<IconButtons />);
`}}}]);