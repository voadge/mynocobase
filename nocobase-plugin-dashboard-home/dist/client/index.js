define(function(){
  function DashboardHomePlugin(options, app) {
    this.options = options;
    this.app = app;
  }
  DashboardHomePlugin.prototype.afterAdd = function() {
    this.app.router.add('dashboard-home-redirect', {
      path: '/home',
      Component: function() {
        window.location.replace('/home');
        return null;
      }
    });
  };
  DashboardHomePlugin.prototype.beforeLoad = function() {};
  DashboardHomePlugin.prototype.load = function() {
    initAggregateButton(this.app);
    watchLogDetailPage(this.app);
    initWeatherAutoFill(this.app);
  };
  return DashboardHomePlugin;
});

function initWeatherAutoFill(app) {
  var filledForms = {};
  var obs = new MutationObserver(function() {
    autoFillWeather(filledForms, app);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(function() { autoFillWeather(filledForms, app); }, 1500);
}

function autoFillWeather(filledForms, app) {
  var forms = document.querySelectorAll('.ant-form, .nb-form, form');
  for (var i = 0; i < forms.length; i++) {
    var form = forms[i];
    if (filledForms[form.dataset.weatherFilled]) continue;
    var weatherInput = findWeatherInput(form);
    if (!weatherInput) continue;
    var formKey = getFormKey(form);
    if (!formKey) continue;
    var projectField = findProjectField(form);
    var hasProject = projectField && projectField.querySelector('.ant-select-selection-item');
    if (hasProject) {
      filledForms[formKey] = true;
      weatherInput.dataset.weatherFilled = '1';
    }
    doFetchWeather(form, weatherInput, app);
  }
}

function findWeatherInput(form) {
  var items = form.querySelectorAll('.ant-form-item');
  for (var i = 0; i < items.length; i++) {
    var label = items[i].querySelector('.ant-form-item-label label');
    if (!label) continue;
    var text = label.textContent.trim();
    if (text === '天气' || text === 'weather' || text.indexOf('天气') >= 0) {
      var input = items[i].querySelector('input, textarea, .ant-select-selector, .ant-picker');
      if (input) return input;
    }
  }
  return null;
}

function getFormKey(form) {
  try {
    var url = window.location.href;
    var parentClass = '';
    var el = form;
    for (var i = 0; i < 5; i++) {
      if (el && el.className) { parentClass = el.className.substring(0, 40); break; }
      el = el.parentElement;
    }
    return url + '|' + parentClass;
  } catch(e) { return '' + Date.now(); }
}

function doFetchWeather(form, weatherInput, app) {
  var projectField = findProjectField(form);
  if (projectField && projectField.dataset && projectField.dataset.coords) {
    var parts = projectField.dataset.coords.split(',');
    var lat = parts[0].trim();
    var lng = parts[1].trim();
    if (lat && lng) {
      fetchWeatherByCoords(lat, lng, weatherInput);
      return;
    }
  }
  // Priority 1b: get coords from selected project via API
  if (projectField && app) {
    fetchProjectCoords(projectField, weatherInput, app);
    return;
  }
  // Priority 2: browser GPS
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude, weatherInput);
      },
      function() { fetchWeatherByIP(weatherInput); },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  } else {
    fetchWeatherByIP(weatherInput);
  }
}

function fetchProjectCoords(projectField, weatherInput, app) {
  var selectRoot = projectField.closest('.ant-select');
  if (!selectRoot) { fetchWeatherByIP(weatherInput); return; }
  var selectionEl = selectRoot.querySelector('.ant-select-selection-item');
  if (!selectionEl || !selectionEl.textContent) { fetchWeatherByIP(weatherInput); return; }
  var token = '';
  try {
    token = localStorage.getItem('NOCOBASE_TOKEN') || localStorage.getItem('nocobase_token') || '';
  } catch(e) {}
  var projectText = selectionEl.textContent.trim();
  if (!projectText) { fetchWeatherByIP(weatherInput); return; }
  var filter = JSON.stringify({ $or: [{ project_name: projectText }, { project_code: projectText }] });
  fetch('/api/projects:list?filter=' + encodeURIComponent(filter) + '&fields=location_lat,location_lon,id&pageSize=1', {
    headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  })
    .then(function(r) { return r.json(); })
    .then(function(res) {
      var d = res && res.data && res.data[0];
      if (d && d.location_lat && d.location_lon) {
        projectField.dataset.coords = d.location_lat + ',' + d.location_lon;
        fetchWeatherByCoords(d.location_lat, d.location_lon, weatherInput);
      } else {
        fetchWeatherByIP(weatherInput);
      }
    })
    .catch(function() { fetchWeatherByIP(weatherInput); });
}

function findProjectField(form) {
  var items = form.querySelectorAll('.ant-form-item');
  for (var i = 0; i < items.length; i++) {
    var label = items[i].querySelector('.ant-form-item-label label');
    if (!label) continue;
    var text = label.textContent.trim();
    if (text === '项目' || text.indexOf('项目') >= 0 || text === 'project') {
      var select = items[i].querySelector('.ant-select-selector');
      if (select) return select;
    }
  }
  return null;
}

function fetchWeatherByCoords(lat, lng, weatherInput) {
  fetch('/api/__pd__/weather-qw?lat=' + lat + '&lng=' + lng)
    .then(function(r) {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then(function(d) {
      if (d.code === 0 && d.data && d.data.weather) {
        setWeatherInput(weatherInput, d.data);
      }
    })
    .catch(function() { fetchWeatherByIP(weatherInput); });
}

function fetchWeatherByIP(weatherInput) {
  fetch('/api/__pd__/weather-qw?city=遵义')
    .then(function(r) {
      if (!r.ok) throw new Error();
      return r.json();
    })
    .then(function(d) {
      if (d.code === 0 && d.data && d.data.weather) {
        setWeatherInput(weatherInput, d.data);
      }
    })
    .catch(function() {});
}

function setWeatherInput(input, data) {
  if (!input) return;
  var weatherStr = data.weather + ' ' + (data.temperature || '') + 'C ' + (data.windDirection || '');
  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, weatherStr);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function initAggregateButton(app) {
  function findAndInit() {
    var root = document.querySelector('[data-role="aggregate-root"]');
    if (root && !root.dataset.aggInit) {
      root.dataset.aggInit = '1';
      setupContainer(root, app);
    }
  }
  findAndInit();
  var obs = new MutationObserver(findAndInit);
  obs.observe(document.body, { childList: true, subtree: true });
}

function setupContainer(root, app) {
  var btn = root.querySelector('[data-role="aggregate-btn"]');
  var statusEl = root.querySelector('.agg-status');
  if (!btn) return;

  var projectId = root.dataset.projectId;
  var logDate = root.dataset.logDate || getTodayNum();

  if (projectId) {
    fetchStatus(app, root, projectId, logDate);
  }

  btn.addEventListener('click', function() {
    var projectId = root.dataset.projectId;
    var date = root.dataset.logDate || getTodayNum();
    if (!projectId) {
      setStatus(statusEl, '请先选择项目');
      return;
    }
    var id = root.dataset.logId;
    btn.disabled = true;
    setStatus(statusEl, '汇总中...');
    var payload = id ? { logId: parseInt(id) } : { projectID: parseInt(projectId), date: parseInt(date) };
    callApi(app, '/api/__pd__/aggregate-log', 'POST', null, payload)
      .then(function(res) {
        var body = res && res.data ? res.data : res;
        if (body && body.code === 0 && body.data && body.data.updated) {
          setStatus(statusEl, '汇总完成');
          location.reload();
        } else if (body && body.code === 0 && body.data && !body.data.updated) {
          setStatus(statusEl, body.data.message || '没有新增内容需要汇总');
        } else {
          setStatus(statusEl, body && body.msg || '汇总失败');
        }
      })
      .catch(function(err) {
        setStatus(statusEl, '请求失败: ' + (err.message || ''));
      })
      .finally(function() {
        btn.disabled = false;
      });
  });
}

function fetchStatus(app, root, projectId, logDate) {
  var statusEl = root.querySelector('.agg-status');
  callApi(app, '/api/__pd__/daily-summary-status', 'GET', { projectID: projectId, date: logDate })
    .then(function(res) {
      var body = res && res.data ? res.data : res;
      if (body && body.code === 0 && body.data) {
        var d = body.data;
        var names = (d.submitters || []).map(function(s) { return s.displayName; }).join(', ');
        var text = '已提交: ' + d.entryCount + ' 条';
        if (names) text += ' (' + names + ')';
        if (d.aggregated) text += ' | 已汇总';
        if (d.logId) root.dataset.logId = d.logId;
        setStatus(statusEl, text);
      }
    })
    .catch(function() {});
}

function callApi(app, url, method, params, data) {
  var api = app.api || app.apiClient;
  if (!api) return Promise.reject(new Error('API client not available'));
  // Remove /api/ prefix from URL since APIClient adds baseURL: '/api/'
  if (url && url.startsWith('/api/')) {
    url = url.substring(4);
  }
  if (api.request) {
    var opts = { url: url, method: method, headers: { 'Content-Type': 'application/json' } };
    if (params) opts.params = params;
    if (data) opts.data = data;
    return api.request(opts);
  }
  return Promise.reject(new Error('No request method found'));
}

function setStatus(el, text) {
  if (el) el.textContent = text;
}

function getTodayNum() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return parseInt(y + m + day);
}

function watchLogDetailPage(app) {
  var checked = {};
  setInterval(function() {
    // React to DOM changes: check for construction_daily_log detail drawer/page
    injectIfNeeded(app, checked);
    ensureEntryNoVisible();
  }, 1200);
  // Also run on history changes
  window.addEventListener('popstate', function() {
    setTimeout(function() { injectIfNeeded(app, checked); }, 800);
  });
}

function injectIfNeeded(app, checked) {
  if (document.querySelector('[data-role="aggregate-root"]')) return;

  // Detect if we're on a construction_daily_log detail page by looking at
  // the page content for log data or the word "施工日志"
  var bodyText = document.body ? document.body.textContent : '';
  if (!bodyText.includes('construction_daily_log') && !bodyText.includes('施工日志')) return;

  // Look for a container that shows log detail data
  // NocoBase renders record details in drawers/pages with the record ID visible
  var allEls = document.querySelectorAll('*');
  var logId = null;

  // Strategy 1: find the log ID from the URL
  var m = location.href.match(/construction_daily_log(?:\/records|\/(?:detail|edit|view))?\/(\d+)/);
  if (m) logId = m[1];
  if (!logId) {
    // Strategy 2: find from DOM - look for elements containing "id" field with a number
    m = location.href.match(/\/(\d{10,})\b/);
    if (m) logId = m[1];
  }

  if (!logId) return;
  if (checked[logId]) return;
  checked[logId] = true;

  // Fetch log data to get projectId and log_date
  callApi(app, '/api/construction_daily_log:get?filterByTk=' + logId, 'GET')
    .then(function(res) {
      var log = res && res.data ? res.data : null;
      if (!log || !log.id) return;
      createAggregateRoot(app, log);
    })
    .catch(function() {
      // Failed to fetch - maybe it's not a log page after all
    });
}

function createAggregateRoot(app, log) {
  var root = document.createElement('div');
  root.dataset.role = 'aggregate-root';
  root.dataset.projectNameNo = log.project_name_NO || '';
  root.dataset.projectId = log['link-projectID'] || '';
  root.dataset.logDate = log.log_date || getTodayNum();
  root.dataset.logId = log.id;
  root.style.cssText = 'margin:8px 24px 0;padding:12px 16px;border:1px solid #d9d9d9;border-radius:8px;background:#fafafa;display:flex;align-items:center;gap:12px;clear:both;';

  var btn = document.createElement('button');
  btn.dataset.role = 'aggregate-btn';
  btn.textContent = '汇总';
  btn.style.cssText = 'padding:6px 20px;border:none;border-radius:6px;background:#1890ff;color:#fff;cursor:pointer;font-size:14px;font-weight:500;';

  var status = document.createElement('span');
  status.className = 'agg-status';
  status.style.cssText = 'color:#666;font-size:13px;';

  root.appendChild(btn);
  root.appendChild(status);

  // Insert near the top of the page content area
  var container = document.querySelector('.nb-page-container, .ant-layout-content, .page-container, .ant-pro-page-container') || document.body;
  container.insertBefore(root, container.firstChild.nextSibling || container.firstChild);
}

function ensureEntryNoVisible() {
  // If an entries table is visible and it has an entry_no column, make sure it's shown
  // This is handled by checking if the column header exists
  var headers = document.querySelectorAll('th, .ant-table-cell');
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].textContent.trim() === '编号' || headers[i].textContent.trim() === 'entry_no') {
      return; // Already visible
    }
  }
  // Column not visible - we could try to inject it, but this is better done
  // through NocoBase UI configuration
}
