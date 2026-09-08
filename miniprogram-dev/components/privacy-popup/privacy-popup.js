let privacyHandler;
let privacyResolves = [];
let closeOtherPagePopUpHooks = [];

// 鸿蒙(HarmonyOS)上 onNeedPrivacyAuthorization 不触发，且注册后会把 getLocation
// 永久挂入 pending（不回调）。因此鸿蒙下不注册监听，改用页面内常驻
// open-type="agreePrivacyAuthorization" 按钮完成隐私同步。
// 安卓/iOS 保持原监听，触发时弹出本组件的自定义隐私弹窗。
var harmonyOS = false;
try {
  harmonyOS = /ohos|harmony/i.test((wx.getSystemInfoSync() || {}).system || '');
} catch (e) {}

if (wx.onNeedPrivacyAuthorization && !harmonyOS) {
  wx.onNeedPrivacyAuthorization(function(resolve) {
    if (typeof privacyHandler === 'function') {
      privacyHandler(resolve);
    }
  });
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
