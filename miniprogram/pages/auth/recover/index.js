const nodeService = require('../../../services/node');
const rules = require('../../../services/rules');
const guduu = require('../../../services/guduu-auth');
const authFlow = require('../../../services/auth-flow');

Page({
  data: {
    email: '',
    busy: false,
    error: '',
    ready: false,
    node: null,
    picking: false,
    nodes: [],
    nodeInitial: 'N',
  },

  onShow() {
    const nodes = nodeService.whitelist();
    let node = null;
    const saved = authFlow.get().nodeDomain;
    try {
      node = saved ? nodeService.resolveNode(saved) : nodeService.resolveInitialNode();
    } catch (e) {
      node = null;
    }
    this.setData({
      nodes: nodes,
      node: node,
      nodeInitial: node && node.brandName ? node.brandName.slice(0, 1).toUpperCase() : 'N',
      picking: !node,
      email: authFlow.get().email || '',
    });
    this.refreshReady();
  },

  refreshReady() {
    const d = this.data;
    this.setData({
      ready: Boolean(d.node) && rules.validEmail(d.email) && !d.busy,
    });
  },

  onEmail(e) {
    this.setData({ email: e.detail.value, error: '' });
    this.refreshReady();
  },

  onChangeNode() {
    this.setData({ picking: true, node: null });
    this.refreshReady();
  },

  onPickNode(e) {
    try {
      const node = nodeService.resolveNode(e.currentTarget.dataset.domain);
      nodeService.rememberDomain(node.domain);
      authFlow.setNodeDomain(node.domain);
      this.setData({
        node: node,
        nodeInitial: (node.brandName || 'N').slice(0, 1).toUpperCase(),
        picking: false,
        error: '',
      });
      this.refreshReady();
    } catch (err) {
      this.setData({ error: err.message || '节点不可用' });
    }
  },

  async onSubmit() {
    if (!this.data.ready || !this.data.node) return;
    this.setData({ busy: true, error: '' });
    this.refreshReady();
    try {
      const email = rules.normalizeEmail(this.data.email);
      await guduu.requestEmailCode(this.data.node, 'recovery', email);
      authFlow.setEmail(email);
      authFlow.setPurpose('recovery');
      authFlow.setNodeDomain(this.data.node.domain);
      wx.navigateTo({ url: '/pages/auth/recover/verify/index' });
    } catch (err) {
      this.setData({ error: err.message || '验证码发送失败' });
    } finally {
      this.setData({ busy: false });
      this.refreshReady();
    }
  },

  goLogin() {
    // 认证回流：不依赖页面栈深度，避免 navigateBack 无上一页时看似无响应
    wx.reLaunch({ url: '/pages/auth/login/index' });
  },
});
