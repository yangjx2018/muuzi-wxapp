/**
 * 在开发者工具模拟器内验证：合法域名 + 节点/Platform 可达性。
 * 仅用于本机联调，不进正式业务路由。
 */
const config = require('../../../config');
const devGuard = require('../../../utils/devGuard');

const HOSTS = [
  { name: 'im.muuzi.co', url: 'https://im.muuzi.co/', kind: 'node' },
  { name: 'www.muuzi.co', url: 'https://www.muuzi.co/', kind: 'platform' },
  { name: 'dev-os.guduu.co', url: 'https://dev-os.guduu.co/', kind: 'node' },
  { name: 'guduuos.com', url: 'https://guduuos.com/', kind: 'node' },
];

Page({
  data: {
    urlCheckNote: '请确认开发者工具已开启「校验合法域名」',
    rows: [],
    busy: false,
    done: false,
  },

  onLoad() {
    if (devGuard.blockIfNotDevelop()) return;
    this.setData({
      rows: HOSTS.map(function (h) {
        return { name: h.name, kind: h.kind, status: '待测', detail: '' };
      }),
    });
    const self = this;
    setTimeout(function () {
      self.onStart();
    }, 800);
  },

  onStart() {
    if (this.data.busy) return;
    this.setData({ busy: true, done: false });
    this.runAll(0);
  },

  runAll(index) {
    const self = this;
    if (index >= HOSTS.length) {
      const payload = { done: true, rows: self.data.rows };
      console.log('[DOMAIN_CHECK_DONE] ' + JSON.stringify(payload));
      self.setData({ busy: false, done: true });
      return;
    }
    const host = HOSTS[index];
    const rows = self.data.rows.slice();
    rows[index] = Object.assign({}, rows[index], { status: '请求中…', detail: '' });
    self.setData({ rows: rows });

    wx.request({
      url: host.url,
      method: 'GET',
      timeout: 15000,
      success: function (res) {
        rows[index] = {
          name: host.name,
          kind: host.kind,
          status: 'OK',
          detail: 'HTTP ' + res.statusCode,
        };
        console.log('[DOMAIN_CHECK] ' + JSON.stringify(rows[index]));
        self.setData({ rows: rows });
        self.runAll(index + 1);
      },
      fail: function (err) {
        const msg = (err && (err.errMsg || err.message)) || 'fail';
        rows[index] = {
          name: host.name,
          kind: host.kind,
          status: 'FAIL',
          detail: msg,
        };
        console.log('[DOMAIN_CHECK] ' + JSON.stringify(rows[index]));
        self.setData({ rows: rows });
        self.runAll(index + 1);
      },
    });
  },

  onLoginSmoke() {
    const node = (config.NODE_WHITELIST || []).find(function (n) {
      return n.domain === 'im.muuzi.co';
    });
    if (!node) {
      wx.showToast({ title: '无 im 节点', icon: 'none' });
      return;
    }
    wx.request({
      url: node.nodeOrigin + config.WECHAT_LOGIN_PREFIX + '/capabilities',
      method: 'GET',
      timeout: 15000,
      success: function (res) {
        console.log('[DOMAIN_CHECK_CAP] HTTP ' + res.statusCode);
        wx.showModal({
          title: 'capabilities',
          content: 'HTTP ' + res.statusCode + '（404/503 也算域名已放行）',
          showCancel: false,
        });
      },
      fail: function (err) {
        console.log('[DOMAIN_CHECK_CAP_FAIL] ' + ((err && err.errMsg) || 'fail'));
        wx.showModal({
          title: 'capabilities 失败',
          content: (err && err.errMsg) || 'fail',
          showCancel: false,
        });
      },
    });
  },
});
