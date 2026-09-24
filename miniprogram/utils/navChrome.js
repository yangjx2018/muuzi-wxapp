/**
 * 对齐 App AppBanner 的顶栏几何：状态栏 + 胶囊对齐行高 + 右侧避让。
 */
function measureNavChrome() {
  var win =
    typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync();
  var statusBarPx = win.statusBarHeight || 20;
  var menu =
    typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : {
          top: statusBarPx + 6,
          height: 32,
          left: (win.windowWidth || 375) - 96,
        };
  var gap = Math.max(0, (menu.top || statusBarPx) - statusBarPx);
  var navBarPx = gap * 2 + (menu.height || 32);
  var capsuleGapPx = Math.max(
    88,
    Math.round((win.windowWidth || 375) - (menu.left || 0) + 8)
  );
  return {
    statusBarPx: statusBarPx,
    navBarPx: navBarPx,
    bannerPadPx: statusBarPx + navBarPx,
    capsuleGapPx: capsuleGapPx,
  };
}

module.exports = {
  measureNavChrome: measureNavChrome,
};
