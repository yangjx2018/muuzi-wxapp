/**
 * 直达 host 页复验：开通提示 / 生成二维码
 */
const automator = require('miniprogram-automator');
const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function readInvite(mp) {
  return mp.evaluate(function () {
    var p = getCurrentPages().pop();
    if (!p) return { err: 'no page' };
    var c = p.selectComponent('field-host-invite');
    if (!c) {
      var all = [];
      try {
        all = (p.selectAllComponents('') || []).map(function (x) {
          return x.is;
        });
      } catch (e) {}
      return { err: 'no comp', route: p.route, all: all, pageData: p.data };
    }
    return {
      notice: c.data.notice || '',
      enabled: !!c.data.enabled,
      inviteStatus: c.data.inviteStatus || '',
      url: c.data.url || '',
      qrPath: c.data.qrPath || '',
      busy: !!c.data.busy,
      roomId: c.data.roomId || '',
    };
  });
}

(async function () {
  const mp = await automator.connect({ wsEndpoint: WS });
  mp.on('console', function (msg) {
    var t =
      typeof msg === 'string'
        ? msg
        : msg && msg.args
          ? msg.args.map(String).join(' ')
          : String(msg);
    if (/field|host|invite|ACCESS|Error|error|Lazy/i.test(t)) {
      console.log('LOG', String(t).slice(0, 220));
    }
  });
  try {
    await mp.switchTab('/pages/messages/index');
    await sleep(1200);

    // Ensure session + Matrix rooms (restart sync if empty)
    const boot = await mp.evaluate(function () {
      var session = require('services/session');
      var rt = require('services/matrixRuntime');
      var snap = session.snapshot();
      var rooms = (rt.getSnapshot().rooms || []).map(function (r) {
        return r.roomId || r.id;
      });
      var restarted = false;
      if (!rooms.length) {
        try {
          rt.clearPersistedSync();
        } catch (e) {}
        try {
          rt.stop();
          rt.ensureStarted();
          restarted = true;
        } catch (e2) {}
      }
      return {
        loggedIn: !!(snap && snap.accessToken),
        user: snap && snap.matrixUserId,
        rooms: rooms.slice(0, 8),
        roomCount: rooms.length,
        restarted: restarted,
      };
    });
    console.log('boot', JSON.stringify(boot));
    if (!boot.loggedIn) {
      console.log('FAIL not logged in');
      process.exit(2);
    }
    if (boot.restarted) await sleep(10000);

    var roomId = boot.rooms[0];
    if (!roomId) {
      for (var w = 0; w < 20 && !roomId; w++) {
        await sleep(1000);
        roomId = await mp.evaluate(function () {
          var rt = require('services/matrixRuntime');
          var rooms = rt.getSnapshot().rooms || [];
          return rooms[0] && (rooms[0].roomId || rooms[0].id);
        });
        if (w % 5 === 0) console.log('wait matrix rooms', w, roomId || '…');
      }
    }
    if (!roomId) {
      // fall back: open talk and wait for topic create
      await mp.switchTab('/pages/connect/index');
      await sleep(800);
      await mp.navigateTo('/pages/connect/talk/index');
      await sleep(2000);
      var page = await mp.currentPage();
      var data = await page.data();
      for (var i = 0; i < 30 && !data.savedRoom; i++) {
        await sleep(800);
        data = await page.data();
        if (i % 5 === 0) console.log('wait talk room', i, data.note || data.savedRoom || '…');
      }
      roomId = data.savedRoom;
    }
    if (!roomId) {
      console.log('FAIL no roomId');
      process.exit(2);
    }
    console.log('roomId', roomId);

    await mp.reLaunch(
      '/pages/connect/host/index?room=' +
        encodeURIComponent(roomId) +
        '&create=1'
    );
    await sleep(3500);

    var invite = null;
    for (var t = 0; t < 15; t++) {
      invite = await readInvite(mp);
      console.log('boot' + t, JSON.stringify(invite));
      if (invite && !invite.err) break;
      await sleep(1000);
    }
    if (!invite || invite.err) {
      // try $$ selectors
      var page2 = await mp.currentPage();
      console.log('path', page2 && page2.path);
      var tag = await page2.$$('field-host-invite');
      var fhi = await page2.$$('.fhi');
      console.log('sels', tag.length, fhi.length);
      console.log('FAIL no component', invite);
      process.exit(2);
    }

    for (var s = 0; s < 10; s++) {
      await sleep(1000);
      invite = await readInvite(mp);
      console.log('settle' + s, JSON.stringify({
        notice: invite.notice,
        enabled: invite.enabled,
        status: invite.inviteStatus,
        busy: invite.busy,
        url: !!(invite.url),
        qr: !!invite.qrPath,
      }));
      if (invite.notice && invite.notice !== '检查扫码交流服务…') break;
    }

    const probe = await mp.evaluate(function () {
      var session = require('services/session');
      var fieldNodeApi = require('services/fieldNodeApi');
      var store = require('adapters/secure-store');
      var snap = session.snapshot();
      var node = fieldNodeApi.approvedFieldNode(
        String(snap.instanceId),
        snap.nodeOrigin
      );
      if (!node) return { err: 'no node' };
      var call = fieldNodeApi.createFieldNodeApi(node, {
        origin: snap.nodeOrigin,
        token: function () {
          return session.snapshot().accessToken || '';
        },
      });
      return call('host/capabilities', {})
        .then(function () {
          return { ok: true };
        })
        .catch(function (e) {
          return { ok: false, code: e && e.code, msg: e && e.message };
        });
    });
    console.log('cap', JSON.stringify(probe));

    if (probe && probe.code === 'ACCESS_DENIED') {
      if (/暂未完成，请重试原操作/.test(invite.notice || '')) {
        console.log('FAIL generic retry on ACCESS_DENIED');
        process.exit(1);
      }
      if (!/开通|开放/.test(invite.notice || '')) {
        console.log('FAIL expected 开通 notice got', invite.notice);
        process.exit(1);
      }
      await sleep(7000);
      invite = await readInvite(mp);
      if (/暂未完成，请重试原操作/.test(invite.notice || '')) {
        console.log('FAIL tick overwrite', invite.notice);
        process.exit(1);
      }
      console.log('PASS ACCESS_DENIED keeps honest notice');
      return;
    }

    if (probe && probe.ok) {
      if (/暂未完成，请重试原操作/.test(invite.notice || '')) {
        console.log('FAIL generic before create', invite.notice);
        process.exit(1);
      }
      if (!invite.enabled) {
        console.log('INFO not enabled:', invite.notice);
        if (/开通|开放/.test(invite.notice || '')) {
          console.log('PASS honest unavailable notice');
          return;
        }
      }
      await mp.evaluate(function () {
        getCurrentPages().pop().selectComponent('field-host-invite').onCreate();
      });
      for (var j = 0; j < 20; j++) {
        await sleep(800);
        invite = await readInvite(mp);
        console.log(
          'create' + j,
          JSON.stringify({
            busy: invite.busy,
            notice: invite.notice,
            status: invite.inviteStatus,
            url: (invite.url || '').slice(0, 72),
            qr: !!invite.qrPath,
          })
        );
        if (
          !invite.busy &&
          (invite.qrPath ||
            invite.url ||
            invite.inviteStatus ||
            /暂未完成|开通|开放|变化|就绪/.test(invite.notice || ''))
        ) {
          break;
        }
      }
      if (invite.qrPath || invite.url) {
        console.log('PASS QR_OK');
        return;
      }
      if (/暂未完成，请重试原操作/.test(invite.notice || '')) {
        console.log('FAIL create generic retry');
        process.exit(1);
      }
      console.log('FAIL no QR', invite.notice);
      process.exit(1);
    }

    console.log('INFO probe', probe, 'notice', invite.notice);
  } finally {
    try {
      mp.disconnect();
    } catch (e) {}
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
