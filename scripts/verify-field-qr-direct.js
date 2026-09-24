const automator = require('miniprogram-automator');

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function () {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  mp.on('console', function (msg) {
    var t =
      typeof msg === 'string'
        ? msg
        : msg && msg.args
          ? msg.args.map(String).join(' ')
          : String(msg);
    if (/field|host|invite|ACCESS|Error|Lazy|开通|暂未/i.test(t)) {
      console.log('LOG', String(t).slice(0, 220));
    }
  });
  try {
    var room = '!verifyQrRoom:im.muuzi.co';
    await mp.reLaunch(
      '/pages/connect/host/index?room=' + encodeURIComponent(room) + '&create=1'
    );
    await sleep(4000);
    var page = await mp.currentPage();
    console.log('path', page && page.path);
    var data = page ? await page.data() : null;
    console.log('pageData', data);

    var tag = page ? await page.$$('field-host-invite') : [];
    var fhi = page ? await page.$$('.fhi') : [];
    console.log('sels', tag.length, fhi.length);

    var invite = await mp.evaluate(function () {
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
        return { err: 'no comp', route: p.route, all: all };
      }
      return {
        notice: c.data.notice,
        enabled: c.data.enabled,
        busy: c.data.busy,
        inviteStatus: c.data.inviteStatus,
        url: !!(c.data.url),
        qrPath: !!(c.data.qrPath),
        roomId: c.data.roomId,
      };
    });
    console.log('invite', JSON.stringify(invite));

    for (var i = 0; i < 8; i++) {
      await sleep(1000);
      invite = await mp.evaluate(function () {
        var c = getCurrentPages().pop().selectComponent('field-host-invite');
        if (!c) return { err: 'lost' };
        return {
          notice: c.data.notice,
          enabled: c.data.enabled,
          busy: c.data.busy,
          inviteStatus: c.data.inviteStatus,
          url: !!(c.data.url),
          qrPath: !!(c.data.qrPath),
        };
      });
      console.log('t' + i, JSON.stringify(invite));
      if (invite && !invite.err && invite.notice && invite.notice !== '检查扫码交流服务…') {
        break;
      }
    }

    var probe = await mp.evaluate(function () {
      var session = require('services/session');
      var fieldNodeApi = require('services/fieldNodeApi');
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
        .then(function (cap) {
          return { ok: true, keys: Object.keys(cap || {}) };
        })
        .catch(function (e) {
          return { ok: false, code: e && e.code, msg: e && e.message };
        });
    });
    console.log('cap', JSON.stringify(probe));

    if (invite && !invite.err) {
      var hasRetry = /暂未完成，请重试原操作/.test(invite.notice || '');
      console.log('hasRetry', hasRetry, 'notice', invite.notice);
      if (probe && probe.code === 'ACCESS_DENIED') {
        if (hasRetry) process.exit(1);
        if (!/开通|开放/.test(invite.notice || '')) process.exit(1);
        await sleep(7000);
        invite = await mp.evaluate(function () {
          return getCurrentPages().pop().selectComponent('field-host-invite').data.notice;
        });
        console.log('after ticks', invite);
        if (/暂未完成，请重试原操作/.test(invite || '')) process.exit(1);
        console.log('PASS ACCESS_DENIED');
        return;
      }
      if (probe && probe.ok && invite.enabled) {
        await mp.evaluate(function () {
          getCurrentPages().pop().selectComponent('field-host-invite').onCreate();
        });
        for (var j = 0; j < 18; j++) {
          await sleep(800);
          invite = await mp.evaluate(function () {
            var c = getCurrentPages().pop().selectComponent('field-host-invite');
            return {
              notice: c.data.notice,
              busy: c.data.busy,
              status: c.data.inviteStatus,
              url: (c.data.url || '').slice(0, 72),
              qr: !!c.data.qrPath,
            };
          });
          console.log('c' + j, JSON.stringify(invite));
          if (!invite.busy && (invite.qr || invite.url || invite.status || /暂未|开通|开放|变化|就绪/.test(invite.notice || ''))) {
            break;
          }
        }
        if (invite.qr || invite.url) {
          console.log('PASS QR_OK');
          return;
        }
        if (/暂未完成，请重试原操作/.test(invite.notice || '')) {
          console.log('FAIL generic');
          process.exit(1);
        }
        console.log('FAIL no qr', invite.notice);
        process.exit(1);
      }
      console.log('INFO done', invite, probe);
    } else {
      console.log('FAIL no component');
      process.exit(2);
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
