const session = require('../../../services/session');
const creator = require('../../../services/creator');
const store = require('../../../adapters/secure-store');
const studioLinks = require('../../../services/studioLinks');

var SPACE_KEY = 'me_space_org_id';

Page({
  data: {
    phase: 'loading',
    error: '',
    orgs: [],
    orgNames: ['个人空间 · 主理人'],
    selectedIndex: 0,
    selectedId: '',
    title: '个人空间',
    subtitle: '免费主理人 / 主理人 Pro',
    canManage: true,
    isOrg: false,
    orgMembersHint: '',
  },
  _alive: true,
  _orgs: [],
  _pendingOrgId: '',

  onLoad(query) {
    this._pendingOrgId = (query && query.org) || '';
  },

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
    self.setData({ phase: 'loading', error: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        return creator.fetchOrgs(opened.token);
      })
      .then(function (orgs) {
        if (!self._alive) return;
        var active = (orgs || []).filter(function (o) {
          return o.status === 'active';
        });
        self._orgs = active;
        var names = ['个人空间 · 主理人'].concat(
          active.map(function (o) {
            return o.name + ' · 企业空间';
          })
        );
        // 对齐 App ?org=：query 优先于本地记忆
        var preferred = self._pendingOrgId || store.get(SPACE_KEY) || '';
        self._pendingOrgId = '';
        var selectedIndex = 0;
        if (preferred) {
          for (var i = 0; i < active.length; i++) {
            if (active[i].id === preferred) {
              selectedIndex = i + 1;
              break;
            }
          }
        }
        self.applySelection(selectedIndex, names);
        self.setData({ phase: 'ready', orgs: active, orgNames: names });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          phase: 'error',
          error: (err && err.message) || '空间读取失败',
        });
      });
  },

  applySelection(index, names) {
    var org = index > 0 ? this._orgs[index - 1] : null;
    var selectedId = org ? org.id : '';
    if (selectedId) store.set(SPACE_KEY, selectedId);
    else store.remove(SPACE_KEY);
    var canManage =
      !org || org.role === 'owner' || org.role === 'admin';
    var roleLabel = !org
      ? ''
      : org.role === 'owner'
        ? '所有者'
        : org.role === 'admin'
          ? '管理员'
          : '成员';
    var orgMembersHint =
      org && canManage && !(org.features && org.features.org_members)
        ? ' · 需企业 Pro'
        : '';
    this.setData({
      selectedIndex: index,
      selectedId: selectedId,
      isOrg: !!org,
      canManage: canManage,
      orgMembersHint: orgMembersHint,
      title: org ? org.name : '个人空间',
      subtitle: org
        ? ((org.plan && org.plan.name) || '企业') + ' · ' + roleLabel
        : '免费主理人 / 主理人 Pro',
      orgNames: names || this.data.orgNames,
    });
  },

  onPick(e) {
    var index = Number(e.detail.value);
    this.applySelection(index);
  },

  goEditHome() {
    wx.navigateTo({ url: '/pages/me/edit-home/index' });
  },
  goOrgEditHome() {
    var id = this.data.selectedId;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/me/edit-home/index?org=' + encodeURIComponent(id),
    });
  },
  goOrgMembers() {
    var id = this.data.selectedId;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/me/org-members/index?org=' + encodeURIComponent(id),
    });
  },
  goEnterpriseCreate() {
    wx.navigateTo({ url: '/pages/me/enterprise-create/index' });
  },
  goMembership() {
    wx.navigateTo({ url: '/pages/me/membership/index' });
  },
  goAddress() {
    wx.navigateTo({ url: '/pages/me/address/index' });
  },
  goContacts() {
    var url = '/pages/me/contacts/index';
    if (this.data.selectedId) {
      url +=
        '?owner=' + encodeURIComponent('org:' + this.data.selectedId);
    }
    wx.navigateTo({ url: url });
  },
  goCompose() {
    var url = '/pages/me/compose/index';
    if (this.data.selectedId) {
      url +=
        '?owner=' + encodeURIComponent('org:' + this.data.selectedId);
    }
    wx.navigateTo({ url: url });
  },
  goSharing() {
    var url = '/pages/me/sharing/index';
    if (this.data.selectedId) {
      url +=
        '?owner=' + encodeURIComponent('org:' + this.data.selectedId);
    }
    wx.navigateTo({ url: url });
  },
  goAgentAccess() {
    var url = '/pages/me/agent-access/index';
    if (this.data.selectedId) {
      url +=
        '?owner=' + encodeURIComponent('org:' + this.data.selectedId);
    }
    wx.navigateTo({ url: url });
  },
  goEnterpriseInvitations() {
    wx.navigateTo({ url: '/pages/me/enterprise-invitations/index' });
  },
  copyStudio() {
    var url = studioLinks.studioUrl();
    if (this.data.selectedId) {
      url =
        studioLinks.studioOrigin() +
        '/?org=' +
        encodeURIComponent(this.data.selectedId);
    }
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制 Studio', icon: 'success' });
      },
    });
  },
});
