/**
 * R 硬化：弱网幂等 / 杀进程可恢复 / 权限诚实文案 — 代码门断言
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mini = path.join(root, 'miniprogram');

function read(rel) {
  return fs.readFileSync(path.join(mini, rel), 'utf8');
}

test('R hardening contracts', async (t) => {
  await t.test('Field encounter keys reuse Idempotency uuid across retries', () => {
    const connect = read('pages/connect/index.js');
    assert.match(connect, /idempotency\.uuidV4/);
    assert.match(connect, /_closeKeys/);
    assert.match(connect, /_deleteKeys/);
    assert.match(connect, /self\._closeKeys\[identity\]/);
    assert.match(connect, /self\._deleteKeys\[identity\]/);
  });

  await t.test('chat send keeps txnId for retry after failure', () => {
    const chat = read('services/matrixChat.js');
    assert.match(chat, /transaction_id:\s*txnId/);
    assert.match(chat, /_delivery\s*=\s*'failed'/);
    assert.match(chat, /function retryMessage/);
    assert.match(chat, /sendEvent\(roomId,\s*'m\.room\.message',\s*content,\s*txnId\)/);
  });

  await t.test('mic denial and interrupt copy stay honest', () => {
    const capture = read('services/fieldAudioCapture.js');
    assert.match(capture, /scope\.record/);
    assert.match(capture, /麦克风权限/);
    assert.match(capture, /本次录音未完成或已中断/);
    const talk = read('pages/connect/talk/index.wxml');
    assert.match(talk, /录音处理后清理|原始音频不保存/);
  });

  await t.test('session restore and logout wipe stay wired', () => {
    const session = read('services/session.js');
    assert.match(session, /function restore\s*\(/);
    assert.match(session, /function clearLocal\s*\(/);
    assert.match(session, /signOutAndRelaunch/);
    assert.match(session, /resetForSignOut/);
    const outbox = read('services/fieldOutbox.js');
    assert.match(outbox, /field_pending_v1:/);
    assert.match(outbox, /function validPending/);
  });

  await t.test('login legal copy and pay honesty remain', () => {
    const login = read('pages/auth/login/index.wxml');
    assert.match(login, /不会送往 Nexus/);
    assert.match(login, /只会送往你选择的 GuDuu OS 节点/);
    const pay = read('services/wechatPay.js');
    assert.match(pay, /JSAPI|requestPayment|未配置|honest|不可用|fail/i);
    const membership = read('pages/me/membership/index.js');
    assert.match(membership, /wechatPay|requestPayment|诚实|不可用|未配置/);
  });

  await t.test('R docs exist for regression submit and known issues', () => {
    const docs = path.join(root, 'docs');
    for (const name of [
      'R_韧性与回归清单.md',
      'R_体验版提审材料.md',
      'R_已知问题.md',
      'R_减配对等差距与整改计划_2026-09-22.md',
      'R_批次真机验收清单_2026-09-22.md',
      'R_批次A_公网微信与JSAPI联调清单.md',
    ]) {
      assert.ok(fs.existsSync(path.join(docs, name)), name);
    }
  });
});
