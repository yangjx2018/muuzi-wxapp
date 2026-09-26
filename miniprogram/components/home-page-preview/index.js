/**
 * 主页所见即所得原生预览 · 对齐公开页 SSR（render-page hero-profile）
 * 事件：share / openitem / audiotap
 */
Component({
  properties: {
    model: { type: Object, value: null },
    audioPlayingKey: { type: String, value: '' },
    /** 草稿预览显示 DRAFT 角标；成品可不显示 */
    showDraftBadge: { type: Boolean, value: false },
    /** 顶栏分享按钮是否用 open-type=share */
    shareOpenType: { type: Boolean, value: false },
    /** 底部「登录 MuuZi」· 对齐公开页 home-entry（默认开） */
    showLogin: { type: Boolean, value: true },
    /** 登录跳转地址；空则用默认正式登录页 */
    loginUrl: { type: String, value: '' },
    joinUrl: { type: String, value: '' },
  },

  methods: {
    onShareTap() {
      this.triggerEvent('share');
    },
    onOpenItem(e) {
      var ds = (e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('openitem', {
        url: ds.url || '',
        title: ds.title || '',
        note: ds.note || '',
      });
    },
    onAudioTap(e) {
      var ds = (e.currentTarget && e.currentTarget.dataset) || {};
      this.triggerEvent('audiotap', {
        key: ds.key || '',
        url: ds.url || '',
        title: ds.title || '',
        direct: !!ds.direct,
        note: ds.note || '',
      });
    },
    onSkillTap(e) {
      var ds = (e.currentTarget && e.currentTarget.dataset) || {};
      if (!ds.url) return;
      this.triggerEvent('openitem', {
        url: ds.url || '',
        title: ds.title || '',
        note: '',
      });
    },
    onJoinTap() {
      var url =
        this.data.joinUrl ||
        'https://www.muuzi.co/join';
      this.triggerEvent('openitem', {
        url: url,
        title: '加入 MuuZi',
        note: '',
      });
    },
    onLoginTap() {
      var url =
        this.data.loginUrl ||
        'https://www.muuzi.co/app/login';
      this.triggerEvent('login', { url: url });
      this.triggerEvent('openitem', {
        url: url,
        title: '登录 MuuZi',
        note: '',
      });
    },
  },
});
