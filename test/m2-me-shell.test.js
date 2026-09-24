const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const creator = require('../miniprogram/services/creator');

describe('M2.1 Me profile shell', () => {
  it('creator exports page/billing/verification/stats helpers', () => {
    assert.equal(typeof creator.fetchPage, 'function');
    assert.equal(typeof creator.fetchBilling, 'function');
    assert.equal(typeof creator.fetchVerification, 'function');
    assert.equal(typeof creator.fetchStats, 'function');
    assert.equal(typeof creator.pageUrlFor, 'function');
    assert.match(creator.pageUrlFor('demo'), /\/demo$/);
  });

  it('me shell wires identity share tools links shop', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.js'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.wxss'),
      'utf8'
    );
    assert.match(wxml, /me-identity/);
    assert.match(wxml, /openShare|分享/);
    assert.match(wxml, /me-share-ico|icon-ui-share-ink\.png/);
    assert.match(wxml, /me-pencil-img|icon-ui-pencil-white\.png|me-avatar-edit/);
    assert.match(wxml, /icon-ui-chevron|me-editor-chevron/);
    assert.match(wxml, /me-sheet-close|×/);
    assert.match(wxml, /Links/);
    assert.match(wxml, /Shop/);
    assert.match(wxml, /商品/);
    assert.match(wxml, /设计/);
    assert.match(wxml, /设置/);
    assert.doesNotMatch(wxml, /bindtap="goCompose"/);
    assert.match(wxml, /icon-ui-nav-people/);
    assert.match(wxml, /me-card-badge|icon-ui-link/);
    assert.match(wxml, /me-bag-img|icon-ui-bag/);
    assert.match(wxml, /切换账号/);
    assert.match(wxml, /分享我的 MuuZi/);
    assert.match(wxml, /icon-ui-list-accent|icon-ui-expand-accent/);
    assert.match(wxml, /数字名片|分享到|打开主页/);
    assert.match(wxml, /me-share-card|保存联系人名片/);
    assert.doesNotMatch(wxml, /复制联系人名片/);
    assert.doesNotMatch(wxml, /me-mini-btn" bindtap="copyShareCard/);
    assert.match(wxml, /bindtap="toggleShareCard"|bindtap="shareToOthers"|bindtap="openSharePage"|bindtap="copyShareCard"/);
    assert.match(wxml, /open-type="\{\{shareUrl \? 'share' : ''\}\}"/);
    assert.match(js, /resolveShareForSheet|_openShareWhenReady/);
    assert.match(js, /toggleShareCard|shareToOthers|openSharePage|copyShareCard|BEGIN:VCARD/);
    assert.match(js, /profileShare|openHomePage|friendShareMessage/);
    assert.match(js, /onShareAppMessage/);
    assert.match(js, /noop\s*\(/);
    assert.doesNotMatch(js, /链接已复制；也可点右上角/);
    assert.doesNotMatch(js, /链接已复制，请在浏览器中打开主页/);
    assert.match(wxss, /me-share-ico/);
    assert.match(wxss, /me-pencil-img|me-tool-ico/);
    assert.match(wxss, /me-share-row-ico/);
    assert.match(wxss, /Songti SC|Noto Serif/);
    assert.match(wxss, /me-editor-action/);
    assert.match(wxss, /me-editor-chevron/);
    assert.doesNotMatch(wxml, /✎/);
    assert.doesNotMatch(wxml, /me-ico-share/);
    assert.doesNotMatch(wxml, /me-ico-people/);
    assert.doesNotMatch(wxss, /me-ico-people::before/);
    assert.doesNotMatch(wxml, /catchtap="true"/);
    assert.match(wxml, /catchtap="noop"/);
    assert.match(wxml, /me-editor-action/);
    assert.match(wxml, /编辑/);
    assert.match(js, /loadCreatorSession/);
    assert.match(js, /fetchPage/);
    assert.match(js, /fetchVerification/);
    assert.match(js, /resolveShareAddress/);
    assert.match(js, /signOutAndRelaunch|clearLocal/);
    assert.match(js, /pages\/me\/settings/);
    assert.match(js, /pages\/me\/shop/);
    assert.match(js, /pages\/me\/edit-home/);
    assert.match(js, /section=links|goLinks/);
  });

  it('settings tree and stub pages are registered', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8')
    );
    const need = [
      'pages/me/settings/index',
      'pages/me/edit-home/index',
      'pages/me/profile/index',
      'pages/me/shop/index',
      'pages/me/address/index',
      'pages/me/contacts/index',
      'pages/me/subjects/index',
      'pages/me/membership/index',
      'pages/me/spaces/index',
      'pages/me/interests/index',
      'pages/me/security/index',
    ];
    need.forEach(function (p) {
      assert.ok(appJson.pages.includes(p), 'missing ' + p);
    });
    const settings = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/settings/index.js'),
      'utf8'
    );
    assert.match(settings, /主页/);
    assert.match(settings, /会员与认证/);
    assert.match(settings, /分身 Muu/);
    assert.match(settings, /账号/);
    assert.match(settings, /退出当前节点/);
    assert.match(settings, /studioLinks|studio\.muuzi\.co|verification/);
    const editHome = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    assert.match(editHome, /publishPage|publish\(/);
    assert.match(editHome, /uploadImage|pickPortrait/);
    assert.doesNotMatch(editHome, /createStubPage/);
  });
});
