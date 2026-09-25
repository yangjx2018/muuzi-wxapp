const automator = require('miniprogram-automator');
function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}
(async function () {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  try {
    await mp.reLaunch('/pages/me/index');
    await sleep(3000);

    var nav1 = await mp.evaluate(function () {
      return new Promise(function (resolve) {
        wx.navigateTo({
          url: '/pages/me/edit-home/index',
          success: function () {
            resolve({ ok: true, kind: 'full' });
          },
          fail: function (e) {
            resolve({ ok: false, kind: 'full', err: e });
          },
        });
      });
    });
    console.log('nav full', JSON.stringify(nav1));
    await sleep(2500);
    var page = await mp.currentPage();
    console.log('path full', page && page.path);

    await mp.navigateBack();
    await sleep(1500);

    var nav2 = await mp.evaluate(function () {
      return new Promise(function (resolve) {
        wx.navigateTo({
          url: '/pages/me/edit-home/index?section=links',
          success: function () {
            resolve({ ok: true, kind: 'links' });
          },
          fail: function (e) {
            resolve({ ok: false, kind: 'links', err: e });
          },
        });
      });
    });
    console.log('nav links', JSON.stringify(nav2));
    await sleep(3000);
    page = await mp.currentPage();
    console.log('path links', page && page.path);
    if (page && String(page.path).indexOf('edit-home') >= 0) {
      var d = await page.data();
      console.log('linksOnly', d.linksOnly, 'phase', d.phase, 'error', d.error);
    }
  } finally {
    try {
      await mp.disconnect();
    } catch (e) {
      /* ignore */
    }
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
