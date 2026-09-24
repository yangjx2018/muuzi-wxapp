const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const saved = require('../miniprogram/services/fieldSavedTalks');

describe('M1.7 saved field talks placeholder', () => {
  it('listSavedFieldTalks stays deferred without Matrix rooms', () => {
    const empty = saved.listSavedFieldTalks(null);
    assert.equal(empty.phase, 'deferred');
    assert.equal(empty.items.length, 0);
    assert.match(empty.note, /尚无已保存|现场交流/);

    const nonField = saved.listSavedFieldTalks([
      { roomId: '!a:ex', name: '普通会话', preview: 'hi' },
    ]);
    assert.equal(nonField.phase, 'deferred');
    assert.equal(nonField.items.length, 0);

    const ready = saved.listSavedFieldTalks([
      {
        roomId: '!field:ex',
        name: '现场交流 · 展会',
        preview: '',
        field: true,
      },
    ]);
    assert.equal(ready.phase, 'ready');
    assert.equal(ready.items.length, 1);
    assert.equal(ready.items[0].preview, saved.EMPTY_PREVIEW);

    const bySpace = saved.listSavedFieldTalks(
      [
        { roomId: '!child:ex', name: '话题 A', preview: 'hi' },
        { roomId: '!other:ex', name: '其他', preview: 'x', field: true },
      ],
      [{ roomId: '!space:ex', name: '现场', field: true, channelIds: ['!child:ex'] }]
    );
    assert.equal(bySpace.phase, 'ready');
    assert.equal(bySpace.items.length, 1);
    assert.equal(bySpace.items[0].roomId, '!child:ex');
  });

  it('continueAvailability refuses before Matrix ready', () => {
    const deferred = saved.continueAvailability('!r:ex', false, false);
    assert.equal(deferred.ok, false);
    assert.equal(deferred.reason, 'deferred');
    assert.match(deferred.message, /继续扫码|现场/);

    const missing = saved.continueAvailability('', true, false);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing');

    const ok = saved.continueAvailability('!r:ex', true, true);
    assert.equal(ok.ok, true);
  });

  it('hub wires saved section and continue page without fake chat', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/index.js'),
      'utf8'
    );
    const cont = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/continue/index.js'),
      'utf8'
    );
    const contWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/continue/index.wxml'),
      'utf8'
    );
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8')
    );
    const messages = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.wxml'),
      'utf8'
    );

    assert.match(wxml, /已保存的现场交流/);
    assert.match(wxml, /savedNote/);
    assert.match(wxml, /继续扫码交流|openContinueShell/);
    assert.match(js, /fieldSavedTalks/);
    assert.match(js, /refreshSavedTalks/);
    assert.match(js, /listSavedFieldTalks\(/);
    assert.match(js, /matrixRuntime/);
    assert.match(js, /deepLink|messageDeepLink|openSavedRoom/);
    assert.match(js, /pages\/connect\/continue/);
    assert.ok(appJson.pages.includes('pages/connect/continue/index'));
    assert.match(cont, /continueAvailability/);
    assert.match(cont, /canResume/);
    assert.match(cont, /resumeHost|pages\/connect\/host/);
    assert.match(cont, /openChat|matrixRuntime/);
    assert.match(cont, /redirectTo|create=0/);
    assert.match(cont, /isJoinedFieldRoom|nodeWorkspaces|\.field/);
    assert.match(contWxml, /继续扫码交流/);
    assert.match(contWxml, /恢复扫码邀请|打开现场频道/);
    assert.match(contWxml, /无法恢复这个现场话题|正在读取现场交流|已保存的现场交流/);
    assert.match(
      messages,
      /加密房间发送将在后续|不会伪造房间|收发文本、图片、视频与文件/
    );
    assert.match(messages, /节点同步与工作区已接通|会话/);
    assert.doesNotMatch(messages, /待 M2/);
  });
});
