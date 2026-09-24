/**
 * 微信侧通知适配 · 对齐 App NotificationSettings 语义，但不假装原生 Matrix 推送已通。
 * 小程序无 iOS 原生桥；用订阅消息授权状态作诚实提示。
 */

function notificationsSupported() {
  return typeof wx !== 'undefined' && typeof wx.getSetting === 'function';
}

function notificationStatus() {
  if (!notificationsSupported()) {
    return Promise.resolve({
      supported: false,
      authorized: false,
      enabled: false,
      reason: 'unsupported',
    });
  }
  return new Promise(function (resolve) {
    wx.getSetting({
      withSubscriptions: true,
      success: function (res) {
        var auth = (res && res.authSetting) || {};
        // 订阅消息总开关在部分基础库位于 subscriptionsSetting.mainSwitch
        var sub = (res && res.subscriptionsSetting) || {};
        var mainOn = sub.mainSwitch !== false;
        var notified =
          auth['scope.informMessage'] === true ||
          auth['scope.subscribemsg'] === true;
        resolve({
          supported: true,
          authorized: mainOn,
          enabled: mainOn && (notified || sub.mainSwitch === true),
          reason: mainOn ? 'ready' : 'denied',
          raw: { authSetting: auth, subscriptionsSetting: sub },
        });
      },
      fail: function () {
        resolve({
          supported: true,
          authorized: false,
          enabled: false,
          reason: 'unavailable',
        });
      },
    });
  });
}

function openNotificationSettings() {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || typeof wx.openSetting !== 'function') {
      reject(new Error('当前环境无法打开系统设置'));
      return;
    }
    wx.openSetting({
      success: function () {
        resolve();
      },
      fail: function () {
        reject(new Error('无法打开设置，请在微信中手动开启通知'));
      },
    });
  });
}

function compactNumber(value) {
  var n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  if (n < 10000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  if (n < 100000000) {
    var w = n / 10000;
    return (w >= 100 ? Math.floor(w) : w.toFixed(w >= 10 ? 0 : 1)) + '万';
  }
  return (n / 100000000).toFixed(1) + '亿';
}

module.exports = {
  notificationsSupported: notificationsSupported,
  notificationStatus: notificationStatus,
  openNotificationSettings: openNotificationSettings,
  compactNumber: compactNumber,
};
