/** 头像与资料 → 编辑主页 profile 模式（对齐 App profileOnly） */
Page({
  onLoad() {
    wx.redirectTo({
      url: '/pages/me/edit-home/index?mode=profile',
      fail: function () {
        wx.navigateTo({ url: '/pages/me/edit-home/index?mode=profile' });
      },
    });
  },
});
