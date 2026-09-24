/**
 * 会话页键盘顶栏修复 · 本地联调（需 npm run devtools / auto-port 9420）
 * 不依赖登录：打开房间页后模拟 keyboardheightchange，核对高度与 kb-open。
 */
const automator = require('miniprogram-automator');

const WS = process.env.MUUZI_WX_AUTO_WS || 'ws://127.0.0.1:9420';

function sleep(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

function ok(name, detail) {
  console.log('[PASS]', name, detail || '');
}
function fail(name, detail) {
  console.error('[FAIL]', name, detail || '');
}

(async function main() {
  console.log('Connecting', WS);
  const mp = await automator.connect({ wsEndpoint: WS });
  var failed = 0;
  try {
    // 注入房号，避免空 roomId 立刻 navigateBack（不依赖 Matrix 同步）
    await mp.evaluate(function () {
      var deepLink = require('services/messageDeepLink');
      deepLink.stashRoomId('!keyboard-verify:im.muuzi.co');
    });
    await mp.reLaunch(
      '/pages/messages/room/index?rid=' +
        Buffer.from('!keyboard-verify:im.muuzi.co', 'utf8').toString('hex')
    );
    await sleep(2000);
    var page = await mp.currentPage();
    if (!page || String(page.path || '').indexOf('messages/room') < 0) {
      // 过期 token 可能先踢到登录；仍尝试 navigateTo
      await mp.evaluate(function () {
        var deepLink = require('services/messageDeepLink');
        deepLink.stashRoomId('!keyboard-verify:im.muuzi.co');
      });
      try {
        await mp.navigateTo(
          '/pages/messages/room/index?rid=' +
            Buffer.from('!keyboard-verify:im.muuzi.co', 'utf8').toString('hex')
        );
      } catch (e) {
        /* ignore */
      }
      await sleep(2000);
      page = await mp.currentPage();
    }
    if (!page || String(page.path || '').indexOf('messages/room') < 0) {
      fail('打开会话页', page && page.path);
      process.exit(1);
    }
    ok('打开会话页', page.path);

    const before = await page.data();
    if (before.keyboardHeight !== 0 && before.keyboardHeight !== undefined) {
      fail('初始 keyboardHeight', String(before.keyboardHeight));
      failed++;
    } else {
      ok('初始 keyboardHeight', String(before.keyboardHeight || 0));
    }

    await page.callMethod('onKeyboardHeight', { detail: { height: 336 } });
    await sleep(400);
    const raised = await page.data();
    if (raised.keyboardHeight !== 336) {
      fail('升起 keyboardHeight', String(raised.keyboardHeight));
      failed++;
    } else {
      ok('升起 keyboardHeight', '336');
    }

    const root = await page.$('.chat-page');
    if (root) {
      const style = await root.attribute('style');
      if (String(style || '').indexOf('336px') >= 0) {
        ok('chat-page padding-bottom', style);
      } else {
        fail('chat-page padding-bottom', style);
        failed++;
      }
    } else {
      fail('chat-page 节点', 'missing');
      failed++;
    }

    const composer = await page.$('.chat-composer');
    if (composer) {
      const cls = await composer.attribute('class');
      if (String(cls || '').indexOf('kb-open') >= 0) {
        ok('composer kb-open', cls);
      } else {
        fail('composer kb-open', cls);
        failed++;
      }
    } else {
      fail('composer 节点', 'missing');
      failed++;
    }

    const ta = await page.$('textarea.chat-input');
    if (ta) {
      ok('textarea.chat-input', 'present');
    } else {
      fail('textarea.chat-input', 'missing');
      failed++;
    }

    await page.callMethod('onKeyboardHeight', { detail: { height: 0 } });
    await sleep(400);
    const dismissed = await page.data();
    if (dismissed.keyboardHeight !== 0) {
      fail('收起 keyboardHeight', String(dismissed.keyboardHeight));
      failed++;
    } else {
      ok('收起 keyboardHeight', '0');
    }

    const composer2 = await page.$('.chat-composer');
    if (composer2) {
      const cls2 = await composer2.attribute('class');
      if (String(cls2 || '').indexOf('kb-open') < 0) {
        ok('composer 去掉 kb-open', cls2);
      } else {
        fail('composer 去掉 kb-open', cls2);
        failed++;
      }
    }

    // 会话态探测（过期也不阻断键盘断言）
    const session = await mp.evaluate(function () {
      var s = require('services/session');
      var snap = s.snapshot();
      return {
        user: snap.matrixUserId || '',
        hasToken: !!(snap.accessToken && snap.accessToken.length > 8),
        origin: snap.nodeOrigin || '',
      };
    });
    console.log('[INFO] session', JSON.stringify(session));

    if (failed) {
      console.error('FAILED', failed);
      process.exit(1);
    }
    console.log('ALL PASS');
  } finally {
    try {
      mp.disconnect();
    } catch (e) {
      /* ignore */
    }
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
