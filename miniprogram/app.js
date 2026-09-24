const session = require('./services/session');
const matrixRuntime = require('./services/matrixRuntime');
const deepLink = require('./services/messageDeepLink');
const devGuard = require('./utils/devGuard');

App({
  globalData: {
    ready: false,
    pendingRoom: '',
    openRoomId: '',
  },

  onLaunch(options) {
    var query = (options && options.query) || {};
    this.globalData.pendingRoom = deepLink.parseRoomQuery(query);
    this.bootstrap();
  },

  async bootstrap() {
    try {
      await session.restore();
      if (session.isSignedIn()) {
        matrixRuntime.ensureStarted();
      }
    } catch (err) {
      console.warn('[app] session restore failed', err);
      session.clearLocal();
    } finally {
      this.globalData.ready = true;
      this.routeBySession();
      this.flushPendingRoom();
    }
  },

  flushPendingRoom() {
    var roomId = this.globalData.pendingRoom;
    if (!roomId || !session.isSignedIn()) return;
    this.globalData.pendingRoom = '';
    // 等首屏落稳再进会话，避免与 switchTab 抢导航
    setTimeout(function () {
      deepLink.openRoom(roomId).catch(function () {});
    }, 400);
  },

  /**
   * 无会话 → 登录；有会话 → 默认「连接」。
   * 访客落地 /pages/connect/join 不强制跳登录（决策 3 / M0.6）。
   */
  routeBySession() {
    const pages = getCurrentPages();
    const current = pages.length ? pages[pages.length - 1] : null;
    const route = current ? '/' + current.route : '';
    const guestOk =
      route.indexOf('/pages/connect/join') === 0 ||
      (devGuard.devPagesAllowed() && devGuard.isDevRoute(route));
    const authPage = route.indexOf('/pages/auth/') === 0;

    if (session.isSignedIn()) {
      if (authPage || route === '' || route === '/pages/auth/login/index') {
        wx.switchTab({ url: '/pages/connect/index' });
      }
      return;
    }

    if (guestOk) return;
    if (authPage) return;

    wx.reLaunch({ url: '/pages/auth/login/index' });
  },
});
