const session = require('../../../services/session');
const creator = require('../../../services/creator');
const studioLinks = require('../../../services/studioLinks');

Page({
  data: {
    loading: true,
    busy: false,
    error: '',
    note: '',
    slug: '',
    canCustomize: false,
    canChange: false,
    nextChangeAt: '',
    currentLabel: '',
    policySlug: '',
  },
  _alive: true,
  _token: '',
  _policySlug: '',

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    this.load();
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

  load() {
    var self = this;
    self.setData({ loading: true, error: '', note: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return creator.fetchSlugPolicy(opened.token);
      })
      .then(function (policy) {
        if (!self._alive) return;
        self._policySlug = (policy && policy.slug) || '';
        self.setData({
          loading: false,
          slug: self._policySlug,
          canCustomize: !!(policy && policy.can_customize),
          canChange: !!(policy && policy.can_change),
          nextChangeAt: policy && policy.next_change_at
            ? String(policy.next_change_at)
            : '',
          currentLabel: self._policySlug
            ? 'muuzi.co/' + self._policySlug
            : '尚未设定',
          policySlug: self._policySlug,
        });
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          loading: false,
          error: '无法读取地址设置，请稍后重试',
        });
      });
  },

  onSlug(e) {
    this.setData({ slug: e.detail.value });
  },

  save() {
    var self = this;
    if (!this._token || this.data.busy || !this.data.canChange) return;
    var slug = String(this.data.slug || '')
      .trim()
      .toLowerCase();
    if (!slug || slug === this._policySlug) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .registerSlug(this._token, slug)
      .then(function () {
        return creator.fetchSlugPolicy(self._token);
      })
      .then(function (policy) {
        if (!self._alive) return;
        self._policySlug = (policy && policy.slug) || slug;
        self.setData({
          busy: false,
          slug: self._policySlug,
          policySlug: self._policySlug,
          canCustomize: !!(policy && policy.can_customize),
          canChange: !!(policy && policy.can_change),
          nextChangeAt:
            policy && policy.next_change_at
              ? String(policy.next_change_at)
              : '',
          currentLabel: 'muuzi.co/' + self._policySlug,
          note: '主页地址已更新，下次可在 30 天后修改',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '保存失败',
        });
      });
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/me/membership/index' });
  },

  copyStudio() {
    studioLinks.copyLink('studio').then(
      function () {
        wx.showToast({ title: '已复制 Studio', icon: 'success' });
      },
      function (err) {
        wx.showToast({
          title: (err && err.message) || '复制失败',
          icon: 'none',
        });
      }
    );
  },
});
