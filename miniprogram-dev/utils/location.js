var LOCATION_REPORT_INTERVAL = 15 * 60 * 1000;
var OFF_WORK_HOUR = 19;
var _tracking = false;        // 是否处于跟踪状态
var _bgRegistered = false;    // onLocationChange 是否已注册，防止重复
var _fgTimer = null;          // 前台轮询兜底定时器
var _lastReportTs = 0;        // 上次实际上报时间戳(ms)，用于 15 分钟节流
var _lastPosition = null;
var _consentAt = null;
var _baseUrl = 'https://voadge.top';

// 微信隐私协议：收集位置前必须用户同意；同意后记录 consent_at 时间戳
function _withPrivacy(thenDo) {
  if (typeof wx.requirePrivacyAuthorize === 'function') {
    wx.requirePrivacyAuthorize({
      success: function () { if (!_consentAt) _consentAt = new Date().toISOString(); thenDo(); },
      fail: function () {}
    });
  } else {
    thenDo();
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
    var y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
    var s = y + '-' + m + '-' + d;
    var eObj = new Date(y, today.getMonth(), today.getDate() + 1);
    var e = eObj.getFullYear() + '-' + String(eObj.getMonth() + 1).padStart(2, '0') + '-' + String(eObj.getDate()).padStart(2, '0');
    wx.request({
      url: _baseUrl + '/api/attendance_records:list?filter[check_time][$dateBetween][]=' + s + '&filter[check_time][$dateBetween][]=' + e + '&sort=-check_time&pageSize=10',
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

// 把本地缓存逐条上报（失败保留，下次重开/触发再补传）
function _flushCache(token) {
  var cache = _loadCache();
  if (!cache.length) return;
  var pending = cache.slice();
  var stillPending = cache.slice();
  function next(idx) {
    if (idx >= pending.length) return;
    var item = pending[idx];
    wx.request({
      url: _baseUrl + '/api/location_history:create',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      data: item,
      success: function () {
        var k = stillPending.indexOf(item);
        if (k >= 0) stillPending.splice(k, 1);
        _saveCache(stillPending);
        next(idx + 1);
      },
      fail: function () { next(idx + 1); }
    });
  }
  next(0);
}

function _pushPoint(loc, trigger) {
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
  var cache = _loadCache();
  cache.push(data);
  _saveCache(cache);
  _lastPosition = { lat: data.latitude, lng: data.longitude };
}

// 节流：距上次实际上报不足 15 分钟 / 已过下班时间 -> 跳过
function _shouldReport() {
  var now = new Date();
  if (now.getHours() >= OFF_WORK_HOUR) return false;
  if (_lastReportTs && now.getTime() - _lastReportTs < LOCATION_REPORT_INTERVAL) return false;
  _lastReportTs = now.getTime();
  return true;
}

// 后台定位回调 / 前台 getLocation 成功 都会走到这里
function _onLocation(res, trigger) {
  var token = _getToken();
  if (!token) return;
  if (!_shouldReport()) return;
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
        // 后台定位不可用（未授权/被拒）：退回前台轮询兜底
        if (_fgTimer) return;
        _fgOnce(token);
        _fgTimer = setInterval(function () { _fgOnce(token); }, LOCATION_REPORT_INTERVAL);
      }
    });
  });
}

function startTracking(token) {
  if (_tracking) return;
  var now = new Date();
  if (now.getHours() >= OFF_WORK_HOUR) return;
  _fetchTodayStatus(token).then(function (state) {
    if (!state.checkIn || state.checkOut) return;
    _tracking = true;
    _lastReportTs = 0;
    _fgOnce(token);          // 立即上报一次
    _startBackground(token); // 开启后台持续采集
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
