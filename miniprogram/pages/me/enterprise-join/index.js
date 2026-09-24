/**
 * 员工一次性邀请链接加入 · 1:1 对齐 App EnterpriseJoinScreen
 * 路由：/pages/me/enterprise-join/index?token=
 */
const session = require('../../../services/session');
const creator = require('../../../services/creator');

var TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

function formatExpires(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var min = String(d.getMinutes()).padStart(2, '0');
    return y + '/' + m + '/' + day + ' ' + h + ':' + min;
  } catch (e) {
    return String(iso);
  }
}

Page({
  data: {
    phase: 'loading',
    error: '',
    busy: false,
    token: '',
    enterpriseName: '',
    enterpriseSlug: '',
    expiresLabel: '',
    matrixUserId: '',
    nodeDomain: '',
  },
  _alive: true,
  _creatorToken: '',
  _linkToken: '',

  onLoad(query) {
    this._alive = true;
    var token = (query && query.token) || '';
    this._linkToken = token;
    var snap = session.snapshot();
    this.setData({
      token: token,
      matrixUserId: snap.matrixUserId || '',
      nodeDomain: snap.nodeDomain || '',
    });
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    if (!TOKEN_RE.test(this._linkToken)) {
      this.setData({
        phase: 'error',
        error: '邀请链接无效',
      });
      return;
    }
    if (this.data.phase === 'joined') return;
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
    var linkToken = this._linkToken;
    self.setData({ phase: 'loading', error: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._creatorToken = opened.token;
        return creator.fetchEnterpriseLink(opened.token, linkToken);
      })
      .then(function (result) {
        if (!self._alive) return;
        var enterprise = (result && result.enterprise) || null;
        if (!enterprise || !enterprise.name) {
          throw new Error('邀请链接无法打开');
        }
        self.setData({
          phase: 'ready',
          enterpriseName: enterprise.name,
          enterpriseSlug: enterprise.slug || '',
          expiresLabel: formatExpires(enterprise.expires_at),
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          phase: 'error',
          error: (err && err.message) || '邀请链接无法打开',
        });
      });
  },

  join() {
    var self = this;
    if (this.data.busy || !this._creatorToken) return;
    this.setData({ busy: true, error: '' });
    // 加入与接受分两步：接受失败时席位仍在，可在「企业邀请」里重试。
    creator
      .joinEnterpriseLink(this._creatorToken, this._linkToken)
      .then(function (result) {
        var invitation = result && result.invitation;
        if (!invitation || !invitation.id) {
          throw new Error('加入未完成，请稍后在「企业邀请」里重试');
        }
        return creator.acceptEnterpriseInvitation(
          self._creatorToken,
          invitation.id
        );
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ phase: 'joined', busy: false });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error:
            (err && err.message) ||
            '加入未完成，请稍后在「企业邀请」里重试',
        });
      });
  },

  goInvitations() {
    wx.redirectTo({
      url: '/pages/me/enterprise-invitations/index',
    });
  },

  goSpaces() {
    wx.redirectTo({
      url: '/pages/me/spaces/index',
    });
  },
});
