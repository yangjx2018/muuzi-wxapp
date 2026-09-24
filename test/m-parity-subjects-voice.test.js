const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

before(() => {
  const mem = Object.create(null);
  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : '';
    },
    setStorageSync(key, value) {
      mem[key] = value == null ? '' : value;
    },
    removeStorageSync(key) {
      delete mem[key];
    },
    request() {},
    uploadFile() {},
    getRecorderManager() {
      return {
        onStart() {},
        onStop() {},
        onError() {},
        onFrameRecorded() {},
        start() {},
        stop() {},
      };
    },
    getSetting({ success }) {
      success({ authSetting: { 'scope.record': true } });
    },
  };
});

describe('M-11 subjects depth + K-10 voice meter', () => {
  it('creator exports subject works posts verification helpers', () => {
    const creator = require('../miniprogram/services/creator');
    assert.equal(creator.subjectOwner('abc'), 'virtual:abc');
    [
      'fetchWorks',
      'addWork',
      'updateWork',
      'deleteWork',
      'fetchManagedPosts',
      'closePost',
      'deletePost',
      'fetchSubjectVerification',
      'applySubjectVerification',
    ].forEach((name) => {
      assert.equal(typeof creator[name], 'function', name);
    });
  });

  it('subjects page wires works posts verification and deep links', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/subjects/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/subjects/index.wxml'),
      'utf8'
    );
    assert.match(js, /fetchWorks|addWork|deleteWork/);
    assert.match(js, /fetchManagedPosts|closePost/);
    assert.match(js, /applySubjectVerification/);
    assert.match(js, /goSharing|goAgentAccess/);
    assert.match(wxml, /作品库/);
    assert.match(wxml, /主体动态/);
    assert.match(wxml, /运营者认证/);
    assert.match(wxml, /生成分享短链/);
  });

  it('field audio exposes meter pulse and short-duration copy', () => {
    const cap = fs.readFileSync(
      path.join(root, 'miniprogram/services/fieldAudioCapture.js'),
      'utf8'
    );
    const talk = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.wxml'),
      'utf8'
    );
    // AAC 不可用 frameSize；振幅用计时脉冲（曾误用 onFrameRecorded 导致授权后 onError）
    assert.match(cap, /startMeterPulse|meterTimer/);
    assert.match(cap, /format=aac 时禁止传 frameSize|禁止传 frameSize/);
    assert.doesNotMatch(cap, /onFrameRecorded/);
    assert.match(cap, /说话时间太短/);
    assert.match(cap, /vibrateShort/);
    assert.match(talk, /voiceMeter|showVoiceMeter/);
    assert.match(wxml, /fc-voice-meter/);
  });
});
