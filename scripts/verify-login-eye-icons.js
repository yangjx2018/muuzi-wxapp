/**
 * 登录页密码显隐：闭眼=密文，睁眼=明文
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
    await mp.reLaunch('/pages/auth/login/index');
    await sleep(2000);
    const page = await mp.currentPage();
    await page.setData({ showPassword: false });
    await sleep(200);

    var img = await page.$('.field-reveal-icon');
    if (!img) throw new Error('no icon');
    var src = await img.attribute('src');
    console.log('masked src', src);
    if (String(src).indexOf('eye-closed') < 0) {
      throw new Error('expected closed eye when masked: ' + src);
    }

    var reveal = await page.$('.field-reveal');
    await reveal.tap();
    await sleep(300);
    var d = await page.data();
    img = await page.$('.field-reveal-icon');
    src = await img.attribute('src');
    console.log('revealed showPassword', d.showPassword, 'src', src);
    if (!d.showPassword) throw new Error('toggle failed');
    if (String(src).indexOf('eye-open') < 0) {
      throw new Error('expected open eye when revealed: ' + src);
    }
    console.log('PASS: eye icons toggle');
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
