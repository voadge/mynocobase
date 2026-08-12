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
    const sep = url.indexOf('?') > -1 ? '&' : '?';
    const fullUrl = app.globalData.baseUrl + url + sep + 'token=' + encodeURIComponent(token);
    wx.setNavigationBarTitle({ title: options.title || decodeURIComponent(options.url || '').split('/').pop() || '加载中...' });
    this.setData({ src: fullUrl });
  },

  onShareAppMessage() {
    return { title: '贵州遵大数智化平台' };
  }
});
