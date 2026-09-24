/**
 * Bug repro: App 同账号备注（Matrix account_data im.muuzi.chat_labels）
 * 须出现在小程序消息列表私信标题；当前仅用 displayname/localpart。
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

const rooms = require('../miniprogram/services/matrixRooms');

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
    getStorageInfoSync() {
      return { keys: Object.keys(mem) };
    },
  };
});

function dmStore(peerId, displayname) {
  return rooms.applySyncRooms(Object.create(null), {
    join: {
      '!dm:ex': {
        state: {
          events: [
            {
              type: 'm.room.create',
              state_key: '',
              sender: '@me:home.ex',
              content: {},
            },
            {
              type: 'm.room.member',
              state_key: '@me:home.ex',
              content: { membership: 'join' },
            },
            {
              type: 'm.room.member',
              state_key: peerId,
              content: {
                membership: 'join',
                displayname: displayname || '',
              },
            },
            {
              type: 'cosmac.dm',
              state_key: '',
              content: { peer_id: peerId },
            },
          ],
        },
        timeline: { events: [] },
        unread_notifications: { notification_count: 0 },
      },
    },
  });
}

describe('M3 contact remark parity with App', () => {
  it('listJoined prefers im.muuzi.chat_labels contact remark over localpart', () => {
    const peer = '@duxz01:node1.ex';
    const store = dmStore(peer, '');
    const accountData = rooms.applyAccountData(Object.create(null), [
      {
        type: 'im.muuzi.chat_labels',
        content: {
          contacts: { [peer]: '1号节点duxz01' },
          nodes: { 'node1.ex': '' },
        },
      },
    ]);
    const joined = rooms.listJoined(store, '@me:home.ex', accountData);
    const dm = joined.find((r) => r.roomId === '!dm:ex');
    assert.ok(dm);
    assert.equal(dm.kind, 'direct');
    // App ContactLabel: remark first; cross-node appends ⇄ source
    assert.match(dm.name, /1号节点duxz01/);
    assert.notEqual(dm.name, 'duxz01');
  });

  it('roomDetail title uses the same remark as the inbox list', () => {
    const peer = '@duxz:aquarius.ex';
    const store = dmStore(peer, '原始昵称');
    const accountData = {
      'im.muuzi.chat_labels': {
        contacts: { [peer]: '3号节点duxz' },
        nodes: {},
      },
    };
    const detail = rooms.roomDetail(store, '!dm:ex', '@me:home.ex', accountData);
    assert.ok(detail);
    assert.match(detail.name, /3号节点duxz/);
    assert.ok(detail.identity);
    assert.equal(detail.identity.userId, peer);
    assert.equal(detail.identity.remark, '3号节点duxz');
    assert.equal(detail.identity.nickname, '原始昵称');
    assert.equal(detail.identity.crossNode, true);
  });
});
