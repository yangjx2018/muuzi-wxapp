/**
 * 私信图片缩略图必须「看得见、点得开」· DevTools 联调
 * 不依赖真实 Matrix 登录：本地写入 320×240 PNG，注入气泡后量尺寸。
 * 前置：npm run devtools（auto-port 9420）
 */
const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';
const PROJECT = path.join(__dirname, '..');
const FIXTURE = path.join(PROJECT, 'scripts/fixtures/verify-chat-image.png');
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
  if (!fs.existsSync(FIXTURE)) {
    console.error('missing fixture', FIXTURE);
    process.exit(2);
  }
  const b64 = fs.readFileSync(FIXTURE).toString('base64');
  console.log('Connecting', WS);
  const mp = await automator.connect({ wsEndpoint: WS });
  try {
    // 假会话：挡住 requireSignedInOrRedirect，但不依赖真 token
    await mp.evaluate(function () {
      var nodeService = require('services/node');
      var session = require('services/session');
      var node = nodeService.resolveNode('im.muuzi.co');
      session.beginSession(node, {
        access_token: 'verify-thumb-token',
        user_id: '@verify-thumb:im.muuzi.co',
        device_id: 'VERIFYTHUMB',
      });
    });

    var localPath = await mp.evaluate(function (payload) {
      var fsApi = wx.getFileSystemManager();
      var filePath = wx.env.USER_DATA_PATH + '/verify-thumb-visible.png';
      fsApi.writeFileSync(filePath, wx.base64ToArrayBuffer(payload));
      return filePath;
    }, b64);
    ok('写入 320×240 PNG', localPath);

    await mp.evaluate(function () {
      var deepLink = require('services/messageDeepLink');
      deepLink.stashRoomId('!thumb-verify:im.muuzi.co');
    });
    await mp.reLaunch(
      '/pages/messages/room/index?rid=' +
        Buffer.from('!thumb-verify:im.muuzi.co', 'utf8').toString('hex')
    );
    await sleep(2500);
    var page = await mp.currentPage();
    if (!page || String(page.path || '').indexOf('messages/room') < 0) {
      fail('打开会话页', page && page.path);
      process.exit(1);
    }
    ok('打开会话页', page.path);

    // 注入可见图片气泡（绕过 sync，只验渲染尺寸 + 预览入口）
    await page.setData({
      ready: true,
      name: '缩略图复验',
      empty: false,
      encrypted: false,
      statusBarPx: 47,
      messages: [
        {
          id: 'img1',
          eventId: '$img1',
          own: true,
          body: '[图片]',
          isImage: true,
          imageSrc: localPath,
          mediaSrc: localPath,
          attachment: {
            kind: 'image',
            mxc: 'mxc://im.muuzi.co/thumbverify1',
            name: 'verify.png',
            width: 320,
            height: 240,
          },
          timeLabel: '00:00',
          senderLabel: '我',
          senderGlyph: '我',
        },
      ],
      displayMessages: [
        {
          id: 'img1',
          eventId: '$img1',
          own: true,
          body: '[图片]',
          isImage: true,
          imageSrc: localPath,
          mediaSrc: localPath,
          attachment: {
            kind: 'image',
            mxc: 'mxc://im.muuzi.co/thumbverify1',
            name: 'verify.png',
            width: 320,
            height: 240,
          },
          timeLabel: '00:00',
          senderLabel: '我',
          senderGlyph: '我',
        },
      ],
    });
    await sleep(800);

    var nodes = await page.$$('image.chat-image');
    if (!nodes || !nodes.length) {
      fail('chat-image 节点', 'missing — 图片未渲染');
    } else {
      ok('chat-image 节点', 'count=' + nodes.length);
      var size = await nodes[0].size();
      if (size && size.width >= 100 && size.height >= 100) {
        ok('缩略图可见尺寸', 'w=' + size.width + ' h=' + size.height);
      } else {
        fail(
          '缩略图过小（小蓝点）',
          size ? 'w=' + size.width + ' h=' + size.height : 'no size'
        );
      }
      var mode = await nodes[0].attribute('mode');
      if (String(mode || '') === 'aspectFill') ok('mode=aspectFill', mode);
      else fail('mode=aspectFill', mode);
    }

    // CSS 门禁：源码已固定 min 200rpx / 440rpx（与 App 220px 对齐）
    var wxss = fs.readFileSync(
      path.join(PROJECT, 'miniprogram/pages/messages/room/index.wxss'),
      'utf8'
    );
    if (/min-width:\s*200rpx/.test(wxss) && /width:\s*440rpx/.test(wxss)) {
      ok('样式对齐 App 缩略图框', '440rpx / min 200rpx');
    } else {
      fail('样式对齐 App 缩略图框', 'missing min size');
    }

    try {
      await page.callMethod('onPreviewImage', {
        currentTarget: { dataset: { src: localPath } },
      });
      ok('可调用预览放大', 'onPreviewImage');
    } catch (e) {
      fail('可调用预览放大', e && e.message);
    }
  } finally {
    try {
      mp.disconnect();
    } catch (e) {
      /* ignore */
    }
  }

  var failed = 0;
  console.log('\n=== 私信图片缩略图联调 ===');
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
