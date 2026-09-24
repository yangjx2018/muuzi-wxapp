const session = require('../../services/session');
const matrixRuntime = require('../../services/matrixRuntime');
const matrixInbox = require('../../services/matrixInbox');
const deepLink = require('../../services/messageDeepLink');
const creator = require('../../services/creator');
const matrixMedia = require('../../services/matrixMedia');
const navChrome = require('../../utils/navChrome');

var ROOM_TYPE_KEYS = ['all', 'direct', 'group'];
var ROOM_TYPE_LABELS = ['全部', '单聊', '频道 / Muu'];

var WORKSPACE_RAIL = [
  {
    key: 'all',
    label: '全部消息',
    glyph: '',
    tone: 'wash',
    // 不用 tab-messages-active（黑实心）；用 CSS 蓝色线框气泡对齐 App navChat
    icon: '',
    chatIco: true,
  },
  {
    key: 'business',
    label: '业务工作区',
    glyph: '业务',
    tone: 'brown',
    icon: '',
    chatIco: false,
  },
  {
    key: 'muu',
    label: 'Muu 工作区',
    glyph: '',
    tone: 'muu',
    icon: '/assets/logo-muu.png',
    chatIco: false,
  },
  {
    key: 'following',
    label: '关注私聊',
    glyph: '关注',
    tone: 'green',
    icon: '',
    chatIco: false,
  },
];

function statusLabel(snap) {
  if (!snap) return '尚未开始同步';
  if (snap.error && !snap.ready) return snap.error;
  if (snap.ready) return snap.error ? snap.error : '已同步';
  if (snap.running) return '正在同步节点…';
  return '正在连接节点…';
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    var now = new Date();
    var sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    var h = d.getHours();
    var m = d.getMinutes();
    var hm =
      (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    if (sameDay) return hm;
    var mon = d.getMonth() + 1;
    var day = d.getDate();
    return mon + '/' + day + ' ' + hm;
  } catch (e) {
    return '';
  }
}

function formatRoom(item, avatarCache) {
  var unreadLabel = '';
  if (item.unread > 0) {
    unreadLabel = item.unread > 99 ? '99+' : String(item.unread);
  }
  var name = String(item.name || '');
  var glyph = item.kind === 'ai' ? '' : name ? name.charAt(0) : '?';
  var tileClass =
    item.kind === 'ai' ? 'ai' : item.kind === 'direct' ? 'dm' : 'ch';
  var previewLine = String(item.preview || item.subtitle || '');
  var avatarSrc = '';
  if (item.kind === 'ai') {
    avatarSrc = '/assets/logo-muu.png';
  } else if (item.avatar && avatarCache && avatarCache[item.avatar]) {
    avatarSrc = avatarCache[item.avatar];
  }
  return Object.assign({}, item, {
    unreadLabel: unreadLabel,
    glyph: glyph,
    tileClass: tileClass,
    timeLabel: formatTime(item.timestamp),
    previewLine: previewLine,
    isAi: item.kind === 'ai',
    avatarSrc: avatarSrc,
  });
}

function isEmptyAi(room) {
  return (
    room &&
    room.kind === 'ai' &&
    !room.starred &&
    !(room.preview && room.preview !== room.subtitle) &&
    !room.unread
  );
}

Page({
  data: {
    statusBarPx: 20,
    navBarPx: 44,
    bannerPadPx: 64,
    capsuleGapPx: 96,
    ready: false,
    error: '',
    statusText: '正在连接节点…',
    workspacesReady: false,
    workspaceError: '',
    workspaceCount: 0,
    workspace: 'all',
    workspaceTitle: '全部消息',
    workspaceRail: WORKSPACE_RAIL,
    drawerOpen: false,
    workspaceChoices: [],
    inboxFilter: 'all',
    roomType: 'all',
    roomTypeIndex: 0,
    roomTypeLabels: ROOM_TYPE_LABELS,
    search: '',
    showSearch: false,
    showNew: false,
    showEmptyAi: false,
    emptyAiCount: 0,
    peerDraft: '',
    dmBusy: false,
    dmError: '',
    inviteBusyId: '',
    rooms: [],
    invitations: [],
    visibleRooms: [],
    roomCount: 0,
    inviteCount: 0,
    visibleCount: 0,
    empty: true,
    filteredEmpty: false,
  },

  _unsub: null,
  _alive: false,
  _snap: null,
  _pendingRoom: '',
  _followedPeers: null,
  _followingLoaded: false,
  _avatarCache: null,
  _avatarLoading: null,

  onLoad(query) {
    this.setData(navChrome.measureNavChrome());
    this._pendingRoom = deepLink.parseRoomQuery(query);
    this._avatarCache = Object.create(null);
    this._avatarLoading = Object.create(null);
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    matrixRuntime.ensureStarted();
    this.loadFollowing();
    if (this._unsub) this._unsub();
    this._unsub = matrixRuntime.subscribe(
      function (snap) {
        if (!this._alive) return;
        try {
          this.applySnap(snap);
          this.flushPendingRoom(snap);
        } catch (err) {
          this.setData({
            error: (err && err.message) || '消息列表刷新失败，请下拉重试',
            empty: false,
          });
        }
      }.bind(this)
    );
    // 订阅会立即推 lastSnap；再兜底一次，避免异常被 runtime 静默吞掉后一直空白
    try {
      var current = matrixRuntime.getSnapshot();
      if (current) this.applySnap(current);
    } catch (e2) {
      /* applySnap 已单独防护 */
    }
    // 若上次停在某工作区/筛选导致「看起来像列表全没了」，自动回到全部消息
    if (
      this.data.ready &&
      this.data.roomCount > 0 &&
      this.data.visibleCount === 0 &&
      (this.data.workspace !== 'all' ||
        this.data.inboxFilter !== 'all' ||
        this.data.roomType !== 'all' ||
        this.data.search)
    ) {
      this.onResetFilters();
    }
  },

  loadFollowing() {
    var self = this;
    if (this._followingLoaded) return;
    var snap = session.snapshot();
    if (!session.isSignedIn()) return;
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return creator.platformRequest(
          opened.token,
          '/api/creator/following'
        );
      })
      .then(function (body) {
        if (!self._alive) return;
        var map = Object.create(null);
        var list = (body && body.following) || [];
        for (var i = 0; i < list.length; i++) {
          var entry = list[i];
          if (entry && entry.matrix_user_id) {
            map[entry.matrix_user_id] = true;
          }
        }
        self._followedPeers = map;
        self._followingLoaded = true;
        if (self._snap) self.applySnap(self._snap);
      })
      .catch(function () {
        self._followedPeers = Object.create(null);
        self._followingLoaded = true;
      });
  },

  flushPendingRoom(snap) {
    if (!this._pendingRoom) return;
    if (!snap || !snap.ready) return;
    var roomId = this._pendingRoom;
    this._pendingRoom = '';
    deepLink.openRoom(roomId).catch(function () {
      wx.showToast({ title: '无法打开该会话', icon: 'none' });
    });
  },

  onHide() {
    this._alive = false;
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },

  onUnload() {
    this._alive = false;
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },

  applySnap(snap) {
    this._snap = snap;
    var cache = this._avatarCache || Object.create(null);
    var rooms = (snap.rooms || []).map(function (item) {
      return formatRoom(item, cache);
    });
    var invitations = (snap.invitations || []).map(function (item) {
      return formatRoom(item, cache);
    });
    var workspaces = snap.workspaces || [];
    var nodeWorkspaces = snap.nodeWorkspaces || [];
    var peers = this._followedPeers;
    var counts = matrixInbox.countByWorkspace(rooms, workspaces, peers);
    var choices = [
      {
        key: 'all',
        name: '全部消息',
        description: '所有对话，一处查看',
        count: counts.all,
        current: this.data.workspace === 'all',
      },
    ].concat(
      matrixInbox.WORKSPACE_META.map(
        function (item) {
          return {
            key: item.key,
            name: item.name,
            description: item.description,
            count: counts[item.key] || 0,
            current: this.data.workspace === item.key,
          };
        }.bind(this)
      )
    );
    var ownIds = Object.create(null);
    for (var w = 0; w < workspaces.length; w++) {
      if (workspaces[w] && workspaces[w].roomId) {
        ownIds[workspaces[w].roomId] = true;
      }
    }
    for (var n = 0; n < nodeWorkspaces.length; n++) {
      var space = nodeWorkspaces[n];
      if (!space || !space.roomId || ownIds[space.roomId]) continue;
      choices.push({
        key: space.roomId,
        name: space.name || '节点工作区',
        description:
          (space.channelIds && space.channelIds.length
            ? space.channelIds.length + ' 个频道'
            : '节点空间') + (space.field ? ' · 现场' : ''),
        count: 0,
        current: this.data.workspace === space.roomId,
      });
    }

    var emptyAiCount = 0;
    for (var e = 0; e < rooms.length; e++) {
      if (isEmptyAi(rooms[e])) emptyAiCount += 1;
    }

    var visible = matrixInbox
      .filterInbox({
        rooms: rooms,
        workspaces: workspaces,
        nodeWorkspaces: nodeWorkspaces,
        workspace: this.data.workspace,
        inboxFilter: this.data.inboxFilter,
        roomType: this.data.roomType,
        search: this.data.search,
        followedPeers: peers,
        showEmptyAi: this.data.showEmptyAi,
      })
      .map(function (item) {
        return formatRoom(item, cache);
      });

    this.setData({
      ready: !!snap.ready,
      error: snap.error || '',
      statusText: statusLabel(snap),
      rooms: rooms,
      invitations: invitations,
      visibleRooms: visible,
      roomCount: rooms.length,
      inviteCount: invitations.length,
      visibleCount: visible.length,
      emptyAiCount: emptyAiCount,
      empty: visible.length === 0 && invitations.length === 0,
      filteredEmpty:
        !!snap.ready &&
        rooms.length > 0 &&
        visible.length === 0 &&
        invitations.length === 0,
      workspacesReady: !!snap.workspacesReady,
      workspaceError: snap.workspaceError || '',
      workspaceCount: workspaces.length,
      workspaceChoices: choices,
      workspaceTitle: matrixInbox.workspaceLabel(
        this.data.workspace,
        nodeWorkspaces
      ),
    });
    this.resolveAvatars(rooms.concat(invitations));
  },

  onResetFilters() {
    this.setData(
      {
        workspace: 'all',
        inboxFilter: 'all',
        roomType: 'all',
        roomTypeIndex: 0,
        search: '',
        showSearch: false,
        showEmptyAi: false,
      },
      function () {
        this.refreshVisible();
      }.bind(this)
    );
  },

  patchAvatarSrc(mxc, path) {
    function mapList(list) {
      var changed = false;
      var next = (list || []).map(function (room) {
        if (room && room.avatar === mxc && room.avatarSrc !== path) {
          changed = true;
          return Object.assign({}, room, { avatarSrc: path });
        }
        return room;
      });
      return { list: next, changed: changed };
    }
    var vis = mapList(this.data.visibleRooms);
    var inv = mapList(this.data.invitations);
    var all = mapList(this.data.rooms);
    if (!vis.changed && !inv.changed && !all.changed) return;
    this.setData({
      visibleRooms: vis.list,
      invitations: inv.list,
      rooms: all.list,
    });
  },

  resolveAvatars(list) {
    var self = this;
    if (!this._alive || !list || !list.length) return;
    var snap = session.snapshot();
    var homeserver = snap.homeserver || '';
    var accessToken = snap.accessToken || '';
    if (!homeserver || !accessToken) return;
    if (!this._avatarCache) this._avatarCache = Object.create(null);
    if (!this._avatarLoading) this._avatarLoading = Object.create(null);
    var pending = [];
    for (var i = 0; i < list.length; i++) {
      var room = list[i];
      if (!room || room.kind === 'ai' || !room.avatar) continue;
      if (this._avatarCache[room.avatar] || this._avatarLoading[room.avatar]) {
        continue;
      }
      pending.push(room.avatar);
    }
    if (!pending.length) return;
    pending.forEach(function (mxc) {
      self._avatarLoading[mxc] = true;
      matrixMedia
        .downloadToTemp({
          homeserver: homeserver,
          accessToken: accessToken,
          mxc: mxc,
        })
        .then(function (path) {
          if (!self._alive) return;
          self._avatarCache[mxc] = path;
          delete self._avatarLoading[mxc];
          self.patchAvatarSrc(mxc, path);
        })
        .catch(function () {
          delete self._avatarLoading[mxc];
        });
    });
  },

  refreshVisible() {
    if (!this._snap) return;
    this.applySnap(this._snap);
  },

  onOpenDrawer() {
    this.setData({ drawerOpen: true });
  },

  onCloseDrawer() {
    this.setData({ drawerOpen: false });
  },

  onPickWorkspace(e) {
    var key = e.currentTarget.dataset.key || 'all';
    this.setData({ workspace: key, drawerOpen: false }, function () {
      this.refreshVisible();
    }.bind(this));
  },

  onFilter(e) {
    var key = e.currentTarget.dataset.key || 'all';
    this.setData({ inboxFilter: key }, function () {
      this.refreshVisible();
    }.bind(this));
  },

  onRoomTypePick(e) {
    var idx = Number(e.detail && e.detail.value);
    if (!Number.isFinite(idx) || idx < 0 || idx >= ROOM_TYPE_KEYS.length) {
      idx = 0;
    }
    this.setData(
      { roomType: ROOM_TYPE_KEYS[idx], roomTypeIndex: idx },
      function () {
        this.refreshVisible();
      }.bind(this)
    );
  },

  onToggleEmptyAi() {
    this.setData({ showEmptyAi: !this.data.showEmptyAi }, function () {
      this.refreshVisible();
    }.bind(this));
  },

  onToggleSearch() {
    var next = !this.data.showSearch;
    this.setData(
      { showSearch: next, search: next ? this.data.search : '' },
      function () {
        this.refreshVisible();
      }.bind(this)
    );
  },

  onSearchInput(e) {
    this.setData({ search: (e.detail && e.detail.value) || '' }, function () {
      this.refreshVisible();
    }.bind(this));
  },

  onRetry() {
    matrixRuntime.ensureStarted();
  },

  onRetryWorkspaces() {
    matrixRuntime.retryWorkspaces();
  },

  onRelogin() {
    session.signOutAndRelaunch();
  },

  onOpenRoom(e) {
    var ds = (e && e.currentTarget && e.currentTarget.dataset) || {};
    var roomId = '';
    // 优先用列表下标取真值，避免 data-room-id 在部分基础库上对 `!room:server` 丢参。
    if (ds.index !== undefined && ds.index !== '' && ds.index !== null) {
      var idx = Number(ds.index);
      var list =
        ds.source === 'invite'
          ? this.data.invitations
          : this.data.visibleRooms;
      if (list && list[idx] && list[idx].roomId) {
        roomId = list[idx].roomId;
      }
    }
    if (!roomId) {
      roomId = ds.roomId || ds.roomid || '';
    }
    if (!roomId) {
      wx.showToast({ title: '会话无效', icon: 'none' });
      return;
    }
    deepLink.openRoom(roomId).catch(function (err) {
      var msg =
        (err && err.message) ||
        (err && err.errMsg) ||
        '无法打开会话';
      if (msg.length > 24) msg = '无法打开会话';
      wx.showToast({ title: msg, icon: 'none' });
    });
  },

  onAiMore(e) {
    var roomId = (e.currentTarget && e.currentTarget.dataset.roomId) || '';
    var name = (e.currentTarget && e.currentTarget.dataset.name) || '会话';
    if (!roomId) return;
    var self = this;
    wx.showActionSheet({
      itemList: ['打开会话', '删除此 Muu 会话'],
      success: function (res) {
        if (res.tapIndex === 0) {
          deepLink.openRoom(roomId).catch(function () {
            wx.showToast({ title: '无法打开会话', icon: 'none' });
          });
          return;
        }
        if (res.tapIndex === 1) {
          wx.showModal({
            title: '删除这个 Muu 会话？',
            content:
              '将退出「' +
              name +
              '」并从列表移除。不会清除节点或其他参与者保留的记录。',
            confirmText: '删除',
            confirmColor: '#b91c1c',
            success: function (modal) {
              if (!modal.confirm) return;
              if (typeof matrixRuntime.deleteAiSession !== 'function') {
                wx.showToast({
                  title: '删除能力待节点接通',
                  icon: 'none',
                });
                return;
              }
              matrixRuntime
                .deleteAiSession(roomId)
                .then(function () {
                  if (self._snap) self.applySnap(self._snap);
                  wx.showToast({ title: '已删除', icon: 'none' });
                })
                .catch(function (err) {
                  wx.showToast({
                    title: (err && err.message) || '删除失败',
                    icon: 'none',
                  });
                });
            },
          });
        }
      },
    });
  },

  onOpenNew() {
    this.setData({ showNew: true, peerDraft: '', dmError: '' });
  },

  onCloseNew() {
    if (this.data.dmBusy) return;
    this.setData({ showNew: false, peerDraft: '', dmError: '' });
  },

  onPeerInput(e) {
    this.setData({ peerDraft: (e.detail && e.detail.value) || '' });
  },

  onCreateDm() {
    if (this.data.dmBusy) return;
    var draft = (this.data.peerDraft || '').trim();
    if (!draft) {
      this.setData({ dmError: '请输入对方账号' });
      return;
    }
    this.setData({ dmBusy: true, dmError: '' });
    var self = this;
    matrixRuntime
      .createDirectMessage(draft)
      .then(function (result) {
        if (!self._alive) return;
        self.setData({ dmBusy: false, showNew: false, peerDraft: '' });
        if (result && result.warning) {
          wx.showToast({ title: result.warning, icon: 'none' });
        }
        if (result && result.roomId) {
          return deepLink.openRoom(result.roomId);
        }
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          dmBusy: false,
          dmError: (err && err.message) || '私信创建失败',
        });
      });
  },

  onAcceptInvite(e) {
    this._respondInvite(e, true);
  },

  onDeclineInvite(e) {
    this._respondInvite(e, false);
  },

  _respondInvite(e, accept) {
    var roomId =
      (e && e.currentTarget && e.currentTarget.dataset.roomId) || '';
    if (!roomId || this.data.inviteBusyId) return;
    this.setData({ inviteBusyId: roomId });
    var self = this;
    matrixRuntime
      .respondToInvite(roomId, accept)
      .then(function () {
        if (!self._alive) return;
        self.setData({ inviteBusyId: '' });
        if (accept) {
          deepLink.openRoom(roomId).catch(function () {});
        }
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({ inviteBusyId: '' });
        wx.showToast({
          title: (err && err.message) || '操作失败',
          icon: 'none',
        });
      });
  },

  noop() {},
});
