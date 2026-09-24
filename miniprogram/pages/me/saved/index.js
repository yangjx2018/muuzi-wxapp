const session = require('../../../services/session');
const creator = require('../../../services/creator');

function mapItems(items) {
  return (items || []).map(function (post) {
    var author = (post && post.author) || {};
    var title = (post && (post.title || post.summary)) || '';
    var body = (post && post.body) || '';
    var preview = body;
    if (preview.length > 160) preview = preview.slice(0, 160) + '…';
    return {
      id: post.id,
      title: title,
      body: preview,
      authorName: author.name || author.slug || '未知作者',
      kindLabel: (post && post.kind_label) || '',
      saved: !(post.me && post.me.saved === false),
    };
  });
}

Page({
  data: {
    loading: true,
    busy: false,
    error: '',
    note: '',
    items: [],
  },
  _alive: true,
  _token: '',
  _raw: [],

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
        return creator.fetchSaved(opened.token);
      })
      .then(function (page) {
        if (!self._alive) return;
        self._raw = page.items || [];
        self.setData({
          loading: false,
          items: mapItems(self._raw),
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          items: [],
          error: (err && err.message) || '读取失败',
        });
      });
  },

  unsave(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!this._token || !id || this.data.busy) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .reactToPost(this._token, id, 'save', false)
      .then(function () {
        if (!self._alive) return;
        // App：取消收藏后条目留到下次进来再消失
        self._raw = self._raw.map(function (post) {
          if (post.id !== id) return post;
          return Object.assign({}, post, {
            me: Object.assign({}, post.me || {}, { saved: false }),
          });
        });
        self.setData({
          busy: false,
          note: '已取消收藏；下次进入本页后不再显示',
          items: mapItems(self._raw),
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '操作失败',
        });
      });
  },
});
