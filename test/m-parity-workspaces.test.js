/**
 * nodeWorkspaces / receipts / field saved filter
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const rooms = require('../miniprogram/services/matrixRooms');

describe('M-02/M-06/M-09 node workspaces and receipts', () => {
  it('workspaceViews lists field spaces and channel children', () => {
    const store = Object.create(null);
    const space = rooms.emptyRoom('!space:ex', 'join');
    space.state['m.room.create\0'] = {
      type: 'm.room.create',
      state_key: '',
      content: { type: 'm.space' },
      sender: '@u:ex',
    };
    space.state['co.muuzi.field\0'] = {
      type: 'co.muuzi.field',
      state_key: '',
      content: { kind: 'space', owner: '@u:ex', key: 'workspace' },
      sender: '@u:ex',
    };
    space.state['m.room.name\0'] = {
      type: 'm.room.name',
      state_key: '',
      content: { name: '现场交流' },
    };
    space.state['m.space.child\0!topic:ex'] = {
      type: 'm.space.child',
      state_key: '!topic:ex',
      content: { via: ['ex'] },
    };
    store['!space:ex'] = space;
    const views = rooms.workspaceViews(store);
    assert.equal(views.length, 1);
    assert.equal(views[0].field, true);
    assert.deepEqual(views[0].channelIds, ['!topic:ex']);
  });

  it('receipts mark own messages readByOthers', () => {
    const room = rooms.emptyRoom('!r:ex', 'join');
    room.state['m.room.member\0@peer:ex'] = {
      type: 'm.room.member',
      state_key: '@peer:ex',
      content: { membership: 'join' },
    };
    room.timeline = [
      {
        type: 'm.room.message',
        event_id: '$e1',
        sender: '@me:ex',
        origin_server_ts: 1,
        content: { msgtype: 'm.text', body: 'hi' },
      },
    ];
    rooms.applyReceiptEvents(room, [
      {
        type: 'm.receipt',
        content: {
          $e1: { 'm.read': { '@peer:ex': { ts: 2 } } },
        },
      },
    ]);
    const list = rooms.listMessages(room, '@me:ex');
    assert.equal(list.length, 1);
    assert.equal(list[0].readByOthers, true);
  });
});
