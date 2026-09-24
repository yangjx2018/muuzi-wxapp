/**
 * 微信登录 / 绑定 · 对齐契约 A
 * bind 必须带 method + Idempotency-Key；账号字段为 account（非 username）。
 */
const config = require('../config');
const http = require('./http');

function capabilities(node) {
  return http.request({
    url: node.nodeOrigin + config.WECHAT_LOGIN_PREFIX + '/capabilities',
    method: 'GET',
  });
}

function sessionWithCode(node, code) {
  return http.request({
    url: node.nodeOrigin + config.WECHAT_LOGIN_PREFIX + '/session',
    method: 'POST',
    data: {
      appid: config.MINIPROGRAM_APPID,
      code: code,
      device_name: 'MuuziWx',
      client: 'miniprogram',
    },
  });
}

function newIdempotencyKey() {
  return (
    'wxb_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * @param {object} node
 * @param {string} bindToken
 * @param {'account_password'|'email_code'} method
 * @param {object} creds { account?, password?, email?, code? }
 */
function bindAccount(node, bindToken, method, creds) {
  const body = {
    bind_token: bindToken,
    method: method,
    device_name: 'MuuziWx',
    client: 'miniprogram',
  };
  if (method === 'account_password') {
    body.account = String((creds && creds.account) || '').trim();
    body.password = String((creds && creds.password) || '');
  } else {
    body.email = String((creds && creds.email) || '').trim().toLowerCase();
    body.code = String((creds && creds.code) || '').trim();
  }
  return http.request({
    url: node.nodeOrigin + config.WECHAT_LOGIN_PREFIX + '/bind',
    method: 'POST',
    header: {
      'Idempotency-Key': newIdempotencyKey(),
      'content-type': 'application/json',
    },
    data: body,
  });
}

function loginWithWeChat(node) {
  return new Promise(function (resolve, reject) {
    console.log('[WECHAT_LOGIN] capabilities ' + node.nodeOrigin);
    capabilities(node)
      .then(function (caps) {
        console.log(
          '[WECHAT_LOGIN] caps available=' +
            (caps && caps.available) +
            ' appid=' +
            (caps && caps.appid)
        );
        if (!caps || caps.available !== true) {
          reject(new Error('当前节点尚未开放微信登录'));
          return;
        }
        if (caps.appid && caps.appid !== config.MINIPROGRAM_APPID) {
          reject(new Error('小程序 AppId 与节点配置不一致'));
          return;
        }
        wx.login({
          success: function (res) {
            console.log('[WECHAT_LOGIN] wx.login code=' + (res.code ? 'yes' : 'no'));
            if (!res.code) {
              reject(new Error('微信未返回登录码'));
              return;
            }
            sessionWithCode(node, res.code)
              .then(resolve)
              .catch(function (err) {
                console.log(
                  '[WECHAT_LOGIN] session fail ' + ((err && err.message) || err)
                );
                reject(friendlyError(err));
              });
          },
          fail: function (e) {
            console.log('[WECHAT_LOGIN] wx.login fail ' + JSON.stringify(e || {}));
            reject(new Error('微信登录暂时不可用，请稍后重试'));
          },
        });
      })
      .catch(function (err) {
        console.log(
          '[WECHAT_LOGIN] capabilities fail ' +
            ((err && err.message) || err) +
            ' status=' +
            (err && err.statusCode)
        );
        if (err.statusCode === 404 || err.statusCode === 503) {
          reject(new Error('当前节点尚未开放微信登录'));
          return;
        }
        reject(friendlyError(err));
      });
  });
}

function friendlyError(err) {
  if (!err) return new Error('操作失败，请稍后重试');
  const code = err.code || '';
  const map = {
    BIND_CREDENTIAL_INVALID: '账号不存在或密码不正确',
    BIND_TOKEN_INVALID: '绑定已过期，请返回重新用微信登录',
    WECHAT_ALREADY_BOUND: '这个微信已绑定其他账号',
    ACCOUNT_ALREADY_HAS_WECHAT: '该账号已绑定其他微信',
    RATE_LIMITED: '操作太频繁，请稍后再试',
    WECHAT_CODE_INVALID: '微信登录已过期，请重试',
    WECHAT_APPID_MISMATCH: '小程序与节点配置不一致',
    WECHAT_PROVIDER_ERROR: '登录服务暂时繁忙，请稍后再试',
    WECHAT_LOGIN_UNAVAILABLE: '当前节点尚未开放微信登录',
    INVALID_INPUT: '请检查填写是否完整',
  };
  if (map[code]) return new Error(map[code]);
  if (err.statusCode === 401 || err.statusCode === 403) {
    return new Error('账号或密码不正确');
  }
  return err instanceof Error ? err : new Error(String(err.message || '操作失败'));
}

module.exports = {
  capabilities: capabilities,
  sessionWithCode: sessionWithCode,
  bindAccount: bindAccount,
  loginWithWeChat: loginWithWeChat,
  friendlyError: friendlyError,
  newIdempotencyKey: newIdempotencyKey,
};
