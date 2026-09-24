/**
 * M1 微信开发者工具联调冒烟（需 IDE auto --auto-port 9420）
 * 凭据仅环境变量：MUUZI_WX_USER / MUUZI_WX_PASS
 * 节点固定 im.muuzi.co
 */
const automator = require('miniprogram-automator');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';
const USER = process.env.MUUZI_WX_USER || '';
const PASS = process.env.MUUZI_WX_PASS || '';
const NODE = 'im.muuzi.co';

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

async function waitFor(fn, label, timeoutMs) {
  const end = Date.now() + (timeoutMs || 20000);
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
      last = v;
    } catch (e) {
      last = e && e.message;
    }
    await sleep(400);
  }
  throw new Error(label + ' timeout; last=' + last);
}

async function ensureNode(page) {
  const data = await page.data();
  if (data.node && data.node.domain === NODE && !data.picking) return;
  // 打开节点选择
  if (data.node && !data.picking) {
    await page.callMethod('onChangeNode');
    await sleep(300);
  }
  await page.callMethod('onPickNode', {
    currentTarget: { dataset: { domain: NODE } },
  });
  await sleep(300);
  const after = await page.data();
  if (!after.node || after.node.domain !== NODE) {
    throw new Error('未能选中节点 ' + NODE + ' got=' + JSON.stringify(after.node));
  }
}

async function login(miniProgram) {
  await miniProgram.callWxMethod('clearStorage');
  let page = await miniProgram.reLaunch('/pages/auth/login/index');
  await sleep(800);
  page = await miniProgram.currentPage();
  await ensureNode(page);
  await page.callMethod('onIdentifier', { detail: { value: USER } });
  await page.callMethod('onPassword', { detail: { value: PASS } });
  await sleep(200);
  const ready = (await page.data()).ready;
  if (!ready) throw new Error('登录按钮未就绪 ready=false');
  await page.callMethod('onSubmit');
  await waitFor(async function () {
    const p = await miniProgram.currentPage();
    const path = p && p.path;
    if (path && path.indexOf('pages/connect/index') >= 0) return p;
    const d = p && (await p.data());
    if (d && d.error) throw new Error('登录错误: ' + d.error);
    if (d && d.stepUpHint) throw new Error('需要邮箱安全验证码: ' + d.stepUpHint);
    return null;
  }, 'login→connect', 25000);
  ok('M0 密码登录进连接', 'node=' + NODE + ' user=' + USER);
}

async function checkHub(miniProgram) {
  const page = await miniProgram.currentPage();
  const path = page.path;
  if (path.indexOf('pages/connect/index') < 0) {
    await miniProgram.switchTab('/pages/connect/index');
    await sleep(1000);
  }
  const hub = await miniProgram.currentPage();
  const data = await hub.data();
  if (!data.savedNote || data.savedNote.indexOf('消息模块') < 0) {
    throw new Error('已保存现场交流占位文案缺失');
  }
  ok('M1.7 已保存占位', data.savedPhase);
  await waitFor(async function () {
    const d = await (await miniProgram.currentPage()).data();
    return d.encounterPhase === 'ready' || d.encounterPhase === 'unavailable'
      ? d
      : null;
  }, 'encounters load', 20000);
  const enc = await (await miniProgram.currentPage()).data();
  ok(
    'M1.3 现场话题',
    'phase=' + enc.encounterPhase + ' items=' + (enc.encounterItems || []).length
  );
  return enc;
}

async function checkTalk(miniProgram) {
  await miniProgram.navigateTo('/pages/connect/talk/index');
  await sleep(1200);
  const page = await miniProgram.currentPage();
  const data = await page.data();
  if (page.path.indexOf('talk') < 0) throw new Error('未进入 talk');
  ok(
    'M1.4/1.5 Talk 页',
    'speechLoaded=' +
      data.speechLoaded +
      ' speechAvailable=' +
      data.speechAvailable +
      ' scan=' +
      data.scan
  );
  await miniProgram.navigateBack();
  await sleep(500);
}

async function checkCard(miniProgram) {
  await miniProgram.navigateTo('/pages/connect/card/index');
  await sleep(2000);
  const page = await waitFor(async function () {
    const p = await miniProgram.currentPage();
    if (!p || p.path.indexOf('card') < 0) return null;
    const d = await p.data();
    if (d.sourcesLoading || d.cardStatus === 'loading') return null;
    return { page: p, data: d };
  }, 'card load', 25000);
  ok(
    'M1.2 名片',
    'cardStatus=' +
      page.data.cardStatus +
      (page.data.sourcesError ? ' sourcesError=' + page.data.sourcesError : '') +
      (page.data.note ? ' note=' + page.data.note : '') +
      (page.data.card && page.data.card.name
        ? ' name=' + page.data.card.name
        : '')
  );
  await miniProgram.navigateBack();
  await sleep(500);
}

async function checkContinue(miniProgram) {
  await miniProgram.navigateTo('/pages/connect/continue/index');
  await sleep(800);
  const page = await miniProgram.currentPage();
  const data = await page.data();
  if (page.path.indexOf('continue') < 0) throw new Error('未进入 continue');
  if (data.canResume) throw new Error('continue 不应在 M3 前可恢复');
  ok('M1.7 continue 壳', (data.note || '').slice(0, 40));
  await miniProgram.navigateBack();
  await sleep(500);
}

async function checkJoin(miniProgram) {
  await miniProgram.navigateTo('/pages/connect/join/index');
  await sleep(800);
  const page = await miniProgram.currentPage();
  const data = await page.data();
  if (page.path.indexOf('join') < 0) throw new Error('未进入 join');
  if (!data.copy || !data.copy.title) throw new Error('join 文案缺失');
  ok('M1.6 Join 访客页', 'entryPresent=' + data.entryPresent + ' title=' + data.copy.title);
  // 回到连接 Tab（join 非 tab）
  await miniProgram.switchTab('/pages/connect/index');
  await sleep(500);
}

async function main() {
  if (!USER || !PASS) {
    console.error('缺少 MUUZI_WX_USER / MUUZI_WX_PASS');
    process.exit(2);
  }
  console.log('Connecting', WS);
  const miniProgram = await automator.connect({ wsEndpoint: WS });
  try {
    await login(miniProgram);
    await checkHub(miniProgram);
    await checkTalk(miniProgram);
    await checkCard(miniProgram);
    await checkContinue(miniProgram);
    await checkJoin(miniProgram);
  } finally {
    try {
      miniProgram.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  const failed = results.filter(function (r) {
    return !r.pass;
  });
  console.log('\n=== M1 DevTools smoke summary ===');
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + '\t' + r.name + '\t' + r.detail);
  });
  if (failed.length) {
    process.exit(1);
  }
  console.log('ALL PASSED', results.length);
}

main().catch(function (err) {
  console.error('SMOKE ABORT', err && err.stack ? err.stack : err);
  process.exit(1);
});
