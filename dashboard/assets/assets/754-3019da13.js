"use strict";(globalThis.webpackChunknocobase=globalThis.webpackChunknocobase||[]).push([["754"],{38937(t,e,o){o.r(e),o.d(e,{default:()=>a});let a={contexts:["*"],prefix:"sn-clipboard-copy",label:"Copy text to clipboard (function)",description:"A reusable function that copies a given string to the clipboard.",locales:{"zh-CN":{label:"复制文本到剪贴板（函数）",description:"通用函数：接受一个字符串参数并复制到剪贴板。"}},content:`
// A general utility function that copies text to clipboard.
// Usage:
//   const ok = await copyTextToClipboard('Hello');
//   if (ok) { /* success */ } else { /* handle failure */ }
async function copyTextToClipboard(text) {
  const s = String(text ?? '');
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch (_) {
    // Fallback below
  }
}
`}}}]);