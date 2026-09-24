const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('M0 wechat bind client contract', () => {
  it('bindAccount sends method + Idempotency-Key + account field', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/wechat-login.js'),
      'utf8'
    );
    assert.match(src, /Idempotency-Key/);
    assert.match(src, /account_password/);
    assert.match(src, /body\.account/);
    assert.doesNotMatch(src, /body\.username\s*=/);
  });

  it('login keeps password CTA above WeChat and opens bind sheet', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/auth/login/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/auth/login/index.wxml'),
      'utf8'
    );
    assert.match(wxml, /登录 MuuZi/);
    assert.match(wxml, /微信登录/);
    assert.match(wxml, /bind-sheet/);
    assert.match(wxml, /验证并绑定/);
    assert.match(wxml, /重新填写账号/);
    assert.match(wxml, /建立新账号/);
    assert.match(wxml, /auth-gear|onGear/);
    assert.match(wxml, /togglePassword|显示密码|隐藏密码/);
    assert.match(wxml, /logo-muu\.png/);
    assert.match(js, /togglePassword/);
    assert.match(js, /onGear/);
    // 登录按钮应出现在微信按钮之前（主 CTA：onLoginTap）
    const loginBtnAt = wxml.indexOf('bindtap="onLoginTap"');
    const wechatBtnAt = wxml.indexOf('bindtap="onWeChatLogin"');
    assert.ok(loginBtnAt >= 0 && wechatBtnAt > loginBtnAt);
    assert.match(wxml, /catchtouchmove="noop"/);
    assert.match(wxml, /catchtap="noop"/);
    assert.match(js, /noop\s*\(/);
    assert.match(js, /openBindSheet/);
    assert.doesNotMatch(js, /bind_inline/);
  });

  it('after login/bind navigates to connect before waiting on creator', () => {
    const loginJs = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/auth/login/index.js'),
      'utf8'
    );
    const sessionJs = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/session.js'),
      'utf8'
    );
    const after = loginJs.indexOf('afterLoginSuccess()');
    const enter = loginJs.indexOf('session.enterDefaultTab()', after);
    const creator = loginJs.indexOf('ensureCreatorSession', after);
    assert.ok(after >= 0 && enter > after && creator > enter);
    assert.doesNotMatch(
      loginJs.slice(after, after + 350),
      /ensureCreatorSession[\s\S]*finally[\s\S]*enterDefaultTab/
    );
    assert.match(sessionJs, /switchTab/);
    assert.match(sessionJs, /reLaunch/);
  });

  it('bind page offers retry or create on credential failure', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/auth/bind/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/auth/bind/index.js'),
      'utf8'
    );
    assert.match(wxml, /验证并绑定/);
    assert.match(wxml, /重新填写账号/);
    assert.match(wxml, /建立新账号/);
    assert.match(js, /failMode/);
    assert.match(js, /enterDefaultTab/);
  });
});
