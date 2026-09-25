/**
 * 私信会话：输入栏可用 + 媒体载入 · 微信开发者工具联调
 * 前置：npm run devtools（auto-port 9420）
 * 凭据：MUUZI_WX_USER/MUUZI_WX_PASS 或 .e2e-local-credentials.json（不打印密码）
 */
const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';
const NODE = 'im.muuzi.co';
const PROJECT = path.join(__dirname, '..');
const CLI =
  process.env.MUUZI_WX_CLI ||
  'D:\\Tencent\\微信web开发者工具\\cli.bat';
const MARKER = '联调发送-' + Date.now().toString(36);
const results = [];

function loadCreds() {
  var user = process.env.MUUZI_WX_USER || '';
  var pass = process.env.MUUZI_WX_PASS || '';
  if (user && pass) return { user: user, pass: pass };
  var file = path.join(PROJECT, '.e2e-local-credentials.json');
  if (!fs.existsSync(file)) {
    throw new Error('缺少登录凭据：设 MUUZI_WX_USER/PASS 或 .e2e-local-credentials.json');
  }
  var raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    user: String(raw.account || raw.user || raw.username || ''),
    pass: String(raw.password || raw.pass || ''),
  };
}

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
  const end = Date.now() + (timeoutMs || 30000);
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

async function connect() {
  const endpoints = [WS, 'ws://127.0.0.1:9420', 'ws://localhost:9420'];
  for (var i = 0; i < endpoints.length; i++) {
    try {
      console.log('try connect', endpoints[i]);
      const mp = await automator.connect({ wsEndpoint: endpoints[i] });
      console.log('connected', endpoints[i]);
      return mp;
    } catch (e) {
      console.log('connect fail', endpoints[i], e && e.message);
    }
  }
  if (fs.existsSync(CLI)) {
    console.log('launch via automator…');
    return automator.launch({
      projectPath: PROJECT,
      cliPath: CLI,
      timeout: 120000,
    });
  }
  throw new Error('无法连接微信开发者工具，请先 npm run devtools');
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

async function ensureSignedIn(mp, creds) {
  // 优先复用 IDE 已登录会话
  try {
    var snap0 = await mp.evaluate(function () {
      var s = require('services/session');
      try {
        s.restore && s.restore();
      } catch (e) {
        /* ignore */
      }
      var x = s.snapshot();
      return {
        user: x.matrixUserId || '',
        hasToken: !!(x.accessToken && x.accessToken.length > 8),
      };
    });
    if (snap0.hasToken) {
      ok('复用已登录会话', 'user=' + snap0.user);
      return;
    }
  } catch (e) {
    console.log('[INFO] reuse session', e && e.message);
  }

  if (!creds.user || !creds.pass) {
    throw new Error('未登录且无可用凭据');
  }
  console.log('[INFO] API login as', creds.user);
  var loginResult = await mp.evaluate(
    function (payload) {
      var nodeService = require('services/node');
      var guduu = require('services/guduu-auth');
      var session = require('services/session');
      var rules = require('services/rules');
      var node = nodeService.resolveNode(payload.node);
      var method = rules.resolvedLoginMethod(payload.user);
      return guduu
        .loginAtNode(node, method, payload.user, payload.pass)
        .then(function (result) {
          if (result && result.step_up) {
            return { ok: false, err: 'step_up' };
          }
          if (result && (result.access_token || result.status === 'authenticated')) {
            session.beginSession(node, result);
            return { ok: true, user: result.user_id || '' };
          }
          return { ok: false, err: JSON.stringify(result || {}) };
        })
        .catch(function (err) {
          return {
            ok: false,
            err: (err && err.message) || String(err),
          };
        });
    },
    { node: NODE, user: creds.user, pass: creds.pass }
  );
  if (!loginResult || !loginResult.ok) {
    throw new Error('API 登录失败: ' + ((loginResult && loginResult.err) || 'unknown'));
  }
  ok('API 登录成功', 'user=' + loginResult.user);
  try {
    await mp.switchTab('/pages/messages/index');
  } catch (e) {
    await mp.reLaunch('/pages/messages/index');
  }
  await sleep(2000);
}

async function openRoom(mp) {
  await mp.switchTab('/pages/messages/index');
  await sleep(1500);

  const boot = await mp.evaluate(function () {
    var rt = require('services/matrixRuntime');
    var ms = rt.getSnapshot();
    if ((ms.rooms || []).length > 0) {
      return { rooms: ms.rooms.length, restarted: false };
    }
    try {
      rt.clearPersistedSync();
    } catch (e) {
      /* ignore */
    }
    rt.stop();
    rt.ensureStarted();
    return { rooms: 0, restarted: true };
  });
  if (boot.restarted) await sleep(8000);

  const inbox = await waitFor(async function () {
    const p = await mp.currentPage();
    if (!p || String(p.path || '').indexOf('messages/index') < 0) {
      try {
        await mp.switchTab('/pages/messages/index');
      } catch (e) {
        /* ignore */
      }
      return null;
    }
    try {
      await p.callMethod('refresh');
    } catch (e) {
      /* optional */
    }
    const d = await p.data();
    if (!d.rooms || !d.rooms.length) return null;
    return { page: p, data: d };
  }, 'messages inbox', 60000);

  ok('消息列表', 'rooms=' + inbox.data.rooms.length);

  // 优先：用户反馈的 duxiuzhen02；其次非加密 DM；再任意非 AI
  var rooms = inbox.data.rooms || [];
  var room =
    rooms.find(function (r) {
      return r && /duxiuzhen02/i.test(String(r.name || ''));
    }) ||
    rooms.find(function (r) {
      return r && r.kind === 'direct' && !r.encrypted && r.roomId;
    }) ||
    rooms.find(function (r) {
      return r && r.kind !== 'ai' && r.roomId;
    });
  if (!room) throw new Error('无可用会话');

  await mp.navigateTo(
    '/pages/messages/room/index?room=' + encodeURIComponent(room.roomId)
  );
  await sleep(1500);
  const roomPage = await waitFor(async function () {
    const p = await mp.currentPage();
    if (!p || String(p.path || '').indexOf('messages/room') < 0) return null;
    const d = await p.data();
    if (!d.name && d.ready === false) return null;
    return p;
  }, 'room page', 25000);

  return {
    page: roomPage,
    roomId: room.roomId,
    roomName: room.name || '',
    encrypted: !!room.encrypted,
  };
}

async function assertComposer(page) {
  const data = await page.data();
  if (!(data.statusBarPx > 0)) {
    fail('statusBarPx', String(data.statusBarPx));
  } else {
    ok('statusBarPx', String(data.statusBarPx));
  }

  const root = await page.$('.chat-page');
  if (!root) {
    fail('chat-page', 'missing');
    return;
  }
  const style = await root.attribute('style');
  if (String(style || '').indexOf('padding-top') >= 0) {
    ok('chat-page padding-top', style);
  } else {
    fail('chat-page padding-top', style);
  }

  const pad = await page.$('status-pad');
  if (pad) fail('无 status-pad', 'still present');
  else ok('无 status-pad', 'ok');

  const composer = await page.$('.chat-composer');
  if (!composer) {
    fail('composer', 'missing');
    return;
  }
  ok('composer', 'present');

  try {
    const size = await composer.size();
    if (size && size.height != null) {
      if (size.height >= 70) ok('composer 高度', 'h=' + size.height);
      else fail('composer 高度过矮（疑似裁切）', 'h=' + size.height);
    }
  } catch (e) {
    ok('composer 高度', 'size API skip');
  }

  const tools = await page.$('.chat-tools');
  if (!tools) fail('chat-tools', 'missing — 发送栏被裁切');
  else {
    ok('chat-tools', 'present');
    try {
      const tSize = await tools.size();
      if (tSize && tSize.height != null && tSize.height < 20) {
        fail('chat-tools 高度', 'h=' + tSize.height);
      } else if (tSize && tSize.height != null) {
        ok('chat-tools 高度', 'h=' + tSize.height);
      }
    } catch (e) {
      /* ignore */
    }
  }

  const send = await page.$('.chat-tool-hit.send');
  if (!send) fail('发送按钮', 'missing');
  else ok('发送按钮', 'present');

  const ta = await page.$('textarea.chat-input');
  if (!ta) fail('textarea', 'missing');
  else {
    ok('textarea', 'present');
    try {
      const taSize = await ta.size();
      if (taSize && taSize.height != null) {
        if (taSize.height >= 18) ok('textarea 高度', 'h=' + taSize.height);
        else fail('textarea 高度过矮', 'h=' + taSize.height);
      }
    } catch (e) {
      /* ignore */
    }
  }
}

async function assertSend(mp, page) {
  await page.callMethod('onDraftInput', { detail: { value: MARKER } });
  await sleep(300);
  var afterDraft = await page.data();
  if (afterDraft.draft !== MARKER) {
    fail('写入草稿', 'draft=' + afterDraft.draft);
    return;
  }
  ok('写入草稿', MARKER);

  await page.callMethod('onSend');
  await sleep(3500);
  var after = await page.data();

  if (after.error && /暂不可发送|加密切片/.test(String(after.error))) {
    fail('发送被禁', after.error);
    return;
  }
  const hit = (after.messages || []).some(function (m) {
    return m && m.body === MARKER;
  });
  const displayHit = (after.displayMessages || []).some(function (m) {
    return m && m.body === MARKER;
  });
  if (hit || displayHit) {
    ok('文字发送成功', MARKER);
    return;
  }
  if (after.error) {
    fail('发送失败', after.error);
    return;
  }
  await sleep(1500);
  const p2 = await mp.currentPage();
  if (p2 && String(p2.path || '').indexOf('messages/room') >= 0) {
    const d2 = await p2.data();
    const hit2 = (d2.messages || []).some(function (m) {
      return m && m.body === MARKER;
    });
    if (hit2) ok('文字发送成功', MARKER);
    else
      fail(
        '发送后无气泡',
        'count=' + ((d2.messages && d2.messages.length) || 0)
      );
  } else {
    fail('发送后离开会话页', p2 && p2.path);
  }
}

async function assertMediaRoundtrip(mp, page, roomId) {
  console.log('[INFO] 真机路径：写 320×240 PNG → sendPicked → 可见缩略图 → preview');
  var fixturePath = path.join(PROJECT, 'scripts/fixtures/verify-chat-image.png');
  if (!fs.existsSync(fixturePath)) {
    fail('测试图 fixture', 'missing ' + fixturePath);
    return;
  }
  var b64 = fs.readFileSync(fixturePath).toString('base64');
  var wrote;
  try {
    wrote = await mp.evaluate(function (payload) {
      var fsApi = wx.getFileSystemManager();
      var filePath = wx.env.USER_DATA_PATH + '/verify-composer-media.png';
      var buf = wx.base64ToArrayBuffer(payload);
      fsApi.writeFileSync(filePath, buf);
      return { filePath: filePath, size: buf.byteLength };
    }, b64);
  } catch (e) {
    fail('写入测试图片', e && e.message);
    return;
  }
  ok('写入测试图片', wrote.filePath + ' size=' + wrote.size);

  await page.callMethod('sendPicked', {
    filePath: wrote.filePath,
    name: 'verify-composer-media.png',
    size: wrote.size || 780,
    width: 320,
    height: 240,
    mimetype: 'image/png',
  });
  await sleep(7000);

  page = await mp.currentPage();
  var data = await page.data();
  if (data.error) {
    fail('发送测试图片', data.error);
    return;
  }
  var imgs = (data.displayMessages || data.messages || []).filter(function (m) {
    return m && m.isImage && (m.imageSrc || m.mediaSrc);
  });
  if (!imgs.length) {
    fail('发送后无可见图片气泡', 'count=' + ((data.messages && data.messages.length) || 0));
    return;
  }
  var last = imgs[imgs.length - 1];
  ok(
    '图片气泡有 src',
    String(last.imageSrc || last.mediaSrc || '').slice(0, 64)
  );

  // 关键缩略图尺寸（对齐 App ~220px；禁止 1px 小蓝点）
  var nodes = await page.$$('image.chat-image');
  if (!nodes || !nodes.length) {
    fail('chat-image 节点', 'missing');
  } else {
    var el = nodes[nodes.length - 1];
    var size = null;
    try {
      size = await el.size();
    } catch (e) {
      size = null;
    }
    if (size && size.width != null && size.height != null) {
      if (size.width >= 100 && size.height >= 100) {
        ok('缩略图可见尺寸', 'w=' + size.width + ' h=' + size.height);
      } else {
        fail(
          '缩略图过小（像小蓝点）',
          'w=' + size.width + ' h=' + size.height
        );
      }
    } else {
      fail('缩略图尺寸', 'size API unavailable');
    }
  }

  var mxc = (last.attachment && last.attachment.mxc) || '';
  if (!mxc) {
    fail('图片无 mxc', JSON.stringify(last.attachment || {}));
    return;
  }
  ok('图片 mxc', mxc.slice(0, 48));

  var dl = await mp.evaluate(function (uri) {
    var session = require('services/session');
    var media = require('services/matrixMedia');
    var snap = session.snapshot();
    return media
      .downloadToTemp({
        homeserver: snap.homeserver || snap.nodeOrigin || '',
        accessToken: snap.accessToken || '',
        mxc: uri,
        mimetype: 'image/png',
      })
      .then(function (p) {
        return { ok: true, path: String(p || '') };
      })
      .catch(function (err) {
        return {
          ok: false,
          err: (err && err.message) || String(err),
          status: err && err.statusCode,
        };
      });
  }, mxc);

  if (dl && dl.ok && dl.path) {
    ok('downloadToTemp 成功', dl.path.slice(0, 60));
  } else {
    fail(
      'downloadToTemp 失败',
      (dl && (dl.err || JSON.stringify(dl))) || 'unknown'
    );
  }

  // 点开展览：调用页面方法（wx.previewImage）
  try {
    await page.callMethod('onPreviewImage', {
      currentTarget: {
        dataset: { src: last.imageSrc || last.mediaSrc },
      },
    });
    ok('触发预览 onPreviewImage', 'ok');
  } catch (e) {
    fail('触发预览 onPreviewImage', e && e.message);
  }
}

async function assertMedia(page) {
  // 先尽量拉历史，用户截图里的失败媒体常在更早气泡
  for (var round = 0; round < 8; round++) {
    var d0 = await page.data();
    var has = (d0.displayMessages || d0.messages || []).some(function (m) {
      return m && (m.isImage || m.isVideo);
    });
    if (has) break;
    if (!d0.hasMore) break;
    try {
      await page.callMethod('onLoadOlder');
    } catch (e) {
      break;
    }
    await sleep(1200);
  }

  const data = await page.data();
  const list = data.displayMessages || data.messages || [];
  const mediaItems = list.filter(function (m) {
    return m && (m.isImage || m.isVideo);
  });
  if (!mediaItems.length) {
    ok('媒体气泡', '本会话已加载范围内无图片/视频，跳过载入断言');
    return;
  }
  ok('媒体气泡', 'count=' + mediaItems.length);

  var end = Date.now() + 25000;
  var lastFailed = 0;
  var lastOk = 0;
  var lastPending = 0;
  var retried = false;
  while (Date.now() < end) {
    await sleep(800);
    try {
      await page.callMethod('refresh');
    } catch (e) {
      /* ignore */
    }
    const d = await page.data();
    const rows = d.displayMessages || d.messages || [];
    lastFailed = 0;
    lastOk = 0;
    lastPending = 0;
    var firstFailedMxc = '';
    for (var i = 0; i < rows.length; i++) {
      var m = rows[i];
      if (!m || !(m.isImage || m.isVideo)) continue;
      if (m.imageSrc || m.mediaSrc) lastOk++;
      else if (m.mediaFailed) {
        lastFailed++;
        if (!firstFailedMxc && m.attachment && m.attachment.mxc) {
          firstFailedMxc = m.attachment.mxc;
        }
      } else if (m.mediaPending) lastPending++;
    }
    if (lastFailed === 0 && lastPending === 0 && lastOk > 0) break;
    if (lastFailed > 0 && lastPending === 0 && !retried && firstFailedMxc) {
      retried = true;
      try {
        await page.callMethod('onRetryMedia', {
          currentTarget: { dataset: { mxc: firstFailedMxc } },
        });
      } catch (e) {
        /* ignore */
      }
    }
  }

  console.log(
    '[INFO] media ok=' +
      lastOk +
      ' pending=' +
      lastPending +
      ' failed=' +
      lastFailed
  );
  if (lastOk > 0 && lastFailed === 0) {
    ok('媒体载入', 'ok=' + lastOk);
  } else if (lastFailed > 0) {
    fail(
      '媒体仍载入失败',
      'ok=' + lastOk + ' failed=' + lastFailed + ' pending=' + lastPending
    );
  } else if (lastPending > 0) {
    fail('媒体一直 pending', 'pending=' + lastPending);
  } else {
    fail('媒体无结果', 'ok=0 failed=0');
  }
}

(async function main() {
  var creds;
  try {
    creds = loadCreds();
  } catch (e) {
    console.error(e.message || e);
    process.exit(2);
  }
  console.log('Connecting DevTools automator…');
  const mp = await connect();
  try {
    await ensureSignedIn(mp, creds);
    const opened = await openRoom(mp);
    if (
      !opened.page ||
      String(opened.page.path || '').indexOf('messages/room') < 0
    ) {
      fail('打开会话页', opened.page && opened.page.path);
      process.exit(1);
    }
    ok(
      '打开会话页',
      opened.page.path +
        ' name=' +
        (opened.roomName || '') +
        ' encrypted=' +
        opened.encrypted
    );

    await assertComposer(opened.page);
    await assertSend(mp, opened.page);
    // 真发图片 + downloadToTemp（覆盖「图片载入失败」修复路径）
    await assertMediaRoundtrip(mp, opened.page, opened.roomId);
    // 历史附件（若有）
    await assertMedia(opened.page);
  } finally {
    try {
      mp.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  var failed = 0;
  console.log('\n=== 私信 composer/media 联调 ===');
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
