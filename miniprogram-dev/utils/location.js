var LOCATION_REPORT_INTERVAL = 15 * 60 * 1000;
var STILL_STOP_HOUR = 19;          // 19 点后启动兜底
var STILL_STOP_MS = 60 * 60 * 1000; // 连续 1 小时位置无变动 -> 停止记录
var MOVE_THRESHOLD_M = 100;         // 位移超过该距离(米)视为"移动"
var _tracking = false;        // 是否处于跟踪状态
var _bgRegistered = false;    // onLocationChange 是否已注册，防止重复
var _fgTimer = null;          // 前台轮询兜底定时器
var _lastReportTs = 0;        // 上次实际上报时间戳(ms)，用于 15 分钟节流
var _lastPosition = null;
var _lastMoveTs = 0;          // 上次位置有变动的时间戳(ms)，用于静止兜底
var _consentAt = null;
var _baseUrl = 'https://voadge.top';

// 两点距离(米)，简化球面近似
function _distM(lat1, lng1, lat2, lng2) {
  var dLat = (lat2 - lat1) * 111000;
  var dLng = (lng2 - lng1) * 111000 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// 微信隐私协议：收集位置前必须用户同意。
// 新版微信（SDK>=3.x）：未同意隐私时 getLocation 被前置拦截且永不回调。
// 隐私同意由页面中的 <privacy-popup> 组件处理（open-type="agreePrivacyAuthorization"，
// 通过 wx.onNeedPrivacyAuthorization 自动弹出，同意后 getLocation 自动继续执行）。
// 鸿蒙冲突：requirePrivacyAuthorize 可能永无回调（不会成功也不会失败），
// 因此这里保证 thenDo 总会在看门狗超时后执行，绝不阻塞定位调用。
function _withPrivacy(thenDo) {
  var called = false;
  var go = function () { if (!called) { called = true; if (thenDo) thenDo(); } };
  if (typeof wx.requirePrivacyAuthorize === 'function') {
    wx.requirePrivacyAuthorize({
      success: function () { if (!_consentAt) _consentAt = new Date().toISOString(); go(); },
      fail: function () { go(); },
      complete: function () { go(); }
    });
    // 看门狗：3s 内未触发任何回调（鸿蒙），直接继续，避免定位被永久挂在隐私授权上
    setTimeout(go, 3000);
  } else {
    go();
  }
}

function _getToken() {
  try { return wx.getStorageSync('token') || ''; } catch (e) { return ''; }
}

function _init(opts) {
  if (opts && opts.baseUrl) _baseUrl = opts.baseUrl;
}

function _cacheKey() { return 'location_pending_' + _getToken().substring(0, 8); }

// 每个点位生成稳定 client_id（写入缓存后随点保留，重传同一缓存点时 id 不变 -> 服务端可幂等去重）
function _uuid() {
  var s = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return s.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function _loadCache() {
  try { return JSON.parse(wx.getStorageSync(_cacheKey()) || '[]'); } catch (e) { return []; }
}

// 缓存写入本地存储：即使小程序被关闭/杀掉，点位也不会丢失，重开时再补传
function _saveCache(queue) {
  try { wx.setStorageSync(_cacheKey(), JSON.stringify(queue.slice(-100))); } catch (e) {}
}

function _fetchTodayStatus(token) {
  return new Promise(function (resolve) {
    var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    var end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    wx.request({
      url: _baseUrl + '/api/attendance_records:list?filter[createdAt][$dateBetween]=' +
        encodeURIComponent('[' + start + ',' + end + ']') + '&sort=-createdAt&pageSize=10',
      header: { 'Authorization': 'Bearer ' + token },
      success: function (res) {
        var recs = (res.data && res.data.data) || [];
        var checkIn = null, checkOut = null;
        for (var i = 0; i < recs.length; i++) {
          var t = recs[i];
          if (t.check_type === '上班' && !checkIn) checkIn = t;
          if (t.check_type === '下班' && !checkOut) checkOut = t;
        }
        resolve({ checkIn: !!checkIn, checkOut: !!checkOut });
      },
      fail: function () { resolve({ checkIn: false, checkOut: false }); }
    });
  });
}

var _flushing = false;           // 上传串行锁，防止并发 flush 重复上传同一缓存点

// 把本地缓存逐条上报（失败保留，下次重开/触发再补传）
function _flushCache(token) {
  if (_flushing) return;
  var cache = _loadCache();
  if (!cache.length) return;
  _flushing = true;
  var pending = cache.slice();
  function next(idx) {
    if (idx >= pending.length) { _flushing = false; return; }
    var item = pending[idx];
    wx.request({
      url: _baseUrl + '/api/location_history:create',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: item,
      success: function () {
        // 按 client_id 从“最新存储”里删除已上传点（防并发期间新增的点被误删/覆盖）
        var cid = item.metadata && item.metadata.client_id;
        var cur = _loadCache();
        if (cid) {
          var nf = [];
          for (var i = 0; i < cur.length; i++) {
            if (!cur[i].metadata || cur[i].metadata.client_id !== cid) nf.push(cur[i]);
          }
          _saveCache(nf);
        } else {
          var k = cur.indexOf(item);
          if (k >= 0) { cur.splice(k, 1); _saveCache(cur); }
        }
        next(idx + 1);
      },
      fail: function () { next(idx + 1); }
    });
  }
  next(0);
}

function _pushPoint(loc, trigger) {
  var now = new Date().getTime();
  var data = {
    latitude: loc.latitude,
    longitude: loc.longitude,
    accuracy: Math.round(loc.accuracy || 0),
    source: 'wx',
    trigger: trigger || 'background',
    recorded_at: new Date().toISOString(),
    township: '', street: '', district: '',
    is_valid: true,
    consent_at: _consentAt,
    metadata: { client_id: _uuid() }
  };
  // 位移判定：与上次点位距离超过阈值 -> 更新"最后移动"时间戳
  if (_lastPosition) {
    var d = _distM(_lastPosition.lat, _lastPosition.lng, loc.latitude, loc.longitude);
    if (d >= MOVE_THRESHOLD_M) _lastMoveTs = now;
  } else {
    _lastMoveTs = now; // 首个点位视为刚移动
  }
  var cache = _loadCache();
  cache.push(data);
  _saveCache(cache);
  _lastPosition = { lat: data.latitude, lng: data.longitude };
}

// 节流：距上次实际上报不足 15 分钟 -> 跳过（跟踪激活/停止完全由上下班打卡控制）
function _shouldReport() {
  var now = new Date();
  if (_lastReportTs && now.getTime() - _lastReportTs < LOCATION_REPORT_INTERVAL) return false;
  _lastReportTs = now.getTime();
  return true;
}

// 后台定位回调 / 前台 getLocation 成功 都会走到这里
function _onLocation(res, trigger) {
  var token = _getToken();
  if (!token) return;
  if (!_shouldReport()) return;
  // 兜底：19 点后连续 1 小时位置无变动 -> 停止记录（下班打卡同样触发停止）
  var now = new Date().getTime();
  if (new Date().getHours() >= STILL_STOP_HOUR && _lastMoveTs && (now - _lastMoveTs) >= STILL_STOP_MS) {
    stopTracking();
    return;
  }
  _pushPoint({ latitude: res.latitude, longitude: res.longitude, accuracy: res.accuracy }, trigger || 'background');
  _flushCache(token);
}

function _fgOnce(token) {
  _withPrivacy(function () {
    wx.getLocation({
      type: 'gcj02',
      success: function (res) { _onLocation(res, 'start'); },
      fail: function () {}
    });
  });
}

// 开启微信后台持续定位（app.json 已声明 startLocationUpdateBackground + 后台权限）
// 后台模式下即使小程序界面关闭，系统仍会周期性推送位置；推送即写入本地缓存
function _startBackground(token) {
  if (_bgRegistered) return;
  _bgRegistered = true;
  _withPrivacy(function () {
    wx.startLocationUpdateBackground({
      type: 'gcj02',
      success: function () { wx.onLocationChange(_onLocation); },
      fail: function () {
        // 后台定位不可用（未授权/被拒）：立即前台取一次，后续由 startTracking 的15分钟前台定时器覆盖
        _fgOnce(token);
      }
    });
  });
}

function startTracking(token) {
  if (_tracking) return;
  _fetchTodayStatus(token).then(function (state) {
    if (!state.checkIn || state.checkOut) return;
    _tracking = true;
    _lastReportTs = 0;
    _lastPosition = null;
    _lastMoveTs = 0;
    _fgOnce(token);          // 立即上报一次
    _startBackground(token); // 开启后台持续采集
    // 前台每15分钟强制取一次并上报（后台 onLocationChange 为系统事件驱动，可能不足15分钟一次）
    if (!_fgTimer) _fgTimer = setInterval(function () { _fgOnce(token); }, LOCATION_REPORT_INTERVAL);
  });
}

function stopTracking() {
  _tracking = false;
  _bgRegistered = false;
  try { wx.offLocationChange(_onLocation); } catch (e) {}
  try { wx.stopLocationUpdate(); } catch (e) {}
  if (_fgTimer) { clearInterval(_fgTimer); _fgTimer = null; }
  var token = _getToken();
  if (token) _flushCache(token); // 停止时兜底把本地缓存补传
}

function checkState() {
  var token = _getToken();
  if (!token) return;
  _flushCache(token); // 重新打开小程序：先把本地缓存的位置补传
  if (_tracking) return;
  startTracking(token);
}

module.exports = {
  init: _init,
  startTracking: startTracking,
  stopTracking: stopTracking,
  checkState: checkState,
  ensurePrivacy: _withPrivacy
};
