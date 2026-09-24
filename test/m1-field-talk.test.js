const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const translation = require('../miniprogram/services/fieldTranslation');
const speech = require('../miniprogram/services/fieldSpeech');
const outbox = require('../miniprogram/services/fieldOutbox');

describe('M1.4 FieldTalk text path', () => {
  it('translateFieldText keeps same language local', async () => {
    const same = await translation.translateFieldText('hello', 'en', 'en', async () => {
      throw new Error('should not call translator');
    });
    assert.equal(same, 'hello');

    const cross = await translation.translateFieldText('你好', 'zh', 'en', async (t) => {
      assert.equal(t, '你好');
      return 'Hello';
    });
    assert.equal(cross, 'Hello');

    await assert.rejects(
      () => translation.translateFieldText('   ', 'zh', 'en', async () => 'x'),
      /为空或过长/
    );
  });

  it('speech language catalog and error map exist', () => {
    assert.equal(speech.speechLanguages.zh.includes('中文'), true);
    assert.match(speech.speechErrorMessage('SPEECH_TIMEOUT'), /超时/);
    assert.ok(speech.speechLanguageOptions().length >= 3);
  });

  it('outbox validates pending shape', () => {
    assert.equal(
      outbox.validPending({
        topic: '11111111-1111-4111-8111-111111111111',
        key: '22222222-2222-4222-8222-222222222222',
        value: {
          speaker: 'mine',
          source: 'zh',
          target: 'en',
          original: '你好',
          translated: 'Hello',
        },
      }),
      true
    );
    assert.equal(outbox.validPending({ topic: 'bad' }), false);
  });

  it('talk page wires text path and end dialog', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    const json = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.json'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.wxss'),
      'utf8'
    );
    assert.match(json, /"navigationStyle":\s*"custom"/);
    assert.match(wxml, /app-banner/);
    assert.match(wxml, /section="面对面交流"/);
    assert.match(wxml, /面对面交流/);
    assert.match(wxml, /每轮文字确认后保存到当前节点的私有现场话题；未确认的输入离开后清除。/);
    assert.match(wxml, /语音识别、跨语种翻译和朗读由 Google Cloud 处理/);
    assert.match(wxml, /fc-lang-caret/);
    assert.match(wxml, /输入文字/);
    assert.match(wxml, /确认并保存文字|翻译并保存/);
    assert.match(wxml, /结束这次现场交流/);
    assert.match(wxml, /已保存的交流会留在现场话题中/);
    assert.match(wxml, /结束并选择主页/);
    assert.match(wxml, /结束并返回连接/);
    assert.match(wxml, /继续交流/);
    assert.match(wxml, /我已告知对方，开启语音/);
    assert.match(wxml, /不等了，先用扫码交流/);
    assert.match(wxml, /正在准备现场话题|正在创建本次话题/);
    assert.match(wxml, /field-host-invite/);
    assert.match(wxss, /\.fc-save/);
    assert.match(wxss, /border-radius:\s*999rpx/);
    assert.match(js, /话题已创建 · 自动保存/);
    assert.match(js, /轮流按住说话/);
    assert.doesNotMatch(js, /开启语音后可按住说话/);
    assert.doesNotMatch(js, /saveBadge:\s*'现场交流'/);
    assert.doesNotMatch(js, /bannerMetrics/);
    assert.match(js, /translateFieldText/);
    assert.match(js, /speechRequest/);
    assert.match(js, /confirmOrTranslate/);
    assert.match(js, /openEndDialog/);
    assert.match(js, /saveFieldRecord/);
    assert.match(js, /openFieldTopic/);
    assert.match(js, /createFieldAudioCapture|onHoldStart/);
    assert.match(js, /setData\(\{\s*scan:\s*true/);
    assert.match(js, /_reqGen\s*\+=\s*1/);
    assert.match(js, /cancelVoice/);
    assert.match(js, /pages\/connect\/host\/index/);
  });

  it('host invite page embeds FieldHostInvite component', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/host/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/host/index.js'),
      'utf8'
    );
    const json = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/host/index.json'),
      'utf8'
    );
    assert.match(wxml, /field-host-invite/);
    assert.match(json, /field-host-invite/);
    assert.match(js, /allowCreate/);
    assert.match(js, /roomId/);
  });
});
