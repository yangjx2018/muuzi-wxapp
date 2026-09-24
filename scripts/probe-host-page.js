const automator = require('miniprogram-automator');

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function () {
  console.log('connect…');
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  console.log('connected');
  try {
    await mp.switchTab('/pages/connect/index');
    console.log('tab ok');
    await sleep(1500);
    var room = '!verifyQrRoom:im.muuzi.co';
    var url =
      '/pages/connect/host/index?room=' +
      encodeURIComponent(room) +
      '&create=1';
    console.log('navigate', url);
    await mp.navigateTo(url);
    console.log('navigated');
    await sleep(5000);
    var page = await mp.currentPage();
    console.log('path', page && page.path);
    if (page) {
      var data = await page.data();
      console.log('data', JSON.stringify(data));
      var tag = await page.$$('field-host-invite');
      var fhi = await page.$$('.fhi');
      var btns = await page.$$('button');
      console.log('sels', tag.length, fhi.length, 'btns', btns.length);
      var texts = [];
      for (var i = 0; i < Math.min(btns.length, 10); i++) {
        try {
          texts.push(await btns[i].text());
        } catch (e) {
          texts.push('?');
        }
      }
      console.log('btn texts', texts);
    }
    var inv = await mp.evaluate(function () {
      var p = getCurrentPages().pop();
      var c = p && p.selectComponent('field-host-invite');
      return {
        route: p && p.route,
        has: !!c,
        notice: c && c.data.notice,
        enabled: c && c.data.enabled,
        roomId: c && c.data.roomId,
      };
    });
    console.log('inv', JSON.stringify(inv));
  } finally {
    try {
      mp.disconnect();
    } catch (e) {}
  }
})().catch(function (e) {
  console.error('ABORT', e && e.message ? e.message : e);
  process.exit(1);
});
