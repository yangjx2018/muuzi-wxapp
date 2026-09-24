const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('M1.1 Connect Hub', () => {
  it('hub copy and gift stub match App ConnectScreen', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/index.js'),
      'utf8'
    );
    assert.match(wxml, /MEET · CONNECT · CONTINUE/);
    assert.match(wxml, /每次见面，都有下文/);
    assert.match(wxml, /面对面交流/);
    assert.match(wxml, /我的名片/);
    assert.match(wxml, /赠卡邀请/);
    assert.match(wxml, /暂未开放/);
    assert.match(wxml, /赠卡领取服务尚未开放/);
    assert.match(wxml, /进入后检查语音服务/);
    assert.match(wxml, /话题服务仅保存名称、语言和状态/);
    assert.match(wxml, /交流文字写入消息频道/);
    assert.match(wxml, /交流文字在消息频道/);
    assert.doesNotMatch(wxml, /语音翻译与交流文字保存尚未开放/);
    assert.doesNotMatch(wxml, /未保存交流文字/);
    assert.match(js, /toggleGift/);
    assert.match(js, /goTalk/);
    assert.match(js, /goCard/);
  });

  it('hub routes to talk/card shells and requires login', () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../miniprogram/app.json'), 'utf8')
    );
    assert.ok(appJson.pages.includes('pages/connect/talk/index'));
    assert.ok(appJson.pages.includes('pages/connect/card/index'));
    const hubJs = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/index.js'),
      'utf8'
    );
    assert.match(hubJs, /requireSignedInOrRedirect/);
    assert.match(hubJs, /loadEncounters/);
  });

  it('hub uses App-sourced icon assets', () => {
    const root = path.join(__dirname, '../miniprogram/assets');
    const need = [
      'tab-connect.png',
      'tab-connect-active.png',
      'tab-messages.png',
      'tab-messages-active.png',
      'tab-me.png',
      'tab-me-active.png',
      'icon-mic-badge.png',
      'logo-muu.png',
    ];
    for (const name of need) {
      const p = path.join(root, name);
      assert.ok(fs.existsSync(p), 'missing ' + name);
      assert.ok(fs.statSync(p).size > 200, 'too small ' + name);
    }
    const wxml = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/index.wxml'),
      'utf8'
    );
    assert.match(wxml, /icon-mic-badge\.png/);
    assert.match(wxml, /<app-banner section="连接"/);
    assert.match(wxml, /fc-primary-arrow/);
  });

  it('tab-level pages require services with correct relative depth', () => {
    const hub = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/index.js'),
      'utf8'
    );
    const talk = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    assert.match(hub, /require\('\.\.\/\.\.\/services\/session'\)/);
    assert.match(talk, /require\('\.\.\/\.\.\/\.\.\/services\/session'\)/);
  });
});
