/**
 * 回归：分享面板地址可用 + 选项可点（对齐 App ProfileShareSheet）
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pageAddress = require('../miniprogram/services/pageAddress');
const profileShare = require('../miniprogram/services/profileShare');

describe('me share sheet address + actions', () => {
  beforeEach(() => {
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

  it('me page waits for platform load before locking empty share url', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.js'),
      'utf8'
    );
    assert.match(js, /_openShareWhenReady/);
    assert.match(js, /resolveShareForSheet/);
    assert.match(js, /正在检查主页地址/);
    // 不得再在 350ms 后不管加载状态硬开分享
    assert.doesNotMatch(js, /setTimeout\(function \(\) \{\s*if \(self\._alive\) self\.openShare/);
    // 已发布时 resolve 失败须回退候选地址
    assert.match(js, /已发布：保留官方候选链|pageUrl: candidate/);
    // slug 优先 creator（对齐 App）
    assert.match(
      js,
      /opened && opened\.creator && opened\.creator\.slug\) \|\|\s*\(page && page\.slug\)/
    );
  });

  it('share sheet catchtap uses noop so option taps are not swallowed', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.wxml'),
      'utf8'
    );
    assert.match(wxml, /catchtap="noop"/);
    assert.doesNotMatch(wxml, /catchtap="true"/);
    assert.match(wxml, /bindtap="toggleQr"/);
    assert.match(wxml, /bindtap="toggleShareCard"/);
    assert.match(wxml, /bindtap="openSharePage"/);
    assert.match(wxml, /open-type="\{\{shareUrl \? 'share' : ''\}\}"/);
  });

  it('share sheet UI tokens align with App ProfileShareSheet', () => {
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.wxss'),
      'utf8'
    );
    assert.match(wxss, /me-share-identity/);
    assert.match(wxss, /app-accent-wash/);
    assert.match(wxss, /max-height:\s*87vh/);
    assert.match(wxss, /min-height:\s*92rpx/);
  });

  it('resolveShareAddress keeps https candidate shape for official slug path', async () => {
    const url = profileShare.platformOrigin() + '/demo-creator';
    // 不打真网：非法 path 会走 parse；这里只断言本地校验器接受官方候选
    assert.equal(profileShare.shareTextUrl(url), url);
    assert.equal(profileShare.slugFromShareUrl(url), 'demo-creator');
  });

  it('edit-home share falls back to candidate when share-link fails', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    assert.match(js, /shareUrl: candidate/);
    assert.match(js, /pageUrl: candidate/);
  });

  it('pageAddress module still exports resolveShareAddress', () => {
    assert.equal(typeof pageAddress.resolveShareAddress, 'function');
  });
});
