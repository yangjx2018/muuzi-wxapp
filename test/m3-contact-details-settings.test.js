/**
 * 会话设置 · 联系人资料与备注（对齐 App ContactDetails）
 */
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const chatIdentity = require('../miniprogram/services/chatIdentity');
const matrixApi = require('../miniprogram/services/matrixApi');

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
  };
});

describe('M3 contact details in room settings', () => {
  it('updatePreferences writes contact and node remarks', () => {
    const next = chatIdentity.updatePreferences(
      chatIdentity.emptyPreferences(),
      '@peer:other.ex',
      '朋友备注',
      '节点别名'
    );
    assert.equal(next.contacts['@peer:other.ex'], '朋友备注');
    assert.equal(next.nodes['other.ex'], '节点别名');
    assert.throws(
      () =>
        chatIdentity.updatePreferences(
          chatIdentity.emptyPreferences(),
          'bad',
          'x',
          ''
        ),
      /无效/
    );
  });

  it('matrixApi exposes setAccountData', () => {
    const calls = [];
    const api = matrixApi.createMatrixApi({
      homeserver: 'https://hs.ex',
      accessToken: 'tok',
      request(opts) {
        calls.push(opts);
        return Promise.resolve({});
      },
    });
    return api
      .setAccountData('@me:hs.ex', 'im.muuzi.chat_labels', {
        contacts: { '@p:x': 'r' },
        nodes: {},
      })
      .then(function () {
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, 'PUT');
        assert.match(
          calls[0].url,
          /\/user\/%40me%3Ahs\.ex\/account_data\/im\.muuzi\.chat_labels/
        );
        assert.equal(calls[0].data.contacts['@p:x'], 'r');
      });
  });

  it('room settings UI includes ContactDetails parity block', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.js'),
      'utf8'
    );
    assert.match(wxml, /联系人资料与备注/);
    assert.match(wxml, /完整账号/);
    assert.match(wxml, /所属节点/);
    assert.match(wxml, /联系人备注/);
    assert.match(wxml, /节点备注/);
    assert.match(wxml, /保存备注/);
    assert.match(wxml, /取消修改/);
    assert.match(js, /loadContactIdentity/);
    assert.match(js, /saveContactLabels/);
    assert.match(js, /copyContactAccount/);
  });
});
