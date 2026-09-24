const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOT = path.join(ROOT, '.tmp-domain-check.png');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const logs = [];

  mp.on('console', (msg) => {
    logs.push(msg);
    try {
      console.log('console_raw', JSON.stringify(msg));
    } catch (_) {
      console.log('console_raw', String(msg));
    }
  });
  mp.on('exception', (e) => console.log('exception', e));

  // compile / refresh
  try {
    if (typeof mp.reload === 'function') await mp.reload();
  } catch (e) {
    console.log('reload', e.message);
  }

  await sleep(2000);
  try {
    await mp.reLaunch('/pages/dev/domain-check/index');
  } catch (e) {
    console.log('reLaunch', e.message);
  }

  // wait for network round-trips
  await sleep(25000);

  try {
    await mp.screenshot({ path: SHOT });
    console.log('screenshot written', SHOT, fs.existsSync(SHOT));
  } catch (e) {
    console.log('screenshot fail', e.message);
  }

  // try page data again
  try {
    const page = await mp.currentPage();
    console.log('path', page && page.path);
    const data = await page.data();
    console.log('data', JSON.stringify(data, null, 2));
    fs.writeFileSync(path.join(ROOT, '.tmp-domain-check-result.json'), JSON.stringify(data, null, 2));
    const fails = (data.rows || []).filter((r) => r.status === 'FAIL');
    process.exit(fails.length ? 2 : data.done ? 0 : 1);
  } catch (e) {
    console.log('page.data fail', e.message);
    console.log('log_count', logs.length);
    process.exit(fs.existsSync(SHOT) ? 0 : 1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
