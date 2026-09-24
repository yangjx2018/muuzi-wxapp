const nodeService = require('../../../../services/node');
const rules = require('../../../../services/rules');
const guduu = require('../../../../services/guduu-auth');
const authFlow = require('../../../../services/auth-flow');

const RESEND = 60;

Page({
  data: {
    email: '',
    code: '',
    left: RESEND,
    error: '',
    ready: false,
  },

  onShow() {
    const flow = authFlow.get();
    if (!flow.email || !flow.nodeDomain) {
      wx.redirectTo({ url: '/pages/auth/join/index' });
      return;
    }
    this.setData({ email: flow.email, left: RESEND });
    this.tick();
    this.refreshReady();
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer);
  },

  tick() {
    if (this._timer) clearTimeout(this._timer);
    if (this.data.left <= 0) return;
    const self = this;
    this._timer = setTimeout(function () {
      self.setData({ left: self.data.left - 1 });
      self.tick();
    }, 1000);
  },

  refreshReady() {
    this.setData({ ready: rules.validCode(this.data.code) });
  },

  onCode(e) {
    const v = String(e.detail.value || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    this.setData({ code: v, error: '' });
    this.refreshReady();
  },

  onSubmit() {
    if (!this.data.ready) return;
    authFlow.setCode(this.data.code);
    wx.navigateTo({ url: '/pages/auth/join/password/index' });
  },

  async onResend() {
    if (this.data.left > 0) return;
    const flow = authFlow.get();
    try {
      const node = nodeService.resolveNode(flow.nodeDomain);
      await guduu.requestEmailCode(node, 'register', flow.email);
      this.setData({ left: RESEND, code: '', error: '' });
      this.refreshReady();
      this.tick();
    } catch (err) {
      this.setData({ error: err.message || '验证码发送失败' });
    }
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/auth/join/index' }) });
  },
});
