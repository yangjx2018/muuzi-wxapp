const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rooms = require('../miniprogram/services/matrixRooms');
const matrixChat = require('../miniprogram/services/matrixChat');
const matrixApi = require('../miniprogram/services/matrixApi');
const media = require('../miniprogram/services/matrixMedia');

before(() => {
  global.wx = global.wx || {
    getStorageSync() {
      return '';
    },
    setStorageSync() {},
    removeStorageSync() {},
  };
});

describe('K-01 chat attachments', () => {
  it('media helpers parse mxc and mime', () => {
    assert.equal(media.guessMime('/tmp/a.PNG'), 'image/png');
    assert.equal(media.guessMime('x', 'image/webp'), 'image/webp');
    assert.equal(media.attachmentMime('', 'clip.mp4'), 'video/mp4');
    assert.equal(media.msgtypeForMime('video/mp4'), 'm.video');
    assert.equal(media.msgtypeForMime('application/pdf'), 'm.file');
    assert.deepEqual(media.parseMxc('mxc://hs.example/abc'), {
      server: 'hs.example',
      mediaId: 'abc',
    });
    assert.match(
      media.downloadPath('https://hs.example', 'mxc://hs.example/abc'),
      /\/_matrix\/media\/v3\/download\/hs\.example\/abc$/
    );
    assert.match(
      media.downloadPath('https://hs.example', 'mxc://hs.example/abc', true),
      /\/_matrix\/client\/v1\/media\/download\/hs\.example\/abc$/
    );
  });

  it('downloadToTemp prefers authenticated media then falls back', async () => {
    const calls = [];
    await assert.rejects(
      () =>
        media.downloadToTemp({
          homeserver: 'https://hs.example',
          accessToken: 'tok',
          mxc: 'not-an-mxc',
          downloadFile: function () {
            return Promise.resolve('/tmp/x');
          },
        }),
      /附件地址无效/
    );
    const path = await media.downloadToTemp({
      homeserver: 'https://hs.example',
      accessToken: 'tok',
      mxc: 'mxc://hs.example/abc',
      downloadFile: function (opts) {
        calls.push(opts.url);
        if (/client\/v1\/media/.test(opts.url)) {
          var err = new Error('missing');
          err.statusCode = 404;
          return Promise.reject(err);
        }
        assert.match(opts.header.Authorization, /Bearer tok/);
        return Promise.resolve('/tmp/file.jpg');
      },
    });
    assert.equal(path, '/tmp/file.jpg');
    assert.equal(calls.length, 2);
    assert.match(calls[0], /client\/v1\/media\/download/);
    assert.match(calls[1], /media\/v3\/download/);
  });

  it('downloadToTemp prefers wx.request bytes then writes temp file', async () => {
    const prevWx = global.wx;
    const writes = [];
    global.wx = {
      env: { USER_DATA_PATH: '/tmp/ud' },
      getFileSystemManager() {
        return {
          writeFile(opts) {
            writes.push(opts.filePath);
            opts.success && opts.success();
          },
        };
      },
    };
    try {
      const path = await media.downloadToTemp({
        homeserver: 'https://hs.example',
        accessToken: 'tok',
        mxc: 'mxc://hs.example/abc',
        mimetype: 'image/jpeg',
        request: function (opts) {
          assert.match(opts.url, /client\/v1\/media\/download/);
          assert.match(opts.header.Authorization, /Bearer tok/);
          assert.equal(opts.responseType, 'arraybuffer');
          return Promise.resolve(new ArrayBuffer(8));
        },
      });
      assert.match(path, /^\/tmp\/ud\/mx_media_/);
      assert.match(path, /\.jpg$/);
      assert.equal(writes.length, 1);
    } finally {
      global.wx = prevWx;
    }
  });

  it('downloadToTemp falls back to legacy when authed request returns 404', async () => {
    const prevWx = global.wx;
    global.wx = {
      env: { USER_DATA_PATH: '/tmp/ud' },
      getFileSystemManager() {
        return {
          writeFile(opts) {
            opts.success && opts.success();
          },
        };
      },
    };
    try {
      const urls = [];
      const path = await media.downloadToTemp({
        homeserver: 'https://hs.example',
        accessToken: 'tok',
        mxc: 'mxc://hs.example/abc',
        request: function (opts) {
          urls.push(opts.url);
          if (/client\/v1\/media/.test(opts.url)) {
            var err = new Error('missing');
            err.statusCode = 404;
            return Promise.reject(err);
          }
          return Promise.resolve(new ArrayBuffer(4));
        },
      });
      assert.match(path, /^\/tmp\/ud\/mx_media_/);
      assert.equal(urls.length, 2);
      assert.match(urls[1], /media\/v3\/download/);
    } finally {
      global.wx = prevWx;
    }
  });

  it('applyTimeline merges local echo by unsigned.transaction_id and keeps preview', () => {
    const room = rooms.emptyRoom('!r:ex', 'join');
    const txn = 'client-txn-1';
    rooms.upsertLocalEvent(room, {
      type: 'm.room.message',
      sender: '@me:ex',
      content: {
        msgtype: 'm.image',
        body: 'a.jpg',
        url: '',
        info: { mimetype: 'image/jpeg' },
      },
      transaction_id: txn,
      _txnId: txn,
      _localId: 'txn:' + txn,
      _delivery: 'sending',
      _previewPath: '/tmp/a.jpg',
      _ts: 1,
    });
    rooms.applyTimeline(room, [
      {
        type: 'm.room.message',
        event_id: '$img1',
        sender: '@me:ex',
        content: {
          msgtype: 'm.image',
          body: 'a.jpg',
          url: 'mxc://hs.example/mid',
          info: { mimetype: 'image/jpeg' },
        },
        unsigned: { transaction_id: txn },
      },
    ]);
    assert.equal(room.timeline.length, 1);
    const msgs = rooms.listMessages(room, '@me:ex');
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].id, '$img1');
    assert.equal(msgs[0].body, '[图片]');
    assert.equal(msgs[0].previewPath, '/tmp/a.jpg');
    assert.equal(msgs[0].attachment.mxc, 'mxc://hs.example/mid');
    assert.equal(msgs[0].delivery, 'sent');
  });

  it('applyTimeline dedupes text local echo (emoji 重复显示回归)', () => {
    const room = rooms.emptyRoom('!r:ex', 'join');
    const txn = 'emoji-txn';
    rooms.upsertLocalEvent(room, {
      type: 'm.room.message',
      sender: '@me:ex',
      content: { msgtype: 'm.text', body: '😅' },
      transaction_id: txn,
      _txnId: txn,
      _localId: 'txn:' + txn,
      _delivery: 'sending',
      _ts: 1,
    });
    rooms.applyTimeline(room, [
      {
        type: 'm.room.message',
        event_id: '$e1',
        sender: '@me:ex',
        content: { msgtype: 'm.text', body: '😅' },
        unsigned: { transaction_id: txn },
      },
    ]);
    const msgs = rooms.listMessages(room, '@me:ex');
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].body, '😅');
    assert.equal(msgs[0].id, '$e1');
  });

  it('visibleMessage maps m.image with dimensions and previewPath', () => {
    const img = rooms.visibleMessage(
      {
        type: 'm.room.message',
        event_id: '$img',
        sender: '@a:ex',
        content: {
          msgtype: 'm.image',
          body: 'photo.jpg',
          url: 'mxc://hs.example/mid',
          info: { mimetype: 'image/jpeg', size: 12, w: 800, h: 600 },
        },
        _previewPath: '',
      },
      '@a:ex'
    );
    assert.equal(img.body, '[图片]');
    assert.equal(img.attachment.kind, 'image');
    assert.equal(img.attachment.mxc, 'mxc://hs.example/mid');
    assert.equal(img.attachment.width, 800);
    assert.equal(img.attachment.height, 600);

    const local = rooms.visibleMessage(
      {
        type: 'm.room.message',
        sender: '@a:ex',
        content: {
          msgtype: 'm.image',
          body: 'local.jpg',
          url: '',
          info: { mimetype: 'image/jpeg' },
        },
        _localId: 'txn:m1',
        _delivery: 'sending',
        _previewPath: '/tmp/local.jpg',
      },
      '@a:ex'
    );
    assert.equal(local.previewPath, '/tmp/local.jpg');
    assert.equal(local.delivery, 'sending');

    const video = rooms.visibleMessage(
      {
        type: 'm.room.message',
        event_id: '$vid',
        sender: '@b:ex',
        content: {
          msgtype: 'm.video',
          body: 'clip.mp4',
          url: 'mxc://hs.example/vid',
          info: { mimetype: 'video/mp4', size: 100, duration: 12 },
        },
      },
      '@a:ex'
    );
    assert.equal(video.attachment.kind, 'video');
    assert.match(video.body, /视频/);

    const file = rooms.visibleMessage(
      {
        type: 'm.room.message',
        event_id: '$file',
        sender: '@b:ex',
        content: {
          msgtype: 'm.file',
          body: 'doc.pdf',
          filename: 'doc.pdf',
          url: 'mxc://hs.example/doc',
          info: { mimetype: 'application/pdf', size: 50 },
        },
      },
      '@a:ex'
    );
    assert.equal(file.attachment.kind, 'file');
    assert.match(file.body, /文件/);
  });

  it('sendImage uploads then sends m.image content', async () => {
    const store = Object.create(null);
    store['!r:ex'] = rooms.emptyRoom('!r:ex', 'join');
    rooms.applyTimeline(store['!r:ex'], [
      {
        type: 'm.room.name',
        state_key: '',
        content: { name: '频道' },
      },
    ]);

    const uploads = [];
    const sends = [];
    const api = matrixApi.createMatrixApi({
      homeserver: 'https://hs.example',
      accessToken: 'tok',
      request: function (opts) {
        sends.push(opts);
        return Promise.resolve({ event_id: '$img1' });
      },
    });

    const chat = matrixChat.createChatActions({
      api: api,
      getStore: () => store,
      getAccountData: () => ({}),
      getUserId: () => '@a:ex',
      getHomeserver: () => 'https://hs.example',
      getAccessToken: () => 'tok',
      emit: () => {},
      uploadFilePath: function (opts) {
        uploads.push(opts);
        return Promise.resolve({
          contentUri: 'mxc://hs.example/up1',
          filename: opts.filename || 'shot.jpg',
          mimetype: 'image/jpeg',
          size: 2048,
          msgtype: 'm.image',
        });
      },
    });

    await chat.sendImage('!r:ex', {
      filePath: '/tmp/shot.jpg',
      name: 'shot.jpg',
      size: 2048,
      width: 640,
      height: 480,
    });

    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].filePath, '/tmp/shot.jpg');
    assert.equal(sends.length, 1);
    assert.equal(sends[0].data.msgtype, 'm.image');
    assert.equal(sends[0].data.url, 'mxc://hs.example/up1');
    assert.equal(sends[0].data.info.w, 640);
    assert.equal(sends[0].data.info.h, 480);

    const local = store['!r:ex'].timeline.find((e) => e._delivery === 'sent');
    assert.ok(local);
    assert.equal(local.event_id, '$img1');
    assert.equal(local.content.url, 'mxc://hs.example/up1');
  });

  it('sendAttachment uploads video and file msgtypes', async () => {
    const store = Object.create(null);
    store['!r:ex'] = rooms.emptyRoom('!r:ex', 'join');
    const sends = [];
    const api = matrixApi.createMatrixApi({
      homeserver: 'https://hs.example',
      accessToken: 'tok',
      request: function (opts) {
        sends.push(opts);
        return Promise.resolve({ event_id: '$sent' });
      },
    });
    const chat = matrixChat.createChatActions({
      api: api,
      getStore: () => store,
      getAccountData: () => ({}),
      getUserId: () => '@a:ex',
      getHomeserver: () => 'https://hs.example',
      getAccessToken: () => 'tok',
      emit: () => {},
      uploadFilePath: function (opts) {
        const isVideo = /video|\.mp4$/i.test(
          opts.filename + (opts.mimetype || '')
        );
        return Promise.resolve({
          contentUri: 'mxc://hs.example/' + (isVideo ? 'v1' : 'f1'),
          filename: opts.filename,
          mimetype: opts.mimetype,
          size: 100,
          msgtype: isVideo ? 'm.video' : 'm.file',
        });
      },
    });

    await chat.sendAttachment('!r:ex', {
      filePath: '/tmp/clip.mp4',
      name: 'clip.mp4',
      mimetype: 'video/mp4',
      size: 100,
    });
    assert.equal(sends[0].data.msgtype, 'm.video');

    await chat.sendAttachment('!r:ex', {
      filePath: '/tmp/doc.pdf',
      name: 'doc.pdf',
      mimetype: 'application/pdf',
      size: 50,
    });
    assert.equal(sends[1].data.msgtype, 'm.file');
    assert.equal(sends[1].data.filename, 'doc.pdf');
  });

  it('sendImage refuses encrypted rooms and oversized files', async () => {
    const store = Object.create(null);
    store['!enc:ex'] = rooms.emptyRoom('!enc:ex', 'join');
    rooms.applyTimeline(store['!enc:ex'], [
      {
        type: 'm.room.encryption',
        state_key: '',
        content: { algorithm: 'm.megolm.v1.aes-sha2' },
      },
    ]);
    const chat = matrixChat.createChatActions({
      api: matrixApi.createMatrixApi({
        homeserver: 'https://hs.example',
        accessToken: 'tok',
        request: () => Promise.resolve({}),
      }),
      getStore: () => store,
      getAccountData: () => ({}),
      getUserId: () => '@a:ex',
      getHomeserver: () => 'https://hs.example',
      getAccessToken: () => 'tok',
      emit: () => {},
      uploadFilePath: () => Promise.reject(new Error('should not upload')),
    });

    await assert.rejects(
      () =>
        chat.sendImage('!enc:ex', {
          filePath: '/tmp/a.jpg',
          size: 10,
        }),
      /加密|暂不可发送|密钥/
    );

    store['!r:ex'] = rooms.emptyRoom('!r:ex', 'join');
    await assert.rejects(
      () =>
        chat.sendImage('!r:ex', {
          filePath: '/tmp/big.jpg',
          size: media.MAX_ATTACHMENT_BYTES + 1,
        }),
      /20MB/
    );
  });

  it('room page wires attachment picker and media render', () => {
    const roomJs = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.js'),
      'utf8'
    );
    const roomWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    assert.match(roomJs, /sendAttachment/);
    assert.match(roomJs, /chooseMedia|chooseImage|chooseMessageFile/);
    assert.match(roomJs, /pickVideo|pickFile/);
    assert.match(roomJs, /showFilePickPanel/);
    assert.match(roomJs, /confirmPickChatFile/);
    assert.match(roomJs, /attachFilePick/);
    assert.match(roomJs, /downloadToTemp/);
    assert.match(roomJs, /_mediaFailed/);
    assert.match(roomJs, /mediaFailed/);
    assert.match(roomWxml, /item\.isImage/);
    assert.match(roomWxml, /item\.isVideo/);
    assert.match(roomWxml, /item\.isFile/);
    assert.match(roomWxml, /图片载入失败/);
    assert.match(roomWxml, /视频载入失败/);
    assert.match(roomWxml, /点此重试|onRetryMedia/);
    assert.match(roomJs, /onRetryMedia/);
    assert.match(roomJs, /statusBarPx/);
    assert.match(roomJs, /navChrome/);
    // 状态栏垫高必须在 chat-page 内，禁止 status-pad 兄弟节点 + 100vh 裁掉底部发送栏
    assert.doesNotMatch(roomWxml, /<status-pad/);
    assert.match(roomWxml, /padding-top:\s*\{\{statusBarPx\}\}px/);
    assert.match(roomWxml, /catchtap="onPreviewImage"/);
    assert.match(roomWxml, /mode="aspectFill"/);
    assert.match(roomJs, /displayMessages/);
    assert.match(roomJs, /previewImage/);
    assert.match(roomJs, /onImageError/);
    const roomWxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxss'),
      'utf8'
    );
    assert.match(roomWxss, /\.chat-image\s*\{[^}]*min-width:\s*200rpx/s);
    assert.match(roomWxss, /\.chat-image\s*\{[^}]*min-height:\s*200rpx/s);
    assert.match(roomWxss, /\.chat-image\s*\{[^}]*width:\s*440rpx/s);
    assert.match(roomWxss, /\.chat-composer\s*\{[^}]*flex-shrink:\s*0/s);
    assert.match(roomWxss, /\.chat-input\s*\{[^}]*min-height:\s*48rpx/s);
    assert.match(
      fs.readFileSync(
        path.join(root, 'miniprogram/services/matrixRuntime.js'),
        'utf8'
      ),
      /sendAttachment/
    );
    assert.match(
      fs.readFileSync(
        path.join(root, 'miniprogram/services/matrixRooms.js'),
        'utf8'
      ),
      /unsigned\.transaction_id/
    );
    assert.match(
      fs.readFileSync(
        path.join(root, 'miniprogram/services/matrixMedia.js'),
        'utf8'
      ),
      /client\/v1\/media\/download/
    );
  });
});
