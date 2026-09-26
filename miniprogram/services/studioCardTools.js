/**
 * Studio 紧凑卡工具 · 对齐 MuuziGit `services/studioCardTools.ts` + StudioCardTools.tsx
 */

var STUDIO_UNAVAILABLE_TOOLS = {
  highlight: {
    title: '重点展示',
    description: '突出你最重要的链接。同一时间仅支持一条重点链接。',
    control: 'radio',
    showTopBadge: false,
    currentCopy: '当前：不重点展示',
    options: [
      {
        label: '动画强调',
        detail: '用轻微动画吸引访客注意。',
      },
      {
        label: '直接跳转',
        detail: '访客打开主页后，直接前往这条链接。',
      },
    ],
  },
  rules: {
    title: '显示规则',
    description:
      '根据访客所在国家／地区，显示或隐藏这条链接。地区判断尚未接入，当前链接仍按上方显示开关展示。',
    control: 'rules',
    showTopBadge: true,
    currentCopy: '',
    options: [{ label: '国家／地区规则', detail: '' }],
  },
  schedule: {
    title: '定时展示',
    description:
      '设置链接开始和结束展示的时间。当前没有定时任务，链接按显示开关持续展示。',
    control: 'schedule',
    showTopBadge: true,
    currentCopy: '',
    options: [
      { label: '开始展示', detail: '' },
      { label: '结束展示', detail: '' },
    ],
  },
  access: {
    title: '访问限制',
    description: '以下能力尚未开通，当前链接没有访问限制。',
    control: 'checkbox',
    showTopBadge: false,
    currentCopy: '',
    options: [
      { label: '订阅后访问', detail: '' },
      { label: '访问码', detail: '' },
      { label: '访问密码', detail: '' },
      { label: '出生日期／年龄确认', detail: '' },
      { label: '敏感内容提示', detail: '' },
      { label: 'NFT 持有验证', detail: '' },
    ],
  },
};

var TOOL_META = [
  { key: 'settings', title: '链接设置' },
  { key: 'thumbnail', title: '缩略图设置' },
  { key: 'highlight', title: '重点展示' },
  { key: 'rules', title: '显示规则' },
  { key: 'schedule', title: '定时展示' },
  { key: 'access', title: '访问限制' },
  { key: 'stats', title: '点击统计' },
  { key: 'copy', title: '复制链接' },
];

var BRAND_ASSETS = {
  /* YouTube 未选中时用红色播放标（对齐 App currentColor #f03） */
  youtube: '/assets/social-youtube-on.svg',
  instagram: '/assets/social-instagram.png',
  tiktok: '/assets/social-tiktok.png',
  bilibili: '/assets/social-bilibili.png',
  xiaohongshu: '/assets/social-xiaohongshu.png',
  github: '/assets/social-github.png',
  weibo: '/assets/social-weibo.png',
  wechat: '/assets/social-wechat.png',
  spotify: '/assets/social-spotify.png',
  facebook: '/assets/social-facebook.png',
  x: '/assets/social-x.png',
  link: '/assets/social-link.png',
};

function brandIconSrc(brand) {
  var key = String(brand || 'link').toLowerCase();
  return BRAND_ASSETS[key] || BRAND_ASSETS.link;
}

function linkClickSummary(url, data) {
  if (!data || !data.eligible) return '当前套餐未开通数据分析权益。';
  try {
    var raw = String(url || '').slice(0, 200);
    var withoutProto = raw.replace(/^https?:\/\//i, '');
    var slash = withoutProto.indexOf('/');
    var host = (slash >= 0 ? withoutProto.slice(0, slash) : withoutProto)
      .replace(/^www\./i, '')
      .toLowerCase();
    var path = slash >= 0 ? withoutProto.slice(slash).split('?')[0] : '/';
    var key = (host + path).slice(0, 80);
    var record = (data.clicks || []).find(function (entry) {
      return entry && entry.target === key;
    });
    return record
      ? '近 30 天：' + record.clicks + ' 次点击'
      : '这条链接未出现在近 30 天的前 10 条点击记录中，暂无可展示的精确次数。';
  } catch (e) {
    return '填写完整链接并发布主页后，才能产生点击记录。';
  }
}

function statsBlockedReason(url, owner, token) {
  if (owner && String(owner).indexOf('org:') !== 0) {
    return '当前空间的链接统计尚未开通。';
  }
  try {
    var href = String(url || '').trim();
    if (!/^https:\/\//i.test(href)) throw new Error('bad');
  } catch (e) {
    return '填写完整链接并发布主页后，才能产生点击记录。';
  }
  if (!token) return '登录后可读取点击记录。';
  return '';
}

module.exports = {
  STUDIO_UNAVAILABLE_TOOLS: STUDIO_UNAVAILABLE_TOOLS,
  TOOL_META: TOOL_META,
  brandIconSrc: brandIconSrc,
  linkClickSummary: linkClickSummary,
  statsBlockedReason: statsBlockedReason,
};
