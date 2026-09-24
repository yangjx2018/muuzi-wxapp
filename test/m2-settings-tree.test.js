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
    getSetting(opts) {
      if (opts && opts.success) {
        opts.success({
          authSetting: {},
          subscriptionsSetting: { mainSwitch: true },
        });
      }
    },
  };
});

describe('M2.2 settings tree', () => {
  it('pageSkins persists selection locally', () => {
    const skins = require('../miniprogram/services/pageSkins');
    assert.equal(skins.getSkinId(), 'indigo');
    skins.setSkinId('rose');
    assert.equal(skins.getSkinId(), 'rose');
    assert.equal(skins.getSkin().label, '玫瑰粉');
    assert.equal(skins.skinOptions('rose')[0].selected, true);
    assert.throws(() => skins.setSkinId('neon'), /未知主页配色/);
  });

  it('meSettings compactNumber and notification helpers', async () => {
    const me = require('../miniprogram/services/meSettings');
    assert.equal(me.compactNumber(12), '12');
    assert.equal(me.compactNumber(1500), '1.5k');
    assert.equal(me.notificationsSupported(), true);
    const status = await me.notificationStatus();
    assert.equal(status.supported, true);
    assert.equal(status.authorized, true);
  });

  it('settings page covers PRD tree without orphans', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/settings/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/settings/index.wxml'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/settings/index.wxss'),
      'utf8'
    );
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8')
    );

    assert.match(wxml, /通知/);
    assert.match(wxml, /me-stats|访客/);
    assert.match(wxml, /me-swatch|主页配色/);
    assert.match(wxml, /me-settings-row-icon/);
    assert.match(wxml, /me-settings-offer|Pro · 自定义主页地址/);
    assert.match(wxml, /系统通知设置/);
    assert.match(wxml, /icoShield|icon-ui-shield/);
    assert.doesNotMatch(wxml, /‹ 返回|me-settings-back/);
    assert.match(wxss, /me-settings-row-icon/);
    assert.match(wxss, /linear-gradient\(150deg/);
    assert.match(js, /代理权限与人设/);
    assert.match(js, /Agent 卡与邀请分享/);
    assert.match(js, /企业与邀请/);
    assert.match(js, /我的收藏/);
    assert.match(js, /形象与声音/);
    assert.match(js, /fetchStats/);
    assert.match(js, /fetchPage/);
    assert.match(js, /pageSkins/);
    assert.match(js, /me_open_share/);
    assert.match(js, /pageHost/);
    assert.match(js, /icon-ui-mail-accent/);
    assert.match(js, /icon-ui-shield-accent/);

    [
      'icon-ui-shield-accent.png',
      'icon-ui-mail-accent.png',
      'icon-ui-bookmark-accent.png',
      'icon-ui-calendar-accent.png',
      'icon-ui-menu-accent.png',
    ].forEach(function (name) {
      assert.ok(
        fs.existsSync(path.join(root, 'miniprogram/assets', name)),
        'missing icon ' + name
      );
    });

    [
      'pages/me/agent-access/index',
      'pages/me/sharing/index',
      'pages/me/enterprise-invitations/index',
      'pages/me/saved/index',
      'pages/me/muu/index',
    ].forEach(function (p) {
      assert.ok(appJson.pages.includes(p), 'missing ' + p);
      assert.ok(
        fs.existsSync(path.join(root, 'miniprogram', p + '.js')),
        'missing file ' + p
      );
    });
  });
});
