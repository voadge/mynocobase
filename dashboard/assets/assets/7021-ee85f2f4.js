"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["7021"],{37420(t,e,o){o.r(e),o.d(e,{default:()=>a});var n=o(98542),s=o(25831);let a={contexts:[n.JSFieldRunJSContext,s.FormJSFieldItemRunJSContext],prefix:"sn-jsf-relative-time",label:"Display date field as relative time",description:"Render date values as “3 days ago”, “just now”, etc.",locales:{"zh-CN":{label:"将日期字段显示为相对时间",description:"将日期显示为“3天前”、“刚刚”等相对时间"}},content:`
const formatRelativeTime = (date) => {
  const now = new Date();
  const diff = now - new Date(date);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return ctx.t('just now');
  if (minutes < 60) return ctx.t('{{count}} minutes ago', { count: minutes });
  if (hours < 24) return ctx.t('{{count}} hours ago', { count: hours });
  if (days < 30) return ctx.t('{{count}} days ago', { count: days });
  if (months < 12) return ctx.t('{{count}} months ago', { count: months });
  return ctx.t('{{count}} years ago', { count: years });
};

const dateStr = ctx.value;
if (!dateStr) {
  ctx.render('-');
  return;
}

const relativeTime = formatRelativeTime(dateStr);
const fullDate = new Date(dateStr).toLocaleString();

ctx.render(\`
  <span title="\${fullDate}" style="cursor: help; color: #666;">
    \${relativeTime}
  </span>
\`);
`}}}]);