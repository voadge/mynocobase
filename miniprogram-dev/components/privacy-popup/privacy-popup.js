let privacyHandler;
let privacyResolves = [];
let closeOtherPagePopUpHooks = [];

if (wx.onNeedPrivacyAuthorization) {
  wx.onNeedPrivacyAuthorization(function(resolve) {
    if (typeof privacyHandler === 'function') {
      privacyHandler(resolve);
    }
  });
} else {
  console.error('当前基础库不支持 wx.onNeedPrivacyAuthorization');
}

var closeOtherPagePopUp = function(closePopUp) {
  closeOtherPagePopUpHooks.forEach(function(hook) {
    try { hook(closePopUp); } catch (e) {}
  });
};

Component({
  data: {
    showPrivacy: false,
    privacyContractName: ''
  },
  lifetimes: {
    attached: function() {
      var that = this;
      var closePopUp = function() { that.disPopUp(); };
      privacyHandler = function(resolve) {
        privacyResolves.push(resolve);
        that.popUp();
        closeOtherPagePopUp(closePopUp);
      };
      this.closePopUp = closePopUp;
      closeOtherPagePopUpHooks.push(closePopUp);
      if (wx.getPrivacySetting) {
        wx.getPrivacySetting({
          success: function(res) {
            if (res && res.errMsg === 'getPrivacySetting:ok' && res.privacyContractName) {
              that.setData({ privacyContractName: res.privacyContractName });
            }
          }
        });
      }
    },
    detached: function() {
      closeOtherPagePopUpHooks = closeOtherPagePopUpHooks.filter(function(h) {
        return h !== this.closePopUp;
      }, this);
    }
  },
  pageLifetimes: {
    show: function() {
      var that = this;
      privacyHandler = function(resolve) {
        privacyResolves.push(resolve);
        that.popUp();
        closeOtherPagePopUp(that.closePopUp);
      };
    }
  },
  methods: {
    handleAgree: function() {
      this.disPopUp();
      privacyResolves.forEach(function(resolve) {
        resolve({ event: 'agree', buttonId: 'agree-btn' });
      });
      privacyResolves = [];
    },
    handleDisagree: function() {
      this.disPopUp();
      privacyResolves.forEach(function(resolve) {
        resolve({ event: 'disagree' });
      });
      privacyResolves = [];
    },
    popUp: function() {
      if (!this.data.showPrivacy) this.setData({ showPrivacy: true });
    },
    disPopUp: function() {
      if (this.data.showPrivacy) this.setData({ showPrivacy: false });
    },
    openPrivacyContract: function() {
      wx.openPrivacyContract({ fail: function() {} });
    }
  }
});
