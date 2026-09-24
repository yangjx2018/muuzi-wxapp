const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('connect field audit fixes WX-CF-001..007', () => {
  it('continue subscribes to matrix ready flips', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/continue/index.js'),
      'utf8'
    );
    assert.match(js, /matrixRuntime\.subscribe/);
    assert.match(js, /_matrixUnsub/);
    assert.match(js, /onUnload/);
  });

  it('continue join gate requires rooms AND field workspace', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/continue/index.js'),
      'utf8'
    );
    assert.match(js, /joined && field|joined = false/);
    assert.doesNotMatch(
      js,
      /rooms\[i\]\.roomId === roomId && rooms\[i\]\.field/
    );
    assert.match(js, /if \(!joined\) return false/);
  });

  it('host navigates away on invalid room', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/host/index.js'),
      'utf8'
    );
    assert.match(js, /无法恢复话题/);
    assert.match(js, /navigateBack|switchTab/);
  });

  it('field-host-invite validates revision and expiresAt', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/components/field-host-invite/index.js'),
      'utf8'
    );
    assert.match(js, /Number\.isSafeInteger\(value\.revision\)/);
    assert.match(js, /value\.revision < 1/);
    assert.match(js, /Number\.isSafeInteger\(value\.expiresAt\)/);
    assert.match(js, /value\.expiresAt <= 0/);
  });

  it('field-host-invite rejects draft over 2000 utf8 bytes', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/components/field-host-invite/index.js'),
      'utf8'
    );
    assert.match(js, /utf8ByteLength\(.*\) > 2000/);
    assert.match(js, /INVALID_TEXT/);
  });

  it('talk exposes retry topic prep and cancel busy', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.wxml'),
      'utf8'
    );
    assert.match(js, /retryTopicPrep/);
    assert.match(js, /cancelBusyOp/);
    assert.match(js, /topicPrepFailed/);
    assert.match(wxml, /重试准备话题/);
    assert.match(wxml, /取消本次操作/);
  });
});
