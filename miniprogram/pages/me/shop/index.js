const session = require('../../../services/session');
const creator = require('../../../services/creator');
const market = require('../../../services/storefrontMarket');

Page({
  data: {
    loading: true,
    busy: false,
    catalogBusy: false,
    linkBusy: false,
    error: '',
    note: '',
    catalogNote: '',
    linkError: '',
    name: '',
    description: '',
    homepageEnabled: false,
    homepageLimit: 0,
    homepageProducts: 0,
    pageLink: '',
    shopLink: '',
    stores: [],
    selectedStoreId: '',
    selectedStoreLabel: '',
    products: [],
    productCursor: '',
    productCursors: [''],
    productPage: 1,
    hasNextProducts: false,
    featuredLimit: 0,
    featuredStoreId: null,
    featuredIds: [],
    publication: null,
    publicationAvailable: false,
    linkItems: [],
    linkAfter: '',
    linkNext: '',
    linkDraft: {
      title: '',
      note: '',
      url: '',
      physical_goods: false,
      published: false,
    },
    editingLinkId: '',
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

  load() {
    var self = this;
    self.setData({ loading: true, error: '', note: '', catalogNote: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return Promise.all([
          creator.fetchStorefront(opened.token),
          creator.fetchFeaturedDraft(opened.token).catch(function () {
            return null;
          }),
          creator.fetchStorefrontPublication(opened.token).catch(function () {
            return null;
          }),
          creator.fetchStorefrontLinks(opened.token).catch(function () {
            return { items: [], next_after: null };
          }),
        ]);
      })
      .then(function (bundle) {
        if (!self._alive) return;
        var data = bundle[0] || {};
        var featured = bundle[1];
        var publication = bundle[2];
        var links = bundle[3] || { items: [], next_after: null };
        var settings = data.settings || {};
        var policy = data.policy || {};
        var linkPair = data.links || null;
        var draft = (featured && featured.draft) || {
          store_id: null,
          product_ids: [],
        };
        self.setData({
          loading: false,
          name: settings.name || '',
          description: settings.description || '',
          homepageEnabled: !!settings.homepage_enabled,
          homepageLimit: Number(settings.homepage_limit) || 0,
          homepageProducts: Number(policy.homepage_products) || 0,
          pageLink: linkPair && linkPair.page ? linkPair.page : '',
          shopLink: linkPair && linkPair.shop ? linkPair.shop : '',
          featuredLimit: featured ? Number(featured.limit) || 0 : 0,
          featuredStoreId: draft.store_id || null,
          featuredIds: Array.isArray(draft.product_ids)
            ? draft.product_ids.slice()
            : [],
          publication: publication && publication.publication
            ? publication.publication
            : null,
          publicationAvailable: !!(publication && publication.available),
          linkItems: links.items || [],
          linkAfter: '',
          linkNext: links.next_after || '',
          editingLinkId: '',
          linkDraft: {
            title: '',
            note: '',
            url: '',
            physical_goods: false,
            published: false,
          },
        });
        self.loadCatalog();
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          loading: false,
          error: '店铺配置暂不可用，请稍后重试。',
        });
      });
  },

  loadCatalog() {
    var self = this;
    var snap = session.snapshot();
    self.setData({ catalogBusy: true, catalogNote: '' });
    market
      .fetchStores(snap)
      .then(function (stores) {
        if (!self._alive) return;
        var selected =
          self.data.featuredStoreId ||
          (stores[0] && stores[0].id) ||
          '';
        var selectedStore = null;
        for (var i = 0; i < stores.length; i++) {
          if (stores[i].id === selected) {
            selectedStore = stores[i];
            break;
          }
        }
        if (!selectedStore && stores[0]) selectedStore = stores[0];
        self.setData({
          stores: stores,
          selectedStoreId: selected,
          selectedStoreLabel: selectedStore
            ? (selectedStore.name || '未命名店铺') +
              ' · ' +
              (selectedStore.entity_type === 'personal' ? '个人' : '企业')
            : '',
          catalogBusy: false,
        });
        if (selected) self.loadProducts(selected, true);
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          stores: [],
          selectedStoreId: '',
          products: [],
          catalogBusy: false,
          catalogNote: (err && err.message) || '商品目录暂不可用',
        });
      });
  },

  loadProducts(storeId, reset, cursorsOverride) {
    var self = this;
    if (!storeId) return;
    var cursors = cursorsOverride
      ? cursorsOverride.slice()
      : reset
        ? ['']
        : self.data.productCursors.slice();
    var cursor = cursors[cursors.length - 1] || '';
    self.setData({ catalogBusy: true, catalogNote: '' });
    market
      .fetchStoreProducts(session.snapshot(), storeId, cursor)
      .then(function (page) {
        if (!self._alive) return;
        var items = (page.items || []).map(function (item) {
          return Object.assign({}, item, {
            priceLabel: market.storePrice(item),
            selected:
              self.data.featuredStoreId === storeId &&
              self.data.featuredIds.indexOf(item.product_id) >= 0,
          });
        });
        self.setData({
          products: items,
          productCursors: cursors,
          productPage: cursors.length,
          hasNextProducts: !!page.next_cursor,
          productCursor: page.next_cursor || '',
          catalogBusy: false,
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          products: [],
          catalogBusy: false,
          catalogNote: (err && err.message) || '商品暂不可用',
        });
      });
  },

  onStorePick(e) {
    var idx = Number(e.detail && e.detail.value);
    var store = this.data.stores[idx];
    if (!store) return;
    this.setData({
      selectedStoreId: store.id,
      selectedStoreLabel:
        (store.name || '未命名店铺') +
        ' · ' +
        (store.entity_type === 'personal' ? '个人' : '企业'),
    });
    this.loadProducts(store.id, true);
  },

  useSelectedStore() {
    this.setData({
      featuredStoreId: this.data.selectedStoreId,
      featuredIds: [],
    });
    this.refreshProductSelection();
  },

  refreshProductSelection() {
    var storeId = this.data.selectedStoreId;
    var ids = this.data.featuredIds;
    var featuredStoreId = this.data.featuredStoreId;
    var products = (this.data.products || []).map(function (item) {
      return Object.assign({}, item, {
        selected:
          featuredStoreId === storeId &&
          ids.indexOf(item.product_id) >= 0,
      });
    });
    this.setData({ products: products });
  },

  toggleProduct(e) {
    var id = e.currentTarget.dataset.id;
    var storeId = this.data.selectedStoreId;
    if (!id || !storeId || this.data.catalogBusy) return;
    var ids =
      this.data.featuredStoreId === storeId
        ? this.data.featuredIds.slice()
        : [];
    var at = ids.indexOf(id);
    if (at >= 0) ids.splice(at, 1);
    else {
      if (ids.length >= this.data.featuredLimit && this.data.featuredLimit > 0) {
        wx.showToast({
          title: '最多精选 ' + this.data.featuredLimit + ' 个',
          icon: 'none',
        });
        this.refreshProductSelection();
        return;
      }
      ids.push(id);
    }
    this.setData({ featuredStoreId: storeId, featuredIds: ids });
    this.refreshProductSelection();
  },

  clearFeatured() {
    this.setData({ featuredStoreId: null, featuredIds: [] });
    this.refreshProductSelection();
  },

  prevProducts() {
    var cursors = this.data.productCursors.slice();
    if (cursors.length <= 1) return;
    cursors.pop();
    this.loadProducts(this.data.selectedStoreId, false, cursors);
  },

  nextProducts() {
    if (!this.data.hasNextProducts || !this.data.productCursor) return;
    var cursors = this.data.productCursors.slice();
    cursors.push(this.data.productCursor);
    this.loadProducts(this.data.selectedStoreId, false, cursors);
  },

  saveFeatured() {
    var self = this;
    if (!this._token || this.data.catalogBusy) return;
    this.setData({ catalogBusy: true, catalogNote: '' });
    creator
      .saveFeaturedDraft(this._token, {
        store_id: this.data.featuredStoreId,
        product_ids: this.data.featuredIds,
      })
      .then(function (result) {
        if (!self._alive) return;
        var draft = (result && result.draft) || {};
        self.setData({
          catalogBusy: false,
          featuredLimit: Number(result.limit) || self.data.featuredLimit,
          featuredStoreId: draft.store_id || null,
          featuredIds: Array.isArray(draft.product_ids)
            ? draft.product_ids.slice()
            : [],
          catalogNote: '精选草稿已保存，尚未对外发布。',
        });
        self.refreshProductSelection();
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          catalogBusy: false,
          catalogNote: (err && err.message) || '保存失败，请重试。',
        });
      });
  },

  publishShop() {
    var self = this;
    if (!this._token || this.data.catalogBusy) return;
    if (!this.data.featuredStoreId) {
      wx.showToast({ title: '请先选择精选商品', icon: 'none' });
      return;
    }
    this.setData({ catalogBusy: true, catalogNote: '' });
    creator
      .publishStorefront(this._token, {
        store_id: this.data.featuredStoreId,
        product_ids: this.data.featuredIds,
      })
      .then(function (state) {
        if (!self._alive) return;
        self.setData({
          catalogBusy: false,
          publication: state && state.publication ? state.publication : null,
          publicationAvailable: !!(state && state.available),
          catalogNote:
            '店铺已发布。个人主页按已保存的展示配置显示精选。',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          catalogBusy: false,
          catalogNote: (err && err.message) || '发布失败，请重试。',
        });
      });
  },

  unpublishShop() {
    var self = this;
    if (!this._token || this.data.catalogBusy) return;
    this.setData({ catalogBusy: true, catalogNote: '' });
    creator
      .unpublishStorefront(this._token)
      .then(function (state) {
        if (!self._alive) return;
        self.setData({
          catalogBusy: false,
          publication: state && state.publication ? state.publication : null,
          publicationAvailable: !!(state && state.available),
          catalogNote: '店铺展示已撤下。',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          catalogBusy: false,
          catalogNote: (err && err.message) || '撤下失败，请重试。',
        });
      });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onDesc(e) {
    this.setData({ description: e.detail.value });
  },
  onHomepageEnabled() {
    if (!this.data.homepageProducts || this.data.busy) return;
    this.setData({ homepageEnabled: !this.data.homepageEnabled });
  },
  onHomepageLimit(e) {
    this.setData({ homepageLimit: Number(e.detail.value) || 0 });
  },

  save() {
    var self = this;
    if (!this._token || this.data.busy) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .saveStorefront(this._token, {
        name: this.data.name,
        description: this.data.description,
        homepage_enabled: this.data.homepageEnabled,
        homepage_limit: this.data.homepageLimit,
      })
      .then(function (result) {
        if (!self._alive) return;
        var settings = (result && result.settings) || {};
        var links = (result && result.links) || null;
        self.setData({
          busy: false,
          name: settings.name || self.data.name,
          description: settings.description || self.data.description,
          homepageEnabled: !!settings.homepage_enabled,
          homepageLimit: Number(settings.homepage_limit) || 0,
          pageLink: links && links.page ? links.page : self.data.pageLink,
          shopLink: links && links.shop ? links.shop : self.data.shopLink,
          note: '展示配置已保存，请在上方发布或更新公开店铺。',
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

  onLinkField(e) {
    var key = e.currentTarget.dataset.key;
    var draft = Object.assign({}, this.data.linkDraft);
    draft[key] = e.detail.value;
    this.setData({ linkDraft: draft });
  },
  onLinkPhysical() {
    if (this.data.linkBusy) return;
    var draft = Object.assign({}, this.data.linkDraft, {
      physical_goods: !this.data.linkDraft.physical_goods,
    });
    this.setData({ linkDraft: draft });
  },
  onLinkPublished() {
    if (this.data.linkBusy) return;
    var draft = Object.assign({}, this.data.linkDraft, {
      published: !this.data.linkDraft.published,
    });
    this.setData({ linkDraft: draft });
  },

  editLink(e) {
    var id = e.currentTarget.dataset.id;
    var item = null;
    var list = this.data.linkItems || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        item = list[i];
        break;
      }
    }
    if (!item) return;
    this.setData({
      editingLinkId: id,
      linkDraft: {
        title: item.title || '',
        note: item.note || '',
        url: item.url || '',
        physical_goods: true,
        published: !!item.published,
      },
    });
  },

  cancelEditLink() {
    this.setData({
      editingLinkId: '',
      linkDraft: {
        title: '',
        note: '',
        url: '',
        physical_goods: false,
        published: false,
      },
    });
  },

  reloadLinks(after) {
    var self = this;
    return creator
      .fetchStorefrontLinks(this._token, after || '')
      .then(function (listing) {
        if (!self._alive) return;
        self.setData({
          linkItems: (listing && listing.items) || [],
          linkAfter: after || '',
          linkNext: (listing && listing.next_after) || '',
          editingLinkId: '',
          linkDraft: {
            title: '',
            note: '',
            url: '',
            physical_goods: false,
            published: false,
          },
          linkBusy: false,
          linkError: '',
        });
      });
  },

  saveLink() {
    var self = this;
    var draft = this.data.linkDraft;
    if (!this._token || this.data.linkBusy) return;
    if (!draft.physical_goods) {
      wx.showToast({ title: '请确认是实物商品', icon: 'none' });
      return;
    }
    if (!draft.title || !draft.url) {
      wx.showToast({ title: '请填写名称和链接', icon: 'none' });
      return;
    }
    this.setData({ linkBusy: true, linkError: '' });
    creator
      .saveStorefrontLink(
        this._token,
        {
          title: draft.title,
          note: draft.note,
          url: draft.url,
          physical_goods: true,
          published: !!draft.published,
        },
        this.data.editingLinkId || undefined
      )
      .then(function () {
        return self.reloadLinks('');
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          linkBusy: false,
          linkError: (err && err.message) || '保存失败，请重试',
        });
      });
  },

  toggleLinkPublished(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var item = null;
    var list = this.data.linkItems || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        item = list[i];
        break;
      }
    }
    if (!item || this.data.linkBusy) return;
    this.setData({ linkBusy: true, linkError: '' });
    creator
      .saveStorefrontLink(
        this._token,
        {
          title: item.title,
          note: item.note,
          url: item.url,
          physical_goods: true,
          published: !item.published,
        },
        id
      )
      .then(function () {
        return self.reloadLinks(self.data.linkAfter);
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          linkBusy: false,
          linkError: (err && err.message) || '操作失败',
        });
      });
  },

  deleteLink(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!id || this.data.linkBusy) return;
    wx.showModal({
      title: '删除实物链接',
      content: '删除这个实物商品链接？',
      success: function (res) {
        if (!res.confirm) return;
        self.setData({ linkBusy: true, linkError: '' });
        creator
          .deleteStorefrontLink(self._token, id)
          .then(function () {
            return self.reloadLinks('');
          })
          .catch(function (err) {
            if (!self._alive) return;
            self.setData({
              linkBusy: false,
              linkError: (err && err.message) || '删除失败',
            });
          });
      },
    });
  },

  nextLinkPage() {
    if (!this.data.linkNext || this.data.linkBusy) return;
    this.setData({ linkBusy: true });
    this.reloadLinks(this.data.linkNext).catch(function () {});
  },

  firstLinkPage() {
    if (!this.data.linkAfter || this.data.linkBusy) return;
    this.setData({ linkBusy: true });
    this.reloadLinks('').catch(function () {});
  },

  goEditHome() {
    wx.navigateTo({ url: '/pages/me/edit-home/index' });
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/me/membership/index' });
  },

  copyLink(e) {
    var kind = e.currentTarget.dataset.kind;
    var url = kind === 'shop' ? this.data.shopLink : this.data.pageLink;
    if (!url) {
      wx.showToast({ title: '暂无链接', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
  },
});
