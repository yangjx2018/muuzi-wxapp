const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

describe('P0 config', () => {
  it('exports PLATFORM_API and whitelist im.muuzi.co', () => {
    const config = require(path.join(__dirname, '../miniprogram/config.js'));
    assert.equal(config.PLATFORM_API, 'https://www.muuzi.co');
    assert.ok(Array.isArray(config.NODE_WHITELIST));
    assert.ok(config.NODE_WHITELIST.some((n) => n.domain === 'im.muuzi.co'));
    assert.equal(config.DEFAULT_TAB, '/pages/connect/index');
    assert.deepEqual(config.WEBVIEW_BUSINESS_HOSTS, []);
  });
});

describe('P0 app.json', () => {
  it('has three tabs 连接/消息/我', () => {
    const app = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../miniprogram/app.json'), 'utf8')
    );
    assert.deepEqual(
      app.tabBar.list.map((t) => t.text),
      ['连接', '消息', '我']
    );
    assert.equal(app.tabBar.selectedColor, '#2f6df4');
    assert.equal(app.tabBar.borderStyle, 'white');
    assert.ok(app.pages.includes('pages/auth/login/index'));
    assert.ok(app.pages.includes('pages/connect/join/index'));
  });
});
