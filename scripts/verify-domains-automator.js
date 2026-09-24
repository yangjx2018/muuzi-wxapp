/**
 * 通过微信开发者工具自动化：打开域名校验页并执行 wx.request。
 * 用法：node scripts/verify-domains-automator.js
 */
const path = require('path');
const automator = require('miniprogram-automator');

const PROJECT = path.join(__dirname, '..');
const CLI = 'D:\\Tencent\\微信web开发者工具\\cli.bat';

async function main() {
  let miniProgram;
  const endpoints = [
    'ws://127.0.0.1:9420',
    'ws://localhost:9420',
    'ws://127.0.0.1:9430',
  ];

  for (const wsEndpoint of endpoints) {
    try {
      console.log('try connect', wsEndpoint);
      miniProgram = await automator.connect({ wsEndpoint });
      console.log('connected', wsEndpoint);
      break;
    } catch (e) {
      console.log('connect fail', wsEndpoint, e.message || e);
    }
  }

  if (!miniProgram) {
    console.log('launch via automator…');
    miniProgram = await automator.launch({
      projectPath: PROJECT,
      cliPath: CLI,
      timeout: 120000,
    });
  }

  try {
    await miniProgram.navigateTo('/pages/dev/domain-check/index');
  } catch (e) {
    console.log('navigateTo failed, try reLaunch', e.message || e);
    await miniProgram.reLaunch('/pages/dev/domain-check/index');
  }

  const page = await miniProgram.currentPage();
  console.log('page', page.path);

  // 点击开始验证
  const btn = await page.$('button');
  if (btn) {
    // 第一个 button 是「开始验证」
    await btn.tap();
  } else {
    await page.callMethod('onStart');
  }

  // 等待四轮请求结束
  let done = false;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const data = await page.data();
    if (data.done) {
      done = true;
      console.log('---- results ----');
      for (const row of data.rows || []) {
        console.log(`${row.name}\t${row.status}\t${row.detail}`);
      }
      break;
    }
  }
  if (!done) {
    const data = await page.data();
    console.log('timeout; partial', JSON.stringify(data.rows, null, 2));
  }

  // capabilities 冒烟
  try {
    await page.callMethod('onLoginSmoke');
    await sleep(3000);
    console.log('capabilities smoke invoked');
  } catch (e) {
    console.log('capabilities smoke error', e.message || e);
  }

  await miniProgram.close();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
