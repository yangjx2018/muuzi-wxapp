/**
 * Host invite page — thin wrapper (App FieldResume / deep-link entry).
 * Primary UX is embedded FieldHostInvite inside Talk.
 */
var session = require('../../../services/session');

Page({
  data: {
    roomId: '',
    allowCreate: true,
  },

  onLoad: function (query) {
    if (!session.requireSignedInOrRedirect()) return;
    var roomId = decodeURIComponent((query && query.room) || '');
    var allowCreate = !(query && query.create === '0');
    if (!roomId || roomId.charAt(0) !== '!') {
      wx.showToast({
        title: '无法恢复话题',
        icon: 'none',
      });
      // 对齐 App：无效 room 不挂载邀请 UI，避免永久「正在创建…」
      setTimeout(function () {
        wx.navigateBack({
          fail: function () {
            wx.switchTab({ url: '/pages/connect/index' });
          },
        });
      }, 400);
      return;
    }
    this.setData({ roomId: roomId, allowCreate: allowCreate });
  },
});
