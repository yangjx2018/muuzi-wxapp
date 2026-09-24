const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '.tmp-domain-check-result.json');

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const logs = [];

  mp.on('console', (msg) => {
    let text = '';
    if (typeof msg === 'string') text = msg;
    else if (msg && typeof msg.text === 'string') text = msg.text;
    else if (msg && Array.isArray(msg.args)) text = msg.args.map(String).join(' ');
    else text = JSON.stringify(msg);
    logs.push(text);
    if (text.includes('DOMAIN_CHECK')) console.log('LOG', text);
  });

  try {
    await mp.reLaunch('/pages/dev/domain-check/index');
  } catch (e) {
    console.log('reLaunch', e.message || e);
  }

  const start = Date.now();
  while (Date.now() - start < 70000) {
    await new Promise((r) => setTimeout(r, 500));
    const doneLine = logs.find((l) => String(l).includes('DOMAIN_CHECK_DONE'));
    if (doneLine) {
      const jsonStart = String(doneLine).indexOf('{');
      const json = jsonStart >= 0 ? String(doneLine).slice(jsonStart) : '{}';
      fs.writeFileSync(OUT, json);
      console.log('RESULT', json);
      let fails = 0;
      try {
        const parsed = JSON.parse(json);
        fails = (parsed.rows || []).filter((r) => r.status === 'FAIL').length;
        for (const row of parsed.rows || []) {
          console.log([row.name, row.status, row.detail].join('\t'));
        }
      } catch (_) {
        fails = logs.filter((l) => String(l).includes('"status":"FAIL"')).length;
      }
      process.exit(fails ? 2 : 0);
    }
  }

  console.log('timeout');
  console.log(
    logs.filter((l) => String(l).includes('DOMAIN')).join('\n') ||
      logs.slice(-20).join('\n')
  );
  process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
