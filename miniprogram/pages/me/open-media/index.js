/**
 * 直链媒体播放页 · 对齐网页新 tab 打开音视频文件。
 * 不依赖业务域名；生产需把 CDN 主机登记到 downloadFile 合法域名。
 */
const pageAddress = require('../../../services/pageAddress');
const profileShare = require('../../../services/profileShare');
const openLink = require('../../../services/openLink');

Page({
  data: {
    kind: 'video',
    title: '',
    note: '',
    href: '',
    displayUrl: '',
    playing: false,
    errorHint: '',
  },

  onLoad(query) {
    var href = '';
    var title = '';
    var note = '';
    var kind = 'video';
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
      kind = query && query.kind ? String(query.kind) : 'video';
    } catch (e) {
      kind = 'video';
    }
    if (kind !== 'audio' && kind !== 'video') {
      kind = openLink.classifyMedia(href) === 'audio' ? 'audio' : 'video';
    }

    if (!href || href.indexOf('https://') !== 0) {
      this.setData({
        title: '媒体不可用',
        errorHint: '该条目没有有效的 https 媒体地址。',
        href: '',
      });
      return;
    }

    this.setData({
      kind: kind,
      title: title || (kind === 'audio' ? '音频' : '视频'),
      note: note,
      href: href,
      displayUrl: pageAddress.displayHost(href) || href,
      errorHint: '',
    });
  },

  onUnload() {
    this.destroyAudio();
  },

  onHide() {
    this.destroyAudio();
  },

  onVideoError() {
    this.setData({
      errorHint:
        '暂时无法在小程序内播放。可将链接复制到浏览器打开（与网页版同一地址）。',
    });
  },

  toggleAudio() {
    var href = this.data.href;
    if (!href || this.data.kind !== 'audio') return;
    if (this._audio && this.data.playing) {
      this.destroyAudio();
      this.setData({ playing: false });
      return;
    }
    this.playAudio(href);
  },

  playAudio(url) {
    var self = this;
    this.destroyAudio();
    var audio = wx.createInnerAudioContext();
    this._audio = audio;
    audio.src = url;
    audio.obeyMuteSwitch = false;
    audio.onPlay(function () {
      self.setData({ playing: true, errorHint: '' });
    });
    audio.onEnded(function () {
      self.setData({ playing: false });
      self.destroyAudio();
    });
    audio.onStop(function () {
      self.setData({ playing: false });
    });
    audio.onError(function () {
      self.setData({
        playing: false,
        errorHint:
          '暂时无法播放。可复制链接到浏览器打开（与网页版同一地址）。',
      });
      self.destroyAudio();
    });
    try {
      audio.play();
    } catch (e) {
      this.setData({
        playing: false,
        errorHint: '暂时无法播放。可复制链接到浏览器打开。',
      });
      this.destroyAudio();
    }
  },

  destroyAudio() {
    if (!this._audio) return;
    try {
      this._audio.stop();
    } catch (e) {}
    try {
      this._audio.destroy();
    } catch (e) {}
    this._audio = null;
  },

  copyForBrowser() {
    var href = this.data.href;
    if (!href) return;
    var self = this;
    profileShare
      .copyShareUrlFallback(href, '已复制，请到浏览器打开')
      .then(function (note) {
        wx.showToast({ title: note, icon: 'none' });
        self.setData({ errorHint: note });
      })
      .catch(function () {
        wx.showToast({ title: '复制失败，请长按地址复制', icon: 'none' });
      });
  },
});
