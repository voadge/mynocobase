const app = getApp();

Page({
  data: {
    openid: '',
    users: [],
    filteredUsers: [],
    search: '',
    loading: true,
    submitting: false,
    error: ''
  },

  onLoad(options) {
    const openid = options.openid ? decodeURIComponent(options.openid) : '';
    this.setData({ openid }, () => {
      this.fetchUsers();
    });
  },

  fetchUsers() {
    this.setData({ loading: true, error: '' });
    wx.request({
      url: `${app.globalData.baseUrl}/api/__pd__/users-list`,
      method: 'GET',
      success: (res) => {
        const data = res.data || {};
        if (data.code === 0 && data.data && data.data.users) {
          this.setData({
            users: data.data.users,
            filteredUsers: data.data.users,
            loading: false
          });
        } else {
          this.setData({ loading: false, error: data.msg || '获取用户列表失败' });
        }
      },
      fail: () => {
        this.setData({ loading: false, error: '网络请求失败，请重试' });
      }
    });
  },

  onSearch(e) {
    const keyword = (e.detail.value || '').trim().toLowerCase();
    const filtered = this.data.users.filter((u) => {
      const name = (u.nickname || '').toLowerCase();
      const dept = (u.department || '').toLowerCase();
      return name.includes(keyword) || dept.includes(keyword);
    });
    this.setData({ search: keyword, filteredUsers: filtered });
  },

  selectUser(e) {
    const userId = e.currentTarget.dataset.id;
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return;

    wx.showModal({
      title: '确认绑定',
      content: `确定将微信账号绑定到「${user.nickname}」？`,
      success: (res) => {
        if (res.confirm) {
          this.doBind(userId);
        }
      }
    });
  },

  doBind(userId) {
    this.setData({ submitting: true, error: '' });
    wx.request({
      url: `${app.globalData.baseUrl}/api/__pd__/bind-openid`,
      method: 'POST',
      data: { openid: this.data.openid, userId },
      success: (res) => {
        const data = res.data || {};
        if (data.code !== 0) {
          this.setData({ submitting: false, error: data.msg || '绑定失败' });
          return;
        }
        const token = data.data.token;
        wx.setStorageSync('token', token);
        app.globalData.token = token;
        wx.showToast({ title: '绑定成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      },
      fail: () => {
        this.setData({ submitting: false, error: '绑定请求网络失败' });
      }
    });
  }
});
