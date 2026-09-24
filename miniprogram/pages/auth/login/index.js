const session = require('../../../services/session');
const nodeService = require('../../../services/node');
const rules = require('../../../services/rules');
const guduu = require('../../../services/guduu-auth');
const wechat = require('../../../services/wechat-login');
const authFlow = require('../../../services/auth-flow');

Page({
  data: {
    section: '主理人入口',
    statusText: 'NODE / REQUIRED',
    notice: '',
    error: '',
    identifier: '',
    password: '',
    showPassword: false,
    showBindPassword: false,
    securityCode: '',
    stepUpHint: '',
    loginBusy: false,
    wechatBusy: false,
    node: null,
    picking: false,
    nodes: [],
    ready: false,
    // 首次微信登录：绑定弹框
    bindSheetVisible: false,
    bindSheetMode: 'form', // form | fail
    bindToken: '',
    bindAccount: '',
    bindPassword: '',
    bindReady: false,
    bindBusy: false,
    bindError: '',
    bindFailHint: '',
  },


  onShow() {
    if (session.isSignedIn()) {
      session.enterDefaultTab();
      return;
    }
    const notice = authFlow.takeNotice();
    const nodes = nodeService.whitelist();
    let node = null;
    try {
      node = nodeService.resolveInitialNode();
    } catch (e) {
      node = null;
    }
    if (node) authFlow.setNodeDomain(node.domain);
    this.setData({
      notice: notice || '',
      nodes: nodes,
      node: node,
      nodeInitial: node && node.brandName ? node.brandName.slice(0, 1).toUpperCase() : 'N',
      picking: !node,
      statusText: node ? 'NODE / READY' : 'NODE / REQUIRED',
    });
    this.refreshReady();
  },

  refreshReady() {
    const d = this.data;
    // busy 时仍保持 ready 视觉条件由按钮 loading/disabled 单独表达；
    // 勿把 busy 折进 ready，否则未就绪时原生 disabled 会吞掉点击、毫无提示。
    const ready =
      Boolean(d.node) &&
      rules.validLogin(d.identifier, d.password) &&
      (!d.stepUpHint || rules.validCode(d.securityCode));
    this.setData({ ready: ready });
  },

  refreshBindReady() {
    const d = this.data;
    this.setData({
      bindReady: rules.validLogin(d.bindAccount, d.bindPassword) && !d.bindBusy,
    });
  },

  onIdentifier(e) {
    this.setData({
      identifier: e.detail.value,
      securityCode: '',
      stepUpHint: '',
      error: '',
    });
    this.refreshReady();
  },

  onPassword(e) {
    this.setData({ password: e.detail.value, error: '' });
    this.refreshReady();
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleBindPassword() {
    this.setData({ showBindPassword: !this.data.showBindPassword });
  },

  onGear() {
    // 对齐 App AuthShell 齿轮：登录前用于节点偏好，落地为更换节点。
    if (this.data.node) {
      this.onChangeNode();
      return;
    }
    this.setData({ picking: true });
  },

  onSecurityCode(e) {
    const v = String(e.detail.value || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    this.setData({ securityCode: v, error: '' });
    this.refreshReady();
  },

  onChangeNode() {
    this.setData({ picking: true, node: null, statusText: 'NODE / REQUIRED' });
    this.refreshReady();
  },

  onPickNode(e) {
    const domain = e.currentTarget.dataset.domain;
    this.selectNodeDomain(domain);
  },

  selectNodeDomain(domain) {
    try {
      const node = nodeService.resolveNode(domain);
      nodeService.rememberDomain(domain);
      authFlow.setNodeDomain(domain);
      this.setData({
        node: node,
        nodeInitial: (node.brandName || 'N').slice(0, 1).toUpperCase(),
        picking: false,
        statusText: 'NODE / READY',
        error: '',
      });
      this.refreshReady();
    } catch (err) {
      this.setData({
        error: err.message || '该节点不可用',
      });
    }
  },

  onLoginTap() {
    console.log('[PASSWORD_LOGIN] tap fired');
    if (this.data.loginBusy || this.data.wechatBusy) {
      console.log('[PASSWORD_LOGIN] ignored: busy');
      return;
    }
    var identifier = String(this.data.identifier || '').trim();
    var password = String(this.data.password || '');
    var securityCode = String(this.data.securityCode || '').replace(/\D/g, '').slice(0, 6);
    this._runPasswordLogin(identifier, password, securityCode);
  },

  async _runPasswordLogin(identifier, password, securityCode) {
    if (this.data.loginBusy || this.data.wechatBusy) return;
    if (!this.data.node) {
      this._failLogin('请先选择节点');
      return;
    }
    if (!rules.validLogin(identifier, password)) {
      this._failLogin('请填写账号和密码');
      return;
    }
    if (this.data.stepUpHint && !rules.validCode(securityCode)) {
      this._failLogin('请输入 6 位安全验证码');
      return;
    }
    this.setData({ loginBusy: true, wechatBusy: false, error: '' });
    console.log(
      '[PASSWORD_LOGIN] start node=' +
        (this.data.node && this.data.node.domain) +
        ' id=' +
        identifier +
        ' method=' +
        rules.resolvedLoginMethod(identifier)
    );
    try {
      const method = rules.resolvedLoginMethod(identifier);
      const result = await guduu.loginAtNode(
        this.data.node,
        method,
        identifier,
        password,
        securityCode || undefined
      );
      if (result.step_up) {
        this.setData({
          stepUpHint: result.email_hint || '绑定邮箱',
          securityCode: '',
          error: '节点已发送安全验证码，请输入后继续登录',
          loginBusy: false,
        });
        this.refreshReady();
        return;
      }
      console.log('[PASSWORD_LOGIN] ok user=' + (result && result.user_id));
      session.beginSession(this.data.node, result);
      authFlow.reset();
      this.afterLoginSuccess();
    } catch (err) {
      console.log('[PASSWORD_LOGIN] fail ' + ((err && err.message) || err));
      this._failLogin((err && err.message) || '登录失败');
    }
  },

  _failLogin(message) {
    this.setData({ error: message, loginBusy: false });
    this.refreshReady();
    try {
      wx.showToast({ title: message, icon: 'none', duration: 2500 });
    } catch (e) {
      /* ignore */
    }
  },

  afterLoginSuccess() {
    // 先进连接 Tab，再后台换 Creator；勿等段 B，也勿在 toast 期间导航（会卡在登录页）
    session.enterDefaultTab();
    session.ensureCreatorSession().catch(function () {
      wx.showToast({ title: '平台会话稍后重试', icon: 'none' });
    });
  },

  async onWeChatLogin() {
    if (!this.data.node || this.data.loginBusy || this.data.wechatBusy || this.data.bindSheetVisible) {
      if (!this.data.node) {
        this.setData({ error: '请先选择节点' });
      }
      return;
    }
    this.setData({ wechatBusy: true, loginBusy: false, error: '' });
    console.log('[WECHAT_LOGIN] start node=' + (this.data.node && this.data.node.domain));
    try {
      const result = await wechat.loginWithWeChat(this.data.node);
      console.log('[WECHAT_LOGIN] result status=' + (result && result.status));
      if (result.status === 'authenticated') {
        session.beginSession(this.data.node, result);
        authFlow.reset();
        this.afterLoginSuccess();
        return;
      }
      if (result.status === 'bind_required' && result.bind_token) {
        // 首次：弹框让用户验证本节点已有账号，再绑定进入
        authFlow.setBindToken(result.bind_token);
        authFlow.setNodeDomain(this.data.node.domain);
        this.openBindSheet(result.bind_token);
        this.setData({ wechatBusy: false });
        return;
      }
      throw new Error('节点返回了无法识别的微信登录结果');
    } catch (err) {
      const friendly = wechat.friendlyError(err);
      console.log('[WECHAT_LOGIN] fail ' + friendly.message);
      this.setData({
        error: friendly.message || '微信登录失败',
        wechatBusy: false,
      });
    }
  },

  openBindSheet(bindToken) {
    const prefill = this.data.identifier.trim();
    this.setData({
      bindSheetVisible: true,
      bindSheetMode: 'form',
      bindToken: bindToken,
      bindAccount: prefill,
      bindPassword: '',
      bindBusy: false,
      bindError: '',
      bindFailHint: '',
    });
    this.refreshBindReady();
  },

  closeBindSheet() {
    if (this.data.bindBusy) return;
    authFlow.setBindToken('');
    this.setData({
      bindSheetVisible: false,
      bindSheetMode: 'form',
      bindToken: '',
      bindAccount: '',
      bindPassword: '',
      bindError: '',
      bindFailHint: '',
      bindReady: false,
      bindBusy: false,
    });
  },

  noop() {},

  onBindAccount(e) {
    this.setData({ bindAccount: e.detail.value, bindError: '' });
    this.refreshBindReady();
  },

  onBindPassword(e) {
    this.setData({ bindPassword: e.detail.value, bindError: '' });
    this.refreshBindReady();
  },

  async onBindConfirm() {
    if (!this.data.bindReady || this.data.bindBusy || !this.data.node) return;
    this.setData({ bindBusy: true, bindError: '' });
    this.refreshBindReady();
    console.log('[WECHAT_BIND] sheet submit account=' + this.data.bindAccount.trim());
    try {
      const result = await wechat.bindAccount(
        this.data.node,
        this.data.bindToken,
        'account_password',
        {
          account: this.data.bindAccount.trim(),
          password: this.data.bindPassword,
        }
      );
      if (result.status !== 'authenticated' || !result.access_token || !result.user_id) {
        throw new Error('绑定未完成，请重试');
      }
      console.log('[WECHAT_BIND] ok user=' + result.user_id);
      session.beginSession(this.data.node, result);
      authFlow.reset();
      this.setData({ bindSheetVisible: false, bindBusy: false });
      this.afterLoginSuccess();
    } catch (err) {
      const friendly = wechat.friendlyError(err);
      const code = err && err.code ? err.code : '';
      console.log('[WECHAT_BIND] fail ' + friendly.message + ' code=' + code);
      // 凭证不过：进入失败选择态（重填 / 建新账号）
      if (
        code === 'BIND_CREDENTIAL_INVALID' ||
        err.statusCode === 401 ||
        err.statusCode === 403 ||
        /不正确|不存在/.test(friendly.message || '')
      ) {
        this.setData({
          bindSheetMode: 'fail',
          bindFailHint: '未找到匹配的账号，或密码不正确。请重新填写，或在本节点建立新账号后再绑定。',
          bindBusy: false,
          bindError: '',
        });
        this.refreshBindReady();
        return;
      }
      if (code === 'BIND_TOKEN_INVALID') {
        this.setData({
          bindSheetVisible: false,
          bindBusy: false,
          error: '微信验证已过期，请重新点「微信登录」',
        });
        authFlow.setBindToken('');
        return;
      }
      this.setData({
        bindError: friendly.message || '绑定失败',
        bindBusy: false,
      });
      this.refreshBindReady();
    }
  },

  onBindRetry() {
    this.setData({
      bindSheetMode: 'form',
      bindPassword: '',
      bindError: '',
      bindFailHint: '',
    });
    this.refreshBindReady();
  },

  onBindCreateAccount() {
    // 保留 bind_token，注册完成后仍可回到微信绑定（若未过期）
    this.setData({ bindSheetVisible: false });
    wx.navigateTo({ url: '/pages/auth/join/index' });
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/auth/join/index' });
  },

  goRecover() {
    const id = this.data.identifier.trim();
    if (rules.validEmail(id)) authFlow.setEmail(rules.normalizeEmail(id));
    wx.navigateTo({ url: '/pages/auth/recover/index' });
  },
});
