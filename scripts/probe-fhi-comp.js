const automator = require('miniprogram-automator');

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function () {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  try {
    let page = await mp.currentPage();
    await page.setData({ scan: true });
    await sleep(2000);
    page = await mp.currentPage();
    const a = await page.$$('field-host-invite');
    const b = await page.$$('.fhi');
    const c = await page.$$('.fhi-title');
    const d = await page.$$('.fc-modes');
    const e = await page.$$('button');
    console.log('sels', {
      tag: a.length,
      fhi: b.length,
      title: c.length,
      modes: d.length,
      btn: e.length,
    });
    const texts = [];
    for (var i = 0; i < Math.min(e.length, 16); i++) {
      try {
        texts.push(await e[i].text());
      } catch (err) {
        texts.push('?');
      }
    }
    console.log('btns', texts);

    const info = await mp.evaluate(function () {
      var p = getCurrentPages().pop();
      var ids = [];
      try {
        ids = (p.selectAllComponents('') || []).map(function (x) {
          return x.is;
        });
      } catch (e1) {
        ids = ['err:' + e1.message];
      }
      return {
        dataScan: p.data.scan,
        room: p.data.savedRoom,
        ids: ids,
      };
    });
    console.log(JSON.stringify(info));
  } finally {
    mp.disconnect();
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
