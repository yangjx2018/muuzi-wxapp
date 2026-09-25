const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rooms = require('../miniprogram/services/matrixRooms');
const matrixChat = require('../miniprogram/services/matrixChat');
const matrixApi = require('../miniprogram/services/matrixApi');

before(() => {
  global.wx = global.wx || {
    getStorageSync() {
      return '';
    },
    setStorageSync() {},
    removeStorageSync() {},
  };
});

describe('M3.4 chat text path', () => {
  it('visibleMessage maps text reply encrypted and local delivery', () => {
    const text = rooms.visibleMessage(
      {
        type: 'm.room.message',
        event_id: '$1',
        sender: '@a:ex',
        origin_server_ts: 10,
        content: {
          msgtype: 'm.text',
          body: '你好',
          'm.relates_to': { 'm.in_reply_to': { event_id: '$0' } },
        },
      },
      '@a:ex'
    );
    assert.equal(text.body, '你好');
    assert.equal(text.own, true);
    assert.equal(text.replyTo, '$0');
    assert.equal(text.delivery, 'sent');
    assert.equal(text.fieldKind, '');

    const record = rooms.visibleMessage(
      {
        type: 'm.room.message',
        event_id: '$rec',
        sender: '@a:ex',
        content: {
          msgtype: 'm.text',
          body: '现场交流 · 本人发言\n原文（zh）：hi',
          'co.muuzi.field.record': { topic: 't', key: 'k', speaker: 'mine' },
        },
      },
      '@a:ex'
    );
    assert.equal(record.fieldKind, 'record');

    const audience = rooms.visibleMessage(
      {
        type: 'm.room.message',
        event_id: '$aud',
        sender: '@a:ex',
        content: {
          msgtype: 'm.text',
          body: 'hello guest',
          'co.muuzi.field.audience': { version: 1 },
        },
      },
      '@a:ex'
    );
    assert.equal(audience.fieldKind, 'audience');

    const enc = rooms.visibleMessage(
      { type: 'm.room.encrypted', event_id: '$2', sender: '@b:ex' },
      '@a:ex'
    );
    assert.match(enc.body, /加密/);

    const failed = rooms.visibleMessage(
      {
        type: 'm.room.message',
        sender: '@a:ex',
        content: { msgtype: 'm.text', body: 'x' },
        _localId: 'txn:m1',
        _delivery: 'failed',
      },
      '@a:ex'
    );
    assert.equal(failed.delivery, 'failed');
  });

  it('sendText writes local echo then resolves event id', async () => {
    const store = Object.create(null);
    store['!r:ex'] = rooms.emptyRoom('!r:ex', 'join');
    rooms.applyTimeline(store['!r:ex'], [
      {
        type: 'm.room.name',
        state_key: '',
        content: { name: '频道' },
      },
    ]);

    const calls = [];
    const api = matrixApi.createMatrixApi({
      homeserver: 'https://hs.example',
      accessToken: 'tok',
      request: function (opts) {
        calls.push(opts);
        return Promise.resolve({ event_id: '$sent' });
      },
    });

    let emits = 0;
    const chat = matrixChat.createChatActions({
      api: api,
      getStore: function () {
        return store;
      },
      getAccountData: function () {
        return {};
      },
      getUserId: function () {
        return '@me:ex';
      },
      emit: function () {
        emits += 1;
      },
    });

    await chat.sendText('!r:ex', 'hello');
    assert.ok(calls.length >= 1);
    assert.match(calls[0].url, /\/send\/m\.room\.message\//);
    assert.equal(calls[0].data.body, 'hello');
    assert.equal(calls[0].data.msgtype, 'm.text');
    const detail = chat.getRoomDetail('!r:ex');
    assert.ok(detail.messages.some(function (m) {
      return m.body === 'hello' && m.eventId === '$sent';
    }));
    assert.ok(emits >= 2);
  });

  it('sendText allows plaintext in encrypted rooms (App DM interoperability)', async () => {
    const store = Object.create(null);
    store['!e:ex'] = rooms.emptyRoom('!e:ex', 'join');
    rooms.applyTimeline(store['!e:ex'], [
      {
        type: 'm.room.encryption',
        state_key: '',
        content: { algorithm: 'm.megolm.v1.aes-sha2' },
      },
      {
        type: 'm.room.name',
        state_key: '',
        content: { name: '加密房' },
      },
    ]);
    const calls = [];
    const chat = matrixChat.createChatActions({
      api: {
        sendEvent: function (roomId, type, content, txnId) {
          calls.push({ roomId: roomId, type: type, content: content, txnId: txnId });
          return Promise.resolve({ eventId: '$enc-plain' });
        },
      },
      getStore: function () {
        return store;
      },
      getAccountData: function () {
        return {};
      },
      getUserId: function () {
        return '@me:ex';
      },
      emit: function () {},
    });
    await chat.sendText('!e:ex', 'hi from mini');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].content.body, 'hi from mini');
    assert.equal(calls[0].content.msgtype, 'm.text');
    const detail = chat.getRoomDetail('!e:ex');
    assert.ok(
      detail.messages.some(function (m) {
        return m.body === 'hi from mini';
      })
    );
  });

  it('retryMessage resends failed local event', async () => {
    const store = Object.create(null);
    store['!r:ex'] = rooms.emptyRoom('!r:ex', 'join');
    rooms.upsertLocalEvent(store['!r:ex'], {
      type: 'm.room.message',
      sender: '@me:ex',
      content: { msgtype: 'm.text', body: 'retry-me' },
      transaction_id: 'mtxn',
      _txnId: 'mtxn',
      _localId: 'txn:mtxn',
      _delivery: 'failed',
      _ts: Date.now(),
    });
    const api = {
      sendEvent: function (roomId, type, content, txnId) {
        assert.equal(txnId, 'mtxn');
        assert.equal(content.body, 'retry-me');
        return Promise.resolve({ eventId: '$ok', txnId: txnId });
      },
    };
    const chat = matrixChat.createChatActions({
      api: api,
      getStore: function () {
        return store;
      },
      getAccountData: function () {
        return {};
      },
      getUserId: function () {
        return '@me:ex';
      },
      emit: function () {},
    });
    await chat.retryMessage('!r:ex', 'txn:mtxn');
    const detail = chat.getRoomDetail('!r:ex');
    assert.equal(detail.messages[0].delivery, 'sent');
    assert.equal(detail.messages[0].eventId, '$ok');
  });

  it('room page and inbox navigate into chat', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8')
    );
    assert.ok(appJson.pages.includes('pages/messages/room/index'));
    const inboxJs = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.js'),
      'utf8'
    );
    const roomJs = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.js'),
      'utf8'
    );
    const roomWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    assert.match(inboxJs, /messageDeepLink|deepLink\.openRoom/);
    assert.match(inboxJs, /data\.index|ds\.index/);
    const inboxWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.wxml'),
      'utf8'
    );
    assert.match(inboxWxml, /data-index="\{\{index\}\}"/);
    assert.match(inboxWxml, /msg-launcher-people-img|icon-ui-nav-people-accent/);
    assert.match(roomJs, /sendText/);
    assert.match(roomJs, /retryMessage/);
    assert.match(roomJs, /markRead/);
    assert.match(roomJs, /onPickEmoji/);
    assert.match(roomWxml, /chat-composer/);
    assert.match(roomWxml, /长按|bindlongpress|onReply/);
    assert.match(roomWxml, /chat-tabs|chatTab/);
    assert.match(roomWxml, /发送到/);
    assert.match(roomWxml, /加载更早消息/);
    assert.match(roomJs, /onChatTab|chatTab/);
    assert.match(roomWxml, /chat-avatar|senderGlyph/);
    assert.match(roomWxml, /chat-ico-smile|chat-send-img|icon-ui-share/);
    assert.match(roomWxml, /chat-reply-draft/);
    // 键盘顶起时禁止整页上推，避免导航栏被挤进状态栏
    assert.match(roomWxml, /adjust-position="\{\{false\}\}"/);
    assert.match(roomWxml, /bindkeyboardheightchange="onKeyboardHeight"/);
    assert.match(roomJs, /onKeyboardHeight/);
    assert.match(roomJs, /keyboardHeight/);
    // 自定义导航：状态栏 padding 进 chat-page，避免 status-pad+100vh 裁掉发送栏
    assert.doesNotMatch(roomWxml, /<status-pad/);
    assert.match(roomWxml, /statusBarPx/);
    assert.match(roomJs, /statusBarPx/);
    const roomWxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxss'),
      'utf8'
    );
    assert.match(roomWxss, /\.chat-composer[\s\S]*?flex-shrink:\s*0/);
    assert.match(roomWxss, /\.chat-tools[\s\S]*?min-height:\s*64rpx/);
    const roomJson = JSON.parse(
      fs.readFileSync(
        path.join(root, 'miniprogram/pages/messages/room/index.json'),
        'utf8'
      )
    );
    assert.equal(roomJson.disableScroll, true);
    assert.ok(!roomJson.usingComponents || !roomJson.usingComponents['status-pad']);
  });
});
