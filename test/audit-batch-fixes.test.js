const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const preview = require('../miniprogram/services/fieldInvitationPreview');
const rooms = require('../miniprogram/services/matrixRooms');

describe('audit batch fixes WX-M / WX-C / WX-ME', () => {
  it('runtime exports deleteAiSession and seeds local join after DM', () => {
    const runtime = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixRuntime.js'),
      'utf8'
    );
    const chat = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixChat.js'),
      'utf8'
    );
    assert.match(chat, /function deleteAiSession/);
    assert.match(chat, /api\.leave|api\.forget/);
    assert.match(runtime, /deleteAiSession/);
    assert.match(runtime, /ensureLocalJoined/);
    assert.match(runtime, /createDirectMessage\(input\)[\s\S]*ensureLocalJoined/);
  });

  it('isOwnAiRoom is exported for delete guard', () => {
    assert.equal(typeof rooms.isOwnAiRoom, 'function');
    assert.equal(typeof rooms.isAiRoom, 'function');
  });

  it('edit-home only resolves share address when published', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    assert.match(js, /if \(page\.slug && page\.published_at\)/);
  });

  it('join gates form on guest/preview entryVerified', () => {
    const api = fs.readFileSync(
      path.join(root, 'miniprogram/services/fieldNodeApi.js'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/join/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/join/index.wxml'),
      'utf8'
    );
    assert.match(api, /guest\/preview/);
    assert.match(js, /checkFieldInvitation|invitationPreview/);
    assert.match(js, /entryVerified/);
    assert.match(wxml, /hasJoinProof && entryVerified/);
  });

  it('checkFieldInvitation accepts open preview only', async () => {
    const link = {
      invitationId: '11111111-1111-1111-1111-111111111111',
      joinProof: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi-_012345',
      expiresAt: Date.now() + 60000,
    };
    const open = await preview.checkFieldInvitation(link, function () {
      return Promise.resolve({
        id: link.invitationId,
        status: 'open',
        expiresAt: link.expiresAt,
      });
    });
    assert.equal(open, true);
    const closed = await preview.checkFieldInvitation(link, function () {
      return Promise.resolve({
        id: link.invitationId,
        status: 'closed',
        expiresAt: link.expiresAt,
      });
    });
    assert.equal(closed, false);
  });
});
