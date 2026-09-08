const app = getApp();

Page({
  data: {
    src: ''
  },

  onLoad(options) {
    const token = wx.getStorageSync('token') || app.globalData.token || '';
    const url = decodeURIComponent(options.url || '');
    if (!url) {
      wx.showToast({ title: '缺少URL参数', icon: 'none' });
      return;
    }
    const to = (url.indexOf(app.globalData.baseUrl) === 0)
      ? url.slice(app.globalData.baseUrl.length)
      : url;
    const safeTo = encodeURIComponent(to.charAt(0) === '/' ? to : '/' + to);
    const fullUrl = app.globalData.baseUrl + '/api/__pd__/mp-webview?token=' +
      encodeURIComponent(token) + '&to=' + safeTo;
    wx.setNavigationBarTitle({ title: options.title || url.split('/').pop() || '加载中...' });
    this.setData({ src: fullUrl });
  },

  onShareAppMessage() {
    return { title: '贵州遵大数智化平台' };
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  }
});
