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

var SOCIAL_ICON_BY_KIND = {
  instagram: '/assets/social-instagram.png',
  youtube: '/assets/social-youtube.png',
  tiktok: '/assets/social-tiktok.png',
  douyin: '/assets/social-tiktok.png',
  x: '/assets/icon-ui-x-social.png',
  email: '/assets/social-email.png',
  website: '/assets/social-link.png',
  link: '/assets/social-link.png',
};

var SOCIAL_LABEL_BY_KIND = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  douyin: '抖音',
  x: 'X',
  email: '邮箱',
  website: '网站',
  link: '链接',
};

function letterOf(name, slug) {
  var raw = String(name || slug || 'M').trim();
  return raw ? raw.charAt(0).toUpperCase() : 'M';
}

function formatPrice(priceMinor, currency) {
  var n = Number(priceMinor);
  if (!n || n <= 0) return '询价';
  var yuan = (n / 100).toFixed(2).replace(/\.00$/, '');
  var cur = String(currency || 'CNY').toUpperCase();
  if (cur === 'CNY' || cur === 'RMB') return '¥' + yuan;
  return yuan + ' ' + cur;
}

function socialsFromPublished(published) {
  var socials = (published && published.socials) || [];
  if (!Array.isArray(socials)) return [];
  var out = [];
  for (var i = 0; i < socials.length; i++) {
    var s = socials[i] || {};
    var raw = String(s.url || '').trim();
    if (!raw) continue;
    var kind = String(s.kind || 'link').toLowerCase();
    var url = raw;
    if (kind === 'email') {
      if (raw.indexOf('mailto:') === 0) {
        url = raw;
      } else if (raw.indexOf('@') > 0 && raw.indexOf('https://') !== 0) {
        url = 'mailto:' + raw;
      } else if (raw.indexOf('https://') !== 0) {
        continue;
      }
    } else if (url.indexOf('https://') !== 0) {
      continue;
    }
    out.push({
      kind: kind + '_' + i,
      label: s.label || SOCIAL_LABEL_BY_KIND[kind] || kind,
      url: url,
      icon: SOCIAL_ICON_BY_KIND[kind] || '/assets/social-link.png',
    });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * 保留 section.type 与条目字段，对齐 App SECTION_RENDERERS。
 */
function sectionsFromPublished(published) {
  var sections = (published && published.sections) || [];
  if (!Array.isArray(sections)) return [];
  var out = [];
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i] || {};
    if (s.visible === false) continue;
    if (s.collection_id) continue;
    var type = String(s.type || 'links');
    var items = Array.isArray(s.items) ? s.items : [];
    var visibleItems = [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j] || {};
      if (it.setup === 'pending') continue;
      var url = String(it.url || it.href || '').trim();
      var title = it.title || it.label || it.name || '';
      var note = it.note || it.body || it.description || it.desc || '';
      var body = it.body || '';
      var mapped = {
        key: (s.id || i) + '_' + j,
        label: it.label || title || '链接',
        title: title || it.label || '条目',
        note: note,
        body: body,
        url: url,
        image_url: it.image_url || '',
        cover_url: it.cover_url || '',
        link_kind: it.link_kind || '',
        link_label: it.link_label || '',
        price_text:
          type === 'shop' && it.link_kind !== 'store'
            ? formatPrice(it.price_minor, it.currency)
            : it.link_kind === 'store'
              ? '访问店铺 →'
              : '',
        duration: it.duration || '',
        directAudio: type === 'audio' && openLinkService.isDirectAudio(url),
        card_kind: it.card_kind || '',
        hasUrl: url.indexOf('https://') === 0,
      };
      if (type === 'custom') {
        if (!mapped.title && !mapped.body && !mapped.hasUrl) continue;
      } else if (type === 'shop') {
        if (!mapped.title && !mapped.hasUrl) continue;
      } else if (type === 'audio') {
        if (!mapped.title && !mapped.hasUrl) continue;
      } else if (!mapped.hasUrl && !mapped.label) {
        continue;
      }
      visibleItems.push(mapped);
    }
    if (!visibleItems.length && !s.title) continue;
    out.push({
      id: s.id || 'sec_' + i,
      type: type,
      title: s.title || '',
      items: visibleItems,
    });
  }
  return out;
}

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
    previewName: '',
    previewHeadline: '',
    previewBio: '',
    previewPortrait: '',
    previewLetter: 'M',
    previewSections: [],
    previewSocials: [],
    previewShowBranding: true,
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
      this.setData({ previewReady: false });
      return;
    }
    creator
      .fetchPublicPage(slug)
      .then(function (publicPage) {
        var page = publicPage && publicPage.page;
        if (!page || !page.published) {
          self.setData({ previewReady: false });
          return;
        }
        var p = page.published;
        var name = p.display_name || page.slug || slug;
        self.setData({
          previewReady: true,
          previewName: name,
          previewHeadline: p.headline || '',
          previewBio: p.bio || '',
          previewPortrait: p.portrait_url || '',
          previewLetter: letterOf(name, page.slug || slug),
          previewSections: sectionsFromPublished(p),
          previewSocials: socialsFromPublished(p),
          previewShowBranding: p.show_branding !== false,
          previewSlug: page.slug || slug,
        });
      })
      .catch(function () {
        self.setData({ previewReady: false });
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
