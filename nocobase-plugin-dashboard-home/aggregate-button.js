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
            console.log('[汇总] iframe响应:', text.substring(0, 300));
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error('读取iframe响应失败: ' + e.message));
          } finally {
            try { form.remove(); } catch(e2) {}
            try { iframe.remove(); } catch(e2) {}
          }
        }, 200);
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
    console.log('[汇总] API返回:', JSON.stringify(result).substring(0, 300));

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
      '材料使用': 'material_usage',
      '天气': '天气'
    };

    for (var label in map) {
      var item = findItem(label);
      if (item && data[map[label]] !== undefined && data[map[label]] !== '') {
        if (setTaValue(item, data[map[label]])) filled++;
      }
    }

    console.log('[汇总] 完成! 填充' + filled + '个字段, ' + (result.entryCount || 0) + '条填报');
  } catch (e) {
    console.error('[汇总] 异常:', e);
  }
})();
