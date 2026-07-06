// ==UserScript==
// @name         施工日志 - 一键汇总
// @namespace    http://voadge.top
// @version      1.0
// @description  在新建施工日志表单中，选择项目+日期后点击"汇总"按钮，自动聚合施工日报数据填入表单
// @author       voadge
// @match        https://voadge.top:668/*
// @icon         https://voadge.top:668/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // ─── 配置区 ───────────────────────────────────────────
  var CONFIG = {
    // 按钮匹配：点击文本包含这些词的按钮时触发
    buttonKeywords: ['汇总'],
    // 也可以用 data-action 属性匹配：'[data-action="summary"]'
    buttonSelector: null,

    // 聚合 API
    apiUrl: '/api/__pd__/aggregate-log',

    // 标签 → 字段名映射（key=表单标签文字, value=API返回字段名）
    fieldMap: {
      '工作内容': 'work_content',
      '质量情况': 'quality_issues',
      '安全情况': 'safety_issues',
      '其他情况': 'others',
      '施工人员': 'personnel_count',
      '施工设备': 'equipment_usage',
      '材料使用': 'material_usage',
      '天气': '天气'
    },

    // 读字段配置（从哪里获取项目ID和日期）
    inputs: {
      dateLabel: '施工日期',
      projectLabel: '项目名称',
      hiddenProjectLabel: 'link-projectID'
    },

    // 调试日志
    debug: true
  };

  // ─── 工具函数 ─────────────────────────────────────────

  function log(msg, data) {
    if (CONFIG.debug) {
      console.log('[汇总] ' + msg, data !== undefined ? data : '');
    }
  }

  // 按 label 找 antd 表单项
  function findItem(labelText) {
    var items = document.querySelectorAll('.ant-form-item');
    var last = null;
    for (var i = 0; i < items.length; i++) {
      var lb = items[i].querySelector('.ant-form-item-label label');
      if (lb && lb.textContent.indexOf(labelText) >= 0) last = items[i];
    }
    return last;
  }

  // 读取表单项当前值
  function getValue(item) {
    if (!item) return '';
    var ta = item.querySelector('textarea');
    if (ta) return ta.value;
    var sel = item.querySelector('.ant-select-selection-item');
    if (sel) return sel.getAttribute('title') || sel.textContent || '';
    var picker = item.querySelector('.ant-picker input');
    if (picker) return picker.value || '';
    var inp = item.querySelector('input[type="text"], input:not([type])');
    if (inp) return inp.value || '';
    return '';
  }

  // 通过 React __reactProps__ 设置 textarea 值（触发 Formily 响应式）
  function setTextarea(item, val) {
    var ta = item.querySelector('textarea');
    if (!ta) return false;

    var keys = Object.keys(ta);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactProps$') === 0) {
        var props = ta[keys[i]];
        if (props && typeof props.onChange === 'function') {
          var event = {
            target: { value: val, name: ta.name || '', type: 'textarea', tagName: 'TEXTAREA' },
            currentTarget: ta,
            type: 'input',
            nativeEvent: { type: 'input', target: ta },
            preventDefault: function() {},
            stopPropagation: function() {},
            persist: function() {},
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            isTrusted: false,
            timeStamp: Date.now()
          };
          props.onChange(event);
          return true;
        }
      }
    }
    return false;
  }

  // 通过 iframe GET 请求（无需 CORS、自动带 cookie）
  function ajaxGet(url) {
    return new Promise(function(resolve, reject) {
      var anchor = document.querySelector('.ant-form-item');
      if (!anchor || !anchor.parentNode) {
        reject(new Error('找不到DOM锚点'));
        return;
      }
      var container = anchor.parentNode;

      var iframeName = '_agg_iframe_' + Date.now();
      var iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.style.cssText = 'position:fixed;width:1px;height:1px;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
      container.appendChild(iframe);

      var parts = url.split('?');
      var form = document.createElement('form');
      form.method = 'GET';
      form.action = parts[0];
      form.target = iframeName;
      form.style.cssText = 'display:none';

      if (parts[1]) {
        var pairs = parts[1].split('&');
        for (var i = 0; i < pairs.length; i++) {
          var eqIdx = pairs[i].indexOf('=');
          var key = eqIdx >= 0 ? pairs[i].substring(0, eqIdx) : pairs[i];
          var val = eqIdx >= 0 ? pairs[i].substring(eqIdx + 1) : '';
          var input = document.createElement('input');
          input.type = 'hidden';
          input.name = decodeURIComponent(key);
          input.value = decodeURIComponent(val);
          form.appendChild(input);
        }
      }

      container.appendChild(form);

      iframe.onload = function() {
        setTimeout(function() {
          try {
            var doc = iframe.contentDocument || iframe.contentWindow.document;
            var text = doc.body ? doc.body.textContent : doc.textContent || '';
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error('读取响应失败: ' + e.message));
          } finally {
            try { form.remove(); } catch(e2) {}
            try { iframe.remove(); } catch(e2) {}
          }
        }, 200);
      };

      form.submit();
    });
  }

  // ─── 主逻辑 ───────────────────────────────────────────

  async function aggregate() {
    log('脚本开始执行');

    var cfg = CONFIG.inputs;
    var projItem = findItem(cfg.projectLabel);
    var dateItem = findItem(cfg.dateLabel);
    var pidItem = findItem(cfg.hiddenProjectLabel);

    if (!projItem || !dateItem) {
      log('错误: 找不到项目/日期字段');
      return;
    }

    var projVal = getValue(projItem);
    var dateVal = getValue(dateItem);
    var pidVal = pidItem ? getValue(pidItem) : '';

    log('项目:', projVal, '日期:', dateVal, 'projectID:', pidVal);

    if (!projVal || !dateVal) {
      log('错误: 请先选择项目和日期');
      return;
    }

    // 构建 URL
    var params = 'preview=true&date=' + encodeURIComponent(dateVal);
    if (pidVal && /^\d+$/.test(pidVal)) {
      params += '&projectID=' + encodeURIComponent(pidVal);
    } else {
      params += '&projectNameNo=' + encodeURIComponent(projVal);
    }

    var url = CONFIG.apiUrl + '?' + params;
    log('请求API:', url);

    var result;
    try {
      result = await ajaxGet(url);
    } catch (e) {
      log('网络异常:', e.message);
      return;
    }

    log('API返回:', JSON.stringify(result).substring(0, 300));

    if (result.code !== 0) {
      log('失败:', result.msg || '未知错误');
      return;
    }

    var data = result.data;
    if (!data) {
      log('无数据返回');
      return;
    }

    // 填入表单
    var filled = 0;
    for (var label in CONFIG.fieldMap) {
      var item = findItem(label);
      var val = data[CONFIG.fieldMap[label]];
      if (item && val !== undefined && val !== '') {
        if (setTextarea(item, val)) filled++;
      }
    }

    log('完成! 填充 ' + filled + ' 个字段, ' + (result.entryCount || 0) + ' 条填报');
  }

  // ─── 按钮点击监听 ─────────────────────────────────────

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button, a');
    if (!btn) return;

    // 按文本关键词匹配
    for (var i = 0; i < CONFIG.buttonKeywords.length; i++) {
      if (btn.textContent.indexOf(CONFIG.buttonKeywords[i]) >= 0) {
        setTimeout(aggregate, 100);
        return;
      }
    }

    // 按 data-* 属性匹配
    if (CONFIG.buttonSelector) {
      try {
        if (btn.matches(CONFIG.buttonSelector)) {
          setTimeout(aggregate, 100);
        }
      } catch(e) {}
    }
  });

  log('已加载，点击"' + CONFIG.buttonKeywords.join('、') + '"按钮自动汇总');
})();
