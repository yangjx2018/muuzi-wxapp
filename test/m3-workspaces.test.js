const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const workspaces = require('../miniprogram/services/matrixWorkspaces');
const cryptoUtil = require('../miniprogram/utils/field-crypto');

describe('M3.2 ensureWorkspaces same alias', () => {
  it('alias digest matches Node SHA-256 of Matrix user id', () => {
    const userId = '@alice:im.muuzi.co';
    const expected = crypto.createHash('sha256').update(userId, 'utf8').digest('hex');
    assert.equal(cryptoUtil.sha256Hex(userId), expected);
    assert.equal(workspaces.ownerDigest(userId), expected);

    const named = workspaces.aliasFor(userId, 'business');
    assert.equal(named.localpart, 'muuzi-' + expected + '-business');
    assert.equal(named.alias, '#muuzi-' + expected + '-business:im.muuzi.co');

    const notes = workspaces.aliasFor(userId, 'business-notes');
    assert.equal(notes.localpart, 'muuzi-' + expected + '-business-notes');

    const inbox = workspaces.inboxAliasFor(userId);
    assert.equal(inbox.localpart, 'muuzi-inbox-' + expected);
    assert.equal(inbox.alias, '#muuzi-inbox-' + expected + ':im.muuzi.co');
  });

  it('ensureWorkspaces reuses existing alias rooms and links children', async () => {
    const userId = '@bob:ex';
    const digest = workspaces.ownerDigest(userId);
    const roomByAlias = Object.create(null);
    const stateByRoom = Object.create(null);
    const spaceChildren = Object.create(null);

    function putRoom(alias, roomId, key, space) {
      roomByAlias[alias] = roomId;
      stateByRoom[roomId] = [
        {
          type: 'm.room.create',
          state_key: '',
          sender: userId,
          content: space ? { type: 'm.space', 'm.federate': false } : { 'm.federate': false },
        },
        {
          type: workspaces.WORKSPACE_STATE,
          state_key: '',
          sender: userId,
          content: { owner: userId, key: key },
        },
      ];
    }

    // Pre-create all workspace/channel aliases as if App already provisioned them
    workspaces.WORKSPACES.forEach(function (entry) {
      putRoom(
        workspaces.aliasFor(userId, entry.key).alias,
        '!' + entry.key + ':ex',
        entry.key,
        true
      );
      putRoom(
        workspaces.aliasFor(userId, entry.key + '-notes').alias,
        '!' + entry.key + '-notes:ex',
        entry.key + '-notes',
        false
      );
    });
    const inboxAlias = workspaces.inboxAliasFor(userId).alias;
    roomByAlias[inboxAlias] = '!inbox:ex';
    stateByRoom['!inbox:ex'] = [
      {
        type: 'm.room.create',
        state_key: '',
        sender: userId,
        content: { 'm.federate': false },
      },
      {
        type: workspaces.INBOX_MARKER,
        state_key: '',
        sender: userId,
        content: { v: 1, owner: userId },
      },
      {
        type: 'm.room.join_rules',
        state_key: '',
        content: { join_rule: 'invite' },
      },
      {
        type: 'm.room.history_visibility',
        state_key: '',
        content: { history_visibility: 'joined' },
      },
      {
        type: 'm.room.guest_access',
        state_key: '',
        content: { guest_access: 'forbidden' },
      },
      {
        type: 'm.room.member',
        state_key: userId,
        content: { membership: 'join' },
      },
    ];

    const creates = [];
    const api = {
      getRoomIdForAlias(alias) {
        if (roomByAlias[alias]) return Promise.resolve(roomByAlias[alias]);
        return Promise.reject(
          Object.assign(new Error('not found'), { code: 'M_NOT_FOUND' })
        );
      },
      createRoom(body) {
        creates.push(body);
        return Promise.reject(new Error('should reuse existing alias'));
      },
      roomState(roomId) {
        return Promise.resolve(stateByRoom[roomId] || []);
      },
      getStateEvent(roomId, type, stateKey) {
        const key = roomId + '\0' + type + '\0' + stateKey;
        if (spaceChildren[key]) return Promise.resolve(spaceChildren[key]);
        return Promise.reject(
          Object.assign(new Error('missing'), { code: 'M_NOT_FOUND' })
        );
      },
      sendStateEvent(roomId, type, content, stateKey) {
        const key = roomId + '\0' + type + '\0' + stateKey;
        spaceChildren[key] = content;
        return Promise.resolve({});
      },
    };

    const list = await workspaces.ensureWorkspaces(api, userId);
    assert.equal(creates.length, 0);
    assert.equal(list.length, 3);
    assert.equal(list[0].key, 'business');
    assert.equal(list[0].roomId, '!business:ex');
    assert.equal(list[0].channelId, '!business-notes:ex');
    assert.equal(list[0].inboxChannelId, '!inbox:ex');

    const childKey =
      '!business:ex\0m.space.child\0!business-notes:ex';
    assert.deepEqual(spaceChildren[childKey], { via: ['ex'] });
    const inboxChild =
      '!business:ex\0m.space.child\0!inbox:ex';
    assert.deepEqual(spaceChildren[inboxChild], { via: ['ex'] });
    assert.ok(digest.length === 64);
  });

  it('creates missing workspace when alias absent', async () => {
    const userId = '@carol:ex';
    const created = [];
    const roomByAlias = Object.create(null);
    const stateByRoom = Object.create(null);
    const spaceChildren = Object.create(null);
    let seq = 0;

    function materialize(roomId, key, space, markerType, markerContent) {
      stateByRoom[roomId] = [
        {
          type: 'm.room.create',
          state_key: '',
          sender: userId,
          content: space
            ? { type: 'm.space', 'm.federate': false }
            : { 'm.federate': false },
        },
        {
          type: markerType,
          state_key: '',
          sender: userId,
          content: markerContent,
        },
      ];
      if (markerType === workspaces.INBOX_MARKER) {
        stateByRoom[roomId].push(
          {
            type: 'm.room.join_rules',
            state_key: '',
            content: { join_rule: 'invite' },
          },
          {
            type: 'm.room.history_visibility',
            state_key: '',
            content: { history_visibility: 'joined' },
          },
          {
            type: 'm.room.guest_access',
            state_key: '',
            content: { guest_access: 'forbidden' },
          },
          {
            type: 'm.room.member',
            state_key: userId,
            content: { membership: 'join' },
          }
        );
      }
    }

    const api = {
      getRoomIdForAlias(alias) {
        if (roomByAlias[alias]) return Promise.resolve(roomByAlias[alias]);
        return Promise.reject(
          Object.assign(new Error('not found'), { code: 'M_NOT_FOUND' })
        );
      },
      createRoom(body) {
        created.push(body);
        const roomId = '!new' + ++seq + ':ex';
        const alias =
          '#' + body.room_alias_name + ':ex';
        roomByAlias[alias] = roomId;
        if (body.initial_state && body.initial_state[0]) {
          const st = body.initial_state[0];
          const space = !!(
            body.creation_content && body.creation_content.type === 'm.space'
          );
          materialize(roomId, st.content.key, space, st.type, st.content);
        }
        return Promise.resolve(roomId);
      },
      roomState(roomId) {
        return Promise.resolve(stateByRoom[roomId] || []);
      },
      getStateEvent(roomId, type, stateKey) {
        const key = roomId + '\0' + type + '\0' + stateKey;
        if (spaceChildren[key]) return Promise.resolve(spaceChildren[key]);
        return Promise.reject(
          Object.assign(new Error('missing'), { code: 'M_NOT_FOUND' })
        );
      },
      sendStateEvent(roomId, type, content, stateKey) {
        spaceChildren[roomId + '\0' + type + '\0' + stateKey] = content;
        return Promise.resolve({});
      },
    };

    const list = await workspaces.ensureWorkspaces(api, userId);
    assert.equal(list.length, 3);
    assert.ok(created.length >= 7); // 3 spaces + 3 notes + inbox
    assert.equal(list[0].inboxChannelId.indexOf('!'), 0);
    const businessCreate = created.find(function (b) {
      return b.room_alias_name.indexOf('-business') > 0 && !/-notes$/.test(b.room_alias_name);
    });
    assert.ok(businessCreate);
    assert.equal(businessCreate.creation_content.type, 'm.space');
    assert.equal(businessCreate.creation_content['m.federate'], false);
  });

  it('messages page surfaces workspace ready / retry', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.js'),
      'utf8'
    );
    assert.match(js, /retryWorkspaces/);
    assert.match(wxml, /workspaceError|onRetryWorkspaces/);
    assert.match(wxml, /工作区/);
  });
});
