/**
 * 企业成员与邀请 · 1:1 对齐 App OrgMembersScreen
 */
const session = require('../../../services/session');
const creator = require('../../../services/creator');
const studioLinks = require('../../../services/studioLinks');
const store = require('../../../adapters/secure-store');

var SPACE_KEY = 'me_space_org_id';
var ROLE_NAMES = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
};

function mapMembers(list, nodeManaged, viewerRole) {
  return (list || []).map(function (m) {
    var seatHint = '';
    if (nodeManaged && m.role !== 'owner') {
      if (m.seat_status === 'active') seatHint = '已占席位';
      else if (m.seat_id) seatHint = '邀请中';
      else seatHint = '未分配席位';
    }
    var meta = [m.slug, m.title || '', seatHint].filter(Boolean).join(' · ');
    return {
      account_id: m.account_id,
      matrix_user_id: m.matrix_user_id,
      role: m.role,
      roleLabel: ROLE_NAMES[m.role] || m.role,
      display_name: m.display_name || m.matrix_user_id,
      seat_id: m.seat_id || '',
      meta: meta,
      canRelease: nodeManaged && m.role !== 'owner' && !!m.seat_id,
      canInviteSeat:
        nodeManaged && m.role !== 'owner' && !m.seat_id,
      // 对齐 App：非节点模式仅 owner 可移除 admin；admin 不能移除另一 admin
      canRemove:
        !nodeManaged &&
        m.role !== 'owner' &&
        (m.role !== 'admin' || viewerRole === 'owner'),
    };
  });
}

function mapSeatLinks(links) {
  return (links || []).map(function (link) {
    return {
      id: link.id,
      url: creator.seatLinkUrl(link.token),
      expiresLabel:
        (link.expires_at
          ? String(link.expires_at).slice(0, 10)
          : '') + ' 前有效 · 一次性',
    };
  });
}

function mapInvites(invites, nodeManaged) {
  return (invites || []).map(function (item) {
    return {
      code: item.code,
      label: nodeManaged ? item.recipient || item.code : item.code,
      expiresLabel: item.expires_at
        ? String(item.expires_at).slice(0, 10) + ' 前有效'
        : '',
    };
  });
}

function mapCandidates(list) {
  return (list || []).map(function (person) {
    return {
      matrix_user_id: person.matrix_user_id,
      display_name: person.display_name,
      slug: person.slug,
      status: person.status,
      statusLabel:
        person.status === 'member'
          ? '已是员工'
          : person.status === 'invited'
            ? '已邀请'
            : '',
      canInvite: person.status === 'none',
    };
  });
}

Page({
  data: {
    phase: 'loading',
    error: '',
    notice: '',
    busy: false,
    orgId: '',
    orgName: '企业',
    planName: '企业套餐',
    seatsLabel: '',
    canInvite: false,
    nodeManaged: false,
    hasOrgMembersFeature: false,
    seatsAvailable: 0,
    studioUrl: '',
    upgradeHint: '',
    deniedHasOrg: false,
    spacesUrl: '/pages/me/spaces/index',
    seatLinks: [],
    invites: [],
    members: [],
    query: '',
    searching: false,
    candidates: null,
    account: '',
    targetPreview: '',
    targetValid: false,
  },
  _alive: true,
  _token: '',
  _orgId: '',
  _searchTimer: 0,
  _orgRole: '',

  onLoad(query) {
    this._alive = true;
    var orgId = (query && query.org) || '';
    this._orgId = orgId;
    var spacesUrl = orgId
      ? '/pages/me/spaces/index?org=' + encodeURIComponent(orgId)
      : '/pages/me/spaces/index';
    this.setData({
      orgId: orgId,
      spacesUrl: spacesUrl,
      studioUrl: studioLinks.studioOrigin() + '/?org=' + encodeURIComponent(orgId),
    });
    if (orgId) {
      try {
        store.set(SPACE_KEY, orgId);
      } catch (e) {
        /* ignore */
      }
    }
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    if (!this._orgId) {
      this.setData({
        phase: 'error',
        error: '缺少企业编号',
      });
      return;
    }
    this.load();
  },

  onUnload() {
    this._alive = false;
    if (this._searchTimer) clearTimeout(this._searchTimer);
  },

  goBack() {
    var url = this.data.spacesUrl || '/pages/me/spaces/index';
    if (this._orgId) {
      try {
        store.set(SPACE_KEY, this._orgId);
      } catch (e) {
        /* ignore */
      }
    }
    wx.navigateBack({
      fail: function () {
        wx.navigateTo({
          url: url,
          fail: function () {
            wx.switchTab({ url: '/pages/me/index' });
          },
        });
      },
    });
  },

  goSpaces() {
    var url = this.data.spacesUrl || '/pages/me/spaces/index';
    if (this._orgId) {
      try {
        store.set(SPACE_KEY, this._orgId);
      } catch (e) {
        /* ignore */
      }
    }
    wx.redirectTo({
      url: url,
      fail: function () {
        wx.navigateTo({ url: url });
      },
    });
  },

  load() {
    var self = this;
    var orgId = this._orgId;
    self.setData({ phase: 'loading', error: '', notice: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return Promise.all([
          creator.fetchOrgs(opened.token),
          creator.fetchOrgMembers(opened.token, orgId),
        ]);
      })
      .then(function (bundle) {
        if (!self._alive) return;
        var orgs = bundle[0] || [];
        var members = bundle[1] || {};
        var org = null;
        for (var i = 0; i < orgs.length; i++) {
          if (orgs[i].id === orgId && orgs[i].status === 'active') {
            org = orgs[i];
            break;
          }
        }
        if (!org || (org.role !== 'owner' && org.role !== 'admin')) {
          self._orgRole = org ? org.role : '';
          self.setData({
            phase: 'denied',
            orgName: org ? org.name : '企业',
            deniedHasOrg: !!org,
          });
          return;
        }
        self.applyMembers(org, members);
        self.setData({ phase: 'ready' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          phase: 'error',
          error: (err && err.message) || '成员读取失败',
        });
      });
  },

  applyMembers(org, data) {
    var nodeManaged = data.node_managed === true;
    var features = data.features || {};
    var seats = data.seats || { used: 0, total: 0, available: 0 };
    var hasFeature = features.org_members === true;
    var canInvite = hasFeature && (seats.available || 0) > 0;
    var seatsLabel =
      '席位 ' +
      seats.used +
      ' / ' +
      seats.total +
      (hasFeature
        ? seats.available > 0
          ? ' · 还能邀请 ' + seats.available + ' 人'
          : ' · 席位已满'
        : '');
    var upgradeHint = '';
    if (!hasFeature) {
      upgradeHint =
        '企业免费版只含所有者一个席位。邀请员工需要升级到企业 Pro（含 3 个席位，可按席位增购），目前在网页版 Studio 购买。';
    } else if (seats.available <= 0) {
      upgradeHint = '席位已满，可在网页版 Studio 增购席位。';
    }
    this._orgRole = (org && org.role) || '';
    this.setData({
      orgName: (org && org.name) || '企业',
      planName: (org && org.plan && org.plan.name) || '企业套餐',
      seatsLabel: seatsLabel,
      canInvite: canInvite,
      nodeManaged: nodeManaged,
      hasOrgMembersFeature: hasFeature,
      seatsAvailable: seats.available || 0,
      upgradeHint: upgradeHint,
      seatLinks: mapSeatLinks(data.seat_links),
      invites: mapInvites(data.invites, nodeManaged),
      members: mapMembers(data.members, nodeManaged, this._orgRole),
    });
  },

  reload() {
    var self = this;
    if (!this._token) return Promise.resolve();
    return Promise.all([
      creator.fetchOrgs(this._token),
      creator.fetchOrgMembers(this._token, this._orgId),
    ]).then(function (bundle) {
      if (!self._alive) return;
      var orgs = bundle[0] || [];
      var org = null;
      for (var i = 0; i < orgs.length; i++) {
        if (orgs[i].id === self._orgId && orgs[i].status === 'active') {
          org = orgs[i];
          break;
        }
      }
      self.applyMembers(org, bundle[1] || {});
    });
  },

  act(work, done) {
    var self = this;
    if (this.data.busy) return;
    this.setData({ busy: true, notice: '' });
    Promise.resolve()
      .then(work)
      .then(function () {
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ notice: done, busy: false });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          notice: (err && err.message) || '操作失败，请稍后重试',
          busy: false,
        });
      });
  },

  onQueryInput(e) {
    var self = this;
    var query = (e.detail && e.detail.value) || '';
    this.setData({ query: query });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    if (!this.data.nodeManaged || !query.trim()) {
      this.setData({ candidates: null, searching: false });
      return;
    }
    this._searchTimer = setTimeout(function () {
      self.runSearch(query.trim());
    }, 350);
  },

  runSearch(text) {
    var self = this;
    if (!this._token || !text) return;
    this.setData({ searching: true, notice: '' });
    creator
      .searchOrgCandidates(this._token, this._orgId, text)
      .then(function (found) {
        if (!self._alive || self.data.query.trim() !== text) return;
        self.setData({
          candidates: mapCandidates(found),
          searching: false,
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          candidates: [],
          searching: false,
          notice: (err && err.message) || '搜索失败',
        });
      });
  },

  onAccountInput(e) {
    var account = (e.detail && e.detail.value) || '';
    var snap = session.snapshot();
    var nodeDomain = snap.nodeDomain || '';
    var text = account.trim();
    var target = '';
    if (text) {
      if (/^@[^\s:]+:[^\s]+$/.test(text)) target = text;
      else {
        var name = text.replace(/^@/, '');
        if (/^[^\s:@]+$/.test(name) && nodeDomain) {
          target = '@' + name + ':' + nodeDomain;
        }
      }
    }
    this.setData({
      account: account,
      targetValid: !!target,
      targetPreview: target
        ? '将邀请 ' + target
        : text
          ? '账号格式不对，请填用户名或完整账号（@name:节点域名）'
          : '',
    });
  },

  inviteUser(userId) {
    var self = this;
    if (!userId) return;
    this.act(function () {
      return creator.inviteOrgMember(self._token, self._orgId, userId).then(
        function () {
          self.setData({
            account: '',
            targetPreview: '',
            targetValid: false,
            candidates: null,
            query: '',
          });
        }
      );
    }, '邀请已发出。请对方在 MuuZi「企业邀请」里接受，接受后占用一个席位。');
  },

  inviteFromSearch(e) {
    var userId = e.currentTarget.dataset.id;
    this.inviteUser(userId);
  },

  inviteFromAccount() {
    var snap = session.snapshot();
    var nodeDomain = snap.nodeDomain || '';
    var text = (this.data.account || '').trim();
    var target = '';
    if (/^@[^\s:]+:[^\s]+$/.test(text)) target = text;
    else {
      var name = text.replace(/^@/, '');
      if (/^[^\s:@]+$/.test(name) && nodeDomain) {
        target = '@' + name + ':' + nodeDomain;
      }
    }
    if (!target) return;
    this.inviteUser(target);
  },

  createSeatLink() {
    var self = this;
    this.act(function () {
      return creator.createOrgSeatLink(self._token, self._orgId);
    }, '邀请链接已生成，复制后发给员工。');
  },

  copySeatLink(e) {
    var url = e.currentTarget.dataset.url;
    var self = this;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function () {
        self.setData({ notice: '邀请链接已复制，发给员工即可。' });
      },
      fail: function () {
        self.setData({
          notice: '复制失败，请长按上面的链接手动复制。',
        });
      },
    });
  },

  revokeSeatLink(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    this.act(function () {
      return creator.revokeOrgSeatLink(self._token, self._orgId, id);
    }, '邀请链接已撤销，席位已收回。');
  },

  createInviteCode() {
    var self = this;
    this.act(function () {
      return creator.createOrgInviteCode(self._token, self._orgId);
    }, '邀请码已生成');
  },

  voidInvite(e) {
    var self = this;
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    this.act(function () {
      if (self.data.nodeManaged) {
        return creator.releaseOrgSeat(self._token, self._orgId, code);
      }
      return creator.deleteOrgInviteCode(self._token, self._orgId, code);
    }, '邀请已作废');
  },

  releaseSeat(e) {
    var self = this;
    var seatId = e.currentTarget.dataset.seat;
    var name = e.currentTarget.dataset.name || '这位员工';
    if (!seatId) return;
    wx.showModal({
      title: '释放席位',
      content:
        '释放 ' +
        name +
        ' 的 MuuZi 席位并停止在企业主页展示？GuDuu 组织里的成员关系会保留。',
      success: function (res) {
        if (!res.confirm) return;
        self.act(function () {
          return creator.releaseOrgSeat(self._token, self._orgId, seatId);
        }, '席位已释放');
      },
    });
  },

  inviteMemberSeat(e) {
    var userId = e.currentTarget.dataset.id;
    this.inviteUser(userId);
  },

  removeMember(e) {
    var self = this;
    var accountId = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name || '成员';
    if (!accountId) return;
    wx.showModal({
      title: '移出企业',
      content: '把 ' + name + ' 移出企业？',
      success: function (res) {
        if (!res.confirm) return;
        self.act(function () {
          return creator.removeOrgMember(self._token, self._orgId, accountId);
        }, '已移出企业');
      },
    });
  },

  copyStudio() {
    var url = this.data.studioUrl || studioLinks.studioUrl();
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制 Studio', icon: 'success' });
      },
    });
  },
});
