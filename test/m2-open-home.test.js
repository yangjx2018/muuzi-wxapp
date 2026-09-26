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
    assert.match(wxml, /oh-preview|home-page-preview|previewModel/);
    assert.match(wxml, /previewModel|home-page-preview/);
    const comp = fs.readFileSync(
      path.join(root, 'miniprogram/components/home-page-preview/index.wxml'),
      'utf8'
    );
    assert.match(comp, /hpp-footer|在 MuuZi 上加入|hpp-join/);
    assert.match(comp, /hpp-home-login|登录 MuuZi/);
    assert.match(comp, /logo-muu\.png/);
    assert.match(comp, /icon-share-out\.png/);
    assert.match(comp, /hpp-cover/);
    assert.match(wxml, /open-type="share"|share-open-type/);
    assert.match(js, /onShareAppMessage/);
    assert.match(js, /friendShareMessage/);
    assert.match(js, /homePreview|sectionsFromContent|viewModel/);
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
    const comp = fs.readFileSync(
      path.join(root, 'miniprogram/components/home-page-preview/index.wxml'),
      'utf8'
    );
    assert.match(js, /openLink\.openHttps|require\('\.\.\/\.\.\/\.\.\/services\/openLink'\)/);
    assert.match(js, /homePreview|viewModel/);
    assert.match(js, /directAudio|isDirectAudio|createInnerAudioContext|playAudio/);
    assert.match(js, /function openLink|openLink\(e\)|onPreviewOpenItem/);
    assert.doesNotMatch(js, /copyShareUrlFallback\([^)]*条目/);
    assert.match(wxml, /bind:openitem|bind:audiotap|home-page-preview/);
    assert.match(comp, /bindtap="onOpenItem"|bindtap="onAudioTap"/);
    assert.match(comp, /hpp-shop-grid|hpp-product|section\.isShop|isShop/);
    assert.match(comp, /hpp-audio-card|isAudio/);
    assert.match(comp, /hpp-note-card|isCustom/);
    assert.match(comp, /hpp-film-hero|isVideo/);
    assert.match(comp, /hpp-tags|isSkills/);
    assert.match(comp, /hpp-agent|isAgents/);
    assert.match(comp, /hpp-bento|isBento|isShowcase/);
  });

  it('openLink service prefers navigate over copy', () => {
    const src = fs.readFileSync(
      path.join(root, 'miniprogram/services/openLink.js'),
      'utf8'
    );
    assert.match(src, /pages\/me\/open-link\/index/);
    assert.match(src, /pages\/me\/open-media\/index/);
    assert.match(src, /isDirectAudio/);
    assert.match(src, /isDirectImage/);
    assert.match(src, /isDirectVideo/);
    assert.match(src, /previewImage/);
    assert.doesNotMatch(src, /copyShareUrlFallback/);
    assert.equal(openLink.isDirectAudio('https://cdn.example.com/a.mp3'), true);
    assert.equal(openLink.isDirectAudio('https://tiktok.com/@x'), false);
    assert.equal(
      openLink.isDirectImage(
        'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=800'
      ),
      true
    );
    assert.equal(openLink.isDirectImage('https://cdn.example.com/a.jpg'), true);
    assert.equal(openLink.isDirectVideo('https://cdn.example.com/a.mp4'), true);
    assert.equal(openLink.classifyMedia('https://cdn.example.com/a.mp4'), 'video');
    assert.equal(openLink.classifyMedia('https://www.muuzi.co/join'), 'page');
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
    assert.match(appJson, /pages\/me\/open-media\/index/);
    assert.match(wxml, /web-view/);
    assert.match(wxml, /copyForBrowser/);
    assert.match(wxml, /previewFull|ol-preview/);
    assert.match(js, /canEmbedUrl|canEmbedHomeUrl/);
    assert.match(js, /isImage|previewImage/);
    assert.doesNotMatch(js, /条目链接已复制/);
  });

  it('open-media page plays direct video/audio', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-media/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-media/index.wxml'),
      'utf8'
    );
    assert.match(wxml, /<video|kind === 'video'/);
    assert.match(wxml, /toggleAudio|kind === 'audio'/);
    assert.match(js, /createInnerAudioContext|onVideoError/);
    assert.doesNotMatch(js, /条目链接已复制/);
  });

  it('edit-home draft preview uses logo + share-out icon like App hero-profile', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    const comp = fs.readFileSync(
      path.join(root, 'miniprogram/components/home-page-preview/index.wxml'),
      'utf8'
    );
    assert.match(wxml, /home-page-preview|previewModel/);
    assert.match(comp, /hpp-brand[\s\S]*logo-muu\.png/);
    assert.match(comp, /hpp-share[\s\S]*icon-share-out\.png/);
    assert.doesNotMatch(wxml, /eh-preview-brand-m/);
    assert.doesNotMatch(comp, /eh-preview-brand-m/);
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
