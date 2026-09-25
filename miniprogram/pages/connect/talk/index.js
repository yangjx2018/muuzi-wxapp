const session = require('../../../services/session');
const creator = require('../../../services/creator');
const fieldEncounters = require('../../../services/fieldEncounters');
const fieldSpeech = require('../../../services/fieldSpeech');
const fieldTranslation = require('../../../services/fieldTranslation');
const fieldOutbox = require('../../../services/fieldOutbox');
const fieldAudio = require('../../../services/fieldAudioCapture');
const fieldJournal = require('../../../services/fieldJournal');
const matrixRuntime = require('../../../services/matrixRuntime');
const idempotency = require('../../../utils/idempotency');
const deepLink = require('../../../services/messageDeepLink');

/**
 * M1.4/M1.5 面对面交流 · 对齐 FieldTalk：确认后写入 Matrix 现场房间
 */

var PHASE_LABEL = {
  idle: '轮流按住说话',
  starting: '准备麦克风…',
  recording: '正在录音，松开后翻译',
  recognizing: '识别中…',
  translating: '翻译中…',
  synthesizing: '准备朗读…',
};

function ownerKey(snap) {
  return JSON.stringify([
    snap.instanceId,
    snap.nodeOrigin,
    snap.matrixUserId,
    snap.deviceId || '',
  ]);
}

function langLabel(code, options) {
  var hit = options.find(function (o) {
    return o.value === code;
  });
  return hit ? hit.label : code;
}

Page({
  data: {
    scan: false,
    scanPrepared: false,
    ending: false,
    faceFlipped: false,
    consent: false,
    speechAvailable: false,
    speechLoaded: false,
    supportedLanguages: [],
    langOptions: fieldSpeech.speechLanguageOptions(),
    mine: 'zh',
    guest: 'en',
    mineIndex: 0,
    guestIndex: 1,
    mineLabel: '中文（普通话）',
    guestLabel: 'English · 英语',
    phase: 'idle',
    statusText: '检查语音服务…',
    // 对齐 App FieldTalk saveBadge：话题就绪后为「话题已创建 · 自动保存」
    saveBadge: '正在创建话题',
    note: '',
    busy: false,
    translating: false,
    turn: null,
    savedTurnKey: '',
    hasDraft: false,
    sameLanguage: false,
    topicKey: '',
    topicAccess: false,
    topicPrepFailed: false,
    matrixReady: false,
    savedRoom: '',
    recoveryError: '',
    speakMineLabel: '我 · 按住说话',
    speakGuestLabel: '对方 · 按住说话',
    speakMineDisabled: true,
    speakGuestDisabled: true,
    blockScanSwitch: false,
    canPlayVoice: false,
    // 对齐 App 可暂停朗读：微信 <audio> 已废弃，用 InnerAudioContext + 暂停/继续按钮
    voiceSrc: '',
    voicePlaying: false,
    voicePaused: false,
    voiceMeter: 0,
    voiceMeterPct: 0,
    voiceElapsed: '',
    showVoiceMeter: false,
    // 对齐 App FieldTalk.held：按住时保留上一轮展示，避免交流区高度塌缩导致按钮在手指下跳动触发 touchcancel。
    heldTurn: null,
    shownTurn: null,
    utteranceHeld: false,
    // 按下瞬间写入；按住期间不再改说话按钮自身 class/文案，避免微信重绘触发 touchcancel。
    holdingSpeaker: '',
  },

  _outbox: null,
  _journal: null,
  _capture: null,
  _audio: null,
  _voicePath: '',
  _alive: true,
  _reqGen: 0,
  _saveLock: false,
  _holdSpeaker: '',
  /** 手指仍按下（安卓 setData 易误发 touchcancel，不能据此立刻 abort）。 */
  _fingerDown: false,
  /** starting 期间已收到松手/cancel：等录音真正开始后再 stop，避免红蓝来回切。 */
  _releasePending: false,
  _lastElapsedSec: -1,
  _saveAttempt: null,
  _topicOpened: false,
  _topicOpening: false,
  _matrixUnsub: null,
  _meterTimer: 0,
  _lastMeterAt: 0,

  onLoad() {
    var self = this;
    var snap = session.snapshot();
    if (!session.isSignedIn()) return;
    var owner = ownerKey(snap);
    this._outbox = fieldOutbox.fieldOutbox(owner);
    this._journal = fieldJournal.fieldJournal(owner);
    this._capture = fieldAudio.createFieldAudioCapture(
      function (phase) {
        if (!self._alive) return;
        if (phase === 'recording') {
          // startHold().then 统一落 UI；此处再 setData 会在安卓上叠一次重绘触发 touchcancel。
          return;
        }
        if (phase === 'starting') {
          return;
        }
        if (phase === 'idle' || phase === 'stopping') {
          self.clearVoiceMeter();
        }
        // 对齐 App nativeFieldAudio idle：非主动取消时的中断
        if (
          phase === 'idle' &&
          (self.data.phase === 'starting' || self.data.phase === 'recording')
        ) {
          self._holdSpeaker = '';
          self._fingerDown = false;
          self._releasePending = false;
          self.setData({
            phase: 'idle',
            note: '录音已中断，请重新按住说话。',
            heldTurn: null,
            holdingSpeaker: '',
          });
          self.refreshShown();
          self.refreshStatus();
          self.refreshSpeakButtons();
        }
      },
      function (level, elapsedMs) {
        if (!self._alive) return;
        // 振幅用 CSS 动画，避免 80ms setData 在安卓上打断 touch。
        // 计时文案最多每秒刷新一次。
        var sec = Math.max(0, Math.floor(elapsedMs / 1000));
        if (sec === self._lastElapsedSec) return;
        self._lastElapsedSec = sec;
        self.setData({
          voiceElapsed: sec + '″',
          showVoiceMeter: true,
        });
      }
    );
    var topicKey = idempotency.uuidV4();
    var recoveryError = '';
    var turn = null;
    try {
      var pending = this._outbox.read();
      if (pending) {
        topicKey = pending.topic;
        turn = Object.assign({ recognized: true }, pending.value);
        this._saveAttempt = {
          key: pending.key,
          value: Object.assign({ recognized: true }, pending.value),
        };
        this.setData({
          note: '发现本机待确认交流，可继续翻译并确认。',
        });
      }
    } catch (e) {
      recoveryError =
        (e && e.message) ||
        '无法读取本机待保存交流，暂不能开始新话题，请保留本机数据并重试。';
    }
    this.setData({
      topicKey: topicKey,
      turn: turn,
      heldTurn: null,
      savedTurnKey: '',
      recoveryError: recoveryError,
      hasDraft: Boolean(turn && turn.original && turn.original.trim()),
      sameLanguage: this.data.mine === this.data.guest,
    });
    this.refreshLabels();
    this.refreshShown();
    this.refreshSpeakButtons();
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    this.loadSpeechCaps();
    matrixRuntime.ensureStarted();
    if (this._matrixUnsub) this._matrixUnsub();
    this._matrixUnsub = matrixRuntime.subscribe(
      function (snap) {
        if (!this._alive) return;
        this.setData({ matrixReady: !!(snap && snap.ready) });
        if (snap && snap.ready) this.ensureTopicOpen();
      }.bind(this)
    );
    this.setData({ matrixReady: matrixRuntime.isReady() });
    this.ensureTopicOpen();
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  onHide() {
    this._alive = false;
    this._reqGen += 1;
    this.cancelVoice();
    if (this._matrixUnsub) {
      this._matrixUnsub();
      this._matrixUnsub = null;
    }
  },

  onUnload() {
    this._alive = false;
    this._reqGen += 1;
    this.cancelVoice();
    if (this._matrixUnsub) {
      this._matrixUnsub();
      this._matrixUnsub = null;
    }
    var topicKey = this.data.topicKey;
    var hasPending = !!this._saveAttempt || !!this._outbox.read();
    if (this._topicOpened && topicKey && !hasPending) {
      matrixRuntime.closeFieldTopic(topicKey).catch(function () {});
      try {
        this._journal.remove(topicKey);
      } catch (e) {
        /* ignore */
      }
    }
    this.clearVoicePlayback();
  },

  /**
   * 对齐 App：pause + 清空 voiceUrl；销毁 InnerAudio 并删除临时 mp3。
   */
  clearVoicePlayback() {
    if (this._audio) {
      try {
        this._audio.stop();
      } catch (e0) {
        /* ignore */
      }
      try {
        this._audio.destroy();
      } catch (e) {
        /* ignore */
      }
      this._audio = null;
    }
    var path = this._voicePath;
    this._voicePath = '';
    if (this.data.voiceSrc || this.data.voicePlaying || this.data.voicePaused) {
      this.setData({
        voiceSrc: '',
        voicePlaying: false,
        voicePaused: false,
      });
    }
    if (path) {
      try {
        wx.getFileSystemManager().unlink({ filePath: path });
      } catch (e2) {
        /* ignore */
      }
    }
  },

  /**
   * @param {string} path 本地 mp3
   */
  startInnerVoice(path) {
    var self = this;
    if (this._audio) {
      try {
        this._audio.stop();
      } catch (e0) {
        /* ignore */
      }
      try {
        this._audio.destroy();
      } catch (e1) {
        /* ignore */
      }
      this._audio = null;
    }
    var audio = wx.createInnerAudioContext();
    audio.src = path;
    audio.onPlay(function () {
      if (!self._alive || self._voicePath !== path) return;
      self.setData({ voicePlaying: true, voicePaused: false });
    });
    audio.onPause(function () {
      if (!self._alive || self._voicePath !== path) return;
      self.setData({ voicePlaying: false, voicePaused: true });
    });
    audio.onStop(function () {
      if (!self._alive || self._voicePath !== path) return;
      self.setData({ voicePlaying: false, voicePaused: false });
    });
    audio.onEnded(function () {
      if (!self._alive || self._voicePath !== path) return;
      // 保留 voiceSrc，便于「继续」从头再听（对齐 App controls 可重播）
      self.setData({ voicePlaying: false, voicePaused: false });
    });
    audio.onError(function () {
      if (!self._alive) return;
      self.onVoiceError();
    });
    this._audio = audio;
    this._voicePath = path;
    this.setData({
      voiceSrc: path,
      voicePlaying: true,
      voicePaused: false,
    });
    try {
      audio.play();
    } catch (e2) {
      this.onVoiceError();
    }
  },

  /** 暂停 ↔ 继续（pause 后再 play 从断点续播；播完后再 play 从头） */
  toggleVoicePause() {
    if (!this._audio || !this.data.voiceSrc) return;
    try {
      if (this.data.voicePlaying) {
        this._audio.pause();
      } else {
        this._audio.play();
      }
    } catch (e) {
      this.onVoiceError();
    }
  },

  onVoiceError() {
    this.clearVoicePlayback();
    this.setData({ note: '朗读音频无法播放，请重新准备朗读。' });
  },

  ensureTopicOpen() {
    var self = this;
    if (
      this.data.recoveryError ||
      this._topicOpened ||
      this.data.topicAccess ||
      this._topicOpening
    ) {
      return;
    }
    if (!matrixRuntime.isReady()) {
      this.setData({
        note: '消息服务连接中，准备现场话题…',
        matrixReady: false,
        topicPrepFailed: false,
      });
      return;
    }
    var topicKey = this.data.topicKey;
    try {
      this._journal.add(topicKey);
    } catch (e) {
      this.setData({
        note: (e && e.message) || '话题清单暂不可用',
        topicPrepFailed: true,
      });
      return;
    }
    this._topicOpening = true;
    this.setData({ topicPrepFailed: false, matrixReady: true });
    matrixRuntime
      .openFieldTopic(topicKey)
      .then(function (room) {
        self._topicOpening = false;
        if (!self._alive) return;
        self._topicOpened = true;
        self.setData({
          topicAccess: true,
          topicPrepFailed: false,
          savedRoom: room || '',
          note: '',
        });
        self.refreshStatus();
        self.refreshSpeakButtons();
        if (self._saveAttempt && self._saveAttempt.value) {
          var attempt = self._saveAttempt;
          self._saveAttempt = null;
          return self.persistConfirmed(attempt.value, attempt.key);
        }
      })
      .catch(function (err) {
        self._topicOpening = false;
        if (!self._alive) return;
        self.setData({
          topicAccess: false,
          topicPrepFailed: true,
          note:
            (err && err.message) ||
            '话题暂未准备好，请保留本机数据并检查网络后重试。',
        });
        self.refreshSpeakButtons();
      });
  },

  /** 对齐 App FieldTalk lifecycleRetry */
  retryTopicPrep() {
    if (this.data.topicAccess || this.data.recoveryError || this._topicOpening) {
      return;
    }
    this._topicOpened = false;
    this.setData({ topicPrepFailed: false, note: '' });
    this.ensureTopicOpen();
  },

  /** 对齐 App FieldTalk cancel：中断识别/翻译/朗读 */
  cancelBusyOp() {
    this._reqGen += 1;
    this.cancelVoice();
    this.setData({
      busy: false,
      translating: false,
      phase: 'idle',
      heldTurn: null,
      holdingSpeaker: '',
      note: '',
    });
    this.refreshShown();
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  refreshLabels() {
    var opts = this.data.langOptions;
    this.setData({
      mineIndex: this.langIndex(this.data.mine),
      guestIndex: this.langIndex(this.data.guest),
      mineLabel: langLabel(this.data.mine, opts),
      guestLabel: langLabel(this.data.guest, opts),
      sameLanguage: this.data.mine === this.data.guest,
    });
  },

  langIndex(code) {
    var i = this.data.langOptions.findIndex(function (o) {
      return o.value === code;
    });
    return i < 0 ? 0 : i;
  },

  noop() {},

  langSupported(code) {
    var list = this.data.supportedLanguages;
    if (!list || !list.length) return true;
    return list.indexOf(code) !== -1;
  },

  refreshShown() {
    var d = this.data;
    var keep =
      d.heldTurn &&
      (d.phase === 'starting' ||
        d.phase === 'recording' ||
        d.phase === 'recognizing');
    var shown = keep ? d.heldTurn : d.turn;
    this.setData({
      shownTurn: shown,
      utteranceHeld: Boolean(keep),
    });
  },

  refreshSpeakButtons() {
    var d = this.data;
    var voiceOk =
      d.speechAvailable &&
      d.consent &&
      !d.recoveryError &&
      d.topicAccess &&
      this.langSupported(d.mine) &&
      this.langSupported(d.guest);
    var phase = d.phase;
    var holding = phase === 'starting' || phase === 'recording';
    var pipelineBusy =
      d.busy ||
      d.translating ||
      phase === 'recognizing' ||
      phase === 'translating' ||
      phase === 'synthesizing';

    // 对齐 App：按住全过程文案保持「按住说话」；录音态用手感色 + 顶栏状态提示「松开后翻译」。
    // 微信在 touch 过程中改按钮文案极易 touchcancel，不能照搬 App 的「松开翻译」切换。
    function label(speaker) {
      return (speaker === 'mine' ? '我' : '对方') + ' · 按住说话';
    }

    function disabled(speaker) {
      if (!voiceOk) return true;
      if (pipelineBusy && !(holding && d.turn && d.turn.speaker === speaker)) {
        return true;
      }
      return false;
    }

    this.setData({
      speakMineLabel: label('mine'),
      speakGuestLabel: label('guest'),
      speakMineDisabled: disabled('mine'),
      speakGuestDisabled: disabled('guest'),
      blockScanSwitch: this.hasUnsavedDraft(),
      canPlayVoice: Boolean(
        d.turn &&
          d.turn.translated &&
          d.consent &&
          d.speechAvailable &&
          d.savedTurnKey === this.turnIdentity(d.turn)
      ),
    });
  },

  refreshStatus() {
    var d = this.data;
    // 对齐 App FieldTalk：consent 未开时也显示 phase 文案（idle = 轮流按住说话）
    var statusText = PHASE_LABEL.idle;
    if (!d.speechLoaded) statusText = '检查语音服务…';
    else if (!d.scan && !d.topicAccess && !d.recoveryError) {
      statusText = '准备现场话题…';
    } else if (!d.speechAvailable) {
      statusText = '语音翻译尚未开放；同语种可输入文字。';
    } else if (PHASE_LABEL[d.phase]) statusText = PHASE_LABEL[d.phase];

    // 对齐 App：本轮已保存 → 待保存 → 话题已创建/正在创建
    var saveBadge = '正在创建话题';
    if (d.turn && d.savedTurnKey === this.turnIdentity(d.turn)) {
      saveBadge = '本轮已保存';
    } else if (d.turn && d.turn.translated) {
      saveBadge = '待保存 · 可重试';
    } else if (d.savedRoom) {
      saveBadge = '话题已创建 · 自动保存';
    }

    this.setData({ statusText: statusText, saveBadge: saveBadge });
  },

  turnIdentity(turn) {
    if (!turn) return '';
    return [
      turn.speaker,
      turn.source,
      turn.target,
      turn.original,
      turn.translated,
    ].join('\u0001');
  },

  loadSpeechCaps() {
    var self = this;
    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return fieldEncounters.fieldCapabilities(opened.token);
      })
      .then(function (cap) {
        if (!self._alive) return;
        self.setData({
          speechAvailable: Boolean(cap.speech),
          supportedLanguages: cap.speechLanguages || [],
          speechLoaded: true,
        });
        self.refreshStatus();
        self.refreshSpeakButtons();
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          speechLoaded: true,
          note: '暂时无法检查语音服务；同语种文字仍可使用。',
        });
        self.refreshStatus();
        self.refreshSpeakButtons();
      });
  },

  setModeFace() {
    if (
      this.data.busy ||
      this.data.translating ||
      this.data.scanPrepared ||
      this.isHolding()
    ) {
      return;
    }
    this.setData({ scan: false });
  },

  setModeScan() {
    if (this.data.busy || this.data.translating || this.isHolding()) return;
    // 对齐 App 顶栏「扫码交流」：有未确认原文时禁用/拦截（「不等了」走 skipWaitToScan）
    if (this.hasUnsavedDraft()) {
      this.setData({ note: '请先确认当前文字，或清空后再切换扫码交流。' });
      return;
    }
    this.applyScanMode();
  },

  /**
   * 对齐 App「不等了，先用扫码交流」：话题准备中也可立刻切扫码，不因本机待确认草稿卡住。
   * （准备态界面无法确认文字，用 setModeScan 草稿门禁会造成死路。）
   */
  skipWaitToScan() {
    this.applyScanMode();
  },

  hasUnsavedDraft() {
    var turn = this.data.turn;
    return Boolean(
      turn &&
        turn.original &&
        String(turn.original).trim() &&
        this.data.savedTurnKey !== this.turnIdentity(turn)
    );
  },

  applyScanMode() {
    // 对齐 App：cancel() 后切扫码；中断面对面录音/朗读，勿把当面轮次 UI 状态带进扫码屏
    this._reqGen += 1;
    this._holdSpeaker = '';
    this.cancelVoice();
    this.setData({
      scan: true,
      note: '',
      busy: false,
      translating: false,
      phase: 'idle',
      heldTurn: null,
      holdingSpeaker: '',
      statusText: PHASE_LABEL.idle,
    });
    this.refreshShown();
    this.refreshSpeakButtons();
  },

  onScanPrepared() {
    this.setData({ scanPrepared: true });
  },

  openFieldRoom() {
    var room = this.data.savedRoom;
    if (!room) return;
    deepLink.openRoom(room).catch(function () {
      wx.showToast({ title: '无法打开会话', icon: 'none' });
    });
  },

  goGuestJoin() {
    wx.navigateTo({ url: '/pages/connect/join/index' });
  },

  goHostInvite() {
    var room = this.data.savedRoom;
    if (!room) {
      wx.showToast({ title: '话题尚未就绪', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url:
        '/pages/connect/host/index?room=' +
        encodeURIComponent(room) +
        '&create=1',
    });
  },

  toggleFace() {
    this.setData({ faceFlipped: !this.data.faceFlipped });
  },

  enableConsent() {
    this.setData({ consent: true });
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  disableConsent() {
    this._reqGen += 1;
    this.cancelVoice();
    this.setData({
      consent: false,
      translating: false,
      busy: false,
      phase: 'idle',
    });
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  onMineLang(e) {
    if (this.data.busy || this.data.translating || this.isHolding()) return;
    var opt = this.data.langOptions[Number(e.detail.value)];
    if (!opt) return;
    this._reqGen += 1;
    this.cancelVoice();
    this.setData({
      mine: opt.value,
      turn: null,
      savedTurnKey: '',
      hasDraft: false,
      phase: 'idle',
    });
    this.refreshLabels();
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  onGuestLang(e) {
    if (this.data.busy || this.data.translating || this.isHolding()) return;
    var opt = this.data.langOptions[Number(e.detail.value)];
    if (!opt) return;
    this._reqGen += 1;
    this.cancelVoice();
    this.setData({
      guest: opt.value,
      turn: null,
      savedTurnKey: '',
      hasDraft: false,
      phase: 'idle',
    });
    this.refreshLabels();
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  isHolding() {
    var p = this.data.phase;
    return p === 'starting' || p === 'recording';
  },

  cancelVoice() {
    this._holdSpeaker = '';
    this._fingerDown = false;
    this._releasePending = false;
    this._lastElapsedSec = -1;
    this.clearVoiceMeter();
    // 对齐 App cancel()：先落 idle，再 cancel capture，避免 idle 回调误报「录音已中断」。
    if (this.isHolding()) {
      this.setData({ phase: 'idle', heldTurn: null, holdingSpeaker: '' });
      this.refreshShown();
    }
    if (this._capture) this._capture.cancel();
    this.clearVoicePlayback();
  },

  clearVoiceMeter() {
    if (this._meterTimer) {
      clearInterval(this._meterTimer);
      this._meterTimer = 0;
    }
    if (this.data.showVoiceMeter || this.data.voiceMeter || this.data.voiceElapsed) {
      this.setData({
        showVoiceMeter: false,
        voiceMeter: 0,
        voiceMeterPct: 0,
        voiceElapsed: '',
      });
    }
  },

  enterText(e) {
    if (
      this.data.recoveryError ||
      this.data.busy ||
      this.data.translating ||
      this.isHolding()
    ) {
      return;
    }
    var speaker = e.currentTarget.dataset.speaker;
    if (speaker !== 'mine' && speaker !== 'guest') return;
    var mine = this.data.mine;
    var guest = this.data.guest;
    var turn = {
      speaker: speaker,
      source: speaker === 'mine' ? mine : guest,
      target: speaker === 'mine' ? guest : mine,
      recognized: true,
      original: '',
      translated: '',
    };
    this.clearVoicePlayback();
    this.setData({
      turn: turn,
      heldTurn: null,
      savedTurnKey: '',
      hasDraft: false,
      note: '',
      phase: 'idle',
    });
    this.refreshShown();
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  onOriginalInput(e) {
    var turn = this.data.turn;
    if (!turn || !turn.recognized) return;
    if (this.isHolding() || this.data.phase === 'recognizing') return;
    // 对齐 App：更正原文时 pause + 清 voiceUrl
    this.clearVoicePlayback();
    var updated = Object.assign({}, turn, {
      original: e.detail.value,
      translated: '',
    });
    this.setData({
      turn: updated,
      savedTurnKey: '',
      hasDraft: Boolean(String(e.detail.value || '').trim()),
      canPlayVoice: false,
    });
    this.refreshShown();
    this.refreshStatus();
    this.refreshSpeakButtons();
  },

  onHoldStart(e) {
    var speaker = e.currentTarget.dataset.speaker;
    if (speaker === 'mine' && this.data.speakMineDisabled) return;
    if (speaker === 'guest' && this.data.speakGuestDisabled) return;
    this._fingerDown = true;
    this._releasePending = false;
    this.startHold(speaker);
  },

  /** 吞掉 touchmove，避免页面滚动把按住说话 cancel 掉。 */
  onHoldMove() {},

  onHoldEnd() {
    this._fingerDown = false;
    this.endHold({ fromCancel: false });
  },

  /**
   * 安卓微信：按住期间 setData/震动常误发 touchcancel。
   * starting：忽略（勿 abort、勿记松手），否则红蓝来回切或一开录就被停。
   * recording：部分机型松手只发 cancel，按松手送识别。
   */
  onHoldCancel() {
    if (this.data.phase === 'starting') return;
    this._fingerDown = false;
    this.endHold({ fromCancel: true });
  },

  startHold(speaker) {
    var self = this;
    if (
      !this._capture ||
      this.data.recoveryError ||
      !this.data.speechAvailable ||
      !this.data.consent ||
      this.data.phase !== 'idle' ||
      this.data.busy ||
      this.data.translating
    ) {
      return;
    }
    if (!this.langSupported(this.data.mine) || !this.langSupported(this.data.guest)) {
      this.setData({ note: '暂不支持所选语言。' });
      return;
    }
    this._holdSpeaker = speaker;
    this._releasePending = false;
    this._lastElapsedSec = 0;
    this._reqGen += 1;
    this.clearVoicePlayback();
    var prev = this.data.turn;
    var held = prev && prev.recognized ? prev : null;
    var turn = {
      speaker: speaker,
      source: speaker === 'mine' ? this.data.mine : this.data.guest,
      target: speaker === 'mine' ? this.data.guest : this.data.mine,
      recognized: false,
      original: '',
      translated: '',
    };
    var shown = held || turn;
    // 按下时一次 setData 写完展示与状态；按住期间禁止再改说话按钮相关字段。
    // 对齐参考态：按下即红钮 + 振幅条占位，避免「假死」感（录音开始后再脉冲刷新）。
    this.setData({
      turn: turn,
      heldTurn: held,
      holdingSpeaker: speaker,
      shownTurn: shown,
      utteranceHeld: Boolean(held),
      savedTurnKey: '',
      hasDraft: false,
      note: '',
      phase: 'starting',
      statusText: PHASE_LABEL.starting,
      canPlayVoice: false,
      showVoiceMeter: true,
      voiceMeter: 0.12,
      voiceMeterPct: 12,
      voiceElapsed: '0″',
    });
    this._capture
      .start()
      .then(function () {
        if (!self._alive || self._holdSpeaker !== speaker) {
          self._capture.cancel();
          return;
        }
        self.setData({
          phase: 'recording',
          showVoiceMeter: true,
          statusText: PHASE_LABEL.recording,
        });
        // starting 期间已松手/误 cancel：录音一就绪立刻送出，避免卡在红钮或来回切。
        if (self._releasePending || !self._fingerDown) {
          self._releasePending = false;
          self.endHold({ fromCancel: false });
        }
      })
      .catch(function (err) {
        if (!self._alive) return;
        self._holdSpeaker = '';
        self._fingerDown = false;
        self._releasePending = false;
        var code = err && err.code;
        var note =
          code === fieldAudio.MIC_READY_RETRY
            ? fieldAudio.MIC_READY_RETRY_MSG
            : (err && err.message) || '未能开始录音，请重新按住说话。';
        self.setData({
          phase: 'idle',
          heldTurn: null,
          holdingSpeaker: '',
          showVoiceMeter: false,
          voiceMeter: 0,
          voiceMeterPct: 0,
          voiceElapsed: '',
          note: note,
        });
        self.refreshShown();
        self.refreshStatus();
        self.refreshSpeakButtons();
      });
  },

  endHold(opts) {
    var self = this;
    var speaker = this._holdSpeaker;
    var turn = this.data.turn;
    var phase = this.data.phase;
    if (!this._capture) return;
    // 授权弹窗会打断 touch：松手时不要 cancel，让 ensureMicAuth 走完并提示「再次按住」。
    if (phase === 'starting' && this._capture.authPending) {
      this._holdSpeaker = '';
      this._fingerDown = false;
      this._releasePending = false;
      this.setData({
        holdingSpeaker: '',
      });
      return;
    }
    if (!speaker || !turn) return;
    if (phase === 'starting') {
      // 真松手或误 cancel：记 pending，等 onStart 后再 stop；勿立刻 abort（安卓会红蓝闪）。
      this._releasePending = true;
      this._fingerDown = false;
      return;
    }
    if (phase !== 'recording') return;
    this._holdSpeaker = '';
    this._fingerDown = false;
    this._releasePending = false;
    var gen = ++this._reqGen;
    this.setData({
      phase: 'recognizing',
      busy: true,
      note: '',
      holdingSpeaker: '',
    });
    this.refreshShown();
    this.refreshStatus();
    this.refreshSpeakButtons();

    var snap = session.snapshot();
    this._capture
      .stop()
      .then(function (capture) {
        if (!self._alive || gen !== self._reqGen) return null;
        return creator.loadCreatorSession(snap).then(function (opened) {
          return fieldSpeech
            .speechRequest(opened.token, 'recognize', {
              audioBase64: capture.base64,
              sourceLanguage: turn.source,
            })
            .then(function (result) {
              return { opened: opened, text: result.text };
            });
        });
      })
      .then(function (bundle) {
        if (!bundle || !self._alive || gen !== self._reqGen) return;
        var recognized = Object.assign({}, turn, {
          recognized: true,
          original: bundle.text,
          translated: '',
        });
        self.setData({
          turn: recognized,
          heldTurn: null,
          phase: 'translating',
        });
        self.refreshShown();
        self.refreshStatus();
        return fieldTranslation
          .translateFieldText(
            recognized.original,
            recognized.source,
            recognized.target,
            function (text) {
              return fieldSpeech
                .speechRequest(bundle.opened.token, 'translate', {
                  sourceText: text,
                  sourceLanguage: recognized.source,
                  targetLanguage: recognized.target,
                })
                .then(function (r) {
                  return r.text;
                });
            }
          )
          .then(function (translated) {
            if (!self._alive || gen !== self._reqGen) return;
            var updated = Object.assign({}, recognized, {
              translated: translated,
            });
            return self.persistConfirmed(updated).then(function () {
              if (!self._alive || gen !== self._reqGen) return;
              self.setData({
                turn: updated,
                heldTurn: null,
                savedTurnKey: self.turnIdentity(updated),
                hasDraft: false,
                busy: false,
                translating: false,
                phase: 'idle',
                note: '本轮已保存到节点现场话题。',
              });
              self.refreshShown();
              self.refreshStatus();
              self.refreshSpeakButtons();
            });
          });
      })
      .catch(function (err) {
        if (!self._alive || gen !== self._reqGen) return;
        self._holdSpeaker = '';
        self._fingerDown = false;
        self._releasePending = false;
        self.setData({
          busy: false,
          translating: false,
          phase: 'idle',
          heldTurn: null,
          holdingSpeaker: '',
          note: (err && err.message) || '本次处理失败。',
        });
        self.refreshShown();
        self.refreshStatus();
        self.refreshSpeakButtons();
      });
  },

  confirmOrTranslate() {
    var self = this;
    var turn = this.data.turn;
    if (
      !turn ||
      !turn.original ||
      !turn.original.trim() ||
      this.data.busy ||
      this.data.translating ||
      this.data.recoveryError ||
      !this.data.topicAccess ||
      this.isHolding()
    ) {
      return;
    }
    if (this.data.savedTurnKey === this.turnIdentity(turn) && turn.translated) {
      return;
    }
    var cross = turn.source !== turn.target;
    if (cross && (!this.data.consent || !this.data.speechAvailable)) {
      this.setData({
        note: '跨语种需开启语音翻译能力并告知对方；同语种可直接确认。',
      });
      return;
    }

    var gen = ++this._reqGen;
    this.setData({
      translating: true,
      busy: true,
      phase: 'translating',
      note: '',
    });
    this.refreshStatus();
    this.refreshSpeakButtons();

    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return fieldTranslation.translateFieldText(
          turn.original,
          turn.source,
          turn.target,
          function (text) {
            return fieldSpeech
              .speechRequest(opened.token, 'translate', {
                sourceText: text,
                sourceLanguage: turn.source,
                targetLanguage: turn.target,
              })
              .then(function (result) {
                return result.text;
              });
          }
        );
      })
      .then(function (translated) {
        if (!self._alive || gen !== self._reqGen) return;
        var updated = Object.assign({}, turn, {
          translated: translated,
          recognized: true,
        });
        return self.persistConfirmed(updated).then(function () {
          if (!self._alive || gen !== self._reqGen) return;
          // 必须同步 shownTurn：否则对侧仍显示「等待翻译」，
          // 而 canPlayVoice 已按 turn.translated 亮起「准备朗读」。
          self.setData({
            turn: updated,
            savedTurnKey: self.turnIdentity(updated),
            hasDraft: false,
            translating: false,
            busy: false,
            phase: 'idle',
            note: '本轮已保存到节点现场话题。',
          });
          self.refreshShown();
          self.refreshStatus();
          self.refreshSpeakButtons();
        });
      })
      .catch(function (err) {
        if (!self._alive || gen !== self._reqGen) return;
        self.setData({
          translating: false,
          busy: false,
          phase: 'idle',
          note: (err && err.message) || '本次处理失败。',
        });
        self.refreshStatus();
        self.refreshSpeakButtons();
      });
  },

  playSynthesis() {
    var self = this;
    var turn = this.data.turn;
    if (
      !turn ||
      !turn.translated ||
      !this.data.consent ||
      !this.data.speechAvailable ||
      this.data.busy ||
      this.data.translating ||
      this.isHolding()
    ) {
      return;
    }
    var gen = ++this._reqGen;
    this.clearVoicePlayback();
    this.setData({ phase: 'synthesizing', busy: true, note: '' });
    this.refreshStatus();
    this.refreshSpeakButtons();
    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return fieldSpeech.speechRequest(opened.token, 'synthesize', {
          translatedText: turn.translated,
          targetLanguage: turn.target,
        });
      })
      .then(function (result) {
        if (!self._alive || gen !== self._reqGen) return;
        var fs = wx.getFileSystemManager();
        var path =
          wx.env.USER_DATA_PATH +
          '/field-tts-' +
          Date.now() +
          '.mp3';
        fs.writeFile({
          filePath: path,
          data: result.audioBase64,
          encoding: 'base64',
          success: function () {
            if (!self._alive || gen !== self._reqGen) {
              try {
                fs.unlink({ filePath: path });
              } catch (e0) {
                /* ignore */
              }
              return;
            }
            // 对齐 App 可暂停：InnerAudioContext + 暂停/继续（微信 <audio> 已废弃且真机常无控件）
            self.setData({
              busy: false,
              phase: 'idle',
              note: '',
            });
            self.startInnerVoice(path);
            self.refreshStatus();
            self.refreshSpeakButtons();
          },
          fail: function () {
            self.setData({
              busy: false,
              phase: 'idle',
              note: '朗读结果无法播放，请重试。',
            });
            self.refreshStatus();
            self.refreshSpeakButtons();
          },
        });
      })
      .catch(function (err) {
        if (!self._alive || gen !== self._reqGen) return;
        self.setData({
          busy: false,
          phase: 'idle',
          note: (err && err.message) || '本次处理失败。',
        });
        self.refreshStatus();
        self.refreshSpeakButtons();
      });
  },

  persistConfirmed(turn, recordKey) {
    var self = this;
    if (this._saveLock) {
      return Promise.reject(new Error('正在保存，请稍候。'));
    }
    if (!turn || !turn.translated) {
      return Promise.reject(new Error('交流记录无效'));
    }
    if (!this.data.topicAccess && !matrixRuntime.isReady()) {
      return Promise.reject(new Error('消息服务尚未就绪'));
    }
    this._saveLock = true;
    var topicKey = this.data.topicKey;
    var key = recordKey || (this._saveAttempt && this._saveAttempt.key) || idempotency.uuidV4();
    var value = {
      speaker: turn.speaker,
      source: turn.source,
      target: turn.target,
      original: turn.original,
      translated: turn.translated,
    };
    if (turn.replaces) value.replaces = turn.replaces;
    this._saveAttempt = { key: key, value: value };
    var durable = false;
    return Promise.resolve()
      .then(function () {
        self._outbox.write({
          topic: topicKey,
          key: key,
          value: value,
        });
        durable = true;
        return matrixRuntime.saveFieldRecord(topicKey, key, value);
      })
      .then(function (result) {
        try {
          self._outbox.clear(key);
        } catch (e) {
          /* ignore */
        }
        self._saveAttempt = null;
        var saved = Object.assign({}, value, {
          replaces: value.replaces || (result && result.eventId),
          recognized: true,
        });
        if (self._alive) {
          self.setData({
            turn: saved,
            savedRoom: (result && result.roomId) || self.data.savedRoom,
            savedTurnKey: self.turnIdentity(saved),
          });
        }
        return result;
      })
      .catch(function (err) {
        var msg = durable
          ? '保存尚未确认，请重试；本机待保存记录会在返回此页后继续尝试。'
          : '本机暂存失败或另有待保存交流，请勿退出，保留当前文字并重试。';
        throw Object.assign(new Error((err && err.message) || msg), {
          durable: durable,
        });
      })
      .finally(function () {
        self._saveLock = false;
      });
  },

  openEndDialog() {
    if (this.data.busy || this.data.translating || this.isHolding()) return;
    // 对齐 App：结束前 pause 朗读
    this.clearVoicePlayback();
    var turn = this.data.turn;
    var hasDraft = Boolean(
      turn &&
        turn.original &&
        turn.original.trim() &&
        this.data.savedTurnKey !== this.turnIdentity(turn)
    );
    this.setData({ ending: true, hasDraft: hasDraft });
  },

  continueTalk() {
    this.setData({ ending: false });
  },

  endToCard() {
    this.cancelVoice();
    this.setData({ ending: false });
    wx.redirectTo({ url: '/pages/connect/card/index' });
  },

  endToConnect() {
    this.cancelVoice();
    this.setData({ ending: false });
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/connect/index' });
      },
    });
  },
});
