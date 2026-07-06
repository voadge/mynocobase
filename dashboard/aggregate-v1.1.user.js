// ==UserScript==
// @name         施工日志 - 一键汇总（含附件）
// @namespace    http://voadge.top
// @version      1.1
// @description  施工日志新建表单，点击汇总按钮聚合日报数据 + 附件
// @match        https://voadge.top:668/*
// @icon         https://voadge.top:668/favicon.ico
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  var CONFIG = {
    buttonKeywords: ['汇总'],
    apiUrl: '/api/__pd__/aggregate-log',
    // 文本字段映射（label → API字段名）
    textFields: {
      '工作内容':  'work_content',
      '质量情况':  'quality_issues',
      '安全情况':  'safety_issues',
      '其他情况':  'others',
      '施工人员':  'personnel_count',
      '施工设备':  'equipment_usage',
      '材料使用':  'material_usage',
      '天气':      '天气'
    },
    // 附件字段标签
    attachmentLabel: '附件',
    inputs: {
      dateLabel: '施工日期',
      projectLabel: '项目名称',
      hiddenProjectLabel: 'link-projectID'
    },
    debug: true
  };

  function log(m, d) { if (CONFIG.debug) console.log('[汇总] ' + m, d !== undefined ? d : ''); }

  function findAll(label) {
    var items = document.querySelectorAll('.ant-form-item');
    var result = [];
    for (var i = 0; i < items.length; i++) {
      var lb = items[i].querySelector('.ant-form-item-label label');
      if (lb && lb.textContent.indexOf(label) >= 0) result.push(items[i]);
    }
    return result;
  }

  function findItem(label) {
    var all = findAll(label);
    return all.length > 0 ? all[all.length - 1] : null;
  }

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

  // 设置 textarea 值（触发 Formily 响应式）
  function setTextarea(item, val) {
    var ta = item.querySelector('textarea');
    if (!ta) return false;
    var keys = Object.keys(ta);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactProps$') === 0) {
        var props = ta[keys[i]];
        if (props && typeof props.onChange === 'function') {
          props.onChange({
            target: { value: val, name: ta.name || '', type: 'textarea', tagName: 'TEXTAREA' },
            currentTarget: ta, type: 'input',
            nativeEvent: { type: 'input', target: ta },
            preventDefault: function(){}, stopPropagation: function(){}, persist: function(){},
            bubbles: true, cancelable: true, defaultPrevented: false, isTrusted: false, timeStamp: Date.now()
          });
          return true;
        }
      }
    }
    return false;
  }

  // 设置附件字段值（Upload.Attachment 组件）
  function setAttachments(item, files) {
    // 找 ant-upload 内部的 trigger element（Upload 组件挂载点）
    var uploadEl = item.querySelector('.ant-upload');
    if (!uploadEl) {
      log('附件: 未找到.ant-upload元素');
      // 尝试找 upload 工厂容器
      var wrapper = item.querySelector('.ant-upload-wrapper, .nb-upload');
      if (!wrapper) return false;
      uploadEl = wrapper;
    }

    var keys = Object.keys(uploadEl);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactProps$') === 0) {
        var props = uploadEl[keys[i]];
        if (props && typeof props.onChange === 'function') {
          // Upload.Attachment 的 onChange 接收普通数组或事件对象
          // 数组元素: { id, url, name, size?, mimeType?, ... }
          props.onChange(files);
          log('附件: 已设置 ' + files.length + ' 个文件');
          return true;
        }
      }
    }
    log('附件: 未找到React onChange');
    return false;
  }

  // iframe GET（自动带 cookie）
  function ajaxGet(url) {
    return new Promise(function(resolve, reject) {
      var anchor = document.querySelector('.ant-form-item');
      if (!anchor || !anchor.parentNode) { reject(Error('无锚点')); return; }
      var container = anchor.parentNode;
      var name = '_ifr_' + Date.now();
      var ifr = document.createElement('iframe');
      ifr.name = name; ifr.style.cssText = 'position:fixed;width:1px;height:1px;top:-9999px';
      container.appendChild(ifr);
      var form = document.createElement('form');
      form.method = 'GET'; form.action = url.split('?')[0]; form.target = name; form.style.display = 'none';
      var qs = url.split('?')[1];
      if (qs) {
        qs.split('&').forEach(function(pair) {
          var i = pair.indexOf('='), k = i >= 0 ? pair.substring(0,i) : pair, v = i >= 0 ? pair.substring(i+1) : '';
          var inp = document.createElement('input');
          inp.type = 'hidden'; inp.name = decodeURIComponent(k); inp.value = decodeURIComponent(v);
          form.appendChild(inp);
        });
      }
      container.appendChild(form);
      ifr.onload = function() {
        setTimeout(function() {
          try {
            var doc = ifr.contentDocument || ifr.contentWindow.document;
            resolve(JSON.parse(doc.body ? doc.body.textContent : doc.textContent || ''));
          } catch(e) { reject(Error('读响应失败: ' + e.message)); }
          finally { try { form.remove(); } catch(e){} try { ifr.remove(); } catch(e){} }
        }, 200);
      };
      form.submit();
    });
  }

  // ─── 主流程 ───────────────────────────────────────────

  async function aggregate() {
    log('脚本开始执行');

    var projItem = findItem(CONFIG.inputs.projectLabel);
    var dateItem = findItem(CONFIG.inputs.dateLabel);
    if (!projItem || !dateItem) { log('错误: 找不到字段'); return; }

    var projVal = getValue(projItem);
    var dateVal = getValue(dateItem);
    var pidVal = (function(p){ return p ? getValue(p) : ''; })(findItem(CONFIG.inputs.hiddenProjectLabel));
    if (!projVal || !dateVal) { log('错误: 请先选择项目和日期'); return; }

    var params = 'preview=true&date=' + encodeURIComponent(dateVal);
    if (pidVal && /^\d+$/.test(pidVal)) {
      params += '&projectID=' + encodeURIComponent(pidVal);
    } else {
      params += '&projectNameNo=' + encodeURIComponent(projVal);
    }

    var url = CONFIG.apiUrl + '?' + params;
    log('请求:', url);

    var result = await ajaxGet(url);
    log('响应:', JSON.stringify(result).substring(0, 300));

    if (result.code !== 0 || !result.data) { log('失败:', result.msg); return; }

    var data = result.data;
    var filled = 0;

    // 1. 填文本字段
    for (var label in CONFIG.textFields) {
      var item = findItem(label);
      var val = data[CONFIG.textFields[label]];
      if (item && val !== undefined && val !== '') {
        if (setTextarea(item, val)) filled++;
      }
    }
    log('文本字段: 填充 ' + filled + ' 个');

    // 2. 填附件
    if (data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
      var attItem = findItem(CONFIG.attachmentLabel);
      if (attItem) {
        // 准备附件数据格式（保留必要字段）
        var files = data.attachments.map(function(a) {
          return { id: a.id, url: a.url, name: a.name, extname: a.extname, size: a.size, mimeType: a.mimeType };
        });
        if (setAttachments(attItem, files)) {
          log('附件: 已填入 ' + files.length + ' 个文件');
        }
      } else {
        log('附件: 未找到表单字段');
      }
    }

    log('完成! 共 ' + (result.entryCount || 0) + ' 条填报');
  }

  // ─── 按钮监听 ─────────────────────────────────────────

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button, a');
    if (!btn) return;
    for (var i = 0; i < CONFIG.buttonKeywords.length; i++) {
      if (btn.textContent.indexOf(CONFIG.buttonKeywords[i]) >= 0) {
        setTimeout(aggregate, 100);
        return;
      }
    }
  });

  log('已就绪');
})();
