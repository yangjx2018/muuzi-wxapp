/**
 * 加密房文字发送 · 微信开发者工具联调（真实路径）
 * 前置：npm run devtools（auto-port 9420），模拟器已登录
 *
 * 当前账号若无 App 加密 DM：对本机房间表注入加密态（不写服务器），
 * 再验证 UI 解禁 + sendText 明文发送成功。
 */
const automator = require('miniprogram-automator');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';
const MARKER = '加密房联调-' + Date.now().toString(36);
const results = [];

function ok(name, detail) {
  results.push({ name: name, pass: true, detail: detail || '' });
  console.log('[PASS]', name, detail || '');
}
function fail(name, detail) {
  results.push({ name: name, pass: false, detail: String(detail || '') });
  console.error('[FAIL]', name, detail || '');
}
function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}
async function waitFor(fn, label, timeoutMs) {
  const end = Date.now() + (timeoutMs || 25000);
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e && e.message;
    }
    await sleep(400);
  }
  throw new Error(label + ' timeout; last=' + last);
}

async function main() {
  console.log('Connecting', WS);
  const mp = await automator.connect({ wsEndpoint: WS });
  try {
    await mp.switchTab('/pages/messages/index');
    await sleep(1500);

    // sync since 偶发空列表：清持久游标并重启
    const boot = await mp.evaluate(function () {
      var rt = require('services/matrixRuntime');
      var ms = rt.getSnapshot();
      if ((ms.rooms || []).length > 0) {
        return { rooms: ms.rooms.length, restarted: false, hasDebug: typeof rt.__debugMarkRoomEncrypted === 'function' };
      }
      try {
        rt.clearPersistedSync();
      } catch (e) {
        /* ignore */
      }
      rt.stop();
      rt.ensureStarted();
      return { rooms: 0, restarted: true, hasDebug: typeof rt.__debugMarkRoomEncrypted === 'function' };
    });
    ok('Matrix 运行时', JSON.stringify(boot));
    if (boot.restarted) await sleep(8000);

    const inbox = await waitFor(async function () {
      const p = await mp.currentPage();
      if (!p || p.path.indexOf('messages/index') < 0) return null;
      try {
        await p.callMethod('refresh');
      } catch (e) {
        /* optional */
      }
      const d = await p.data();
      if (!d.rooms || !d.rooms.length) return null;
      return { page: p, data: d };
    }, 'messages', 45000);
    ok('消息列表', 'rooms=' + inbox.data.rooms.length);

    let room =
      (inbox.data.rooms || []).find(function (r) {
        return r && r.encrypted;
      }) || null;
    let injected = false;
    if (!room) {
      room = (inbox.data.rooms || []).find(function (r) {
        return r && r.kind !== 'ai' && r.roomId;
      });
      if (!room) throw new Error('无可用会话');
      injected = true;
      ok('无真实加密 DM', '将对本机注入加密态 room=' + room.name);
    } else {
      ok('找到加密会话', room.name + ' ' + room.roomId);
    }

    await mp.navigateTo(
      '/pages/messages/room/index?room=' + encodeURIComponent(room.roomId)
    );
    await sleep(1200);
    let roomPage = await waitFor(async function () {
      const p = await mp.currentPage();
      if (!p || p.path.indexOf('messages/room') < 0) return null;
      const d = await p.data();
      if (!d.name && d.ready === false) return null;
      return p;
    }, 'room page', 20000);

    if (injected) {
      const mark = await mp.evaluate(function (rid) {
        var rt = require('services/matrixRuntime');
        return {
          ok: !!(rt.__debugMarkRoomEncrypted && rt.__debugMarkRoomEncrypted(rid)),
          detail: rt.getRoomDetail(rid),
        };
      }, room.roomId);
      if (!mark || !mark.ok) {
        throw new Error('注入加密态失败: ' + JSON.stringify(mark));
      }
      ok(
        '注入本机加密态',
        'detail.encrypted=' + !!(mark.detail && mark.detail.encrypted)
      );
      await roomPage.callMethod('refresh');
      await sleep(800);
      roomPage = await mp.currentPage();
    }

    const data = await roomPage.data();
    if (!data.encrypted) {
      throw new Error('房间仍非加密 encrypted=false name=' + data.name);
    }
    ok('会话页加密态', 'name=' + data.name);
    if (!data.e2eeBanner || String(data.e2eeBanner).indexOf('可发送文字') < 0) {
      throw new Error('横幅未提示可发送文字: ' + data.e2eeBanner);
    }
    ok('横幅文案', String(data.e2eeBanner).slice(0, 60));

    const ta = await roomPage.$('textarea.chat-input');
    if (!ta) throw new Error('无输入框');
    const placeholder = await ta.attribute('placeholder');
    if (String(placeholder || '').indexOf('加密房间暂不可发送') >= 0) {
      throw new Error('输入框仍禁发: ' + placeholder);
    }
    ok('输入框未禁发', 'placeholder=' + placeholder);

    // 附件仍应被拦
    await roomPage.callMethod('onToggleAttachMenu');
    await sleep(300);
    const afterAttach = await roomPage.data();
    if (
      !afterAttach.error ||
      String(afterAttach.error).indexOf('图片与文件') < 0
    ) {
      fail(
        '附件仍应禁发',
        'error=' + (afterAttach.error || '(空)') + ' menu=' + afterAttach.showAttachMenu
      );
    } else {
      ok('附件仍禁发', afterAttach.error.slice(0, 40));
    }

    if (injected) {
      // sync 可能冲掉注入，发送前再标一次
      await mp.evaluate(function (rid) {
        var rt = require('services/matrixRuntime');
        return rt.__debugMarkRoomEncrypted(rid);
      }, room.roomId);
    }

    await roomPage.callMethod('onDraftInput', { detail: { value: MARKER } });
    await sleep(200);
    await roomPage.callMethod('onSend');
    await sleep(3000);
    const after = await roomPage.data();
    if (after.error) {
      throw new Error('发送失败: ' + after.error);
    }
    if (/暂不可发送|加密切片/.test(String(after.error || ''))) {
      throw new Error('仍命中旧禁发');
    }
    const hit = (after.messages || []).some(function (m) {
      return m && m.body === MARKER;
    });
    if (!hit) {
      throw new Error(
        '发送后无气泡回显 draft=' +
          after.draft +
          ' count=' +
          ((after.messages && after.messages.length) || 0)
      );
    }
    ok('加密房明文发送成功', MARKER);
  } finally {
    try {
      mp.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  const failed = results.filter(function (r) {
    return !r.pass;
  });
  console.log('\n=== E2EE encrypted-room send 联调 ===');
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + '\t' + r.name + '\t' + r.detail);
  });
  if (failed.length) process.exit(1);
  console.log('ALL PASSED', results.length);
}

main().catch(function (err) {
  console.error('SMOKE ABORT', err && err.stack ? err.stack : err);
  process.exit(1);
});
