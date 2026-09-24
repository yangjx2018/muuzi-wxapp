const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const e2ee = require('../miniprogram/services/matrixE2ee');
const deepLink = require('../miniprogram/services/messageDeepLink');
const tabUnread = require('../miniprogram/services/tabUnread');
const rooms = require('../miniprogram/services/matrixRooms');
const matrixChat = require('../miniprogram/services/matrixChat');

before(() => {
  const badges = [];
  global.wx = {
    setTabBarBadge(opts) {
      badges.push({ set: opts && opts.text });
      if (opts && opts.success) opts.success({});
    },
    removeTabBarBadge(opts) {
      badges.push({ remove: true });
      if (opts && opts.success) opts.success({});
    },
    navigateTo(opts) {
      if (opts && opts.success) opts.success({});
    },
    redirectTo(opts) {
      if (opts && opts.success) opts.success({});
    },
  };
  global.__badges = badges;
});

describe('M3.5 E2EE honesty + M3.6 deep link + M3.7 badge', () => {
  it('opaque copy and private receipt for encrypted messages', () => {
    assert.match(e2ee.OPAQUE_WAITING, /等待解密/);
    assert.match(e2ee.OPAQUE_FAILED, /无法解密/);
    assert.match(e2ee.SEND_BLOCKED, /加密/);
    assert.match(e2ee.ATTACH_BLOCKED, /图片与文件|附件/);
    assert.match(e2ee.BANNER, /可发送文字/);
    assert.doesNotMatch(e2ee.BANNER, /暂不发送加密消息/);
    assert.equal(
      e2ee.receiptTypeForMessage({
        eventId: '$1',
        delivery: 'sent',
        encrypted: true,
      }),
      'm.read.private'
    );
    assert.equal(
      e2ee.receiptTypeForMessage({
        eventId: '$2',
        delivery: 'sent',
        encrypted: false,
      }),
      'm.read'
    );
    assert.equal(
      e2ee.canMarkNotification({ delivery: 'sending', eventId: '$3' }),
      false
    );

    const waiting = rooms.visibleMessage(
      { type: 'm.room.encrypted', event_id: '$e', sender: '@b:ex' },
      '@a:ex'
    );
    assert.equal(waiting.body, e2ee.OPAQUE_WAITING);
    assert.equal(waiting.encrypted, true);
  });

  it('markRead uses private receipt for opaque and clears unread', async () => {
    const store = Object.create(null);
    store['!r:ex'] = rooms.emptyRoom('!r:ex', 'join');
    store['!r:ex'].unread = 3;
    rooms.applyTimeline(store['!r:ex'], [
      {
        type: 'm.room.name',
        state_key: '',
        content: { name: '房' },
      },
      {
        type: 'm.room.encrypted',
        event_id: '$enc',
        sender: '@peer:ex',
        origin_server_ts: 1,
      },
    ]);
    const calls = [];
    const chat = matrixChat.createChatActions({
      api: {
        sendReadReceipt: function (roomId, eventId, type) {
          calls.push({ roomId: roomId, eventId: eventId, type: type });
          return Promise.resolve({});
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
    await chat.markRead('!r:ex', '$enc');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, 'm.read.private');
    assert.equal(store['!r:ex'].unread, 0);
  });

  it('deep link parses room query and builds chat url', async () => {
    assert.equal(
      deepLink.parseRoomQuery({ room: encodeURIComponent('!a:ex') }),
      '!a:ex'
    );
    // 微信 query 对 !/:/% 仍不可靠：URL 只带纯 hex rid，原文走 storage/globalData
    var hex = deepLink.encodeRoomIdParam('!a:ex');
    assert.match(hex, /^[0-9a-f]+$/);
    assert.equal(deepLink.decodeRoomIdParam(hex), '!a:ex');
    assert.match(deepLink.roomChatUrl('!a:ex'), /\?rid=[0-9a-f]+$/);
    assert.equal(deepLink.parseRoomQuery({ rid: hex }), '!a:ex');
    // 旧 URI 编码仍可读
    assert.equal(deepLink.decodeRoomIdParam('%21a%3Aex'), '!a:ex');

    var store = Object.create(null);
    global.wx.setStorageSync = function (k, v) {
      store[k] = v;
    };
    global.wx.getStorageSync = function (k) {
      return store[k];
    };
    global.wx.removeStorageSync = function (k) {
      delete store[k];
    };
    global.getApp = function () {
      return { globalData: { openRoomId: '' } };
    };

    await deepLink.openRoom('!a:ex');
    assert.equal(store[deepLink.STORAGE_KEY], '!a:ex');
    assert.equal(deepLink.resolveOpenRoomId({ rid: 'deadbeef' }), '!a:ex');
    assert.equal(store[deepLink.STORAGE_KEY], undefined);
  });

  it('tabUnread totals and applies badge', () => {
    assert.equal(
      tabUnread.totalUnread([{ unread: 2 }, { unread: 0 }, { unread: 5 }]),
      7
    );
    global.__badges.length = 0;
    tabUnread.applyTabBadge(3);
    tabUnread.applyTabBadge(0);
    assert.deepEqual(global.__badges[0], { set: '3' });
    assert.deepEqual(global.__badges[1], { remove: true });
  });

  it('wires inbox deep link contacts entry and room e2ee banner', () => {
    const messagesJs = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.js'),
      'utf8'
    );
    const roomWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    const contacts = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/contacts/index.js'),
      'utf8'
    );
    const appJs = fs.readFileSync(
      path.join(root, 'miniprogram/app.js'),
      'utf8'
    );
    assert.match(messagesJs, /messageDeepLink|flushPendingRoom/);
    assert.match(roomWxml, /e2eeBanner/);
    assert.doesNotMatch(roomWxml, /加密房间暂不可发送/);
    assert.doesNotMatch(roomWxml, /disabled="\{\{encrypted\}\}"/);
    assert.match(contacts, /openInboxChannel/);
    assert.match(contacts, /inboxRoomId/);
    assert.match(appJs, /pendingRoom|flushPendingRoom/);
  });
});
