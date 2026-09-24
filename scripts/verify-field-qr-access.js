/**
 * 联调：扫码交流开通提示 / 生成二维码
 * （组件选择器常失败，改用 getCurrentPages + selectComponent）
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
    var pages = getCurrentPages();
    var page = pages[pages.length - 1];
    if (!page) return { err: 'no page' };
    var c = page.selectComponent('field-host-invite');
    if (!c) {
      return {
        err: 'no comp',
        path: page.route,
        scan: page.data && page.data.scan,
        room: page.data && page.data.savedRoom,
      };
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

function tapCreate(mp) {
  return mp.evaluate(function () {
    var pages = getCurrentPages();
    var page = pages[pages.length - 1];
    var c = page && page.selectComponent('field-host-invite');
    if (!c || typeof c.onCreate !== 'function') return false;
    c.onCreate();
    return true;
  });
}

(async function () {
  const mp = await automator.connect({ wsEndpoint: WS });
  try {
    await mp.switchTab('/pages/connect/index');
    await sleep(1200);
    await mp.navigateTo('/pages/connect/talk/index');
    await sleep(2500);

    let page = await mp.currentPage();
    console.log('path', page && page.path);
    let data = await page.data();
    for (var i = 0; i < 25 && !data.savedRoom; i++) {
      await sleep(800);
      page = await mp.currentPage();
      data = await page.data();
      if (i % 5 === 0) console.log('wait room', i, data.savedRoom || data.note || '…');
    }
    console.log('room', data.savedRoom);
    if (!data.savedRoom) {
      console.log('FAIL no savedRoom');
      process.exit(2);
    }

    try {
      await page.callMethod('setModeScan');
    } catch (e) {
      console.log('setModeScan fallback', String(e && e.message ? e.message : e));
      await page.setData({ scan: true, note: '' });
    }
    await sleep(2000);
    page = await mp.currentPage();
    data = await page.data();
    if (!data.scan) {
      await page.setData({ scan: true });
      await sleep(1500);
    }

    // boot + ticks
    var invite = null;
    for (var t = 0; t < 12; t++) {
      await sleep(1000);
      invite = await readInvite(mp);
      console.log('boot' + t, JSON.stringify(invite));
      if (invite && !invite.err && invite.notice && invite.notice !== '检查扫码交流服务…') {
        break;
      }
    }
    if (!invite || invite.err) {
      console.log('FAIL no field-host-invite', invite);
      process.exit(2);
    }

    const probe = await mp.evaluate(function (roomId) {
      var session = require('services/session');
      var fieldNodeApi = require('services/fieldNodeApi');
      var store = require('adapters/secure-store');
      var snap = session.snapshot();
      var node = fieldNodeApi.approvedFieldNode(
        String(snap.instanceId),
        snap.nodeOrigin
      );
      if (!node) return { err: 'no node' };
      var key =
        'muuzi.field.host:' +
        JSON.stringify([
          node.instanceId,
          node.origin,
          snap.matrixUserId,
          snap.deviceId || '',
          roomId,
        ]);
      var call = fieldNodeApi.createFieldNodeApi(node, {
        origin: snap.nodeOrigin,
        token: function () {
          return session.snapshot().accessToken || '';
        },
      });
      return call('host/capabilities', {})
        .then(function () {
          return { ok: true, saved: store.get(key) };
        })
        .catch(function (e) {
          return {
            ok: false,
            code: e && e.code,
            saved: store.get(key),
          };
        });
    }, data.savedRoom);
    console.log('capabilities probe', JSON.stringify(probe));

    var hasRetry = /暂未完成，请重试原操作/.test(invite.notice || '');
    var hasDenied = /还没开通扫码交流|尚未开放扫码交流/.test(invite.notice || '');
    var hasReady = /客户扫码申请/.test(invite.notice || '');

    if (probe && probe.code === 'ACCESS_DENIED') {
      if (hasRetry) {
        console.log('FAIL still showing generic retry after ACCESS_DENIED');
        process.exit(1);
      }
      if (!hasDenied) {
        console.log('FAIL expected 开通/开放 notice, got:', invite.notice);
        process.exit(1);
      }
      if (probe.saved) {
        try {
          var parsed = JSON.parse(probe.saved);
          if (parsed && parsed.invite) {
            console.log('FAIL stale invite still in storage');
            process.exit(1);
          }
        } catch (e) {
          /* ignore */
        }
      }
      // wait more ticks — must not flip to generic retry
      await sleep(7000);
      invite = await readInvite(mp);
      hasRetry = /暂未完成，请重试原操作/.test(invite.notice || '');
      if (hasRetry) {
        console.log('FAIL tick overwrote ACCESS_DENIED notice:', invite.notice);
        process.exit(1);
      }
      console.log('PASS ACCESS_DENIED keeps honest notice');
      return;
    }

    if (probe && probe.ok) {
      if (hasRetry) {
        console.log('FAIL eligible account shows generic retry before create:', invite.notice);
        process.exit(1);
      }
      if (!invite.enabled && !hasDenied) {
        console.log('INFO not enabled yet:', invite.notice);
      }
      if (invite.enabled || hasReady) {
        var tapped = await tapCreate(mp);
        console.log('onCreate tapped', tapped);
        for (var j = 0; j < 18; j++) {
          await sleep(800);
          invite = await readInvite(mp);
          console.log(
            'create' + j,
            JSON.stringify({
              busy: invite.busy,
              notice: invite.notice,
              inviteStatus: invite.inviteStatus,
              url: (invite.url || '').slice(0, 72),
              qrPath: !!invite.qrPath,
            })
          );
          if (
            !invite.busy &&
            (invite.qrPath ||
              invite.url ||
              invite.inviteStatus ||
              /暂未完成|未开放|开通|变化/.test(invite.notice || ''))
          ) {
            break;
          }
        }
        if (invite.qrPath || invite.url) {
          console.log('PASS QR generated');
          return;
        }
        if (/暂未完成，请重试原操作/.test(invite.notice || '')) {
          console.log('FAIL create still generic retry:', invite.notice);
          process.exit(1);
        }
        console.log('FAIL create no QR:', invite.notice);
        process.exit(1);
      }
      console.log('PASS account has field access; UI notice:', invite.notice);
      return;
    }

    console.log('INFO probe', probe, 'notice', invite.notice);
    if (hasRetry && !hasDenied) {
      console.log('FAIL generic retry without access explanation');
      process.exit(1);
    }
  } finally {
    try {
      mp.disconnect();
    } catch (e) {}
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
