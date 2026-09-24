const session = require('../../../services/session');
const saved = require('../../../services/fieldSavedTalks');
const matrixRuntime = require('../../../services/matrixRuntime');
const deepLink = require('../../../services/messageDeepLink');

/**
 * FieldResume · 对齐 /connect/continue → 有房间时直达 FieldHostInvite(allowCreate=false)
 */
Page({
  data: {
    roomId: '',
    note: saved.CONTINUE_NOTE,
    canResume: false,
    canOpenChat: false,
    matrixReady: false,
  },

  _alive: false,
  _autoOpened: false,
  _matrixUnsub: null,

  onLoad(options) {
    if (!session.requireSignedInOrRedirect()) return;
    var roomId = (options && options.room) || '';
    this.setData({ roomId: roomId });
    this.refresh();
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    matrixRuntime.ensureStarted();
    // 对齐 App FieldResume：matrix.ready 翻转后需重渲染，不能只刷一次
    if (this._matrixUnsub) this._matrixUnsub();
    this._matrixUnsub = matrixRuntime.subscribe(
      function () {
        if (!this._alive) return;
        this.refresh();
      }.bind(this)
    );
    this.refresh();
  },

  onHide() {
    this._alive = false;
    if (this._matrixUnsub) {
      this._matrixUnsub();
      this._matrixUnsub = null;
    }
  },

  onUnload() {
    this._alive = false;
    if (this._matrixUnsub) {
      this._matrixUnsub();
      this._matrixUnsub = null;
    }
  },

  // 对齐 App FieldResume：joined(rooms) AND field(workspace channelIds)
  isJoinedFieldRoom(snap, roomId) {
    if (!snap || !roomId) return false;
    var rooms = snap.rooms || [];
    var joined = false;
    for (var i = 0; i < rooms.length; i++) {
      if (rooms[i] && rooms[i].roomId === roomId) {
        joined = true;
        break;
      }
    }
    if (!joined) return false;
    var spaces = snap.nodeWorkspaces || [];
    for (var s = 0; s < spaces.length; s++) {
      var space = spaces[s];
      if (!space || !space.field || !Array.isArray(space.channelIds)) continue;
      if (space.channelIds.indexOf(roomId) >= 0) return true;
    }
    return false;
  },

  refresh() {
    var roomId = this.data.roomId;
    var snap = matrixRuntime.getSnapshot();
    var ready = !!(snap && snap.ready);
    var joinedField = this.isJoinedFieldRoom(snap, roomId);
    var avail = saved.continueAvailability(roomId, ready, joinedField);
    var ok = !!avail.ok;

    if (!roomId) {
      this.setData({
        note: saved.CONTINUE_NOTE,
        canResume: false,
        canOpenChat: false,
        matrixReady: ready,
      });
      return;
    }

    if (!ready) {
      this.setData({
        note: '正在读取现场交流…',
        canResume: false,
        canOpenChat: false,
        matrixReady: false,
      });
      return;
    }

    this.setData({
      note: avail.message || (ok ? '可恢复扫码邀请或打开现场频道。' : avail.message),
      canResume: ok,
      canOpenChat: ok,
      matrixReady: true,
    });

    // App FieldResume：校验通过后直接进入宿主邀请页（不允许新建邀请）
    if (ok && this._alive && !this._autoOpened) {
      this._autoOpened = true;
      wx.redirectTo({
        url:
          '/pages/connect/host/index?room=' +
          encodeURIComponent(roomId) +
          '&create=0',
      });
    }
  },

  goConnect() {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/connect/index' });
      },
    });
  },

  goTalk() {
    wx.redirectTo({ url: '/pages/connect/talk/index' });
  },

  resumeHost() {
    var roomId = this.data.roomId;
    if (!roomId || !this.data.canResume) return;
    wx.navigateTo({
      url:
        '/pages/connect/host/index?room=' +
        encodeURIComponent(roomId) +
        '&create=0',
    });
  },

  openChat() {
    var roomId = this.data.roomId;
    if (!roomId) return;
    deepLink.openRoom(roomId).catch(function () {
      wx.showToast({ title: '无法打开会话', icon: 'none' });
    });
  },
});
