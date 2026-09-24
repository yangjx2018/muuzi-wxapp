const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('me subpage audit fixes WX-ME-02/03', () => {
  it('contacts subscribes to matrix ready for inbox connect', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/contacts/index.js'),
      'utf8'
    );
    assert.match(js, /matrixRuntime\.subscribe/);
    assert.match(js, /_matrixUnsub/);
    assert.match(js, /syncInboxRoom/);
  });

  it('spaces exposes enterprise invitations entry like App', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/spaces/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/spaces/index.wxml'),
      'utf8'
    );
    assert.match(js, /goEnterpriseInvitations/);
    assert.match(wxml, /查看企业邀请/);
    assert.match(wxml, /goEnterpriseInvitations/);
  });
});
