const session = require('../../../services/session');
const creator = require('../../../services/creator');
const centralMarket = require('../../../services/centralMarket');

var KINDS = [
  { id: 'need', label: '需求' },
  { id: 'offer', label: '供给' },
  { id: 'update', label: '动态' },
  { id: 'intro', label: '引荐' },
];

var KIND_HINT = {
  need: '找人做事，可以带预算和截止',
  offer: '你能做什么、卖什么',
  update: '新作品、近况',
  intro: '替朋友引荐',
};

function pickImagePath() {
  return new Promise(function (resolve, reject) {
    function fail(err) {
      reject(err || new Error('未选择图片'));
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: function (res) {
          var file =
            res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
          if (file) resolve(file);
          else fail();
        },
        fail: fail,
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var file = res.tempFilePaths && res.tempFilePaths[0];
        if (file) resolve(file);
        else fail();
      },
      fail: fail,
    });
  });
}

Page({
  data: {
    loading: true,
    busy: false,
    uploading: false,
    error: '',
    owner: '',
    kinds: KINDS,
    kind: 'need',
    kindHint: KIND_HINT.need,
    title: '',
    body: '',
    tags: '',
    budget: '',
    deadline: '',
    location: '',
    link: '',
    visibilityIndex: 0,
    visibilityLabels: ['公开', '仅关注者'],
    works: [],
    selectedWorks: [],
    showWorks: false,
    pickerError: '',
    existingPost: '',
    marketItems: [],
    showMarket: false,
    selectedProduct: null,
    marketError: '',
  },
  _alive: true,
  _token: '',
  _owner: '',

  onLoad(query) {
    this._alive = true;
    var owner =
      query && query.owner ? decodeURIComponent(String(query.owner)) : '';
    var kind = query && query.kind === 'offer' ? 'offer' : 'need';
    this._owner = owner;
    this.setData({
      owner: owner,
      kind: kind,
      kindHint: KIND_HINT[kind],
    });
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    this.bootstrap();
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

  bootstrap() {
    var self = this;
    if (this._token) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true, error: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        if (!self._alive) return;
        self._token = opened.token;
        self.setData({ loading: false });
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          loading: false,
          error: '连不上平台，暂时不能发布',
        });
      });
  },

  onKind(e) {
    var id = e.currentTarget.dataset.id;
    if (!KIND_HINT[id]) return;
    this.setData({
      kind: id,
      kindHint: KIND_HINT[id],
      existingPost: '',
      error: '',
      showMarket: id === 'offer' ? this.data.showMarket : false,
      selectedProduct: id === 'offer' ? this.data.selectedProduct : null,
    });
  },

  onTitle(e) {
    this.setData({ title: e.detail.value });
  },
  onBody(e) {
    this.setData({ body: e.detail.value });
  },
  onTags(e) {
    this.setData({ tags: e.detail.value });
  },
  onBudget(e) {
    this.setData({ budget: e.detail.value });
  },
  onDeadline(e) {
    this.setData({ deadline: e.detail.value });
  },
  onLocation(e) {
    this.setData({ location: e.detail.value });
  },
  onLink(e) {
    this.setData({ link: e.detail.value });
  },
  onVisibility(e) {
    this.setData({ visibilityIndex: Number(e.detail.value) || 0 });
  },

  toggleWorks() {
    var self = this;
    var show = !this.data.showWorks;
    this.setData({ showWorks: show, pickerError: '' });
    if (!show || this.data.works.length || !this._token) return;
    creator
      .fetchWorks(this._token, '', this._owner)
      .then(function (data) {
        if (!self._alive) return;
        self.setData({ works: (data && data.works) || [] });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          pickerError: (err && err.message) || '作品库读不到',
        });
      });
  },

  pickWork(e) {
    var id = e.currentTarget.dataset.id;
    var list = this.data.works || [];
    var item = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        item = list[i];
        break;
      }
    }
    if (!item) return;
    var selected = this.data.selectedWorks.slice();
    if (selected.some(function (w) { return w.id === id; })) return;
    if (selected.length >= 10) {
      wx.showToast({ title: '最多挂 10 个作品', icon: 'none' });
      return;
    }
    selected.push(item);
    this.setData({ selectedWorks: selected });
  },

  removeWork(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({
      selectedWorks: this.data.selectedWorks.filter(function (w) {
        return w.id !== id;
      }),
    });
  },

  uploadImage() {
    var self = this;
    if (!this._token || this.data.uploading || this.data.busy) return;
    this.setData({ uploading: true, pickerError: '', error: '' });
    pickImagePath()
      .then(function (filePath) {
        return creator.uploadImage(
          self._token,
          filePath,
          'work',
          self._owner || undefined
        );
      })
      .then(function (uploaded) {
        if (!self._alive) return;
        var selected = self.data.selectedWorks.slice();
        selected.push({
          id: uploaded.work_id,
          kind: 'image',
          title: '图片',
          visibility: 'private',
          url: uploaded.url,
        });
        self.setData({
          uploading: false,
          selectedWorks: selected,
          works: [],
          showWorks: false,
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        if (err && err.errMsg && /cancel/i.test(err.errMsg)) {
          self.setData({ uploading: false });
          return;
        }
        self.setData({
          uploading: false,
          pickerError: (err && err.message) || '上传失败',
        });
      });
  },

  toggleMarket() {
    var self = this;
    if (this.data.kind !== 'offer') return;
    var show = !this.data.showMarket;
    this.setData({ showMarket: show, marketError: '' });
    if (!show || this.data.marketItems.length) return;
    centralMarket
      .fetchCentralMarket(session.snapshot())
      .then(function (items) {
        if (!self._alive) return;
        self.setData({ marketItems: items || [] });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          marketError: (err && err.message) || '商城读不到',
          marketItems: [],
        });
      });
  },

  pickProduct(e) {
    var id = e.currentTarget.dataset.id;
    var list = this.data.marketItems || [];
    var item = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].product_id === id) {
        item = list[i];
        break;
      }
    }
    if (!item) return;
    this.setData({
      selectedProduct: item,
      showMarket: false,
      existingPost: '',
      title: this.data.title || ('推荐 ' + (item.name || '')).slice(0, 120),
    });
  },

  clearProduct() {
    this.setData({ selectedProduct: null, existingPost: '' });
  },

  closeExisting() {
    var self = this;
    if (!this._token || !this.data.existingPost || this.data.busy) return;
    this.setData({ busy: true, error: '' });
    creator
      .closePost(this._token, this.data.existingPost, this._owner)
      .then(function () {
        if (!self._alive) return;
        self.setData({
          busy: false,
          existingPost: '',
          error: '旧动态已关闭，请核对内容后再次发布',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '旧动态暂时无法关闭',
        });
      });
  },

  submit() {
    var self = this;
    if (!this._token || this.data.busy || this.data.uploading) return;
    var title = String(this.data.title || '').trim();
    if (!title) {
      this.setData({ error: '请填写标题' });
      return;
    }
    var yuan = Number(this.data.budget);
    var kind = this.data.kind;
    var selected = this.data.selectedWorks || [];
    var product = this.data.selectedProduct;
    var payload = {
      owner: this._owner || undefined,
      publish_work:
        selected.length > 1 || Boolean(this._owner && selected.length),
      kind: kind,
      visibility: this.data.visibilityIndex === 1 ? 'followers' : 'public',
      title: title,
      body: String(this.data.body || '').trim(),
      tags: String(this.data.tags || '').trim(),
      budget_minor:
        (kind === 'need' || kind === 'offer') &&
        String(this.data.budget || '').trim() &&
        Number.isFinite(yuan)
          ? Math.round(yuan * 100)
          : null,
      deadline: kind === 'need' ? String(this.data.deadline || '').trim() : '',
      location: String(this.data.location || '').trim(),
      link_url: String(this.data.link || '').trim(),
      work_id: (selected[0] && selected[0].id) || '',
      work_ids: selected.map(function (w) {
        return w.id;
      }),
      product_id:
        kind === 'offer' && product ? product.product_id : '',
      product_kind:
        kind === 'offer' && product ? String(product.kind) : '',
    };
    this.setData({ busy: true, error: '', existingPost: '' });
    creator
      .createPost(this._token, payload)
      .then(function () {
        if (!self._alive) return;
        wx.showToast({ title: '已发布', icon: 'success' });
        setTimeout(function () {
          wx.navigateBack({
            fail: function () {
              wx.switchTab({ url: '/pages/me/index' });
            },
          });
        }, 400);
      })
      .catch(function (err) {
        if (!self._alive) return;
        var existing =
          err &&
          err.code === 'ACTIVE_OFFER_EXISTS' &&
          err.body &&
          err.body.existing_post_id
            ? String(err.body.existing_post_id)
            : '';
        self.setData({
          busy: false,
          error: (err && err.message) || '发布失败',
          existingPost: existing,
        });
      });
  },
});
