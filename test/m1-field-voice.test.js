const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const remux = require('../miniprogram/utils/adts-to-m4a');
const audio = require('../miniprogram/services/fieldAudioCapture');

/** Minimal ADTS AAC frame header (AAC-LC, 44.1kHz, mono) + silence payload */
function fakeAdtsFrame() {
  const payload = Buffer.alloc(32, 0);
  const frameLength = 7 + payload.length;
  const header = Buffer.from([
    0xff,
    0xf1,
    0x50,
    0x40 | ((frameLength >> 11) & 0x03),
    (frameLength >> 3) & 0xff,
    ((frameLength & 0x07) << 5) | 0x1f,
    0xfc,
  ]);
  return Buffer.concat([header, payload]);
}

describe('M1.5 FieldTalk voice path', () => {
  it('adtsToM4a produces ftyp container required by Platform', () => {
    const m4a = remux.adtsToM4a(fakeAdtsFrame());
    assert.ok(m4a.length >= 12);
    const tag = String.fromCharCode(m4a[4], m4a[5], m4a[6], m4a[7]);
    assert.equal(tag, 'ftyp');
    // passthrough if already m4a
    const again = remux.adtsToM4a(m4a);
    assert.equal(again.length, m4a.length);
  });

  it('validCapture matches App bounds', () => {
    const ok = {
      id: '11111111-1111-4111-8111-111111111111',
      mimeType: 'audio/mp4',
      durationMs: 1000,
      base64: Buffer.from('abcd').toString('base64'),
    };
    assert.equal(audio.validCapture(ok, ok.id), true);
    assert.equal(audio.validCapture({ ...ok, durationMs: 100 }, ok.id), false);
    assert.equal(audio.validCapture({ ...ok, mimeType: 'audio/mpeg' }, ok.id), false);
  });

  it('talk page wires hold-to-speak and synthesize', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.wxss'),
      'utf8'
    );
    const cap = fs.readFileSync(
      path.join(root, 'miniprogram/services/fieldAudioCapture.js'),
      'utf8'
    );
    assert.match(wxml, /catchtouchstart="onHoldStart"/);
    assert.match(wxml, /catchtouchend="onHoldEnd"/);
    assert.match(wxml, /catchtouchcancel="onHoldEnd"/);
    // 按住说话必须用 view，避免 button disabled/hover 在真机上立刻 touchcancel。
    assert.match(wxml, /<view\s[^>]*catchtouchstart="onHoldStart"/);
    assert.doesNotMatch(wxml, /<button[^>]*catchtouchstart="onHoldStart"/);
    assert.match(wxml, /shownTurn/);
    assert.match(wxml, /holdingSpeaker/);
    assert.match(wxml, /准备朗读/);
    assert.match(wxml, /speakMineLabel|speakGuestLabel/);
    assert.doesNotMatch(wxml, /按住说话（下一切片）/);
    assert.match(js, /createFieldAudioCapture/);
    assert.match(js, /heldTurn/);
    assert.match(js, /holdingSpeaker/);
    assert.match(js, /refreshShown/);
    assert.match(js, /speechRequest\(.*recognize/);
    assert.match(js, /playSynthesis/);
    assert.match(js, /clearVoicePlayback|voiceSrc/);
    assert.match(js, /朗读音频无法播放，请重新准备朗读/);
    assert.doesNotMatch(js, /正在播放译文朗读/);
    assert.doesNotMatch(js, /createInnerAudioContext/);
    assert.match(wxml, /voiceSrc/);
    assert.match(wxml, /<audio[\s\S]*controls/);
    assert.match(wxml, /binderror="onVoiceError"/);
    assert.match(wxss, /\.fc-audio/);
    assert.doesNotMatch(js, /准备中…/);
    assert.match(wxss, /fc-utterance\.fc-held/);
    assert.match(wxss, /fc-voice-meter-on/);
    assert.match(wxss, /min-height:\s*324rpx/);
    assert.match(cap, /scope\.record/);
    assert.match(cap, /authorize/);
    assert.match(cap, /getRecorderManager/);
    assert.match(cap, /adtsToM4a/);
    assert.match(cap, /format: 'aac'/);
    assert.doesNotMatch(cap, /frameSize\s*:/);
    assert.match(cap, /MIC_READY_RETRY/);
    assert.match(js, /authPending|MIC_READY_RETRY/);
  });

  it('hold-to-speak keeps prior utterance while starting (App held parity)', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    // 按住时必须保留上一轮 recognized 展示，且 starting 不得插入振幅条改布局。
    assert.match(js, /var held = prev && prev\.recognized \? prev : null/);
    assert.match(js, /heldTurn: held/);
    assert.match(js, /utteranceHeld: Boolean\(held\)/);
    assert.match(js, /showVoiceMeter: false/);
    assert.match(js, /statusText: PHASE_LABEL\.starting/);
  });
});
