const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('auth audit fixes WX-A-01/02/04', () => {
  it('register enters tab before waiting on Creator', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/auth/join/password/index.js'),
      'utf8'
    );
    const enterAt = js.indexOf('session.enterDefaultTab()');
    const creatorAt = js.indexOf('ensureCreatorSession');
    assert.ok(enterAt > 0);
    assert.ok(creatorAt > 0);
    // 先进 Tab：enterDefaultTab 出现在 ensureCreatorSession 绑定的 finally 链之外、
    // 且不得只在 finally 里进 Tab
    assert.doesNotMatch(
      js,
      /ensureCreatorSession\(\)[\s\S]*?\.finally\([\s\S]*?enterDefaultTab/
    );
    assert.match(js, /enterDefaultTab\(\);\s*session\.ensureCreatorSession/);
  });

  it('register preserves wechat bind_token and attempts bind', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/auth/join/password/index.js'),
      'utf8'
    );
    assert.match(js, /bindToken/);
    assert.match(js, /wechat\.bindAccount|bindAccount\(/);
    assert.match(js, /require\('\.\.\/\.\.\/\.\.\/\.\.\/services\/wechat-login'\)|wechat-login/);
  });

  it('OTP inputs use digit type to keep leading zeros', () => {
    const login = fs.readFileSync(
      path.join(root, 'miniprogram/pages/auth/login/index.wxml'),
      'utf8'
    );
    const joinV = fs.readFileSync(
      path.join(root, 'miniprogram/pages/auth/join/verify/index.wxml'),
      'utf8'
    );
    const recoverV = fs.readFileSync(
      path.join(root, 'miniprogram/pages/auth/recover/verify/index.wxml'),
      'utf8'
    );
    assert.match(login, /type="digit"/);
    assert.match(joinV, /type="digit"/);
    assert.match(recoverV, /type="digit"/);
    assert.doesNotMatch(login, /securityCode[\s\S]*?type="number"/);
  });
});
