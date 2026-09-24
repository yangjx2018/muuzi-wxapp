/**
 * 回归：同账号冷启动后好友/私信必须仍出现在列表（不得依赖磁盘 since）。
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rooms = require('../miniprogram/services/matrixRooms');
const matrixClient = require('../miniprogram/services/matrixClient');

const mem = Object.create(null);

beforeEach(() => {
  Object.keys(mem).forEach((k) => delete mem[k]);
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

function dmJoinChunk(roomId, ownId, peerId) {
  return {
    state: {
      events: [
        {
          type: 'm.room.create',
          state_key: '',
          sender: ownId,
          content: {},
        },
        {
          type: 'cosmac.dm',
          state_key: '',
          content: { v: 1, peer_id: peerId },
        },
        {
          type: 'm.room.join_rules',
          state_key: '',
          content: { join_rule: 'invite' },
        },
        {
          type: 'm.room.member',
          state_key: ownId,
          sender: ownId,
          content: { membership: 'join' },
        },
        {
          type: 'm.room.member',
          state_key: peerId,
          sender: peerId,
          content: { membership: 'join', displayname: '好友甲' },
        },
      ],
    },
    timeline: {
      events: [
        {
          type: 'm.room.message',
          sender: peerId,
          origin_server_ts: 1700000000000,
          content: { msgtype: 'm.text', body: '在吗' },
        },
      ],
    },
    summary: {
      'm.heroes': [peerId],
      'm.joined_member_count': 2,
      'm.invited_member_count': 0,
    },
    unread_notifications: { notification_count: 1 },
  };
}

describe('friends persist across cold start', () => {
  it('runtime never resumes createMatrixClient from persisted since', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/matrixRuntime.js'),
      'utf8'
    );
    assert.match(src, /无磁盘房间缓存时必须全量 sync/);
    assert.match(src, /var since = '';/);
    assert.match(src, /clearPersistedSync\(\);/);
    // ensureStarted 不得再从磁盘恢复 since
    const ensureIdx = src.indexOf('function ensureStarted');
    const createIdx = src.indexOf('createMatrixClient', ensureIdx);
    const slice = src.slice(ensureIdx, createIdx + 220);
    assert.match(slice, /var since = '';/);
    assert.doesNotMatch(slice, /store\.get\(SYNC_SINCE_KEY\)/);
    assert.doesNotMatch(slice, /store\.get\(store\.KEYS\.MATRIX_SYNC_SINCE\)/);
  });

  it('full initial sync surfaces direct rooms that incremental empty-store would miss', () => {
    const ownId = '@me:node.example';
    const peerId = '@friend:node.example';
    const roomId = '!dm1:node.example';

    // 模拟「错误路径」：空 store + 仅有 next_batch、无 join → 列表空（旧 bug）
    const emptyClient = matrixClient.createMatrixClient({
      homeserver: 'https://node.example',
      accessToken: 'tok',
      userId: ownId,
      since: 's_old_token',
      request: function () {
        return Promise.resolve({ next_batch: 's_new' });
      },
    });
    emptyClient._applySyncBody({ next_batch: 's_new', rooms: {} });
    assert.equal(emptyClient.getSnapshot().rooms.length, 0);
    emptyClient.stop();

    // 正确路径：since 空 → 全量 join 含私信
    const client = matrixClient.createMatrixClient({
      homeserver: 'https://node.example',
      accessToken: 'tok',
      userId: ownId,
      since: '',
      request: function () {
        return Promise.resolve({ next_batch: 's1' });
      },
    });
    const snap = client._applySyncBody({
      next_batch: 's1',
      rooms: {
        join: {
          [roomId]: dmJoinChunk(roomId, ownId, peerId),
        },
      },
      account_data: {
        events: [
          {
            type: 'm.direct',
            content: { [peerId]: [roomId] },
          },
        ],
      },
    });
    assert.ok(snap.rooms.length >= 1);
    const item = snap.rooms.find((r) => r.roomId === roomId);
    assert.ok(item, '私信房间应出现在列表');
    assert.equal(item.kind, 'direct');
    assert.match(String(item.name || ''), /好友|friend/i);
    client.stop();
  });

  it('isHumanDirect matches App: dm state, m.direct map, is_direct invite', () => {
    const ownId = '@me:ex';
    const peerId = '@p:ex';
    const store = rooms.applySyncRooms(Object.create(null), {
      join: {
        '!a:ex': dmJoinChunk('!a:ex', ownId, peerId),
      },
      invite: {
        '!b:ex': {
          invite_state: {
            events: [
              {
                type: 'm.room.create',
                state_key: '',
                sender: peerId,
                content: {},
              },
              {
                type: 'm.room.join_rules',
                state_key: '',
                content: { join_rule: 'invite' },
              },
              {
                type: 'm.room.member',
                state_key: ownId,
                sender: peerId,
                content: { membership: 'invite', is_direct: true },
              },
            ],
          },
        },
      },
    });
    const dmMap = rooms.directMap({ 'm.direct': { [peerId]: ['!a:ex'] } });
    assert.equal(rooms.isHumanDirect(store['!a:ex'], ownId, dmMap), true);
    assert.equal(rooms.isHumanDirect(store['!b:ex'], ownId, {}), true);

    // 公开房间不得当私信
    const pub = rooms.applySyncRooms(Object.create(null), {
      join: {
        '!pub:ex': {
          state: {
            events: [
              {
                type: 'm.room.create',
                state_key: '',
                content: {},
              },
              {
                type: 'm.room.join_rules',
                state_key: '',
                content: { join_rule: 'public' },
              },
            ],
          },
          timeline: { events: [] },
        },
      },
    });
    assert.equal(rooms.isHumanDirect(pub['!pub:ex'], ownId, {}), false);
  });

  it('summary heroes recover peer when members lazy-loaded', () => {
    const ownId = '@me:ex';
    const peerId = '@lazy:ex';
    const store = rooms.applySyncRooms(Object.create(null), {
      join: {
        '!lz:ex': {
          state: {
            events: [
              {
                type: 'cosmac.dm',
                state_key: '',
                content: { v: 1, peer_id: peerId },
              },
              {
                type: 'm.room.member',
                state_key: ownId,
                sender: ownId,
                content: { membership: 'join' },
              },
            ],
          },
          timeline: { events: [] },
          summary: {
            'm.heroes': [peerId],
            'm.joined_member_count': 2,
            'm.invited_member_count': 0,
          },
        },
      },
    });
    const list = rooms.listJoined(store, ownId, {
      'm.direct': { [peerId]: ['!lz:ex'] },
    });
    const item = list.find((r) => r.roomId === '!lz:ex');
    assert.ok(item);
    assert.equal(item.kind, 'direct');
  });
});
