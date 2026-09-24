/**
 * matrixHomeserver · well-known resolution (App connectNode parity)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const root = path.join(__dirname, '..');
const matrixHomeserver = require(path.join(
  root,
  'miniprogram/services/matrixHomeserver.js'
));

describe('matrixHomeserver', () => {
  it('uses well-known m.homeserver.base_url when https', async () => {
    const hs = await matrixHomeserver.resolveHomeserver('https://im.example', {
      fallback: 'https://im.example',
      request: function () {
        return Promise.resolve({
          'm.homeserver': { base_url: 'https://matrix.im.example/' },
        });
      },
    });
    assert.equal(hs, 'https://matrix.im.example');
  });

  it('falls back when well-known missing or insecure', async () => {
    const hs = await matrixHomeserver.resolveHomeserver('https://im.example', {
      fallback: 'https://im.example',
      request: function () {
        return Promise.resolve({
          'm.homeserver': { base_url: 'http://insecure.example' },
        });
      },
    });
    assert.equal(hs, 'https://im.example');
  });

  it('allows http fallback in develop', async () => {
    const hs = await matrixHomeserver.resolveHomeserver(
      'http://127.0.0.1:9000',
      {
        fallback: 'http://127.0.0.1:8008',
        develop: true,
        request: function () {
          return Promise.reject(new Error('no well-known'));
        },
      }
    );
    assert.equal(hs, 'http://127.0.0.1:8008');
  });
});
