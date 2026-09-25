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
    await sleep(2500);
    var page = await mp.currentPage();
    await page.callMethod('goLinks');
    await sleep(2500);
    page = await mp.currentPage();
    console.log('goLinks path', page && page.path);
    var d = page ? await page.data() : {};
    console.log('linksOnly', d.linksOnly, 'phase', d.phase);

    await mp.reLaunch('/pages/me/index');
    await sleep(2500);
    var nav = await mp.evaluate(function () {
      return new Promise(function (resolve) {
        wx.navigateTo({
          url: '/pages/me/edit-home/index?section=links',
          success: function () {
            resolve({ ok: true });
          },
          fail: function (e) {
            resolve({ ok: false, err: e });
          },
        });
      });
    });
    console.log('nav links', JSON.stringify(nav));
    await sleep(2000);
    page = await mp.currentPage();
    console.log('path after nav', page && page.path);

    await mp.reLaunch('/pages/me/index');
    await sleep(3000);
    page = await mp.currentPage();
    var cards = await page.$$('.me-editor-card');
    console.log('cards', cards && cards.length);
    if (cards && cards[0]) {
      await cards[0].tap();
      await sleep(3000);
      page = await mp.currentPage();
      console.log('card tap path', page && page.path);
    }

    await mp.reLaunch('/pages/me/index');
    await sleep(2500);
    page = await mp.currentPage();
    var tools = await page.$$('.me-tool');
    console.log('tools', tools && tools.length);
    if (tools && tools[2]) {
      await tools[2].tap();
      await sleep(2500);
      page = await mp.currentPage();
      console.log('settings tap path', page && page.path);
    }

    await mp.reLaunch('/pages/me/index');
    await sleep(2500);
    page = await mp.currentPage();
    tools = await page.$$('.me-tool');
    if (tools && tools[0]) {
      await tools[0].tap();
      await sleep(2500);
      page = await mp.currentPage();
      console.log('shop tap path', page && page.path);
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
