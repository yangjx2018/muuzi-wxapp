/**
 * 本地 bot 微信登录冒烟：打开本页即自动跑一轮，结果打到 console。
 * 路径：pages/dev/wechat-login-smoke/index
 */
const nodeService = require('../../../services/node');
const wechat = require('../../../services/wechat-login');
const session = require('../../../services/session');
const authFlow = require('../../../services/auth-flow');
const devGuard = require('../../../utils/devGuard');

Page({
  data: {
    lines: [],
    done: false,
    ok: false,
  },

  append(line) {
    const lines = this.data.lines.concat([line]);
    this.setData({ lines: lines });
    console.log('[WX_SMOKE] ' + line);
  },

  onLoad() {
    if (devGuard.blockIfNotDevelop()) return;
    const self = this;
    setTimeout(function () {
      self.run();
    }, 600);
  },

  async run() {
    session.clearLocal();
    this.append('start');
    let node;
    try {
      node = nodeService.resolveNode('127.0.0.1:9000');
      this.append('node=' + node.nodeOrigin);
    } catch (e) {
      this.append('node_fail ' + (e.message || e));
      this.finish(false);
      return;
    }

    try {
      const caps = await wechat.capabilities(node);
      this.append(
        'caps available=' +
          caps.available +
          ' appid=' +
          (caps.appid || '')
      );
      if (!caps.available) {
        this.finish(false);
        return;
      }
    } catch (e) {
      this.append('caps_fail ' + (e.message || e) + ' status=' + (e.statusCode || ''));
      this.finish(false);
      return;
    }

    try {
      const result = await wechat.loginWithWeChat(node);
      this.append('session status=' + (result && result.status));
      if (result && result.status === 'authenticated') {
        session.beginSession(node, result);
        this.append('authenticated user=' + (result.user_id || ''));
        this.finish(true, { status: 'authenticated', user_id: result.user_id });
        return;
      }
      if (result && result.status === 'bind_required' && result.bind_token) {
        authFlow.setBindToken(result.bind_token);
        authFlow.setNodeDomain(node.domain);
        this.append('bind_required');
        this.finish(true, { status: 'bind_required' });
        return;
      }
      this.append('unexpected ' + JSON.stringify(result || {}));
      this.finish(false);
    } catch (e) {
      this.append('login_fail ' + (e.message || e) + ' status=' + (e.statusCode || ''));
      this.finish(false, { error: e.message || String(e), statusCode: e.statusCode || 0 });
    }
  },

  finish(ok, extra) {
    const payload = Object.assign({ ok: ok, done: true }, extra || {});
    console.log('[WX_SMOKE_DONE] ' + JSON.stringify(payload));
    this.setData({ done: true, ok: ok });
  },
});
