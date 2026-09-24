/**
 * 麦克风权限：单次弹窗 + 按住打断后提示再按（复现用户双授权/按住失败）
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function installWx(authSetting, opts) {
  opts = opts || {};
  var authorizeCalls = 0;
  var startCalls = 0;
  var handlers = {};
  global.wx = {
    getSetting({ success, fail }) {
      if (opts.getSettingFail) {
        fail && fail();
        return;
      }
      success({ authSetting: Object.assign({}, authSetting) });
    },
    authorize({ scope, success, fail }) {
      authorizeCalls += 1;
      assert.equal(scope, 'scope.record');
      if (opts.authorizeFail) {
        fail && fail();
        return;
      }
      authSetting['scope.record'] = true;
      success && success();
    },
    openSetting({ success, fail }) {
      if (opts.openSettingGrant) {
        authSetting['scope.record'] = true;
        success && success({ authSetting: Object.assign({}, authSetting) });
        return;
      }
      fail && fail();
    },
    getRecorderManager() {
      return {
        onStart(fn) {
          handlers.onStart = fn;
        },
        onStop(fn) {
          handlers.onStop = fn;
        },
        onError(fn) {
          handlers.onError = fn;
        },
        onFrameRecorded(fn) {
          handlers.onFrame = fn;
        },
        start() {
          startCalls += 1;
          if (handlers.onStart) handlers.onStart();
        },
        stop() {
          if (handlers.onStop) {
            handlers.onStop({ duration: 500, tempFilePath: '' });
          }
        },
      };
    },
    vibrateShort() {},
    arrayBufferToBase64() {
      return '';
    },
  };
  return {
    authorizeCalls: () => authorizeCalls,
    startCalls: () => startCalls,
    handlers,
  };
}

describe('FieldTalk mic auth (double-prompt / hold interrupt)', () => {
  beforeEach(() => {
    delete require.cache[
      require.resolve('../miniprogram/services/fieldAudioCapture')
    ];
  });

  it('first press: authorize once then MIC_READY_RETRY without recorder.start', async () => {
    var wxMock = installWx({});
    var audio = require('../miniprogram/services/fieldAudioCapture');
    var capture = audio.createFieldAudioCapture(function () {});
    var err = await capture.start().then(
      function () {
        throw new Error('should not start recording');
      },
      function (e) {
        return e;
      }
    );
    assert.equal(err.code, audio.MIC_READY_RETRY);
    assert.match(err.message, /再次按住说话/);
    assert.equal(wxMock.authorizeCalls(), 1);
    assert.equal(wxMock.startCalls(), 0);
  });

  it('second press after grant: no authorize, recorder.start once', async () => {
    var wxMock = installWx({ 'scope.record': true });
    var audio = require('../miniprogram/services/fieldAudioCapture');
    var capture = audio.createFieldAudioCapture(function () {});
    await capture.start();
    assert.equal(wxMock.authorizeCalls(), 0);
    assert.equal(wxMock.startCalls(), 1);
    assert.equal(capture.phase, 'recording');
    capture.cancel();
  });

  it('denied opens settings once, not double authorize+start', async () => {
    var wxMock = installWx(
      { 'scope.record': false },
      { authorizeFail: true, openSettingGrant: true }
    );
    var audio = require('../miniprogram/services/fieldAudioCapture');
    var capture = audio.createFieldAudioCapture(function () {});
    var err = await capture.start().then(
      function () {
        throw new Error('should retry');
      },
      function (e) {
        return e;
      }
    );
    assert.equal(err.code, audio.MIC_READY_RETRY);
    assert.equal(wxMock.authorizeCalls(), 1);
    assert.equal(wxMock.startCalls(), 0);
  });

  it('talk page soft-releases during authPending and surfaces retry copy', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    const cap = fs.readFileSync(
      path.join(root, 'miniprogram/services/fieldAudioCapture.js'),
      'utf8'
    );
    assert.match(js, /authPending/);
    assert.match(js, /MIC_READY_RETRY/);
    assert.match(js, /MIC_READY_RETRY_MSG/);
    assert.match(cap, /MIC_READY_RETRY/);
    assert.match(cap, /麦克风已开启，请再次按住说话/);
    assert.match(cap, /本手势只拿权限、不启动录音/);
    // 回归：AAC 不得带 frameSize（微信仅 mp3/pcm 支持），否则授权后仍 onError
    assert.match(cap, /format:\s*'aac'/);
    assert.doesNotMatch(cap, /frameSize\s*:/);
    assert.match(cap, /禁止 frameSize|仅支持 mp3/);
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8')
    );
    assert.ok(appJson.permission && appJson.permission['scope.record']);
  });

  it('recorder onError maps auth vs busy vs generic (not always micDenied)', () => {
    delete require.cache[
      require.resolve('../miniprogram/services/fieldAudioCapture')
    ];
    var audio = require('../miniprogram/services/fieldAudioCapture');
    assert.match(
      audio.mapRecorderError({ errMsg: 'operateRecorder:fail auth deny' })
        .message,
      /麦克风权限/
    );
    assert.match(
      audio.mapRecorderError({ errMsg: 'operateRecorder:fail is recording' })
        .message,
      /上一段录音/
    );
    assert.match(
      audio.mapRecorderError({ errMsg: 'operateRecorder:fail' }).message,
      /暂时用不了/
    );
  });

  it('aac start options omit frameSize (WeChat docs: mp3/pcm only)', async () => {
    var startOpts = null;
    global.wx = {
      getSetting({ success }) {
        success({ authSetting: { 'scope.record': true } });
      },
      authorize() {},
      getRecorderManager() {
        return {
          onStart(fn) {
            this._onStart = fn;
          },
          onStop() {},
          onError() {},
          onFrameRecorded() {},
          start(opts) {
            startOpts = opts;
            if (this._onStart) this._onStart();
          },
          stop() {},
        };
      },
      vibrateShort() {},
      requirePrivacyAuthorize({ success }) {
        success && success();
      },
    };
    delete require.cache[
      require.resolve('../miniprogram/services/fieldAudioCapture')
    ];
    var audio = require('../miniprogram/services/fieldAudioCapture');
    var capture = audio.createFieldAudioCapture(function () {});
    await capture.start();
    assert.ok(startOpts);
    assert.equal(startOpts.format, 'aac');
    assert.equal('frameSize' in startOpts, false);
    assert.equal(capture.phase, 'recording');
    capture.cancel();
  });
});
