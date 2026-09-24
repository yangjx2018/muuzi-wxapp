const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '.tmp-wechat-login-result.json');

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

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const logs = [];
  mp.on('console', (msg) => {
    const t = textOf(msg);
    logs.push(t);
    if (t.includes('WX_SMOKE') || t.includes('WECHAT_LOGIN')) console.log('LOG', t);
  });

  try {
    await mp.reLaunch('/pages/dev/wechat-login-smoke/index');
  } catch (e) {
    console.log('reLaunch', e.message);
  }

  const start = Date.now();
  while (Date.now() - start < 90000) {
    await new Promise((r) => setTimeout(r, 500));
    const done = logs.find((l) => String(l).includes('WX_SMOKE_DONE'));
    if (done) {
      const jsonStart = String(done).indexOf('{');
      const json = jsonStart >= 0 ? String(done).slice(jsonStart) : '{}';
      let parsed = {};
      try {
        parsed = JSON.parse(json);
      } catch (_) {}
      const out = { parsed, logs: logs.filter((l) => /WX_SMOKE|WECHAT_LOGIN/.test(String(l))) };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log(JSON.stringify(out, null, 2));
      process.exit(parsed.ok ? 0 : 2);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ timeout: true, logs }, null, 2));
  console.log('timeout', logs.filter((l) => /WX_SMOKE|WECHAT_LOGIN/.test(String(l))).join('\n'));
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
