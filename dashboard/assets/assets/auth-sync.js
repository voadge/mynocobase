// auth-sync.js — Token→Cookie 同步脚本
// 注入到 /signin、/admin/、/ 等页面，自动捕获登录成功后的 token 并写入 cookie
(function() {
  'use strict';

  // 清理 URL 中的 redirect 参数
  try {
    var u = new URL(window.location.href);
    if (u.searchParams.has('redirect')) {
      u.searchParams.delete('redirect');
      window.history.replaceState({}, '', u.toString());
    }
  } catch(e) {}

  var TOKEN_COOKIE = 'nb_token';
  var COOKIE_OPTS = 'path=/;max-age=86400;SameSite=Lax;Secure';
  var AUTH_PATH = '/api/auth:signIn';

  function setTokenAndRedirect(t) {
    if (!t) return;
    document.cookie = TOKEN_COOKIE + '=' + t + ';' + COOKIE_OPTS;
    try { localStorage.setItem('NOCOBASE_TOKEN', t); } catch(e) {}
    window.location.replace('/');
  }

  // ---- 拦截 fetch ----
  var origFetch = window.fetch;
  window.fetch = function() {
    return origFetch.apply(this, arguments).then(function(r) {
      if (r.url && r.url.indexOf(AUTH_PATH) !== -1) {
        r.clone().json().then(function(d) {
          setTokenAndRedirect(d && d.data && d.data.token);
        }).catch(function() {});
      }
      return r;
    });
  };

  // ---- 拦截 XMLHttpRequest (支持 addEventListener 和 onload) ----
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u) {
    this._authUrl = u;
    return origOpen.apply(this, arguments);
  };
  var origAddEventListener = XMLHttpRequest.prototype.addEventListener;
  XMLHttpRequest.prototype.addEventListener = function(type, listener, options) {
    if (type === 'load' && this._authUrl && this._authUrl.indexOf(AUTH_PATH) > -1) {
      var self = this;
      var wrapped = function() {
        try {
          var d = JSON.parse(self.responseText);
          setTokenAndRedirect(d && d.data && d.data.token);
        } catch(e) {}
      };
      return origAddEventListener.call(this, type, wrapped, options);
    }
    return origAddEventListener.apply(this, arguments);
  };
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    var origOnload = xhr.onload;
    xhr.onload = function() {
      if (xhr._authUrl && xhr._authUrl.indexOf(AUTH_PATH) > -1) {
        try {
          var d = JSON.parse(xhr.responseText);
          setTokenAndRedirect(d && d.data && d.data.token);
          return;
        } catch(e) {}
      }
      if (origOnload) origOnload.apply(xhr, arguments);
    };
    return origSend.apply(this, arguments);
  };

  // ---- 轮询 localStorage 中已知的 token key，同步到 cookie（不跳转，不踢用户） ----
  var _tokenCheckInterval = setInterval(function() {
    if (document.cookie.indexOf(TOKEN_COOKIE + '=') > -1) {
      clearInterval(_tokenCheckInterval);
      return;
    }
    var keys = ['NOCOBASE_TOKEN', 'nocobase_token', 'token', 'auth_token', 'access_token'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var v = localStorage.getItem(keys[i]);
        if (v && v.length > 20) {
          document.cookie = TOKEN_COOKIE + '=' + v + ';' + COOKIE_OPTS;
          clearInterval(_tokenCheckInterval);
          return;
        }
      } catch(e) {}
    }
  }, 5000);

  // ---- 读取 URL ?token= 参数（微信小程序 web-view 注入） ----
  try {
    var urlParams = new URLSearchParams(window.location.search);
    var urlToken = urlParams.get('token');
    if (urlToken && urlToken.length > 20) {
      // 写入 localStorage
      try { localStorage.setItem('NOCOBASE_TOKEN', urlToken); } catch(e) {}
      // 写入 cookie
      document.cookie = TOKEN_COOKIE + '=' + urlToken + ';' + COOKIE_OPTS;
      // 清理 URL 中的 token 参数（避免泄露到后续请求）
      urlParams.delete('token');
      var cleanUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '') + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }
  } catch(e) {}
})();
