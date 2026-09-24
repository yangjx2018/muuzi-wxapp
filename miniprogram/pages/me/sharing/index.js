const session = require('../../../services/session');
const creator = require('../../../services/creator');

function cardStatus(c) {
  if (c.status === 'disabled') return '已下架';
  if (c.published) return '已发布';
  return '草稿';
}

Page({
  data: {
    loading: true,
    busy: false,
    error: '',
    note: '',
    owner: '',
    sourceLabels: ['请选择来源'],
    sourceIndex: 0,
    cardLabels: ['请选择卡片'],
    cardIndex: 0,
    hasCard: false,
    cardName: '',
    cardSummary: '',
    cardStatus: '',
    cardPublicUrl: '',
    invite: null,
    inviteActive: false,
    inviteUrl: '',
    inviteStats: '',
  },
  _alive: true,
  _token: '',
  _owner: '',
  _sources: [],
  _cards: [],
  _selectedCode: '',
  _revision: 0,
  _draft: null,

  onLoad(query) {
    var owner =
      query && query.owner ? decodeURIComponent(String(query.owner)) : '';
    this._owner = owner;
    this.setData({ owner: owner });
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

  applyLists(sources, cards, selectedCode) {
    this._sources = sources || [];
    this._cards = cards || [];
    var sourceLabels = ['请选择来源'].concat(
      this._sources.map(function (s) {
        return (
          (s.name || s.ref) +
          ' · ' +
          (s.kind === 'page_item' ? '主页' : '供给')
        );
      })
    );
    var cardLabels = ['请选择卡片'].concat(
      this._cards.map(function (c) {
        return ((c.draft && c.draft.name) || c.code) + ' · ' + cardStatus(c);
      })
    );
    var cardIndex = 0;
    if (selectedCode) {
      for (var i = 0; i < this._cards.length; i++) {
        if (this._cards[i].code === selectedCode) {
          cardIndex = i + 1;
          break;
        }
      }
    }
    this._selectedCode = cardIndex > 0 ? this._cards[cardIndex - 1].code : '';
    var card = cardIndex > 0 ? this._cards[cardIndex - 1] : null;
    this._revision = card ? card.revision : 0;
    this._draft = card && card.draft ? Object.assign({}, card.draft) : null;
    this.setData({
      sourceLabels: sourceLabels,
      sourceIndex: this.data.sourceIndex || 0,
      cardLabels: cardLabels,
      cardIndex: cardIndex,
      hasCard: !!card,
      cardName: (card && card.draft && card.draft.name) || '',
      cardSummary: (card && card.draft && card.draft.summary) || '',
      cardStatus: card ? cardStatus(card) : '',
      cardPublicUrl:
        card && card.published && card.status === 'active'
          ? creator.agentCardUrl(card.code)
          : '',
    });
  },

  applyInvite(invite) {
    this.setData({
      invite: invite,
      inviteActive: !!(invite && invite.active),
      inviteUrl: (invite && invite.url) || '',
      inviteStats: invite
        ? (invite.active ? '邀请可用' : '邀请已停用') +
          ' · 点击 ' +
          (invite.clicks || 0) +
          ' · 首次平台激活 ' +
          (invite.signups || 0)
        : '',
    });
  },

  load() {
    var self = this;
    self.setData({ loading: true, error: '', note: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return Promise.all([
          creator.fetchAgents(opened.token, self._owner),
          creator.fetchInvitation(opened.token, self._owner),
        ]);
      })
      .then(function (bundle) {
        if (!self._alive) return;
        self.applyLists(
          bundle[0].sources,
          bundle[0].cards,
          self._selectedCode
        );
        self.applyInvite(bundle[1]);
        self.setData({ loading: false });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          error: (err && err.message) || '读取失败',
        });
      });
  },

  reload() {
    var self = this;
    return Promise.all([
      creator.fetchAgents(this._token, this._owner),
      creator.fetchInvitation(this._token, this._owner),
    ]).then(function (bundle) {
      if (!self._alive) return;
      self.applyLists(bundle[0].sources, bundle[0].cards, self._selectedCode);
      self.applyInvite(bundle[1]);
    });
  },

  onSourcePick(e) {
    this.setData({ sourceIndex: Number(e.detail.value) });
  },

  onCardPick(e) {
    var index = Number(e.detail.value);
    this.setData({ cardIndex: index });
    this.applyLists(this._sources, this._cards, index > 0 ? this._cards[index - 1].code : '');
  },

  onCardName(e) {
    this.setData({ cardName: e.detail.value });
  },

  onCardSummary(e) {
    this.setData({ cardSummary: e.detail.value });
  },

  createCard() {
    var self = this;
    if (!this._token || this.data.busy) return;
    var idx = this.data.sourceIndex;
    if (!idx) {
      this.setData({ error: '请先选择已发布来源' });
      return;
    }
    var source = this._sources[idx - 1];
    if (!source) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .createAgent(this._token, this._owner, {
        source_kind: source.kind,
        source_ref: source.ref,
      })
      .then(function (result) {
        self._selectedCode =
          (result && result.card && result.card.code) || '';
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busy: false, note: '已创建 Agent 卡' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '创建失败',
        });
      });
  },

  saveCard() {
    var self = this;
    if (!this._token || !this._selectedCode || !this._draft || this.data.busy)
      return;
    var draft = Object.assign({}, this._draft, {
      name: String(this.data.cardName || '').trim(),
      summary: String(this.data.cardSummary || '').trim(),
    });
    this.setData({ busy: true, error: '', note: '' });
    creator
      .updateAgent(this._token, this._selectedCode, this._owner, {
        revision: this._revision,
        draft: draft,
      })
      .then(function (result) {
        if (result && result.card) {
          self._revision = result.card.revision;
          self._draft = result.card.draft;
        }
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busy: false, note: '卡片已保存' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '保存失败',
        });
      });
  },

  publishCard() {
    var self = this;
    if (!this._token || !this._selectedCode || !this._draft || this.data.busy)
      return;
    var draft = Object.assign({}, this._draft, {
      name: String(this.data.cardName || '').trim(),
      summary: String(this.data.cardSummary || '').trim(),
    });
    this.setData({ busy: true, error: '', note: '' });
    creator
      .updateAgent(this._token, this._selectedCode, this._owner, {
        revision: this._revision,
        draft: draft,
      })
      .then(function (result) {
        var revision =
          (result && result.card && result.card.revision) || self._revision;
        self._revision = revision;
        return creator.publishAgent(
          self._token,
          self._selectedCode,
          self._owner,
          revision
        );
      })
      .then(function () {
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busy: false, note: '卡片已发布' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '发布失败',
        });
      });
  },

  disableCard() {
    var self = this;
    if (!this._token || !this._selectedCode || this.data.busy) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .disableAgent(this._token, this._selectedCode, this._owner)
      .then(function () {
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busy: false, note: '卡片已下架' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '下架失败',
        });
      });
  },

  copyCardUrl() {
    var url = this.data.cardPublicUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制卡片链接', icon: 'success' });
      },
    });
  },

  generateInvite() {
    var self = this;
    if (!this._token || this.data.busy) return;
    var restoring = !!(this.data.invite && !this.data.inviteActive);
    this.setData({ busy: true, error: '', note: '' });
    creator
      .createInvitation(this._token, this._owner)
      .then(function () {
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({
          busy: false,
          note: restoring ? '已恢复邀请' : '已生成邀请链接',
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

  disableInvite() {
    var self = this;
    if (!this._token || this.data.busy) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .deleteInvitation(this._token, this._owner)
      .then(function () {
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busy: false, note: '邀请已停用' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '停用失败',
        });
      });
  },

  copyInviteUrl() {
    var url = this.data.inviteUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制邀请链接', icon: 'success' });
      },
    });
  },
});
