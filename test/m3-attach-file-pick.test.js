/**
 * Bug：消息页点「文件」直接进微信会话/好友列表，像加好友而非选文档。
 * 根因：wx.chooseMessageFile 设计如此；修复为页内「选择文件」面板 + 扩展名过滤。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pick = require(path.join(root, 'miniprogram/services/attachFilePick.js'));

describe('m3 attach file pick (聊天文件 / 非系统文件管理器)', () => {
  it('chooseMessageFile options align App document accept list', () => {
    const opts = pick.chooseMessageFileOptions();
    assert.equal(opts.count, 1);
    assert.equal(opts.type, 'file');
    assert.ok(opts.extension.includes('pdf'));
    assert.ok(opts.extension.includes('zip'));
    assert.ok(opts.extension.includes('txt'));
    assert.ok(opts.extension.includes('md'));
    assert.ok(opts.extension.includes('mp3'));
  });

  it('normalizeMessageFile maps tempFile to sendPicked shape', () => {
    const media = {
      basename: (p, fb) => (p && p.split('/').pop()) || fb,
      attachmentMime: (_t, name) =>
        String(name || '').endsWith('.pdf')
          ? 'application/pdf'
          : 'application/octet-stream',
    };
    assert.equal(pick.normalizeMessageFile(null, media), null);
    assert.equal(pick.normalizeMessageFile({ name: 'a.pdf' }, media), null);
    const got = pick.normalizeMessageFile(
      { path: '/tmp/x/report.pdf', name: 'report.pdf', size: 12 },
      media
    );
    assert.deepEqual(got, {
      filePath: '/tmp/x/report.pdf',
      name: 'report.pdf',
      size: 12,
      mimetype: 'application/pdf',
    });
  });

  it('room page opens in-app file panel before chooseMessageFile', () => {
    const roomJs = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.js'),
      'utf8'
    );
    const roomWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    assert.match(roomJs, /require\('\.\.\/\.\.\/\.\.\/services\/attachFilePick'\)/);
    assert.match(roomJs, /showFilePickPanel:\s*false/);

    const docsStart = roomJs.indexOf('onPickDocs()');
    const docsEnd = roomJs.indexOf('closeFilePickPanel()');
    assert.ok(docsStart >= 0 && docsEnd > docsStart);
    const docsBody = roomJs.slice(docsStart, docsEnd);
    assert.match(docsBody, /showFilePickPanel:\s*true/);
    assert.doesNotMatch(docsBody, /chooseMessageFile/);
    assert.doesNotMatch(docsBody, /this\.pickFile\(\)/);

    const confirmStart = roomJs.indexOf('confirmPickChatFile()');
    const confirmEnd = roomJs.indexOf('sendPicked(');
    const confirmBody = roomJs.slice(confirmStart, confirmEnd);
    assert.match(confirmBody, /pickFile\(\)/);

    const pickStart = roomJs.indexOf('pickFile()');
    const pickEnd = roomJs.indexOf('onPreviewImage');
    const pickBody = roomJs.slice(pickStart, pickEnd);
    assert.match(pickBody, /chooseMessageFileOptions\(\)/);
    assert.match(pickBody, /extension:\s*opts\.extension/);
    assert.match(pickBody, /normalizeMessageFile/);

    assert.match(roomWxml, /bindtap="onPickDocs"/);
    assert.match(roomWxml, /showFilePickPanel/);
    assert.match(roomWxml, /confirmPickChatFile/);
    assert.match(roomWxml, /选择文件/);
    assert.match(roomWxml, /从聊天记录选择/);
    assert.match(roomWxml, /文件传输助手/);
  });
});
