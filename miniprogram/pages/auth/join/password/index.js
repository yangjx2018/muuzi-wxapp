const nodeService = require('../../../../services/node');
const rules = require('../../../../services/rules');
const guduu = require('../../../../services/guduu-auth');
const wechat = require('../../../../services/wechat-login');
const authFlow = require('../../../../services/auth-flow');
const session = require('../../../../services/session');

Page({
  data: {
    username: '',
    password: '',
    confirmation: '',
    showPassword: false,
    showConfirm: false,
    busy: false,
    error: '',
    ready: false,
    strong: false,
    matches: false,
  },

  onShow() {
    const flow = authFlow.get();
    if (!flow.email || !flow.code || !flow.nodeDomain) {
      wx.redirectTo({ url: '/pages/auth/join/index' });
    }
  },

  refreshReady() {
    const d = this.data;
    const strong = rules.validNewPassword(d.password);
    const matches = d.password.length > 0 && d.password === d.confirmation;
    const nameOk = rules.validUsername(d.username);
    this.setData({
      strong: strong,
      matches: matches,
      ready: strong && matches && nameOk && !d.busy,
    });
  },

  onUsername(e) {
    this.setData({ username: String(e.detail.value || '').toLowerCase(), error: '' });
    this.refreshReady();
  },

  onPassword(e) {
    this.setData({ password: e.detail.value, error: '' });
    this.refreshReady();
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleConfirm() {
    this.setData({ showConfirm: !this.data.showConfirm });
  },

  onConfirm(e) {
    this.setData({ confirmation: e.detail.value, error: '' });
    this.refreshReady();
  },

  async onSubmit() {
    if (!this.data.ready) return;
    const flow = authFlow.get();
    this.setData({ busy: true, error: '' });
    this.refreshReady();
    try {
      const node = nodeService.resolveNode(flow.nodeDomain);
      const username = this.data.username;
      const password = this.data.password;
      // 微信「建立新账号」路径会留下 bind_token；reset 前先取出
      const bindToken = flow.bindToken || '';
      const result = await guduu.registerAtNode(
        node,
        flow.email,
        flow.code,
        username,
        password
      );
      session.beginSession(node, result);
      authFlow.reset();
      // 对齐 App PasswordScreen / 登录页：先进连接 Tab，Creator 后台换票
      session.enterDefaultTab();
      session.ensureCreatorSession().catch(function () {});
      if (bindToken) {
        wechat
          .bindAccount(node, bindToken, 'account_password', {
            account: username,
            password: password,
          })
          .then(function (bound) {
            if (
              bound &&
              bound.status === 'authenticated' &&
              bound.access_token &&
              bound.user_id
            ) {
              session.beginSession(node, bound);
            }
          })
          .catch(function () {
            /* 绑定失败不挡登录；用户可稍后用微信重新绑定 */
          });
      }
    } catch (err) {
      this.setData({ error: err.message || '注册失败', busy: false });
      this.refreshReady();
    }
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/auth/join/verify/index' }) });
  },
});
