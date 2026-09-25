/**
 * Probe Me page taps + edit-home interactivity
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
    await sleep(2000);
    var page = await mp.currentPage();

    var cards = await page.$$('.me-editor-card');
    console.log('cards', cards && cards.length);
    if (cards && cards[0]) {
      await cards[0].tap();
      await sleep(2000);
      page = await mp.currentPage();
      console.log('after links card tap', page && page.path);
    }

    await mp.reLaunch('/pages/me/index');
    await sleep(1500);
    page = await mp.currentPage();
    await page.callMethod('goDesign');
    await sleep(2500);
    page = await mp.currentPage();
    console.log('goDesign path', page && page.path);

    if (page && String(page.path).indexOf('edit-home') >= 0) {
      var ghosts = await page.$$('.eh-ghost');
      var h2 = await page.$$('.eh-section-h2');
      var d = await page.data();
      console.log(
        'ghosts',
        ghosts && ghosts.length,
        'h2',
        h2 && h2.length,
        'phase',
        d.phase,
        'previewOpen',
        d.previewOpen,
        'sharePickerOpen',
        d.sharePickerOpen
      );
    }

    await mp.reLaunch('/pages/me/index');
    await sleep(1500);
    try {
      await mp.navigateTo('/pages/me/settings/index');
      console.log('mp.navigateTo settings ok');
    } catch (e) {
      console.log('mp.navigateTo settings FAIL', e && e.message);
    }
    await sleep(2000);
    page = await mp.currentPage();
    console.log('settings path', page && page.path);

    // Try button tap with hover
    await mp.reLaunch('/pages/me/index');
    await sleep(1500);
    page = await mp.currentPage();
    var buttons = await page.$$('button');
    console.log('button count', buttons && buttons.length);
    for (var i = 0; i < (buttons ? buttons.length : 0); i++) {
      var t = await buttons[i].text();
      console.log('button', i, JSON.stringify(t));
    }
    if (buttons && buttons.length >= 2) {
      await buttons[1].tap();
      await sleep(2500);
      page = await mp.currentPage();
      console.log('after button[1] tap', page && page.path);
    }
  } finally {
    try {
      await mp.disconnect();
    } catch (e2) {
      /* ignore */
    }
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
