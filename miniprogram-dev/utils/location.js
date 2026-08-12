var LOCATION_REPORT_INTERVAL = 15 * 60 * 1000;
var OFF_WORK_HOUR = 19;
var _trackingTimer = null;
var _lastPosition = null;

function _getToken() {
  try { return wx.getStorageSync('token') || ''; } catch(e) { return ''; }
}

function _cacheKey() { return 'location_pending_' + _getToken().substring(0, 8); }

function _loadCache() {
  try { return JSON.parse(wx.getStorageSync(_cacheKey()) || '[]'); } catch(e) { return []; }
}

function _saveCache(queue) {
  try { wx.setStorageSync(_cacheKey(), JSON.stringify(queue.slice(-100))); } catch(e) {}
}

function _fetchTodayStatus(token) {
  return new Promise(function(resolve) {
    var today = new Date();
    var y = today.getFullYear(), m = String(today.getMonth()+1).padStart(2,'0'), d = String(today.getDate()).padStart(2,'0');
    var s = y + '-' + m + '-' + d;
    var eObj = new Date(y, today.getMonth(), today.getDate() + 1);
    var e = eObj.getFullYear() + '-' + String(eObj.getMonth()+1).padStart(2,'0') + '-' + String(eObj.getDate()).padStart(2,'0');
    wx.request({
      url: getApp().globalData.baseUrl + '/api/attendance_records:list?filter[check_time][$dateBetween][]=' + s + '&filter[check_time][$dateBetween][]=' + e + '&sort=-check_time&pageSize=10',
      header: { 'Authorization': 'Bearer ' + token },
      success: function(res) {
        var recs = (res.data && res.data.data) || [];
        var checkIn = null, checkOut = null;
        for (var i = 0; i < recs.length; i++) {
          var t = recs[i];
          if (t.check_type === '上班' && !checkIn) checkIn = t;
          if (t.check_type === '下班' && !checkOut) checkOut = t;
        }
        resolve({ checkIn: !!checkIn, checkOut: !!checkOut });
      },
      fail: function() { resolve({ checkIn: false, checkOut: false }); }
    });
  });
}

function _reportLocation(token) {
  wx.getLocation({
    type: 'gcj02',
    success: function(res) {
      var data = {
        latitude: res.latitude,
        longitude: res.longitude,
        accuracy: Math.round(res.accuracy || 0),
        source: 'wx',
        trigger: 'scheduled',
        recorded_at: new Date().toISOString(),
        township: '', street: '', district: '',
        is_valid: true,
        consent_at: null,
        metadata: {}
      };
      var cache = _loadCache();
      cache.push(data);
      _saveCache(cache);
      _lastPosition = { lat: res.latitude, lng: res.longitude };
      _flushCache(token);
    },
    fail: function() {}
  });
}

function _flushCache(token) {
  var cache = _loadCache();
  if (!cache.length) return;
  var batch = cache.splice(0, 10);
  wx.request({
    url: getApp().globalData.baseUrl + '/api/location_history:create',
    method: 'POST',
    header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    data: batch.length === 1 ? batch[0] : batch,
    success: function() { _saveCache(cache); },
    fail: function() { cache = batch.concat(cache); _saveCache(cache); }
  });
}

module.exports = {
  startTracking: function(token) {
    if (_trackingTimer) return;
    var now = new Date();
    if (now.getHours() >= OFF_WORK_HOUR) return;
    _fetchTodayStatus(token).then(function(state) {
      if (!state.checkIn || state.checkOut) return;
      _reportLocation(token);
      _trackingTimer = setInterval(function() { _reportLocation(token); }, LOCATION_REPORT_INTERVAL);
    });
  },

  stopTracking: function() {
    if (_trackingTimer) { clearInterval(_trackingTimer); _trackingTimer = null; }
    var token = _getToken();
    if (token) _flushCache(token);
  },

  checkState: function() {
    var token = _getToken();
    if (!token) return;
    _flushCache(token);
    if (_trackingTimer) return;
    var now = new Date();
    if (now.getHours() >= OFF_WORK_HOUR) return;
    _fetchTodayStatus(token).then(function(state) {
      if (!state.checkIn || state.checkOut) return;
      _reportLocation(token);
      _trackingTimer = setInterval(function() { _reportLocation(token); }, LOCATION_REPORT_INTERVAL);
    });
  }
};
