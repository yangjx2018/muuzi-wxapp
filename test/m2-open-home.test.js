/**
 * Bug repro + App 对等：看成品条目必须打开/播放，禁止默认「条目链接已复制」。
 * 对照真值：docs/OPEN_HOME_APP_PARITY.md
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const profileShare = require('../miniprogram/services/profileShare');
const openLink = require('../miniprogram/services/openLink');
const config = require('../miniprogram/config');

describe('open-home finished-product fallback', () => {
  it('open-home never mounts web-view without embedAllowed + canEmbed gate', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-home/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-home/index.wxml'),
      'utf8'
    );
    assert.match(js, /homeOpenPlan|canEmbedHomeUrl/);
    assert.match(js, /forceCopy|force === 'copy'/);
    assert.match(js, /onWebViewError/);
    assert.match(js, /loadNativePreview|fetchPublicPage/);
    assert.match(wxml, /embedAllowed && homeUrl/);
    assert.match(wxml, /binderror="onWebViewError"/);
    assert.match(wxml, /复制主页链接/);
    assert.match(wxml, /oh-preview/);
    assert.match(wxml, /oh-preview-panel-a/);
    assert.match(wxml, /oh-preview-footer/);
    assert.match(wxml, /在 MuuZi 上加入/);
    assert.match(wxml, /logo-muu\.png/);
    assert.match(wxml, /icon-share-out\.png/);
    assert.match(wxml, /open-type="share"/);
    assert.match(js, /onShareAppMessage/);
    assert.match(js, /friendShareMessage/);
    assert.doesNotMatch(wxml, /LIVE · 已发布/);
    assert.doesNotMatch(wxml, /oh-preview-brand-m/);
    assert.doesNotMatch(wxml, /wx:if="\{\{homeUrl\}\}"/);
  });

  it('open-home opens/plays items instead of default copy toast', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-home/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-home/index.wxml'),
      'utf8'
    );
    assert.match(js, /openLink\.openHttps|require\('\.\.\/\.\.\/\.\.\/services\/openLink'\)/);
    assert.match(js, /sectionsFromPublished/);
    assert.match(js, /type === 'shop'|type === \"shop\"|section\.type/);
    assert.match(js, /directAudio|isDirectAudio/);
    assert.match(js, /createInnerAudioContext|playAudio/);
    assert.match(js, /function openLink|openLink\(e\)/);
    // 点击路径不得再把「复制」当打开；允许注释/文档提及反例时用更严断言
    assert.doesNotMatch(js, /copyShareUrlFallback\([^)]*条目/);
    assert.match(wxml, /bindtap="openLink"/);
    assert.match(wxml, /bindtap="onAudioTap"/);
    assert.match(wxml, /oh-shop-grid|oh-product/);
    assert.match(wxml, /oh-audio-card/);
    assert.match(wxml, /oh-note-card/);
    assert.match(wxml, /section\.type === 'shop'/);
    assert.match(wxml, /section\.type === 'custom'/);
  });

  it('openLink service prefers navigate over copy', () => {
    const src = fs.readFileSync(
      path.join(root, 'miniprogram/services/openLink.js'),
      'utf8'
    );
    assert.match(src, /pages\/me\/open-link\/index/);
    assert.match(src, /isDirectAudio/);
    assert.doesNotMatch(src, /copyShareUrlFallback/);
    assert.equal(openLink.isDirectAudio('https://cdn.example.com/a.mp3'), true);
    assert.equal(openLink.isDirectAudio('https://tiktok.com/@x'), false);
  });

  it('open-link page exists and embeds only when allowed', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-link/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-link/index.wxml'),
      'utf8'
    );
    const appJson = fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8');
    assert.match(appJson, /pages\/me\/open-link\/index/);
    assert.match(wxml, /web-view/);
    assert.match(wxml, /copyForBrowser/);
    assert.match(js, /canEmbedUrl|canEmbedHomeUrl/);
    assert.doesNotMatch(js, /条目链接已复制/);
  });

  it('edit-home draft preview uses logo + share-out icon like App hero-profile', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    assert.match(wxml, /eh-preview-brand[\s\S]*logo-muu\.png/);
    assert.match(wxml, /eh-preview-share-mini[\s\S]*icon-share-out\.png/);
    assert.doesNotMatch(wxml, /eh-preview-brand-m/);
  });

  it('openHomePage forces copy when host not in WEBVIEW_BUSINESS_HOSTS', () => {
    assert.deepEqual(config.WEBVIEW_BUSINESS_HOSTS, []);
    const href = 'https://im.muuzi.co/muuzi/muuzi-duxz';
    assert.equal(profileShare.canEmbedHomeUrl(href), false);
    assert.equal(profileShare.homeOpenPlan(href).mode, 'copy');
    assert.equal(profileShare.homeOpenPlan(href).homeUrl, '');
  });

  it('edit-home 看成品 still routes through openHomePage + 预览草稿 before SHARE', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    assert.match(js, /openFinishedProduct[\s\S]*openHomePage/);
    assert.match(wxml, /bindtap="openFinishedProduct">看成品/);
    assert.match(wxml, /eh-share-section|SHARE · 预览与分享|eh-ghost-btn/);
    assert.match(wxml, /eh-preview-draft-row/);
    assert.match(wxml, /bindtap="openPreview">预览草稿/);
  });
});
