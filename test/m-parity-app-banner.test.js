const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mp = path.join(root, 'miniprogram');

describe('AppBanner parity (top chrome)', () => {
  it('ships reusable app-banner + status-pad + navChrome', () => {
    assert.ok(
      fs.existsSync(path.join(mp, 'components/app-banner/index.js'))
    );
    assert.ok(fs.existsSync(path.join(mp, 'components/status-pad/index.js')));
    assert.ok(fs.existsSync(path.join(mp, 'utils/navChrome.js')));
    const banner = fs.readFileSync(
      path.join(mp, 'components/app-banner/index.wxml'),
      'utf8'
    );
    assert.match(banner, /logo-muu\.png/);
    assert.match(banner, /MuuZi/);
    assert.match(banner, /\{\{section\}\}/);
    assert.match(banner, /showBack/);
  });

  it('connect hub uses AppBanner section 连接 and white CTA arrow', () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(mp, 'pages/connect/index.json'), 'utf8')
    );
    const wxml = fs.readFileSync(
      path.join(mp, 'pages/connect/index.wxml'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(mp, 'pages/connect/index.wxss'),
      'utf8'
    );
    assert.equal(json.navigationStyle, 'custom');
    assert.match(wxml, /<app-banner section="连接"/);
    assert.match(wxml, /fc-primary-arrow/);
    assert.match(wxss, /filter:\s*brightness\(0\)\s*invert\(1\)/);
  });

  it('talk page uses shared app-banner with back', () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(mp, 'pages/connect/talk/index.json'), 'utf8')
    );
    const wxml = fs.readFileSync(
      path.join(mp, 'pages/connect/talk/index.wxml'),
      'utf8'
    );
    assert.equal(json.navigationStyle, 'custom');
    assert.match(wxml, /<app-banner/);
    assert.match(wxml, /section="面对面交流"/);
    assert.match(wxml, /show-back/);
  });

  it('tab roots hide native title (messages chrome / me status-pad)', () => {
    const meJson = JSON.parse(
      fs.readFileSync(path.join(mp, 'pages/me/index.json'), 'utf8')
    );
    const meWxml = fs.readFileSync(path.join(mp, 'pages/me/index.wxml'), 'utf8');
    assert.equal(meJson.navigationStyle, 'custom');
    assert.match(meWxml, /<status-pad/);

    const msgJson = JSON.parse(
      fs.readFileSync(path.join(mp, 'pages/messages/index.json'), 'utf8')
    );
    const msgWxml = fs.readFileSync(
      path.join(mp, 'pages/messages/index.wxml'),
      'utf8'
    );
    const msgWxss = fs.readFileSync(
      path.join(mp, 'pages/messages/index.wxss'),
      'utf8'
    );
    assert.equal(msgJson.navigationStyle, 'custom');
    assert.match(msgWxml, /msg-chrome/);
    assert.match(msgWxml, /bannerPadPx/);
    assert.doesNotMatch(msgWxml, /<status-pad/);
    // 顶栏固定且内容垫高，避免盖住工作区圆形图标
    assert.match(msgWxss, /\.msg-chrome\s*\{[^}]*position:\s*fixed/s);
    assert.doesNotMatch(msgWxml, /<scroll-view[^>]*msg-rail/);
  });

  it('management secondary pages use app-banner + back', () => {
    const samples = [
      ['pages/me/shop', '我的店铺'],
      ['pages/me/settings', '设置'],
      ['pages/connect/card', '我的名片'],
    ];
    for (const [dir, section] of samples) {
      const json = JSON.parse(
        fs.readFileSync(path.join(mp, dir, 'index.json'), 'utf8')
      );
      const wxml = fs.readFileSync(path.join(mp, dir, 'index.wxml'), 'utf8');
      assert.equal(json.navigationStyle, 'custom', dir);
      assert.match(wxml, new RegExp(`section="${section}"`), dir);
      assert.match(wxml, /show-back/, dir);
      assert.doesNotMatch(wxml, /class="mp-title"/, dir);
    }
  });
});
