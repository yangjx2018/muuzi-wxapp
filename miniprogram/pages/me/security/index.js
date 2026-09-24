const session = require('../../../services/session');
const accountSecurity = require('../../../services/accountSecurity');
const rules = require('../../../services/rules');
const authFlow = require('../../../services/auth-flow');

Page({
  data: {
    available: null,
    error: '',
    oldPassword: '',
    password: '',
    confirmation: '',
    busy: false,
    ready: false,
    nodeLabel: '',
    userId: '',
  },
  _alive: true,

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    var snap = session.snapshot();
    this.setData({
      nodeLabel:
        (snap.node && (snap.node.company_name || snap.node.brandName)) ||
        snap.nodeDomain ||
        '',
      userId: snap.matrixUserId || '',
    });
    this.probe();
  },
  onUnload() {
    this._alive = false;
  },

  goBack() {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/me/index' });
      },
    });
  },

  probe() {
    var self = this;
    this.setData({ available: null, error: '' });
    accountSecurity
      .canChangePassword()
      .then(function (ok) {
        if (!self._alive) return;
        self.setData({ available: ok });
        self.refreshReady();
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          available: null,
          error: (err && err.message) || '无法读取账号安全状态',
        });
      });
  },

  refreshReady() {
    var d = this.data;
    var ready =
      d.available === true &&
      !!d.oldPassword &&
      rules.validNewPassword(d.password) &&
      d.password === d.confirmation &&
      d.password !== d.oldPassword &&
      !d.busy;
    this.setData({ ready: ready });
  },

  onOld(e) {
    this.setData({ oldPassword: e.detail.value, error: '' });
    this.refreshReady();
  },
  onPassword(e) {
    this.setData({ password: e.detail.value, error: '' });
    this.refreshReady();
  },
  onConfirm(e) {
    this.setData({ confirmation: e.detail.value, error: '' });
    this.refreshReady();
  },

  submit() {
    var self = this;
    if (!this.data.ready) return;
    this.setData({ busy: true, error: '', ready: false });
    accountSecurity
      .changePassword(this.data.oldPassword, this.data.password)
      .then(function () {
        if (!self._alive) return;
        wx.showToast({ title: '请重新登录', icon: 'none' });
        wx.reLaunch({ url: '/pages/auth/login/index' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          oldPassword: '',
          password: '',
          confirmation: '',
          error: (err && err.message) || '修改失败',
        });
        self.refreshReady();
      });
  },

  goRecover() {
    var snap = session.snapshot();
    try {
      authFlow.reset();
      if (snap.nodeDomain) authFlow.setNodeDomain(snap.nodeDomain);
    } catch (e) {
      /* ignore */
    }
    wx.navigateTo({ url: '/pages/auth/recover/index' });
  },
});
