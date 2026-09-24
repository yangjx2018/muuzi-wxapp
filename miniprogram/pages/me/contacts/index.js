const session = require('../../../services/session');
const creator = require('../../../services/creator');
const matrixRuntime = require('../../../services/matrixRuntime');
const deepLink = require('../../../services/messageDeepLink');
const nodeInbox = require('../../../services/nodeInbox');

var STATUS_NAMES = {
  new: '未读',
  read: '已读',
  closed: '已关闭',
  reported: '已举报',
};

var MODE_OPTIONS = [
  { value: 'body', label: '留言正文' },
  { value: 'notification', label: '仅通知，回收件箱查看正文' },
];

Page({
  data: {
    settingsOpen: false,
    loading: true,
    busy: false,
    note: '',
    items: [],
    nextAfter: '',
    enabled: false,
    notification: {
      email: '',
      verified_at: null,
      enabled: false,
      verification_pending: false,
    },
    email: '',
    code: '',
    owner: '',
    inboxRoomId: '',
    matrixReady: false,
    inbox: null,
    inboxAvailable: false,
    inboxBound: false,
    inboxMode: 'body',
    inboxModeIndex: 0,
    inboxModeLabels: MODE_OPTIONS.map(function (o) {
      return o.label;
    }),
    channelBusy: false,
    channelNote: '',
  },
  _alive: true,
  _token: '',
  _channelLock: false,
  _matrixUnsub: null,

  onLoad(query) {
    this.setData({ owner: (query && query.owner) || '' });
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    matrixRuntime.ensureStarted();
    // 对齐 App ContactsScreen：matrix.ready 翻转后需刷新连接按钮/频道入口
    if (this._matrixUnsub) this._matrixUnsub();
    this._matrixUnsub = matrixRuntime.subscribe(
      function () {
        if (!this._alive) return;
        this.syncInboxRoom();
      }.bind(this)
    );
    this.syncInboxRoom();
    this.load();
  },
  onHide() {
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

  syncInboxRoom() {
    var snap = matrixRuntime.getSnapshot();
    var inboxRoomId = '';
    if (snap && snap.workspaces) {
      for (var i = 0; i < snap.workspaces.length; i++) {
        if (
          snap.workspaces[i].key === 'business' &&
          snap.workspaces[i].inboxChannelId
        ) {
          inboxRoomId = snap.workspaces[i].inboxChannelId;
          break;
        }
      }
    }
    this.setData({
      matrixReady: !!(snap && snap.ready),
      inboxRoomId: inboxRoomId,
    });
  },

  openInboxChannel() {
    var roomId = this.data.inboxRoomId;
    if (!roomId) {
      wx.showToast({
        title: this.data.matrixReady
          ? '留言频道尚未就绪'
          : '消息同步尚未就绪',
        icon: 'none',
      });
      return;
    }
    deepLink.openRoom(roomId).catch(function () {
      wx.showToast({ title: '无法打开留言频道', icon: 'none' });
    });
  },

  goBack() {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/me/index' });
      },
    });
  },

  openList() {
    this.setData({ settingsOpen: false });
  },
  openSettings() {
    this.setData({ settingsOpen: true });
  },

  decorate(items) {
    return (items || []).map(function (item) {
      return Object.assign({}, item, {
        statusLabel: STATUS_NAMES[item.status] || item.status,
        createdLabel: item.created_at || '',
      });
    });
  },

  applyInbox(config) {
    var mode =
      config && config.binding && config.binding.mode
        ? config.binding.mode
        : this.data.inboxMode || 'body';
    if (mode !== 'body' && mode !== 'notification') mode = 'body';
    var modeIndex = 0;
    for (var i = 0; i < MODE_OPTIONS.length; i++) {
      if (MODE_OPTIONS[i].value === mode) {
        modeIndex = i;
        break;
      }
    }
    this.setData({
      inbox: config,
      inboxAvailable: !!(config && config.available),
      inboxBound: !!(config && config.binding && config.binding.enabled),
      inboxMode: mode,
      inboxModeIndex: modeIndex,
    });
  },

  load() {
    var self = this;
    var owner = this.data.owner;
    self.setData({ loading: true, note: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        var tasks = [
          creator.fetchContacts(opened.token, owner),
          creator.fetchContactSettings(opened.token, owner),
          creator.fetchContactNotifications(opened.token),
        ];
        if (!owner) {
          tasks.push(
            creator
              .platformRequest(opened.token, '/api/creator/node-inbox')
              .catch(function () {
                return null;
              })
          );
        }
        return Promise.all(tasks);
      })
      .then(function (bundle) {
        if (!self._alive) return;
        var list = bundle[0] || {};
        var settings = bundle[1] || {};
        var notify = bundle[2] || {};
        self.setData({
          loading: false,
          items: self.decorate(list.items),
          nextAfter: list.next_after || '',
          enabled: !!settings.contact_enabled,
          notification: {
            email: notify.email || '',
            verified_at: notify.verified_at || null,
            enabled: !!notify.enabled,
            verification_pending: !!notify.verification_pending,
          },
        });
        if (!owner) self.applyInbox(bundle[3] || null);
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          note: (err && err.message) || '读取失败',
        });
      });
  },

  act(work, message) {
    var self = this;
    if (this.data.busy || !this._token) return Promise.resolve();
    this.setData({ busy: true, note: '' });
    return Promise.resolve()
      .then(work)
      .then(function () {
        if (!self._alive) return;
        return self.reloadQuiet().then(function () {
          if (self._alive) self.setData({ note: message || '已更新' });
        });
      })
      .catch(function (err) {
        if (self._alive) {
          self.setData({ note: (err && err.message) || '操作失败' });
        }
      })
      .then(function () {
        if (self._alive) self.setData({ busy: false });
      });
  },

  reloadQuiet() {
    var self = this;
    var owner = this.data.owner;
    var tasks = [
      creator.fetchContacts(this._token, owner),
      creator.fetchContactSettings(this._token, owner),
      creator.fetchContactNotifications(this._token),
    ];
    if (!owner) {
      tasks.push(
        creator
          .platformRequest(this._token, '/api/creator/node-inbox')
          .catch(function () {
            return null;
          })
      );
    }
    return Promise.all(tasks).then(function (bundle) {
      if (!self._alive) return;
      var list = bundle[0] || {};
      var settings = bundle[1] || {};
      var notify = bundle[2] || {};
      self.setData({
        items: self.decorate(list.items),
        nextAfter: list.next_after || '',
        enabled: !!settings.contact_enabled,
        notification: {
          email: notify.email || '',
          verified_at: notify.verified_at || null,
          enabled: !!notify.enabled,
          verification_pending: !!notify.verification_pending,
        },
      });
      if (!owner) self.applyInbox(bundle[3] || null);
      self.syncInboxRoom();
    });
  },

  onInboxMode(e) {
    if (this.data.inboxBound || this.data.channelBusy) return;
    var index = Number(e.detail.value);
    if (!Number.isFinite(index) || index < 0 || index >= MODE_OPTIONS.length) {
      return;
    }
    this.setData({
      inboxModeIndex: index,
      inboxMode: MODE_OPTIONS[index].value,
    });
  },

  prepareChannel(disconnect) {
    var self = this;
    var accountSession = session.snapshot();
    var accountToken = this._token;
    var config = this.data.inbox;
    var matrixReady = !!(matrixRuntime.getSnapshot() || {}).ready;
    if (
      !accountSession.signedIn ||
      (!disconnect && !matrixReady) ||
      !config ||
      !accountToken ||
      this._channelLock
    ) {
      return;
    }
    var active = function () {
      return (
        self._alive &&
        session.snapshot().matrixUserId === accountSession.matrixUserId
      );
    };
    this._channelLock = true;
    this.setData({ channelBusy: true, channelNote: '' });
    Promise.resolve()
      .then(function () {
        if (disconnect) {
          return creator
            .platformRequest(accountToken, '/api/creator/node-inbox', 'DELETE')
            .then(function () {
              if (!active()) return;
              var next = Object.assign({}, config, {
                binding: config.binding
                  ? Object.assign({}, config.binding, { enabled: false })
                  : null,
              });
              self.applyInbox(next);
              return nodeInbox
                .nodeInboxBinding(
                  accountSession,
                  config,
                  'DELETE',
                  undefined,
                  active
                )
                .then(function () {
                  if (active()) {
                    self.setData({
                      channelNote:
                        '已停止接收新留言，已投递内容将由节点撤回。',
                    });
                  }
                });
            });
        }
        var node = nodeInbox.selectedInboxNode(accountSession, config);
        return matrixRuntime
          .ensurePersonalInbox(node.sender_id)
          .then(function (room) {
            if (!active()) return;
            return nodeInbox
              .nodeInboxBinding(
                accountSession,
                config,
                'PUT',
                { room_id: room, mode: self.data.inboxMode },
                active
              )
              .then(function (binding) {
                if (!active()) return;
                return creator
                  .platformRequest(
                    accountToken,
                    '/api/creator/node-inbox',
                    'PUT',
                    {
                      binding_id: binding.binding_id,
                      mode: binding.mode,
                    }
                  )
                  .then(function (saved) {
                    if (!active()) return;
                    self.applyInbox(saved);
                    self.syncInboxRoom();
                    self.setData({
                      channelNote:
                        '已连接私人频道。从现在起接收新留言，历史留言保留在收件箱。',
                    });
                  });
              });
          });
      })
      .catch(function () {
        if (active()) {
          self.setData({
            channelNote: disconnect
              ? '关闭连接尚未完全确认，请稍后重试。'
              : '频道暂未连接。请稍后重试；节点接收账号需要先加入私人频道。现有留言不受影响。',
          });
        }
      })
      .then(function () {
        self._channelLock = false;
        if (self._alive) self.setData({ channelBusy: false });
      });
  },

  connectInbox() {
    this.prepareChannel(false);
  },

  disconnectInbox() {
    this.prepareChannel(true);
  },

  toggleEnabled() {
    var self = this;
    var next = !this.data.enabled;
    this.act(function () {
      return creator.saveContactSettings(self._token, self.data.owner, {
        contact_enabled: next,
      });
    }, next ? '已开启公开留言' : '已关闭公开留言');
  },

  mark(e) {
    var id = e.currentTarget.dataset.id;
    var status = e.currentTarget.dataset.status;
    var self = this;
    this.act(function () {
      return creator.patchContact(self._token, id, self.data.owner, {
        status: status,
      });
    }, status === 'reported' ? '已举报，交由安全人员处理' : '已更新');
  },

  remove(e) {
    var id = e.currentTarget.dataset.id;
    var self = this;
    wx.showModal({
      title: '删除留言',
      content: '删除后无法恢复，确定吗？',
      success: function (res) {
        if (!res.confirm) return;
        self.act(function () {
          return creator.deleteContact(self._token, id, self.data.owner);
        }, '已删除');
      },
    });
  },

  loadMore() {
    var self = this;
    if (this.data.busy || !this.data.nextAfter) return;
    this.setData({ busy: true });
    creator
      .fetchContacts(this._token, this.data.owner, this.data.nextAfter)
      .then(function (list) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          items: self.data.items.concat(self.decorate(list.items)),
          nextAfter: list.next_after || '',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          note: (err && err.message) || '加载失败',
        });
      });
  },

  onEmail(e) {
    this.setData({ email: e.detail.value });
  },
  onCode(e) {
    this.setData({ code: String(e.detail.value || '').trim() });
  },

  requestVerify() {
    var self = this;
    this.act(function () {
      return creator.requestContactNotifyVerify(self._token, self.data.email);
    }, '验证邮件已排队，请查收；排队不表示送达');
  },

  verifyEmail() {
    var self = this;
    this.act(function () {
      return creator.verifyContactNotify(self._token, self.data.code).then(
        function () {
          if (self._alive) self.setData({ code: '', email: '' });
        }
      );
    }, '邮箱已验证，请按需开启通知');
  },

  toggleNotify() {
    var self = this;
    var next = !this.data.notification.enabled;
    this.act(function () {
      return creator.saveContactNotifications(self._token, { enabled: next });
    });
  },

  removeEmail() {
    var self = this;
    this.act(function () {
      return creator.deleteContactNotifications(self._token);
    }, '已移除通知邮箱');
  },
});
