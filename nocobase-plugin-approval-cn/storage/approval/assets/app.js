(function () {
  "use strict";
  var state = { view: "desk", user: null, tasks: [] };
  var $ = function (id) { return document.getElementById(id); };
  var viewEl = $("view");
  var TOKEN_KEYS = ['NOCOBASE_TOKEN', 'nocobase_token', 'token', 'auth_token', 'access_token'];
  var authToken = "";

  function resolveToken() {
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      try { var v = localStorage.getItem(TOKEN_KEYS[i]); if (v && v.length > 20) return v; } catch (e) {}
    }
    try { var m = document.cookie.match(/\bnb_token=([^;]+)/); if (m && m[1] && m[1].length > 20) return m[1]; } catch (e) {}
    try { var m2 = document.cookie.match(/NOCOBASE_token=([^;]+)/); if (m2 && m2[1] && m2[1].length > 20) return m2[1]; } catch (e) {}
    return "";
  }

  async function api(url, opts) {
    var o = opts || {};
    var headers = o.headers || {};
    if (authToken && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + authToken;
    o.headers = headers;
    var res = await fetch(url, o);
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json: json };
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---------- flow state derivation ----------
  // nodes: flow_nodes rows; jobs: jobs rows for the execution
  function deriveFlow(flow) {
    var nodes = flow.nodes || [];
    var jobs = flow.jobs || [];
    var jobByNode = {};
    jobs.forEach(function (j) { jobByNode[j.nodeId] = j; });
    var out = [];
    var activeSeen = false;
    // order by chain: start from nodes without upstream (or lowest id); walk downstream
    var byId = {};
    nodes.forEach(function (n) { byId[n.id] = n; });
    // simple linear ordering via downstreamId; for branches fallback to id
    var start = nodes.find(function (n) { return !n.upstreamId && !n.branchIndex; }) || nodes[0];
    var ordered = [];
    var cur = start;
    var guard = 0;
    while (cur && guard < 100) {
      if (ordered.indexOf(cur) < 0) ordered.push(cur);
      var next = cur.downstreamId ? byId[cur.downstreamId] : null;
      if (!next) break;
      cur = next; guard++;
    }
    // append any not reached (branches)
    nodes.forEach(function (n) { if (ordered.indexOf(n) < 0) ordered.push(n); });

    ordered.forEach(function (n) {
      var job = jobByNode[n.id];
      var st = "waiting";
      if (job) {
        if (job.status === 0) st = "active";
        else if (job.status < 0) st = "rejected";
        else st = "done";
      } else if (activeSeen) {
        st = "locked"; // 前位未签 → 后序可见不可签
      }
      if (st === "active") activeSeen = true;
      out.push({ id: n.id, title: n.title || "未命名", type: n.type, status: st });
    });
    return out;
  }

  function renderFlow(flow) {
    var list = deriveFlow(flow);
    if (!list.length) return "<div class='hint'>无流程节点</div>";
    var s = "";
    list.forEach(function (n) {
      var label = { active: "审批中", done: "已完成", rejected: "已拒绝", locked: "待前序", waiting: "待开始" }[n.status] || n.status;
      s += "<div class='flow-node " + n.status + "'><span class='dot'></span><div class='fnode-title'>" + esc(n.title) + "</div><div class='fnode-state'>" + label + "</div></div>";
    });
    return s;
  }

  // ---------- A4 document ----------
  var SYSTEM_FALLBACK = { id: 1, createdAt: 1, createdBy: 1, updatedAt: 1, updatedBy: 1, sort: 1, cron: 1, exclude: 1, __index: 1 };
  function isSysField(k, meta) {
    return !!SYSTEM_FALLBACK[k] || /Id$/i.test(k) || !!(meta && meta.system);
  }
  function fieldLabel(fieldMeta, k) {
    return (fieldMeta && fieldMeta[k] && fieldMeta[k].label) ? fieldMeta[k].label : k;
  }
  function renderDoc(biz, title, fieldMeta) {
    var s = "<h2>" + esc(title || "审批文件") + "</h2>";
    var keys = Object.keys(biz || {}).filter(function (k) { return !isSysField(k, fieldMeta && fieldMeta[k]); });
    var plain = keys.filter(function (k) { return !(biz[k] && typeof biz[k] === "object"); });
    var nested = keys.filter(function (k) { return biz[k] && typeof biz[k] === "object"; });
    if (plain.length) {
      s += "<h3>单据内容</h3><table class='biz-fields'>";
      plain.forEach(function (k) { s += "<tr><td>" + esc(fieldLabel(fieldMeta, k)) + "</td><td>" + esc(biz[k]) + "</td></tr>"; });
      s += "</table>";
    }
    nested.forEach(function (k) {
      var v = biz[k];
      var sub = Object.keys(v).filter(function (x) { return !isSysField(x, null) && !(v[x] && typeof v[x] === "object"); });
      if (!sub.length) return;
      s += "<h3>" + esc(fieldLabel(fieldMeta, k)) + "</h3><table class='biz-fields'>";
      sub.forEach(function (x) { s += "<tr><td>" + esc(x) + "</td><td>" + esc(v[x]) + "</td></tr>"; });
      s += "</table>";
    });
    return s;
  }

  // ---------- views ----------
  async function renderDesk() {
    var r = await api("/api/__appr__/desk");
    var tasks = (r.json && r.json.data) || [];
    state.tasks = tasks;
    var s = "<div class='desk-head'><h1>我的桌面</h1><span class='count'>" + tasks.length + " 份待处理</span></div>";
    if (!tasks.length) {
      s += "<div class='empty'>🎉 桌面是空的，暂无待我审批的文件</div>";
    } else {
      s += "<div class='desk-grid'>";
      tasks.forEach(function (t) {
        var biz = "";
        for (var k in (t.business || {})) { biz += "<div><b>" + esc(fieldLabel(t.fieldMeta, k)) + "</b>: " + esc(t.business[k]) + "</div>"; }
        s += "<div class='desk-card' onclick='App.open(" + t.taskId + ")'>"
          + "<div class='wtitle'>" + esc(t.workflowTitle) + "</div>"
          + "<div class='ntitle'>" + esc(t.nodeTitle) + "</div>"
          + "<div class='biz'>" + biz + "</div>"
          + "</div>";
      });
      s += "</div>";
    }
    viewEl.innerHTML = s;
  }

  async function renderDetail(taskId) {
    var r = await api("/api/__appr__/detail/" + taskId);
    if (!r.json || r.json.code !== 0) { viewEl.innerHTML = "<div class='msg err'>加载失败</div>"; return; }
    var d = r.json.data;
    var af = d.approvalForm || { fields: [], actions: [], formKey: null };
    var nodeActions = [];
    var forms = (d.node && d.node.forms) || {};
    for (var fk in forms) {
      (forms[fk].actions || []).forEach(function (a) { nodeActions.push({ key: a.key, status: a.status, title: a.title || "", formKey: fk }); });
    }
    var actions = (af.actions && af.actions.length) ? af.actions : nodeActions;
    var approve = actions.find(function (a) { return a.status > 0; });
    var reject = actions.find(function (a) { return a.status < 0; });
    var inputFields = (af.fields || []).filter(function (f) { return !f.preset; });

    var s = "<button class='btn btn-ghost back' onclick='App.desk()'>← 返回桌面</button>";
    s += "<div class='detail-wrap'>";
    s += "<div class='doc'>" + renderDoc(d.business, (d.workflow && d.workflow.title) || "审批文件", d.fieldMeta) + "</div>";
    s += "<div class='flow-panel'><h3>审批流程</h3>" + renderFlow(d.flow) + "</div>";
    s += "</div>";

    // 审批意见 = 人工节点"流程待办"表单字段（直接取节点 schema 字段，不设固定模式）
    if (d.task.status === 0 && inputFields.length) {
      s += "<div class='approval-form'><h3>审批意见</h3>";
      inputFields.forEach(function (f) {
        var dv = f.defaultValue != null ? String(f.defaultValue) : "";
        var ro = f.readOnly ? " disabled" : "";
        s += "<div class='frow'><label>" + esc(f.label) + (f.required ? " <span class='req'>*</span>" : "") + "</label>";
        if (f.enum && f.enum.length) {
          s += "<select id='af_" + f.name + "' class='comment'" + ro + "><option value=''>请选择</option>";
          f.enum.forEach(function (e) {
            var sel = (dv !== "" && String(e.value) === dv) ? " selected" : "";
            s += "<option value='" + esc(e.value) + "'" + sel + ">" + esc(e.label) + "</option>";
          });
          s += "</select>";
        } else {
          var inpVal = dv !== "" ? " value='" + esc(dv) + "'" : "";
          var readOnlyAttr = f.readOnly ? " readonly" : "";
          s += "<input id='af_" + f.name + "' class='comment' placeholder='" + esc(f.label) + "'" + inpVal + readOnlyAttr + ">";
        }
        s += "</div>";
      });
      s += "</div>";
    }

    s += "<div class='sign-bar'>";
    if (d.task.status === 0) {
      if (reject) s += "<button class='btn btn-danger' id='btnReject'>否决</button>";
      if (approve) s += "<button class='btn btn-primary' id='btnApprove'>通过</button>";
    } else {
      s += "<span class='hint'>该任务已处理</span>";
    }
    s += "</div>";
    s += "<div id='msg' class='msg'></div>";
    viewEl.innerHTML = s;

    function doSign(action) {
      var msg = $("msg");
      msg.textContent = "提交中…";
      var formData = {};
      // 1) 用户编辑的审批意见字段
      inputFields.forEach(function (f) {
        var el = $("af_" + f.name);
        if (el && el.value !== "" && el.value != null) formData[f.name] = el.value;
      });
      // 2) 自动带入 action 的预设值（服务端已把 {{$user.nickname}} 解析为当前操作人）
      //    审批人/审核人/复核意见等系统字段由此写入，解决 NocoBase 不解析 $user 变量的限制
      var av = (action && action.values) || {};
      for (var k in av) {
        if (formData[k] === undefined) formData[k] = av[k];
      }
      var body = { result: {} };
      body.result[af.formKey || action.formKey] = formData;
      body.result._ = action.key;
      return api("/api/workflowManualTasks:submit/" + taskId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.status === 202 || res.status === 200) {
          msg.textContent = "提交成功";
          setTimeout(renderDesk, 600);
        } else {
          var errText = (res.json && res.json.errors && res.json.errors[0] && res.json.errors[0].message) || ("HTTP " + res.status);
          msg.textContent = "提交失败: " + errText;
        }
      });
    }
    if (approve) $("btnApprove").onclick = function () { doSign(approve); };
    if (reject) $("btnReject").onclick = function () { doSign(reject); };
  }

  async function renderAdmin() {
    var r = await api("/api/approval_templates:list");
    var rows = (r.json && r.json.data) || [];
    var s = "<div class='desk-head'><h1>模板管理</h1></div>";
    s += "<table class='admin-table'><thead><tr><th>ID</th><th>名称</th><th>workflowId</th><th>触发器</th><th>目标集合</th></tr></thead><tbody>";
    rows.forEach(function (t) {
      s += "<tr><td>" + t.id + "</td><td>" + esc(t.name) + "</td><td>" + esc(t.workflowId) + "</td><td>" + esc(t.trigger) + "</td><td>" + esc((t.targetCollections || []).join(", ")) + "</td></tr>";
    });
    s += "</tbody></table>";
    s += "<div class='admin-form'><h3>登记模板</h3>"
      + "<div class='frow'><label>模板名称</label><input id='f_name'></div>"
      + "<div class='frow'><label>workflowId</label><input id='f_wf' placeholder='在工作流 v1 编辑器顶部获取'></div>"
      + "<div class='frow'><label>触发器</label><input id='f_trig' placeholder='create / update / manual'></div>"
      + "<div class='frow'><label>目标集合（逗号分隔）</label><input id='f_cols'></div>"
      + "<button class='btn btn-primary' id='btnCreate'>创建</button>"
      + "<div class='hint'>流程编排在 NocoBase v1 编辑器（删地址栏 /v）中配置，创建后点「绑定」填入 workflowId。</div></div>";
    viewEl.innerHTML = s;
    $("btnCreate").onclick = async function () {
      var body = {
        name: $("f_name").value,
        workflowId: parseInt($("f_wf").value || "0", 10),
        trigger: $("f_trig").value || "manual",
        targetCollections: ($("f_cols").value || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean),
        deskConfig: {}, flowDefSnapshot: {}
      };
      var res = await api("/api/approval_templates:create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      alert(res.status === 200 ? "创建成功" : "创建失败");
      renderAdmin();
    };
  }

  var App = {
    open: function (taskId) { state.view = "detail"; setActive(); renderDetail(taskId); },
    desk: function () { state.view = "desk"; setActive(); renderDesk(); }
  };
  window.App = App;

  function setActive() {
    document.querySelectorAll(".nav-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.view === state.view);
    });
  }

  document.querySelectorAll(".nav-btn").forEach(function (b) {
    b.onclick = function () {
      state.view = b.dataset.view;
      setActive();
      if (state.view === "desk") renderDesk();
      else if (state.view === "admin") renderAdmin();
    };
  });

  async function init() {
    authToken = resolveToken();
    var r = await api("/api/__appr_auth_check__");
    if (r.status === 200 && r.json && r.json.data) {
      var u = r.json.data;
      $("userInfo").textContent = "👤 " + (u.nickname || u.username || ("#" + u.id));
    }
    renderDesk();
  }
  init();
})();