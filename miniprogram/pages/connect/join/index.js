const session = require('../../../services/session');
const joinLang = require('../../../services/fieldJoinLanguage');
const visitorCopy = require('../../../services/fieldVisitorCopy');
const caps = require('../../../services/fieldCapabilities');
const nodeApi = require('../../../services/fieldNodeApi');
const entry = require('../../../services/fieldVisitorEntry');
const invitationPreview = require('../../../services/fieldInvitationPreview');
const visitorSession = require('../../../services/fieldVisitorSession');
const visitorJoin = require('../../../services/fieldVisitorJoin');
const visitorDelivery = require('../../../services/fieldVisitorDelivery');
const visitorHistory = require('../../../services/fieldVisitorHistory');
const speech = require('../../../services/fieldSpeech');
const cryptoUtil = require('../../../utils/field-crypto');
const idempotency = require('../../../utils/idempotency');

/**
 * M1.6 Join 访客文字流 · 对齐 ConnectJoinScreen + FieldVisitorFlow
 * 可未登录；凭据仅本机；不自动加好友。
 */

function systemPrefs() {
  try {
    var info = wx.getSystemInfoSync();
    var lang = (info.language || 'en').replace('_', '-');
    return [lang];
  } catch (e) {
    return ['zh'];
  }
}

Page({
  data: {
    language: 'zh',
    langOptions: joinLang.languageOptions(),
    langIndex: 0,
    copy: joinLang.fieldJoinCopy.zh,
    gateCopy: joinLang.fieldGuestGateCopy.zh,
    vCopy: visitorCopy.visitorCopy('zh'),
    eCopy: visitorCopy.visitorExitCopy('zh'),
    paste: '',
    entryPresent: false,
    gate: 'idle', // idle | checking | ready | unavailable
    nodeLabel: '',
    // visitor flow
    recoveryChecked: false,
    paused: false,
    confirmEnd: false,
    ended: false,
    started: false,
    name: '',
    consent: false,
    phase: 'new',
    error: false,
    busy: false,
    text: '',
    textLang: 'zh',
    textLangIndex: 0,
    textLangOptions: speech.speechLanguageOptions(),
    messages: [],
    hasOlder: false,
    pending: null,
    byteCount: 0,
    hasJoinProof: false,
    entryVerified: false,
    signedIn: false,
  },

  _alive: true,
  _entry: null,
  _timer: null,
  _actions: null,
  _gen: 0,

  onLoad(options) {
    this._alive = true;
    var language = joinLang.fieldJoinLanguage(systemPrefs());
    this.applyLanguage(language);
    this.setData({
      signedIn: session.isSignedIn(),
      textLangOptions: speech.speechLanguageOptions(),
    });
    var resolved = entry.resolveVisitorEntry(options || {});
    if (resolved) {
      this.bindEntry(resolved);
    }
  },

  onShow() {
    this._alive = true;
    this.setData({ signedIn: session.isSignedIn() });
    if (this._closure && typeof this._closure.check === 'function') {
      this._closure.check();
    }
  },

  onHide() {
    this._alive = false;
  },

  onUnload() {
    this._alive = false;
    this.teardownFlow();
  },

  applyLanguage(language) {
    var opts = joinLang.languageOptions();
    var idx = 0;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value === language) idx = i;
    }
    this.setData({
      language: language,
      langIndex: idx,
      copy: joinLang.fieldJoinCopy[language] || joinLang.fieldJoinCopy.en,
      gateCopy:
        joinLang.fieldGuestGateCopy[language] ||
        joinLang.fieldGuestGateCopy.en,
      vCopy: visitorCopy.visitorCopy(language),
      eCopy: visitorCopy.visitorExitCopy(language),
    });
  },

  onLanguage(e) {
    var idx = Number(e.detail.value);
    var opt = this.data.langOptions[idx] || this.data.langOptions[0];
    this.applyLanguage(opt.value);
  },

  onPaste(e) {
    this.setData({ paste: e.detail.value });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  onConsent(e) {
    this.setData({ consent: !!e.detail.value.length });
  },

  onText(e) {
    var text = e.detail.value;
    this.setData({
      text: text,
      byteCount: cryptoUtil.utf8ByteLength(text),
    });
  },

  onTextLang(e) {
    var idx = Number(e.detail.value);
    var opt = this.data.textLangOptions[idx] || this.data.textLangOptions[0];
    this.setData({ textLang: opt.value, textLangIndex: idx });
  },

  applyPaste() {
    var resolved = entry.visitorEntryFromUrl(String(this.data.paste || '').trim());
    if (!resolved) {
      wx.showToast({ title: '邀请链接无效', icon: 'none' });
      return;
    }
    this.bindEntry(resolved);
  },

  bindEntry(resolved) {
    this.teardownFlow();
    this._entry = resolved;
    this.setData({
      entryPresent: true,
      nodeLabel: resolved.node.name + ' · ' + resolved.node.origin,
      hasJoinProof: !!resolved.link.joinProof,
      entryVerified: false,
      gate: 'checking',
      phase: 'new',
      messages: [],
      error: false,
      ended: false,
      started: false,
      paused: false,
      confirmEnd: false,
      recoveryChecked: false,
      pending: null,
      name: '',
      consent: false,
      text: '',
      byteCount: 0,
    });
    this.checkCapabilities();
  },

  checkCapabilities() {
    var self = this;
    var resolved = this._entry;
    if (!resolved) return;
    this.setData({ gate: 'checking', error: false, entryVerified: false });
    var call = nodeApi.createFieldNodeApi(resolved.node);
    call('guest/capabilities', {})
      .then(function (value) {
        if (!self._alive || self._entry !== resolved) return null;
        var ok = caps.fieldAvailability(
          value,
          resolved.node.instanceId,
          resolved.node.protocol
        ).canStartText;
        if (!ok) {
          self.setData({ gate: 'unavailable', entryVerified: false });
          self.startFlow(true);
          return null;
        }
        if (!resolved.link || !resolved.link.joinProof) {
          self.setData({ gate: 'ready', entryVerified: false });
          self.startFlow(false);
          return null;
        }
        // 对齐 App FieldVisitorFlow：capabilities 通过后再 guest/preview
        return invitationPreview
          .checkFieldInvitation(resolved.link, function (body) {
            return call('guest/preview', body);
          })
          .then(function (open) {
            if (!self._alive || self._entry !== resolved) return;
            self.setData({
              gate: open ? 'ready' : 'unavailable',
              entryVerified: !!open,
            });
            if (open) self.startFlow(false);
            else self.startFlow(true);
          });
      })
      .catch(function () {
        if (!self._alive || self._entry !== resolved) return;
        self.setData({ gate: 'unavailable', entryVerified: false });
        self.startFlow(true);
      });
  },

  retryGate() {
    this.checkCapabilities();
  },

  teardownFlow() {
    this._gen += 1;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._closure && this._closure.dispose) {
      this._closure.dispose();
    }
    this._closure = null;
    if (this._actions && this._actions.dispose) {
      this._actions.dispose();
    }
    this._actions = null;
  },

  startFlow(exitOnly) {
    var self = this;
    var resolved = this._entry;
    if (!resolved) return;
    this.teardownFlow();
    var gen = this._gen;
    var live = true;
    var ready = false;
    var terminal = false;
    var suspended = false;
    var accessClosed = false;
    var call = nodeApi.createFieldNodeApi(resolved.node);
    var store = visitorSession.createVisitorSessionStore({
      instanceId: resolved.node.instanceId,
      nodeOrigin: resolved.node.origin,
      invitationId: resolved.link.invitationId,
      invitationExpiresAt: resolved.link.expiresAt,
    });
    var join = visitorJoin.createVisitorJoin(
      store,
      {
        request: function (b) {
          return call('guest/request', b);
        },
        leave: function (b) {
          return call('guest/leave', b);
        },
        poll: function (b) {
          return call('guest/status', b);
        },
        exchange: function (b) {
          return call('guest/session/exchange', b);
        },
        status: function (b) {
          return call('guest/session/status', b);
        },
      },
      function () {
        return live && !accessClosed && self._gen === gen;
      }
    );
    var history = null;
    var delivery = null;
    var attempt = null;
    var actionQueued = false;
    var queue = Promise.resolve();
    var working = false;

    function show(value) {
      if (!live || accessClosed || self._gen !== gen) return;
      self.setData({
        messages: value.messages || [],
        hasOlder: !!value.hasOlder,
      });
    }

    function enter(next) {
      if (!live || accessClosed || self._gen !== gen) return Promise.resolve();
      self.setData({ recoveryChecked: true, phase: next.phase });
      if (next.phase === 'closed') terminal = true;
      if (next.phase === 'ready' && !ready) {
        return store.restore().then(function (recovery) {
          if (!recovery || !recovery.session || !live || accessClosed) {
            throw new Error('Unavailable');
          }
          var credentials = {
            sessionId: recovery.session.sessionId,
            sessionProof: recovery.sessionProof,
          };
          delivery = visitorDelivery.createVisitorDelivery(
            recovery,
            {
              status: function (b) {
                return call('guest/session/status', b);
              },
              send: function (b) {
                return call('guest/message/send', b);
              },
            },
            function () {
              return live && !accessClosed && self._gen === gen;
            }
          );
          if (history) history.dispose();
          history = visitorHistory.createVisitorHistory(
            function (cursor) {
              return call(
                'guest/message/read',
                Object.assign({}, credentials, { cursor: cursor })
              );
            },
            function () {
              return live && !accessClosed && self._gen === gen;
            },
            recovery.session.expiresAt
          );
          return delivery.pending().then(function (restoredAttempt) {
            if (!live || accessClosed) return;
            attempt = restoredAttempt;
            self.setData({
              pending: attempt
                ? {
                    requestId: attempt.requestId,
                    text: attempt.text,
                    language: attempt.language,
                  }
                : null,
              text: attempt ? attempt.text : self.data.text,
              byteCount: attempt
                ? cryptoUtil.utf8ByteLength(attempt.text)
                : self.data.byteCount,
            });
            return history.initial().then(function (page) {
              show(page);
              if (!accessClosed) ready = true;
            });
          });
        });
      }
      return Promise.resolve();
    }

    function failure(reason) {
      if (!live || accessClosed || self._gen !== gen) return;
      self.setData({ error: true });
      var code =
        (reason && reason.code) || (reason && reason.message) || '';
      if (
        [
          'SESSION_CLOSED',
          'SESSION_UNAVAILABLE',
          'ACCESS_DENIED',
          'INVITATION_CLOSED',
          'VISITOR_SESSION_EXPIRED',
          'VISITOR_HISTORY_CLOSED',
        ].indexOf(code) >= 0
      ) {
        terminal = true;
        self.setData({ phase: 'closed', messages: [] });
        if (history) history.dispose();
        ready = false;
      }
    }

    function clearEntry() {
      try {
        entry.clearVisitorEntry(resolved.link.invitationId);
        if (live && self._gen === gen) {
          self.setData({ ended: true, error: false });
        }
      } catch (e) {
        if (live && self._gen === gen) {
          self.setData({ ended: false, error: true });
        }
      }
    }

    function closeAccess() {
      accessClosed = true;
      terminal = true;
      suspended = true;
      ready = false;
      actionQueued = false;
      if (self._timer) {
        clearTimeout(self._timer);
        self._timer = null;
      }
      join.dispose();
      if (history) history.dispose();
      history = null;
      delivery = null;
      attempt = null;
      if (live && self._gen === gen) {
        self.setData({
          busy: false,
          paused: false,
          confirmEnd: false,
          phase: 'closed',
          messages: [],
          hasOlder: false,
          pending: null,
          text: '',
          byteCount: 0,
          name: '',
          consent: false,
        });
      }
      clearEntry();
    }

    var closure = store.watchClosure(closeAccess, function () {
      if (live && self._gen === gen) {
        self.setData({ error: true, messages: [] });
      }
    });
    self._closure = closure;

    function run(work, background, allowClosed) {
      closure.check();
      if (
        !live ||
        self._gen !== gen ||
        (accessClosed && !allowClosed) ||
        (background && (working || actionQueued)) ||
        (!background && actionQueued)
      ) {
        return Promise.resolve();
      }
      if (!background) {
        actionQueued = true;
        self.setData({ busy: true, error: false });
      }
      var task = queue.then(function () {
        closure.check();
        if (!live || self._gen !== gen || (accessClosed && !allowClosed)) {
          return;
        }
        working = true;
        return Promise.resolve()
          .then(work)
          .catch(failure)
          .then(function () {
            working = false;
            if (!background && live && self._gen === gen) {
              actionQueued = false;
              self.setData({ busy: false });
            }
          });
      });
      queue = task;
      return task;
    }

    function resume(background) {
      return run(
        function () {
          if (background && suspended) return;
          if (!background) {
            suspended = false;
            if (live && self._gen === gen) self.setData({ paused: false });
          }
          if (ready && history) {
            return history.poll().then(show);
          }
          return join.resume().then(enter);
        },
        background
      );
    }

    self._actions = {
      dispose: function () {
        live = false;
        if (self._timer) {
          clearTimeout(self._timer);
          self._timer = null;
        }
        join.dispose();
        if (history) history.dispose();
        if (closure) closure.dispose();
      },
      submit: function (input) {
        return run(function () {
          if (!resolved.link.joinProof) {
            throw new Error('VISITOR_RECOVERY_MISSING');
          }
          if (live && self._gen === gen) self.setData({ started: true });
          return join
            .submit(input, resolved.link.joinProof, 'field-join-v1')
            .then(enter);
        });
      },
      resume: function () {
        return resume(false);
      },
      pause: function () {
        return run(function () {
          suspended = true;
          if (live && self._gen === gen) {
            self.setData({ paused: true, messages: [] });
          }
        });
      },
      end: function () {
        return run(
          function () {
            if (accessClosed) {
              clearEntry();
              return;
            }
            return join.end().then(function () {
              if (live) closeAccess();
            });
          },
          false,
          true
        );
      },
      older: function () {
        return run(function () {
          if (history) return history.older().then(show);
        });
      },
      send: function () {
        return run(function () {
          if (!delivery) return;
          var draftText = self.data.text;
          var draftLang = self.data.textLang;
          if (
            !attempt &&
            (!draftText.trim() ||
              draftText.indexOf('\0') >= 0 ||
              cryptoUtil.utf8ByteLength(draftText) > 2000)
          ) {
            throw new Error('VISITOR_MESSAGE_INVALID');
          }
          if (!attempt) {
            attempt = {
              requestId: idempotency.uuidV4(),
              text: draftText,
              language: draftLang,
            };
          }
          if (live && self._gen === gen) {
            self.setData({
              pending: {
                requestId: attempt.requestId,
                text: attempt.text,
                language: attempt.language,
              },
            });
          }
          return delivery
            .send(attempt.requestId, attempt.text, attempt.language)
            .then(function () {
              attempt = null;
              if (live && self._gen === gen) {
                self.setData({
                  pending: null,
                  text: '',
                  byteCount: 0,
                });
              }
              if (history) return history.poll().then(show);
            });
        });
      },
    };

    function tick() {
      resume(true).then(function () {
        if (live && !terminal && self._gen === gen) {
          self._timer = setTimeout(tick, 3000);
        }
      });
    }

    if (exitOnly) {
      run(function () {
        return store.forExit().then(function (recovery) {
          if (live && self._gen === gen) {
            self.setData({
              started: !!recovery,
              recoveryChecked: true,
            });
          }
        });
      });
    } else {
      tick();
    }
  },

  submitJoin() {
    if (!this.data.consent || !this.data.name.trim()) return;
    if (this.data.hasJoinProof && !this.data.entryVerified) return;
    if (this._actions) this._actions.submit(this.data.name);
  },

  refreshJoin() {
    if (this._actions) this._actions.resume();
  },

  pauseJoin() {
    if (this._actions) this._actions.pause();
  },

  openEndConfirm() {
    this.setData({ confirmEnd: true });
  },

  cancelEnd() {
    this.setData({ confirmEnd: false });
  },

  confirmEndJoin() {
    if (this._actions) this._actions.end();
  },

  loadOlder() {
    if (this._actions) this._actions.older();
  },

  sendMessage() {
    if (this._actions) this._actions.send();
  },

  goLogin() {
    wx.reLaunch({ url: '/pages/auth/login/index' });
  },

  goConnect() {
    wx.switchTab({ url: '/pages/connect/index' });
  },
});
