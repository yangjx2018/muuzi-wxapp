const navChrome = require('../../utils/navChrome');

Component({
  properties: {
    /** 分区名，对齐 App AppBanner section */
    section: { type: String, value: '' },
    /** 左侧返回 */
    showBack: { type: Boolean, value: false },
    /** 读读：返回 */
    backLabel: { type: String, value: '返回' },
    /**
     * true：组件内 navigateBack（失败则 fallbackUrl）
     * false：只 triggerEvent('back')，由页面处理
     */
    autoBack: { type: Boolean, value: true },
    /** autoBack 失败时的去向 */
    fallbackUrl: { type: String, value: '/pages/connect/index' },
    /** fallback 是否 switchTab */
    fallbackTab: { type: Boolean, value: true },
  },

  data: {
    statusBarPx: 20,
    navBarPx: 44,
    bannerPadPx: 64,
    capsuleGapPx: 96,
  },

  lifetimes: {
    attached() {
      this.setData(navChrome.measureNavChrome());
    },
  },

  methods: {
    onBack() {
      this.triggerEvent('back');
      if (!this.data.autoBack) return;
      var url = this.data.fallbackUrl || '/pages/connect/index';
      var asTab = this.data.fallbackTab !== false;
      wx.navigateBack({
        fail: function () {
          if (asTab) {
            wx.switchTab({
              url: url,
              fail: function () {
                wx.reLaunch({ url: url });
              },
            });
          } else {
            wx.redirectTo({
              url: url,
              fail: function () {
                wx.reLaunch({ url: url });
              },
            });
          }
        },
      });
    },
  },
});
