const session = require('../../../services/session');
const creator = require('../../../services/creator');
const subjects = require('../../../services/subjects');
const fieldCardSources = require('../../../services/fieldCardSources');
const fieldNamecard = require('../../../services/fieldNamecard');
const pageAddress = require('../../../services/pageAddress');
const qrcodeDraw = require('../../../utils/qrcode-draw');

function allSettled(promises) {
  return Promise.all(
    promises.map(function (p) {
      return Promise.resolve(p).then(
        function (value) {
          return { status: 'fulfilled', value: value };
        },
        function (reason) {
          return { status: 'rejected', reason: reason };
        }
      );
    })
  );
}

function kindTag(kind) {
  if (kind === 'org') return '企业主页';
  if (kind === 'virtual') return '虚拟企业主页';
  return '个人主页';
}

function editLabel(kind, unpublished) {
  if (kind === 'org') {
    return unpublished ? '前往企业空间' : '管理企业空间';
  }
  return unpublished ? '完善并发布主页' : '编辑主页';
}

Page({
  data: {
    sources: [fieldCardSources.PERSONAL_CARD],
    sourceLabels: [fieldCardSources.PERSONAL_CARD.label],
    selectedIndex: 0,
    selectedKey: 'person',
    sourcesLoading: true,
    sourcesError: '',
    sourcesHint: '',
    cardStatus: 'loading',
    card: null,
    kindTag: '个人主页',
    editLabel: '编辑主页',
    qrImage: '',
    qrFailed: false,
    qrPending: false,
    note: '',
    copying: false,
    qrSize: qrcodeDraw.QR_SIZE,
  },

  onShow() {
    if (!session.requireSignedInOrRedirect()) return;
    this.refreshSources();
  },

  refreshSources() {
    var self = this;
    self.setData({
      sourcesLoading: true,
      sourcesError: '',
      sourcesHint: '',
      sources: [fieldCardSources.PERSONAL_CARD],
      sourceLabels: [fieldCardSources.PERSONAL_CARD.label],
      selectedIndex: 0,
      selectedKey: 'person',
    });
    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return allSettled([
          creator.fetchOrgs(opened.token),
          subjects.listSubjects(opened.token),
        ]);
      })
      .then(function (results) {
        var orgs = results[0].status === 'fulfilled' ? results[0].value : [];
        var subjectList =
          results[1].status === 'fulfilled'
            ? results[1].value.subjects || []
            : [];
        var sources = fieldCardSources.companyCardSources(orgs, subjectList);
        var partial = results.some(function (r) {
          return r.status === 'rejected';
        });
        self.setData({
          sources: sources,
          sourceLabels: sources.map(function (s) {
            return s.label;
          }),
          sourcesLoading: false,
          sourcesError: partial
            ? '部分企业主页暂时无法读取，可刷新重试。个人名片仍可使用。'
            : '',
          sourcesHint:
            !partial && sources.length === 1
              ? '暂无可展示的企业主页。'
              : '',
        });
        self.loadSelectedCard();
      })
      .catch(function (err) {
        var msg =
          (err && err.message) ||
          '企业主页列表暂时无法读取，请重试。';
        self.setData({
          sourcesLoading: false,
          sourcesError: msg,
        });
        // 换票失败时不要再误拉个人名片
        self.setData({ cardStatus: 'error' });
      });
  },

  onSourceChange(e) {
    var index = Number(e.detail.value);
    var source = this.data.sources[index] || fieldCardSources.PERSONAL_CARD;
    this.setData({
      selectedIndex: index,
      selectedKey: source.key,
      note: '',
      qrImage: '',
      qrFailed: false,
    });
    this.loadSelectedCard();
  },

  currentSource() {
    return (
      this.data.sources.find(function (s) {
        return s.key === this.data.selectedKey;
      }, this) ||
      this.data.sources[this.data.selectedIndex] ||
      fieldCardSources.PERSONAL_CARD
    );
  },

  loadSelectedCard() {
    var self = this;
    var source = this.currentSource();
    var gen = (this._cardGen = (this._cardGen || 0) + 1);
    self.setData({
      cardStatus: 'loading',
      card: null,
      kindTag: kindTag(source.kind),
      editLabel: editLabel(source.kind, false),
      qrImage: '',
      qrFailed: false,
      qrPending: false,
      note: '',
    });
    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        if (source.kind === 'org') {
          return creator.fetchOrgPage(opened.token, source.id).then(function (result) {
            if (
              !result ||
              !result.org ||
              result.org.id !== source.id ||
              !fieldCardSources.allowedCompanyCard(result.org) ||
              (result.page && result.page.suspended_at)
            ) {
              throw new Error('Unavailable');
            }
            return { page: result.page, opened: opened };
          });
        }
        if (source.kind === 'virtual') {
          return subjects
            .fetchVirtualPage(opened.token, source.id)
            .then(function (result) {
              if (
                !result ||
                !result.subject ||
                result.subject.id !== source.id ||
                !fieldCardSources.allowedVirtualCard(result.subject) ||
                result.restriction
              ) {
                throw new Error('Unavailable');
              }
              return { page: result.page, opened: opened };
            });
        }
        return creator.fetchPage(opened.token).then(function (page) {
          return { page: page, opened: opened };
        });
      })
      .then(function (bundle) {
        var page = bundle.page;
        if (source.kind !== 'person' && page && page.published) {
          return creator.fetchPublicPage(page.slug).then(function (publicPage) {
            if (
              !publicPage ||
              !publicPage.owner ||
              publicPage.owner.id !== source.id ||
              publicPage.owner.type !== source.kind ||
              !publicPage.page ||
              !publicPage.page.published
            ) {
              throw new Error('Unavailable');
            }
            var published = publicPage.page.published;
            page = Object.assign({}, page, {
              page_url: publicPage.page.page_url || page.page_url,
              published: Object.assign({}, page.published, {
                display_name: published.display_name || '',
                headline: published.headline || '',
                portrait_url: published.portrait_url || '',
              }),
            });
            return page;
          });
        }
        return page;
      })
      .then(function (page) {
        return fieldNamecard.publishedNamecard(
          page,
          creator.PLATFORM_API,
          pageAddress.resolveShareAddress
        );
      })
      .then(function (card) {
        if (gen !== self._cardGen) return;
        if (!card) {
          self.setData({
            cardStatus: 'unpublished',
            editLabel: editLabel(source.kind, true),
          });
          return;
        }
        self.setData({
          cardStatus: 'ready',
          card: card,
          editLabel: editLabel(source.kind, false),
          qrPending: true,
        });
        self.renderQr(card.url, gen);
      })
      .catch(function () {
        if (gen !== self._cardGen) return;
        self.setData({ cardStatus: 'error' });
      });
  },

  renderQr(url, gen) {
    var self = this;
    qrcodeDraw
      .drawUrlToTempFile(self, 'namecardQr', url)
      .then(function (path) {
        if (gen !== self._cardGen) return;
        self.setData({ qrImage: path, qrPending: false, qrFailed: false });
      })
      .catch(function () {
        if (gen !== self._cardGen) return;
        self.setData({ qrImage: '', qrPending: false, qrFailed: true });
      });
  },

  retryQr() {
    var card = this.data.card;
    if (!card || !card.url) return;
    this.setData({ qrFailed: false, qrPending: true, qrImage: '' });
    this.renderQr(card.url, this._cardGen);
  },

  retryCard() {
    this.setData({ note: '' });
    this.loadSelectedCard();
  },

  copyLink() {
    var self = this;
    var card = this.data.card;
    if (!card || !card.url || this.data.copying) return;
    this.setData({ copying: true, note: '' });
    wx.setClipboardData({
      data: card.url,
      success: function () {
        self.setData({ note: '主页链接已复制', copying: false });
      },
      fail: function () {
        self.setData({
          note: '复制失败，可长按下方地址复制',
          copying: false,
        });
      },
    });
  },

  goEdit() {
    var sources = this.data.sources || [];
    var index = this.data.selectedIndex || 0;
    var source = sources[index] || fieldCardSources.PERSONAL_CARD;
    if (source.kind === 'org') {
      wx.navigateTo({
        url: '/pages/me/edit-home/index?org=' + encodeURIComponent(source.id),
      });
      return;
    }
    if (source.kind === 'virtual') {
      wx.navigateTo({ url: '/pages/me/subjects/index' });
      return;
    }
    wx.navigateTo({ url: '/pages/me/edit-home/index' });
  },
});
