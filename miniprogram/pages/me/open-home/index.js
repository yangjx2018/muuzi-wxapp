/**
 * 打开已发布主页 · 对齐 App「看成品」
 * 真值对照：docs/OPEN_HOME_APP_PARITY.md
 *
 * - 业务域名命中：挂整页 web-view（页内链接与 App SSR 一致）
 * - 否则：原生成品预览按 section 类型渲染；点击打开或播放，禁止默认复制冒充打开
 */
const creator = require('../../../services/creator');
const pageAddress = require('../../../services/pageAddress');
const profileShare = require('../../../services/profileShare');
const openLinkService = require('../../../services/openLink');
const homePreview = require('../../../services/homePreview');

Page({
  data: {
    loading: true,
    homeUrl: '',
    embedAllowed: false,
    fallbackUrl: '',
    fallbackDisplay: '',
    error: '',
    title: '成品主页',
    hint: '',
    previewReady: false,
    previewModel: null,
    previewName: '',
    previewPortrait: '',
    previewSlug: '',
    copied: false,
    shareBusy: false,
    audioPlayingKey: '',
    audioTitle: '',
  },

  _audio: null,

  onLoad(query) {
    var self = this;
    var rawUrl = query && query.url ? decodeURIComponent(String(query.url)) : '';
    var slug = query && query.slug ? String(query.slug).trim() : '';
    var forceCopy = query && (query.force === 'copy' || query.mode === 'copy');

    try {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage'],
      });
    } catch (e) {
      /* ignore */
    }

    function finishNative(href, message) {
      var display = pageAddress.displayHost(href);
      self.setData({
        loading: false,
        homeUrl: '',
        embedAllowed: false,
        fallbackUrl: href,
        fallbackDisplay: display,
        error: '',
        title: '成品主页',
        hint:
          message ||
          '下方为已发布主页预览（与 App「看成品」同一内容）。条目可点击打开或播放；需要时也可复制主页链接到浏览器。',
      });
      self.loadNativePreview(href, slug);
    }

    function applyUrl(href) {
      try {
        var plan = profileShare.homeOpenPlan(href);
        if (!forceCopy && plan.mode === 'embed' && plan.homeUrl) {
          if (!profileShare.canEmbedHomeUrl(plan.homeUrl)) {
            finishNative(plan.fallbackUrl || href);
            return;
          }
          self.setData({
            loading: false,
            homeUrl: plan.homeUrl,
            embedAllowed: true,
            fallbackUrl: plan.fallbackUrl,
            fallbackDisplay: pageAddress.displayHost(plan.fallbackUrl),
            error: '',
            title: '成品主页',
            hint: '',
            previewReady: false,
          });
          return;
        }
        finishNative(plan.fallbackUrl || href);
      } catch (e) {
        self.setData({
          loading: false,
          homeUrl: '',
          embedAllowed: false,
          fallbackUrl: href || '',
          fallbackDisplay: pageAddress.displayHost(href || ''),
          error: '主页地址无效',
          title: '无法打开主页',
          hint: '请返回编辑页确认已发布，或稍后重试。',
          previewReady: false,
        });
      }
    }

    if (rawUrl) {
      applyUrl(rawUrl);
      return;
    }

    if (!slug) {
      this.setData({
        loading: false,
        error: '缺少主页地址',
        title: '无法打开主页',
        hint: '请从编辑主页重新打开「看成品」。',
        previewReady: false,
      });
      return;
    }

    var candidate = creator.pageUrlFor(slug);
    pageAddress
      .resolveShareAddress(candidate)
      .then(function (resolved) {
        applyUrl(resolved);
      })
      .catch(function () {
        try {
          applyUrl(candidate);
        } catch (e) {
          self.setData({
            loading: false,
            fallbackUrl: candidate,
            fallbackDisplay: pageAddress.displayHost(candidate),
            error: '暂时无法打开主页',
            title: '无法打开主页',
            hint: '请稍后重试，或复制下方地址到浏览器打开。',
            previewReady: false,
          });
        }
      });
  },

  onUnload() {
    this.stopAudio();
  },

  onHide() {
    this.stopAudio();
  },

  loadNativePreview(href, hintSlug) {
    var self = this;
    var slug =
      String(hintSlug || '').trim() ||
      profileShare.slugFromShareUrl(href || '') ||
      '';
    if (!slug) {
      this.setData({ previewReady: false, previewModel: null });
      return;
    }
    creator
      .fetchPublicPage(slug)
      .then(function (publicPage) {
        var page = publicPage && publicPage.page;
        if (!page || !page.published) {
          self.setData({ previewReady: false, previewModel: null });
          return;
        }
        var p = page.published;
        var model = homePreview.viewModel(p, {
          slug: page.slug || slug,
          draft: false,
        });
        self.setData({
          previewReady: true,
          previewModel: model,
          previewName: model.name,
          previewPortrait: model.portrait || '',
          previewSlug: page.slug || slug,
        });
      })
      .catch(function () {
        self.setData({ previewReady: false, previewModel: null });
      });
  },

  onWebViewError() {
    var url = this.data.homeUrl || this.data.fallbackUrl;
    this.setData({
      loading: false,
      homeUrl: '',
      embedAllowed: false,
    });
    if (!url) {
      this.setData({
        error: '暂时无法打开主页',
        title: '无法打开主页',
        hint: '请返回后重试。',
        previewReady: false,
      });
      return;
    }
    this.setData({
      fallbackUrl: url,
      fallbackDisplay: pageAddress.displayHost(url),
      error: '',
      title: '成品主页',
      hint:
        '网页未能在小程序内打开。下方为已发布主页预览；条目可点击打开或播放。',
    });
    this.loadNativePreview(url, '');
  },

  copyFallback() {
    var url = this.data.fallbackUrl || this.data.homeUrl;
    if (!url) return;
    var self = this;
    profileShare
      .copyShareUrlFallback(url, '主页链接已复制，请在浏览器打开')
      .then(function (note) {
        self.setData({ copied: true });
        wx.showToast({ title: note, icon: 'none' });
      })
      .catch(function () {
        wx.showToast({ title: '复制失败，请重试', icon: 'none' });
      });
  },

  onShareTap() {
    var self = this;
    var url = this.data.fallbackUrl || this.data.homeUrl;
    if (!url) {
      wx.showToast({ title: '主页地址暂不可用', icon: 'none' });
      return;
    }
    this.setData({ shareBusy: true });
    setTimeout(function () {
      if (!self.data.shareBusy) return;
      profileShare
        .copyShareUrlFallback(url, '链接已复制')
        .then(function (note) {
          self.setData({ shareBusy: false, copied: true });
          wx.showToast({ title: note, icon: 'none' });
        })
        .catch(function () {
          self.setData({ shareBusy: false });
          wx.showToast({ title: '分享暂不可用，请复制链接', icon: 'none' });
        });
    }, 1600);
  },

  onShareAppMessage() {
    this.setData({ shareBusy: false });
    var url = this.data.fallbackUrl || this.data.homeUrl || '';
    var slug =
      this.data.previewSlug || profileShare.slugFromShareUrl(url) || '';
    return profileShare.friendShareMessage({
      title: this.data.previewName
        ? this.data.previewName + ' · MuuZi'
        : 'MuuZi',
      slug: slug,
      url: url,
      imageUrl: this.data.previewPortrait || '',
    });
  },

  /** 组件事件：打开条目 */
  onPreviewOpenItem(e) {
    var detail = (e && e.detail) || {};
    this.openLink({
      currentTarget: {
        dataset: {
          url: detail.url || '',
          title: detail.title || '',
          note: detail.note || '',
        },
      },
    });
  },

  onPreviewAudioTap(e) {
    var detail = (e && e.detail) || {};
    this.onAudioTap({
      currentTarget: {
        dataset: {
          key: detail.key || '',
          url: detail.url || '',
          title: detail.title || '',
          direct: detail.direct,
          note: detail.note || '',
        },
      },
    });
  },

  /** 社交 / 链接 / 店铺 / 视频：打开（对齐 App target=_blank） */
  openLink(e) {
    var ds = (e.currentTarget && e.currentTarget.dataset) || {};
    var url = ds.url;
    var title = ds.title || '';
    var note = ds.note || '';
    if (!url) {
      wx.showToast({ title: '链接不可用', icon: 'none' });
      return;
    }
    var href = String(url);
    if (href.indexOf('mailto:') === 0) {
      var mail = href.slice(7);
      profileShare
        .copyShareUrlFallback(mail, '邮箱已复制')
        .then(function (msg) {
          wx.showToast({ title: msg, icon: 'none' });
        })
        .catch(function () {
          wx.showToast({ title: '复制失败', icon: 'none' });
        });
      return;
    }
    if (href.indexOf('https://') !== 0) {
      wx.showToast({ title: '链接不可用', icon: 'none' });
      return;
    }
    openLinkService.openHttps(href, { title: title, note: note }).catch(function () {
      wx.showToast({ title: '无法打开', icon: 'none' });
    });
  },

  /** 音频：直链本页播放；否则打开试听页 */
  onAudioTap(e) {
    var ds = (e.currentTarget && e.currentTarget.dataset) || {};
    var key = ds.key || '';
    var url = ds.url || '';
    var title = ds.title || '音频';
    var direct = ds.direct === true || ds.direct === 'true';
    if (!url) {
      wx.showToast({ title: '音频不可用', icon: 'none' });
      return;
    }
    if (!direct) {
      this.openLink(e);
      return;
    }
    if (this.data.audioPlayingKey === key) {
      this.stopAudio();
      return;
    }
    this.playAudio(key, url, title);
  },

  playAudio(key, url, title) {
    var self = this;
    this.stopAudio();
    var audio = wx.createInnerAudioContext();
    this._audio = audio;
    audio.src = url;
    audio.obeyMuteSwitch = false;
    audio.onPlay(function () {
      self.setData({ audioPlayingKey: key, audioTitle: title });
    });
    audio.onEnded(function () {
      self.setData({ audioPlayingKey: '', audioTitle: '' });
      self.destroyAudio();
    });
    audio.onStop(function () {
      self.setData({ audioPlayingKey: '', audioTitle: '' });
    });
    audio.onError(function () {
      self.setData({ audioPlayingKey: '', audioTitle: '' });
      self.destroyAudio();
      wx.showToast({ title: '暂时无法播放，改为打开原链接', icon: 'none' });
      openLinkService.openHttps(url, { title: title }).catch(function () {});
    });
    try {
      audio.play();
    } catch (err) {
      this.destroyAudio();
      openLinkService.openHttps(url, { title: title }).catch(function () {});
    }
  },

  stopAudio() {
    if (!this._audio) {
      this.setData({ audioPlayingKey: '', audioTitle: '' });
      return;
    }
    try {
      this._audio.stop();
    } catch (e) {
      /* ignore */
    }
    this.destroyAudio();
    this.setData({ audioPlayingKey: '', audioTitle: '' });
  },

  destroyAudio() {
    if (!this._audio) return;
    try {
      this._audio.destroy();
    } catch (e) {
      /* ignore */
    }
    this._audio = null;
  },
});
