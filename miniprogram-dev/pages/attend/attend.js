const app = getApp();

function haversineDist(lat1, lon1, lat2, lon2) {
  var R = 6371000, toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {
  var dAC = haversineDist(lat, lon, lat1, lon1);
  var dBC = haversineDist(lat, lon, lat2, lon2);
  var dAB = haversineDist(lat1, lon1, lat2, lon2);
  if (dAB < 1) return dAC;
  var cosA = (dAC * dAC + dAB * dAB - dBC * dBC) / (2 * dAC * dAB);
  var cosB = (dBC * dBC + dAB * dAB - dAC * dAC) / (2 * dBC * dAB);
  if (cosA <= 0) return dAC;
  if (cosB <= 0) return dBC;
  var s = (dAC + dBC + dAB) / 2;
  var area = Math.sqrt(Math.max(0, s * (s - dAC) * (s - dBC) * (s - dAB)));
  return area * 2 / dAB;
}

function distanceToPolyline(lat, lon, polyline) {
  var minDist = Infinity;
  for (var i = 0; i < polyline.length - 1; i++) {
    var dist = pointToSegmentDistance(lat, lon, polyline[i][1], polyline[i][0], polyline[i + 1][1], polyline[i + 1][0]);
    if (dist < minDist) minDist = dist;
  }
  return Math.round(minDist);
}

var _pi = 3.141592653589793, _a = 6378245.0, _ee = 0.00669342162296594323;
function _transformLat(x, y) {
  var ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
  ret += (20*Math.sin(6*x*_pi) + 20*Math.sin(2*x*_pi)) * 2/3;
  ret += (20*Math.sin(y*_pi) + 40*Math.sin(y/3*_pi)) * 2/3;
  ret += (160*Math.sin(y/12*_pi) + 320*Math.sin(y*_pi/30)) * 2/3;
  return ret;
}
function _transformLng(x, y) {
  var ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
  ret += (20*Math.sin(6*x*_pi) + 20*Math.sin(2*x*_pi)) * 2/3;
  ret += (20*Math.sin(x*_pi) + 40*Math.sin(x/3*_pi)) * 2/3;
  ret += (150*Math.sin(x/12*_pi) + 300*Math.sin(x/30*_pi)) * 2/3;
  return ret;
}
function _outOfChina(lat, lng) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
function wgs84ToGcj02(lat, lng) {
  if (_outOfChina(lat, lng)) return [lat, lng];
  var dLat = _transformLat(lng - 105, lat - 35);
  var dLng = _transformLng(lng - 105, lat - 35);
  var radLat = lat / 180 * _pi;
  var magic = Math.sin(radLat);
  magic = 1 - _ee * magic * magic;
  var sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180) / ((_a * (1 - _ee)) / (magic * sqrtMagic) * _pi);
  dLng = (dLng * 180) / (_a / sqrtMagic * Math.cos(radLat) * _pi);
  return [lat + dLat, lng + dLng];
}

var __geofencesCache = null, __geofencesCacheTime = 0;
function fetchGeofences(token) {
  var now = Date.now();
  if (__geofencesCache && now - __geofencesCacheTime < 300000) {
    return Promise.resolve(__geofencesCache);
  }
  return new Promise(function(resolve) {
    wx.request({
      url: app.globalData.baseUrl + '/api/geofences:list?filter[is_active]=true&sort=sort',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      success: function(res) {
        var data = res.data || {};
        __geofencesCache = data.data || [];
        __geofencesCacheTime = now;
        resolve(__geofencesCache);
      },
      fail: function() { resolve(__geofencesCache || []); }
    });
  });
}

var page = Page({
  data: {
    token: '',
    attendType: '上班',
    attendState: null,
    location: null,
    gpsState: 'waiting',
    photoPath: '',
    fenceResult: null,
    fenceText: '检测围栏...',
    fenceColor: '#888',
    isLeave: false,
    showLeaveForm: false,
    leaveStartDate: '',
    leaveEndDate: '',
    leaveReason: '',
    submitting: false,
    submitText: '确认打卡',
    clockText: '',
    faceIndicator: ''
  },

  onLoad() {
    var token = wx.getStorageSync('token') || app.globalData.token || '';
    if (!token) { wx.redirectTo({ url: '/pages/index/index' }); return; }
    this.setData({ token: token, clockText: new Date().toLocaleString('zh-CN') });
    this.fetchTodayStatus();
    this.getLocation();
    setInterval(function() {
      var t = new Date();
      this.setData({ clockText: t.toLocaleString('zh-CN') });
    }.bind(this), 1000);
  },

  fetchTodayStatus() {
    var token = this.data.token;
    var today = new Date();
    var startStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    var endStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()+1).padStart(2,'0');
    var url = app.globalData.baseUrl + '/api/attendance_records:list?filter[check_time][$dateBetween]=' +
      startStr + ',' + endStr + '&sort=-check_time&pageSize=10&appends=createdBy';
    wx.request({
      url: url,
      header: { 'Authorization': 'Bearer ' + token },
      success: function(res) {
        if (res.statusCode !== 200 || !res.data || !res.data.data) return;
        var recs = res.data.data || [];
        var checkIn = null, checkOut = null, leaveRec = null;
        for (var i = 0; i < recs.length; i++) {
          var t = recs[i];
          if (t.check_type === '上班' && !checkIn) checkIn = t;
          if (t.check_type === '下班' && !checkOut) checkOut = t;
          if ((t.check_type === '请假' || t.check_type === '出差' || t.check_type === '调休') && !leaveRec) leaveRec = t;
        }
        var state = { checkIn: !!checkIn, checkOut: !!checkOut, leaveRec: leaveRec };
        if (leaveRec && leaveRec.workflow_status === 'pending') state.statusText = '⏳' + leaveRec.check_type + '待审批';
        else if (leaveRec && leaveRec.approval === '通过') state.statusText = '✅' + (leaveRec.check_type === '请假' ? '已请假' : leaveRec.check_type === '调休' ? '已调休' : '已出差');
        else if (leaveRec && leaveRec.approval === '驳回') state.statusText = '❌' + leaveRec.check_type + '被驳回';
        else if (checkOut) state.statusText = '✅ 已下班';
        else if (checkIn) state.statusText = '✅ 已上班';
        else state.statusText = '';
        this.setData({ attendState: state });
      }.bind(this)
    });
  },

  getLocation() {
    var self = this;
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
      success: function(res) {
        var loc = { lat: res.latitude, lng: res.longitude, accuracy: res.accuracy || 0 };
        self.setData({ location: loc, gpsState: 'ok' });
        self.checkFence(loc);
      },
      fail: function() {
        self.setData({ gpsState: 'fail', fenceText: '❌ 定位失败', fenceColor: '#ff4d4f' });
      }
    });
  },

  checkFence: function(loc) {
    var self = this;
    fetchGeofences(this.data.token).then(function(fences) {
      if (!fences || fences.length === 0) {
        self.checkCircularFence(loc);
        return;
      }
      var minDist = Infinity, matchedFence = null;
      for (var i = 0; i < fences.length; i++) {
        var fence = fences[i];
        if (fence.bbox_min_lat != null && fence.bbox_max_lat != null && fence.bbox_min_lng != null && fence.bbox_max_lng != null) {
          var bufDeg = (fence.buffer_radius || 200) / 111320;
          var bufDegLng = bufDeg / Math.cos(loc.lat * Math.PI / 180);
          if (loc.lat < fence.bbox_min_lat - bufDeg || loc.lat > fence.bbox_max_lat + bufDeg ||
              loc.lng < fence.bbox_min_lng - bufDegLng || loc.lng > fence.bbox_max_lng + bufDegLng) {
            continue;
          }
        }
        var polyline;
        try { polyline = JSON.parse(fence.polyline_coords); } catch(e) { continue; }
        if (!Array.isArray(polyline) || polyline.length < 2) continue;
        var dist = distanceToPolyline(loc.lat, loc.lng, polyline);
        if (dist < minDist) { minDist = dist; matchedFence = fence; }
      }
      var buffer = matchedFence ? matchedFence.buffer_radius : 200;
      var inside = matchedFence ? minDist <= buffer : true;
      var result = { inside: inside, distance: minDist < Infinity ? minDist : null, fenceName: matchedFence ? matchedFence.fence_name : null };
      self.setData({ fenceResult: result, fenceText: inside ? '✅ 围栏内' : '❌ 围栏外 (' + minDist + 'm)', fenceColor: inside ? '#52c41a' : '#ff4d4f' });
    });
  },

  checkCircularFence: function(loc) {
    var config = { centerLat: 27.706, centerLng: 106.937, radius: 300 };
    var R = 6371000;
    var dLat = (loc.lat - config.centerLat) * Math.PI / 180;
    var dLng = (loc.lng - config.centerLng) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(config.centerLat * Math.PI / 180) * Math.cos(loc.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var distance = Math.round(R * c);
    var inside = distance <= config.radius;
    this.setData({
      fenceResult: { inside: inside, distance: distance, fenceName: '默认围栏' },
      fenceText: inside ? '✅ 围栏内' : '❌ 围栏外 (' + distance + 'm)',
      fenceColor: inside ? '#52c41a' : '#ff4d4f'
    });
  },

  chooseAttendType: function(e) {
    var type = e.currentTarget.dataset.type;
    var isLeave = (type === '请假' || type === '调休' || type === '出差');
    var showLeave = isLeave;
    if (type === 'leave') {
      showLeave = true;
      type = '请假';
    }
    this.setData({ attendType: type, isLeave: showLeave, showLeaveForm: showLeave });
  },

  takePhoto: function() {
    var self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      camera: 'back',
      success: function(res) {
        var tempPath = res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (tempPath) self.setData({ photoPath: tempPath, faceIndicator: '✅' });
      }
    });
  },

  bindLeaveStart: function(e) { this.setData({ leaveStartDate: e.detail.value }); },
  bindLeaveEnd: function(e) { this.setData({ leaveEndDate: e.detail.value }); },
  bindLeaveReason: function(e) { this.setData({ leaveReason: e.detail.value }); },

  submitAttendance: function() {
    if (this.data.submitting) return;
    var self = this;
    var isLeave = (this.data.attendType === '请假' || this.data.attendType === '调休' || this.data.attendType === '出差');
    if (isLeave && !this.data.leaveReason.trim()) {
      wx.showToast({ title: '请填写事由说明', icon: 'none' });
      return;
    }
    self.setData({ submitting: true, submitText: '提交中...' });
    var now = new Date();
    var body = {
      check_type: this.data.attendType,
      check_time: now.toISOString(),
      gps_state: this.data.gpsState,
      workflow_status: isLeave ? 'pending' : 'normal'
    };
    var fr = this.data.fenceResult;
    if (fr && fr.fenceName) {
      body.geofence_inside = fr.inside;
      body.geofence_distance = fr.distance;
    }
    var loc = this.data.location;
    if (loc) { body.latitude = loc.lat; body.longitude = loc.lng; body.gps_accuracy = Math.round(loc.accuracy); }
    if (isLeave) {
      body.reason = this.data.leaveReason.trim();
      body.start_date = this.data.leaveStartDate || now.toISOString();
      body.end_date = this.data.leaveEndDate || now.toISOString();
    } else {
      var methods = ['gps'];
      if (this.data.photoPath) methods.push('photo');
      body.verify_status = methods.join('+');
    }
    wx.request({
      url: app.globalData.baseUrl + '/api/attendance_records:create',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.data.token },
      data: body,
      success: function(res) {
        if (res.statusCode === 200) {
          wx.showToast({ title: '✅ ' + (isLeave ? '提交成功' : '打卡成功'), icon: 'success' });
          setTimeout(function() { wx.navigateBack(); }, 1500);
        } else {
          var err = (res.data && (res.data.errors || res.data.error || JSON.stringify(res.data))) || '请求失败';
          self.setData({ submitting: false, submitText: '✗ ' + String(err).substring(0, 40) });
        }
      },
      fail: function() {
        self.setData({ submitting: false, submitText: '✗ 网络请求失败' });
      }
    });
  }
});
