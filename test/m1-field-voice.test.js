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

  it('adtsToM4a esds descriptors nest without size overflow (Android remux)', () => {
    const frames = Buffer.concat([
      fakeAdtsFrame(),
      fakeAdtsFrame(),
      fakeAdtsFrame(),
    ]);
    const m4a = Buffer.from(remux.adtsToM4a(frames));
    const idx = m4a.toString('binary').indexOf('esds');
    assert.ok(idx > 0);
    const boxSize = m4a.readUInt32BE(idx - 4);
    const esds = m4a.subarray(idx - 4, idx - 4 + boxSize);

    function readDesc(buf, pos) {
      const tag = buf[pos];
      let size = 0;
      let i = pos + 1;
      let b;
      do {
        b = buf[i++];
        size = (size << 7) | (b & 0x7f);
      } while (b & 0x80);
      return { tag, size, headerEnd: i, end: i + size };
    }

    // fullBox: 8 byte box header + 4 byte version/flags
    const es = readDesc(esds, 12);
    assert.equal(es.tag, 0x03);
    assert.equal(es.end, esds.length);
    // ES_ID(2) + flags(1)
    const dc = readDesc(esds, es.headerEnd + 3);
    assert.equal(dc.tag, 0x04);
    const dsi = readDesc(esds, dc.headerEnd + 13);
    assert.equal(dsi.tag, 0x05);
    assert.equal(dsi.end, dc.end, 'DecoderSpecificInfo must fit inside DecoderConfig');
    const sl = readDesc(esds, dc.end);
    assert.equal(sl.tag, 0x06);
    assert.equal(sl.end, es.end, 'SLConfig must end exactly at ES descriptor end');
  });

  it('recorder keeps AAC without frameSize (WeChat docs: mp3/pcm only)', () => {
    const cap = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/fieldAudioCapture.js'),
      'utf8'
    );
    assert.match(cap, /format:\s*'aac'/);
    assert.doesNotMatch(cap, /frameSize\s*:/);
  });

  it('speech maps SPEECH_PROVIDER_FAILED away from generic 502 copy', () => {
    const speech = require('../miniprogram/services/fieldSpeech');
    assert.match(
      speech.speechErrorMessage('SPEECH_PROVIDER_FAILED'),
      /语音识别暂时失败/
    );
    assert.match(
      speech.speechErrorMessage('SPEECH_RESPONSE_INVALID'),
      /语音识别结果异常/
    );
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
    assert.match(wxml, /catchtouchcancel="onHoldCancel"/);
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
    assert.match(js, /createInnerAudioContext/);
    assert.match(js, /toggleVoicePause/);
    assert.match(js, /startInnerVoice/);
    assert.match(js, /\.pause\(/);
    assert.match(js, /朗读音频无法播放，请重新准备朗读/);
    assert.match(wxml, /voiceSrc/);
    assert.match(wxml, /toggleVoicePause/);
    assert.match(wxml, /暂停/);
    assert.match(wxml, /继续/);
    assert.match(wxml, /fc-audio-bar/);
    assert.doesNotMatch(wxml, /<audio[\s\S]*controls/);
    assert.match(wxss, /\.fc-audio-bar/);
    assert.match(wxss, /\.fc-audio-actions/);
    assert.doesNotMatch(js, /准备中…/);
    assert.match(wxss, /fc-utterance\.fc-held/);
    assert.match(wxss, /fc-voice-meter-on/);
    assert.match(wxss, /#b42318/);
    assert.match(wxss, /\.fc-speak\.fc-speak-active/);
    assert.match(wxml, /holdingSpeaker === 'mine' && showVoiceMeter/);
    assert.match(js, /showVoiceMeter/);
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

  it('hold gesture defers starting abort and ignores Android touchcancel spam', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/talk/index.wxml'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/talk/index.wxss'),
      'utf8'
    );
    const cap = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/fieldAudioCapture.js'),
      'utf8'
    );
    assert.match(js, /_releasePending/);
    assert.match(js, /_fingerDown/);
    assert.match(js, /onHoldCancel/);
    assert.match(js, /phase === 'starting'\) return/);
    assert.match(js, /_releasePending \|\| !self\._fingerDown/);
    assert.doesNotMatch(js, /麦克风尚未就绪，请重新按住说话/);
    assert.match(wxml, /catchtouchcancel="onHoldCancel"/);
    assert.match(wxml, /catchtouchmove="onHoldMove"/);
    assert.doesNotMatch(wxml, /style="width: \{\{voiceMeterPct\}\}%/);
    assert.match(wxss, /fc-meter-pulse|@keyframes\s+fc-meter-pulse/);
    assert.doesNotMatch(cap, /vibrateShort\s*\(/);
  });

  it('hold-to-speak keeps prior utterance while starting (App held parity)', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    // 按住时必须保留上一轮 recognized 展示；振幅条始终占位，按下即显避免假死。
    assert.match(js, /var held = prev && prev\.recognized \? prev : null/);
    assert.match(js, /heldTurn: held/);
    assert.match(js, /utteranceHeld: Boolean\(held\)/);
    assert.match(js, /showVoiceMeter: true/);
    assert.match(js, /voiceMeterPct:\s*12/);
    assert.match(js, /statusText: PHASE_LABEL\.starting/);
  });
});
