const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

before(() => {
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
    request() {},
  };
});

describe('K-17/K-18 shop catalog + join watchClosure', () => {
  it('storefrontMarket parses stores and products', () => {
    const market = require('../miniprogram/services/storefrontMarket');
    const stores = market.parseStores({
      api_version: 'storefront.v1',
      stores: [
        {
          id: 's1',
          name: '个人店',
          entity_type: 'personal',
          role: 'owner',
        },
      ],
    });
    assert.equal(stores.length, 1);
    assert.equal(stores[0].id, 's1');
    const page = market.parseStorePage(
      {
        api_version: 'storefront.v1',
        store: { id: 's1', name: '个人店', entity_type: 'personal' },
        catalog_revision: 1,
        items: [
          {
            product_id: 'p1',
            version: '1',
            kind: 'agent',
            name: '助手',
            description: 'd',
            price_amount_minor: 9900,
            price_currency: 'CNY',
          },
        ],
        next_cursor: null,
      },
      's1'
    );
    assert.equal(page.items.length, 1);
    assert.equal(market.storePrice(page.items[0]), '¥99.00');
  });

  it('creator exports featured links publication media short-links', () => {
    const creator = require('../miniprogram/services/creator');
    [
      'fetchFeaturedDraft',
      'saveFeaturedDraft',
      'fetchStorefrontPublication',
      'publishStorefront',
      'unpublishStorefront',
      'fetchStorefrontLinks',
      'saveStorefrontLink',
      'deleteStorefrontLink',
      'fetchInstagramMedia',
      'fetchTikTokMedia',
      'fetchShortLinks',
      'createShortLink',
    ].forEach((name) => {
      assert.equal(typeof creator[name], 'function', name);
    });
  });

  it('shop page wires catalog external links and publish', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/shop/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/shop/index.wxml'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/shop/index.wxss'),
      'utf8'
    );
    assert.match(js, /storefrontMarket/);
    assert.match(js, /fetchFeaturedDraft|saveFeaturedDraft/);
    assert.match(js, /publishStorefront|unpublishStorefront/);
    assert.match(js, /fetchStorefrontLinks|saveStorefrontLink/);
    assert.match(wxml, /商城连接/);
    assert.match(wxml, /实物好物/);
    assert.match(wxml, /保存精选草稿/);
    assert.match(wxml, /发布店铺|更新公开店铺/);
    // App 1:1 — gray rounded inputs + circular checkbox (no switch)
    assert.doesNotMatch(wxml, /<switch\b/);
    assert.match(wxml, /class="mp-check/);
    assert.match(wxml, /mp-input-readonly/);
    assert.match(wxml, /class="mp-control"/);
    assert.match(wxml, /个人主页地址/);
    assert.match(wxml, /独立店铺地址/);
    assert.match(wxss, /background:\s*var\(--app-bg\)/);
    assert.match(wxss, /border-radius:\s*24rpx/);
    assert.match(wxss, /\.mp-check\.on/);
    assert.match(wxss, /\.mp-control\b/);
  });

  it('edit-home wires short link and IG/TikTok display', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    assert.match(js, /createShortLink|makeShortLink/);
    assert.match(js, /fetchInstagramMedia|fetchTikTokMedia/);
    assert.match(js, /tiktok_display|instagram_display/);
    assert.match(wxml, /短链接|makeShortLink|要一个短链接|分享短链接/);
    assert.match(wxml, /onTikTokDisplay|onInstagramDisplay/);
    assert.match(wxml, /SHARE · 预览与分享|看成品|eh-btn-publish/);
  });

  it('visitor session watchClosure fires when cleared', async () => {
    const guest = require('../miniprogram/services/fieldGuestPersistence');
    const sessionStore = require('../miniprogram/services/fieldVisitorSession');
    const persistence = guest.wxGuestPersistence();
    const invitationId = '44444444-4444-4444-8444-444444444444';
    const expiresAt = Date.now() + 3600_000;
    const store = sessionStore.createVisitorSessionStore(
      {
        instanceId: '7',
        nodeOrigin: 'https://im.muuzi.co',
        invitationId,
        invitationExpiresAt: expiresAt,
      },
      persistence
    );
    await store.prepare('访客乙');
    let closed = false;
    const watcher = store.watchClosure(() => {
      closed = true;
    });
    assert.equal(watcher.check(), false);
    await store.finish();
    assert.equal(watcher.check(), true);
    assert.equal(closed, true);
    watcher.dispose();
  });

  it('join page wires watchClosure onShow check', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/join/index.js'),
      'utf8'
    );
    assert.match(js, /watchClosure/);
    assert.match(js, /_closure\.check|closure\.check/);
  });
});
