const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

before(() => {
  global.wx = global.wx || {
    getStorageSync() {
      return '';
    },
    setStorageSync() {},
    removeStorageSync() {},
    showToast() {},
    reLaunch() {},
  };
});

describe('K-15 dev page guard', () => {
  after(() => {
    delete process.env.MUUZI_WX_ENV;
  });

  it('devPagesAllowed follows envVersion', () => {
    process.env.MUUZI_WX_ENV = 'develop';
    delete require.cache[require.resolve('../miniprogram/config.js')];
    delete require.cache[require.resolve('../miniprogram/utils/devGuard.js')];
    let guard = require('../miniprogram/utils/devGuard');
    assert.equal(guard.devPagesAllowed(), true);

    process.env.MUUZI_WX_ENV = 'release';
    delete require.cache[require.resolve('../miniprogram/config.js')];
    delete require.cache[require.resolve('../miniprogram/utils/devGuard.js')];
    guard = require('../miniprogram/utils/devGuard');
    assert.equal(guard.devPagesAllowed(), false);
  });

  it('blockIfNotDevelop redirects on release', () => {
    process.env.MUUZI_WX_ENV = 'release';
    delete require.cache[require.resolve('../miniprogram/config.js')];
    delete require.cache[require.resolve('../miniprogram/utils/devGuard.js')];
    const guard = require('../miniprogram/utils/devGuard');
    let relaunched = '';
    global.wx.reLaunch = function (opts) {
      relaunched = opts.url;
    };
    assert.equal(guard.blockIfNotDevelop(), true);
    assert.equal(relaunched, '/pages/auth/login/index');
  });

  it('dev pages and app.js wire devGuard', () => {
    const appJs = fs.readFileSync(
      path.join(root, 'miniprogram/app.js'),
      'utf8'
    );
    assert.match(appJs, /devGuard/);
    for (const page of [
      'pages/dev/domain-check/index.js',
      'pages/dev/wechat-login-smoke/index.js',
      'pages/dev/wechat-bind-e2e/index.js',
    ]) {
      const src = fs.readFileSync(path.join(root, 'miniprogram', page), 'utf8');
      assert.match(src, /blockIfNotDevelop/);
    }
  });
});
