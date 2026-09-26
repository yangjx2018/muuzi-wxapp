/**
 * 条目打开页 · 对齐 App target=_blank。
 * 可挂业务域名时用 web-view；直链图可页内预览；否则展示查看页，禁止一进页就复制。
 */
const pageAddress = require('../../../services/pageAddress');
const profileShare = require('../../../services/profileShare');
const openLink = require('../../../services/openLink');

Page({
  data: {
    title: '',
    note: '',
    href: '',
    displayUrl: '',
    embedUrl: '',
    embedAllowed: false,
    canRetryEmbed: false,
    kind: 'page',
    isImage: false,
    hint:
      '微信要求业务域名后才能在小程序内嵌打开网页。未登记时请用浏览器打开同一地址（与 App 打开外链一致）。',
  },

  onLoad(query) {
    var href = '';
    var title = '';
    var note = '';
    var kindHint = '';
    try {
      href = query && query.url ? decodeURIComponent(String(query.url)) : '';
    } catch (e) {
      href = '';
    }
    try {
      title = query && query.title ? decodeURIComponent(String(query.title)) : '';
    } catch (e) {
      title = '';
    }
    try {
      note = query && query.note ? decodeURIComponent(String(query.note)) : '';
    } catch (e) {
      note = '';
    }
    try {
      kindHint = query && query.kind ? String(query.kind) : '';
    } catch (e) {
      kindHint = '';
    }

    if (!href || href.indexOf('https://') !== 0) {
      this.setData({
        title: '链接不可用',
        hint: '该条目没有有效的 https 地址。',
        href: '',
        displayUrl: '',
        embedAllowed: false,
        isImage: false,
      });
      return;
    }

    var kind = kindHint || openLink.classifyMedia(href);
    var isImage = kind === 'image' || openLink.isDirectImage(href);
    var canEmbed = !isImage && openLink.canEmbedUrl(href);
    var hint;
    if (isImage) {
      hint = '可全屏查看图片；若失败请复制后在浏览器打开同一地址。';
    } else if (canEmbed) {
      hint = '正在小程序内打开（与 App 打开外链一致）。';
    } else {
      hint =
        '当前域名未加入小程序业务域名，无法内嵌网页。可复制后在系统浏览器打开（与网页版同一地址）。';
    }

    this.setData({
      title: title || (isImage ? '查看图片' : '打开链接'),
      note: note,
      href: href,
      displayUrl: pageAddress.displayHost(href) || href,
      embedAllowed: canEmbed,
      embedUrl: canEmbed ? href : '',
      canRetryEmbed: canEmbed,
      kind: kind,
      isImage: isImage,
      hint: hint,
    });
  },

  onWebViewError() {
    this.setData({
      embedAllowed: false,
      embedUrl: '',
      canRetryEmbed: false,
      hint:
        '网页未能在小程序内打开。请复制链接后在浏览器查看（与 App 外链同一地址）。',
    });
  },

  retryEmbed() {
    var href = this.data.href;
    if (!href || !openLink.canEmbedUrl(href)) {
      wx.showToast({ title: '当前无法内嵌打开', icon: 'none' });
      return;
    }
    this.setData({
      embedAllowed: true,
      embedUrl: href,
      hint: '正在小程序内打开…',
    });
  },

  previewFull() {
    var href = this.data.href;
    if (!href) return;
    wx.previewImage({
      current: href,
      urls: [href],
      fail: function () {
        wx.showToast({
          title: '无法全屏预览，请复制到浏览器',
          icon: 'none',
        });
      },
    });
  },

  copyForBrowser() {
    var href = this.data.href;
    if (!href) return;
    var self = this;
    profileShare
      .copyShareUrlFallback(href, '已复制，请到浏览器打开')
      .then(function (note) {
        wx.showToast({ title: note, icon: 'none' });
        self.setData({ hint: note });
      })
      .catch(function () {
        wx.showToast({ title: '复制失败，请长按地址复制', icon: 'none' });
      });
  },
});
