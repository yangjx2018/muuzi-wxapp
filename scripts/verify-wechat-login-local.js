/**
 * 本地 bot 微信登录一轮：选 127.0.0.1:9000 → 点微信登录 → 看结果。
 * 前置：cli auto --project … --trust-project --auto-port 9420
 *       project.private.config.json urlCheck=false
 */
const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '.tmp-wechat-login-result.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function textOf(msg) {
  if (typeof msg === 'string') return msg;
  if (msg && typeof msg.text === 'string') return msg.text;
  if (msg && Array.isArray(msg.args)) return msg.args.map(String).join(' ');
  try {
    return JSON.stringify(msg);
  } catch (_) {
    return String(msg);
  }
}

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const logs = [];
  const result = {
    steps: [],
    finalPath: '',
    error: '',
    ok: false,
  };

  mp.on('console', (msg) => {
    const t = textOf(msg);
    logs.push(t);
    if (/WECHAT|微信|login|bind|DOMAIN|error|Error|session/i.test(t)) {
      console.log('LOG', t);
    }
  });

  result.steps.push('reLaunch login');
  try {
    await mp.reLaunch('/pages/auth/login/index');
  } catch (e) {
    console.log('reLaunch', e.message);
  }
  await sleep(2500);

  let page = await mp.currentPage();
  console.log('page', page && page.path);
  result.finalPath = (page && page.path) || '';

  // 选本地节点（若在 picking 态）
  try {
    const data = await page.data();
    console.log('login data node', data.node && data.node.domain, 'picking', data.picking);
    if (!data.node || data.node.domain !== '127.0.0.1:9000') {
      result.steps.push('pick local node');
      await page.callMethod('selectNodeDomain', '127.0.0.1:9000');
      await sleep(800);
    } else {
      result.steps.push('already on local node');
    }
  } catch (e) {
    console.log('pick node via data failed', e.message);
    // fallback: tap first node-option
    try {
      const opt = await page.$('.node-option');
      if (opt) {
        await opt.tap();
        result.steps.push('tapped node-option');
        await sleep(800);
      }
    } catch (e2) {
      console.log('tap node-option', e2.message);
    }
  }

  result.steps.push('onWeChatLogin');
  try {
    page = await mp.currentPage();
    await page.callMethod('onWeChatLogin');
  } catch (e) {
    console.log('callMethod onWeChatLogin', e.message);
    // try tap wechat button
    try {
      const btns = await page.$$('button');
      for (const b of btns) {
        const txt = await b.text();
        if (String(txt).includes('微信')) {
          await b.tap();
          result.steps.push('tapped 微信登录 button');
          break;
        }
      }
    } catch (e2) {
      result.error = 'cannot invoke wechat login: ' + e2.message;
    }
  }

  // wait for navigation or error
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    try {
      page = await mp.currentPage();
      const p = page.path || '';
      result.finalPath = p;
      let data = {};
      try {
        data = await page.data();
      } catch (_) {}

      if (p.indexOf('pages/connect/index') >= 0) {
        result.ok = true;
        result.steps.push('landed connect tab');
        break;
      }
      if (p.indexOf('pages/auth/bind') >= 0) {
        result.ok = true;
        result.steps.push('landed bind page (bind_required)');
        result.bind = true;
        break;
      }
      if (data && data.error) {
        result.error = data.error;
        result.steps.push('login page error: ' + data.error);
        // keep waiting a bit in case late navigation
        if (i > 8) break;
      }
    } catch (e) {
      console.log('poll', e.message);
    }
  }

  result.logs = logs.filter((l) => /WECHAT|微信|bind|session|code|error|Error|FAIL|OK/i.test(l)).slice(-40);
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
