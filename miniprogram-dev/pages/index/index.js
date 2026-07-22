const app = getApp();

Page({
  data: {
    webviewUrl: '',
    loading: true,
    needBind: false,
    error: '',
    openid: ''
  },

  onLoad() {
    console.log('[index] onLoad');
    this.handleLogin();
  },

  onShow() {
    const token = wx.getStorageSync('token') || app.globalData.token || '';
    console.log('[index] onShow token:', token ? token.substring(0, 10) + '...' : 'empty');
    if (token && !this.data.loading && !this.data.webviewUrl) {
      console.log('[index] onShow -> goHome');
      this.goHome();
    }
  },

  handleLogin() {
    const token = wx.getStorageSync('token');
    console.log('[index] handleLogin token:', token ? token.substring(0, 10) + '...' : 'empty');
    if (token) {
      app.globalData.token = token;
      console.log('[index] handleLogin -> goHome (cached)');
      this.goHome();
      return;
    }
    this.setData({ loading: true, needBind: false, error: '' });
    wx.login({
      success: (res) => {
        if (!res.code) {
          this.setData({ loading: false, error: '微信登录失败，请重试' });
          return;
        }
        this.exchangeToken(res.code);
      },
      fail: () => {
        this.setData({ loading: false, error: '调用wx.login失败' });
      }
    });
  },

  exchangeToken(code) {
    console.log('[index] exchangeToken, code:', code.substring(0, 10) + '...');
    wx.request({
      url: `${app.globalData.baseUrl}/api/__pd__/mp-login`,
      method: 'POST',
      data: { code },
      success: (res) => {
        const data = res.data || {};
        console.log('[index] exchangeToken response:', JSON.stringify(data).substring(0, 200));
        if (data.code !== 0) {
          if (data.data && data.data.needBind) {
            console.log('[index] needBind = true, openid:', data.data.openid);
            this.setData({
              loading: false,
              needBind: true,
              openid: data.data.openid || ''
            });
          } else {
            this.setData({ loading: false, error: data.msg || '登录失败' });
          }
          return;
        }
        const token = data.data.token;
        console.log('[index] token obtained:', token.substring(0, 20) + '...');
        wx.setStorageSync('token', token);
        app.globalData.token = token;
        if (data.data.user) {
          app.globalData.userInfo = data.data.user;
        }
        this.goHome();
      },
      fail: (err) => {
        console.log('[index] exchangeToken FAIL:', err);
        this.setData({ loading: false, error: '网络请求失败，请检查网络连接' });
      }
    });
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  },

  goBind() {
    wx.navigateTo({
      url: `/pages/bind/bind?openid=${encodeURIComponent(this.data.openid)}`
    });
  }
});
