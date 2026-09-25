/**
 * 微信 RecorderManager 封装 · 对齐 App FieldAudioCapture 边界
 * - AAC 单声道，最长 60s，解码后 ≤1 MiB
 * - 停止后读临时文件 → ADTS remux M4A（ftyp）→ base64
 * - 最短有效录音 250ms；振幅用计时脉冲（AAC 不可用 frameSize）
 * - 取消/切后台中断当前录音
 *
 * 录音参数（曾导致「授权后仍未能开始录音」）：
 * - 微信文档：frameSize **仅支持 mp3/pcm**；AAC + frameSize 会在已授权后 onError
 * - 因此 format=aac 时禁止传 frameSize
 *
 * 麦克风权限（修双弹窗 + 按住打断）：
 * - 已授权：直接 start，不再 authorize
 * - 未问过：只弹一次 authorize；**本手势不启动录音**，提示再次按住
 *   （authorize 弹窗会打断 touch，若同手势再 start 会失败 / 再弹一次）
 * - 已拒绝：引导去设置，不重复弹 authorize
 */
const remux = require('../utils/adts-to-m4a');
const idempotency = require('../utils/idempotency');

var MIN_DURATION_MS = 250;
var MAX_DURATION_MS = 60000;

/** 权限刚开好，需用户再次按住说话（非失败）。 */
var MIC_READY_RETRY = 'MIC_READY_RETRY';
var MIC_READY_RETRY_MSG = '麦克风已开启，请再次按住说话。';

function validCapture(value, id) {
  if (!value || typeof value !== 'object') return false;
  return (
    value.id === id &&
    value.mimeType === 'audio/mp4' &&
    Number.isInteger(value.durationMs) &&
    value.durationMs >= MIN_DURATION_MS &&
    value.durationMs <= MAX_DURATION_MS &&
    typeof value.base64 === 'string' &&
    value.base64.length > 0 &&
    value.base64.length <= 1398104 &&
    value.base64.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value.base64)
  );
}

function toBase64(arrayBuffer) {
  if (typeof wx !== 'undefined' && wx.arrayBufferToBase64) {
    return wx.arrayBufferToBase64(arrayBuffer);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(arrayBuffer).toString('base64');
  }
  return remux.uint8ToBase64(new Uint8Array(arrayBuffer));
}

function micDeniedError() {
  return new Error('未能开始录音，请检查麦克风权限后重新按住说话。');
}

function micBusyError() {
  return new Error('上一段录音还没结束，请稍等再按住说话。');
}

function micStartFailedError() {
  return new Error('麦克风暂时用不了，可能正被通话或其他应用占用，请稍后再按住说话。');
}

function micReadyRetryError() {
  var err = new Error(MIC_READY_RETRY_MSG);
  err.code = MIC_READY_RETRY;
  return err;
}

/** 把 RecorderManager.onError 文案映射成可操作提示，避免一律甩锅「麦克风权限」。 */
function mapRecorderError(res) {
  var msg = String((res && (res.errMsg || res.message)) || '');
  if (
    /auth\s*deny|authorize|permission|scope\.record|未授权|没有权限|隐私|privacy/i.test(
      msg
    )
  ) {
    return micDeniedError();
  }
  if (/busy|is recording|already|正在录音/i.test(msg)) {
    return micBusyError();
  }
  if (msg) return micStartFailedError();
  return micDeniedError();
}

/**
 * 基础库隐私协议（若有）。已同意则立刻成功；弹窗会打断按住手势。
 * @returns {Promise<void>}
 */
function ensurePrivacyAuth() {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined') {
      reject(micDeniedError());
      return;
    }
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve();
      return;
    }
    wx.requirePrivacyAuthorize({
      success: function () {
        resolve();
      },
      fail: function () {
        reject(micDeniedError());
      },
    });
  });
}

/**
 * @returns {Promise<'granted'|'denied'|'unknown'>}
 */
function probeMicAuth() {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || !wx.getSetting) {
      reject(micDeniedError());
      return;
    }
    wx.getSetting({
      success: function (res) {
        var setting =
          res && res.authSetting ? res.authSetting['scope.record'] : undefined;
        if (setting === true) resolve('granted');
        else if (setting === false) resolve('denied');
        else resolve('unknown');
      },
      fail: function () {
        reject(micDeniedError());
      },
    });
  });
}

/**
 * 仅在从未询问过时调用；已拒绝不要再 authorize（微信不会再弹窗）。
 * @param {{ openSetting?: boolean }} [opts]
 * @returns {Promise<void>}
 */
function requestMicAuth(opts) {
  var openIfDenied = Boolean(opts && opts.openSetting);
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || !wx.authorize) {
      reject(micDeniedError());
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: function () {
        resolve();
      },
      fail: function () {
        if (!openIfDenied || typeof wx.openSetting !== 'function') {
          reject(micDeniedError());
          return;
        }
        wx.openSetting({
          success: function (res) {
            if (res && res.authSetting && res.authSetting['scope.record']) {
              resolve();
            } else {
              reject(micDeniedError());
            }
          },
          fail: function () {
            reject(micDeniedError());
          },
        });
      },
    });
  });
}

/**
 * 启动录音前的权限门：
 * - granted → 放行（同手势可 start）
 * - unknown → 只弹一次授权，成功后抛 MIC_READY_RETRY（本次不录音）
 * - denied → 打开设置；若用户打开则同样 MIC_READY_RETRY
 */
function ensureMicAuth() {
  return ensurePrivacyAuth().then(function () {
    return probeMicAuth().then(function (status) {
      if (status === 'granted') return;
      if (status === 'denied') {
        return requestMicAuth({ openSetting: true }).then(function () {
          throw micReadyRetryError();
        });
      }
      // unknown：首次询问。授权弹窗会打断按住手势，故本手势只拿权限、不启动录音。
      return requestMicAuth().then(function () {
        throw micReadyRetryError();
      });
    });
  });
}

/**
 * @param {(phase:string)=>void} onPhase
 * @param {(level:number, elapsedMs:number)=>void} [onMeter]
 */
function createFieldAudioCapture(onPhase, onMeter) {
  var recorder = wx.getRecorderManager();
  var activeId = null;
  var phase = 'idle';
  var startedAt = 0;
  var stopWaiters = null;
  var startWaiters = null;
  var peakLevel = 0;
  /** 授权弹窗进行中：cancel 时不要误报「录音已中断」。 */
  var authPending = false;
  /** AAC 无 frameSize：用计时脉冲驱动振幅条，避免布局塌缩。 */
  var meterTimer = 0;

  function setPhase(next) {
    phase = next;
    if (typeof onPhase === 'function') onPhase(next);
  }

  function emitMeter() {
    if (typeof onMeter !== 'function' || !startedAt) return;
    var elapsed = Math.max(0, Date.now() - startedAt);
    onMeter(peakLevel, elapsed);
  }

  function clearMeterPulse() {
    if (meterTimer) {
      clearInterval(meterTimer);
      meterTimer = 0;
    }
  }

  function startMeterPulse() {
    clearMeterPulse();
    meterTimer = setInterval(function () {
      if (phase !== 'recording' || !startedAt) return;
      // 轻脉冲，仅作「正在录音」反馈；不假装真实音量。
      peakLevel = 0.22 + 0.28 * (0.5 + 0.5 * Math.sin(Date.now() / 160));
      emitMeter();
    }, 80);
    // Node 单测：避免 interval 拖住进程；微信环境无 unref。
    if (meterTimer && typeof meterTimer.unref === 'function') {
      meterTimer.unref();
    }
  }

  recorder.onStart(function () {
    if (!activeId || !startWaiters) return;
    setPhase('recording');
    peakLevel = 0.22;
    startMeterPulse();
    emitMeter();
    // 不在 onStart 里触发短震动：安卓微信震动常连带 touchcancel，导致按住按钮红蓝闪。
    var resolve = startWaiters.resolve;
    startWaiters = null;
    resolve();
  });

  recorder.onError(function (res) {
    clearMeterPulse();
    if (startWaiters) {
      startWaiters.reject(mapRecorderError(res));
      startWaiters = null;
    }
    if (stopWaiters) {
      stopWaiters.reject(new Error('本次录音未完成或已中断，请重新说话。'));
      stopWaiters = null;
    }
    activeId = null;
    authPending = false;
    peakLevel = 0;
    setPhase('idle');
  });

  recorder.onStop(function (res) {
    clearMeterPulse();
    var id = activeId;
    activeId = null;
    var waiters = stopWaiters;
    stopWaiters = null;
    peakLevel = 0;
    if (!waiters || !id) {
      setPhase('idle');
      return;
    }
    var durationMs = Math.round(
      typeof res.duration === 'number' ? res.duration : Date.now() - startedAt
    );
    var path = res.tempFilePath;
    if (!path) {
      setPhase('idle');
      waiters.reject(new Error('本次录音未完成或已中断，请重新说话。'));
      return;
    }
    if (durationMs < MIN_DURATION_MS) {
      setPhase('idle');
      try {
        wx.getFileSystemManager().unlink({ filePath: path });
      } catch (e0) {
        /* ignore */
      }
      waiters.reject(new Error('说话时间太短，请按住再说一会儿。'));
      return;
    }
    wx.getFileSystemManager().readFile({
      filePath: path,
      success: function (file) {
        try {
          var raw =
            file.data instanceof ArrayBuffer
              ? new Uint8Array(file.data)
              : new Uint8Array(file.data);
          var m4a = remux.adtsToM4a(raw);
          if (m4a.length > 1024 * 1024) {
            throw new Error('本次录音过长，请缩短后重试。');
          }
          var base64 = toBase64(
            m4a.buffer.slice(m4a.byteOffset, m4a.byteOffset + m4a.byteLength)
          );
          var capture = {
            id: id,
            mimeType: 'audio/mp4',
            durationMs: durationMs,
            base64: base64,
          };
          if (!validCapture(capture, id)) {
            throw new Error('本次录音未完成或已中断，请重新说话。');
          }
          setPhase('idle');
          waiters.resolve(capture);
        } catch (e) {
          setPhase('idle');
          waiters.reject(
            e instanceof Error
              ? e
              : new Error('本次录音未完成或已中断，请重新说话。')
          );
        }
        try {
          wx.getFileSystemManager().unlink({ filePath: path });
        } catch (e2) {
          /* ignore */
        }
      },
      fail: function () {
        setPhase('idle');
        waiters.reject(new Error('本次录音未完成或已中断，请重新说话。'));
      },
    });
  });

  return {
    get phase() {
      return phase;
    },
    get authPending() {
      return authPending;
    },
    start: function () {
      if (activeId) {
        return Promise.reject(new Error('请先结束当前录音。'));
      }
      var id = idempotency.uuidV4();
      activeId = id;
      authPending = true;
      setPhase('starting');
      peakLevel = 0;
      return ensureMicAuth()
        .then(function () {
          if (activeId !== id) {
            throw new Error('录音已取消，请重新按住说话。');
          }
          authPending = false;
          return new Promise(function (resolve, reject) {
            startWaiters = { resolve: resolve, reject: reject };
            startedAt = Date.now();
            try {
              // 禁止 frameSize：微信文档写明仅 mp3/pcm；AAC+frameSize 会在已授权后 onError。
              recorder.start({
                duration: MAX_DURATION_MS,
                sampleRate: 44100,
                numberOfChannels: 1,
                encodeBitRate: 96000,
                format: 'aac',
              });
            } catch (e) {
              startWaiters = null;
              activeId = null;
              setPhase('idle');
              reject(mapRecorderError(e));
            }
          });
        })
        .catch(function (err) {
          authPending = false;
          clearMeterPulse();
          if (activeId === id) {
            activeId = null;
            // 对齐 App：权限/启动失败静默复位，不经 setPhase，避免 idle 回调盖掉真实文案。
            phase = 'idle';
          }
          throw err;
        });
    },
    stop: function () {
      if (!activeId || phase !== 'recording') {
        if (phase === 'starting') this.cancel();
        return Promise.reject(new Error('录音尚未就绪，请重新按住说话。'));
      }
      setPhase('stopping');
      clearMeterPulse();
      return new Promise(function (resolve, reject) {
        stopWaiters = { resolve: resolve, reject: reject };
        try {
          recorder.stop();
        } catch (e) {
          stopWaiters = null;
          activeId = null;
          setPhase('idle');
          reject(new Error('本次录音未完成或已中断，请重新说话。'));
        }
      });
    },
    cancel: function () {
      var id = activeId;
      var pendingStart = startWaiters;
      activeId = null;
      startWaiters = null;
      stopWaiters = null;
      peakLevel = 0;
      authPending = false;
      clearMeterPulse();
      setPhase('idle');
      if (pendingStart) {
        pendingStart.reject(new Error('录音已取消，请重新按住说话。'));
      }
      if (id) {
        try {
          recorder.stop();
        } catch (e) {
          /* ignore */
        }
      }
    },
  };
}

module.exports = {
  validCapture: validCapture,
  createFieldAudioCapture: createFieldAudioCapture,
  ensureMicAuth: ensureMicAuth,
  ensurePrivacyAuth: ensurePrivacyAuth,
  probeMicAuth: probeMicAuth,
  requestMicAuth: requestMicAuth,
  mapRecorderError: mapRecorderError,
  MIC_READY_RETRY: MIC_READY_RETRY,
  MIC_READY_RETRY_MSG: MIC_READY_RETRY_MSG,
  MIN_DURATION_MS: MIN_DURATION_MS,
  MAX_DURATION_MS: MAX_DURATION_MS,
};
