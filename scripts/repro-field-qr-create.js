/**
 * 复现：扫码交流生成二维码
 */
const automator = require('miniprogram-automator');
const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function () {
  console.log('connect', WS);
  const mp = await automator.connect({ wsEndpoint: WS });
  try {
    await mp.switchTab('/pages/connect/index');
    await sleep(1000);
    await mp.navigateTo('/pages/connect/talk/index');
    await sleep(2000);
    let page = await mp.currentPage();
    console.log('path', page && page.path);
    let data = await page.data();
    console.log('initial', {
      scan: data.scan,
      savedRoom: data.savedRoom,
      topicAccess: data.topicAccess,
      note: data.note,
    });

    for (var i = 0; i < 25 && !data.savedRoom; i++) {
      await sleep(800);
      data = await page.data();
      if (i % 5 === 0) console.log('wait', i, data.savedRoom || data.note || '…');
    }
    console.log('room', data.savedRoom, 'access', data.topicAccess);
    if (!data.savedRoom) {
      console.log('FAIL no savedRoom');
      process.exit(2);
    }

    await page.callMethod('setModeScan');
    await sleep(2000);
    page = await mp.currentPage();
    data = await page.data();
    console.log('after setModeScan', { scan: data.scan, savedRoom: data.savedRoom, note: data.note });
    const comps = await page.$$('.fhi');
    const comps2 = await page.$$('field-host-invite');
    console.log('comp .fhi', comps.length, 'tag', comps2.length);
    // also try selectComponent via evaluate on page
    const viaSelect = await page.callMethod
      ? null
      : null;
    let invite = comps2[0] || comps[0];
    if (!invite) {
      // force scan data and wait for render
      await page.setData({ scan: true });
      await sleep(1500);
      page = await mp.currentPage();
      const again = await page.$$('field-host-invite');
      const again2 = await page.$$('.fhi');
      console.log('retry comps', again.length, again2.length);
      invite = again[0] || again2[0];
    }
    if (!invite) {
      console.log('NO_COMPONENT html snippet attempt');
      process.exit(2);
    }
    let idata = await invite.data();
    console.log('before', JSON.stringify({
      roomId: idata.roomId,
      enabled: idata.enabled,
      busy: idata.busy,
      notice: idata.notice,
      inviteStatus: idata.inviteStatus,
      url: !!idata.url,
      qrPath: !!idata.qrPath,
      scanState: idata.scanState,
    }));

    await invite.callMethod('onCreate');
    for (var j = 0; j < 15; j++) {
      await sleep(700);
      idata = await invite.data();
      console.log('t' + j, JSON.stringify({
        busy: idata.busy,
        notice: idata.notice,
        inviteStatus: idata.inviteStatus,
        url: (idata.url || '').slice(0, 60),
        qrPath: !!idata.qrPath,
        scanState: idata.scanState,
      }));
      if (!idata.busy && (idata.qrPath || idata.inviteStatus || /暂未完成|未开放|开通/.test(idata.notice || ''))) {
        break;
      }
    }
    console.log('RESULT', idata.qrPath ? 'QR_OK' : 'QR_FAIL', idata.notice);
  } finally {
    try { mp.disconnect(); } catch (e) {}
  }
})().catch(function (e) {
  console.error('ABORT', e && e.message ? e.message : e);
  process.exit(1);
});
