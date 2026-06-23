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
  };
  return DashboardHomePlugin;
});

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

  // Fetch submitter status on mount if project is selected
  if (projectId) {
    fetchStatus(app, root, projectId, logDate);
  }

  btn.addEventListener('click', function() {
    var pid = root.dataset.projectId;
    var date = root.dataset.logDate || getTodayNum();

    if (!pid) {
      setStatus(statusEl, '请先选择项目');
      return;
    }

    var id = root.dataset.logId;
    btn.disabled = true;
    setStatus(statusEl, '汇总中...');
    var payload = id ? { logId: parseInt(id) } : { projectID: parseInt(pid), date: date };
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
  return y + m + day;
}
