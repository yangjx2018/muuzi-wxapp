const session = require('../../../services/session');
const creator = require('../../../services/creator');

function splitTags(value) {
  return String(value || '')
    .split(/[,，]/)
    .map(function (t) {
      return t.trim();
    })
    .filter(Boolean);
}

function yuanToMinor(value) {
  var s = String(value || '').trim();
  if (!s) return null;
  var n = Number(s);
  if (!isFinite(n)) return null;
  return Math.round(n * 100);
}

Page({
  data: {
    loading: true,
    busy: false,
    error: '',
    note: '',
    offers: '',
    wants: '',
    excludes: '',
    priceMin: '',
    priceMax: '',
    notes: '',
  },
  _alive: true,
  _token: '',

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
    var snap = session.snapshot();
    self.setData({ loading: true, error: '', note: '' });
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        self._token = opened.token;
        return creator.fetchInterests(opened.token);
      })
      .then(function (data) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          offers: (data.offers || []).join(', '),
          wants: (data.wants || []).join(', '),
          excludes: (data.excludes || []).join(', '),
          priceMin:
            data.price_min_minor == null
              ? ''
              : String(data.price_min_minor / 100),
          priceMax:
            data.price_max_minor == null
              ? ''
              : String(data.price_max_minor / 100),
          notes: data.notes || '',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          error: (err && err.message) || '读取失败',
        });
      });
  },

  onOffers(e) {
    this.setData({ offers: e.detail.value });
  },
  onWants(e) {
    this.setData({ wants: e.detail.value });
  },
  onExcludes(e) {
    this.setData({ excludes: e.detail.value });
  },
  onPriceMin(e) {
    this.setData({ priceMin: e.detail.value });
  },
  onPriceMax(e) {
    this.setData({ priceMax: e.detail.value });
  },
  onNotes(e) {
    this.setData({ notes: e.detail.value });
  },

  save() {
    var self = this;
    if (!this._token || this.data.busy) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .saveInterests(this._token, {
        offers: splitTags(this.data.offers),
        wants: splitTags(this.data.wants),
        excludes: splitTags(this.data.excludes),
        price_min_minor: yuanToMinor(this.data.priceMin),
        price_max_minor: yuanToMinor(this.data.priceMax),
        notes: String(this.data.notes || '').trim(),
      })
      .then(function (result) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          note:
            '已保存，Muu 重新看了最近 ' +
            ((result && result.rematched) || 0) +
            ' 条',
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
});
