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
    assert.match(js, /loadStoreTools/);
    assert.match(js, /showMarketplace/);
    assert.match(js, /retryCatalog/);
    assert.match(js, /fetchFeaturedDraft|saveFeaturedDraft/);
    assert.match(js, /publishStorefront|unpublishStorefront/);
    assert.match(js, /fetchStorefrontLinks|saveStorefrontLink/);
    assert.match(wxml, /MY SHOP/);
    assert.match(wxml, /你的独立店铺/);
    assert.match(wxml, /统一管理店铺，在个人主页展示精选商品/);
    assert.match(wxml, /添加到店铺/);
    assert.match(wxml, /shop-tool/);
    assert.match(wxml, /marketplace-connection/);
    assert.match(wxml, /商城连接/);
    assert.match(wxml, /实物好物/);
    assert.match(wxml, /保存精选草稿/);
    assert.match(wxml, /发布店铺|更新公开店铺/);
    assert.match(wxml, /showMarketplace/);
    assert.match(wxml, /retryCatalog/);
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
    assert.match(wxss, /\.shop-kicker/);
    assert.match(wxss, /\.shop-tool-title/);
  });

  it('contentCatalog loadStoreTools keeps store_* actions', () => {
    const catalog = require('../miniprogram/services/contentCatalog');
    const tools = catalog.normalizeStoreTools({
      items: [
        {
          id: 'st-1',
          enabled: true,
          action: 'store_collection',
          title: '商品合集',
          description: '将店铺与商品整理成一个系列',
        },
        {
          id: 'st-2',
          enabled: true,
          action: 'store_external',
          title: '外部店铺与商品',
          description: '关联你已有的店铺或商品链接',
        },
        {
          id: 'st-3',
          enabled: true,
          action: 'store_marketplace',
          title: 'GuDuu OS 独立商城',
          description: '连接当前节点，选择商城店铺与精选商品',
        },
        {
          id: 'home-ig',
          enabled: true,
          action: 'home',
          type: 'links',
          title: 'Instagram',
        },
        {
          id: 'st-off',
          enabled: false,
          action: 'store_marketplace',
          title: '关闭项',
        },
      ],
    });
    assert.equal(tools.length, 3);
    assert.equal(tools[0].title, '商品合集');
    assert.equal(tools[2].action, 'store_marketplace');
    assert.equal(typeof catalog.loadStoreTools, 'function');
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
