/**
 * 完整联调：本地 bot 微信登录 → 绑定 → 二次一键登录。
 * 凭据由自动化 callMethod('runWithCreds', creds) 注入，勿写进源码。
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
    const lines = this.data.lines.concat([String(line)]);
    this.setData({ lines: lines });
    console.log('[WX_E2E] ' + line);
  },

  onLoad() {
    if (devGuard.blockIfNotDevelop()) return;
    const self = this;
    this._started = false;
    try {
      const raw = wx.getStorageSync('e2e_local_creds');
      if (raw && raw.account && raw.password) {
        self.runWithCreds(raw);
        return;
      }
    } catch (e) {
      /* ignore */
    }
    setTimeout(function () {
      if (!self._started) {
        self.append('等待自动化注入凭据…');
      }
    }, 1500);
  },

  /** 自动化可传对象或 JSON 字符串 */
  runWithCreds(creds) {
    if (this._started) return;
    let value = creds;
    if (typeof creds === 'string') {
      try {
        value = JSON.parse(creds);
      } catch (e) {
        this.append('creds json 无效');
        return;
      }
    }
    this._started = true;
    this.run(value || {});
  },

  async run(creds) {
    const account = String(creds.account || '').trim();
    const password = String(creds.password || '');
    const domain = String(creds.nodeDomain || '127.0.0.1:9000');
    if (!account || !password) {
      this.append('缺少 account/password');
      this.finish(false, { error: 'missing_creds' });
      return;
    }

    session.clearLocal();
    authFlow.reset();
    this.append('phase1 wechat → bind_required');

    let node;
    try {
      node = nodeService.resolveNode(domain);
    } catch (e) {
      this.append('node_fail ' + e.message);
      this.finish(false);
      return;
    }

    let first;
    try {
      first = await wechat.loginWithWeChat(node);
      this.append('session1 status=' + (first && first.status));
    } catch (e) {
      // 本地 Docker DNS 偶发失败时再试一次
      this.append('session1_retry ' + e.message);
      try {
        first = await wechat.loginWithWeChat(node);
        this.append('session1 status=' + (first && first.status));
      } catch (e2) {
        this.append('session1_fail ' + e2.message);
        this.finish(false, { error: e2.message });
        return;
      }
    }

    if (first.status === 'authenticated') {
      session.beginSession(node, first);
      this.append('already_bound user=' + first.user_id);
      await this.phase2(node);
      return;
    }

    if (first.status !== 'bind_required' || !first.bind_token) {
      this.append('unexpected ' + JSON.stringify(first || {}));
      this.finish(false);
      return;
    }

    this.append('phase1b bind account');
    let bound;
    try {
      bound = await wechat.bindAccount(node, first.bind_token, 'account_password', {
        account: account,
        password: password,
      });
      this.append('bind status=' + (bound && bound.status) + ' user=' + (bound && bound.user_id));
    } catch (e) {
      this.append('bind_fail ' + e.message + ' code=' + (e.code || ''));
      this.finish(false, { error: e.message, code: e.code || '' });
      return;
    }

    if (bound.status !== 'authenticated' || !bound.access_token) {
      this.finish(false, { error: 'bind_incomplete' });
      return;
    }
    session.beginSession(node, bound);
    this.append('phase1 ok signed_in');
    // 产品路径复验：绑定成功后应进入连接 Tab
    try {
      session.enterDefaultTab();
      this.append('nav_after_bind requested');
    } catch (e) {
      this.append('nav_after_bind_fail ' + e.message);
    }

    await this.phase2(node);
  },

  async phase2(node) {
    this.append('phase2 clear + wechat again');
    session.clearLocal();
    authFlow.reset();
    let second;
    try {
      second = await wechat.loginWithWeChat(node);
    } catch (e) {
      this.append('session2_retry ' + e.message);
      try {
        second = await wechat.loginWithWeChat(node);
      } catch (e2) {
        this.append('session2_fail ' + e2.message);
        this.finish(false, { error: e2.message });
        return;
      }
    }
    this.append(
      'session2 status=' + (second && second.status) + ' user=' + (second && second.user_id)
    );
    if (second.status === 'authenticated' && second.access_token && second.user_id) {
      session.beginSession(node, second);
      this.finish(true, {
        status: 'authenticated',
        user_id: second.user_id,
        rebound: true,
      });
      return;
    }
    this.finish(false, {
      error: 'second_not_authenticated',
      status: second && second.status,
    });
  },

  finish(ok, extra) {
    const payload = Object.assign({ ok: ok, done: true }, extra || {});
    console.log('[WX_E2E_DONE] ' + JSON.stringify(payload));
    this.setData({ done: true, ok: ok });
  },
});
