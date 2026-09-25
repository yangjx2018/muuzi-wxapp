/**
 * 编辑主页 · 对齐 App EditHomeScreen 主路径
 * M2.3：资料字段 / 头像上传 / 社交与链接 / 自动存草稿 / 发布
 * 复杂模板与作品库仍引导 Studio（复制链接，无 web-view）
 */
const session = require('../../../services/session');
const creator = require('../../../services/creator');
const skins = require('../../../services/pageSkins');
const pageAddress = require('../../../services/pageAddress');
const studioLinks = require('../../../services/studioLinks');
const contentCatalog = require('../../../services/contentCatalog');
const contentFields = require('../../../services/contentFields');
const qrcodeDraw = require('../../../utils/qrcode-draw');
const profileShare = require('../../../services/profileShare');

var SOCIAL_KINDS = [
  ['wechat', '微信'],
  ['xiaohongshu', '小红书'],
  ['douyin', '抖音'],
  ['bilibili', '哔哩哔哩'],
  ['weibo', '微博'],
  ['instagram', 'Instagram'],
  ['x', 'X'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
  ['github', 'GitHub'],
  ['website', '网站'],
  ['email', '邮件'],
  ['other', '其他'],
];

var STATUS_COPY = {
  saved: '已保存',
  dirty: '未保存',
  saving: '保存中…',
  failed: '保存失败',
};

var LANGUAGE_PAIRS = [
  ['zh', '中文'],
  ['en', '英语'],
  ['ja', '日语'],
  ['ko', '韩语'],
  ['fr', '法语'],
  ['de', '德语'],
  ['es', '西班牙语'],
  ['pt', '葡萄牙语'],
  ['ru', '俄语'],
  ['ar', '阿拉伯语'],
];

var AVATAR_STYLE_OPTIONS = [
  { id: 'beam', label: '简约表情' },
  { id: 'tapback', label: '立体人物' },
];

var CURRENCY_OPTIONS = [
  { id: 'CNY', label: 'CNY · 人民币' },
  { id: 'USD', label: 'USD · 美元' },
];

function publishedMetaText(publishedAt) {
  if (!publishedAt) return '尚未发布 · 访客现在打不开';
  try {
    var d = new Date(publishedAt);
    if (!isNaN(d.getTime())) {
      return (
        '已发布 · ' +
        d.toLocaleString('zh-CN', { hour12: false })
      );
    }
  } catch (e) {
    /* ignore */
  }
  return '已发布';
}

function syncLanguageOptions(meta) {
  var langs = (meta && meta.languages) || [];
  return LANGUAGE_PAIRS.map(function (pair) {
    return {
      id: pair[0],
      label: pair[1],
      on: langs.indexOf(pair[0]) >= 0,
    };
  });
}

function metaForView(raw) {
  var base = creator.mergeDraft({ profile_metadata: raw || {} }).profile_metadata;
  return {
    location: base.location,
    languages: base.languages.slice(),
    offers: base.offers.map(function (o) {
      var yuan =
        o.price_minor == null || !Number.isFinite(Number(o.price_minor))
          ? ''
          : String(Number(o.price_minor) / 100);
      var lead =
        o.lead_time_days == null || !Number.isFinite(Number(o.lead_time_days))
          ? ''
          : String(o.lead_time_days);
      return {
        label: o.label,
        price_minor: o.price_minor,
        currency: o.currency || 'CNY',
        lead_time_days: o.lead_time_days,
        priceYuan: yuan,
        leadDays: lead,
        currencyLabel:
          o.currency === 'USD' ? 'USD · 美元' : 'CNY · 人民币',
      };
    }),
    wants: base.wants.map(function (w) {
      return { label: w.label };
    }),
  };
}

function avatarStyleIndexOf(id) {
  for (var i = 0; i < AVATAR_STYLE_OPTIONS.length; i++) {
    if (AVATAR_STYLE_OPTIONS[i].id === id) return i;
  }
  return 0;
}

function skinLabelOf(skinId) {
  var opts = skins.skinOptions(skinId);
  for (var i = 0; i < opts.length; i++) {
    if (opts[i].selected) return opts[i].label;
  }
  return (skins.SKINS[skinId] && skins.SKINS[skinId].label) || '';
}

var SOCIAL_SHORTCUT_DEFAULTS = [
  { kind: 'instagram', label: 'Instagram', iconKind: 'instagram' },
  { kind: 'tiktok', label: 'TikTok', iconKind: 'tiktok' },
  { kind: 'youtube', label: 'YouTube', iconKind: 'youtube' },
  { kind: 'email', label: '邮箱', iconKind: 'email' },
];

var SOCIAL_LABEL = {
  wechat: '微信',
  xiaohongshu: '小红书',
  douyin: '抖音',
  bilibili: '哔哩哔哩',
  weibo: '微博',
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  github: 'GitHub',
  website: '网站',
  email: '邮箱',
  other: '其他',
};

function readCapsuleNav() {
  try {
    var sys = wx.getSystemInfoSync();
    var menu = wx.getMenuButtonBoundingClientRect();
    if (!menu || !menu.height) throw new Error('no menu');
    return {
      navPadTop: menu.top,
      navHeight: menu.height,
      navPadRight: Math.max(sys.windowWidth - menu.left + 4, 96),
      sharePadRight: Math.max(sys.windowWidth - menu.right, 10),
    };
  } catch (e) {
    return {
      navPadTop: 48,
      navHeight: 32,
      navPadRight: 100,
      sharePadRight: 16,
    };
  }
}

function buildSocialShortcuts(draft) {
  var socials = (draft && draft.socials) || [];
  var configured = {};
  socials.forEach(function (item) {
    if (item && item.kind && String(item.url || '').trim()) {
      configured[item.kind] = true;
    }
  });
  var kinds = {};
  SOCIAL_SHORTCUT_DEFAULTS.forEach(function (item) {
    kinds[item.kind] = true;
  });
  socials.forEach(function (item) {
    if (item && item.kind) kinds[item.kind] = true;
  });
  var list = [];
  SOCIAL_SHORTCUT_DEFAULTS.forEach(function (item) {
    list.push({
      kind: item.kind,
      label: item.label,
      iconKind: item.iconKind,
      configured: !!configured[item.kind],
      iconSrc: socialIconSrc(item.iconKind, !!configured[item.kind]),
    });
  });
  Object.keys(kinds).forEach(function (kind) {
    if (SOCIAL_SHORTCUT_DEFAULTS.some(function (d) { return d.kind === kind; })) return;
    list.push({
      kind: kind,
      label: SOCIAL_LABEL[kind] || kind,
      iconKind: 'link',
      configured: !!configured[kind],
      iconSrc: socialIconSrc('link', !!configured[kind]),
    });
  });
  return list;
}

function socialIconSrc(kind, configured) {
  var base = {
    instagram: 'instagram',
    tiktok: 'tiktok',
    douyin: 'tiktok',
    youtube: 'youtube',
    email: 'email',
    link: 'link',
  }[kind] || 'link';
  if (configured && base !== 'link') {
    return '/assets/social-' + base + '-on.png';
  }
  return '/assets/social-' + base + '.png';
}

var TIKTOK_DISPLAY_OPTIONS = [
  { id: 'link', label: '仅链接' },
  { id: 'profile', label: '展示 TikTok 个人主页' },
  { id: 'videos', label: '展示 TikTok 个人主页和视频' },
];

var INSTAGRAM_DISPLAY_OPTIONS = [
  { id: 'link', label: '仅链接' },
  { id: 'posts', label: '展示帖子与个人主页' },
  { id: 'reels', label: '展示 Reels 与个人主页' },
];

function normalizeSocialUrl(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '')
    .replace('://www.', '://')
    .toLowerCase();
}

function isTikTokProfile(url) {
  return /^https:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9_.]+\/?$/i.test(
    String(url || '').trim()
  );
}

function isInstagramProfile(url) {
  return /^https:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?$/i.test(
    String(url || '').trim()
  );
}

function newId(prefix) {
  return (
    prefix +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

function cloneDraft(draft) {
  return creator.mergeDraft(JSON.parse(JSON.stringify(draft || {})));
}

function decorateDraft(draft, media) {
  var next = cloneDraft(draft);
  var ig = media && media.instagram;
  var tk = media && media.tiktok;
  var topLevel = 0;
  next.sections = (next.sections || []).map(function (section) {
    var type = section.type || 'links';
    var isChild = Boolean(section.collection_id);
    if (!isChild) topLevel += 1;
    var fields = contentFields.fieldsForType(type);
    var items = (section.items || []).map(function (item) {
      var decorated = Object.assign({}, item);
      if (type === 'links') {
        var url = item.url || '';
        var showTikTok = isTikTokProfile(url);
        var showInstagram = isInstagramProfile(url);
        var igReady =
          ig &&
          ig.status === 'ready' &&
          normalizeSocialUrl(ig.profile_url) === normalizeSocialUrl(url);
        var tkReady =
          tk &&
          tk.status === 'ready' &&
          normalizeSocialUrl(tk.profile_url) === normalizeSocialUrl(url);
        decorated = Object.assign(decorated, {
          showTikTokDisplay: showTikTok,
          showInstagramDisplay: showInstagram,
          tiktokDisplayLabel:
            (
              TIKTOK_DISPLAY_OPTIONS.filter(function (o) {
                return o.id === (item.tiktok_display || 'link');
              })[0] || TIKTOK_DISPLAY_OPTIONS[0]
            ).label,
          instagramDisplayLabel:
            (
              INSTAGRAM_DISPLAY_OPTIONS.filter(function (o) {
                return o.id === (item.instagram_display || 'link');
              })[0] || INSTAGRAM_DISPLAY_OPTIONS[0]
            ).label,
          tiktokGalleryReady: !!tkReady,
          instagramGalleryReady: !!igReady,
        });
      }
      var fieldRows = fields.map(function (field) {
        var kind = field.kind || 'text';
        var value = decorated[field.key];
        if (kind === 'price' && value != null && value !== '') {
          var minor = Number(value);
          if (Number.isFinite(minor)) {
            value = String(minor / 100);
          }
        }
        return {
          key: field.key,
          label: field.label,
          placeholder: field.placeholder || '',
          value: value == null ? '' : String(value),
          isMultiline: kind === 'multiline',
          isColor: kind === 'color',
          isText: kind !== 'multiline' && kind !== 'color',
        };
      });
      return Object.assign(decorated, { fieldRows: fieldRows });
    });
    return Object.assign({}, section, {
      type: type,
      typeLabel: contentFields.SECTION_LABELS[type] || type,
      isCollectionChild: isChild,
      items: items,
    });
  });
  next.topLevelSectionCount = topLevel;
  return next;
}

function emptyItemForType(type) {
  var item = {};
  contentFields.fieldsForType(type || 'links').forEach(function (field) {
    if (field.kind === 'color') item[field.key] = '';
    else item[field.key] = '';
  });
  return item;
}

function portraitLetterOf(draft, slug) {
  var name = (draft && draft.display_name) || slug || 'M';
  return String(name).slice(0, 1).toUpperCase() || 'M';
}

function pickFilePath() {
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

function stripHttps(url) {
  return String(url || '').replace(/^https?:\/\//i, '');
}

function shortLinkHintText(link) {
  if (link && link.url) {
    var clicks = typeof link.clicks === 'number' ? link.clicks : 0;
    return (
      '短链接印在名片、包装上都够短，已经被点开 ' + clicks + ' 次。'
    );
  }
  return '短链接更短，适合印在名片或包装上；点开次数会记下来。';
}

function publishLabelFor(profileOnly, addressDisplay) {
  if (profileOnly) return '发布到主页';
  return '发布到 ' + (addressDisplay || '发布后可分享');
}

Page({
  data: {
    profileOnly: false,
    linksOnly: false,
    linksPanel: 'content',
    orgId: '',
    isOrg: false,
    bannerFallbackUrl: '/pages/me/index',
    phase: 'connecting',
    error: '',
    slug: '',
    slugInput: '',
    token: '',
    skinId: 'indigo',
    skinOptions: [],
    draft: creator.mergeDraft(null),
    meta: metaForView(null),
    languageOptions: syncLanguageOptions(null),
    portraitLetter: 'M',
    publishedAt: '',
    publishedMetaCopy: publishedMetaText(''),
    pageUrl: '',
    addressDisplay: '发布后可分享',
    publishLabel: '发布到主页',
    status: 'saved',
    statusCopy: STATUS_COPY.saved,
    saveError: '',
    publishFeedback: '',
    busy: false,
    uploadBusy: false,
    avatarCanvasOn: false,
    avatarStyle: 'beam',
    avatarStyleOptions: AVATAR_STYLE_OPTIONS,
    avatarStyleIndex: 0,
    avatarStyleLabel: AVATAR_STYLE_OPTIONS[0].label,
    currencyOptions: CURRENCY_OPTIONS,
    skinLabel: skinLabelOf('indigo'),
    socialKinds: SOCIAL_KINDS.map(function (pair) {
      return { id: pair[0], label: pair[1] };
    }),
    socialShortcuts: buildSocialShortcuts(null),
    studioHost: '',
    studioNote: '',
    shortLink: null,
    shortLinkDisplay: '',
    shortLinkHint:
      '短链接更短，适合印在名片或包装上；点开次数会记下来。',
    shareNote: '',
    sharePickerOpen: false,
    sharePickerOptions: [],
    sharePickerSelected: 'default',
    sharePickerBusy: false,
    sharePickerStatus: '',
    sharePickerTitle: '分享主页',
    tiktokDisplayOptions: TIKTOK_DISPLAY_OPTIONS,
    instagramDisplayOptions: INSTAGRAM_DISPLAY_OPTIONS,
    previewOpen: false,
    previewBusy: false,
    previewError: '',
    previewBytes: 0,
    addContentOpen: false,
    catalogBusy: false,
    catalogError: '',
    catalogQuery: '',
    catalogCategory: 'recommended',
    catalogPills: [],
    catalogVisible: [],
    catalogPasteUrl: '',
    catalogEmptyCopy: '',
    addFormOpen: false,
    addFormTitle: '',
    addFormType: 'links',
    addFormFields: [],
    addFormValues: {},
    addFormBusy: false,
    addFormError: '',
    colorOptions: contentFields.COLOR_OPTIONS,
    shareOpen: false,
    shareUrl: '',
    shareCard: null,
    shareNote: '',
    shareAvailability: '',
    shareMissing: false,
    shareBusy: false,
    showShareBio: false,
    showShareQr: false,
    showShareCard: false,
    shareBio: '',
    shareQrImage: '',
    editingSocial: '',
    editingSocialLabel: '',
    editingSocialUrl: '',
    navPadTop: 48,
    navHeight: 32,
    navPadRight: 100,
    sharePadRight: 16,
  },

  _alive: true,
  _token: '',
  _latestDraft: creator.mergeDraft(null),
  _skinId: 'indigo',
  _editRevision: 0,
  _saveTimer: 0,
  _saveQueue: Promise.resolve(),
  _portraitPending: false,
  _publishPending: false,
  _sharePending: false,
  _sharePickerSource: '',
  _media: { instagram: null, tiktok: null },
  _catalogItems: [],
  _catalogSelection: null,

  onLoad(query) {
    this._alive = true;
    var mode = (query && query.mode) || '';
    var section = (query && query.section) || '';
    var orgId = (query && query.org) || '';
    var isOrg = !!orgId;
    // 企业主页与个人同一套编辑器；linksOnly 仅个人（对齐 App）。
    var profileOnly = mode === 'profile' && !isOrg;
    var linksOnly = section === 'links' && !profileOnly && !isOrg;
    var nav = readCapsuleNav();
    var bannerFallbackUrl = isOrg
      ? '/pages/me/spaces/index?org=' + encodeURIComponent(orgId)
      : '/pages/me/index';
    this.setData({
      profileOnly: profileOnly,
      linksOnly: linksOnly,
      linksPanel: 'content',
      orgId: orgId,
      isOrg: isOrg,
      bannerFallbackUrl: bannerFallbackUrl,
      studioHost: studioLinks.displayHost(studioLinks.studioUrl()),
      navPadTop: nav.navPadTop,
      navHeight: nav.navHeight,
      navPadRight: nav.navPadRight,
      sharePadRight: nav.sharePadRight,
    });
    if (isOrg) {
      try {
        var spaceStore = require('../../../adapters/secure-store');
        spaceStore.set('me_space_org_id', orgId);
      } catch (e) {
        /* ignore */
      }
    }
    var title = isOrg
      ? '编辑企业主页'
      : profileOnly
        ? '个人资料'
        : linksOnly
          ? '主页内容'
          : '编辑主页';
    wx.setNavigationBarTitle({ title: title });
  },

  ownerKey() {
    return this.data.isOrg && this.data.orgId
      ? creator.orgOwner(this.data.orgId)
      : '';
  },

  spacesFallbackUrl() {
    var orgId = this.data.orgId;
    if (orgId) {
      try {
        var store = require('../../../adapters/secure-store');
        store.set('me_space_org_id', orgId);
      } catch (e) {
        /* ignore */
      }
      return (
        '/pages/me/spaces/index?org=' + encodeURIComponent(orgId)
      );
    }
    return '/pages/me/index';
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    if (this.data.phase === 'connecting' || this.data.phase === 'error') {
      this.bootstrap();
    }
  },

  onHide() {
    this.flushSaveOnLeave();
  },

  onUnload() {
    this._alive = false;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this.flushSaveOnLeave();
  },

  flushSaveOnLeave() {
    if (this.data.phase !== 'editing') return;
    if (this.data.status === 'saved' || this.data.status === 'saving') return;
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = 0;
    }
    var revision = this._editRevision;
    this.persist(this._latestDraft, this._skinId, revision);
  },

  goBack() {
    var self = this;
    var fallback = this.spacesFallbackUrl();
    var leave = function () {
      wx.navigateBack({
        fail: function () {
          if (self.data.isOrg) {
            wx.navigateTo({
              url: fallback,
              fail: function () {
                wx.switchTab({ url: '/pages/me/index' });
              },
            });
          } else {
            wx.switchTab({ url: '/pages/me/index' });
          }
        },
      });
    };
    if (this.data.busy) return;
    if (this.data.phase === 'editing' && this.data.status !== 'saved') {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = 0;
      }
      this.setData({ busy: true });
      var revision = this._editRevision;
      this.persist(this._latestDraft, this._skinId, revision).then(function (
        ok
      ) {
        if (!self._alive) return;
        self.setData({ busy: false });
        if (!ok || revision !== self._editRevision) return;
        leave();
      });
      return;
    }
    leave();
  },

  bootstrap() {
    var self = this;
    var snap = session.snapshot();
    var orgId = this.data.orgId;
    self.setData({
      phase: 'connecting',
      error: '',
      saveError: '',
      publishFeedback: '',
    });
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        if (!self._alive) return null;
        self._token = opened.token;
        if (orgId) {
          return creator.fetchOrgPage(opened.token, orgId).then(function (result) {
            return { opened: opened, page: result.page };
          });
        }
        if (!opened.creator.slug) {
          self.setData({
            phase: 'slug',
            token: opened.token,
            slugInput: opened.creator.suggested_slug || '',
            busy: false,
          });
          return null;
        }
        return creator.fetchPage(opened.token).then(function (page) {
          return { opened: opened, page: page };
        });
      })
      .then(function (bundle) {
        if (!bundle || !self._alive) return;
        self.enterEditing(bundle.page);
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          phase: 'error',
          error: (err && err.message) || '连接平台失败',
        });
      });
  },

  enterEditing(page) {
    var self = this;
    var draft = cloneDraft(page.draft);
    var skinId = skins.isSkinId(page.skin) ? page.skin : 'indigo';
    this._latestDraft = draft;
    this._skinId = skinId;
    this._editRevision = 0;
    try {
      skins.setSkinId(skinId);
    } catch (e) {
      /* ignore */
    }
    this.setData({
      phase: 'editing',
      token: this._token,
      slug: page.slug || '',
      draft: decorateDraft(draft, this._media),
      meta: metaForView(draft.profile_metadata),
      languageOptions: syncLanguageOptions(draft.profile_metadata),
      socialShortcuts: buildSocialShortcuts(draft),
      portraitLetter: portraitLetterOf(draft, page.slug),
      skinId: skinId,
      skinOptions: skins.skinOptions(skinId),
      skinLabel: skinLabelOf(skinId),
      publishedAt: page.published_at || '',
      publishedMetaCopy: publishedMetaText(page.published_at || ''),
      pageUrl: page.published_at
        ? creator.pageUrlFor(page.slug)
        : '',
      addressDisplay: page.published_at ? '发布后可分享' : '发布后可分享',
      publishLabel: publishLabelFor(this.data.profileOnly, '发布后可分享'),
      status: 'saved',
      statusCopy: STATUS_COPY.saved,
      saveError: '',
      busy: false,
      shortLink: null,
      shortLinkDisplay: '',
      shortLinkHint: shortLinkHintText(null),
      shareNote: '',
      linksPanel: 'content',
    });
    if (page.slug && page.published_at) {
      this.refreshPageAddress(creator.pageUrlFor(page.slug));
    }
    if (!this._token) return;
    var owner = this.ownerKey();
    var mediaPromise = this.data.isOrg
      ? Promise.resolve([null, null])
      : Promise.all([
          creator.fetchInstagramMedia(this._token),
          creator.fetchTikTokMedia(this._token),
        ]);
    Promise.all([
      mediaPromise,
      creator.fetchShortLinks(this._token, owner).catch(function () {
        return { links: [] };
      }),
    ]).then(function (bundle) {
      if (!self._alive) return;
      var mediaPair = bundle[0] || [null, null];
      self._media = {
        instagram: mediaPair[0],
        tiktok: mediaPair[1],
      };
      var links = (bundle[1] && bundle[1].links) || [];
      var pageLink = null;
      for (var i = 0; i < links.length; i++) {
        if (links[i].target_kind === 'page') {
          pageLink = links[i];
          break;
        }
      }
      self.setData({
        draft: decorateDraft(self._latestDraft, self._media),
        meta: metaForView(self._latestDraft.profile_metadata),
        languageOptions: syncLanguageOptions(
          self._latestDraft.profile_metadata
        ),
        shortLink: pageLink,
        shortLinkDisplay: pageLink ? stripHttps(pageLink.url) : '',
        shortLinkHint: shortLinkHintText(pageLink),
      });
    });
  },

  refreshPageAddress(candidate) {
    var self = this;
    var fallback = candidate || this.data.pageUrl || '';
    if (!fallback) {
      this.setData({
        addressDisplay: '发布后可分享',
        publishLabel: publishLabelFor(this.data.profileOnly, '发布后可分享'),
      });
      return;
    }
    pageAddress
      .resolveShareAddress(fallback)
      .then(function (resolved) {
        if (!self._alive) return;
        var display = stripHttps(resolved) || '发布后可分享';
        self.setData({
          pageUrl: resolved,
          addressDisplay: display,
          publishLabel: publishLabelFor(self.data.profileOnly, display),
        });
      })
      .catch(function () {
        if (!self._alive) return;
        var display = stripHttps(fallback) || '发布后可分享';
        self.setData({
          pageUrl: fallback,
          addressDisplay: display,
          publishLabel: publishLabelFor(self.data.profileOnly, display),
        });
      });
  },

  onSlugInput(e) {
    this.setData({ slugInput: (e.detail && e.detail.value) || '' });
  },

  submitSlug() {
    var self = this;
    if (this.data.busy || !this._token) return;
    var slug = String(this.data.slugInput || '')
      .trim()
      .toLowerCase();
    if (!slug) {
      this.setData({ error: '请填写主页地址' });
      return;
    }
    this.setData({ busy: true, error: '' });
    creator
      .registerSlug(this._token, slug)
      .then(function (result) {
        if (!self._alive) return null;
        return creator.fetchPage(self._token).then(function (page) {
          page.slug = (result && result.slug) || page.slug || slug;
          return page;
        });
      })
      .then(function (page) {
        if (!page || !self._alive) return;
        self.enterEditing(page);
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '注册地址失败',
        });
      });
  },

  persist(next, skinId, revision) {
    var self = this;
    if (!this._token || !this._alive) return Promise.resolve(false);
    this.setData({
      status: 'saving',
      statusCopy: STATUS_COPY.saving,
      saveError: '',
    });
    var task = this._saveQueue.catch(function () {}).then(function () {
      if (self.data.isOrg && self.data.orgId) {
        return creator.saveOrgPage(self._token, self.data.orgId, next, skinId);
      }
      return creator.savePage(self._token, next, skinId);
    });
    this._saveQueue = task;
    return task
      .then(function (result) {
        if (!self._alive || revision !== self._editRevision) return true;
        var draft = cloneDraft(result.draft);
        var skin = skins.isSkinId(result.skin) ? result.skin : skinId;
        self._latestDraft = draft;
        self._skinId = skin;
        try {
          skins.setSkinId(skin);
        } catch (e) {
          /* ignore */
        }
        self.setData({
          draft: decorateDraft(draft, self._media),
          meta: metaForView(draft.profile_metadata),
          languageOptions: syncLanguageOptions(draft.profile_metadata),
          socialShortcuts: buildSocialShortcuts(draft),
          portraitLetter: portraitLetterOf(draft, self.data.slug),
          skinId: skin,
          skinOptions: skins.skinOptions(skin),
          skinLabel: skinLabelOf(skin),
          status: 'saved',
          statusCopy: STATUS_COPY.saved,
          saveError: '',
        });
        return true;
      })
      .catch(function (err) {
        if (!self._alive || revision !== self._editRevision) return false;
        self.setData({
          status: 'failed',
          statusCopy: STATUS_COPY.failed,
          saveError: (err && err.message) || '保存失败',
        });
        return false;
      });
  },

  updateDraft(patch, nextSkin) {
    if (this.data.phase !== 'editing') return;
    var skinId = nextSkin || this._skinId;
    var next = Object.assign(cloneDraft(this._latestDraft), patch);
    this._latestDraft = next;
    this._skinId = skinId;
    var revision = ++this._editRevision;
    this.setData({
      draft: decorateDraft(next, this._media),
      meta: metaForView(next.profile_metadata),
      languageOptions: syncLanguageOptions(next.profile_metadata),
      socialShortcuts: buildSocialShortcuts(next),
      portraitLetter: portraitLetterOf(next, this.data.slug),
      skinId: skinId,
      skinOptions: skins.skinOptions(skinId),
      skinLabel: skinLabelOf(skinId),
      status: 'dirty',
      statusCopy: STATUS_COPY.dirty,
    });
    if (this._saveTimer) clearTimeout(this._saveTimer);
    var self = this;
    this._saveTimer = setTimeout(function () {
      self._saveTimer = 0;
      self.persist(next, skinId, revision);
    }, 800);
  },

  onNameInput(e) {
    this.updateDraft({ display_name: (e.detail && e.detail.value) || '' });
  },

  onHeadlineInput(e) {
    this.updateDraft({ headline: (e.detail && e.detail.value) || '' });
  },

  onBioInput(e) {
    this.updateDraft({ bio: (e.detail && e.detail.value) || '' });
  },

  pickSkin(e) {
    var id = e.currentTarget.dataset.id;
    if (!skins.isSkinId(id) || id === this._skinId) return;
    this.updateDraft({}, id);
  },

  pickPortrait() {
    var self = this;
    if (!this._token || this._portraitPending || this.data.busy) return;
    this._portraitPending = true;
    this.setData({ uploadBusy: true, saveError: '', busy: true });
    pickFilePath()
      .then(function (filePath) {
        return creator.uploadImage(
          self._token,
          filePath,
          'profile',
          self.ownerKey() || undefined
        );
      })
      .then(function (result) {
        if (!self._alive) return;
        self.updateDraft({ portrait_url: result.url });
        wx.showToast({ title: '头像已更新', icon: 'success' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        if (err && err.errMsg && /cancel/i.test(err.errMsg)) return;
        self.setData({
          saveError: (err && err.message) || '头像保存失败，请重试',
        });
      })
      .then(function () {
        self._portraitPending = false;
        if (self._alive) {
          self.setData({ uploadBusy: false, busy: false });
        }
      });
  },

  pickCover() {
    var self = this;
    if (!this._token || this._portraitPending || this.data.busy) return;
    this._portraitPending = true;
    this.setData({ uploadBusy: true, saveError: '', busy: true });
    pickFilePath()
      .then(function (filePath) {
        return creator.uploadImage(
          self._token,
          filePath,
          'profile',
          self.ownerKey() || undefined
        );
      })
      .then(function (result) {
        if (!self._alive) return;
        self.updateDraft({ cover_url: result.url, cover_position: 50 });
        wx.showToast({ title: '封面已更新', icon: 'success' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        if (err && err.errMsg && /cancel/i.test(err.errMsg)) return;
        self.setData({
          saveError: (err && err.message) || '封面保存失败，请重试',
        });
      })
      .then(function () {
        self._portraitPending = false;
        if (self._alive) {
          self.setData({ uploadBusy: false, busy: false });
        }
      });
  },

  removeCover() {
    this.updateDraft({ cover_url: '', cover_position: 50 });
  },

  onCoverPosition(e) {
    var v = Number(e.detail && e.detail.value);
    if (!Number.isFinite(v)) return;
    this.updateDraft({
      cover_position: Math.max(0, Math.min(100, Math.round(v))),
    });
  },

  randomPortrait() {
    var self = this;
    if (!this._token || this._portraitPending || this.data.busy) return;
    this._portraitPending = true;
    // 离屏 canvas 会挡全页点击：仅绘制时短暂挂载
    this.setData(
      { uploadBusy: true, saveError: '', busy: true, avatarCanvasOn: true },
      function () {
        setTimeout(function () {
          if (!self._alive) return;
          var style = self.data.avatarStyle || 'beam';
          var bg = style === 'tapback' ? '#9a9ef8' : '#ff97a8';
          var ctx = wx.createCanvasContext('ehAvatarCanvas', self);
          ctx.setFillStyle(bg);
          ctx.fillRect(0, 0, 200, 200);
          ctx.setFillStyle('#FFE8A3');
          ctx.beginPath();
          ctx.arc(100, 100, 70, 0, 2 * Math.PI);
          ctx.fill();
          ctx.setFillStyle('#333333');
          ctx.beginPath();
          ctx.arc(75, 85, 8, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(125, 85, 8, 0, 2 * Math.PI);
          ctx.fill();
          ctx.setStrokeStyle('#333333');
          ctx.setLineWidth(4);
          ctx.beginPath();
          ctx.arc(100, 110, 30, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
          ctx.draw(false, function () {
            wx.canvasToTempFilePath(
              {
                canvasId: 'ehAvatarCanvas',
                success: function (res) {
                  creator
                    .uploadImage(
                      self._token,
                      res.tempFilePath,
                      'profile',
                      self.ownerKey() || undefined
                    )
                    .then(function (result) {
                      if (!self._alive) return;
                      self.updateDraft({ portrait_url: result.url });
                      wx.showToast({ title: '头像已更新', icon: 'success' });
                    })
                    .catch(function (err) {
                      if (!self._alive) return;
                      self.setData({
                        saveError: (err && err.message) || '随机头像保存失败',
                      });
                    })
                    .then(function () {
                      self._portraitPending = false;
                      if (self._alive) {
                        self.setData({
                          uploadBusy: false,
                          busy: false,
                          avatarCanvasOn: false,
                        });
                      }
                    });
                },
                fail: function () {
                  self._portraitPending = false;
                  if (self._alive) {
                    self.setData({
                      uploadBusy: false,
                      busy: false,
                      avatarCanvasOn: false,
                      saveError: '随机头像生成失败',
                    });
                  }
                },
              },
              self
            );
          });
        }, 60);
      }
    );
  },

  onAvatarStyle(e) {
    var idx = Number(e.detail && e.detail.value);
    var opt = AVATAR_STYLE_OPTIONS[idx] || AVATAR_STYLE_OPTIONS[0];
    this.setData({
      avatarStyle: opt.id,
      avatarStyleIndex: avatarStyleIndexOf(opt.id),
      avatarStyleLabel: opt.label,
    });
  },

  patchMetadata(partial) {
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var merged = Object.assign({}, current, partial || {});
    this.updateDraft({ profile_metadata: merged });
  },

  onLocationInput(e) {
    this.patchMetadata({ location: (e.detail && e.detail.value) || '' });
  },

  toggleLanguage(e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var langs = (current.languages || []).slice();
    var at = langs.indexOf(id);
    if (at >= 0) langs.splice(at, 1);
    else langs.push(id);
    this.patchMetadata({ languages: langs });
  },

  addOffer() {
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var offers = (current.offers || []).slice();
    if (offers.length >= 20) return;
    offers.push({
      label: '',
      price_minor: null,
      currency: 'CNY',
      lead_time_days: null,
    });
    this.patchMetadata({ offers: offers });
  },

  onOfferField(e) {
    var index = Number(e.currentTarget.dataset.index);
    var field = e.currentTarget.dataset.field;
    var raw = (e.detail && e.detail.value) || '';
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var offers = (current.offers || []).slice();
    if (!offers[index]) return;
    var next = Object.assign({}, offers[index]);
    if (field === 'label') {
      next.label = raw;
    } else if (field === 'price') {
      var trimmed = String(raw).trim();
      if (trimmed === '') {
        next.price_minor = null;
      } else {
        var yuan = Number(trimmed);
        if (!Number.isFinite(yuan) || yuan < 0) return;
        next.price_minor = Math.round(yuan * 100);
      }
    } else if (field === 'lead') {
      var leadTrim = String(raw).trim();
      if (leadTrim === '') {
        next.lead_time_days = null;
      } else {
        var days = Number(leadTrim);
        if (!Number.isFinite(days) || days < 1) return;
        next.lead_time_days = Math.round(days);
      }
    } else {
      return;
    }
    offers[index] = next;
    this.patchMetadata({ offers: offers });
  },

  onOfferCurrency(e) {
    var index = Number(e.currentTarget.dataset.index);
    var opt = CURRENCY_OPTIONS[Number(e.detail && e.detail.value)];
    if (!opt) return;
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var offers = (current.offers || []).slice();
    if (!offers[index]) return;
    offers[index] = Object.assign({}, offers[index], { currency: opt.id });
    this.patchMetadata({ offers: offers });
  },

  removeOffer(e) {
    var index = Number(e.currentTarget.dataset.index);
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var offers = (current.offers || []).slice();
    offers.splice(index, 1);
    this.patchMetadata({ offers: offers });
  },

  addWant() {
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var wants = (current.wants || []).slice();
    if (wants.length >= 20) return;
    wants.push({ label: '' });
    this.patchMetadata({ wants: wants });
  },

  onWantInput(e) {
    var index = Number(e.currentTarget.dataset.index);
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var wants = (current.wants || []).slice();
    if (!wants[index]) return;
    wants[index] = { label: (e.detail && e.detail.value) || '' };
    this.patchMetadata({ wants: wants });
  },

  removeWant(e) {
    var index = Number(e.currentTarget.dataset.index);
    var current =
      (this._latestDraft && this._latestDraft.profile_metadata) || {};
    var wants = (current.wants || []).slice();
    wants.splice(index, 1);
    this.patchMetadata({ wants: wants });
  },

  onSocialKind(e) {
    var index = Number(e.currentTarget.dataset.index);
    var kindIndex = Number(e.detail && e.detail.value);
    var pair = SOCIAL_KINDS[kindIndex];
    if (!pair) return;
    var socials = cloneDraft(this._latestDraft).socials.slice();
    if (!socials[index]) return;
    socials[index] = Object.assign({}, socials[index], {
      kind: pair[0],
      label: pair[1],
    });
    this.updateDraft({ socials: socials });
  },

  onSocialUrl(e) {
    var index = Number(e.currentTarget.dataset.index);
    var socials = cloneDraft(this._latestDraft).socials.slice();
    if (!socials[index]) return;
    socials[index] = Object.assign({}, socials[index], {
      url: (e.detail && e.detail.value) || '',
    });
    this.updateDraft({ socials: socials });
  },

  onSocialWechat(e) {
    var index = Number(e.currentTarget.dataset.index);
    var socials = cloneDraft(this._latestDraft).socials.slice();
    if (!socials[index]) return;
    socials[index] = Object.assign({}, socials[index], {
      wechat_id: (e.detail && e.detail.value) || '',
    });
    this.updateDraft({ socials: socials });
  },

  addSocial() {
    var socials = cloneDraft(this._latestDraft).socials.slice();
    socials.push({ kind: 'website', label: '网站', url: '' });
    this.updateDraft({ socials: socials });
  },

  removeSocial(e) {
    var index = Number(e.currentTarget.dataset.index);
    var socials = cloneDraft(this._latestDraft).socials.slice();
    socials.splice(index, 1);
    this.updateDraft({ socials: socials });
  },

  onSectionTitle(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var sections = cloneDraft(this._latestDraft).sections.slice();
    if (!sections[sIndex]) return;
    sections[sIndex] = Object.assign({}, sections[sIndex], {
      title: (e.detail && e.detail.value) || '',
    });
    this.updateDraft({ sections: sections });
  },

  toggleSectionVisible(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var sections = cloneDraft(this._latestDraft).sections.slice();
    if (!sections[sIndex]) return;
    sections[sIndex] = Object.assign({}, sections[sIndex], {
      visible: !!(e.detail && e.detail.value),
    });
    this.updateDraft({ sections: sections });
  },

  onItemField(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var iIndex = Number(e.currentTarget.dataset.iindex);
    var key = e.currentTarget.dataset.key;
    var sections = cloneDraft(this._latestDraft).sections.slice();
    var section = sections[sIndex];
    if (!section || !section.items || !section.items[iIndex]) return;
    var items = section.items.slice();
    var item = Object.assign({}, items[iIndex]);
    var raw = (e.detail && e.detail.value) || '';
    if (key === 'price_minor') {
      var yuan = Number(String(raw).trim());
      if (String(raw).trim() === '') {
        delete item.price_minor;
      } else if (Number.isFinite(yuan) && yuan >= 0) {
        item.price_minor = String(Math.round(yuan * 100));
      } else {
        return;
      }
    } else {
      item[key] = raw;
    }
    if (key === 'url') {
      item.instagram_display = 'link';
      item.tiktok_display = 'link';
    }
    items[iIndex] = item;
    sections[sIndex] = Object.assign({}, section, { items: items });
    this.updateDraft({ sections: sections });
  },

  onTikTokDisplay(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var iIndex = Number(e.currentTarget.dataset.iindex);
    var opt = TIKTOK_DISPLAY_OPTIONS[Number(e.detail && e.detail.value)];
    if (!opt) return;
    var sections = cloneDraft(this._latestDraft).sections.slice();
    var section = sections[sIndex];
    if (!section || !section.items || !section.items[iIndex]) return;
    var current = section.items[iIndex];
    if (opt.id !== 'link') {
      var tk = this._media && this._media.tiktok;
      if (
        !tk ||
        tk.status !== 'ready' ||
        normalizeSocialUrl(tk.profile_url) !==
          normalizeSocialUrl(current.url)
      ) {
        wx.showToast({
          title: '请先在 Studio 接通匹配的 TikTok 画廊',
          icon: 'none',
        });
        return;
      }
    }
    var items = section.items.slice();
    items[iIndex] = Object.assign({}, current, { tiktok_display: opt.id });
    sections[sIndex] = Object.assign({}, section, { items: items });
    this.updateDraft({ sections: sections });
  },

  onInstagramDisplay(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var iIndex = Number(e.currentTarget.dataset.iindex);
    var opt = INSTAGRAM_DISPLAY_OPTIONS[Number(e.detail && e.detail.value)];
    if (!opt) return;
    var sections = cloneDraft(this._latestDraft).sections.slice();
    var section = sections[sIndex];
    if (!section || !section.items || !section.items[iIndex]) return;
    var current = section.items[iIndex];
    if (opt.id !== 'link') {
      var ig = this._media && this._media.instagram;
      if (
        !ig ||
        ig.status !== 'ready' ||
        normalizeSocialUrl(ig.profile_url) !==
          normalizeSocialUrl(current.url)
      ) {
        wx.showToast({
          title: '请先在 Studio 接通匹配的 Instagram 画廊',
          icon: 'none',
        });
        return;
      }
    }
    var items = section.items.slice();
    items[iIndex] = Object.assign({}, current, {
      instagram_display: opt.id,
    });
    sections[sIndex] = Object.assign({}, section, { items: items });
    this.updateDraft({ sections: sections });
  },

  makeShortLink() {
    var self = this;
    if (!this._token || this.data.busy) return;
    this.setData({ busy: true, shareNote: '' });
    creator
      .createShortLink(this._token, { kind: 'page' }, this.ownerKey())
      .then(function (result) {
        if (!self._alive) return;
        var link = (result && result.link) || null;
        self.setData({
          busy: false,
          shortLink: link,
          shortLinkDisplay: link ? stripHttps(link.url) : '',
          shortLinkHint: shortLinkHintText(link),
          shareNote: '',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          shareNote: (err && err.message) || '短链接生成失败',
        });
      });
  },

  openFinishedProduct() {
    var self = this;
    var url = this.data.pageUrl;
    if (!url) {
      this.setData({ shareNote: '请先发布主页，再看成品' });
      return;
    }
    this.setData({ shareNote: '正在打开成品…' });
    profileShare
      .openHomePage(url)
      .then(function () {
        if (self._alive) self.setData({ shareNote: '' });
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          shareNote: '打开失败，请稍后重试',
        });
      });
  },

  sharePageLink() {
    this.shareHome(this.data.pageUrl || '');
  },

  shareShortLink() {
    var url = this.data.shortLink && this.data.shortLink.url;
    if (!url) {
      this.setData({ shareNote: '请先生成短链接' });
      return;
    }
    this.shareHome(url);
  },

  /**
   * 对齐 App shareHome → shareProfile → shareUrl → presentShareChoices
   * 小程序弹出「选择分享地址」弹框，确认后复制并记住入口。
   */
  shareHome(url) {
    var self = this;
    if (this._sharePending || this.data.shareBusy) return;
    var slug = this.data.slug;
    if (!slug) {
      this.setData({ shareNote: '请先发布主页，再分享' });
      return;
    }
    if (!this.data.publishedAt) {
      this.setData({ shareNote: '请先发布主页，再分享' });
      return;
    }
    this._sharePending = true;
    this.setData({
      shareBusy: true,
      shareNote: '正在准备分享…',
    });
    var pageUrl = this.data.pageUrl || creator.pageUrlFor(slug);
    var isShort = Boolean(url && pageUrl && url !== pageUrl);
    var targetPromise;
    if (isShort) {
      targetPromise = Promise.resolve(url);
    } else {
      targetPromise = pageAddress
        .resolveShareAddress(pageUrl)
        .catch(function () {
          return pageUrl;
        });
    }
    targetPromise
      .then(function (resolved) {
        return pageAddress.shareChoicesFor(resolved).catch(function () {
          return [
            {
              id: 'default',
              label: '默认地址',
              url: resolved,
            },
          ];
        });
      })
      .then(function (options) {
        if (!self._alive) return;
        var valid = [];
        for (var i = 0; i < options.length; i++) {
          var item = options[i];
          if (
            (item.id === 'default' || item.id === 'domestic') &&
            String(item.url || '').indexOf('https://') === 0
          ) {
            valid.push({
              id: item.id,
              label: item.label || (item.id === 'domestic' ? '国内访问地址' : '默认地址'),
              url: item.url,
              display: stripHttps(item.url),
            });
          }
        }
        if (!valid.length) {
          self.setData({
            shareBusy: false,
            shareNote: '分享暂不可用，请重试',
          });
          self._sharePending = false;
          return;
        }
        var preferred = pageAddress.preferredShareEntry(valid);
        self._sharePickerSource = url || pageUrl;
        self.setData({
          shareBusy: false,
          shareNote: '',
          sharePickerOpen: true,
          sharePickerOptions: valid,
          sharePickerSelected: preferred.id,
          sharePickerBusy: false,
          sharePickerStatus: '',
          sharePickerTitle:
            (self._latestDraft && self._latestDraft.display_name) ||
            slug ||
            '分享主页',
        });
        self._sharePending = false;
      })
      .catch(function () {
        if (!self._alive) return;
        self.setData({
          shareBusy: false,
          shareNote: '分享暂不可用，请重试',
        });
        self._sharePending = false;
      });
  },

  onSharePickerSelect(e) {
    var id = e.detail && e.detail.value;
    if (id) this.setData({ sharePickerSelected: id });
  },

  closeSharePicker() {
    if (this.data.sharePickerBusy) return;
    this.setData({
      sharePickerOpen: false,
      sharePickerStatus: '',
      shareBusy: false,
    });
  },

  confirmSharePicker() {
    var self = this;
    if (this.data.sharePickerBusy) return;
    var selectedId = this.data.sharePickerSelected;
    var options = this.data.sharePickerOptions || [];
    var chosen = null;
    for (var i = 0; i < options.length; i++) {
      if (options[i].id === selectedId) {
        chosen = options[i];
        break;
      }
    }
    if (!chosen) chosen = options[0];
    if (!chosen || !chosen.url) {
      this.setData({ sharePickerStatus: '分享失败，请重试。' });
      return;
    }
    this.setData({
      sharePickerBusy: true,
      sharePickerStatus: '正在打开分享…',
    });
    // 小程序无原生分享桥：对齐 App deliver 的复制回退（弹框本身即选择地址）。
    wx.setClipboardData({
      data: chosen.url,
      success: function () {
        pageAddress.rememberShareEntry(chosen.id);
        if (!self._alive) return;
        var patch = {
          sharePickerOpen: false,
          sharePickerBusy: false,
          sharePickerStatus: '',
          shareNote: '链接已复制',
        };
        // 仅主页地址选择会更新展示地址；短链分享不改写主页 address。
        var source = self._sharePickerSource || '';
        var pageUrl = self.data.pageUrl || '';
        var isShort =
          source &&
          pageUrl &&
          source !== pageUrl &&
          /\/_[a-z0-9]{6}(?:\?|$)/i.test(source);
        if (!isShort) {
          var display = stripHttps(chosen.url);
          patch.pageUrl = chosen.url;
          patch.addressDisplay = display;
          patch.publishLabel = publishLabelFor(self.data.profileOnly, display);
        }
        self.setData(patch);
      },
      fail: function () {
        if (!self._alive) return;
        self.setData({
          sharePickerBusy: false,
          sharePickerStatus: '分享失败，请重试。',
        });
      },
    });
  },

  copyShortLink() {
    var url = this.data.shortLink && this.data.shortLink.url;
    if (!url) {
      wx.showToast({ title: '请先生成短链接', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制短链接', icon: 'success' });
      },
    });
  },

  addLinkItem(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var sections = cloneDraft(this._latestDraft).sections.slice();
    var section = sections[sIndex];
    if (!section) return;
    if ((section.items || []).length >= 12) {
      wx.showToast({ title: '单区最多 12 条', icon: 'none' });
      return;
    }
    var items = (section.items || []).slice();
    items.push(emptyItemForType(section.type || 'links'));
    sections[sIndex] = Object.assign({}, section, { items: items });
    this.updateDraft({ sections: sections });
  },

  removeLinkItem(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var iIndex = Number(e.currentTarget.dataset.iindex);
    var sections = cloneDraft(this._latestDraft).sections.slice();
    var section = sections[sIndex];
    if (!section || !section.items) return;
    var items = section.items.slice();
    items.splice(iIndex, 1);
    sections[sIndex] = Object.assign({}, section, { items: items });
    this.updateDraft({ sections: sections });
  },

  addLinksSection() {
    var sections = cloneDraft(this._latestDraft).sections.slice();
    if (sections.length >= 8) {
      wx.showToast({ title: '最多 8 个区块', icon: 'none' });
      return;
    }
    sections.push({
      id: newId('sec_'),
      type: 'links',
      title: '链接',
      visible: true,
      items: [{ label: '', url: '', note: '' }],
    });
    this.updateDraft({ sections: sections });
  },

  removeSection(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var sections = cloneDraft(this._latestDraft).sections.slice();
    var target = sections[sIndex];
    if (!target) return;
    var removeId = target.id;
    sections = sections.filter(function (section, index) {
      if (index === sIndex) return false;
      if (removeId && section.collection_id === removeId) return false;
      return true;
    });
    this.updateDraft({ sections: sections });
  },

  moveSection(e) {
    var sIndex = Number(e.currentTarget.dataset.sindex);
    var delta = Number(e.currentTarget.dataset.delta);
    var sections = cloneDraft(this._latestDraft).sections.slice();
    var target = sIndex + delta;
    if (target < 0 || target >= sections.length) return;
    var tmp = sections[sIndex];
    sections[sIndex] = sections[target];
    sections[target] = tmp;
    this.updateDraft({ sections: sections });
  },

  publish() {
    var self = this;
    if (
      !this._token ||
      this.data.busy ||
      this._publishPending ||
      this.data.phase !== 'editing'
    ) {
      return;
    }
    this._publishPending = true;
    this.setData({
      busy: true,
      publishFeedback: '正在保存并发布…',
      saveError: '',
    });
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = 0;
    }
    var revision = this._editRevision;
    this.persist(this._latestDraft, this._skinId, revision)
      .then(function (ok) {
        if (!ok) {
          if (self._alive) {
            self.setData({ publishFeedback: '草稿未保存，发布未执行。' });
          }
          return null;
        }
        if (revision !== self._editRevision) {
          if (self._alive) {
            self.setData({
              publishFeedback: '保存期间有新修改，请再次发布。',
            });
          }
          return null;
        }
        return self.data.isOrg && self.data.orgId
          ? creator.publishOrgPage(self._token, self.data.orgId)
          : creator.publishPage(self._token);
      })
      .then(function (result) {
        if (!result || !self._alive) return;
        var slug = result.slug || self.data.slug;
        var publishedAt = result.published_at || new Date().toISOString();
        var url = creator.pageUrlFor(slug);
        self.setData({
          slug: slug,
          publishedAt: publishedAt,
          publishedMetaCopy: publishedMetaText(publishedAt),
          pageUrl: url,
          publishFeedback: self.data.isOrg
            ? '企业主页已发布，可使用分享按钮分享链接。'
            : '主页已发布，可使用分享按钮分享链接。',
        });
        self.refreshPageAddress(url);
        wx.showToast({ title: '已发布', icon: 'success' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        var network = err && err.code === 'NETWORK';
        self.setData({
          saveError: (err && err.message) || '发布失败',
          publishFeedback: network
            ? '暂未确认发布结果，请检查网络后重试。'
            : '发布未完成，请检查错误后重试。',
        });
      })
      .then(function () {
        self._publishPending = false;
        if (self._alive) self.setData({ busy: false });
      });
  },

  copyPageUrl() {
    var url = this.data.pageUrl;
    if (!url) {
      wx.showToast({ title: '请先发布主页', icon: 'none' });
      return;
    }
    pageAddress
      .resolveShareAddress(url)
      .catch(function () {
        return url;
      })
      .then(function (shareUrl) {
        wx.setClipboardData({
          data: shareUrl,
          success: function () {
            wx.showToast({ title: '链接已复制', icon: 'success' });
          },
        });
      });
  },

  copyStudio() {
    studioLinks.copyLink('studio').then(
      function () {
        wx.showToast({ title: 'Studio 链接已复制', icon: 'success' });
      },
      function (err) {
        wx.showToast({
          title: (err && err.message) || '复制失败',
          icon: 'none',
        });
      }
    );
  },

  toggleLinksProfile() {
    this.setData({
      linksPanel: this.data.linksPanel === 'profile' ? 'content' : 'profile',
    });
  },

  toggleLinksDesign() {
    this.setData({
      linksPanel: this.data.linksPanel === 'design' ? 'content' : 'design',
    });
  },

  toggleBranding(e) {
    var on = !!(e.detail && e.detail.value);
    this.updateDraft({ show_branding: on });
  },

  openAddContent() {
    var self = this;
    this._catalogSelection = null;
    this.setData({
      addContentOpen: true,
      addFormOpen: false,
      linksPanel: 'content',
      catalogBusy: true,
      catalogError: '',
      catalogQuery: '',
      catalogCategory: 'recommended',
      catalogPasteUrl: '',
      catalogVisible: [],
      addFormError: '',
      addFormFields: [],
      addFormValues: {},
    });
    this.reloadCatalog();
  },

  reloadCatalog() {
    var self = this;
    this.setData({ catalogBusy: true, catalogError: '' });
    contentCatalog
      .loadContentCatalog()
      .then(function (items) {
        if (!self._alive) return;
        self._catalogItems = items || [];
        self.refreshCatalogView();
        self.setData({
          catalogBusy: false,
          catalogError: self._catalogItems.length
            ? ''
            : '暂无已开启的添加功能。',
        });
      })
      .catch(function () {
        if (!self._alive) return;
        self._catalogItems = contentCatalog.FALLBACK_ITEMS.slice();
        self.refreshCatalogView();
        self.setData({
          catalogBusy: false,
          catalogError: '',
        });
      });
  },

  closeAddContent() {
    this._catalogSelection = null;
    this.setData({
      addContentOpen: false,
      addFormOpen: false,
      catalogBusy: false,
      catalogError: '',
      addFormError: '',
      addFormFields: [],
      addFormValues: {},
    });
  },

  refreshCatalogView() {
    var category = this.data.catalogCategory || 'recommended';
    var query = this.data.catalogQuery || '';
    var items = contentCatalog.filterCatalog(
      this._catalogItems,
      category,
      query
    );
    var pasteUrl = contentCatalog.catalogUrl(query);
    var showGroups =
      !query &&
      (category === 'all' || category === 'business' || category === 'media');
    var visible = [];
    items.forEach(function (item, index) {
      if (showGroups) {
        var prev = index > 0 ? items[index - 1] : null;
        var heading = '';
        if (category === 'all') {
          if (!prev || prev.category !== item.category) {
            heading =
              contentCatalog.CATALOG_CATEGORIES[item.category] || item.category;
          }
        } else if (!prev || (prev.group || '') !== (item.group || '')) {
          heading = item.group || '';
        }
        if (heading) {
          visible.push({
            id: 'group-' + heading + '-' + index,
            isGroup: true,
            groupTitle: heading,
          });
        }
      }
      visible.push(
        Object.assign({}, item, {
          isGroup: false,
          brandClass: contentCatalog.brandClass(item.brand || item.icon),
          iconSrc: contentCatalog.catalogIconSrc(item.icon),
        })
      );
    });
    var emptyCopy = '';
    if (!items.length) {
      emptyCopy = this._catalogItems.length
        ? '没有找到匹配内容，试试其他关键词或粘贴 HTTPS 链接。'
        : '暂无已开启的添加功能。';
    }
    this.setData({
      catalogVisible: visible,
      catalogPills: contentCatalog.categoryPills(this._catalogItems),
      catalogPasteUrl: pasteUrl || '',
      catalogEmptyCopy: emptyCopy,
    });
  },

  onCatalogQuery(e) {
    this.setData({ catalogQuery: (e.detail && e.detail.value) || '' });
    this.refreshCatalogView();
  },

  pickCatalogCategory(e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    this.setData({ catalogCategory: id, catalogQuery: '' });
    this.refreshCatalogView();
  },

  submitCatalogPaste() {
    var url = this.data.catalogPasteUrl;
    if (!url) return;
    var host = '';
    try {
      host = new URL(url).hostname;
    } catch (err) {
      host = '链接';
    }
    this.saveNewContent(
      'links',
      { label: host, url: url, title: host },
      null
    );
  },

  pickCatalogEntry(e) {
    var id = e.currentTarget.dataset.id;
    var entry = null;
    for (var i = 0; i < this._catalogItems.length; i++) {
      if (this._catalogItems[i].id === id) {
        entry = this._catalogItems[i];
        break;
      }
    }
    if (!entry) return;

    // App onSocial：instagram/tiktok/youtube 的 links 型走社交快捷编辑
    if (
      entry.type === 'links' &&
      (entry.icon === 'instagram' ||
        entry.icon === 'tiktok' ||
        entry.icon === 'youtube')
    ) {
      this.closeAddContent();
      this.setData({
        editingSocial: entry.icon,
        editingSocialLabel: SOCIAL_LABEL[entry.icon] || entry.title,
        editingSocialUrl: '',
      });
      return;
    }

    var socialVideo =
      entry.type === 'video' &&
      (entry.icon === 'tiktok' ||
        entry.icon === 'youtube' ||
        entry.icon === 'vimeo');
    var type = socialVideo ? 'links' : entry.type;
    var values = {
      label: entry.title || '',
      title: entry.title || '',
      name: entry.title || '',
      url: entry.url || '',
    };
    if (
      ['instagram', 'tiktok', 'youtube', 'vimeo', 'spotify', 'soundcloud'].indexOf(
        entry.icon
      ) >= 0 &&
      (entry.type === 'links' || socialVideo)
    ) {
      values.social_provider = entry.icon;
      values.social_purpose = socialVideo ? 'content' : 'profile';
    }
    this._catalogSelection = entry;
    this.setData({
      addFormOpen: true,
      addFormTitle:
        '添加' +
        (entry.title || contentFields.SECTION_LABELS[type] || contentCatalog.SECTION_LABELS[type] || ''),
      addFormType: type,
      addFormValues: values,
      addFormFields: contentFields.buildFormFields(type, values),
      addFormError: '',
      addFormBusy: false,
    });
  },

  closeAddForm() {
    this._catalogSelection = null;
    this.setData({
      addFormOpen: false,
      addFormError: '',
      addFormFields: [],
      addFormValues: {},
    });
  },

  onAddFormField(e) {
    var key = e.currentTarget.dataset.key;
    if (!key) return;
    var value = (e.detail && e.detail.value) || '';
    var values = Object.assign({}, this.data.addFormValues, {});
    values[key] = value;
    this.setData({
      addFormValues: values,
      addFormFields: contentFields.buildFormFields(this.data.addFormType, values),
    });
  },

  onAddFormColor(e) {
    var key = e.currentTarget.dataset.key || 'color';
    var idx = Number(e.detail && e.detail.value);
    var opt = contentFields.COLOR_OPTIONS[idx] || contentFields.COLOR_OPTIONS[0];
    var values = Object.assign({}, this.data.addFormValues, {});
    values[key] = opt.value;
    this.setData({
      addFormValues: values,
      addFormFields: contentFields.buildFormFields(this.data.addFormType, values),
    });
  },

  submitAddForm() {
    var self = this;
    if (this.data.addFormBusy) return;
    var type = this.data.addFormType || 'links';
    var values = Object.assign({}, this.data.addFormValues || {});
    var err = contentFields.requiredOk(type, values);
    if (err) {
      this.setData({ addFormError: err });
      return;
    }
    var item = contentFields.prepareItem(type, values);
    if (values.social_provider) {
      item.social_provider = values.social_provider;
      item.social_purpose = values.social_purpose || 'profile';
    }
    this.setData({ addFormBusy: true, addFormError: '' });
    this.saveNewContent(type, item, null)
      .then(function () {
        if (!self._alive) return;
        self.closeAddContent();
      })
      .catch(function (saveErr) {
        if (!self._alive) return;
        self.setData({
          addFormBusy: false,
          addFormError: (saveErr && saveErr.message) || '保存失败，请重试',
        });
      });
  },

  saveNewContent(type, item, targetSectionId) {
    var self = this;
    var sections = cloneDraft(this._latestDraft).sections.slice();
    if (sections.length >= 8) {
      return Promise.reject(new Error('最多 8 个区块'));
    }
    if (targetSectionId) {
      var index = -1;
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].id === targetSectionId) {
          index = i;
          break;
        }
      }
      if (index < 0) return Promise.reject(new Error('分组已不存在'));
      var section = sections[index];
      var items = (section.items || []).slice();
      if (items.length >= 12) {
        return Promise.reject(new Error('每组最多 12 条'));
      }
      items.push(item);
      sections[index] = Object.assign({}, section, { items: items });
    } else {
      sections.push({
        id: (type + '-' + Date.now().toString(36)).slice(0, 24),
        type: type,
        title: contentCatalog.SECTION_DEFAULT_TITLE[type] || '',
        visible: true,
        items: [item],
      });
    }
    this.updateDraft({ sections: sections });
    this.setData({ addContentOpen: false, addFormOpen: false, addFormBusy: false });
    wx.showToast({ title: '已加入草稿', icon: 'success' });
    return Promise.resolve(true);
  },

  addCollection() {
    var sections = cloneDraft(this._latestDraft).sections.slice();
    if (sections.length >= 8) {
      wx.showToast({ title: '最多 8 个区块', icon: 'none' });
      return;
    }
    sections.push({
      id: newId('col_'),
      type: 'links',
      title: '合集',
      visible: true,
      items: [],
    });
    this.updateDraft({ sections: sections });
  },

  openPreview() {
    var self = this;
    if (!this._token || this.data.busy) return;
    this.setData({
      previewOpen: true,
      previewBusy: true,
      previewError: '',
      previewBytes: 0,
    });
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = 0;
    }
    var revision = this._editRevision;
    var needSave = this.data.status !== 'saved';
    var chain = needSave
      ? this.persist(this._latestDraft, this._skinId, revision)
      : Promise.resolve(true);
    chain
      .then(function (ok) {
        if (!ok) {
          throw new Error('草稿尚未保存，请返回编辑处理后重试。');
        }
        // 拉取 SSR HTML 校验草稿可读；界面用本地可视化预览对齐 App
        return creator
          .fetchPreviewHtml(
            self._token,
            '',
            self.data.isOrg ? self.data.orgId : ''
          )
          .catch(function (err) {
          // 网络失败仍展示本地草稿预览，但标出错误
          self.setData({
            previewError: (err && err.message) || '',
          });
          return '';
        });
      })
      .then(function (html) {
        if (!self._alive) return;
        self.setData({
          previewBusy: false,
          previewBytes: (html && html.length) || 0,
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          previewBusy: false,
          previewError: (err && err.message) || '预览载入失败',
        });
      });
  },

  closePreview() {
    this.setData({ previewOpen: false, previewBusy: false, previewError: '' });
  },

  noop() {},

  openLinksShare() {
    var self = this;
    var url = this.data.pageUrl || '';
    var name =
      (this._latestDraft && this._latestDraft.display_name) ||
      this.data.slug ||
      '我的主页';
    this.setData({
      shareOpen: true,
      shareUrl: url,
      shareCard: null,
      shareNote: '',
      shareMissing: false,
      shareBusy: false,
      showShareBio: false,
      showShareQr: false,
      showShareCard: false,
      shareQrImage: '',
      shareBio: name + ' · 我的 MuuZi 主页',
      shareAvailability: url
        ? ''
        : this.data.slug
          ? '这份主页仍是草稿，发布后才能生成可访问的链接和二维码。'
          : '请先设置并发布主页后再分享。',
    });
    if (url) {
      this.refreshShareCard(url);
      pageAddress
        .resolveShareAddress(url)
        .then(function (resolved) {
          if (!self._alive || !self.data.shareOpen) return;
          self.setData({ shareUrl: resolved, shareAvailability: '' });
          self.refreshShareCard(resolved);
        })
        .catch(function () {});
      return;
    }
    if (!this._token) return;
    creator
      .fetchPage(this._token)
      .then(function (page) {
        if (!self._alive || !self.data.shareOpen) return;
        if (!page || !page.published_at) {
          self.setData({
            shareAvailability:
              '这份主页仍是草稿，发布后才能生成可访问的链接和二维码。',
          });
          return;
        }
        var candidate =
          page.page_url || creator.pageUrlFor(page.slug || self.data.slug);
        return pageAddress
          .resolveShareAddress(candidate)
          .then(function (resolved) {
            if (!self._alive || !self.data.shareOpen) return;
            self.setData({
              shareUrl: resolved,
              pageUrl: resolved,
              shareAvailability: '',
            });
            self.refreshShareCard(resolved);
          })
          .catch(function () {
            if (!self._alive || !self.data.shareOpen) return;
            self.setData({
              shareUrl: candidate,
              pageUrl: candidate,
              shareAvailability: '',
            });
            self.refreshShareCard(candidate);
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

  refreshShareCard(url) {
    var self = this;
    var slug =
      this.data.slug || profileShare.slugFromShareUrl(url || '') || '';
    if (!url || !slug) return;
    creator
      .fetchPublicPage(slug)
      .then(function (publicPage) {
        if (!self._alive || !self.data.shareOpen) return;
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
      .catch(function () {});
  },

  closeLinksShare() {
    this.setData({
      shareOpen: false,
      shareBusy: false,
      showShareBio: false,
      showShareQr: false,
      showShareCard: false,
    });
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
        self.setData({ shareNote: '复制失败，请长按下方链接复制' });
      },
    });
  },

  toggleShareBio() {
    this.setData({ showShareBio: !this.data.showShareBio });
  },

  onShareBioInput(e) {
    this.setData({ shareBio: (e.detail && e.detail.value) || '' });
  },

  copyShareBio() {
    var text =
      this.data.shareBio +
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

  toggleShareQr() {
    var self = this;
    if (!this.requireShareUrl()) return;
    var next = !this.data.showShareQr;
    this.setData({ showShareQr: next });
    if (!next || this.data.shareQrImage) return;
    setTimeout(function () {
      if (!self.data.shareOpen || !self.data.showShareQr) return;
      qrcodeDraw
        .drawUrlToTempFile(self, 'ehShareQr', self.data.shareUrl)
        .then(function (img) {
          if (self.data.shareOpen) self.setData({ shareQrImage: img });
        })
        .catch(function () {
          if (self.data.shareOpen) {
            self.setData({ shareNote: '二维码暂时无法生成' });
          }
        });
    }, 60);
  },

  toggleShareCard() {
    this.setData({ showShareCard: !this.data.showShareCard });
  },

  copyShareCard() {
    var name =
      (this._latestDraft && this._latestDraft.display_name) ||
      this.data.slug ||
      '我的主页';
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
    var self = this;
    this.setData({ shareBusy: true, shareNote: '正在打开分享…' });
    setTimeout(function () {
      if (!self._alive || !self.data.shareOpen) return;
      self.setData({ shareBusy: false, shareNote: '' });
    }, 1200);
  },

  openSharePage() {
    if (!this.requireShareUrl()) return;
    var self = this;
    this.setData({ shareNote: '正在打开主页…' });
    profileShare
      .openHomePage(this.data.shareUrl)
      .then(function () {
        if (!self._alive || !self.data.shareOpen) return;
        self.setData({ shareNote: '', shareOpen: false });
      })
      .catch(function () {
        return profileShare
          .copyShareUrlFallback(
            self.data.shareUrl,
            '无法直接打开，链接已复制，请在浏览器打开'
          )
          .then(function (note) {
            if (!self._alive || !self.data.shareOpen) return;
            self.setData({ shareNote: note });
          });
      })
      .catch(function () {
        if (!self._alive || !self.data.shareOpen) return;
        self.setData({ shareNote: '打开失败，请复制链接后在浏览器打开' });
      });
  },

  dismissShareMissing() {
    this.setData({ shareMissing: false });
  },

  onShareAppMessage() {
    var name =
      (this._latestDraft && this._latestDraft.display_name) ||
      this.data.slug ||
      '我的主页';
    var card = this.data.shareCard;
    var url = this.data.shareUrl || this.data.pageUrl || '';
    var portrait =
      (this._latestDraft && this._latestDraft.portrait_url) || '';
    return profileShare.friendShareMessage({
      url: url,
      slug: this.data.slug,
      title: (card && card.title) || name + ' · MuuZi',
      text: card && card.text,
      imageUrl: (card && card.image) || portrait,
    });
  },

  editSocialShortcut(e) {
    var kind = e.currentTarget.dataset.kind;
    if (!kind) return;
    var socials = (this._latestDraft && this._latestDraft.socials) || [];
    var found = null;
    for (var i = 0; i < socials.length; i++) {
      if (socials[i].kind === kind) {
        found = socials[i];
        break;
      }
    }
    this.setData({
      editingSocial: kind,
      editingSocialLabel: SOCIAL_LABEL[kind] || kind,
      editingSocialUrl: (found && found.url) || '',
    });
  },

  addSocialShortcut() {
    this.setData({
      editingSocial: 'instagram',
      editingSocialLabel: 'Instagram',
      editingSocialUrl: '',
    });
  },

  onEditingSocialUrl(e) {
    this.setData({ editingSocialUrl: (e.detail && e.detail.value) || '' });
  },

  closeSocialEditor() {
    this.setData({
      editingSocial: '',
      editingSocialLabel: '',
      editingSocialUrl: '',
    });
  },

  saveSocialShortcut() {
    var kind = this.data.editingSocial;
    if (!kind) return;
    var url = String(this.data.editingSocialUrl || '').trim();
    var socials = cloneDraft(this._latestDraft).socials.slice();
    var index = -1;
    for (var i = 0; i < socials.length; i++) {
      if (socials[i].kind === kind) {
        index = i;
        break;
      }
    }
    if (!url) {
      if (index >= 0) socials.splice(index, 1);
    } else if (index >= 0) {
      socials[index] = Object.assign({}, socials[index], {
        url: url,
        label: SOCIAL_LABEL[kind] || kind,
      });
    } else {
      socials.push({
        kind: kind,
        label: SOCIAL_LABEL[kind] || kind,
        url: url,
      });
    }
    this.updateDraft({ socials: socials });
    this.closeSocialEditor();
  },
});
