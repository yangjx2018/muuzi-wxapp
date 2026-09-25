/**
 * App-parity FieldHostInvite for mini program (embedded in Talk + Host page).
 * 扫码交流态：语言切换 + 气泡列表 + 自动翻译 · 对齐 FieldHostInvite.tsx
 */
var session = require('../../services/session');
var creator = require('../../services/creator');
var fieldNodeApi = require('../../services/fieldNodeApi');
var fieldCaps = require('../../services/fieldCapabilities');
var fieldEncounters = require('../../services/fieldEncounters');
var fieldHostDelivery = require('../../services/fieldHostDelivery');
var fieldSpeech = require('../../services/fieldSpeech');
var fieldChatTranslation = require('../../services/fieldChatTranslation');
var matrixRuntime = require('../../services/matrixRuntime');
var idempotency = require('../../utils/idempotency');
var deepLink = require('../../services/messageDeepLink');
var qrcodeDraw = require('../../utils/qrcode-draw');
var store = require('../../adapters/secure-store');
var cryptoUtil = require('../../utils/field-crypto');

function scanStateOf(roomId, inviteStatus, hasUrl, chatting) {
  if (!roomId) return '准备话题';
  if (inviteStatus === 'pending') return '待你确认';
  if (chatting) return '交流中';
  if (hasUrl) return '等待扫码';
  return '未开始';
}

function expiresLabelOf(expiresAt) {
  if (!expiresAt) return '';
  try {
    var d = new Date(expiresAt);
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  } catch (e) {
    return '';
  }
}

function clockLabel(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  } catch (e) {
    return '';
  }
}

/** scroll-into-view / wx:key 不能含 $ : 等 Matrix event_id 字符 */
function safeDomId(eventId) {
  return String(eventId || '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 120);
}

function langIndexOf(options, code) {
  for (var i = 0; i < options.length; i++) {
    if (options[i].value === code) return i;
  }
  return 0;
}

function langHintOf(mine, guest, translateReady, translateOn) {
  if (mine === guest) return '双方使用同一语言，按原文显示。';
  if (!translateReady) return '翻译服务尚未开放，客户文字按原文显示。';
  if (!translateOn) {
    return '开启后，客户的文字会交给 Google 翻译成你选的语言，原文始终保留。';
  }
  return '';
}

function chipDisabledOf(mine, guest, translateReady) {
  return !translateReady || mine === guest;
}

/** 用户可操作错误文案；后台轮询失败不得盖住开通提示。 */
function explainFieldError(err) {
  var code = (err && err.code) || '';
  var msg = (err && err.message) || '';
  if (code === 'ACCESS_DENIED') {
    return '这个账号还没开通扫码交流，请联系节点管理员开通。';
  }
  if (msg === 'ROOM_NOT_READY') {
    return '现场话题尚未就绪，请稍候再生成二维码。';
  }
  if (msg === 'INVITE_CHANGED') {
    return '邀请状态已变化，请再点一次生成二维码。';
  }
  if (code === 'FIELD_AUTH_REQUIRED' || /token|登录|鉴权/i.test(msg)) {
    return '登录已失效，请重新登录后再生成二维码。';
  }
  if (code === 'TOPIC_OCCUPIED') {
    return '该现场话题正被其它扫码交流占用，请结束旧交流或新开话题。';
  }
  if (code === 'RATE_LIMITED') {
    return '操作过于频繁，请稍后再试。';
  }
  if (code === 'NETWORK') {
    return msg || '网络异常，请检查后重试。';
  }
  return '暂未完成，请重试原操作。不会自动重新邀请或重复发送。';
}

Component({
  properties: {
    roomId: { type: String, value: '' },
    allowCreate: { type: Boolean, value: true },
  },

  data: {
    enabled: false,
    busy: false,
    notice: '检查扫码交流服务…',
    inviteStatus: '',
    inviteGuestName: '',
    inviteActive: false,
    chatting: false,
    url: '',
    qrPath: '',
    draft: '',
    pendingText: '',
    canSend: false,
    mine: 'zh',
    guest: 'en',
    mineIndex: 0,
    guestIndex: 1,
    mineLabel: '中文（普通话）',
    guestLabel: 'English · 英语',
    langOptions: fieldSpeech.speechLanguageOptions(),
    translateOn: false,
    translateReady: false,
    chipDisabled: true,
    langHint: langHintOf('zh', 'en', false, false),
    chatMessages: [],
    chatAnchor: '',
    chatPanePx: 280,
    saveNote: '',
    scanState: '准备话题',
    expiresLabel: '',
  },

  lifetimes: {
    attached: function () {
      this._alive = true;
      try {
        var sys = wx.getSystemInfoSync();
        var h = Math.round((sys.windowHeight || 667) * 0.42);
        this.setData({ chatPanePx: Math.max(160, Math.min(h, 420)) });
      } catch (e) {
        /* keep default */
      }
      this._queue = Promise.resolve();
      this._actionQueued = false;
      this._working = false;
      this._invite = null;
      this._requestId = '';
      this._delivery = null;
      this._timer = null;
      this._call = null;
      this._node = null;
      this._bootSig = '';
      this._translations = Object.create(null);
      this._requestedTx = Object.create(null);
      this._localEchoes = [];
      this._matrixUnsub = null;
      this._translateGen = 0;
      var opts = fieldSpeech.speechLanguageOptions();
      this.setData({
        langOptions: opts,
        mineIndex: langIndexOf(opts, 'zh'),
        guestIndex: langIndexOf(opts, 'en'),
        mineLabel: fieldSpeech.speechLanguages.zh,
        guestLabel: fieldSpeech.speechLanguages.en,
      });
      this.bindMatrix();
      this.loadTranslateReady();
    },
    ready: function () {
      if (!this._bootSig) this.rebootIfNeeded(true);
    },
    detached: function () {
      this._alive = false;
      if (this._timer) clearTimeout(this._timer);
      if (this._matrixUnsub) {
        this._matrixUnsub();
        this._matrixUnsub = null;
      }
    },
  },

  observers: {
    'roomId, allowCreate': function () {
      this.rebootIfNeeded(false);
    },
  },

  methods: {
    bindMatrix: function () {
      var self = this;
      if (this._matrixUnsub) {
        this._matrixUnsub();
        this._matrixUnsub = null;
      }
      matrixRuntime.ensureStarted();
      this._matrixUnsub = matrixRuntime.subscribe(function () {
        if (!self._alive) return;
        self.syncChatMessages();
        self.queueGuestTranslations();
      });
      this.syncChatMessages();
      this.queueGuestTranslations();
    },

    loadTranslateReady: function () {
      var self = this;
      if (!session.isSignedIn()) {
        this.setData({
          translateReady: false,
          chipDisabled: chipDisabledOf(this.data.mine, this.data.guest, false),
          langHint: langHintOf(
            this.data.mine,
            this.data.guest,
            false,
            this.data.translateOn
          ),
        });
        return;
      }
      creator
        .loadCreatorSession(session.snapshot())
        .then(function (opened) {
          return fieldEncounters.fieldCapabilities(opened.token);
        })
        .then(function (cap) {
          if (!self._alive) return;
          var ready = !!(cap && cap.speech);
          self.setData({
            translateReady: ready,
            chipDisabled: chipDisabledOf(self.data.mine, self.data.guest, ready),
            langHint: langHintOf(
              self.data.mine,
              self.data.guest,
              ready,
              self.data.translateOn
            ),
          });
          self.syncChatMessages();
          self.queueGuestTranslations();
        })
        .catch(function () {
          if (!self._alive) return;
          self.setData({
            translateReady: false,
            chipDisabled: chipDisabledOf(self.data.mine, self.data.guest, false),
            langHint: langHintOf(
              self.data.mine,
              self.data.guest,
              false,
              self.data.translateOn
            ),
          });
        });
    },

    syncChatMessages: function () {
      if (!this._alive) return;
      var roomId = this.data.roomId;
      var chatting =
        this.data.inviteStatus === 'approved' && this.data.inviteActive;
      if (!roomId || !chatting) {
        if (this.data.chatMessages.length || this.data.chatting) {
          this.setData({ chatMessages: [], chatAnchor: '', chatting: false });
        }
        return;
      }
      var detail = matrixRuntime.getRoomDetail(roomId);
      var raw = (detail && detail.messages) || [];
      var byId = Object.create(null);
      var merged = [];
      var i;
      for (i = 0; i < raw.length; i++) {
        if (!raw[i] || !raw[i].id) continue;
        byId[raw[i].id] = raw[i];
        merged.push(raw[i]);
      }
      var echoes = this._localEchoes || [];
      for (i = 0; i < echoes.length; i++) {
        var echo = echoes[i];
        if (!echo || !echo.id || byId[echo.id]) continue;
        byId[echo.id] = echo;
        merged.push(echo);
      }
      merged.sort(function (a, b) {
        return (a.timestamp || 0) - (b.timestamp || 0);
      });
      var mine = this.data.mine;
      var guest = this.data.guest;
      var translateReady = this.data.translateReady;
      var translateOn = this.data.translateOn;
      var translations = this._translations || Object.create(null);
      var out = [];
      for (i = 0; i < merged.length; i++) {
        var m = merged[i];
        // K-24：当面 field.record 不得进入扫码气泡（双保险：helper + 正文特征）
        if (!fieldChatTranslation.isScanChatMessage(m)) continue;
        if (
          /现场交流/.test(String(m.body || '')) &&
          /的设备记录/.test(String(m.body || ''))
        ) {
          continue;
        }
        var decision = fieldChatTranslation.translationDecision({
          own: !!m.own,
          source: guest,
          target: mine,
          available: translateReady,
          enabled: translateOn,
        });
        var state = translations[m.id];
        var label = fieldChatTranslation.translationLabel(
          decision,
          state && state.state
        );
        out.push({
          id: m.id,
          domId: safeDomId(m.id),
          own: !!m.own,
          body: m.body,
          timeLabel: clockLabel(m.timestamp),
          translated:
            decision === 'translate' &&
            state &&
            state.state === 'done' &&
            state.text
              ? state.text
              : '',
          label: label,
          canRetry: decision === 'translate' && state && state.state === 'failed',
        });
      }
      var anchor = out.length ? 'msg-' + out[out.length - 1].domId : '';
      this.setData({
        chatting: true,
        chatMessages: out,
        chatAnchor: anchor,
      });
    },

    queueGuestTranslations: function () {
      var self = this;
      if (
        !this._alive ||
        !this.data.translateOn ||
        !this.data.translateReady ||
        this.data.mine === this.data.guest
      ) {
        return;
      }
      var roomId = this.data.roomId;
      var detail = matrixRuntime.getRoomDetail(roomId);
      var raw = (detail && detail.messages) || [];
      var mine = this.data.mine;
      var guest = this.data.guest;
      var waiting = [];
      for (var i = 0; i < raw.length; i++) {
        var m = raw[i];
        if (!fieldChatTranslation.isScanChatMessage(m) || m.own) continue;
        var key = m.id + ':' + guest + ':' + mine;
        if (this._requestedTx[key]) continue;
        this._requestedTx[key] = true;
        waiting.push(m);
      }
      if (!waiting.length) return;
      var patch = Object.create(null);
      for (var j = 0; j < waiting.length; j++) {
        this._translations[waiting[j].id] = { state: 'pending' };
        patch[waiting[j].id] = { state: 'pending' };
      }
      void patch;
      this.syncChatMessages();
      var gen = ++this._translateGen;
      creator
        .loadCreatorSession(session.snapshot())
        .then(function (opened) {
          var chain = Promise.resolve();
          waiting.forEach(function (message) {
            chain = chain.then(function () {
              if (!self._alive || gen !== self._translateGen) return;
              return fieldSpeech
                .speechRequest(opened.token, 'translate', {
                  sourceText: message.body,
                  sourceLanguage: guest,
                  targetLanguage: mine,
                })
                .then(function (result) {
                  if (!self._alive || gen !== self._translateGen) return;
                  var value =
                    result && typeof result.text === 'string'
                      ? result.text.trim()
                      : '';
                  self._translations[message.id] = value
                    ? { state: 'done', text: value }
                    : { state: 'failed' };
                })
                .catch(function () {
                  if (!self._alive || gen !== self._translateGen) return;
                  self._translations[message.id] = { state: 'failed' };
                })
                .then(function () {
                  if (self._alive && gen === self._translateGen) {
                    self.syncChatMessages();
                  }
                });
            });
          });
          return chain;
        })
        .catch(function () {
          /* ignore */
        });
    },

    refreshLangUi: function () {
      var opts = this.data.langOptions || fieldSpeech.speechLanguageOptions();
      var mine = this.data.mine;
      var guest = this.data.guest;
      var ready = this.data.translateReady;
      var on = this.data.translateOn;
      var patch = {
        mineIndex: langIndexOf(opts, mine),
        guestIndex: langIndexOf(opts, guest),
        mineLabel: fieldSpeech.speechLanguages[mine] || mine,
        guestLabel: fieldSpeech.speechLanguages[guest] || guest,
        chipDisabled: chipDisabledOf(mine, guest, ready),
        langHint: langHintOf(mine, guest, ready, on),
      };
      if (mine === guest && on) {
        patch.translateOn = false;
        patch.langHint = langHintOf(mine, guest, ready, false);
      }
      this.setData(patch);
      this.syncChatMessages();
      this.queueGuestTranslations();
    },

    onMineLang: function (e) {
      var idx = Number(e.detail && e.detail.value);
      var opt = this.data.langOptions[idx];
      if (!opt) return;
      this.setData({ mine: opt.value });
      this.refreshLangUi();
    },

    onGuestLang: function (e) {
      var idx = Number(e.detail && e.detail.value);
      var opt = this.data.langOptions[idx];
      if (!opt) return;
      this.setData({ guest: opt.value });
      this.refreshLangUi();
    },

    toggleTranslate: function () {
      if (!this.data.translateReady || this.data.mine === this.data.guest) {
        return;
      }
      this.setData({ translateOn: !this.data.translateOn });
      this.refreshLangUi();
    },

    retryTranslation: function (e) {
      var id = e.currentTarget.dataset.id;
      if (!id) return;
      var key = id + ':' + this.data.guest + ':' + this.data.mine;
      delete this._requestedTx[key];
      delete this._translations[id];
      this.syncChatMessages();
      this.queueGuestTranslations();
    },

    rebootIfNeeded: function (force) {
      if (!this._alive) return;
      var sig =
        String(this.data.roomId || '') +
        '|' +
        (this.data.allowCreate ? '1' : '0');
      if (!force && sig === this._bootSig) return;
      this._bootSig = sig;
      if (this._timer) clearTimeout(this._timer);
      this._timer = null;
      this._invite = null;
      this._delivery = null;
      this._requestId = '';
      this._translations = Object.create(null);
      this._requestedTx = Object.create(null);
      this._localEchoes = [];
      this._translateGen = (this._translateGen || 0) + 1;
      this.setData({
        inviteStatus: '',
        inviteGuestName: '',
        inviteActive: false,
        chatting: false,
        url: '',
        qrPath: '',
        expiresLabel: '',
        chatMessages: [],
        chatAnchor: '',
        pendingText: '',
        draft: '',
        scanState: scanStateOf(this.data.roomId, '', false, false),
      });
      this.bootstrap();
    },

    bootstrap: function () {
      var self = this;
      if (!session.isSignedIn()) {
        this.setData({ notice: '请先登录' });
        return;
      }
      var roomId = this.data.roomId || '';
      var snap = session.snapshot();
      var brand =
        (snap &&
          snap.node &&
          (snap.node.brandName || snap.node.company_name || snap.node.domain)) ||
        '当前节点';
      this.setData({
        saveNote:
          '文字保存到 ' +
          brand +
          '，不会自动加好友。访客语音尚未开放。',
        scanState: scanStateOf(roomId, '', false, false),
        notice: roomId
          ? '检查扫码交流服务…'
          : '检查扫码交流服务…',
      });
      if (!roomId || roomId.charAt(0) !== '!') {
        // App shows preparing spinner while room is empty — keep waiting.
        return;
      }
      this.bootWithRoom(roomId);
    },

    bootWithRoom: function (roomId) {
      var self = this;
      var snap = session.snapshot();
      var node = fieldNodeApi.approvedFieldNode(
        String(snap.instanceId),
        snap.nodeOrigin
      );
      if (!node) {
        this.setData({
          notice:
            '当前节点尚未安装并验收扫码交流服务。启用后，客户可以用自己的手机申请加入。',
        });
        return;
      }
      this._node = node;
      try {
        this._call = fieldNodeApi.createFieldNodeApi(node, {
          origin: snap.nodeOrigin,
          token: function () {
            return session.snapshot().accessToken || '';
          },
        });
      } catch (e) {
        this.setData({ notice: (e && e.message) || '扫码服务不可用' });
        return;
      }

      var key =
        'muuzi.field.host:' +
        JSON.stringify([
          node.instanceId,
          node.origin,
          snap.matrixUserId,
          snap.deviceId || '',
          roomId,
        ]);
      var raw = store.get(key);
      if (raw) {
        try {
          var saved = JSON.parse(raw);
          if (/^[0-9a-f-]{36}$/.test(saved.requestId)) {
            this._requestId = saved.requestId;
            this._invite = saved.invite || null;
          }
        } catch (e) {
          /* ignore */
        }
      }
      if (!this._requestId) {
        this._requestId = idempotency.uuidV4();
        store.set(key, JSON.stringify({ requestId: this._requestId, invite: null }));
      }
      this._storeKey = key;

      this.run(function () {
        return self
          ._call('host/capabilities', {})
          .catch(function (error) {
            if (error && error.code === 'ACCESS_DENIED') return null;
            throw error;
          })
          .then(function (capabilities) {
            if (!self._alive) return;
            if (capabilities === null) {
              // 未开通账号：清掉本地残留邀请，避免 tick 去 host/read 失败后盖成「暂未完成」
              self._invite = null;
              if (self._storeKey && self._requestId) {
                store.set(
                  self._storeKey,
                  JSON.stringify({
                    requestId: self._requestId,
                    invite: null,
                  })
                );
              }
              self.setData({
                enabled: false,
                inviteStatus: '',
                inviteActive: false,
                url: '',
                qrPath: '',
                notice:
                  '这个账号还没开通扫码交流，请联系节点管理员开通。',
              });
              return;
            }
            var available = fieldCaps.fieldAvailability(
              capabilities,
              node.instanceId,
              node.protocol
            );
            self.setData({
              enabled: available.canStartText,
              notice: available.canStartText
                ? '客户扫码申请，你确认后才能进入文字交流。'
                : '当前节点尚未开放扫码交流。',
            });
            if (self._invite) {
              return self
                ._call('host/read', { invitationId: self._invite.id })
                .then(function (inv) {
                  return self.display(inv);
                })
                .catch(function (err) {
                  // 残留邀请已不可读：清掉，允许重新生成
                  self._invite = null;
                  if (self._storeKey && self._requestId) {
                    store.set(
                      self._storeKey,
                      JSON.stringify({
                        requestId: self._requestId,
                        invite: null,
                      })
                    );
                  }
                  if (err && err.code === 'ACCESS_DENIED') {
                    self.setData({
                      enabled: false,
                      notice:
                        '这个账号还没开通扫码交流，请联系节点管理员开通。',
                    });
                    return;
                  }
                  if (available.canStartText) return self.discover();
                  throw err;
                });
            }
            if (available.canStartText) return self.discover();
          });
      }).then(function () {
        self.tick();
      });
    },

    tick: function () {
      var self = this;
      if (!this._alive) return;
      this.refresh(true).finally(function () {
        if (!self._alive) return;
        self._timer = setTimeout(function () {
          self.tick();
        }, 3000);
      });
    },

    run: function (work, background) {
      var self = this;
      if (!this._alive) return Promise.resolve();
      if (background && (this._actionQueued || this._working)) {
        return Promise.resolve();
      }
      if (!background && this._actionQueued) return Promise.resolve();
      if (!background) {
        this._actionQueued = true;
        this.setData({ busy: true });
      }
      var task = this._queue.then(function () {
        if (!self._alive) return;
        self._working = true;
        return Promise.resolve()
          .then(work)
          .catch(function (err) {
            if (!self._alive) return;
            // 后台轮询失败不得盖住「未开通 / 等待扫码」等稳定提示
            if (background) return;
            self.setData({ notice: explainFieldError(err) });
          })
          .finally(function () {
            self._working = false;
            if (!background) {
              self._actionQueued = false;
              if (self._alive) self.setData({ busy: false });
            }
          });
      });
      this._queue = task.then(
        function () {},
        function () {}
      );
      return task;
    },

    persistInvite: function () {
      store.set(
        this._storeKey,
        JSON.stringify({
          requestId: this._requestId,
          invite: this._invite,
        })
      );
    },

    refreshScanUi: function (patch) {
      var status = patch.inviteStatus != null ? patch.inviteStatus : this.data.inviteStatus;
      var url = patch.url != null ? patch.url : this.data.url;
      var active = ['open', 'pending', 'approved'].indexOf(status) >= 0;
      var chatting = status === 'approved' && active;
      patch.inviteActive = active;
      patch.chatting = chatting;
      patch.scanState = scanStateOf(this.data.roomId, status, Boolean(url), chatting);
      if (patch.expiresAt != null) {
        patch.expiresLabel = expiresLabelOf(patch.expiresAt);
      }
      this.setData(patch);
      this.syncChatMessages();
      if (chatting) this.queueGuestTranslations();
    },

    display: function (value) {
      var self = this;
      if (!this._alive) return Promise.resolve();
      if (
        !value ||
        !/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value.id) ||
        ['open', 'pending', 'approved', 'rejected', 'revoked', 'expired'].indexOf(
          value.status
        ) < 0 ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1 ||
        !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt <= 0
      ) {
        return Promise.reject(new Error('INVALID_INVITE'));
      }
      if (
        this._invite &&
        (this._invite.id !== value.id ||
          this._invite.expiresAt !== value.expiresAt ||
          value.revision < this._invite.revision)
      ) {
        return Promise.reject(new Error('INVITE_CHANGED'));
      }
      this._invite = Object.assign({}, value, {
        joinProof:
          value.joinProof != null
            ? value.joinProof
            : this._invite && this._invite.joinProof,
      });
      this.persistInvite();
      var status = this._invite.status;
      var patch = {
        inviteStatus: status,
        inviteGuestName: this._invite.guestName || '',
        url: '',
        expiresAt: this._invite.expiresAt || 0,
      };
      if (
        status === 'open' &&
        this._invite.expiresAt > Date.now() &&
        this._invite.joinProof
      ) {
        try {
          patch.url = fieldNodeApi.fieldLink(this._node, this._invite);
        } catch (e) {
          patch.url = '';
        }
      }
      this.refreshScanUi(patch);
      if (patch.url) {
        return qrcodeDraw
          .drawUrlToTempFile(this, 'hostQr', patch.url)
          .then(function (p) {
            if (self._alive) self.setData({ qrPath: p });
          })
          .catch(function () {
            if (self._alive) self.setData({ qrPath: '' });
          })
          .then(function () {
            if (status === 'approved' && !self._delivery) {
              return self.bindDelivery(self._invite.id);
            }
          });
      }
      if (status !== 'open') {
        this.setData({ qrPath: '' });
      }
      if (status === 'approved' && !this._delivery) {
        return this.bindDelivery(this._invite.id);
      }
      return Promise.resolve();
    },

    bindDelivery: function (invitationId) {
      var self = this;
      var snap = session.snapshot();
      matrixRuntime.ensureStarted();
      var api = matrixRuntime.getApi();
      if (!api) {
        this.setData({ notice: '消息服务尚未就绪' });
        return Promise.resolve();
      }
      try {
        this._delivery = fieldHostDelivery.createFieldHostDelivery({
          api: api,
          context: {
            instanceId: String(snap.instanceId),
            homeserver: snap.homeserver,
            roomId: this.data.roomId,
            invitationId: invitationId,
          },
          getUserId: function () {
            return session.snapshot().matrixUserId || '';
          },
          getDeviceId: function () {
            return session.snapshot().deviceId || '';
          },
          recipient: function () {
            return self._call('host/recipient', { invitationId: invitationId });
          },
          isCurrent: function () {
            return self._alive;
          },
        });
      } catch (e) {
        this.setData({ notice: (e && e.message) || '无法建立发送通道' });
        return Promise.resolve();
      }
      return this._delivery.pending().then(function (pending) {
        if (self._alive && pending) {
          self.setData({
            pendingText: pending.text || '',
            canSend: true,
          });
        }
      });
    },

    discover: function () {
      var self = this;
      return this._call('host/find', { room: this.data.roomId }).then(function (result) {
        if (!self._alive) throw new Error('CONTEXT_CHANGED');
        if (
          !result ||
          result.roomId !== self.data.roomId ||
          !Object.prototype.hasOwnProperty.call(result, 'invitation')
        ) {
          throw new Error('INVALID_RECOVERY');
        }
        if (result.invitation !== null) {
          return self.display(result.invitation).then(function () {
            return true;
          });
        }
        // 无可恢复邀请：丢掉本地残留，否则 create 成功后 display 会因 INVITE_CHANGED 拒收
        self._invite = null;
        if (self._storeKey && self._requestId) {
          store.set(
            self._storeKey,
            JSON.stringify({ requestId: self._requestId, invite: null })
          );
        }
        return false;
      });
    },

    refresh: function (background) {
      var self = this;
      return this.run(function () {
        var status = self._invite && self._invite.status;
        if (
          self._invite &&
          ['open', 'pending', 'approved'].indexOf(status) >= 0
        ) {
          return self
            ._call('host/read', { invitationId: self._invite.id })
            .then(function (inv) {
              return self.display(inv);
            });
        }
        if (self.data.enabled) return self.discover();
      }, background);
    },

    onCreate: function () {
      var self = this;
      if (!this.data.allowCreate || !this.data.enabled || !this.data.roomId) {
        if (!this.data.enabled) {
          this.setData({
            notice:
              this.data.notice && /开通|开放/.test(this.data.notice)
                ? this.data.notice
                : '这个账号还没开通扫码交流，请联系节点管理员开通。',
          });
        } else if (!this.data.roomId) {
          this.setData({ notice: '现场话题尚未就绪，请稍候再生成二维码。' });
        }
        return;
      }
      this.run(function () {
        return self.discover().then(function (found) {
          if (found) return;
          self.triggerEvent('prepared');
          return self
            ._call('host/prepare', { room: self.data.roomId })
            .then(function (prepared) {
              if (
                !prepared ||
                prepared.roomId !== self.data.roomId ||
                prepared.ready !== true
              ) {
                throw new Error('ROOM_NOT_READY');
              }
              return self._call('host/create', {
                room: self.data.roomId,
                requestId: self._requestId,
                ttlSeconds: 900,
              });
            })
            .then(function (inv) {
              // create 返回的是新邀请真值，允许覆盖本地空邀请
              self._invite = null;
              return self.display(inv);
            });
        });
      });
    },

    onDecide: function (e) {
      var self = this;
      var accept = !!(
        e.currentTarget.dataset.accept === '1' ||
        e.currentTarget.dataset.accept === true
      );
      if (!this._invite || !this._invite.guestRequestId) return;
      this.run(function () {
        return self
          ._call('host/decide', {
            invitationId: self._invite.id,
            guestRequestId: self._invite.guestRequestId,
            expectedRevision: self._invite.revision,
            accept: accept,
          })
          .then(function (inv) {
            return self.display(inv);
          });
      });
    },

    onRevoke: function () {
      var self = this;
      if (!this._invite) return;
      this.run(function () {
        return self
          ._call('host/revoke', {
            invitationId: self._invite.id,
            expectedRevision: self._invite.revision,
          })
          .then(function (inv) {
            return self.display(inv);
          });
      });
    },

    onRefresh: function () {
      this.refresh(false);
    },

    onDraft: function (e) {
      var draft = (e.detail && e.detail.value) || '';
      var trimmed = String(draft).trim();
      var oversize = cryptoUtil.utf8ByteLength(draft) > 2000;
      this.setData({
        draft: draft,
        // 对齐 App：空稿或 >2000 字节不可发；已有 pending 可重试
        canSend: !!(this.data.pendingText || (trimmed && !oversize)),
      });
    },

    onSend: function () {
      var self = this;
      if (!this._delivery || !this._invite || this._invite.status !== 'approved') {
        return;
      }
      this.run(function () {
        var pending = null;
        return self._delivery.pending().then(function (p) {
          pending = p;
          var requestId = (pending && pending.requestId) || idempotency.uuidV4();
          var text = (pending && pending.text) || self.data.draft;
          var language = (pending && pending.language) || self.data.mine;
          if (
            !pending &&
            (!text.trim() ||
              text.indexOf('\0') >= 0 ||
              cryptoUtil.utf8ByteLength(text) > 2000)
          ) {
            throw new Error('INVALID_TEXT');
          }
          self.setData({ pendingText: text, canSend: true });
          return self._delivery.send(requestId, text, language).then(function (result) {
            if (self._alive) {
              if (result && result.eventId) {
                matrixRuntime.noteSentEcho(
                  self.data.roomId,
                  result.eventId,
                  text
                );
                var echoes = self._localEchoes || [];
                var exists = false;
                for (var i = 0; i < echoes.length; i++) {
                  if (echoes[i] && echoes[i].id === result.eventId) {
                    exists = true;
                    break;
                  }
                }
                if (!exists) {
                  echoes.push({
                    id: result.eventId,
                    own: true,
                    body: text,
                    timestamp: Date.now(),
                  });
                  self._localEchoes = echoes;
                }
              }
              self.setData({
                draft: '',
                pendingText: '',
                canSend: false,
                notice: '已发送',
              });
              self.syncChatMessages();
              self.queueGuestTranslations();
            }
          });
        });
      });
    },

    copyUrl: function () {
      var url = this.data.url;
      if (!url) return;
      wx.setClipboardData({
        data: url,
        success: function () {
          wx.showToast({
            title: '已复制，请只发给本次客户',
            icon: 'none',
          });
        },
      });
    },

    openChat: function () {
      var room = this.data.roomId;
      if (!room) return;
      this.triggerEvent('openchat', { roomId: room });
      deepLink.openRoom(room).catch(function () {
        wx.showToast({ title: '无法打开会话', icon: 'none' });
      });
    },
  },
});
