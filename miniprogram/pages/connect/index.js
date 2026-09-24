const session = require('../../services/session');
const creator = require('../../services/creator');
const field = require('../../services/fieldEncounters');
const savedTalks = require('../../services/fieldSavedTalks');
const idempotency = require('../../utils/idempotency');
const matrixRuntime = require('../../services/matrixRuntime');
const deepLink = require('../../services/messageDeepLink');

/**
 * 连接 Hub · 对齐 ConnectScreen + FieldEncounters
 * M1.1 Hub/赠卡 · M1.2 名片入口 · M1.3 现场话题 CRUD
 * M1.7 / M3：已保存现场交流接 Matrix 真列表
 */
function formatEncounter(item) {
  var created = '';
  try {
    created = new Date(item.createdAt).toLocaleString();
  } catch (e) {
    created = item.createdAt || '';
  }
  return Object.assign({}, item, {
    title: item.eventName || '未命名话题',
    lifecycleLabel: item.lifecycle === 'open' ? '进行中' : '已结束',
    createdLabel: created,
    langPair: item.sourceLanguage + ' ⇄ ' + item.targetLanguage,
  });
}

Page({
  data: {
    giftNote: false,
    nodeDomain: '',
    // C-05 已保存现场交流（M3 前 deferred）
    savedPhase: 'deferred',
    savedItems: [],
    savedNote: savedTalks.DEFERRED_NOTE,
    // Field encounters
    encounterPhase: 'loading',
    canDelete: false,
    encounterItems: [],
    encounterBefore: null,
    encounterNote: '',
    encounterBusy: false,
    eventName: '',
    sourceLanguage: 'zh',
    targetLanguage: 'en',
    createPending: false,
    deletingId: '',
    langOptions: [
      { value: 'zh', label: '中文' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
    ],
  },

  _lock: false,
  _alive: true,
  _pendingCreate: null,
  _closeKeys: null,
  _deleteKeys: null,
  _matrixUnsub: null,

  onLoad() {
    this._closeKeys = {};
    this._deleteKeys = {};
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    const s = session.snapshot();
    this.setData({ nodeDomain: s.nodeDomain || '' });
    matrixRuntime.ensureStarted();
    if (this._matrixUnsub) this._matrixUnsub();
    this._matrixUnsub = matrixRuntime.subscribe(
      function () {
        if (!this._alive) return;
        this.refreshSavedTalks();
      }.bind(this)
    );
    this.refreshSavedTalks();
    this.loadEncounters();
  },

  onHide() {
    this._alive = false;
    if (this._matrixUnsub) {
      this._matrixUnsub();
      this._matrixUnsub = null;
    }
  },

  refreshSavedTalks() {
    var snap = matrixRuntime.getSnapshot();
    var rooms = snap && snap.ready ? snap.rooms || [] : null;
    var listed = savedTalks.listSavedFieldTalks(
      rooms,
      (snap && snap.nodeWorkspaces) || []
    );
    this.setData({
      savedPhase: listed.phase,
      savedItems: listed.items,
      savedNote: listed.note,
    });
  },

  openSavedRoom(e) {
    var room = e.currentTarget.dataset.room || '';
    if (!room) {
      wx.showToast({ title: '房间无效', icon: 'none' });
      return;
    }
    deepLink.openRoom(room).catch(function () {
      wx.showToast({ title: '无法打开会话', icon: 'none' });
    });
  },

  continueSaved(e) {
    var room = e.currentTarget.dataset.room || '';
    var url = '/pages/connect/continue/index';
    if (room) url += '?room=' + encodeURIComponent(room);
    wx.navigateTo({ url: url });
  },

  openContinueShell() {
    wx.navigateTo({ url: '/pages/connect/continue/index' });
  },

  onUnload() {
    this._alive = false;
    if (this._matrixUnsub) {
      this._matrixUnsub();
      this._matrixUnsub = null;
    }
  },

  goTalk() {
    wx.navigateTo({ url: '/pages/connect/talk/index' });
  },

  goCard() {
    wx.navigateTo({ url: '/pages/connect/card/index' });
  },

  toggleGift() {
    this.setData({ giftNote: !this.data.giftNote });
  },

  onEventName(e) {
    this.setData({ eventName: e.detail.value });
  },

  onSourceLang(e) {
    var idx = Number(e.detail.value);
    var opt = this.data.langOptions[idx] || this.data.langOptions[0];
    this.setData({ sourceLanguage: opt.value });
  },

  onTargetLang(e) {
    var idx = Number(e.detail.value);
    var opt = this.data.langOptions[idx] || this.data.langOptions[1];
    this.setData({ targetLanguage: opt.value });
  },

  loadEncounters() {
    var self = this;
    if (!session.isSignedIn()) return;
    self.setData({
      encounterPhase: 'loading',
      encounterNote: '',
      deletingId: '',
    });
    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return field.fieldCapabilities(opened.token).then(function (cap) {
          return { opened: opened, cap: cap };
        });
      })
      .then(function (bundle) {
        if (!self._alive) return;
        self.setData({ canDelete: bundle.cap.deletion });
        if (!bundle.cap.available) {
          self.setData({ encounterPhase: 'unavailable' });
          return;
        }
        return field.listFieldEncounters(bundle.opened.token).then(function (page) {
          if (!self._alive) return;
          self.setData({
            encounterItems: page.items.map(formatEncounter),
            encounterBefore: page.nextBefore,
            encounterPhase: 'ready',
          });
        });
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          encounterPhase: 'error',
          encounterNote: '话题列表读取失败，请重试。',
        });
      });
  },

  refreshEncounters() {
    this._pendingCreate = null;
    this.setData({ createPending: false });
    this.loadEncounters();
  },

  act(work) {
    var self = this;
    if (self._lock) return Promise.resolve();
    self._lock = true;
    self.setData({ encounterBusy: true, encounterNote: '' });
    var snap = session.snapshot();
    return creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return work(opened.token);
      })
      .catch(function (error) {
        if (self._alive) {
          self.setData({
            encounterNote:
              (error && error.message) || '操作未能确认，请重试。',
          });
        }
      })
      .then(function () {
        self._lock = false;
        if (self._alive) self.setData({ encounterBusy: false });
      });
  },

  createEncounter() {
    var self = this;
    if (self._lock) return;
    var operation =
      self._pendingCreate ||
      {
        key: idempotency.uuidV4(),
        input: {
          eventName: String(self.data.eventName || '').trim(),
          sourceLanguage: self.data.sourceLanguage,
          targetLanguage: self.data.targetLanguage,
          saveHistory: false,
        },
      };
    self._pendingCreate = operation;
    self.setData({ createPending: true });
    self.act(function (token) {
      return field
        .createFieldEncounter(token, operation.input, operation.key)
        .then(function (item) {
          if (!self._alive) return;
          self._pendingCreate = null;
          var next = [formatEncounter(item)].concat(
            self.data.encounterItems.filter(function (x) {
              return x.encounterId !== item.encounterId;
            })
          );
          self.setData({
            encounterItems: next,
            createPending: false,
            encounterNote: '话题已创建，尚未开始录音或保存文字。',
          });
        });
    });
  },

  closeEncounter(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var item = self.data.encounterItems.find(function (x) {
      return x.encounterId === id;
    });
    if (!item) return;
    var identity = item.encounterId + ':' + item.revision;
    if (!self._closeKeys[identity]) {
      self._closeKeys[identity] = idempotency.uuidV4();
    }
    var key = self._closeKeys[identity];
    self.act(function (token) {
      return field.closeFieldEncounter(token, item, key).then(function (updated) {
        if (!self._alive) return;
        self.setData({
          encounterItems: self.data.encounterItems.map(function (x) {
            return x.encounterId === updated.encounterId
              ? formatEncounter(updated)
              : x;
          }),
          encounterNote: '话题已结束。',
        });
      });
    });
  },

  askDelete(e) {
    this.setData({
      deletingId: e.currentTarget.dataset.id || '',
      encounterNote: '',
    });
  },

  cancelDelete() {
    this.setData({ deletingId: '' });
  },

  confirmDelete() {
    var self = this;
    var id = self.data.deletingId;
    var item = self.data.encounterItems.find(function (x) {
      return x.encounterId === id;
    });
    if (!item) return;
    var identity = item.encounterId + ':' + item.revision;
    if (!self._deleteKeys[identity]) {
      self._deleteKeys[identity] = idempotency.uuidV4();
    }
    var key = self._deleteKeys[identity];
    self.act(function (token) {
      return field.deleteFieldEncounter(token, item, key).then(function () {
        if (!self._alive) return;
        self.setData({
          encounterItems: self.data.encounterItems.filter(function (x) {
            return x.encounterId !== item.encounterId;
          }),
          deletingId: '',
          encounterNote: '话题已删除。',
        });
      });
    });
  },

  loadMoreEncounters() {
    var self = this;
    var before = self.data.encounterBefore;
    if (!before || self._lock) return;
    self.act(function (token) {
      return field.listFieldEncounters(token, before).then(function (page) {
        if (!self._alive) return;
        var seen = {};
        self.data.encounterItems.forEach(function (x) {
          seen[x.encounterId] = true;
        });
        var added = page.items
          .filter(function (x) {
            return !seen[x.encounterId];
          })
          .map(formatEncounter);
        self.setData({
          encounterItems: self.data.encounterItems.concat(added),
          encounterBefore: page.nextBefore,
        });
      });
    });
  },
});
