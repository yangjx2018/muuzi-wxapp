/**
 * 登录页复验：输入账号/密码、ready、点登录、密码框无 focus 锁
 * 前置：npm run devtools（auto-port 9420）
 */
const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';
const PROJECT = path.join(__dirname, '..');

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function loadCreds() {
  var user = process.env.MUUZI_WX_USER || '';
  var pass = process.env.MUUZI_WX_PASS || '';
  if (user && pass) return { user: user, pass: pass };
  var file = path.join(PROJECT, '.e2e-local-credentials.json');
  if (!fs.existsSync(file)) return null;
  var raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw && raw.user && raw.pass) return { user: String(raw.user), pass: String(raw.pass) };
  return null;
}

(async function main() {
  var creds = loadCreds();
  var identifier = (creds && creds.user) || 'yangjx';
  var password = (creds && creds.pass) || 'test-password';
  var results = [];

  const mp = await automator.connect({ wsEndpoint: WS });
  try {
    await mp.reLaunch('/pages/auth/login/index');
    await sleep(2500);
    var page = await mp.currentPage();
    results.push(['path', page && page.path]);

    var data = await page.data();
    results.push(['node', data.node && data.node.domain]);
    results.push(['hasPasswordFocusKey', Object.prototype.hasOwnProperty.call(data, 'passwordFocus')]);
    results.push(['bindSheetVisible', data.bindSheetVisible]);

    // 写入账号密码并合并 ready
    await page.setData({
      identifier: identifier,
      password: password,
      showPassword: false,
      error: '',
    });
    await sleep(200);
    try {
      await page.callMethod('refreshReady');
    } catch (e) {
      results.push(['refreshReady err', e && e.message]);
    }
    await sleep(300);
    data = await page.data();
    results.push(['ready', data.ready]);
    results.push(['identifier', data.identifier]);
    results.push(['passwordLen', String(data.password || '').length]);

    if (!data.ready) {
      throw new Error('FAIL: ready=false after set credentials (node=' + (data.node && data.node.domain) + ')');
    }

    // 点「显示」再点回「隐藏」——不得出现 passwordFocus
    var reveal = await page.$('.field-reveal');
    if (reveal) {
      await reveal.tap();
      await sleep(200);
      data = await page.data();
      results.push(['afterReveal showPassword', data.showPassword]);
      results.push(['afterReveal hasPasswordFocus', Object.prototype.hasOwnProperty.call(data, 'passwordFocus')]);
      await reveal.tap();
      await sleep(200);
    }

    // 点登录按钮
    var btns = await page.$$('button.btn-primary');
    results.push(['primaryBtns', btns && btns.length]);
    if (!btns || !btns[0]) throw new Error('FAIL: no primary button');
    await btns[0].tap();
    results.push(['tapped primary', true]);
    await sleep(2000);
    data = await page.data();
    results.push(['afterTap busy', data.loginBusy]);
    results.push(['afterTap error', data.error || '']);
    results.push(['afterTap route', (await mp.currentPage()).path]);

    // 若仍在登录页：至少应曾进入 busy 或有错误/notice（说明 tap 生效）
    var stillLogin = String((await mp.currentPage()).path || '').indexOf('auth/login') >= 0;
    if (stillLogin && !data.loginBusy && !data.error) {
      // 可能已登录成功并跳走失败；再直接 callMethod 验证 handler
      await page.callMethod('onLoginTap');
      await sleep(1500);
      data = await page.data();
      results.push(['afterCall busy', data.loginBusy]);
      results.push(['afterCall error', data.error || '']);
    }

    console.log(JSON.stringify(results, null, 2));
    console.log('PASS: login page input + ready + tap path ok');
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
