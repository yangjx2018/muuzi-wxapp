/**
 * 企业主页 DevTools 冒烟（需 IDE auto --auto-port 9420）
 * 凭据：环境变量 MUUZI_WX_USER/MUUZI_WX_PASS，或本地 .e2e-local-credentials.json
 * 不打印密码。
 */
const fs = require('fs');
const path = require('path');
const automator = require('miniprogram-automator');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';
const NODE = 'im.muuzi.co';
const ROOT = path.join(__dirname, '..');

function loadCreds() {
  var user = process.env.MUUZI_WX_USER || '';
  var pass = process.env.MUUZI_WX_PASS || '';
  if (user && pass) return { user: user, pass: pass };
  var file = path.join(ROOT, '.e2e-local-credentials.json');
  var raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    user: String(raw.account || raw.user || raw.username || ''),
    pass: String(raw.password || raw.pass || ''),
  };
}

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
  var end = Date.now() + (timeoutMs || 25000);
  var last;
  while (Date.now() < end) {
    try {
      var v = await fn();
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
  var data = await page.data();
  if (data.node && data.node.domain === NODE && !data.picking) return;
  if (data.node && !data.picking) {
    await page.callMethod('onChangeNode');
    await sleep(300);
  }
  await page.callMethod('onPickNode', {
    currentTarget: { dataset: { domain: NODE } },
  });
  await sleep(300);
}

async function login(miniProgram, user, pass) {
  await miniProgram.callWxMethod('clearStorage');
  await miniProgram.reLaunch('/pages/auth/login/index');
  await sleep(800);
  var page = await miniProgram.currentPage();
  await ensureNode(page);
  await page.callMethod('onIdentifier', { detail: { value: user } });
  await page.callMethod('onPassword', { detail: { value: pass } });
  await sleep(200);
  if (!(await page.data()).ready) throw new Error('登录按钮未就绪');
  await page.callMethod('onLoginTap');
  await waitFor(async function () {
    var p = await miniProgram.currentPage();
    var pathName = p && p.path;
    if (pathName && pathName.indexOf('pages/connect/index') >= 0) return p;
    var d = p && (await p.data());
    if (d && d.error) throw new Error('登录错误: ' + d.error);
    if (d && d.stepUpHint) throw new Error('需要邮箱安全验证码');
    return null;
  }, 'login→connect', 30000);
  ok('登录进连接', 'node=' + NODE);
}

async function ensureSignedIn(miniProgram, user, pass) {
  // 优先复用 IDE 已登录会话，避免本地凭据过期卡住冒烟
  try {
    await miniProgram.switchTab('/pages/me/index');
    await sleep(1500);
    var cur = await miniProgram.currentPage();
    var pathName = String((cur && cur.path) || '');
    if (pathName.indexOf('pages/me/index') >= 0) {
      ok('复用已登录会话', 'path=' + pathName);
      return;
    }
    console.log('[info] 当前页非我的:', pathName);
  } catch (e) {
    console.log('[info] 复用会话失败:', e && e.message);
  }
  try {
    await login(miniProgram, user, pass);
  } catch (err) {
    throw new Error(
      '自动登录失败（' +
        (err && err.message) +
        '）。请在微信开发者工具里手动登录后重跑本脚本。'
    );
  }
}

async function openSpaces(miniProgram) {
  await miniProgram.navigateTo('/pages/me/spaces/index');
  await sleep(1500);
  var page = await waitFor(async function () {
    var p = await miniProgram.currentPage();
    if (!p || String(p.path || '').indexOf('spaces') < 0) return null;
    var d = await p.data();
    if (d.phase === 'loading') return null;
    return { page: p, data: d };
  }, 'spaces load', 25000);
  ok(
    '空间页可打开',
    'phase=' +
      page.data.phase +
      ' orgs=' +
      ((page.data.orgs && page.data.orgs.length) || 0) +
      ' isOrg=' +
      !!page.data.isOrg
  );
  return page;
}

async function checkOrgEdit(miniProgram, orgId) {
  await miniProgram.navigateTo(
    '/pages/me/edit-home/index?org=' + encodeURIComponent(orgId)
  );
  await sleep(2000);
  var page = await waitFor(async function () {
    var p = await miniProgram.currentPage();
    if (!p || String(p.path || '').indexOf('edit-home') < 0) return null;
    var d = await p.data();
    if (d.phase === 'connecting') return null;
    return { page: p, data: d };
  }, 'org edit-home load', 30000);
  if (!page.data.isOrg) throw new Error('isOrg=false');
  if (page.data.orgId !== orgId) throw new Error('orgId mismatch');
  if (page.data.phase === 'error') {
    throw new Error('编辑失败: ' + (page.data.error || ''));
  }
  ok(
    '企业主页编辑器',
    'phase=' + page.data.phase + ' slug=' + (page.data.slug || '')
  );
  return page;
}

async function checkOrgMembers(miniProgram, orgId) {
  await miniProgram.navigateTo(
    '/pages/me/org-members/index?org=' + encodeURIComponent(orgId)
  );
  await sleep(1500);
  var page = await waitFor(async function () {
    var p = await miniProgram.currentPage();
    if (!p || String(p.path || '').indexOf('org-members') < 0) return null;
    var d = await p.data();
    if (d.phase === 'loading') return null;
    return { page: p, data: d };
  }, 'org-members load', 25000);
  ok(
    '成员与邀请页',
    'phase=' + page.data.phase + ' members=' + ((page.data.members && page.data.members.length) || 0)
  );
  return page;
}

async function checkCreatePage(miniProgram) {
  await miniProgram.navigateTo('/pages/me/enterprise-create/index');
  await sleep(1000);
  var page = await miniProgram.currentPage();
  if (!page || String(page.path || '').indexOf('enterprise-create') < 0) {
    throw new Error('未进入开通企业版页');
  }
  var data = await page.data();
  ok('开通企业版页', 'nodeDomain=' + (data.nodeDomain || ''));
}

async function checkCardOrgEditRoute(miniProgram) {
  await miniProgram.navigateTo('/pages/connect/card/index');
  await sleep(2000);
  var page = await waitFor(async function () {
    var p = await miniProgram.currentPage();
    if (!p || String(p.path || '').indexOf('card') < 0) return null;
    var d = await p.data();
    if (d.sourcesLoading) return null;
    return { page: p, data: d };
  }, 'card load', 25000);
  var sources = page.data.sources || [];
  var orgIndex = -1;
  for (var i = 0; i < sources.length; i++) {
    if (sources[i] && sources[i].kind === 'org') {
      orgIndex = i;
      break;
    }
  }
  if (orgIndex < 0) {
    ok('名片无企业源（跳过编辑跳转）', 'sources=' + sources.length);
    return;
  }
  await page.page.callMethod('onSourceChange', { detail: { value: orgIndex } });
  await sleep(1500);
  await page.page.callMethod('goEdit');
  await sleep(2000);
  var edit = await miniProgram.currentPage();
  var editPath = String((edit && edit.path) || '');
  if (editPath.indexOf('edit-home') < 0) {
    throw new Error('名片企业编辑未进 edit-home，path=' + editPath);
  }
  var ed = await edit.data();
  if (!ed.isOrg) throw new Error('名片进编辑器后 isOrg=false');
  ok('名片企业→编辑企业主页', 'orgId=' + ed.orgId);
}

async function main() {
  var creds = loadCreds();
  if (!creds.user || !creds.pass) {
    throw new Error('缺少本地凭据或环境变量');
  }
  console.log('[info] connect', WS, 'user=' + creds.user);
  var miniProgram = await automator.connect({ wsEndpoint: WS });
  try {
    await ensureSignedIn(miniProgram, creds.user, creds.pass);
    var spaces = await openSpaces(miniProgram);
    var orgs = spaces.data.orgs || [];
    if (!orgs.length) {
      ok('当前账号无企业', '将只验开通页');
      await miniProgram.navigateBack().catch(function () {});
      await sleep(400);
      await checkCreatePage(miniProgram);
    } else {
      // 选第一个可管理企业
      var org = null;
      for (var i = 0; i < orgs.length; i++) {
        if (orgs[i].role === 'owner' || orgs[i].role === 'admin') {
          org = orgs[i];
          break;
        }
      }
      if (!org) org = orgs[0];
      ok('选用企业', org.id + ' ' + org.name + ' role=' + org.role);
      await checkOrgEdit(miniProgram, org.id);
      await miniProgram.navigateBack().catch(function () {});
      await sleep(500);
      await checkOrgMembers(miniProgram, org.id);
      await miniProgram.navigateBack().catch(function () {});
      await sleep(500);
      await checkCreatePage(miniProgram);
      await miniProgram.navigateBack().catch(function () {});
      await sleep(500);
      await checkCardOrgEditRoute(miniProgram);
    }
  } finally {
    try {
      await miniProgram.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  var failed = results.filter(function (r) {
    return !r.pass;
  });
  console.log(
    JSON.stringify(
      {
        pass: failed.length === 0,
        total: results.length,
        failed: failed.length,
        results: results,
      },
      null,
      2
    )
  );
  if (failed.length) process.exit(1);
}

main().catch(function (err) {
  console.error('[FATAL]', err && err.message ? err.message : err);
  process.exit(1);
});
