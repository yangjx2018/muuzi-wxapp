const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CREDS = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.e2e-local-credentials.json'), 'utf8')
);
const OUT = path.join(ROOT, '.tmp-wechat-bind-e2e.json');

function textOf(msg) {
  if (typeof msg === 'string') return msg;
  if (msg && Array.isArray(msg.args)) return msg.args.map(String).join(' ');
  if (msg && typeof msg.text === 'string') return msg.text;
  try {
    return JSON.stringify(msg);
  } catch (_) {
    return String(msg);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log('connecting ws://127.0.0.1:9420 …');
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  console.log('connected');
  const logs = [];
  mp.on('console', (msg) => {
    const t = textOf(msg);
    logs.push(t);
    if (/WX_E2E|WECHAT_LOGIN|WECHAT_BIND/.test(t)) console.log('LOG', t);
  });

  // Wipe session + leftover seeds so App.routeBySession won't bounce us
  try {
    await mp.evaluate(function () {
      // eslint-disable-next-line no-undef
      try {
        wx.clearStorageSync();
      } catch (e) {}
      return true;
    });
    console.log('storage cleared');
  } catch (e) {
    console.log('clear storage:', e.message);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await mp.reLaunch('/pages/dev/wechat-bind-e2e/index');
      console.log('reLaunch ok attempt', attempt);
    } catch (e) {
      console.log('reLaunch:', e.message);
    }
    await sleep(3500);
    try {
      const page = await mp.currentPage();
      console.log('path after reLaunch', page && page.path);
      if (page && String(page.path).includes('wechat-bind-e2e')) break;
    } catch (e) {
      console.log('currentPage', e.message);
    }
  }

  let injected = false;
  for (let i = 0; i < 25; i++) {
    try {
      const page = await mp.currentPage();
      const p = page && page.path;
      console.log('path', p);
      if (p && String(p).includes('wechat-bind-e2e')) {
        try {
          await page.callMethod('runWithCreds', CREDS);
          console.log('callMethod object ok');
        } catch (e1) {
          console.log('object fail:', e1.message);
          await page.callMethod('runWithCreds', JSON.stringify(CREDS));
          console.log('callMethod json ok');
        }
        injected = true;
        break;
      }
      if (i === 5 || i === 12) {
        try {
          await mp.reLaunch('/pages/dev/wechat-bind-e2e/index');
        } catch (_) {}
        await sleep(2500);
      }
    } catch (e) {
      console.log('inject try', i, e.message);
    }
    await sleep(700);
  }
  if (!injected) {
    console.log('FATAL: could not inject');
    fs.writeFileSync(OUT, JSON.stringify({ inject_failed: true, logs: logs }, null, 2));
    process.exit(3);
  }

  const start = Date.now();
  while (Date.now() - start < 120000) {
    await sleep(500);
    const done = logs.find((l) => String(l).includes('WX_E2E_DONE'));
    if (done) {
      const jsonStart = String(done).indexOf('{');
      const json = jsonStart >= 0 ? String(done).slice(jsonStart) : '{}';
      let parsed = {};
      try {
        parsed = JSON.parse(json);
      } catch (_) {}
      const out = {
        parsed: parsed,
        logs: logs.filter((l) => /WX_E2E|WECHAT_LOGIN|WECHAT_BIND/.test(String(l))),
      };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log(JSON.stringify(out, null, 2));
      process.exit(parsed.ok ? 0 : 2);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ timeout: true, logs: logs }, null, 2));
  console.log('timeout');
  console.log(logs.filter((l) => /WX_E2E|WECHAT_LOGIN|WECHAT_BIND/.test(String(l))).join('\n'));
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
