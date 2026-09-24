const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

before(() => {
  const mem = Object.create(null);
  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : '';
    },
    setStorageSync(key, value) {
      mem[key] = value == null ? '' : value;
    },
  };
});

describe('pageAddress share helpers (App parity)', () => {
  it('displayHost strips scheme', () => {
    const pageAddress = require('../miniprogram/services/pageAddress');
    assert.equal(
      pageAddress.displayHost('https://im.muuzi.co/muuzi/demo'),
      'im.muuzi.co/muuzi/demo'
    );
  });

  it('preferredShareEntry remembers domestic', () => {
    const pageAddress = require('../miniprogram/services/pageAddress');
    const options = [
      { id: 'default', url: 'https://a.example/x' },
      { id: 'domestic', url: 'https://b.example/x' },
    ];
    assert.equal(pageAddress.preferredShareEntry(options).id, 'default');
    pageAddress.rememberShareEntry('domestic');
    assert.equal(pageAddress.preferredShareEntry(options).id, 'domestic');
  });

  it('exports shareChoicesFor', () => {
    const pageAddress = require('../miniprogram/services/pageAddress');
    assert.equal(typeof pageAddress.shareChoicesFor, 'function');
    assert.equal(typeof pageAddress.resolveShareAddress, 'function');
  });
});
