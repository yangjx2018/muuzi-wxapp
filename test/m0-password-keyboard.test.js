/**
 * 密码框键盘兼容：禁止安全键盘；密文用 CSS；普通 type=text。
 * 禁止 focus="{{passwordFocus}}"：部分机型 focus=false 会锁死输入框。
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** 裸 password 属性（华为会拉安全键盘）；排除注释与 showPassword 等标识符 */
function hasNativePasswordAttr(wxml) {
  return /(?:^|\s)password(?:\s|=|>)/m.test(
    wxml
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(
        /showPassword|showBindPassword|showConfirm|passwordFocus|bindPassword|onPassword|togglePassword|passwordField/g,
        ''
      )
  );
}

function assertNoFocusLock(js, wxml, label) {
  assert.doesNotMatch(wxml, /focus="\{\{passwordFocus\}\}"/, label);
  assert.doesNotMatch(wxml, /focus="\{\{confirmFocus\}\}"/, label);
  assert.doesNotMatch(js, /passwordFocus/, label);
  assert.doesNotMatch(js, /confirmFocus/, label);
  assert.doesNotMatch(js, /pulseFocus/, label);
  assert.doesNotMatch(js, /utils\/passwordField/, label);
}

describe('password field keyboard wake (auth)', () => {
  it('login password: ordinary text keyboard + CSS mask (no native password, no focus lock)', () => {
    const js = read('miniprogram/pages/auth/login/index.js');
    const wxml = read('miniprogram/pages/auth/login/index.wxml');
    const appWxss = read('miniprogram/app.wxss');

    assertNoFocusLock(js, wxml, 'login');

    const onPwd = js.slice(js.indexOf('onPassword(e)'), js.indexOf('togglePassword'));
    assert.match(onPwd, /ready:\s*ready/);
    assert.doesNotMatch(onPwd, /refreshReady\(/);

    assert.match(wxml, /type="text"/);
    assert.match(wxml, /!showPassword && password \? 'is-masked'/);
    assert.match(wxml, /hold-keyboard="\{\{true\}\}"/);
    assert.match(wxml, /always-embed="\{\{true\}\}"/);
    assert.doesNotMatch(wxml, /type="safe-password"/);
    assert.doesNotMatch(wxml, /password="\{\{!showPassword\}\}"/);
    // 禁止空值也挂 is-masked：微信会画幽灵圆点
    assert.doesNotMatch(wxml, /\{\{showPassword \? '' : 'is-masked'\}\}/);
    assert.ok(!hasNativePasswordAttr(wxml), 'login wxml must not use native password attr');

    assert.match(appWxss, /-webkit-text-security:\s*disc/);
    assert.match(appWxss, /\.field-input-secure\.is-masked/);
  });

  it('bind / join / recover password pages use ordinary keyboard + CSS mask (no focus lock)', () => {
    const pages = [
      'miniprogram/pages/auth/bind/index',
      'miniprogram/pages/auth/join/password/index',
      'miniprogram/pages/auth/recover/password/index',
    ];

    for (const base of pages) {
      const js = read(base + '.js');
      const wxml = read(base + '.wxml');
      assertNoFocusLock(js, wxml, base);

      const onPwdStart = js.indexOf('onPassword(e)');
      const onPwdEnd = js.indexOf('togglePassword');
      assert.ok(onPwdStart >= 0 && onPwdEnd > onPwdStart, base + ' onPassword');
      const onPwd = js.slice(onPwdStart, onPwdEnd);
      assert.doesNotMatch(onPwd, /refreshReady\(/, base);

      assert.match(wxml, /type="text"/, base);
      assert.match(wxml, /is-masked/, base);
      assert.match(wxml, /!showPassword && password \? 'is-masked'/, base);
      assert.match(wxml, /hold-keyboard="\{\{true\}\}"/, base);
      assert.doesNotMatch(wxml, /type="safe-password"/, base);
      assert.doesNotMatch(wxml, /\{\{showPassword \? '' : 'is-masked'\}\}/, base);
      assert.ok(!hasNativePasswordAttr(wxml), base + ' must not use native password attr');
    }
  });
});
