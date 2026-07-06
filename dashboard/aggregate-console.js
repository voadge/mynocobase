/* ══════════════════════════════════════════════════════════
   施工日志一键汇总 — 控制台版
   用法：在 NocoBase 新建施工日志页面 F12 → Console → 粘贴 → Enter
   点击"汇总"按钮自动触发
   ══════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ─── 配置 ───────────────────────────────────────────
  var apiUrl      = '/api/__pd__/aggregate-log';
  var btnKeywords = ['汇总'];

  var fieldMap = {
    '工作内容':  'work_content',
    '质量情况':  'quality_issues',
    '安全情况':  'safety_issues',
    '其他情况':  'others',
    '施工人员':  'personnel_count',
    '施工设备':  'equipment_usage',
    '材料使用':  'material_usage',
    '天气':      '天气'
  };

  // ─── 工具 ───────────────────────────────────────────

  function $(sel, ctx) { return (ctx||document).querySelectorAll(sel); }

  function findItem(label) {
    var items = $('.ant-form-item'), last = null;
    for (var i = 0; i < items.length; i++) {
      var lb = items[i].querySelector('.ant-form-item-label label');
      if (lb && lb.textContent.indexOf(label) >= 0) last = items[i];
    }
    return last;
  }

  function getVal(item) {
    if (!item) return '';
    var ta = item.querySelector('textarea');
    if (ta) return ta.value;
    var s = item.querySelector('.ant-select-selection-item');
    if (s) return s.getAttribute('title') || s.textContent;
    var p = item.querySelector('.ant-picker input');
    if (p) return p.value;
    var i = item.querySelector('input[type="text"], input:not([type])');
    return i ? i.value : '';
  }

  function setTextarea(item, val) {
    var ta = item.querySelector('textarea');
    if (!ta) return false;
    for (var k in ta) {
      if (k.indexOf('__reactProps$') === 0 && ta[k] && ta[k].onChange) {
        ta[k].onChange({
          target: { value: val, name: ta.name || '', type: 'textarea', tagName: 'TEXTAREA' },
          currentTarget: ta, type: 'input',
          nativeEvent: { type: 'input', target: ta },
          preventDefault: function(){}, stopPropagation: function(){}, persist: function(){},
          bubbles: true, cancelable: true, defaultPrevented: false, isTrusted: false, timeStamp: Date.now()
        });
        return true;
      }
    }
    return false;
  }

  function ajaxGet(url) {
    return new Promise(function(resolve, reject) {
      var anchor = $('.ant-form-item')[0];
      if (!anchor || !anchor.parentNode) { reject(Error('无锚点')); return; }
      var c = anchor.parentNode, name = '_ifr_' + Date.now();
      var ifr = document.createElement('iframe');
      ifr.name = name; ifr.style.cssText = 'position:fixed;width:1px;height:1px;top:-9999px';
      c.appendChild(ifr);
      var f = document.createElement('form');
      f.method = 'GET'; f.action = url.split('?')[0]; f.target = name; f.style.display = 'none';
      var qs = url.split('?')[1];
      if (qs) qs.split('&').forEach(function(pair) {
        var i = pair.indexOf('='), k = i >= 0 ? pair.substring(0,i) : pair, v = i >= 0 ? pair.substring(i+1) : '';
        var inp = document.createElement('input');
        inp.type = 'hidden'; inp.name = decodeURIComponent(k); inp.value = decodeURIComponent(v);
        f.appendChild(inp);
      });
      c.appendChild(f);
      ifr.onload = function() {
        setTimeout(function() {
          try {
            var doc = ifr.contentDocument || ifr.contentWindow.document;
            resolve(JSON.parse(doc.body ? doc.body.textContent : doc.textContent || ''));
          } catch(e) { reject(Error('读响应失败: ' + e.message)); }
          finally { try { f.remove(); } catch(e){} try { ifr.remove(); } catch(e){} }
        }, 200);
      };
      f.submit();
    });
  }

  // ─── 主流程 ─────────────────────────────────────────

  async function aggregate() {
    console.log('[汇总] 开始...');
    var proj = findItem('项目名称'), date = findItem('施工日期');
    if (!proj || !date) { console.log('[汇总] 找不到字段'); return; }
    var projVal = getVal(proj), dateVal = getVal(date);
    var pidVal = (function(p){ return p ? getVal(p) : ''; })(findItem('link-projectID'));
    if (!projVal || !dateVal) { console.log('[汇总] 请选项目和日期'); return; }

    var params = 'preview=true&date=' + encodeURIComponent(dateVal);
    params += (pidVal && /^\d+$/.test(pidVal)) ? '&projectID=' + encodeURIComponent(pidVal)
                                               : '&projectNameNo=' + encodeURIComponent(projVal);
    var url = apiUrl + '?' + params;

    console.log('[汇总] 请求:', url);
    var result = await ajaxGet(url);
    console.log('[汇总] 响应:', JSON.stringify(result).substring(0, 200));
    if (result.code !== 0 || !result.data) { console.log('[汇总] 失败:', result.msg); return; }

    var filled = 0;
    for (var label in fieldMap) {
      var item = findItem(label), val = result.data[fieldMap[label]];
      if (item && val !== undefined && val !== '' && setTextarea(item, val)) filled++;
    }
    console.log('[汇总] 完成！填充 ' + filled + ' 个字段, ' + (result.entryCount||0) + ' 条填报');
  }

  // ─── 注册按钮监听 ──────────────────────────────────

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button, a');
    if (!btn) return;
    for (var i = 0; i < btnKeywords.length; i++) {
      if (btn.textContent.indexOf(btnKeywords[i]) >= 0) { setTimeout(aggregate, 100); return; }
    }
  });

  console.log('[汇总] 已就绪，点击"' + btnKeywords[0] + '"按钮自动聚合');
})();
