// ========================================
// 日志汇总 - 施工日志自动汇总按钮代码
// ========================================
// 使用方式: NocoBase 表单页面 -> 编辑按钮 -> 执行JavaScript -> 粘贴此代码
// 功能: 选择项目+日期 -> 点击汇总 -> 自动填充文本字段 + 附件(后端自动复制)
// 字段: 工作内容、质量情况、安全情况、其他情况、施工人员、施工设备、材料使用、天气
// 附件: 提交表单后由后端 afterCreate hook 自动从 entries 复制到 log
// ========================================

(async function() {
  console.log('[汇总] === 脚本开始执行 ===');

  function findItem(labelText) {
    var items = document.querySelectorAll('.ant-form-item');
    var last = null;
    for (var i = 0; i < items.length; i++) {
      var lb = items[i].querySelector('.ant-form-item-label label');
      if (!lb) continue;
      if (lb.textContent.indexOf(labelText) >= 0) last = items[i];
    }
    return last;
  }

  function getValue(item) {
    if (!item) return '';
    var ta = item.querySelector('textarea');
    if (ta) return ta.value;
    var selItem = item.querySelector('.ant-select-selection-item');
    if (selItem) return selItem.getAttribute('title') || selItem.textContent || '';
    var pickerInput = item.querySelector('.ant-picker input');
    if (pickerInput) return pickerInput.value || '';
    var inp = item.querySelector('input[type="text"], input:not([type])');
    if (inp) return inp.value || '';
    return '';
  }

  function setTaValue(item, val) {
    if (!item) return false;
    var ta = item.querySelector('textarea');
    if (!ta) return false;
    var keys = Object.keys(ta);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactProps$') === 0) {
        var props = ta[keys[i]];
        if (props && typeof props.onChange === 'function') {
          props.onChange({
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
          });
          console.log('[汇总] 已设置textarea:', val.substring(0, 80));
          return true;
        }
      }
    }
    console.log('[汇总] 未找到React onChange');
    return false;
  }

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
            console.log('[汇总] iframe响应:', text.substring(0, 500));
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error('读取iframe响应失败: ' + e.message));
          } finally {
            try { form.remove(); } catch(e2) {}
            try { iframe.remove(); } catch(e2) {}
          }
        }, 300);
      };
      form.submit();
    });
  }

  var projItem = findItem('项目名称');
  var dateItem = findItem('施工日期');
  var pidItem = findItem('link-projectID');
  if (!projItem || !dateItem) {
    console.log('[汇总] 错误: 找不到字段');
    return;
  }
  var projVal = getValue(projItem);
  var dateVal = getValue(dateItem);
  var pidVal = pidItem ? getValue(pidItem) : '';
  console.log('[汇总] 项目:', projVal, '日期:', dateVal, 'projectID:', pidVal);
  if (!projVal || !dateVal) {
    console.log('[汇总] 错误: 请先选择项目和日期');
    return;
  }
  console.log('[汇总] 开始请求API...');
  try {
    var url = '/api/__pd__/aggregate-log?preview=true';
    if (pidVal && /^\d+$/.test(pidVal)) {
      url += '&projectID=' + encodeURIComponent(pidVal);
    } else {
      url += '&projectNameNo=' + encodeURIComponent(projVal);
    }
    url += '&date=' + encodeURIComponent(dateVal);
    console.log('[汇总] 请求URL:', url);
    var result = await ajaxGet(url);
    console.log('[汇总] API返回:', JSON.stringify(result).substring(0, 500));
    if (result.code !== 0) {
      console.log('[汇总] 失败:', result.msg);
      return;
    }
    var data = result.data;
    if (!data) {
      console.log('[汇总] 无数据返回');
      return;
    }
    var filled = 0;
    var map = {
      '工作内容': 'work_content',
      '质量情况': 'quality_issues',
      '安全情况': 'safety_issues',
      '其他情况': 'others',
      '施工人员': 'personnel_count',
      '施工设备': 'equipment_usage',
      '材料使用': 'material_usage'
    };
    for (var label in map) {
      var item = findItem(label);
      if (item && data[map[label]] !== undefined && data[map[label]] !== '') {
        if (setTaValue(item, data[map[label]])) filled++;
      }
    }
    var attCount = (data.attachments && data.attachments.length) || 0;
    console.log('[汇总] 完成! 填充' + filled + '个字段, ' + (result.entryCount || 0) + '条填报, ' + attCount + '个附件');
    // 填充附件字段：通过Formily form实例设置值
    if (attCount > 0) {
      var attItem = findItem('附件');
      if (attItem) {
        var attValue = data.attachments.map(function(a) {
          return { id: a.id, title: a.title, filename: a.filename, url: a.url || ('/storage/uploads/' + a.filename), size: a.size, mimetype: a.mimetype };
        });
        console.log('[汇总] 附件数据:', JSON.stringify(attValue).substring(0, 200));
        // 方法1：找formily的form实例
        var formEl = attItem.closest('.ant-form') || attItem.closest('form');
        if (formEl) {
          var formFiberKey = Object.keys(formEl).find(function(k) { return k.indexOf('__reactFiber$') === 0; });
          if (formFiberKey) {
            var fNode = formEl[formFiberKey];
            for (var fi = 0; fi < 30; fi++) {
              if (!fNode) break;
              var fp = fNode.memoizedProps || {};
              if (fp.form && typeof fp.form.setFieldState === 'function') {
                console.log('[汇总] 找到Formily form实例');
                try {
                  fp.form.setFieldState('attachments', function(state) { state.value = attValue; });
                  console.log('[汇总] 通过Formily设置附件值成功');
                } catch(e) { console.log('[汇总] Formily设置失败:', e.message); }
                break;
              }
              if (fp.form && typeof fp.form.setValues === 'function') {
                console.log('[汇总] 找到form.setValues');
                try { fp.form.setValues({ attachments: attValue }); } catch(e) {}
                break;
              }
              fNode = fNode.return;
            }
          }
        }
        // 方法2：遍历所有React fiber找attachments字段的onChange
        var allEls = attItem.querySelectorAll('*');
        var foundAtt = false;
        for (var ai = 0; ai < allEls.length && !foundAtt; ai++) {
          var el = allEls[ai];
          var ak = Object.keys(el).find(function(k) { return k.indexOf('__reactProps$') === 0; });
          if (ak) {
            var ap = el[ak];
            if (ap && typeof ap.onChange === 'function') {
              console.log('[汇总] 找到附件onChange, 直接调用');
              try { ap.onChange(attValue); foundAtt = true; console.log('[汇总] 附件onChange调用成功'); } catch(e) { console.log('[汇总] 附件onChange失败:', e.message); }
            }
          }
        }
        if (!foundAtt) {
          console.log('[汇总] 未找到附件组件onChange, 尝试DOM模拟上传');
        }
      }
    }
  } catch (e) {
    console.error('[汇总] 异常:', e);
  }
})();
