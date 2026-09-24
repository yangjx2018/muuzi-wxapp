const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const configPath = path.join(__dirname, '../miniprogram/config.js');

function loadConfigFresh() {
  delete require.cache[require.resolve(configPath)];
  return require(configPath);
}

describe('config env split (local vs release)', () => {
  after(() => {
    delete process.env.MUUZI_WX_ENV;
    delete require.cache[require.resolve(configPath)];
  });

  it('develop includes local bot; release does not', () => {
    process.env.MUUZI_WX_ENV = 'develop';
    const dev = loadConfigFresh();
    assert.ok(dev.NODE_WHITELIST.some((n) => n.domain === '127.0.0.1:9000'));
    assert.ok(dev.NODE_WHITELIST.some((n) => n.domain === 'im.muuzi.co'));
    assert.equal(dev.NODE_WHITELIST[0].domain, 'im.muuzi.co');
    assert.equal(dev.PLATFORM_API, 'https://www.muuzi.co');

    process.env.MUUZI_WX_ENV = 'release';
    const rel = loadConfigFresh();
    assert.ok(!rel.NODE_WHITELIST.some((n) => String(n.domain).includes('127.0.0.1')));
    assert.ok(!rel.NODE_WHITELIST.some((n) => String(n.nodeOrigin).includes('127.0.0.1')));
    assert.ok(rel.NODE_WHITELIST.some((n) => n.domain === 'im.muuzi.co'));
    assert.equal(rel.PLATFORM_API, 'https://www.muuzi.co');
  });

  it('ships example local overlay and gitignores config.local.js', () => {
    assert.ok(
      fs.existsSync(
        path.join(__dirname, '../miniprogram/config.local.example.js')
      )
    );
    const gi = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
    assert.match(gi, /miniprogram\/config\.local\.js/);
  });
});
