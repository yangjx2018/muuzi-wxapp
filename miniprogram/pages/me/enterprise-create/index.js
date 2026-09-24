/**
 * 开通企业版 · 1:1 对齐 App EnterpriseCreateScreen（from=app）
 */
const session = require('../../../services/session');
const creator = require('../../../services/creator');
const enterpriseOrg = require('../../../services/enterpriseOrganization');
const studioLinks = require('../../../services/studioLinks');
const store = require('../../../adapters/secure-store');

var SPACE_KEY = 'me_space_org_id';

Page({
  data: {
    busy: false,
    error: '',
    nodeDomain: '',
    instanceId: '',
    name: '',
    slug: '',
    organization: null,
    orgReadyLabel: '',
    linked: false,
    linkedOrgId: '',
    studioHost: '',
  },
  _alive: true,

  onLoad() {
    this._alive = true;
    var snap = session.snapshot();
    this.setData({
      nodeDomain: snap.nodeDomain || '',
      instanceId: snap.instanceId != null ? String(snap.instanceId) : '',
      studioHost: studioLinks.displayHost(studioLinks.studioUrl()),
    });
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
  },

  onUnload() {
    this._alive = false;
  },

  goBack() {
    wx.navigateBack({
      fail: function () {
        wx.navigateTo({
          url: '/pages/me/spaces/index',
          fail: function () {
            wx.switchTab({ url: '/pages/me/index' });
          },
        });
      },
    });
  },

  onNameInput(e) {
    this.setData({ name: (e.detail && e.detail.value) || '', error: '' });
  },

  onSlugInput(e) {
    this.setData({ slug: (e.detail && e.detail.value) || '', error: '' });
  },

  create() {
    var self = this;
    if (this.data.busy) return;
    var snap = session.snapshot();
    this.setData({ busy: true, error: '' });
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return creator.nodeOrganizationsReadiness(opened.token).then(function (
          readiness
        ) {
          if (!readiness || !readiness.enabled) {
            throw new Error('当前节点的企业空间尚未开放，请稍后再试。');
          }
          return enterpriseOrg.createEnterpriseOrganization(
            snap,
            self.data.name
          );
        });
      })
      .then(function (org) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          organization: org,
          orgReadyLabel:
            '已核对：' + org.name + '（' + String(org.org_id) + '）',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '创建未完成，请重新核对',
        });
      });
  },

  link() {
    var self = this;
    if (this.data.busy || !this.data.organization) return;
    var slug = String(this.data.slug || '').trim();
    if (!slug) {
      this.setData({ error: '请填写企业主页地址' });
      return;
    }
    var snap = session.snapshot();
    this.setData({ busy: true, error: '' });
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return creator.linkNodeOrganization(
          opened.token,
          self.data.organization.org_id,
          slug
        );
      })
      .then(function (result) {
        if (!self._alive) return;
        var orgId =
          (result && result.org && result.org.id) ||
          (result && result.id) ||
          '';
        if (orgId) {
          try {
            store.set(SPACE_KEY, String(orgId));
          } catch (e) {
            /* ignore */
          }
        }
        self.setData({
          busy: false,
          linked: true,
          linkedOrgId: String(orgId),
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '企业主页关联未完成',
        });
      });
  },

  goEditHome() {
    var id = this.data.linkedOrgId;
    if (!id) return;
    wx.redirectTo({
      url: '/pages/me/edit-home/index?org=' + encodeURIComponent(id),
    });
  },

  goMembers() {
    var id = this.data.linkedOrgId;
    if (!id) return;
    wx.redirectTo({
      url: '/pages/me/org-members/index?org=' + encodeURIComponent(id),
    });
  },
});
