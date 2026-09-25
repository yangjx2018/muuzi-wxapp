/**
 * Clean repro: Me design navigation + method presence
 */
const automator = require('miniprogram-automator');
const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function main() {
  const mp = await automator.connect({ wsEndpoint: WS });
  try {
    await mp.reLaunch('/pages/me/index');
    await sleep(3000);
    var page = await mp.currentPage();
    console.log('path', page && page.path);

    var data = await page.data();
    console.log('shareOpen', data.shareOpen, 'accountsOpen', data.accountsOpen);

    // Probe method existence via evaluate
    var methods = await mp.evaluate(function () {
      var pages = getCurrentPages();
      var p = pages[pages.length - 1];
      if (!p) return { err: 'no page' };
      return {
        route: p.route,
        hasGoDesign: typeof p.goDesign === 'function',
        hasGoLinks: typeof p.goLinks === 'function',
        hasGoShop: typeof p.goShop === 'function',
        hasGoSettings: typeof p.goSettings === 'function',
        shareOpen: p.data && p.data.shareOpen,
        accountsOpen: p.data && p.data.accountsOpen,
      };
    });
    console.log('methods', JSON.stringify(methods));

    // navigate with fail reason
    var nav = await mp.evaluate(function () {
      return new Promise(function (resolve) {
        wx.navigateTo({
          url: '/pages/me/edit-home/index',
          success: function () {
            resolve({ ok: true });
          },
          fail: function (err) {
            resolve({ ok: false, err: err });
          },
        });
      });
    });
    console.log('navigateTo edit-home', JSON.stringify(nav));
    await sleep(2500);
    page = await mp.currentPage();
    console.log('after nav path', page && page.path);

    if (page && String(page.path).indexOf('edit-home') >= 0) {
      var ed = await mp.evaluate(function () {
        var pages = getCurrentPages();
        var p = pages[pages.length - 1];
        return {
          route: p && p.route,
          phase: p && p.data && p.data.phase,
          previewOpen: p && p.data && p.data.previewOpen,
          error: p && p.data && p.data.error,
        };
      });
      console.log('edit-home', JSON.stringify(ed));
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
