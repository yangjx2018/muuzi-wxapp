const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rooms = require('../miniprogram/services/matrixRooms');
const matrixClient = require('../miniprogram/services/matrixClient');

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

describe('M3.1 Matrix client skeleton', () => {
  it('reduces sync join rooms into readable list items', () => {
    const store = rooms.applySyncRooms(Object.create(null), {
      join: {
        '!chan:ex': {
          state: {
            events: [
              {
                type: 'm.room.create',
                state_key: '',
                sender: '@u:ex',
                content: {},
              },
              {
                type: 'm.room.name',
                state_key: '',
                content: { name: '业务备忘' },
              },
            ],
          },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                sender: '@u:ex',
                origin_server_ts: 1000,
                content: { msgtype: 'm.text', body: '你好' },
              },
            ],
          },
          unread_notifications: { notification_count: 2 },
        },
        '!space:ex': {
          state: {
            events: [
              {
                type: 'm.room.create',
                state_key: '',
                content: { type: 'm.space' },
              },
              {
                type: 'm.room.name',
                state_key: '',
                content: { name: '业务工作区' },
              },
            ],
          },
          timeline: { events: [] },
        },
        '!ctrl:ex': {
          state: {
            events: [
              {
                type: 'm.room.canonical_alias',
                state_key: '',
                content: { alias: '#cosmac-ctrl:ex' },
              },
            ],
          },
          timeline: { events: [] },
        },
      },
      invite: {
        '!inv:ex': {
          invite_state: {
            events: [
              {
                type: 'm.room.name',
                state_key: '',
                content: { name: '待接受私信' },
              },
            ],
          },
        },
      },
    });

    const accountData = rooms.applyAccountData(Object.create(null), []);
    const joined = rooms.listJoined(store, '@u:ex', accountData);
    const invites = rooms.listInvites(store, '@u:ex', accountData);

    assert.equal(joined.length, 1);
    assert.equal(joined[0].roomId, '!chan:ex');
    assert.equal(joined[0].name, '业务备忘');
    assert.equal(joined[0].preview, '你好');
    assert.equal(joined[0].unread, 2);
    assert.equal(joined[0].kind, 'channel');

    assert.equal(invites.length, 1);
    assert.equal(invites[0].name, '待接受私信');
  });

  it('list items expose peer avatar mxc for direct rooms', () => {
    const store = rooms.applySyncRooms(Object.create(null), {
      join: {
        '!dm:ex': {
          state: {
            events: [
              {
                type: 'm.room.create',
                state_key: '',
                sender: '@me:ex',
                content: {},
              },
              {
                type: 'm.room.member',
                state_key: '@me:ex',
                content: { membership: 'join' },
              },
              {
                type: 'm.room.member',
                state_key: '@peer:ex',
                content: {
                  membership: 'join',
                  displayname: 'Peer',
                  avatar_url: 'mxc://ex/ava1',
                },
              },
              {
                type: 'cosmac.dm',
                state_key: '',
                content: { peer_id: '@peer:ex' },
              },
            ],
          },
          timeline: { events: [] },
          unread_notifications: { notification_count: 0 },
        },
      },
    });
    const joined = rooms.listJoined(store, '@me:ex', {});
    const dm = joined.find((r) => r.roomId === '!dm:ex');
    assert.ok(dm);
    assert.equal(dm.kind, 'direct');
    assert.equal(dm.avatar, 'mxc://ex/ava1');
  });

  it('marks ready after first successful sync body', async () => {
    const calls = [];
    const client = matrixClient.createMatrixClient({
      homeserver: 'https://hs.example',
      accessToken: 'tok',
      userId: '@u:ex',
      pollTimeoutMs: 1000,
      httpTimeoutMs: 2000,
      request: function (opts) {
        calls.push(opts);
        if (calls.length > 1) {
          // 后续长轮询挂起，由 stop 打断，避免测试进程挂住
          return new Promise(function () {});
        }
        return Promise.resolve({
          next_batch: 's1',
          rooms: {
            join: {
              '!r:ex': {
                state: {
                  events: [
                    {
                      type: 'm.room.name',
                      state_key: '',
                      content: { name: '频道 A' },
                    },
                  ],
                },
                timeline: { events: [] },
              },
            },
          },
          account_data: { events: [] },
        });
      },
    });

    let seenReady = false;
    const waitReady = new Promise(function (resolve) {
      client.subscribe(function (snap) {
        if (snap.ready) {
          seenReady = true;
          resolve();
        }
      });
    });
    client.start();
    await Promise.race([
      waitReady,
      new Promise(function (_, reject) {
        setTimeout(function () {
          reject(new Error('ready timeout'));
        }, 1000);
      }),
    ]);
    client.stop();

    const snap = client.getSnapshot();
    assert.equal(seenReady, true);
    assert.equal(snap.ready, true);
    assert.equal(snap.since, 's1');
    assert.equal(snap.rooms.length, 1);
    assert.equal(snap.rooms[0].name, '频道 A');
    assert.ok(calls.length >= 1);
    assert.match(calls[0].url, /\/_matrix\/client\/v3\/sync/);
    assert.match(calls[0].header.Authorization, /^Bearer tok$/);
  });

  it('surfaces honest error on unknown token and stops', async () => {
    let rejected = '';
    const client = matrixClient.createMatrixClient({
      homeserver: 'https://hs.example',
      accessToken: 'bad',
      userId: '@u:ex',
      onTokenRejected: function (message) {
        rejected = message;
      },
      request: function () {
        return Promise.reject(
          Object.assign(new Error('unauthorized'), {
            statusCode: 401,
            code: 'M_UNKNOWN_TOKEN',
          })
        );
      },
    });
    client.start();
    await new Promise(function (resolve) {
      setTimeout(resolve, 40);
    });
    const snap = client.getSnapshot();
    assert.match(snap.error, /登录已失效|重新登录/);
    assert.equal(snap.ready, false);
    assert.match(rejected, /登录已失效|重新登录/);
    client.stop();
  });

  it('refreshes access token once on M_UNKNOWN_TOKEN then resumes sync', async () => {
    let rejected = '';
    let phase = 0;
    const client = matrixClient.createMatrixClient({
      homeserver: 'https://hs.example',
      accessToken: 'old',
      userId: '@u:ex',
      onTokenRefresh: function () {
        phase = 1;
        return Promise.resolve('new-tok');
      },
      onTokenRejected: function (message) {
        rejected = message;
      },
      request: function (opts) {
        var auth = (opts && opts.header && opts.header.Authorization) || '';
        if (phase === 0) {
          return Promise.reject(
            Object.assign(new Error('unauthorized'), {
              statusCode: 401,
              code: 'M_UNKNOWN_TOKEN',
            })
          );
        }
        assert.match(auth, /Bearer new-tok/);
        return Promise.resolve({
          next_batch: 's1',
          rooms: { join: {}, invite: {}, leave: {} },
        });
      },
    });
    client.start();
    await new Promise(function (resolve) {
      setTimeout(resolve, 80);
    });
    const snap = client.getSnapshot();
    assert.equal(rejected, '');
    assert.equal(snap.ready, true);
    assert.equal(snap.error, '');
    client.stop();
  });

  it('does not treat bare HTTP 401 as session death (App tokenRejected parity)', async () => {
    let rejected = '';
    let calls = 0;
    const client = matrixClient.createMatrixClient({
      homeserver: 'https://hs.example',
      accessToken: 'tok',
      userId: '@u:ex',
      onTokenRejected: function (message) {
        rejected = message;
      },
      request: function () {
        calls += 1;
        return Promise.reject(
          Object.assign(new Error('unauthorized'), {
            statusCode: 401,
            code: '',
          })
        );
      },
    });
    client.start();
    await new Promise(function (resolve) {
      setTimeout(resolve, 50);
    });
    const snap = client.getSnapshot();
    assert.match(snap.error, /同步失败|401|连不上/);
    assert.equal(rejected, '');
    assert.ok(calls >= 1);
    assert.equal(matrixClient.tokenRejected({ statusCode: 401 }), false);
    assert.equal(
      matrixClient.tokenRejected({
        statusCode: 401,
        code: 'M_UNKNOWN_TOKEN',
      }),
      true
    );
    client.stop();
  });

  it('messages page wires runtime ready state without fake chat', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.js'),
      'utf8'
    );
    assert.match(js, /matrixRuntime/);
    assert.match(js, /ensureStarted/);
    assert.match(js, /onOpenRoom/);
    assert.match(wxml, /正在同步节点对话|msg-sync/);
    assert.match(wxml, /不会伪造房间|这里暂时没有对话/);
    assert.match(wxml, /msg-rail|全部消息/);
  });

  it('logout clears sync since key', () => {
    const store = require('../miniprogram/adapters/secure-store');
    store.set(store.KEYS.MATRIX_SYNC_SINCE, 's99');
    store.set(store.KEYS.MATRIX_ACCESS_TOKEN, 'tok');
    store.clearSessionKeys();
    assert.equal(store.get(store.KEYS.MATRIX_SYNC_SINCE), '');
    assert.equal(store.get(store.KEYS.MATRIX_ACCESS_TOKEN), '');
  });
});
