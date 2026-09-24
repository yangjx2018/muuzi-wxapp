const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nodeInbox = require('../miniprogram/services/nodeInbox');
const workspaces = require('../miniprogram/services/matrixWorkspaces');

describe('M-13 node inbox bind', () => {
  it('selectedInboxNode accepts matching https session + config', () => {
    const session = {
      matrixUserId: '@alice:im.muuzi.co',
      accessToken: 'tok',
      nodeOrigin: 'https://im.muuzi.co',
      nodeDomain: 'im.muuzi.co',
      instanceId: 7,
    };
    const config = {
      available: true,
      node: {
        origin: 'https://im.muuzi.co',
        instance_id: 7,
        sender_id: '@inbox:im.muuzi.co',
        client_id: 'guduu-muuzi',
      },
      binding: null,
    };
    const node = nodeInbox.selectedInboxNode(session, config);
    assert.equal(node.sender_id, '@inbox:im.muuzi.co');
  });

  it('selectedInboxNode rejects mismatched domain or self sender', () => {
    const base = {
      matrixUserId: '@alice:im.muuzi.co',
      accessToken: 'tok',
      nodeOrigin: 'https://im.muuzi.co',
      nodeDomain: 'im.muuzi.co',
      instanceId: 7,
    };
    assert.throws(function () {
      nodeInbox.selectedInboxNode(base, {
        available: true,
        node: {
          origin: 'https://other.example',
          instance_id: 7,
          sender_id: '@inbox:im.muuzi.co',
          client_id: 'guduu-muuzi',
        },
        binding: null,
      });
    }, /尚未开放/);
    assert.throws(function () {
      nodeInbox.selectedInboxNode(base, {
        available: true,
        node: {
          origin: 'https://im.muuzi.co',
          instance_id: 7,
          sender_id: '@alice:im.muuzi.co',
          client_id: 'guduu-muuzi',
        },
        binding: null,
      });
    }, /尚未开放/);
  });

  it('nodeInboxBinding PUT validates response and uses Matrix bearer', async () => {
    const session = {
      matrixUserId: '@alice:im.muuzi.co',
      accessToken: 'mat-tok',
      nodeOrigin: 'https://im.muuzi.co',
      nodeDomain: 'im.muuzi.co',
      instanceId: 7,
    };
    const config = {
      available: true,
      node: {
        origin: 'https://im.muuzi.co',
        instance_id: 7,
        sender_id: '@inbox:im.muuzi.co',
        client_id: 'guduu-muuzi',
      },
      binding: null,
    };
    const calls = [];
    const requestFn = function (opts) {
      calls.push(opts);
      return Promise.resolve({
        active: true,
        binding_id: 'ib_0123456789abcdef0123456789abcdef',
        mode: 'body',
      });
    };
    const value = await nodeInbox.nodeInboxBinding(
      session,
      config,
      'PUT',
      { room_id: '!r:im.muuzi.co', mode: 'body' },
      function () {
        return true;
      },
      requestFn
    );
    assert.equal(value.active, true);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      'https://im.muuzi.co/cosmac/connect/apps/guduu-muuzi/inbox/binding'
    );
    assert.equal(calls[0].method, 'PUT');
    assert.equal(calls[0].header.Authorization, 'Bearer mat-tok');
    assert.equal(calls[0].data.api_version, 'application-inbox.v1');
    assert.equal(calls[0].data.room_id, '!r:im.muuzi.co');
    assert.equal(calls[0].data.mode, 'body');
  });

  it('ensurePersonalInbox invites sender when missing membership', async () => {
    const userId = '@bob:ex';
    const sender = '@delivery:ex';
    const alias = workspaces.inboxAliasFor(userId).alias;
    const roomId = '!inbox:ex';
    const state = [
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
    const invites = [];
    const api = {
      getRoomIdForAlias(a) {
        assert.equal(a, alias);
        return Promise.resolve(roomId);
      },
      roomState() {
        return Promise.resolve(state);
      },
      invite(id, peer) {
        invites.push([id, peer]);
        state.push({
          type: 'm.room.member',
          state_key: peer,
          content: { membership: 'invite' },
        });
        return Promise.resolve({});
      },
    };
    const id = await workspaces.ensurePersonalInbox(api, userId, sender);
    assert.equal(id, roomId);
    assert.deepEqual(invites, [[roomId, sender]]);
  });

  it('contacts page wires node-inbox bind UI', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/contacts/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/contacts/index.wxml'),
      'utf8'
    );
    assert.match(js, /nodeInbox/);
    assert.match(js, /ensurePersonalInbox/);
    assert.match(js, /\/api\/creator\/node-inbox/);
    assert.match(wxml, /同意并连接私人频道/);
    assert.match(wxml, /关闭连接并撤回/);
    assert.match(wxml, /inboxModeLabels/);
  });
});
