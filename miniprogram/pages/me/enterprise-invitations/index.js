const session = require('../../../services/session');
const creator = require('../../../services/creator');

function mapRows(rows) {
  return (rows || []).map(function (row) {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      pending: row.status === 'pending',
      eligible: !!row.eligible,
      show_on_wall: !!row.show_on_wall,
      title: row.title || '',
      pageHint: 'muuzi.co/' + (row.slug || ''),
      statusLabel: row.eligible
        ? '已加入企业 · 席位有效'
        : '当前席位或节点成员资格暂不可用',
      displayLabel: row.show_on_wall
        ? '关闭我的主页展示'
        : '授权展示我的主页',
      displayDisabled: !row.eligible && !row.show_on_wall,
    };
  });
}

Page({
  data: {
    loading: true,
    busyId: '',
    error: '',
    rows: [],
  },
  _alive: true,
  _token: '',
  _rows: [],

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
    self.setData({ loading: true, error: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return creator.fetchEnterpriseInvitations(opened.token);
      })
      .then(function (rows) {
        if (!self._alive) return;
        self._rows = rows;
        self.setData({ loading: false, rows: mapRows(rows) });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          rows: [],
          error: (err && err.message) || '读取失败',
        });
      });
  },

  refresh() {
    var self = this;
    return creator.fetchEnterpriseInvitations(this._token).then(function (rows) {
      if (!self._alive) return;
      self._rows = rows;
      self.setData({ rows: mapRows(rows) });
    });
  },

  accept(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!this._token || !id || this.data.busyId) return;
    this.setData({ busyId: id, error: '' });
    creator
      .acceptEnterpriseInvitation(this._token, id)
      .then(function () {
        return self.refresh();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busyId: '' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busyId: '',
          error: (err && err.message) || '操作未完成，请重试',
        });
      });
  },

  toggleDisplay(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!this._token || !id || this.data.busyId) return;
    var row = null;
    for (var i = 0; i < this._rows.length; i++) {
      if (this._rows[i].id === id) {
        row = this._rows[i];
        break;
      }
    }
    if (!row) return;
    if (!row.eligible && !row.show_on_wall) return;
    this.setData({ busyId: id, error: '' });
    creator
      .updateEnterpriseDisplay(this._token, id, {
        show_on_wall: !row.show_on_wall,
        title: row.title || '',
      })
      .then(function () {
        return self.refresh();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busyId: '' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busyId: '',
          error: (err && err.message) || '操作未完成，请重试',
        });
      });
  },
});
