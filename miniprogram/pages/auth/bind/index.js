const nodeService = require('../../../services/node');
const rules = require('../../../services/rules');
const wechat = require('../../../services/wechat-login');
const authFlow = require('../../../services/auth-flow');
const session = require('../../../services/session');

/**
 * 绑定页（兜底）：登录页弹层为主路径；本页保留同款验证失败分支。
 */
Page({
  data: {
    identifier: '',
    password: '',
    showPassword: false,
    busy: false,
    error: '',
    ready: false,
    bindToken: '',
    nodeDomain: '',
    nodeLabel: '',
    expiresHint: '',
    failMode: false,
  },

  onShow() {
    const flow = authFlow.get();
    if (!flow.bindToken || !flow.nodeDomain) {
      wx.redirectTo({ url: '/pages/auth/login/index' });
      return;
    }
    let nodeLabel = flow.nodeDomain;
    try {
      const node = nodeService.resolveNode(flow.nodeDomain);
      nodeLabel = node.brandName || node.domain;
    } catch (e) {
      /* keep domain */
    }
    const prefill = flow.prefillAccount || flow.email || '';
    this.setData({
      bindToken: flow.bindToken,
      nodeDomain: flow.nodeDomain,
      nodeLabel: nodeLabel,
      identifier: prefill,
      expiresHint: '约 5 分钟内有效',
      error: '',
      failMode: false,
    });
    this.refreshReady();
  },

  refreshReady() {
    const d = this.data;
    this.setData({
      ready: rules.validLogin(d.identifier, d.password) && !d.busy,
    });
  },

  onIdentifier(e) {
    this.setData({ identifier: e.detail.value, error: '', failMode: false });
    this.refreshReady();
  },

  onPassword(e) {
    this.setData({ password: e.detail.value, error: '', failMode: false });
    this.refreshReady();
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  async onSubmit() {
    if (!this.data.ready) return;
    this.setData({ busy: true, error: '', failMode: false });
    this.refreshReady();
    console.log('[WECHAT_BIND] submit account=' + this.data.identifier.trim());
    try {
      const node = nodeService.resolveNode(this.data.nodeDomain);
      const result = await wechat.bindAccount(
        node,
        this.data.bindToken,
        'account_password',
        {
          account: this.data.identifier.trim(),
          password: this.data.password,
        }
      );
      if (result.status !== 'authenticated' || !result.access_token || !result.user_id) {
        throw new Error('绑定未完成，请重试');
      }
      console.log('[WECHAT_BIND] ok user=' + result.user_id);
      session.beginSession(node, result);
      authFlow.reset();
      // 先进连接，勿 toast 挡导航、勿等 Creator
      session.enterDefaultTab();
      session.ensureCreatorSession().catch(function () {});
    } catch (err) {
      const friendly = wechat.friendlyError(err);
      const code = err && err.code ? err.code : '';
      console.log('[WECHAT_BIND] fail ' + friendly.message);
      if (
        code === 'BIND_CREDENTIAL_INVALID' ||
        err.statusCode === 401 ||
        err.statusCode === 403 ||
        /不正确|不存在/.test(friendly.message || '')
      ) {
        this.setData({
          failMode: true,
          error: '未找到匹配的账号，或密码不正确。',
          busy: false,
          password: '',
        });
        this.refreshReady();
        return;
      }
      this.setData({
        error: friendly.message,
        busy: false,
      });
      this.refreshReady();
    }
  },

  onRetry() {
    this.setData({ failMode: false, error: '', password: '' });
    this.refreshReady();
  },

  goCreateAccount() {
    wx.navigateTo({ url: '/pages/auth/join/index' });
  },

  goReloginWeChat() {
    authFlow.setBindToken('');
    wx.reLaunch({ url: '/pages/auth/login/index' });
  },
});
