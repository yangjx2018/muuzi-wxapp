/**
 * Auth 顶栏：强制写入胶囊几何（不依赖 Behavior 生命周期是否被调用）。
 */
const navChrome = require('../utils/navChrome');

function applyChrome(page) {
  if (!page || typeof page.setData !== 'function') return;
  try {
    page.setData(navChrome.measureNavChrome());
  } catch (e) {
    /* ignore */
  }
}

function chromePatch() {
  try {
    return navChrome.measureNavChrome();
  } catch (e) {
    return {
      statusBarPx: 47,
      navBarPx: 44,
      bannerPadPx: 91,
      capsuleGapPx: 100,
    };
  }
}

module.exports = Behavior({
  data: {
    // iPhone 常见默认，避免首帧用 20 把顶栏顶进状态栏
    statusBarPx: 47,
    navBarPx: 44,
    bannerPadPx: 91,
    capsuleGapPx: 100,
    backGlyph: '<',
  },

  onLoad() {
    applyChrome(this);
  },

  onShow() {
    applyChrome(this);
  },

  onReady() {
    applyChrome(this);
  },

  methods: {
    refreshAuthChrome() {
      applyChrome(this);
    },
    /** 合并进页面 setData，保证与业务字段同一次写入 */
    authChromePatch: chromePatch,
  },
});
