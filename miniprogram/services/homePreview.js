/**
 * 主页所见即所得预览模型 · 对齐 App SSR（render-page.js）与公开页。
 * 微信不能 iframe srcDoc，故用原生渲染；数据形状与访客看到的草稿/发布内容一致。
 */
const openLinkService = require('./openLink');

var SOCIAL_ICON_BY_KIND = {
  instagram: '/assets/social-instagram.png',
  youtube: '/assets/social-youtube.png',
  tiktok: '/assets/social-tiktok.png',
  douyin: '/assets/social-tiktok.png',
  x: '/assets/social-x.png',
  email: '/assets/social-email.png',
  website: '/assets/social-website.png',
  github: '/assets/social-github.png',
  bilibili: '/assets/social-bilibili.png',
  xiaohongshu: '/assets/social-xiaohongshu.png',
  weibo: '/assets/social-weibo.png',
  wechat: '/assets/social-wechat.png',
  facebook: '/assets/social-facebook.png',
  facebook_page: '/assets/social-facebook_page.png',
  messenger: '/assets/social-messenger.png',
  threads: '/assets/social-threads.png',
  spotify: '/assets/social-spotify.png',
  link: '/assets/social-link.png',
  other: '/assets/social-link.png',
};

var SOCIAL_LABEL_BY_KIND = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  douyin: '抖音',
  x: 'X',
  email: '邮箱',
  website: '网站',
  github: 'GitHub',
  bilibili: '哔哩哔哩',
  xiaohongshu: '小红书',
  weibo: '微博',
  wechat: '微信',
  link: '链接',
};

var LANG_LABEL = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  pt: '葡萄牙语',
  ru: '俄语',
  ar: '阿拉伯语',
};

/** 对齐 render-page .card-* tint 底色 */
var CARD_TINT = {
  rose: '#ffe1e6',
  amber: '#ffeccc',
  mint: '#d8f3e4',
  sky: '#dbecff',
  lilac: '#e7e2ff',
  sand: '#f0e9dd',
  ink: '#15171e',
};

var CARD_TINT_INK = {
  ink: '#ffffff',
};

function letterOf(name, slug) {
  var raw = String(name || slug || 'M').trim();
  return raw ? raw.charAt(0).toUpperCase() : 'M';
}

function formatPrice(priceMinor, currency) {
  var n = Number(priceMinor);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return '询价';
  var yuan = (n / 100).toFixed(2).replace(/\.00$/, '');
  var cur = String(currency || 'CNY').toUpperCase();
  if (cur === 'CNY' || cur === 'RMB') return '¥' + yuan;
  if (cur === 'USD') return 'US$' + yuan;
  return yuan + ' ' + cur;
}

function formatLeadDays(days) {
  var n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return '';
  return '约 ' + n + ' 天';
}

function isHttps(url) {
  var raw = String(url || '').trim();
  if (!raw || raw.length > 800) return false;
  if (raw.indexOf('https://') !== 0) return false;
  // 小程序运行时未必有 URL 构造器；禁止凭据与空主机
  if (/^https:\/\/[^/@\s]+:[^/@\s]+@/i.test(raw)) return false;
  try {
    if (typeof URL === 'function') {
      var u = new URL(raw);
      return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname;
    }
  } catch (e) {
    /* fall through to string check */
  }
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/|$)/i.test(raw);
}

/**
 * 对齐 render-page.renderProfileCover：
 * profile_covers 优先；否则 cover_url + 区块图/视频封面凑满 3 槽。
 */
function coverSlots(content) {
  var c = content || {};
  var slots = [];
  if (Array.isArray(c.profile_covers) && c.profile_covers.length) {
    for (var i = 0; i < 3; i++) {
      var item = c.profile_covers[i] || {};
      var url = item.url || '';
      var pos = Number(item.position);
      if (isHttps(url)) {
        slots.push({
          url: url,
          position: Number.isFinite(pos) ? Math.max(0, Math.min(100, pos)) : 50,
        });
      } else {
        slots.push(null);
      }
    }
    return slots;
  }
  var images = [];
  if (isHttps(c.cover_url)) images.push(c.cover_url);
  var sections = Array.isArray(c.sections) ? c.sections : [];
  for (var s = 0; s < sections.length; s++) {
    var sec = sections[s];
    if (!sec || sec.visible === false) continue;
    var items = Array.isArray(sec.items) ? sec.items : [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j] || {};
      var cand = it.image_url || it.cover_url || it.thumbnail_url || '';
      if (isHttps(cand) && images.indexOf(cand) < 0) images.push(cand);
    }
  }
  var coverPos = Number(c.cover_position);
  var defaultPos =
    Number.isFinite(coverPos) ? Math.max(0, Math.min(100, coverPos)) : 50;
  for (var k = 0; k < 3; k++) {
    slots.push(
      images[k]
        ? { url: images[k], position: defaultPos }
        : null
    );
  }
  return slots;
}

function socialsFromContent(content) {
  var socials = (content && content.socials) || [];
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

function metadataFromContent(content) {
  var meta = (content && content.profile_metadata) || {};
  var languages = Array.isArray(meta.languages) ? meta.languages : [];
  var langLabels = languages
    .map(function (id) {
      return LANG_LABEL[id] || id;
    })
    .filter(Boolean);
  var offers = Array.isArray(meta.offers)
    ? meta.offers
        .map(function (o, idx) {
          o = o || {};
          var label = String(o.label || '').trim();
          if (!label) return null;
          var price = formatPrice(o.price_minor, o.currency);
          var lead = formatLeadDays(o.lead_time_days);
          var metaLine = [price, lead].filter(Boolean).join(' · ');
          return {
            key: 'offer_' + idx,
            label: label,
            meta: metaLine,
          };
        })
        .filter(Boolean)
    : [];
  var wants = Array.isArray(meta.wants)
    ? meta.wants
        .map(function (w, idx) {
          var label = String((w && w.label) || '').trim();
          if (!label) return null;
          return { key: 'want_' + idx, label: label };
        })
        .filter(Boolean)
    : [];
  return {
    location: String(meta.location || '').trim(),
    languagesText: langLabels.join(' · '),
    offers: offers,
    wants: wants,
    hasAny:
      !!String(meta.location || '').trim() ||
      langLabels.length > 0 ||
      offers.length > 0 ||
      wants.length > 0,
  };
}

/**
 * 保留 section.type 与条目字段，对齐 App SECTION_RENDERERS。
 */
function sectionsFromContent(content) {
  var sections = (content && content.sections) || [];
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
        name: it.name || title || '',
        note: note,
        body: body,
        desc: it.desc || note || '',
        url: url,
        image_url: it.image_url || '',
        cover_url: it.cover_url || '',
        link_kind: it.link_kind || '',
        link_label: it.link_label || '',
        layout: it.layout === 'featured' ? 'featured' : 'classic',
        featured: it.layout === 'featured',
        color: it.color || '',
        tintBg: CARD_TINT[it.color] || '#f4f6fa',
        tintInk: CARD_TINT_INK[it.color] || '#20232b',
        tintMuted:
          it.color === 'ink'
            ? 'rgba(255,255,255,0.72)'
            : '#69717b',
        price_text:
          type === 'shop' && it.link_kind !== 'store'
            ? formatPrice(it.price_minor, it.currency) || '询价'
            : it.link_kind === 'store'
              ? '访问店铺 →'
              : '',
        duration: it.duration || '',
        directAudio: type === 'audio' && openLinkService.isDirectAudio(url),
        card_kind: it.card_kind || '',
        hasUrl: url.indexOf('https://') === 0 || url.indexOf('mailto:') === 0,
        isFirst: j === 0,
      };
      if (type === 'skills') {
        if (!mapped.label) continue;
      } else if (type === 'agents') {
        if (!mapped.name) continue;
      } else if (type === 'custom') {
        if (!mapped.title && !mapped.body && !mapped.hasUrl) continue;
      } else if (type === 'shop') {
        if (!mapped.title && !mapped.hasUrl) continue;
      } else if (type === 'audio' || type === 'video') {
        if (!mapped.title && !mapped.hasUrl) continue;
      } else if (!mapped.hasUrl && !mapped.label) {
        continue;
      }
      visibleItems.push(mapped);
    }
    if (!visibleItems.length && !s.title) continue;

    var videoHero = null;
    var videoRest = [];
    if (type === 'video' && visibleItems.length) {
      videoHero = visibleItems[0];
      videoRest = visibleItems.slice(1, 4);
    }

    out.push({
      id: s.id || 'sec_' + i,
      type: type,
      title: s.title || '',
      items: visibleItems,
      itemCount: String(visibleItems.length).padStart(2, '0'),
      collection_layout: s.collection_layout || '',
      isShowcase: s.collection_layout === 'showcase',
      isGrid: s.collection_layout === 'grid',
      isCarousel: s.collection_layout === 'carousel',
      isBento:
        s.collection_layout === 'showcase' ||
        s.collection_layout === 'grid',
      isVideo: type === 'video',
      isAudio: type === 'audio',
      isShop: type === 'shop',
      isCustom: type === 'custom',
      isAgents: type === 'agents',
      isSkills: type === 'skills',
      isLinks: type === 'links' || !type,
      videoHero: videoHero,
      videoRest: videoRest,
    });
  }
  return out;
}

/**
 * @param {object} content draft 或 published
 * @param {{ slug?: string, draft?: boolean }} [opts]
 */
function viewModel(content, opts) {
  var c = content || {};
  var options = opts || {};
  var name = c.display_name || options.slug || '我的主页';
  var covers = coverSlots(c);
  var hasCoverImage = covers.some(function (slot) {
    return slot && slot.url;
  });
  return {
    name: name,
    headline: c.headline || '',
    bio: c.bio || '',
    portrait: c.portrait_url || '',
    letter: letterOf(name, options.slug),
    showBranding: c.show_branding !== false,
    draft: options.draft === true,
    covers: covers,
    hasCoverImage: hasCoverImage,
    socials: socialsFromContent(c),
    meta: metadataFromContent(c),
    sections: sectionsFromContent(c),
  };
}

module.exports = {
  letterOf: letterOf,
  formatPrice: formatPrice,
  coverSlots: coverSlots,
  socialsFromContent: socialsFromContent,
  metadataFromContent: metadataFromContent,
  sectionsFromContent: sectionsFromContent,
  viewModel: viewModel,
};
