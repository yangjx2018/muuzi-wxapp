const session = require('../../../services/session');
const matrixRuntime = require('../../../services/matrixRuntime');
const matrixMedia = require('../../../services/matrixMedia');
const e2ee = require('../../../services/matrixE2ee');
const deepLink = require('../../../services/messageDeepLink');

var EMOJI_GROUPS = [
  {
    label: '笑脸',
    items:
      '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😍 🥰 😘 😋 😎 🤓 🥳 🤗 🤔 🤫 🤭 🫡'.split(
        ' '
      ),
  },
  {
    label: '心情',
    items:
      '😌 😴 🥱 😪 😔 😢 😭 🥹 🥺 😤 😠 😡 🤯 😱 😨 😰 😥 😓 😵 🤒 🤕 🤧 😇 🫠'.split(
        ' '
      ),
  },
  {
    label: '手势',
    items:
      '👍 👎 👏 🙌 🤝 🙏 💪 ✌️ 🤞 👌 🤟 🤘 👋 🤙 👊 ✊ 🤛 🤜 🫶 👐 🤲 🖐️ 👈 👉'.split(
        ' '
      ),
  },
  {
    label: '爱心',
    items:
      '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💖 💕 💞 💓 💗 💘 💝 💔 ❤️‍🔥 💯 ✅ ❌ ❗ ❓ 💬'.split(
        ' '
      ),
  },
  {
    label: '生活',
    items:
      '☀️ 🌙 ⭐ 🌈 🔥 🌸 🌹 🍀 🐱 🐶 🐼 🦊 🦋 🍎 🍉 🍰 ☕ 🍵 🍻 🎂 🎁 🎉 🎊 🎈'.split(
        ' '
      ),
  },
  {
    label: '工作',
    items:
      '💡 📌 📍 📝 📚 📎 📁 📊 📈 📅 ⏰ ⌛ 💻 📱 📷 🎬 🎨 🎵 🎯 🏆 🚀 ⚡ 🔍 🔗'.split(
        ' '
      ),
  },
];

function formatTime(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    var h = d.getHours();
    var m = d.getMinutes();
    return (
      (h < 10 ? '0' : '') +
      h +
      ':' +
      (m < 10 ? '0' : '') +
      m
    );
  } catch (e) {
    return '';
  }
}

function mediaSrc(msg, cache) {
  if (!msg || !msg.attachment) return '';
  if (msg.previewPath) return msg.previewPath;
  if (msg.attachment.mxc && cache[msg.attachment.mxc]) {
    return cache[msg.attachment.mxc];
  }
  return '';
}

function decorateMessages(list, replyMap, mediaCache) {
  var out = [];
  var cache = mediaCache || Object.create(null);
  for (var i = 0; i < (list || []).length; i++) {
    var msg = list[i];
    var replyPreview = '';
    if (msg.replyTo && replyMap[msg.replyTo]) {
      replyPreview = String(replyMap[msg.replyTo]).slice(0, 80);
    }
    var kind = (msg.attachment && msg.attachment.kind) || '';
    var isImage = kind === 'image';
    var isVideo = kind === 'video';
    var isFile = kind === 'file' || kind === 'audio';
    var src = isImage || isVideo || isFile ? mediaSrc(msg, cache) : '';
    var senderLabel = String(
      msg.senderName || msg.sender || ''
    ).replace(/^@/, '');
    var cut = senderLabel.indexOf(':');
    if (cut > 0) senderLabel = senderLabel.slice(0, cut);
    var senderGlyph = senderLabel ? senderLabel.charAt(0).toUpperCase() : '?';
    out.push(
      Object.assign({}, msg, {
        timeLabel: formatTime(msg.timestamp),
        replyPreview: replyPreview,
        failed: msg.delivery === 'failed',
        sending: msg.delivery === 'sending',
        isImage: isImage,
        isVideo: isVideo,
        isFile: isFile,
        mediaSrc: src,
        imageSrc: isImage ? src : '',
        mediaPending: !!(
          (isImage || isVideo || isFile) &&
          !src &&
          msg.attachment &&
          msg.attachment.mxc
        ),
        fileLabel: isFile
          ? (msg.attachment && msg.attachment.name) || msg.body || '附件'
          : '',
        senderLabel: msg.own ? '我' : senderLabel || '对方',
        senderGlyph: msg.own ? '我' : senderGlyph,
      })
    );
  }
  return out;
}

Page({
  data: {
    roomId: '',
    ready: false,
    name: '',
    subtitle: '',
    kind: '',
    isDirect: false,
    encrypted: false,
    e2eeBanner: '',
    messages: [],
    hasMore: false,
    draft: '',
    replyTo: '',
    replySnippet: '',
    sending: false,
    paging: false,
    error: '',
    showEmoji: false,
    emojiGroups: EMOJI_GROUPS,
    emojiCategory: 0,
    emojis: EMOJI_GROUPS[0].items,
    empty: true,
    chatTab: 'messages',
    displayMessages: [],
    expandedInput: false,
    showAttachMenu: false,
    settingsOpen: false,
    settingsLoading: false,
    settingsBusy: false,
    settingsError: '',
    settingsNotice: '',
    settingsName: '',
    settingsTopic: '',
    settingsInvite: '',
    settingsCanName: false,
    settingsCanTopic: false,
    settingsCanInvite: false,
    settingsMembers: [],
    removeTarget: '',
    keyboardHeight: 0,
    contactOpen: true,
    contactIdentity: null,
    contactRemark: '',
    contactNodeRemark: '',
    contactNotice: '',
    contactFailed: false,
    contactCopyNotice: '',
    contactCopyFailed: false,
  },

  _unsub: null,
  _alive: false,
  _roomId: '',
  _lastReadId: '',
  _mediaCache: null,
  _mediaLoading: null,

  onLoad(query) {
    // 主通道：globalData / storage；query.rid 为纯 hex 兜底
    var roomId = deepLink.resolveOpenRoomId(query || {});
    this._roomId = roomId;
    this._mediaCache = Object.create(null);
    this._mediaLoading = Object.create(null);
    this.setData({ roomId: roomId });
  },

  onBack() {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/messages/index' });
      },
    });
  },

  onChatTab(e) {
    var tab = (e.currentTarget && e.currentTarget.dataset.tab) || 'messages';
    this.setData({ chatTab: tab }, function () {
      this.refresh();
    }.bind(this));
  },

  onToggleExpand() {
    this.setData({ expandedInput: !this.data.expandedInput });
  },

  onToggleAttachMenu() {
    if (this.data.encrypted) {
      this.setData({ error: e2ee.ATTACH_BLOCKED, showAttachMenu: false });
      return;
    }
    this.setData({
      showAttachMenu: !this.data.showAttachMenu,
      showEmoji: false,
    });
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    if (!this._roomId) {
      wx.showToast({ title: '会话无效', icon: 'none' });
      setTimeout(function () {
        wx.navigateBack({ fail: function () {
          wx.switchTab({ url: '/pages/messages/index' });
        }});
      }, 400);
      return;
    }
    matrixRuntime.ensureStarted();
    if (this._unsub) this._unsub();
    this._unsub = matrixRuntime.subscribe(
      function () {
        if (!this._alive) return;
        this.refresh();
      }.bind(this)
    );
    this.refresh();
  },

  onHide() {
    this._alive = false;
    if (this.data.keyboardHeight) {
      this.setData({ keyboardHeight: 0 });
    }
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },

  onUnload() {
    this._alive = false;
    if (this.data.keyboardHeight) {
      this.setData({ keyboardHeight: 0 });
    }
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  },

  onKeyboardHeight(e) {
    var height = (e && e.detail && e.detail.height) || 0;
    if (height === this.data.keyboardHeight) return;
    this.setData({ keyboardHeight: height });
  },

  refresh() {
    var detail = matrixRuntime.getRoomDetail(this._roomId);
    var snap = matrixRuntime.getSnapshot();
    if (!detail) {
      this.setData({
        ready: !!snap.ready,
        name: '对话',
        messages: [],
        empty: true,
        error: snap.ready ? '对话尚未同步或不在列表中' : snap.error || '',
      });
      return;
    }
    var replyMap = Object.create(null);
    for (var i = 0; i < detail.messages.length; i++) {
      replyMap[detail.messages[i].id] = detail.messages[i].body;
      if (detail.messages[i].eventId) {
        replyMap[detail.messages[i].eventId] = detail.messages[i].body;
      }
    }
    var messages = decorateMessages(
      detail.messages,
      replyMap,
      this._mediaCache || Object.create(null)
    );
    var chatTab = this.data.chatTab || 'messages';
    var displayMessages =
      chatTab === 'files'
        ? messages.filter(function (m) {
            return m.isImage || m.isVideo || m.isFile;
          })
        : messages;
    var title = detail.name || '会话';
    try {
      wx.setNavigationBarTitle({ title: title });
    } catch (e) {
      /* ignore */
    }
    this.setData({
      ready: !!snap.ready,
      name: detail.name,
      subtitle: detail.subtitle,
      kind: detail.kind || '',
      isDirect: detail.kind === 'direct',
      encrypted: !!detail.encrypted,
      e2eeBanner: detail.encrypted ? e2ee.BANNER : '',
      messages: messages,
      displayMessages: displayMessages,
      hasMore: !!detail.hasMore,
      empty: messages.length === 0,
      error: '',
    });
    this.maybeMarkRead(messages);
    this.resolveMedia(detail.messages);
  },

  resolveMedia(list) {
    var self = this;
    if (!this._alive || !list || !list.length) return;
    var snap = session.snapshot();
    var homeserver = snap.homeserver || '';
    var accessToken = snap.accessToken || '';
    if (!homeserver || !accessToken) return;
    for (var i = 0; i < list.length; i++) {
      var msg = list[i];
      if (
        !msg.attachment ||
        !msg.attachment.mxc ||
        msg.previewPath ||
        (msg.attachment.kind !== 'image' &&
          msg.attachment.kind !== 'video' &&
          msg.attachment.kind !== 'file' &&
          msg.attachment.kind !== 'audio')
      ) {
        continue;
      }
      var mxc = msg.attachment.mxc;
      if (this._mediaCache[mxc] || this._mediaLoading[mxc]) continue;
      this._mediaLoading[mxc] = true;
      (function (key) {
        matrixMedia
          .downloadToTemp({
            homeserver: homeserver,
            accessToken: accessToken,
            mxc: key,
          })
          .then(function (path) {
            delete self._mediaLoading[key];
            if (!self._alive) return;
            self._mediaCache[key] = path;
            self.refresh();
          })
          .catch(function () {
            delete self._mediaLoading[key];
          });
      })(mxc);
    }
  },

  maybeMarkRead(messages) {
    if (!messages || !messages.length) return;
    var last = null;
    for (var i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].own && messages[i].eventId) {
        last = messages[i];
        break;
      }
    }
    if (!last || last.eventId === this._lastReadId) return;
    this._lastReadId = last.eventId;
    matrixRuntime.markRead(this._roomId, last.eventId).catch(function () {});
  },

  onLoadOlder() {
    if (this.data.paging || !this.data.hasMore) return;
    this.setData({ paging: true, error: '' });
    var self = this;
    matrixRuntime
      .loadOlder(this._roomId)
      .then(function () {
        self.setData({ paging: false });
        self.refresh();
      })
      .catch(function (err) {
        self.setData({
          paging: false,
          error: (err && err.message) || '历史消息加载失败',
        });
      });
  },

  onDraftInput(e) {
    this.setData({ draft: (e.detail && e.detail.value) || '' });
  },

  onToggleEmoji() {
    this.setData({
      showEmoji: !this.data.showEmoji,
      showAttachMenu: false,
    });
  },

  onEmojiCategory(e) {
    var idx = Number(e.currentTarget.dataset.index);
    var group = EMOJI_GROUPS[idx];
    if (!group) return;
    this.setData({
      emojiCategory: idx,
      emojis: group.items,
    });
  },

  onPickEmoji(e) {
    var emoji = e.currentTarget.dataset.emoji || '';
    if (!emoji) return;
    var draft = this.data.draft || '';
    if (draft.length + emoji.length > 10000) return;
    this.setData({ draft: draft + emoji });
  },

  onReply(e) {
    var id = e.currentTarget.dataset.id || '';
    var body = e.currentTarget.dataset.body || '';
    var eventId = e.currentTarget.dataset.eventId || id;
    if (!eventId) return;
    this.setData({
      replyTo: eventId,
      replySnippet: String(body).slice(0, 80),
    });
  },

  onCancelReply() {
    this.setData({ replyTo: '', replySnippet: '' });
  },

  onAttach() {
    this.onToggleAttachMenu();
  },

  onPickPhotos() {
    this.setData({ showAttachMenu: false });
    if (this.data.sending) return;
    if (this.data.encrypted) {
      this.setData({ error: e2ee.ATTACH_BLOCKED });
      return;
    }
    var self = this;
    wx.showActionSheet({
      itemList: ['图片', '视频'],
      success: function (res) {
        if (res.tapIndex === 0) self.pickImage();
        else if (res.tapIndex === 1) self.pickVideo();
      },
    });
  },

  onPickDocs() {
    this.setData({ showAttachMenu: false });
    if (this.data.sending) return;
    if (this.data.encrypted) {
      this.setData({ error: e2ee.ATTACH_BLOCKED });
      return;
    }
    this.pickFile();
  },

  sendPicked(file) {
    var self = this;
    if (!file || !file.filePath) {
      this.setData({ error: '未选择附件' });
      return;
    }
    if (
      typeof file.size === 'number' &&
      file.size > matrixMedia.MAX_ATTACHMENT_BYTES
    ) {
      this.setData({
        error: matrixMedia.oversizeMessage(
          matrixMedia.msgtypeForMime(
            matrixMedia.attachmentMime(file.mimetype || '', file.name || '')
          )
        ),
      });
      return;
    }
    this.setData({ sending: true, error: '', showEmoji: false });
    matrixRuntime
      .sendAttachment(this._roomId, file)
      .then(function () {
        self.setData({ sending: false });
        self.refresh();
      })
      .catch(function (err) {
        self.setData({
          sending: false,
          error: (err && err.message) || '附件发送失败',
        });
        self.refresh();
      });
  },

  pickImage() {
    var self = this;
    var pick = function (files) {
      var file = files && files[0];
      if (!file || !file.tempFilePath) {
        self.setData({ error: '未选择图片' });
        return;
      }
      self.sendPicked({
        filePath: file.tempFilePath,
        name: matrixMedia.basename(file.tempFilePath, 'image.jpg'),
        size: file.size,
        width: file.width,
        height: file.height,
        mimetype:
          file.fileType === 'image'
            ? 'image/jpeg'
            : matrixMedia.guessMime(file.tempFilePath, 'image/jpeg'),
      });
    };
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success: function (res) {
          pick(res.tempFiles || []);
        },
        fail: function (err) {
          var msg = (err && err.errMsg) || '';
          if (/cancel/i.test(msg)) return;
          self.setData({ error: '无法打开相册或相机' });
        },
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var paths = res.tempFilePaths || [];
        pick(
          paths.map(function (p) {
            return { tempFilePath: p };
          })
        );
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        self.setData({ error: '无法打开相册或相机' });
      },
    });
  },

  pickVideo() {
    var self = this;
    if (typeof wx.chooseMedia !== 'function') {
      this.setData({ error: '当前基础库不支持选择视频' });
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success: function (res) {
        var file = (res.tempFiles || [])[0];
        if (!file || !file.tempFilePath) {
          self.setData({ error: '未选择视频' });
          return;
        }
        self.sendPicked({
          filePath: file.tempFilePath,
          name: matrixMedia.basename(file.tempFilePath, 'video.mp4'),
          size: file.size,
          width: file.width,
          height: file.height,
          duration: file.duration,
          mimetype: 'video/mp4',
        });
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        self.setData({ error: '无法打开相册或相机' });
      },
    });
  },

  pickFile() {
    var self = this;
    if (typeof wx.chooseMessageFile !== 'function') {
      this.setData({ error: '当前基础库不支持选择文件' });
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: function (res) {
        var file = (res.tempFiles || [])[0];
        if (!file || !file.path) {
          self.setData({ error: '未选择文件' });
          return;
        }
        self.sendPicked({
          filePath: file.path,
          name: file.name || matrixMedia.basename(file.path, 'file'),
          size: file.size,
          mimetype: matrixMedia.attachmentMime('', file.name || file.path),
        });
      },
      fail: function (err) {
        var msg = (err && err.errMsg) || '';
        if (/cancel/i.test(msg)) return;
        self.setData({ error: '无法选择文件' });
      },
    });
  },

  onPreviewImage(e) {
    var src = e.currentTarget.dataset.src || '';
    if (!src) return;
    var urls = [];
    var messages = this.data.messages || [];
    for (var i = 0; i < messages.length; i++) {
      if (messages[i].imageSrc) urls.push(messages[i].imageSrc);
    }
    wx.previewImage({
      current: src,
      urls: urls.length ? urls : [src],
    });
  },

  onOpenFile(e) {
    var src = e.currentTarget.dataset.src || '';
    var name = e.currentTarget.dataset.name || '';
    if (!src) {
      this.setData({ error: '文件尚未下载完成' });
      return;
    }
    wx.openDocument({
      filePath: src,
      showMenu: true,
      fail: function () {
        wx.showToast({
          title: name ? '无法打开 ' + name : '无法打开文件',
          icon: 'none',
        });
      },
    });
  },

  onSend() {
    if (this.data.sending) return;
    var draft = (this.data.draft || '').trim();
    if (!draft) return;
    this.setData({ sending: true, error: '', showEmoji: false });
    var replyTo = this.data.replyTo || '';
    var self = this;
    matrixRuntime
      .sendText(this._roomId, draft, replyTo || undefined)
      .then(function () {
        self.setData({
          sending: false,
          draft: '',
          replyTo: '',
          replySnippet: '',
        });
        self.refresh();
      })
      .catch(function (err) {
        self.setData({
          sending: false,
          error: (err && err.message) || '发送失败',
        });
        self.refresh();
      });
  },

  onRetry(e) {
    var id = e.currentTarget.dataset.id || '';
    if (!id) return;
    var self = this;
    matrixRuntime
      .retryMessage(this._roomId, id)
      .then(function () {
        self.refresh();
      })
      .catch(function (err) {
        self.setData({
          error: (err && err.message) || '重试失败',
        });
        self.refresh();
      });
  },

  openSettings() {
    this.setData({
      settingsOpen: true,
      settingsError: '',
      settingsNotice: '',
      removeTarget: '',
      contactNotice: '',
      contactFailed: false,
      contactCopyNotice: '',
      contactCopyFailed: false,
    });
    this.loadContactIdentity();
    this.loadSettings();
  },

  closeSettings() {
    if (this.data.settingsBusy) return;
    this.setData({
      settingsOpen: false,
      removeTarget: '',
      settingsError: '',
      settingsNotice: '',
      contactIdentity: null,
      contactNotice: '',
      contactCopyNotice: '',
    });
  },

  loadContactIdentity() {
    var identity = null;
    var detail = null;
    try {
      detail = matrixRuntime.getRoomDetail(this._roomId);
      identity = matrixRuntime.getContactIdentity(this._roomId);
    } catch (e) {
      identity = null;
    }
    this.setData({
      isDirect: !!(detail && detail.kind === 'direct'),
      encrypted: !!(detail && detail.encrypted),
      contactIdentity: identity,
      contactOpen: !!identity,
      contactRemark: identity ? identity.remark || '' : '',
      contactNodeRemark: identity ? identity.nodeRemark || '' : '',
      contactNotice: '',
      contactFailed: false,
    });
  },

  toggleContactOpen() {
    this.setData({ contactOpen: !this.data.contactOpen });
  },

  onContactRemark(e) {
    this.setData({
      contactRemark: e.detail.value,
      contactNotice: '',
      contactFailed: false,
    });
  },

  onContactNodeRemark(e) {
    this.setData({
      contactNodeRemark: e.detail.value,
      contactNotice: '',
      contactFailed: false,
    });
  },

  cancelContactEdit() {
    var identity = this.data.contactIdentity;
    this.setData({
      contactRemark: identity ? identity.remark || '' : '',
      contactNodeRemark: identity ? identity.nodeRemark || '' : '',
      contactNotice: '',
      contactFailed: false,
    });
  },

  saveContactLabels() {
    var identity = this.data.contactIdentity;
    if (!identity || this.data.settingsBusy) return;
    var self = this;
    this.setData({
      settingsBusy: true,
      contactNotice: '',
      contactFailed: false,
      settingsError: '',
    });
    matrixRuntime
      .saveContactLabels(
        identity.userId,
        this.data.contactRemark,
        this.data.contactNodeRemark
      )
      .then(function () {
        if (!self._alive) return;
        var next = matrixRuntime.getContactIdentity(self._roomId);
        self.setData({
          settingsBusy: false,
          contactIdentity: next,
          contactRemark: next ? next.remark || '' : self.data.contactRemark,
          contactNodeRemark: next
            ? next.nodeRemark || ''
            : self.data.contactNodeRemark,
          contactNotice: '备注已保存',
          contactFailed: false,
        });
        self.refresh();
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          settingsBusy: false,
          contactNotice: '备注未保存，请检查本机存储与网络后重试。',
          contactFailed: true,
        });
      });
  },

  copyContactAccount() {
    var identity = this.data.contactIdentity;
    if (!identity || !identity.userId) return;
    var self = this;
    wx.setClipboardData({
      data: identity.userId,
      success: function () {
        self.setData({
          contactCopyNotice: '账号已复制',
          contactCopyFailed: false,
        });
      },
      fail: function () {
        self.setData({
          contactCopyNotice: '复制失败，可长按账号文字复制。',
          contactCopyFailed: true,
        });
      },
    });
  },

  loadSettings() {
    var self = this;
    if (!this._roomId) return;
    this.setData({ settingsLoading: true, settingsError: '' });
    matrixRuntime
      .readRoomSettings(this._roomId)
      .then(function (value) {
        if (!self._alive) return;
        self.setData({
          settingsLoading: false,
          settingsName: value.name || '',
          settingsTopic: value.topic || '',
          settingsCanName: !!value.canName,
          settingsCanTopic: !!value.canTopic,
          settingsCanInvite: !!value.canInvite,
          settingsMembers: value.members || [],
          settingsError: '',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          settingsLoading: false,
          settingsError: (err && err.message) || '读取失败',
        });
      });
  },

  onSettingsName(e) {
    this.setData({ settingsName: e.detail.value });
  },
  onSettingsTopic(e) {
    this.setData({ settingsTopic: e.detail.value });
  },
  onSettingsInvite(e) {
    this.setData({ settingsInvite: e.detail.value });
  },

  settingsAct(work, success) {
    var self = this;
    if (this.data.settingsBusy) return Promise.resolve();
    this.setData({ settingsBusy: true, settingsError: '', settingsNotice: '' });
    return Promise.resolve()
      .then(work)
      .then(function () {
        if (!self._alive) return;
        self.setData({ settingsNotice: success || '已更新' });
      })
      .catch(function (err) {
        if (self._alive) {
          self.setData({
            settingsError: (err && err.message) || '操作失败，请重试',
          });
        }
      })
      .then(function () {
        if (self._alive) self.setData({ settingsBusy: false });
      });
  },

  saveSettingsName() {
    var self = this;
    this.settingsAct(function () {
      return matrixRuntime
        .updateRoomSettings(self._roomId, 'name', self.data.settingsName)
        .then(function () {
          return self.loadSettings();
        });
    }, '群名称已保存');
  },

  saveSettingsTopic() {
    var self = this;
    this.settingsAct(function () {
      return matrixRuntime
        .updateRoomSettings(self._roomId, 'topic', self.data.settingsTopic)
        .then(function () {
          return self.loadSettings();
        });
    }, '介绍已保存');
  },

  sendInvite() {
    var self = this;
    var peer = (this.data.settingsInvite || '').trim();
    if (!peer) return;
    this.settingsAct(function () {
      return matrixRuntime.inviteRoomMember(self._roomId, peer).then(function () {
        if (self._alive) self.setData({ settingsInvite: '' });
        return self.loadSettings();
      });
    }, '邀请已发送，等待对方接受');
  },

  askRemoveMember(e) {
    var id = e.currentTarget.dataset.id || '';
    if (!id) return;
    this.setData({ removeTarget: id });
  },

  cancelRemoveMember() {
    if (this.data.settingsBusy) return;
    this.setData({ removeTarget: '' });
  },

  confirmRemoveMember() {
    var self = this;
    var target = this.data.removeTarget;
    if (!target) return;
    this.settingsAct(function () {
      return matrixRuntime
        .removeRoomMember(self._roomId, target)
        .then(function () {
          if (!self._alive) return;
          var next = (self.data.settingsMembers || []).filter(function (m) {
            return m.id !== target;
          });
          self.setData({ settingsMembers: next, removeTarget: '' });
        });
    }, '成员已移出');
  },
});
