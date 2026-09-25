/**
 * Auth 顶栏：复用 app-banner（与胶囊垂直居中），找回/注册带返回且可点。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mp = path.join(root, 'miniprogram');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const AUTH_PAGES = [
  'pages/auth/login/index',
  'pages/auth/bind/index',
  'pages/auth/join/index',
  'pages/auth/join/verify/index',
  'pages/auth/join/password/index',
  'pages/auth/recover/index',
  'pages/auth/recover/verify/index',
  'pages/auth/recover/password/index',
];

const BACK_PAGES = [
  ['pages/auth/recover/index', 'goLogin'],
  ['pages/auth/recover/verify/index', 'goBack'],
  ['pages/auth/recover/password/index', 'goBack'],
  ['pages/auth/join/index', 'goLogin'],
  ['pages/auth/join/verify/index', 'goBack'],
  ['pages/auth/join/password/index', 'goBack'],
];

describe('auth header safe-area / sticky chrome', () => {
  it('app-banner measures navChrome and uses virtualHost to avoid blocking taps', () => {
    const js = read('miniprogram/components/app-banner/index.js');
    const json = read('miniprogram/components/app-banner/index.json');
    const wxss = read('miniprogram/components/app-banner/index.wxss');
    assert.match(js, /measureNavChrome/);
    assert.match(js, /attached/);
    assert.match(js, /ready/);
    assert.match(js, /virtualHost:\s*true/);
    assert.match(json, /"virtualHost"\s*:\s*true/);
    assert.match(wxss, /pointer-events:\s*none/);
    assert.match(wxss, /\.app-banner \{[\s\S]*pointer-events:\s*auto/);
    assert.match(js, /properties\.autoBack\s*!==\s*true/);
  });

  it('app-banner is fixed with spacer and capsule gap', () => {
    const wxml = read('miniprogram/components/app-banner/index.wxml');
    const wxss = read('miniprogram/components/app-banner/index.wxss');
    assert.match(wxml, /app-banner-spacer/);
    assert.match(wxml, /padding-top:\s*\{\{statusBarPx\}\}px/);
    assert.match(wxml, /height:\s*\{\{navBarPx\}\}px/);
    assert.match(wxml, /min-width:\s*\{\{capsuleGapPx\}\}px/);
    assert.match(wxml, /catchtap="onBack"/);
    assert.match(wxss, /position:\s*fixed/);
    assert.doesNotMatch(wxss, /safe-area-inset-top/);
  });

  it('every auth page uses app-banner instead of hand-rolled status chrome', () => {
    for (const page of AUTH_PAGES) {
      const json = read('miniprogram/' + page + '.json');
      const wxml = read('miniprogram/' + page + '.wxml');
      assert.match(json, /app-banner/, page);
      assert.match(wxml, /<app-banner/, page);
      assert.doesNotMatch(wxml, /auth-status/, page);
      assert.doesNotMatch(wxml, /auth-header-spacer/, page);
      const headerChunk = wxml.slice(0, wxml.indexOf('auth-body'));
      assert.doesNotMatch(
        headerChunk,
        /RECOVERY \/ OPEN|SESSION \/ READY|PASSWORD \/ SET|EMAIL \/ VERIFY|WECHAT \/ OK/,
        page
      );
    }
  });

  it('recover/join flow puts capsule-aligned back in app-banner, not body text', () => {
    for (const [page, handler] of BACK_PAGES) {
      const wxml = read('miniprogram/' + page + '.wxml');
      assert.match(wxml, /show-back/, page);
      assert.match(wxml, new RegExp('bind:back="' + handler + '"'), page);
      assert.doesNotMatch(wxml, /← 返回登录|← 修改邮箱|← 返回验证/, page);
      assert.doesNotMatch(wxml, /class="auth-back"/, page);
    }
    const step1 = read('miniprogram/pages/auth/recover/index.wxml');
    assert.match(step1, /回去登录/);
  });

  it('recover step1: 返回/回去登录/更换节点 are wired to working handlers', () => {
    const wxml = read('miniprogram/pages/auth/recover/index.wxml');
    const js = read('miniprogram/pages/auth/recover/index.js');
    assert.match(wxml, /bind:back="goLogin"/);
    assert.match(wxml, /auto-back="\{\{false\}\}"/);
    assert.match(wxml, /catchtap="onChangeNode"/);
    assert.match(wxml, /catchtap="goLogin"/);
    assert.match(js, /onChangeNode\s*\(/);
    assert.match(js, /picking:\s*true/);
    assert.match(js, /goLogin\s*\(/);
    assert.match(js, /reLaunch\(\s*\{\s*url:\s*'\/pages\/auth\/login\/index'/);
  });

  it('join step1: 登录/找回/更换节点 are wired to working handlers', () => {
    const wxml = read('miniprogram/pages/auth/join/index.wxml');
    const js = read('miniprogram/pages/auth/join/index.js');
    assert.match(wxml, /bind:back="goLogin"/);
    assert.match(wxml, /catchtap="onChangeNode"/);
    assert.match(wxml, /catchtap="goLogin"/);
    assert.match(wxml, /catchtap="goRecover"/);
    assert.match(js, /reLaunch\(\s*\{\s*url:\s*'\/pages\/auth\/login\/index'/);
  });

  it('navChrome uses capsule top/height for exact vertical alignment', () => {
    global.wx = {
      getWindowInfo() {
        return { statusBarHeight: 0, windowWidth: 390 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 48, height: 32, left: 297, right: 382, bottom: 80, width: 85 };
      },
    };
    delete require.cache[require.resolve(path.join(mp, 'utils/navChrome.js'))];
    const chrome = require(path.join(mp, 'utils/navChrome.js'));
    const m = chrome.measureNavChrome();
    assert.equal(m.statusBarPx, 48, 'padding-top equals capsule top');
    assert.equal(m.navBarPx, 32, 'row height equals capsule height');
    assert.equal(m.bannerPadPx, 80);
    assert.equal(m.statusBarPx + m.navBarPx / 2, 48 + 16);
  });

  it('navChrome with real statusBar still prefers capsule box', () => {
    global.wx = {
      getWindowInfo() {
        return { statusBarHeight: 47, windowWidth: 390 };
      },
      getMenuButtonBoundingClientRect() {
        return { top: 48, height: 32, left: 297, right: 382, bottom: 80, width: 85 };
      },
    };
    delete require.cache[require.resolve(path.join(mp, 'utils/navChrome.js'))];
    const chrome = require(path.join(mp, 'utils/navChrome.js'));
    const m = chrome.measureNavChrome();
    assert.equal(m.statusBarPx, 48);
    assert.equal(m.navBarPx, 32);
    assert.equal(m.statusBarPx + m.navBarPx / 2, 48 + 16);
  });
});
