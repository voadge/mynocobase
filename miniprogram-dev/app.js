const LocationTracker = require('utils/location');

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
    LocationTracker.init({ baseUrl: this.globalData.baseUrl });
  },

  onShow() {
    LocationTracker.checkState();
  }
});
