const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const zh = require('../miniprogram/utils/zhDateTime');

describe('zhDateTime field room stamps', () => {
  it('formatZhDateTime matches historical zh-CN numeric style', () => {
    const d = new Date(2026, 8, 22, 22, 19, 29);
    assert.equal(zh.formatZhDateTime(d), '2026/9/22 22:19:29');
    assert.equal(zh.fieldTopicRoomName(d), '现场交流 · 2026/9/22 22:19:29');
  });

  it('normalizeFieldRoomName rewrites English Date.toString stamps', () => {
    const bad =
      '现场交流 · Tue Sep 22 2026 22:19:29 GMT+0800 (China Standard Time)';
    const fixed = zh.normalizeFieldRoomName(bad);
    assert.equal(fixed, '现场交流 · 2026/9/22 22:19:29');
    assert.equal(
      zh.normalizeFieldRoomName('现场交流 · Tue Sep 22 2026 22:19:29'),
      '现场交流 · 2026/9/22 22:19:29'
    );
  });

  it('normalizeFieldRoomName keeps good and unrelated names', () => {
    assert.equal(
      zh.normalizeFieldRoomName('现场交流 · 2026/9/22 15:12:41'),
      '现场交流 · 2026/9/22 15:12:41'
    );
    assert.equal(zh.normalizeFieldRoomName('现场交流'), '现场交流');
    assert.equal(zh.normalizeFieldRoomName('关注备忘'), '关注备忘');
  });

  it('matrixField no longer uses toLocaleString for topic names', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/matrixField.js'),
      'utf8'
    );
    assert.match(src, /fieldTopicRoomName/);
    assert.match(src, /normalizeFieldRoomName/);
    assert.doesNotMatch(src, /toLocaleString\(['"]zh-CN['"]\)/);
  });

  it('chat room send uses paper-plane share asset', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/messages/room/index.wxml'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/messages/room/index.wxss'),
      'utf8'
    );
    assert.match(wxml, /icon-ui-share-accent\.png/);
    assert.match(wxml, /icon-ui-share-ink\.png/);
    assert.doesNotMatch(wxml, /chat-ico-send/);
    assert.match(wxss, /chat-send-img/);
  });
});
