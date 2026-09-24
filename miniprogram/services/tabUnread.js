/**
 * 消息 Tab 未读红点 · 真实 unread 合计（join 房间 notification_count）
 * tabBar list 顺序：连接(0) · 消息(1) · 我(2)
 */

var MESSAGES_TAB_INDEX = 1;

function totalUnread(rooms) {
  var sum = 0;
  for (var i = 0; i < (rooms || []).length; i++) {
    var n = Number(rooms[i] && rooms[i].unread) || 0;
    if (n > 0) sum += n;
  }
  return sum;
}

function applyTabBadge(unread) {
  var n = Number(unread) || 0;
  if (typeof wx === 'undefined') return;
  if (n > 0) {
    var text = n > 99 ? '99+' : String(n);
    if (typeof wx.setTabBarBadge === 'function') {
      wx.setTabBarBadge({
        index: MESSAGES_TAB_INDEX,
        text: text,
        fail: function () {},
      });
    }
  } else if (typeof wx.removeTabBarBadge === 'function') {
    wx.removeTabBarBadge({
      index: MESSAGES_TAB_INDEX,
      fail: function () {},
    });
  }
}

module.exports = {
  MESSAGES_TAB_INDEX: MESSAGES_TAB_INDEX,
  totalUnread: totalUnread,
  applyTabBadge: applyTabBadge,
};
