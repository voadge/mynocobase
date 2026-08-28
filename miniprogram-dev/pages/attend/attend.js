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
    faceIndicator: ''
  },

  onLoad() {
    var token = wx.getStorageSync('token') || app.globalData.token || '';
    if (!token) { wx.redirectTo({ url: '/pages/index/index' }); return; }
    this.setData({ token: token, clockText: new Date().toLocaleString('zh-CN') });
    this.fetchTodayStatus();
    var self = this;
    LocationTracker.ensurePrivacy(function () { self.getLocation(); });
    setInterval(function() {
      var t = new Date();
      this.setData({ clockText: t.toLocaleString('zh-CN') });
    }.bind(this), 1000);
  },

  fetchTodayStatus() {
    var token = this.data.token;
    var today = new Date();
    var startStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    var endObj = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    var endStr = endObj.getFullYear() + '-' + String(endObj.getMonth()+1).padStart(2,'0') + '-' + String(endObj.getDate()).padStart(2,'0');
    var url = app.globalData.baseUrl + '/api/attendance_records:list?filter[check_time][$dateBetween][]=' +
      startStr + '&filter[check_time][$dateBetween][]=' + endStr + '&sort=-check_time&pageSize=10&appends=createdBy';
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
        var lat = res.latitude, lng = res.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
          self.setData({ gpsState: 'fail', coordText: '定位数据异常', fenceText: '❌ 定位数据异常', fenceColor: '#ff4d4f', fenceCanSubmit: false });
          return;
        }
        var loc = { lat: lat, lng: lng, accuracy: res.accuracy || 0 };
        self.setData({ location: loc, gpsState: 'ok', coordText: lat.toFixed(5) + ', ' + lng.toFixed(5) });
        self.checkFence(loc);
      },
      fail: function() {
        self.setData({ gpsState: 'fail', coordText: '', fenceText: '❌ 定位失败', fenceColor: '#ff4d4f', fenceCanSubmit: false });
      }
    });
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
    if (!loc) {
      wx.showToast({ title: '定位未完成', icon: 'none' });
      return;
    }
    self.setData({ submitting: true, submitText: '提交中...' });
    var now = new Date();
    var body = {
      check_type: this.data.attendType,
      check_time: now.toISOString(),
      latitude: loc.lat,
      longitude: loc.lng,
      gps_accuracy: Math.round(loc.accuracy),
      gps_state: this.data.gpsState
    };
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
