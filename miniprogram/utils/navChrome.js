/**
 * 顶栏几何：与微信胶囊垂直居中对齐。
 *
 * 优先用胶囊自身 top/height（官方自定义导航可靠做法）：
 *   padding-top = menu.top
 *   行高       = menu.height
 * → 内容中线与胶囊中线必然重合，不依赖可能不准的 statusBarHeight。
 */
function measureNavChrome() {
  var win =
    typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync();
  var menu =
    typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null;

  var windowWidth = Number(win.windowWidth) || 375;
  var reportedStatus = Number(win.statusBarHeight) || 0;
  var menuTop = menu && Number(menu.top) > 0 ? Number(menu.top) : 0;
  var menuHeight = menu && Number(menu.height) > 0 ? Number(menu.height) : 0;
  var menuLeft = menu && Number(menu.left) > 0 ? Number(menu.left) : windowWidth - 96;
  var menuBottom =
    menu && Number(menu.bottom) > 0
      ? Number(menu.bottom)
      : menuTop + menuHeight;

  var statusBarPx;
  var navBarPx;
  var bannerPadPx;

  if (menuTop > 0 && menuHeight > 0) {
    // 与胶囊同盒：上沿、高度完全一致
    statusBarPx = Math.round(menuTop);
    navBarPx = Math.round(menuHeight);
    bannerPadPx = Math.round(menuBottom > 0 ? menuBottom : statusBarPx + navBarPx);
  } else {
    // 无胶囊信息时退回 statusBar + 常见行高
    statusBarPx = reportedStatus >= 16 ? Math.round(reportedStatus) : 47;
    navBarPx = 44;
    bannerPadPx = statusBarPx + navBarPx;
  }

  var capsuleGapPx = Math.max(100, Math.round(windowWidth - menuLeft + 12));

  return {
    statusBarPx: statusBarPx,
    navBarPx: navBarPx,
    bannerPadPx: bannerPadPx,
    capsuleGapPx: capsuleGapPx,
  };
}

module.exports = {
  measureNavChrome: measureNavChrome,
};
