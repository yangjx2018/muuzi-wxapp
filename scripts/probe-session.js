const automator = require('miniprogram-automator');

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function () {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  try {
    const info = await mp.evaluate(function () {
      var session = require('services/session');
      var rt = require('services/matrixRuntime');
      var snap = session.snapshot();
      var ms = rt.getSnapshot();
      return {
        user: snap.matrixUserId,
        origin: snap.nodeOrigin,
        homeserver: snap.homeserver || snap.hsUrl,
        hasToken: !!(snap.accessToken && snap.accessToken.length > 8),
        tokenLen: (snap.accessToken || '').length,
        instanceId: snap.instanceId,
        deviceId: snap.deviceId,
        syncStatus: ms.status || ms.phase || ms.syncState,
        roomCount: (ms.rooms || []).length,
        error: ms.lastError || ms.error || null,
        keys: Object.keys(ms || {}).slice(0, 30),
      };
    });
    console.log(JSON.stringify(info, null, 2));

    // whoami probe
    const who = await mp.evaluate(function () {
      var session = require('services/session');
      var snap = session.snapshot();
      var base = (snap.homeserver || snap.hsUrl || snap.nodeOrigin || '').replace(/\/$/, '');
      if (!base || !snap.accessToken) return { err: 'no base/token' };
      return new Promise(function (resolve) {
        wx.request({
          url: base + '/_matrix/client/v3/account/whoami',
          method: 'GET',
          header: { Authorization: 'Bearer ' + snap.accessToken },
          success: function (res) {
            resolve({ status: res.statusCode, data: res.data });
          },
          fail: function (e) {
            resolve({ fail: e && e.errMsg });
          },
        });
      });
    });
    console.log('whoami', JSON.stringify(who));
  } finally {
    mp.disconnect();
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
