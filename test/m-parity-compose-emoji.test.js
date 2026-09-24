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
    uploadFile() {},
    chooseMedia() {},
    chooseImage() {},
  };
});

describe('compose post + emoji categories', () => {
  it('creator exports createPost', () => {
    const creator = require('../miniprogram/services/creator');
    assert.equal(typeof creator.createPost, 'function');
  });

  it('compose page is registered and wires createPost', () => {
    const app = fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8');
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/compose/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/compose/index.wxml'),
      'utf8'
    );
    assert.match(app, /pages\/me\/compose\/index/);
    assert.match(js, /createPost/);
    assert.match(js, /fetchWorks|uploadImage/);
    assert.match(js, /centralMarket|fetchCentralMarket/);
    assert.match(js, /product_id/);
    assert.match(wxml, /挂载作品/);
    assert.match(wxml, /商城商品/);
    assert.match(wxml, /bindtap="submit"/);
  });

  it('compose remains reachable from subjects/spaces (not Me toolbar)', () => {
    const subjects = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/subjects/index.js'),
      'utf8'
    );
    const spaces = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/spaces/index.js'),
      'utf8'
    );
    const meWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/index.wxml'),
      'utf8'
    );
    assert.match(subjects, /pages\/me\/compose\/index/);
    assert.match(spaces, /pages\/me\/compose\/index|goCompose/);
    assert.doesNotMatch(meWxml, /bindtap="goCompose"/);
    assert.doesNotMatch(meWxml, />发布</);
  });

  it('centralMarket filters agent/skill and maps 404', async () => {
    const http = require('../miniprogram/services/http');
    const centralMarket = require('../miniprogram/services/centralMarket');
    const original = http.request;
    http.request = async () => ({
      items: [
        {
          product_id: 'a1',
          kind: 'agent',
          name: '助手',
          description: 'd',
        },
        {
          product_id: 'w1',
          kind: 'workflow',
          name: '流程',
          description: 'x',
        },
        {
          product_id: 's1',
          kind: 'skill',
          name: '技能包',
          description: 'y',
        },
      ],
    });
    try {
      const items = await centralMarket.fetchCentralMarket({
        accessToken: 'tok',
        nodeOrigin: 'https://node.example.com',
      });
      assert.equal(items.length, 2);
      assert.equal(items[0].product_id, 'a1');
      assert.equal(items[1].kind, 'skill');
    } finally {
      http.request = original;
    }

    http.request = async () => {
      const err = new Error('not found');
      err.statusCode = 404;
      throw err;
    };
    try {
      await assert.rejects(
        () =>
          centralMarket.fetchCentralMarket({
            accessToken: 'tok',
            nodeOrigin: 'https://node.example.com',
          }),
        /还没开通中央商城/
      );
    } finally {
      http.request = original;
    }
  });

  it('subjects and spaces link into compose', () => {
    const subjects = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/subjects/index.js'),
      'utf8'
    );
    const spaces = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/spaces/index.js'),
      'utf8'
    );
    assert.match(subjects, /pages\/me\/compose\/index/);
    assert.match(spaces, /pages\/me\/compose\/index/);
  });

  it('room emoji picker has App categories', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    assert.match(js, /EMOJI_GROUPS/);
    assert.match(js, /onEmojiCategory/);
    assert.match(js, /笑脸|手势|工作/);
    assert.match(wxml, /emojiGroups/);
    assert.match(wxml, /onEmojiCategory/);
  });
});
