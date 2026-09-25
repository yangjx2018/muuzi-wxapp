/**
 * 登录页密码框：禁止安全键盘 · DevTools 联调
 * 前置：npm run devtools（auto-port 9420）
 */
const automator = require('miniprogram-automator');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';
const results = [];

function ok(name, detail) {
  results.push({ name: name, pass: true, detail: detail || '' });
  console.log('[PASS]', name, detail || '');
}
function fail(name, detail) {
  results.push({ name: name, pass: false, detail: String(detail || '') });
  console.error('[FAIL]', name, detail || '');
}
function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

(async function main() {
  console.log('Connecting', WS);
  const mp = await automator.connect({ wsEndpoint: WS });
  try {
    try {
      await mp.callWxMethod('clearStorage');
    } catch (e) {
      console.log('[INFO] clearStorage', e && e.message);
    }
    try {
      await mp.evaluate(function () {
        var session = require('services/session');
        session.clearLocal && session.clearLocal();
      });
    } catch (e) {
      console.log('[INFO] clearLocal', e && e.message);
    }
    await sleep(500);
    await mp.reLaunch('/pages/auth/login/index');
    await sleep(2000);
    var page = await mp.currentPage();
    if (!page || String(page.path || '').indexOf('auth/login') < 0) {
      try {
        await mp.callWxMethod('clearStorage');
        await mp.evaluate(function () {
          var session = require('services/session');
          session.clearLocal && session.clearLocal();
        });
      } catch (e2) {
        /* ignore */
      }
      await sleep(300);
      await mp.reLaunch('/pages/auth/login/index');
      await sleep(2000);
      page = await mp.currentPage();
    }
    if (!page || String(page.path || '').indexOf('auth/login') < 0) {
      fail('打开登录页', page && page.path);
      process.exit(1);
    }
    ok('打开登录页', page.path);

    await page.setData({ showPassword: false });
    await sleep(200);

    var inputs = await page.$$('input.field-input-secure');
    if (!inputs || !inputs.length) {
      fail('密码 input', 'missing');
    } else {
      ok('密码 input 节点', 'count=' + inputs.length);
      var el = inputs[0];
      var type = await el.attribute('type');
      var passwordAttr = await el.attribute('password');
      var cls = await el.attribute('class');
      if (String(type || '') === 'text') ok('type=text 普通键盘', type);
      else fail('type=text 普通键盘', type);
      if (String(type || '') === 'safe-password') {
        fail('禁止 safe-password', type);
      }
      if (
        passwordAttr === true ||
        String(passwordAttr).toLowerCase() === 'true'
      ) {
        fail('禁止 password 属性（会拉华为安全键盘）', String(passwordAttr));
      } else {
        ok('无 password=true', String(passwordAttr));
      }
      if (String(cls || '').indexOf('is-masked') >= 0) {
        ok('密文 CSS is-masked', cls);
      } else {
        fail('密文 CSS is-masked', cls);
      }
    }

    await page.callMethod('onPassword', { detail: { value: '' } });
    await page.setData({ passwordFocus: true });
    await sleep(300);
    await page.callMethod('onPassword', { detail: { value: 'TestPwd1!' } });
    await sleep(300);
    var data = await page.data();
    if (data.password === 'TestPwd1!') {
      ok('密文态可写入', 'len=' + data.password.length);
    } else {
      fail('密文态可写入', 'password=' + data.password);
    }

    await page.callMethod('togglePassword');
    await sleep(400);
    data = await page.data();
    if (data.showPassword === true) ok('切换显示', 'showPassword=true');
    else fail('切换显示', String(data.showPassword));
    inputs = await page.$$('input.field-input-secure');
    if (inputs && inputs[0]) {
      var cls2 = await inputs[0].attribute('class');
      var type2 = await inputs[0].attribute('type');
      if (String(type2 || '') === 'text') ok('显示态仍 type=text', type2);
      else fail('显示态仍 type=text', type2);
      if (String(cls2 || '').indexOf('is-masked') < 0) {
        ok('显示态去掉 is-masked', cls2);
      } else {
        fail('显示态去掉 is-masked', cls2);
      }
    }
  } finally {
    try {
      mp.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  var failed = 0;
  console.log('\n=== 登录密码普通键盘联调 ===');
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + '\t' + r.name + '\t' + r.detail);
    if (!r.pass) failed++;
  });
  if (failed) {
    console.error('FAILED', failed);
    process.exit(1);
  }
  console.log('ALL PASSED', results.length);
})().catch(function (e) {
  console.error('SMOKE ABORT', e && e.stack ? e.stack : e);
  process.exit(1);
});