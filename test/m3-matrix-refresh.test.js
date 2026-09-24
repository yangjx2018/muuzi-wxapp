const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('matrix token refresh (App parity)', () => {
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
      reLaunch() {},
      switchTab() {},
    };
    // Fresh module state per test
    delete require.cache[
      require.resolve('../miniprogram/adapters/secure-store')
    ];
    delete require.cache[require.resolve('../miniprogram/services/http')];
    delete require.cache[require.resolve('../miniprogram/services/session')];
  });

  it('session.refreshMatrixToken rotates access token via /refresh', async () => {
    const store = require('../miniprogram/adapters/secure-store');
    const session = require('../miniprogram/services/session');
    const http = require('../miniprogram/services/http');
    store.set(store.KEYS.MATRIX_ACCESS_TOKEN, 'old');
    store.set(store.KEYS.MATRIX_REFRESH_TOKEN, 'r1');
    store.set(store.KEYS.MATRIX_USER_ID, '@u:ex');
    store.set(store.KEYS.HOMESERVER, 'https://hs.example');
    store.set(store.KEYS.NODE_ORIGIN, 'https://hs.example');
    await session.restore();

    const orig = http.request;
    http.request = function (opts) {
      assert.match(opts.url, /\/_matrix\/client\/v3\/refresh$/);
      assert.equal(opts.data.refresh_token, 'r1');
      return Promise.resolve({
        access_token: 'new',
        refresh_token: 'r2',
      });
    };
    try {
      const snap = await session.refreshMatrixToken();
      assert.equal(snap.accessToken, 'new');
      assert.equal(store.get(store.KEYS.MATRIX_ACCESS_TOKEN), 'new');
      assert.equal(store.get(store.KEYS.MATRIX_REFRESH_TOKEN), 'r2');
    } finally {
      http.request = orig;
    }
  });

  it('matrixRuntime wires onTokenRefresh to session.refreshMatrixToken', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixRuntime.js'),
      'utf8'
    );
    assert.match(js, /onTokenRefresh/);
    assert.match(js, /refreshMatrixToken/);
    assert.match(js, /force:\s*true/);
  });
});
