const navChrome = require('../../utils/navChrome');

Component({
  options: {
    // 与 json.virtualHost 双保险：去掉组件宿主节点，避免 fixed 顶栏撑满挡住下层点击
    virtualHost: true,
  },

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
    // iPhone 刘海常见默认；attached 后立刻按胶囊实测覆盖
    statusBarPx: 48,
    navBarPx: 32,
    bannerPadPx: 80,
    capsuleGapPx: 100,
  },

  lifetimes: {
    attached() {
      this.applyChrome();
    },
    ready() {
      this.applyChrome();
      // DevTools / 部分机型首帧胶囊 rect 为 0，短延迟再测一次
      var self = this;
      setTimeout(function () {
        self.applyChrome();
      }, 64);
    },
  },

  methods: {
    applyChrome() {
      try {
        this.setData(navChrome.measureNavChrome());
      } catch (e) {
        /* ignore */
      }
    },

    onBack() {
      this.triggerEvent('back');
      // 严格读 properties，避免 data 里字符串 "false" 被当成真
      if (this.properties.autoBack !== true) return;
      var url = this.properties.fallbackUrl || '/pages/connect/index';
      var asTab = this.properties.fallbackTab !== false;
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
