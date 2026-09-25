const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const settings = require('../miniprogram/services/matrixRoomSettings');

describe('M-07 room settings', () => {
  it('power helpers use Matrix defaults', () => {
    const empty = {};
    assert.equal(settings.ownPower(empty, '@a:ex'), 0);
    assert.equal(settings.stateEventPower(empty, 'm.room.name'), 50);
    assert.equal(settings.mayInvite(empty, '@a:ex'), true); // invite default 0
    assert.equal(settings.mayKick(empty, '@a:ex', '@b:ex'), false);

    const power = {
      users_default: 0,
      state_default: 50,
      invite: 0,
      kick: 50,
      users: { '@mod:ex': 50, '@admin:ex': 100, '@peer:ex': 50 },
      events: { 'm.room.name': 50, 'm.room.topic': 50 },
    };
    assert.equal(settings.ownPower(power, '@mod:ex'), 50);
    assert.equal(settings.maySendStateEvent(power, '@mod:ex', 'm.room.name'), true);
    assert.equal(settings.maySendStateEvent(power, '@user:ex', 'm.room.name'), false);
    assert.equal(settings.mayKick(power, '@admin:ex', '@mod:ex'), true);
    assert.equal(settings.mayKick(power, '@mod:ex', '@peer:ex'), false);
    assert.equal(settings.mayKick(power, '@mod:ex', '@mod:ex'), false);
  });

  it('createRoomSettings read / update / invite / remove', async () => {
    const userId = '@owner:ex';
    const events = [
      {
        type: 'm.room.power_levels',
        state_key: '',
        content: {
          users: { [userId]: 100 },
          users_default: 0,
          state_default: 50,
          invite: 50,
          kick: 50,
        },
      },
      {
        type: 'm.room.name',
        state_key: '',
        content: { name: 'Team' },
      },
      {
        type: 'm.room.topic',
        state_key: '',
        content: { topic: 'hello' },
      },
      {
        type: 'm.room.member',
        state_key: userId,
        content: { membership: 'join', displayname: 'Owner' },
      },
      {
        type: 'm.room.member',
        state_key: '@guest:ex',
        content: { membership: 'join', displayname: 'Guest' },
      },
    ];
    const sent = [];
    const invites = [];
    const kicks = [];
    const api = {
      roomState() {
        return Promise.resolve(events);
      },
      sendStateEvent(roomId, type, content, stateKey) {
        sent.push({ roomId, type, content, stateKey });
        return Promise.resolve({});
      },
      invite(roomId, peer) {
        invites.push([roomId, peer]);
        return Promise.resolve({});
      },
      kick(roomId, target) {
        kicks.push([roomId, target]);
        return Promise.resolve({});
      },
    };
    const actions = settings.createRoomSettings(api, userId);
    const data = await actions.read('!r:ex');
    assert.equal(data.name, 'Team');
    assert.equal(data.topic, 'hello');
    assert.equal(data.canName, true);
    assert.equal(data.canInvite, true);
    assert.equal(data.members.length, 2);
    const guest = data.members.find(function (m) {
      return m.id === '@guest:ex';
    });
    assert.ok(guest);
    assert.equal(guest.canRemove, true);

    await actions.update('!r:ex', 'name', 'New');
    assert.equal(sent[0].type, 'm.room.name');
    assert.deepEqual(sent[0].content, { name: 'New' });

    await actions.invite('!r:ex', '@new:ex');
    assert.deepEqual(invites[0], ['!r:ex', '@new:ex']);

    await actions.remove('!r:ex', '@guest:ex');
    assert.deepEqual(kicks[0], ['!r:ex', '@guest:ex']);
  });

  it('module and room page expose settings wiring', () => {
    assert.ok(
      fs.existsSync(
        path.join(root, 'miniprogram/services/matrixRoomSettings.js')
      )
    );
    const runtime = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixRuntime.js'),
      'utf8'
    );
    assert.match(runtime, /readRoomSettings/);
    assert.match(runtime, /updateRoomSettings/);
    assert.match(runtime, /inviteRoomMember/);
    assert.match(runtime, /removeRoomMember/);
    assert.match(runtime, /getContactIdentity/);
    assert.match(runtime, /saveContactLabels/);
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.js'),
      'utf8'
    );
    assert.match(wxml, /openSettings/);
    assert.match(wxml, /群设置|会话设置/);
    assert.match(wxml, /联系人资料与备注/);
    assert.match(wxml, /保存备注/);
    assert.match(wxml, /contactIdentity/);
    assert.match(js, /readRoomSettings/);
    assert.match(js, /inviteRoomMember/);
    assert.match(js, /saveContactLabels/);
    assert.match(js, /getContactIdentity/);
  });

  it('DM settings hide self member and use scrollable centered panel', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.js'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxss'),
      'utf8'
    );
    // 私信成员列表过滤本机账号
    assert.match(js, /isDirect && ownId/);
    assert.match(js, /m\.id !== ownId/);
    assert.match(js, /settingsScrollPx/);
    assert.match(wxml, /settingsScrollPx/);
    assert.match(wxml, /toggleMemberMenu/);
    assert.match(wxml, /···/);
    // 居中遮罩 + 可滚（非贴底不可滑抽屉）
    assert.match(wxss, /align-items:\s*center/);
    assert.match(wxss, /z-index:\s*1000/);
    assert.match(wxss, /max-height:\s*80vh/);
    assert.match(wxss, /env\(safe-area-inset-bottom\)/);
  });
});
