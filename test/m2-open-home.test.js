/**
 * Bug repro: 编辑主页「看成品」→ open-home 在未配业务域名时仍挂 web-view，
 * 微信系统页「无法打开该页面 / 不支持打开 https://im.muuzi.co/...」。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('open-home finished-product fallback', () => {
  it('open-home never mounts web-view without canEmbed / binderror safety', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-home/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/open-home/index.wxml'),
      'utf8'
    );
    assert.match(js, /homeOpenPlan|canEmbedHomeUrl/);
    assert.match(js, /onWebViewError/);
    assert.match(js, /在浏览器打开成品|复制主页链接|copyFallback/);
    assert.match(wxml, /binderror="onWebViewError"/);
    assert.match(wxml, /wx:if="\{\{homeUrl\}\}"/);
    assert.match(wxml, /复制主页链接/);
    assert.match(wxml, /oh-card|SHARE · 成品/);
    assert.doesNotMatch(
      js,
      /setData\(\s*\{\s*loading:\s*false,\s*homeUrl:\s*safe/
    );
  });

  it('edit-home 看成品 still routes through openHomePage', () => {
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
  });
});
