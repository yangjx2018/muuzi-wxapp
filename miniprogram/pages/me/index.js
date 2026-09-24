/**
 * 「我」Tab 主页壳 · 对齐 ProfileScreen（非 settings）
 * M2.1：身份 / 分享 / 地址 / Links·Shop / 工具条 / 账号切换
 */
const session = require('../../services/session');
const creator = require('../../services/creator');
const pageAddress = require('../../services/pageAddress');
const profileShare = require('../../services/profileShare');
const qrcodeDraw = require('../../utils/qrcode-draw');
const store = require('../../adapters/secure-store');

function localpart(userId) {
  if (!userId) return 'me';
  return String(userId).split(':', 1)[0].replace(/^@/, '') || 'me';
}

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

Page({
  data: {
    loading: true,
    platformError: '',
    displayName: '',
    portrait: '',
    portraitLetter: 'M',
    verified: false,
    nodeLabel: '',
    userId: '',
    slug: '',
    pageUrl: '',
    addressLabel: '设置你的个人主页地址',
    // sheets
    accountsOpen: false,
    shareOpen: false,
    shareBusy: false,
    shareNote: '',
    shareUrl: '',
    shareCard: null,
    shareAvailability: '',
    shareMissing: false,
    showBio: false,
    showQr: false,
    showShareCard: false,
    bio: '',
    qrImage: '',
    switchBusy: false,
    switchError: '',
  },

  _alive: true,
  _gen: 0,
  _openShareWhenReady: false,

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    this.loadPlatform();
    this.consumeOpenShare();
  },

  consumeOpenShare() {
    if (store.get('me_open_share') !== '1') return;
    store.remove('me_open_share');
    // 等 loadPlatform 完成后再开分享面板，避免空 slug/url 锁死「地址暂不可用」
    this._openShareWhenReady = true;
    if (!this.data.loading && (this.data.slug || this.data.pageUrl || this.data.platformError)) {
      this.openShare();
    }
  },

  onHide() {
    this._alive = false;
  },

  onUnload() {
    this._alive = false;
  },

  noop() {},

  isPagePublished(page) {
    return !!(page && (page.published_at || page.published));
  },

  applyShareUrl(url, extras) {
    var patch = Object.assign(
      {
        shareUrl: url || '',
        shareMissing: false,
        shareAvailability: url
          ? ''
          : this.data.slug
            ? '这份主页仍是草稿，发布后才能生成可访问的链接和二维码。'
            : '请先设置并发布主页后再分享。',
      },
      extras || {}
    );
    if (url) {
      patch.pageUrl = url;
      patch.addressLabel = url;
    }
    this.setData(patch);
    if (url) this.refreshShareCard(url);
  },

  /**
   * 对齐 App ProfileShareSheet：无 initialUrl 时总是重新拉 page + resolve。
   * 已发布但 share-link 失败时回退候选 https 地址（对齐 edit-home.refreshPageAddress）。
   */
  resolveShareForSheet() {
    var self = this;
    var existing = this.data.pageUrl || this.data.shareUrl || '';
    if (existing) {
      this.applyShareUrl(existing);
      pageAddress
        .resolveShareAddress(existing)
        .then(function (resolved) {
          if (!self._alive || !self.data.shareOpen) return;
          self.applyShareUrl(resolved);
        })
        .catch(function () {
          /* 保留已有候选地址 */
        });
      return;
    }

    this.setData({
      shareAvailability: '正在检查主页地址…',
      shareMissing: false,
    });

    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return creator.fetchPage(opened.token).then(function (page) {
          return { opened: opened, page: page };
        });
      })
      .then(function (bundle) {
        if (!self._alive || !self.data.shareOpen) return;
        var page = bundle.page;
        var opened = bundle.opened;
        var slug =
          (opened && opened.creator && opened.creator.slug) ||
          (page && page.slug) ||
          self.data.slug ||
          '';
        var name =
          (page &&
            page.draft &&
            page.draft.display_name &&
            page.draft.display_name.trim()) ||
          '';
        if (name === '我的 MuuZi') name = '';
        var patch = { slug: slug };
        if (name) {
          patch.displayName = name;
          patch.portraitLetter = name.slice(0, 1).toUpperCase();
          patch.bio = name + ' · 我的 MuuZi 主页';
        }
        if (page && page.draft && page.draft.portrait_url) {
          patch.portrait = page.draft.portrait_url;
        }
        self.setData(patch);

        if (!slug) {
          self.setData({
            shareAvailability: '请先设置并发布主页后再分享。',
          });
          return;
        }
        if (!self.isPagePublished(page)) {
          self.setData({
            shareAvailability:
              '这份主页仍是草稿，发布后才能生成可访问的链接和二维码。',
          });
          return;
        }

        var candidate =
          (page && page.page_url) || creator.pageUrlFor(slug);
        return pageAddress
          .resolveShareAddress(candidate)
          .then(function (resolved) {
            if (!self._alive || !self.data.shareOpen) return;
            self.applyShareUrl(resolved);
          })
          .catch(function () {
            if (!self._alive || !self.data.shareOpen) return;
            // 已发布：保留官方候选链，选项可复制/二维码/打开
            self.applyShareUrl(candidate);
          });
      })
      .catch(function () {
        if (!self._alive || !self.data.shareOpen) return;
        self.setData({
          shareAvailability:
            '暂时无法读取已发布主页，请稍后重新打开分享面板。',
        });
      });
  },

  loadPlatform() {
    var self = this;
    var snap = session.snapshot();
    var gen = ++this._gen;
    var fallbackName = localpart(snap.matrixUserId);
    self.setData({
      loading: true,
      platformError: '',
      userId: snap.matrixUserId || '',
      nodeLabel:
        ((snap.node && (snap.node.company_name || snap.node.brandName)) ||
          '') +
        (snap.nodeDomain ? ' · ' + snap.nodeDomain : ''),
      displayName: fallbackName,
      portraitLetter: (fallbackName || 'M').slice(0, 1).toUpperCase(),
      addressLabel: '设置你的个人主页地址',
      pageUrl: '',
      slug: '',
      verified: false,
      portrait: '',
    });

    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        if (!self._alive || self._gen !== gen) return null;
        return allSettled([
          creator.fetchPage(opened.token).catch(function () {
            return null;
          }),
          creator.fetchVerification(opened.token).catch(function () {
            return null;
          }),
          Promise.resolve(opened),
        ]);
      })
      .then(function (bundle) {
        if (!bundle || !self._alive || self._gen !== gen) return;
        var page =
          bundle[0].status === 'fulfilled' ? bundle[0].value : null;
        var verification =
          bundle[1].status === 'fulfilled' ? bundle[1].value : null;
        var opened =
          bundle[2].status === 'fulfilled' ? bundle[2].value : null;
        // 对齐 App：slug 优先取 creator.slug
        var slug =
          (opened && opened.creator && opened.creator.slug) ||
          (page && page.slug) ||
          '';
        var name =
          (page &&
            page.draft &&
            page.draft.display_name &&
            page.draft.display_name.trim()) ||
          '';
        if (name === '我的 MuuZi') name = '';
        var displayName = name || localpart(snap.matrixUserId);
        var portrait =
          (page && page.draft && page.draft.portrait_url) || '';
        var verified = !!(verification && verification.verified);
        self.setData({
          loading: false,
          slug: slug,
          displayName: displayName,
          portrait: portrait,
          portraitLetter: (displayName || 'M').slice(0, 1).toUpperCase(),
          verified: verified,
          bio: displayName + ' · 我的 MuuZi 主页',
          addressLabel: slug
            ? '正在解析主页地址…'
            : '设置你的个人主页地址',
        });

        var finishShareGate = function () {
          if (self._openShareWhenReady || self.data.shareOpen) {
            self._openShareWhenReady = false;
            if (self.data.shareOpen) {
              self.resolveShareForSheet();
            } else {
              self.openShare();
            }
          }
        };

        if (!slug) {
          finishShareGate();
          return;
        }
        var candidate =
          (page && page.page_url) || creator.pageUrlFor(slug);
        var published = self.isPagePublished(page);
        return pageAddress
          .resolveShareAddress(candidate)
          .then(function (url) {
            if (!self._alive || self._gen !== gen) return;
            self.setData({
              pageUrl: url,
              addressLabel: url,
            });
            finishShareGate();
          })
          .catch(function () {
            if (!self._alive || self._gen !== gen) return;
            if (published) {
              // 对齐 edit-home：已发布则保留候选地址，不把分享入口打成「暂不可用」
              self.setData({
                pageUrl: candidate,
                addressLabel: candidate,
              });
            } else {
              self.setData({
                pageUrl: '',
                addressLabel: '主页尚未发布，发布后可分享',
              });
            }
            finishShareGate();
          });
      })
      .catch(function (err) {
        if (!self._alive || self._gen !== gen) return;
        self.setData({
          loading: false,
          platformError:
            (err && err.message) || '连接平台失败',
          addressLabel: '连不上平台',
        });
        if (self._openShareWhenReady) {
          self._openShareWhenReady = false;
          self.openShare();
        }
      });
  },

  openAccounts() {
    this.setData({
      accountsOpen: true,
      switchBusy: false,
      switchError: '',
    });
  },

  closeAccounts() {
    this.setData({ accountsOpen: false });
  },

  switchAccount() {
    var self = this;
    if (this.data.switchBusy) return;
    this.setData({ switchBusy: true, switchError: '' });
    try {
      session.signOutAndRelaunch();
    } catch (e) {
      self.setData({
        switchBusy: false,
        switchError: '暂时无法切换，请重试',
      });
    }
  },

  openShare() {
    this._openShareWhenReady = false;
    if (this.data.loading) {
      this._openShareWhenReady = true;
      this.setData({
        shareOpen: true,
        shareNote: '',
        shareMissing: false,
        showBio: false,
        showQr: false,
        showShareCard: false,
        qrImage: '',
        shareBusy: false,
        shareUrl: '',
        shareCard: null,
        shareAvailability: '正在检查主页地址…',
        bio: this.data.displayName + ' · 我的 MuuZi 主页',
      });
      return;
    }
    var url = this.data.pageUrl || '';
    this.setData({
      shareOpen: true,
      shareNote: '',
      shareMissing: false,
      showBio: false,
      showQr: false,
      showShareCard: false,
      qrImage: '',
      shareBusy: false,
      shareUrl: url,
      shareCard: null,
      shareAvailability: url ? '' : '正在检查主页地址…',
      bio: this.data.displayName + ' · 我的 MuuZi 主页',
    });
    this.resolveShareForSheet();
  },

  refreshShareCard(url) {
    var self = this;
    var slug =
      this.data.slug || profileShare.slugFromShareUrl(url || '') || '';
    if (!url || !slug) return;
    creator
      .fetchPublicPage(slug)
      .then(function (publicPage) {
        if (!self.data.shareOpen) return;
        var page = publicPage && publicPage.page;
        if (!page || !page.published || !page.published_at) return;
        var p = page.published;
        self.setData({
          shareCard: {
            url: url,
            title: (p.display_name || page.slug) + ' · MuuZi',
            text: String(p.headline || p.bio || '').slice(0, 300),
            image:
              p.portrait_url ||
              p.cover_url ||
              (p.profile_covers &&
                p.profile_covers[0] &&
                p.profile_covers[0].url) ||
              '',
          },
        });
      })
      .catch(function () {
        /* 分享在预览元数据不可用时仍可进行 */
      });
  },

  closeShare() {
    this.setData({ shareOpen: false, shareBusy: false });
  },

  requireShareUrl() {
    if (this.data.shareUrl) return true;
    this.setData({ shareMissing: true });
    return false;
  },

  copyShareUrl() {
    if (!this.requireShareUrl()) return;
    var self = this;
    wx.setClipboardData({
      data: this.data.shareUrl,
      success: function () {
        self.setData({ shareNote: '链接已复制' });
      },
      fail: function () {
        self.setData({ shareNote: '复制失败，请长按地址复制' });
      },
    });
  },

  toggleBio() {
    this.setData({ showBio: !this.data.showBio });
  },

  onBio(e) {
    this.setData({ bio: e.detail.value });
  },

  copyBio() {
    var text =
      this.data.bio +
      (this.data.shareUrl ? '\n' + this.data.shareUrl : '');
    var self = this;
    wx.setClipboardData({
      data: text,
      success: function () {
        self.setData({
          shareNote: '简介已复制，请粘贴到社交平台的简介栏',
        });
      },
      fail: function () {
        self.setData({ shareNote: '复制失败，请重试' });
      },
    });
  },

  toggleQr() {
    var self = this;
    if (!this.requireShareUrl()) return;
    var next = !this.data.showQr;
    this.setData({ showQr: next });
    if (!next || this.data.qrImage) return;
    qrcodeDraw
      .drawUrlToTempFile(self, 'meShareQr', this.data.shareUrl)
      .then(function (img) {
        if (self.data.shareOpen) self.setData({ qrImage: img });
      })
      .catch(function () {
        if (self.data.shareOpen) {
          self.setData({ shareNote: '二维码暂时无法生成' });
        }
      });
  },

  toggleShareCard() {
    this.setData({ showShareCard: !this.data.showShareCard });
  },

  copyShareCard() {
    var name = this.data.displayName || this.data.slug || '我的主页';
    var url = this.data.shareUrl || '';
    var escape = function (value) {
      return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
    };
    var card =
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:' +
      escape(name) +
      '\r\n' +
      (url ? 'URL:' + escape(url) + '\r\n' : '') +
      'END:VCARD\r\n';
    var self = this;
    wx.setClipboardData({
      data: card,
      success: function () {
        self.setData({
          shareNote: '名片内容已复制，可粘贴到通讯录或备忘录',
        });
      },
      fail: function () {
        self.setData({ shareNote: '名片复制失败，请重试' });
      },
    });
  },

  shareToOthers() {
    if (!this.requireShareUrl()) return;
    // App: shareProfileLink → 系统分享；小程序由 open-type="share" 拉起好友分享
    var self = this;
    this.setData({ shareBusy: true, shareNote: '正在打开分享…' });
    setTimeout(function () {
      if (!self.data.shareOpen) return;
      // 未弹出系统分享面板时，回退复制（对齐 App navigator.share 失败 → copied）
      if (self.data.shareBusy) {
        wx.setClipboardData({
          data: self.data.shareUrl,
          success: function () {
            self.setData({
              shareBusy: false,
              shareNote: '链接已复制',
            });
          },
          fail: function () {
            self.setData({
              shareBusy: false,
              shareNote: '分享暂不可用，请复制链接',
            });
          },
        });
      }
    }, 1600);
  },

  openSharePage() {
    if (!this.requireShareUrl()) return;
    var self = this;
    this.setData({ shareNote: '正在打开主页…' });
    profileShare
      .openHomePage(this.data.shareUrl)
      .then(function () {
        if (!self.data.shareOpen) return;
        self.setData({ shareNote: '', shareOpen: false });
      })
      .catch(function () {
        return profileShare
          .copyShareUrlFallback(
            self.data.shareUrl,
            '无法直接打开，链接已复制，请在浏览器打开'
          )
          .then(function (note) {
            if (!self.data.shareOpen) return;
            self.setData({ shareNote: note });
          });
      })
      .catch(function () {
        if (!self.data.shareOpen) return;
        self.setData({ shareNote: '打开失败，请复制链接后在浏览器打开' });
      });
  },

  onShareAppMessage() {
    this.setData({ shareBusy: false, shareNote: '' });
    var name = this.data.displayName || this.data.slug || '我的主页';
    var card = this.data.shareCard;
    var url = this.data.shareUrl || this.data.pageUrl || '';
    return profileShare.friendShareMessage({
      url: url,
      slug: this.data.slug,
      title: (card && card.title) || name + ' · MuuZi',
      text: card && card.text,
      imageUrl:
        (card && card.image) || this.data.portrait || '',
    });
  },

  goEditProfile() {
    wx.navigateTo({ url: '/pages/me/profile/index' });
  },

  goShop() {
    wx.navigateTo({ url: '/pages/me/shop/index' });
  },

  goCompose() {
    wx.navigateTo({ url: '/pages/me/compose/index' });
  },

  goDesign() {
    wx.navigateTo({ url: '/pages/me/edit-home/index' });
  },

  goLinks() {
    wx.navigateTo({ url: '/pages/me/edit-home/index?section=links' });
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/me/settings/index' });
  },

  dismissMissing() {
    this.setData({ shareMissing: false });
  },
});
