/**
 * 内容目录 · 对齐 MuuziGit contentCatalog.ts + loadContentCatalog
 * GET /api/public/settings → content_catalog
 */
const config = require('../config');
const http = require('./http');

var CATALOG_CATEGORIES = {
  recommended: '推荐',
  sponsored: '赞助链接',
  business: '商业',
  social: '社交',
  media: '媒体',
  contact: '联系',
  events: '活动',
  text: '文本',
  all: '查看全部',
};

var TYPES = {
  links: true,
  custom: true,
  video: true,
  audio: true,
  shop: true,
  agents: true,
  skills: true,
};

var SECTION_LABELS = {
  links: '链接',
  video: '影像',
  audio: '声音',
  agents: 'Agents',
  skills: '技能',
  shop: '店铺',
  custom: '自定义',
};

var SECTION_DEFAULT_TITLE = {
  links: '',
  video: '',
  audio: '',
  custom: '',
  shop: '店铺',
  agents: 'Agents',
  skills: '技能',
};

/** 与 App 推荐列表一致的离线兜底（网络失败时仍可对齐 UI） */
var FALLBACK_ITEMS = [
  {
    id: 'catalog-1',
    icon: 'instagram',
    type: 'links',
    brand: 'instagram',
    group: '',
    title: 'Instagram',
    enabled: true,
    category: 'social',
    description: '展示你的主页与帖子',
    recommended: true,
  },
  {
    id: 'catalog-2',
    icon: 'tiktok',
    type: 'video',
    brand: 'black',
    group: '',
    title: 'TikTok 视频',
    enabled: true,
    category: 'social',
    description: '粘贴内容链接，无需连接账号',
    recommended: true,
  },
  {
    id: 'catalog-3',
    icon: 'youtube',
    type: 'video',
    brand: 'youtube',
    group: '视频',
    title: 'YouTube 视频／播放列表',
    enabled: true,
    category: 'media',
    description: '粘贴内容链接，无需连接账号',
    recommended: true,
  },
  {
    id: 'catalog-4',
    icon: 'image',
    type: 'custom',
    brand: 'sky',
    group: '文档与图片',
    title: '图片库',
    enabled: true,
    category: 'media',
    description: '用图片和文字分享你的创作',
    recommended: true,
  },
  {
    id: 'catalog-5',
    icon: 'spotify',
    type: 'audio',
    brand: 'spotify',
    group: '音乐与播客',
    title: 'Spotify',
    enabled: true,
    category: 'media',
    description: '分享你最近或最喜欢的音乐',
    recommended: true,
  },
  {
    id: 'catalog-6',
    icon: 'download',
    type: 'links',
    brand: 'orange',
    group: '数字产品',
    title: '文件下载',
    enabled: true,
    category: 'business',
    description: '添加文件的公开下载链接',
    recommended: true,
  },
  {
    id: 'catalog-7',
    icon: 'map',
    type: 'links',
    brand: 'sky',
    group: '',
    title: '地图',
    enabled: true,
    category: 'contact',
    description: '与访客分享你的位置链接',
    recommended: true,
  },
];

var ALIASES = {
  'catalog-17': 'threads',
  'catalog-19': 'facebook',
  'catalog-24': 'vimeo',
  'catalog-29': 'soundcloud',
};

function normalizeCatalog(value) {
  var raw = value && value.items;
  if (!Array.isArray(raw)) return [];
  var items = [];
  raw.forEach(function (v) {
    if (!v || typeof v !== 'object') return;
    if (v.enabled !== true) return;
    if (v.action && v.action !== 'home') return;
    if (!TYPES[v.type]) return;
    if (typeof v.id !== 'string' || typeof v.title !== 'string') return;
    items.push({
      id: v.id,
      title: v.title,
      description: typeof v.description === 'string' ? v.description : '',
      category: typeof v.category === 'string' ? v.category : 'text',
      type: v.type,
      icon: ALIASES[v.id] || v.icon || 'link',
      brand: v.brand || '',
      group: v.group || '',
      recommended: v.recommended === true,
      enabled: true,
      url: typeof v.url === 'string' ? v.url : '',
    });
  });

  ['spotify', 'soundcloud', 'vimeo'].forEach(function (provider) {
    var source = null;
    for (var i = 0; i < items.length; i++) {
      if (
        items[i].icon === provider &&
        (items[i].type === 'audio' || items[i].type === 'video')
      ) {
        source = items[i];
        break;
      }
    }
    if (!source) return;
    var hasProfile = items.some(function (it) {
      return it.icon === provider && it.type === 'links';
    });
    if (hasProfile) return;
    var names = {
      spotify: 'Spotify',
      soundcloud: 'SoundCloud',
      vimeo: 'Vimeo',
    };
    items.push(
      Object.assign({}, source, {
        id: source.id + ':profile',
        title: names[provider] + ' 个人主页',
        description: '连接官方账号或填写主页链接',
        type: 'links',
        category: 'social',
        recommended: false,
      })
    );
  });

  var youtube = null;
  for (var y = 0; y < items.length; y++) {
    if (items[y].icon === 'youtube' && items[y].type === 'video') {
      youtube = items[y];
      break;
    }
  }
  if (
    youtube &&
    !raw.some(function (i) {
      return i && i.icon === 'youtube' && i.type === 'links';
    })
  ) {
    items.push(
      Object.assign({}, youtube, {
        id: youtube.id + ':channel',
        title: 'YouTube 频道',
        description: '连接并验证你的 YouTube 频道',
        type: 'links',
        category: 'social',
      })
    );
  }

  return items.map(function (i) {
    if (i.type === 'video' && (i.icon === 'tiktok' || i.icon === 'youtube')) {
      return Object.assign({}, i, {
        title:
          i.icon === 'tiktok' ? 'TikTok 视频' : 'YouTube 视频／播放列表',
        description: '粘贴内容链接，无需连接账号',
      });
    }
    return i;
  });
}

function catalogUrl(value) {
  var raw = String(value || '').trim();
  if (!/^https:\/\/[^/\s]+/i.test(raw)) return null;
  try {
    if (typeof URL === 'function') {
      var u = new URL(raw);
      if (u.protocol !== 'https:') return null;
      if (u.username || u.password) return null;
      return u.href;
    }
  } catch (e) {
    return null;
  }
  return raw;
}

function filterCatalog(items, category, query) {
  var q = String(query || '')
    .trim()
    .toLowerCase();
  var filtered = (items || []).filter(function (i) {
    if (q) {
      return (i.title + ' ' + i.description).toLowerCase().indexOf(q) >= 0;
    }
    if (category === 'all') return true;
    if (category === 'recommended') return i.recommended;
    return i.category === category;
  });
  if (!q && category === 'all') {
    var ordered = [];
    Object.keys(CATALOG_CATEGORIES).forEach(function (key) {
      filtered.forEach(function (i) {
        if (i.category === key) ordered.push(i);
      });
    });
    return ordered;
  }
  if (!q && (category === 'business' || category === 'media')) {
    var groups = [];
    var seen = {};
    filtered.forEach(function (i) {
      var g = i.group || '';
      if (!seen[g]) {
        seen[g] = true;
        groups.push(g);
      }
    });
    var out = [];
    groups.forEach(function (g) {
      filtered.forEach(function (i) {
        if ((i.group || '') === g) out.push(i);
      });
    });
    return out;
  }
  return filtered;
}

function categoryPills(items) {
  return Object.keys(CATALOG_CATEGORIES)
    .filter(function (key) {
      if (key === 'recommended' || key === 'all') return true;
      return (items || []).some(function (i) {
        return i.category === key;
      });
    })
    .map(function (key) {
      return { id: key, label: CATALOG_CATEGORIES[key] };
    });
}

function loadContentCatalog() {
  return http
    .request({
      url: config.PLATFORM_API + '/api/public/settings',
      method: 'GET',
      timeout: 15000,
    })
    .then(function (data) {
      var items = normalizeCatalog(data && data.content_catalog);
      if (!items.length) items = FALLBACK_ITEMS.slice();
      return items;
    })
    .catch(function () {
      return FALLBACK_ITEMS.slice();
    });
}

/** 对齐 App StorefrontSettingsScreen storeTools（store_* action，不进主页内容目录） */
var STORE_TOOL_ACTIONS = {
  store_collection: true,
  store_external: true,
  store_marketplace: true,
};

function normalizeStoreTools(catalog) {
  var raw = catalog && catalog.items;
  if (!Array.isArray(raw)) return [];
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var v = raw[i];
    if (!v || typeof v !== 'object') continue;
    if (v.enabled !== true) continue;
    if (!STORE_TOOL_ACTIONS[v.action]) continue;
    if (typeof v.id !== 'string' || typeof v.title !== 'string') continue;
    out.push({
      id: v.id,
      action: v.action,
      title: v.title,
      description: typeof v.description === 'string' ? v.description : '',
    });
  }
  return out;
}

function loadStoreTools() {
  return http
    .request({
      url: config.PLATFORM_API + '/api/public/settings',
      method: 'GET',
      timeout: 15000,
    })
    .then(function (data) {
      return normalizeStoreTools(data && data.content_catalog);
    })
    .catch(function () {
      return [];
    });
}

/** Align ContentCatalogPicker.module.css data-brand backgrounds. */
function brandClass(brandOrIcon) {
  var key = String(brandOrIcon || '').toLowerCase();
  var byBrand = {
    instagram: 'brand-ig',
    youtube: 'brand-yt',
    red: 'brand-yt',
    black: 'brand-tk',
    spotify: 'brand-sp',
    sky: 'brand-sky',
    orange: 'brand-sky',
  };
  if (byBrand[key]) return byBrand[key];
  var byIcon = {
    instagram: 'brand-ig',
    tiktok: 'brand-tk',
    youtube: 'brand-yt',
    spotify: 'brand-sp',
    image: 'brand-sky',
    download: 'brand-sky',
    map: 'brand-sky',
    email: 'brand-sky',
  };
  return byIcon[key] || 'brand-sky';
}

/** StudioCatalogIcon glyphs rasterized 1:1 from App SOCIAL_BRAND_PATHS / PICKER_ICONS. */
function catalogIconSrc(icon) {
  var known = {
    instagram: 1,
    tiktok: 1,
    youtube: 1,
    spotify: 1,
    image: 1,
    download: 1,
    map: 1,
    link: 1,
    email: 1,
  };
  var name = known[icon] ? icon : 'link';
  return '/assets/catalog-' + name + '.png';
}

module.exports = {
  CATALOG_CATEGORIES: CATALOG_CATEGORIES,
  SECTION_LABELS: SECTION_LABELS,
  SECTION_DEFAULT_TITLE: SECTION_DEFAULT_TITLE,
  FALLBACK_ITEMS: FALLBACK_ITEMS,
  normalizeCatalog: normalizeCatalog,
  catalogUrl: catalogUrl,
  filterCatalog: filterCatalog,
  categoryPills: categoryPills,
  loadContentCatalog: loadContentCatalog,
  loadStoreTools: loadStoreTools,
  normalizeStoreTools: normalizeStoreTools,
  brandClass: brandClass,
  catalogIconSrc: catalogIconSrc,
};
