/**
 * 设置树 · 对齐 MuuziGit ProfileScreen settings + NotificationSettings
 * 行布局：左侧 accent 图标盒 / 标题+说明 / 右侧 chevron|分享|色板|社交标
 */
const session = require('../../../services/session');
const creator = require('../../../services/creator');
const skins = require('../../../services/pageSkins');
const meSettings = require('../../../services/meSettings');
const store = require('../../../adapters/secure-store');
const studioLinks = require('../../../services/studioLinks');

var ICO = {
  shield: '/assets/icon-ui-shield-accent.png',
  link: '/assets/icon-ui-link-accent.png',
  share: '/assets/icon-ui-share-accent.png',
  people: '/assets/icon-ui-nav-people-accent.png',
  mail: '/assets/icon-ui-mail-accent.png',
  list: '/assets/icon-ui-list-accent.png',
  menu: '/assets/icon-ui-menu-accent.png',
  gear: '/assets/icon-ui-gear-accent.png',
  bookmark: '/assets/icon-ui-bookmark-accent.png',
  calendar: '/assets/icon-ui-calendar-accent.png',
  person: '/assets/icon-ui-person-accent.png',
  chevron: '/assets/icon-ui-chevron-muted.png',
  arrow: '/assets/icon-ui-arrow-right-accent.png',
  ig: '/assets/social-instagram.png',
  yt: '/assets/social-youtube.png',
  x: '/assets/icon-ui-x-social.png',
};

function buildGroups(ctx) {
  ctx = ctx || {};
  var slug = ctx.slug || '';
  var pageHost = ctx.pageHost || '';
  var shareTitle = slug
    ? pageHost || '分享地址暂不可用'
    : ctx.platformReady
      ? '还没有主页地址'
      : ctx.platformError
        ? '连不上平台'
        : '正在连接平台';
  var shareMeta = slug
    ? '点一下分享主页地址'
    : ctx.platformReady
      ? '在「编辑我的主页」里先取一个'
      : ctx.platformError || '读取会员与认证状态';

  var homeRows = [
    {
      kind: 'share',
      title: shareTitle,
      meta: shareMeta,
      icon: ICO.link,
      trailing: slug ? 'share' : '',
      action: 'share',
      disabled: !slug,
    },
  ];
  if (slug) {
    homeRows.push({
      kind: 'offer',
      title: 'Pro · 自定义主页地址',
      meta: '有效付费订阅可修改，每 30 天一次',
      url: '/pages/me/address/index',
    });
    homeRows.push({
      kind: 'row',
      title: '我的店铺',
      meta: '独立配置店铺 · 管理主页精选商品',
      icon: ICO.people,
      url: '/pages/me/shop/index',
    });
  }
  homeRows = homeRows.concat([
    {
      kind: 'skin',
      title: '主页配色',
      meta: '仅影响公开主页',
      iconAccent: true,
      skin: true,
    },
    {
      kind: 'row',
      title: '留言收件箱',
      meta: '查看主页收到的留言',
      icon: ICO.mail,
      url: '/pages/me/contacts/index',
    },
    {
      kind: 'row',
      title: '代理权限与人设',
      meta: '管理代理权限与角色设定',
      icon: ICO.shield,
      url: '/pages/me/agent-access/index',
    },
    {
      kind: 'row',
      title: 'Agent 卡与邀请分享',
      meta: '管理分享卡片与邀请',
      icon: ICO.share,
      url: '/pages/me/sharing/index',
    },
    {
      kind: 'row',
      title: '管理主体',
      meta: '虚拟人 / 虚拟企业',
      icon: ICO.people,
      url: '/pages/me/subjects/index',
    },
    {
      kind: 'row',
      title: '模块顺序与显示',
      meta: '在编辑主页里开关和排序',
      icon: ICO.menu,
      url: '/pages/me/edit-home/index',
    },
    {
      kind: 'social',
      title: '社交账号绑定',
      meta: '在编辑主页里添加',
      icon: ICO.link,
      url: '/pages/me/edit-home/index',
      socials: [ICO.ig, ICO.x, ICO.yt],
    },
    {
      kind: 'row',
      title: '网页版 Studio',
      meta: '在电脑上管作品库、区块内容与认证',
      icon: ICO.gear,
      trailing: 'arrow',
      action: 'studio',
    },
  ]);

  return [
    { label: '主页', rows: homeRows },
    {
      label: '会员与认证',
      rows: [
        {
          kind: 'row',
          title: '会员',
          meta: '套餐与订单',
          icon: ICO.bookmark,
          url: '/pages/me/membership/index',
        },
        {
          kind: 'row',
          title: '认证',
          meta: '复制链接，在 Studio 提交申请',
          icon: ICO.shield,
          action: 'verification',
        },
        {
          kind: 'row',
          title: '个人与企业空间',
          meta: '当前为个人空间 · 创建或加入企业',
          icon: ICO.people,
          url: '/pages/me/spaces/index',
        },
      ],
    },
    {
      label: '分身 Muu',
      rows: [
        {
          kind: 'row',
          title: '形象与声音',
          meta: '分身对话即将推出 · 本期为占位页',
          icon: ICO.person,
          iconCircle: true,
          url: '/pages/me/muu/index',
        },
        {
          kind: 'row',
          title: '我在找 · 我能做 · 报价',
          meta: 'Muu 替你筛首页机会的依据',
          icon: ICO.list,
          url: '/pages/me/interests/index',
        },
        {
          kind: 'row',
          title: '代我排期',
          meta: '在规则里写清楚档期和接单条件，Muu 照着回',
          icon: ICO.calendar,
          url: '/pages/me/interests/index',
        },
      ],
    },
    {
      label: '账号',
      rows: [
        {
          kind: 'row',
          title: '企业与邀请',
          meta: '接受邀请 · 员工主页展示授权',
          icon: ICO.link,
          url: '/pages/me/enterprise-invitations/index',
        },
        {
          kind: 'row',
          title: '账号安全',
          meta: '修改密码 · 找回密码',
          icon: ICO.shield,
          url: '/pages/me/security/index',
        },
        {
          kind: 'row',
          title: '我的收藏',
          meta: '收藏的动态',
          icon: ICO.bookmark,
          url: '/pages/me/saved/index',
        },
        {
          kind: 'row',
          title: '退出当前节点',
          meta: '',
          icon: ICO.link,
          action: 'signout',
        },
      ],
    },
  ];
}

Page({
  data: {
    groups: buildGroups(),
    userId: '',
    slug: '',
    pageUrl: '',
    pageHost: '',
    studioNote: '',
    notifySupported: false,
    notifyEnabled: false,
    notifyAuthorized: true,
    notifyBusy: false,
    notifyTitle: '开启消息通知',
    notifyMeta: '锁屏和后台接收新消息提醒',
    notifyNotice: '',
    stats: [
      { value: '—', label: '近 30 天访客' },
      { value: '—', label: '近 7 天' },
      { value: '—', label: '累计访客' },
    ],
    skinId: 'indigo',
    skinLabel: '蓝紫',
    skinOptions: [],
    icoShield: ICO.shield,
    icoChevron: ICO.chevron,
    icoShare: ICO.share,
  },

  _alive: true,

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    var snap = session.snapshot();
    var skinId = skins.getSkinId();
    var skin = skins.getSkin();
    this.setData({
      userId: snap.matrixUserId || '',
      skinId: skinId,
      skinLabel: skin.label,
      skinOptions: skins.skinOptions(skinId),
    });
    this.refreshNotify();
    this.refreshHomeContext();
  },

  onHide() {
    this._alive = false;
  },

  applyGroups(extra) {
    extra = extra || {};
    var groups = buildGroups({
      slug: extra.slug != null ? extra.slug : this.data.slug,
      pageHost: extra.pageHost != null ? extra.pageHost : this.data.pageHost,
      platformReady: !!extra.platformReady || !!this.data.slug,
      platformError: extra.platformError || '',
    });
    // 退出行 meta 用 userId
    var account = groups[groups.length - 1];
    if (account && account.rows) {
      for (var i = 0; i < account.rows.length; i++) {
        if (account.rows[i].action === 'signout') {
          account.rows[i].meta = this.data.userId || '';
        }
      }
    }
    this.setData(
      Object.assign(
        {
          groups: groups,
          skinLabel: skins.getSkin().label,
          skinOptions: skins.skinOptions(skins.getSkinId()),
        },
        extra
      )
    );
  },

  refreshHomeContext() {
    var self = this;
    var snap = session.snapshot();
    creator
      .loadCreatorSession(snap)
      .then(function (opened) {
        return Promise.all([
          creator.fetchStats(opened.token).catch(function () {
            return null;
          }),
          creator.fetchPage(opened.token).catch(function () {
            return null;
          }),
          Promise.resolve(opened.creator || {}),
        ]);
      })
      .then(function (triple) {
        if (!self._alive) return;
        var stats = triple[0];
        var page = triple[1];
        var creatorId = triple[2] || {};
        var slug = (page && page.slug) || creatorId.slug || '';
        var rawUrl =
          (page && page.page_url) || (slug ? creator.pageUrlFor(slug) : '');
        var pageHost = String(rawUrl || '')
          .replace(/^https:\/\//i, '')
          .replace(/\/$/, '');
        self.applyGroups({
          slug: slug,
          pageUrl: rawUrl || '',
          pageHost: pageHost,
          platformReady: true,
          platformError: '',
        });
        if (stats && stats.eligible) {
          self.setData({
            stats: [
              {
                value: meSettings.compactNumber(stats.last30 || 0),
                label: '近 30 天访客',
              },
              {
                value: meSettings.compactNumber(stats.last7 || 0),
                label: '近 7 天',
              },
              {
                value: meSettings.compactNumber(stats.total || 0),
                label: '累计访客',
              },
            ],
          });
        } else {
          self.setData({
            stats: [
              { value: '—', label: '近 30 天访客' },
              { value: '—', label: '近 7 天' },
              {
                value: '—',
                label: slug ? '专业版开启统计' : '先设主页地址',
              },
            ],
          });
        }
      })
      .catch(function () {
        if (!self._alive) return;
        self.applyGroups({
          slug: '',
          pageUrl: '',
          pageHost: '',
          platformReady: false,
          platformError: '连不上平台',
        });
        self.setData({
          stats: [
            { value: '—', label: '近 30 天访客' },
            { value: '—', label: '近 7 天' },
            { value: '—', label: '累计访客' },
          ],
        });
      });
  },

  refreshNotify() {
    var self = this;
    if (!meSettings.notificationsSupported()) {
      this.setData({
        notifySupported: false,
        notifyTitle: '消息通知',
        notifyMeta:
          '当前基础库无法读取通知授权；聊天推送将在消息模块接通后提供。',
        notifyNotice: '',
      });
      return;
    }
    meSettings.notificationStatus().then(function (s) {
      if (!self._alive) return;
      var enabled = !!s.enabled;
      self.setData({
        notifySupported: true,
        notifyEnabled: enabled,
        notifyAuthorized: !!s.authorized,
        notifyTitle: enabled ? '消息通知已开启' : '开启消息通知',
        notifyMeta: enabled
          ? '点击关闭 · 不显示聊天正文'
          : '锁屏和后台接收新消息提醒',
        notifyNotice: '',
      });
    });
  },

  onNotifyTap() {
    var self = this;
    if (this.data.notifyBusy) return;
    this.setData({ notifyBusy: true, notifyNotice: '' });
    meSettings
      .openNotificationSettings()
      .then(function () {
        return meSettings.notificationStatus();
      })
      .then(function (s) {
        if (!self._alive) return;
        var enabled = !!s.enabled;
        self.setData({
          notifyBusy: false,
          notifyEnabled: enabled,
          notifyAuthorized: !!s.authorized,
          notifyTitle: enabled ? '消息通知已开启' : '开启消息通知',
          notifyMeta: enabled
            ? '点击关闭 · 不显示聊天正文'
            : '锁屏和后台接收新消息提醒',
          notifyNotice: enabled ? '消息通知已开启' : '已返回通知设置',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          notifyBusy: false,
          notifyNotice: (err && err.message) || '通知设置失败，请重试',
        });
      });
  },

  onSystemNotifyTap() {
    this.onNotifyTap();
  },

  onPickSkin(e) {
    var id = e.currentTarget.dataset.id;
    try {
      var skin = skins.setSkinId(id);
      this.setData({
        skinId: skin.id,
        skinLabel: skin.label,
        skinOptions: skins.skinOptions(skin.id),
      });
      this.applyGroups({});
    } catch (err) {
      wx.showToast({
        title: (err && err.message) || '配色无效',
        icon: 'none',
      });
    }
  },

  onRow(e) {
    var gi = Number(e.currentTarget.dataset.gi);
    var ri = Number(e.currentTarget.dataset.ri);
    var group = this.data.groups[gi];
    var row = group && group.rows && group.rows[ri];
    if (!row || row.skin || row.kind === 'skin') return;
    if (row.disabled) {
      wx.showToast({ title: row.meta || '请先设置主页地址', icon: 'none' });
      return;
    }
    if (row.action === 'share') {
      store.set('me_open_share', '1');
      wx.switchTab({ url: '/pages/me/index' });
      return;
    }
    if (row.action === 'studio') {
      this.copyExternal('studio');
      return;
    }
    if (row.action === 'verification') {
      this.copyExternal('verification');
      return;
    }
    if (row.action === 'signout') {
      session.signOutAndRelaunch();
      return;
    }
    if (row.url) {
      wx.navigateTo({ url: row.url });
    }
  },

  copyExternal(purpose) {
    var self = this;
    studioLinks
      .copyLink(purpose)
      .then(function (result) {
        self.setData({ studioNote: result.label });
        wx.showToast({ title: '已复制链接', icon: 'none' });
      })
      .catch(function (err) {
        self.setData({
          studioNote:
            (err && err.message) ||
            '复制失败，请手动打开 ' +
              studioLinks.displayHost(studioLinks.studioUrl()),
        });
      });
  },
});
