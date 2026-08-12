App({
  globalData: {
    userInfo: null,
    token: null,
    baseUrl: 'https://voadge.top'
  },
  onLaunch() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
    }
  },

  onShow() {
    var LocationTracker = require('utils/location');
    LocationTracker.checkState();
  }
});
