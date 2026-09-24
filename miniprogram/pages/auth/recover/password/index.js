const nodeService = require('../../../../services/node');
const rules = require('../../../../services/rules');
const guduu = require('../../../../services/guduu-auth');
const authFlow = require('../../../../services/auth-flow');
const session = require('../../../../services/session');

Page({
  data: {
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
      wx.redirectTo({ url: '/pages/auth/recover/index' });
    }
  },

  refreshReady() {
    const d = this.data;
    const strong = rules.validNewPassword(d.password);
    const matches = d.password.length > 0 && d.password === d.confirmation;
    this.setData({
      strong: strong,
      matches: matches,
      ready: strong && matches && !d.busy,
    });
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
      await guduu.resetPasswordAtNode(node, flow.email, flow.code, this.data.password);
      session.clearLocal();
      authFlow.reset();
      authFlow.setNotice('密码已更新，请用新密码登录。');
      wx.reLaunch({ url: '/pages/auth/login/index' });
    } catch (err) {
      this.setData({ error: err.message || '操作失败', busy: false });
      this.refreshReady();
    }
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/auth/recover/verify/index' }) });
  },
});
