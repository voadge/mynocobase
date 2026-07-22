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
    this.handleLogin();
  },

  handleLogin() {
    const token = wx.getStorageSync('token');
    if (token) {
      app.globalData.token = token;
      this.openWebview(token);
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
    wx.request({
      url: `${app.globalData.baseUrl}/api/__pd__/mp-login`,
      method: 'POST',
      data: { code },
      success: (res) => {
        const data = res.data || {};
        if (data.code !== 0) {
          if (data.data && data.data.needBind) {
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
        wx.setStorageSync('token', token);
        app.globalData.token = token;
        this.openWebview(token);
      },
      fail: () => {
        this.setData({ loading: false, error: '网络请求失败，请检查网络连接' });
      }
    });
  },

  openWebview(token) {
    const url = `${app.globalData.baseUrl}/dashboard/人员动态.html?token=${encodeURIComponent(token)}`;
    this.setData({ webviewUrl: url, loading: false });
  },

  goBind() {
    wx.navigateTo({
      url: `/pages/bind/bind?openid=${encodeURIComponent(this.data.openid)}`
    });
  }
});
