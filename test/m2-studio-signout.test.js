const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

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
    setClipboardData(opts) {
      if (opts && opts.success) opts.success({});
    },
    reLaunch() {},
  };
});

describe('M2.6 Studio/认证复制 + M2.7 退出清会话', () => {
  it('studioLinks builds studio and verification URLs without web-view', async () => {
    const links = require('../miniprogram/services/studioLinks');
    assert.match(links.studioUrl(), /^https:\/\/studio\.muuzi\.co\/$/);
    assert.match(links.verificationUrl(), /#workspace-settings$/);
    assert.equal(links.displayHost(links.studioUrl()), 'studio.muuzi.co');
    const copied = await links.copyLink('verification');
    assert.equal(copied.purpose, 'verification');
    assert.match(copied.label, /认证/);
  });

  it('clearLocal wipes session creator and account-bound keys', () => {
    const store = require('../miniprogram/adapters/secure-store');
    store.set(store.KEYS.MATRIX_ACCESS_TOKEN, 'tok');
    store.set(store.KEYS.MATRIX_USER_ID, '@u:x');
    store.set('auth_flow_json', '{"email":"a@b.c"}');
    store.set('me_space_org_id', 'org_1');
    store.set('public_page_skin_id', 'rose');
    store.set('me_open_share', '1');
    store.set('field_pending_v1:@u:x', '{"x":1}');

    store.clearSessionKeys();

    assert.equal(store.get(store.KEYS.MATRIX_ACCESS_TOKEN), '');
    assert.equal(store.get('auth_flow_json'), '');
    assert.equal(store.get('me_space_org_id'), '');
    assert.equal(store.get('public_page_skin_id'), '');
    assert.equal(store.get('me_open_share'), '');
    assert.equal(store.get('field_pending_v1:@u:x'), '');
  });

  it('session exports signOutAndRelaunch and settings use studioLinks', () => {
    const session = require('../miniprogram/services/session');
    assert.equal(typeof session.signOutAndRelaunch, 'function');
    assert.equal(typeof session.clearLocal, 'function');

    const settings = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/settings/index.js'),
      'utf8'
    );
    assert.match(settings, /studioLinks/);
    assert.match(settings, /action: 'verification'/);
    assert.match(settings, /signOutAndRelaunch/);
    assert.doesNotMatch(settings, /https:\/\/www\.muuzi\.co\/studio\//);

    const me = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.js'),
      'utf8'
    );
    assert.match(me, /signOutAndRelaunch/);
  });
});
