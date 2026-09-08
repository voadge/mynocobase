const app = getApp();
var LocationTracker = require('../../utils/location');

function fenceDisplay(v) {
  if (!v.matched) return { text: '✅ 无需围栏（自由打卡）', color: '#52c41a', canSubmit: true };
  if (v.inside) {
    var ratio = v.bufferRadius ? v.distance / v.bufferRadius : 0;
    if (ratio > 0.6) return { text: '⚠️ 接近围栏边界 (' + v.distance + 'm)', color: '#faad14', canSubmit: true };
    return { text: '✅ 围栏内 (' + v.distance + 'm)', color: '#52c41a', canSubmit: true };
  }
  return { text: '❌ 围栏外 (' + v.distance + 'm)', color: '#ff4d4f', canSubmit: false };
}

var page = Page({
  data: {
    token: '',
    attendType: '上班',
    attendState: null,
    location: null,
    gpsState: 'waiting',
    coordText: '',
    photoPath: '',
    fenceResult: null,
    fenceText: '检测围栏...',
    fenceColor: '#888',
    fenceCanSubmit: true,
    isLeave: false,
    showLeaveForm: false,
    leaveStartDate: '',
    leaveEndDate: '',
    leaveReason: '',
    submitting: false,
    submitText: '确认打卡',
    clockText: '',
    faceIndicator: '',
    privacyNeedsAgree: false
  },

  _isHarmonyOS: function() {
    try {
      var s = (wx.getSystemInfoSync() || {}).system || '';
      return /ohos|harmony/i.test(s);
    } catch (e) { return false; }
  },

  _checkPrivacyAgree: function() {
    var self = this;
    // 鸿蒙上 onNeedPrivacyAuthorization 不触发，走常驻「同意隐私」按钮；安卓/iOS 走 privacy-popup 弹窗
    if (!this._isHarmonyOS()) return;
    if (typeof wx.getPrivacySetting !== 'function') return;
    wx.getPrivacySetting({
      success: function(res) {
        var need = res && (res.need === true || res.needAuthorization === true);
        if (need) self.setData({ privacyNeedsAgree: true });
      }
    });
  },

  onPrivacyAgreed: function() {
    // 用户点击 open-type="agreePrivacyAuthorization" 已同步"已同意隐私"；立即重新触发定位
    this.setData({ privacyNeedsAgree: false });
    this.getLocation(true);
  },

  onLoad() {
    var token = wx.getStorageSync('token') || app.globalData.token || '';
    if (!token) { wx.redirectTo({ url: '/pages/index/index' }); return; }
    this.setData({ token: token, clockText: new Date().toLocaleString('zh-CN') });
    this.fetchTodayStatus();
    var self = this;
    LocationTracker.ensurePrivacy(function () { self.getLocation(); });
    this._checkPrivacyAgree();
    setInterval(function() {
      var t = new Date();
      this.setData({ clockText: t.toLocaleString('zh-CN') });
    }.bind(this), 1000);
  },

  fetchTodayStatus() {
    var token = this.data.token;
    var today = new Date();
    var start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    var end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    var url = app.globalData.baseUrl + '/api/attendance_records:list?filter[createdAt][$dateBetween]=' +
      encodeURIComponent('[' + start + ',' + end + ']') + '&sort=-createdAt&pageSize=10&appends=createdBy';
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

  getLocation: function(high) {
    var self = this;
    if (high === undefined) high = true;
    this._locSettled = false;
    function finish(over) {
      if (self._locSettled) return;
      self._locSettled = true;
      if (self._locTimer) { clearTimeout(self._locTimer); self._locTimer = null; }
      self.setData(over);
    }
    function onSuccess(res) {
      var lat = res.latitude, lng = res.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
        finish({ gpsState: 'fail', coordText: '定位数据异常', fenceText: '❌ 定位数据异常', fenceColor: '#ff4d4f', fenceCanSubmit: false });
        return;
      }
      finish({ gpsState: 'ok', coordText: lat.toFixed(5) + ', ' + lng.toFixed(5) });
      var loc = { lat: lat, lng: lng, accuracy: res.accuracy || 0 };
      self.setData({ location: loc });
      self.checkFence(loc);
    }
function onFail(err) {
      if (self._locSettled) return;
      var msg = (err && err.errMsg) || '';
      if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0 || msg.indexOf('permission') >= 0) {
        finish({ gpsState: 'denied', coordText: '', fenceText: '⚠️ 定位权限被拒，可仍打卡（跳过围栏）', fenceColor: '#faad14', fenceCanSubmit: true });
        return;
      }
      if (high) { self.getLocation(false); return; }
      finish({ gpsState: 'fail', coordText: '', fenceText: '⚠️ 定位失败，可仍打卡（跳过围栏）', fenceColor: '#faad14', fenceCanSubmit: true });
    }
    // 看门狗：高精度 9s / 普通 10s 内无回调 → 高精度降级重试，普通则判超时（杜绝无限"获取中"）
    self._locTimer = setTimeout(function() {
      if (self._locSettled) return;
      if (high) { self.getLocation(false); return; }
      // 普通定位也超时：允许无坐标打卡（服务端权威校验）
      finish({ gpsState: 'timeout', coordText: '', fenceText: '⚠️ 定位超时，可仍打卡（跳过围栏）', fenceColor: '#faad14', fenceCanSubmit: true });
    }, high ? 9000 : 10000);
    // 权限预检：若已拒绝直接引导开启，不再空等
    wx.getSetting({
      success: function(s) {
        if (self._locSettled) return;
        if (s.authSetting && s.authSetting['scope.userLocation'] === false) {
          finish({ gpsState: 'denied', coordText: '', fenceText: '❌ 定位权限被拒绝，点击定位行去开启', fenceColor: '#ff4d4f', fenceCanSubmit: false });
          return;
        }
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: high,
          highAccuracyExpireTime: 5000,
          success: onSuccess,
          fail: onFail
        });
      },
      fail: function() {
        if (self._locSettled) return;
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: high,
          highAccuracyExpireTime: 5000,
          success: onSuccess,
          fail: onFail
        });
      }
    });
  },

  retryLocate: function() {
    if (this.data.gpsState === 'denied') {
      wx.openSetting({ fail: function() {} });
      return;
    }
    this.getLocation(true);
  },

  handleAuthError: function() {
    var self = this;
    if (this._authRedirecting) return;
    this._authRedirecting = true;
    wx.removeStorageSync('token');
    app.globalData.token = '';
    wx.showToast({ title: '登录已过期，正在重新登录', icon: 'none' });
    setTimeout(function() {
      self._authRedirecting = false;
      wx.reLaunch({ url: '/pages/index/index' });
    }, 800);
  },

  checkFence: function(loc) {
    var self = this;
    wx.request({
      url: app.globalData.baseUrl + '/api/__pd__/mp-fence-check?lat=' + loc.lat + '&lng=' + loc.lng,
      header: { 'Authorization': 'Bearer ' + this.data.token },
      timeout: 10000,
      success: function(res) {
        if (res.statusCode === 401) { self.handleAuthError(); return; }
        var d = res.data && res.data.data;
        if (res.statusCode !== 200 || !d || d.matched === undefined) {
          self.setData({ fenceResult: null, fenceText: '⚠️ 围栏状态未知（提交时服务端仍会校验）', fenceColor: '#faad14', fenceCanSubmit: true });
          return;
        }
        var disp = fenceDisplay(d);
        self.setData({ fenceResult: d, fenceText: disp.text, fenceColor: disp.color, fenceCanSubmit: disp.canSubmit });
      },
      fail: function() {
        self.setData({ fenceText: '⚠️ 围栏检测失败（允许打卡）', fenceColor: '#faad14', fenceCanSubmit: true });
      }
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
    var onPicked = function(tempPath) {
      if (tempPath) self.setData({ photoPath: tempPath, faceIndicator: '✅' });
    };
    // wx.chooseMedia requires base library >= 2.10.0; fall back to wx.chooseImage on older libs.
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera'],
        camera: 'back',
        success: function(res) {
          onPicked(res.tempFiles[0] && res.tempFiles[0].tempFilePath);
        }
      });
    } else {
      wx.chooseImage({
        count: 1,
        sourceType: ['camera'],
        success: function(res) {
          onPicked(res.tempFilePaths && res.tempFilePaths[0]);
        }
      });
    }
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
    if (!isLeave && !this.data.fenceCanSubmit) {
      wx.showToast({ title: '不在围栏内，无法打卡', icon: 'none' });
      return;
    }
    var loc = this.data.location;
    var gpsState = this.data.gpsState;
    // 定位仍在获取中 → 拦截；已尝试过（超时/失败/拒绝）→ 允许提交（服务端权威校验）
    if (!loc && gpsState === 'waiting') {
      wx.showToast({ title: '定位获取中，请稍候', icon: 'none' });
      return;
    }
    if (!loc && gpsState === 'ok') {
      wx.showToast({ title: '定位数据异常，点击重试', icon: 'none' });
      return;
    }
    self.setData({ submitting: true, submitText: '提交中...' });
    var now = new Date();
    var body = {
      check_type: this.data.attendType,
      check_time: now.toISOString(),
      gps_state: (loc && gpsState === 'ok') ? 'ok' : (gpsState === 'timeout' ? 'timeout' : 'fail')
    };
    if (loc) {
      body.latitude = loc.lat;
      body.longitude = loc.lng;
      body.gps_accuracy = Math.round(loc.accuracy);
    }
    if (!loc) {
      // 无坐标提交：服务端 validLoc=false 直接放行；此处明确告知后台按失败定位处理
      body.gps_state = gpsState === 'timeout' ? 'timeout' : 'fail';
    }
    try { body.device_model = (wx.getDeviceInfo ? wx.getDeviceInfo().model : wx.getSystemInfoSync().model) || ''; } catch(e) {}
    if (this.data.photoPath) body.photo_taken = true;
    if (isLeave) {
      body.reason = this.data.leaveReason.trim();
      body.start_date = this.data.leaveStartDate || now.toISOString();
      body.end_date = this.data.leaveEndDate || now.toISOString();
    }
    wx.request({
      url: app.globalData.baseUrl + '/api/__pd__/mp-attendance-submit',
      method: 'POST',
      header: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.data.token },
      data: body,
      success: function(res) {
        if (res.statusCode === 401) {
          self.setData({ submitting: false, submitText: '确认打卡' });
          self.handleAuthError();
          return;
        }
        var d = res.data || {};
        if (res.statusCode === 200 && d.code !== -1) {
          if (self.data.attendType === '上班') LocationTracker.startTracking(self.data.token);
          if (self.data.attendType === '下班') LocationTracker.stopTracking();
          wx.showToast({ title: '✅ ' + (isLeave ? '提交成功' : '打卡成功'), icon: 'success' });
          setTimeout(function() { wx.navigateBack(); }, 1500);
        } else {
          var err = d.msg || '打卡被拦截';
          self.setData({ submitting: false, submitText: '✗ ' + String(err).substring(0, 40) });
        }
      },
      fail: function() {
        self.setData({ submitting: false, submitText: '✗ 网络请求失败' });
      }
    });
  }
});
