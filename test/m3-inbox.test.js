const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const inbox = require('../miniprogram/services/matrixInbox');
const direct = require('../miniprogram/services/matrixDirect');

describe('M3.3 inbox filters / DM / invites', () => {
  it('filterInbox applies workspace unread search and room type', () => {
    const rooms = [
      {
        roomId: '!a',
        name: '业务备忘',
        preview: 'hello',
        kind: 'channel',
        unread: 2,
        subtitle: '频道',
      },
      {
        roomId: '!b',
        name: 'Alice',
        preview: 'hi',
        kind: 'direct',
        peerId: '@alice:ex',
        unread: 0,
        subtitle: '私信',
      },
      {
        roomId: '!c',
        name: '新会话',
        preview: 'Muu · 独立会话',
        kind: 'ai',
        subtitle: 'Muu · 独立会话',
        unread: 0,
        starred: false,
      },
    ];
    const workspaces = [
      {
        key: 'business',
        roomId: '!space',
        channelId: '!a',
        inboxChannelId: '!inbox',
      },
    ];

    const all = inbox.filterInbox({ rooms: rooms, workspaces: workspaces });
    assert.equal(all.length, 2); // empty AI hidden

    const unread = inbox.filterInbox({
      rooms: rooms,
      workspaces: workspaces,
      inboxFilter: 'unread',
    });
    assert.equal(unread.length, 1);
    assert.equal(unread[0].roomId, '!a');

    const business = inbox.filterInbox({
      rooms: rooms,
      workspaces: workspaces,
      workspace: 'business',
    });
    assert.equal(business.length, 2); // channel + direct->business

    const search = inbox.filterInbox({
      rooms: rooms,
      workspaces: workspaces,
      search: 'alice',
    });
    assert.equal(search.length, 1);
    assert.equal(search[0].name, 'Alice');

    const directs = inbox.filterInbox({
      rooms: rooms,
      workspaces: workspaces,
      roomType: 'direct',
      showEmptyAi: true,
    });
    assert.equal(directs.length, 1);
  });

  it('normalizePeer matches App rules', () => {
    const own = '@me:im.muuzi.co';
    assert.equal(direct.normalizePeer('alice', own), '@alice:im.muuzi.co');
    assert.equal(
      direct.normalizePeer('@bob:Other.Example', own),
      '@bob:other.example'
    );
    assert.throws(() => direct.normalizePeer('me', own), /自己/);
    assert.throws(() => direct.normalizePeer('guduu', own), /Muu/);
  });

  it('respondToInvite posts join or leave', async () => {
    const calls = [];
    const actions = direct.createDirectActions({
      homeserver: 'https://hs.example',
      accessToken: 'tok',
      userId: '@me:ex',
      request: function (opts) {
        calls.push(opts);
        return Promise.resolve({});
      },
    });
    await actions.respondToInvite('!r:ex', true);
    await actions.respondToInvite('!r:ex', false);
    assert.match(calls[0].url, /\/rooms\/!r%3Aex\/join$/);
    assert.match(calls[1].url, /\/leave$/);
    assert.equal(calls[0].header.Authorization, 'Bearer tok');
  });

  it('messages page wires drawer filters search dm invites', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/index.js'),
      'utf8'
    );
    assert.match(js, /matrixInbox/);
    assert.match(js, /createDirectMessage/);
    assert.match(js, /respondToInvite/);
    assert.match(wxml, /工作区/);
    assert.match(wxml, /未读/);
    assert.match(wxml, /@我/);
    assert.match(wxml, /发起私信/);
    assert.match(wxml, /onAcceptInvite/);
    assert.match(wxml, /workspaceRail|msg-rail/);
    assert.match(wxml, /msg-tile/);
    assert.match(js, /showEmptyAi/);
    assert.match(js, /previewLine/);
    assert.match(js, /resolveAvatars|avatarSrc/);
    assert.match(js, /logo-muu/);
  });
});
