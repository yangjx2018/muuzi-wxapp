const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('profileShare service', () => {
  const profileShare = require('../miniprogram/services/profileShare');

  it('validates https share urls like App shareTextUrl', () => {
    assert.equal(
      profileShare.shareTextUrl('https://im.muuzi.co/muuzi/m235d1886ec1d'),
      'https://im.muuzi.co/muuzi/m235d1886ec1d'
    );
    assert.throws(() => profileShare.shareTextUrl('http://im.muuzi.co/x'));
    assert.throws(() => profileShare.shareTextUrl('https://user:pass@im.muuzi.co/x'));
  });

  it('builds friend share path to open-home', () => {
    const msg = profileShare.friendShareMessage({
      url: 'https://im.muuzi.co/muuzi/m235d1886ec1d',
      slug: 'm235d1886ec1d',
      title: '芥舟 · MuuZi',
      imageUrl: 'https://cdn.example/p.png',
    });
    assert.equal(msg.title, '芥舟 · MuuZi');
    assert.equal(msg.path, '/pages/me/open-home/index?slug=m235d1886ec1d');
    assert.equal(msg.imageUrl, 'https://cdn.example/p.png');
  });

  it('extracts slug from share url', () => {
    assert.equal(
      profileShare.slugFromShareUrl('https://im.muuzi.co/muuzi/m235d1886ec1d'),
      'm235d1886ec1d'
    );
  });

  it('does not embed home when WEBVIEW_BUSINESS_HOSTS is empty (体验版)', () => {
    const config = require('../miniprogram/config');
    assert.deepEqual(config.WEBVIEW_BUSINESS_HOSTS, []);
    assert.equal(
      profileShare.canEmbedHomeUrl('https://im.muuzi.co/muuzi/muuzi-duxz'),
      false
    );
    const plan = profileShare.homeOpenPlan(
      'https://im.muuzi.co/muuzi/muuzi-duxz'
    );
    assert.equal(plan.mode, 'copy');
    assert.equal(plan.homeUrl, '');
    assert.equal(plan.fallbackUrl, 'https://im.muuzi.co/muuzi/muuzi-duxz');
  });

  it('embeds only when host is listed in WEBVIEW_BUSINESS_HOSTS', () => {
    const config = require('../miniprogram/config');
    const original = config.WEBVIEW_BUSINESS_HOSTS;
    config.WEBVIEW_BUSINESS_HOSTS = ['im.muuzi.co', 'www.muuzi.co'];
    try {
      assert.equal(
        profileShare.canEmbedHomeUrl('https://im.muuzi.co/muuzi/muuzi-duxz'),
        true
      );
      assert.equal(
        profileShare.canEmbedHomeUrl('https://guduuos.com/muuzi/x'),
        false
      );
      const plan = profileShare.homeOpenPlan(
        'https://im.muuzi.co/muuzi/muuzi-duxz'
      );
      assert.equal(plan.mode, 'embed');
      assert.equal(plan.homeUrl, 'https://im.muuzi.co/muuzi/muuzi-duxz');
    } finally {
      config.WEBVIEW_BUSINESS_HOSTS = original;
    }
  });
});
