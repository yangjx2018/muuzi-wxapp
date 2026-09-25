/**
 * 复查：Me 页点「设计」应进入 edit-home；Links 卡也应能进
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
  var failed = 0;
  try {
    await mp.reLaunch('/pages/me/index');
    await sleep(3000);
    var page = await mp.currentPage();
    var probe = await mp.evaluate(function () {
      var pages = getCurrentPages();
      var p = pages[pages.length - 1];
      return {
        route: p && p.route,
        hasGoDesign: typeof p.goDesign === 'function',
        shareOpen: p && p.data && p.data.shareOpen,
        canvasNodes: !!document, // placeholder
      };
    });
    console.log('probe', JSON.stringify(probe));

    var tools = await page.$$('.me-tool');
    console.log('me-tool count', tools && tools.length);
    if (!tools || tools.length < 2) {
      console.error('FAIL: tools missing');
      process.exit(1);
    }
    await tools[1].tap();
    await sleep(2500);
    page = await mp.currentPage();
    console.log('after design tap', page && page.path);
    if (!page || String(page.path).indexOf('edit-home') < 0) {
      console.error('FAIL: design tap did not navigate');
      failed++;
    } else {
      console.log('PASS: design tap -> edit-home');
    }

    await mp.reLaunch('/pages/me/index');
    await sleep(2500);
    page = await mp.currentPage();
    var cards = await page.$$('.me-editor-card');
    console.log('cards', cards && cards.length);
    if (cards && cards[0]) {
      await cards[0].tap();
      await sleep(2500);
      page = await mp.currentPage();
      console.log('after links card tap', page && page.path);
      if (!page || String(page.path).indexOf('edit-home') < 0) {
        console.error('FAIL: links card tap did not navigate');
        failed++;
      } else {
        console.log('PASS: links card -> edit-home');
      }
    }

    await mp.reLaunch('/pages/me/index');
    await sleep(2000);
    page = await mp.currentPage();
    if (tools && tools.length >= 3) {
      tools = await page.$$('.me-tool');
      await tools[2].tap();
      await sleep(2000);
      page = await mp.currentPage();
      console.log('after settings tap', page && page.path);
      if (!page || String(page.path).indexOf('settings') < 0) {
        console.error('FAIL: settings tap did not navigate');
        failed++;
      } else {
        console.log('PASS: settings tap');
      }
    }

    process.exit(failed ? 1 : 0);
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
