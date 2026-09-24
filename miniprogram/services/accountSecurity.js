/**
 * 节点账号改密 · 对齐 App accountSecurity（Matrix UIA m.login.password）
 * 无 @guduu/node-auth 时走精简探测；不支持则诚实失败并引导邮箱找回。
 */
const http = require('./http');
const session = require('./session');

function homeserverBase(snap) {
  var hs = (snap && snap.homeserver) || '';
  return String(hs).replace(/\/$/, '');
}

function authErrorMessage(error) {
  if (!error) return '操作暂不可用，请稍后重试';
  if (error.code === 'NETWORK') return '暂时无法连接，请检查网络后重试';
  var code = error.code || '';
  var map = {
    INVALID_PASSWORD: '新密码必须与当前密码不同',
    PASSWORD_DISABLED: '该节点未开放密码修改，请联系节点管理员',
    ADDITIONAL_AUTH_REQUIRED:
      '该账号需要额外身份验证，请到节点的账号安全页面修改密码',
    M_WEAK_PASSWORD: '节点认为新密码强度不足，请换一个更安全的密码',
    M_UNKNOWN_TOKEN: '节点登录已失效，请重新登录',
    M_FORBIDDEN: '当前密码不正确或节点未允许此次修改',
    M_LIMIT_EXCEEDED: '操作过于频繁，请稍后再试',
  };
  if (map[code]) return map[code];
  if (error.statusCode === 429) return '操作过于频繁，请稍后再试';
  if (error.statusCode === 401 || error.statusCode === 403) {
    return '当前密码不正确或节点未允许此次修改';
  }
  return error.message || '节点未确认操作成功，请检查输入或稍后核实';
}

function canChangePassword() {
  var snap = session.snapshot();
  var base = homeserverBase(snap);
  if (!base || !snap.accessToken) {
    return Promise.reject(new Error('未登录或节点地址无效'));
  }
  return http
    .request({
      url: base + '/_matrix/client/v3/account/password',
      method: 'POST',
      header: { Authorization: 'Bearer ' + snap.accessToken },
      data: {},
      timeout: 15000,
    })
    .then(function () {
      return true;
    })
    .catch(function (err) {
      if (err && err.statusCode === 401 && err.body) {
        var flows =
          (err.body.flows && Array.isArray(err.body.flows) && err.body.flows) ||
          [];
        var ok = flows.some(function (flow) {
          var stages = (flow && flow.stages) || [];
          return stages.indexOf('m.login.password') !== -1;
        });
        if (ok) return true;
        if (flows.length) {
          var e = new Error(authErrorMessage({ code: 'ADDITIONAL_AUTH_REQUIRED' }));
          e.code = 'ADDITIONAL_AUTH_REQUIRED';
          throw e;
        }
      }
      if (err && (err.statusCode === 403 || err.code === 'M_FORBIDDEN')) {
        return false;
      }
      throw new Error(authErrorMessage(err));
    });
}

function changePassword(oldPassword, newPassword) {
  var snap = session.snapshot();
  var base = homeserverBase(snap);
  if (!base || !snap.accessToken || !snap.matrixUserId) {
    return Promise.reject(new Error('未登录或节点地址无效'));
  }
  if (oldPassword === newPassword) {
    return Promise.reject(new Error(authErrorMessage({ code: 'INVALID_PASSWORD' })));
  }

  function post(auth) {
    return http.request({
      url: base + '/_matrix/client/v3/account/password',
      method: 'POST',
      header: { Authorization: 'Bearer ' + snap.accessToken },
      data: {
        new_password: newPassword,
        logout_devices: true,
        auth: auth,
      },
      timeout: 20000,
    });
  }

  return post({
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: snap.matrixUserId },
    user: snap.matrixUserId,
    password: oldPassword,
  })
    .catch(function (err) {
      if (err && err.statusCode === 401 && err.body && err.body.session) {
        return post({
          type: 'm.login.password',
          session: err.body.session,
          identifier: { type: 'm.id.user', user: snap.matrixUserId },
          user: snap.matrixUserId,
          password: oldPassword,
        });
      }
      throw err;
    })
    .then(function () {
      session.clearLocal();
      return true;
    })
    .catch(function (err) {
      throw new Error(authErrorMessage(err));
    });
}

module.exports = {
  canChangePassword: canChangePassword,
  changePassword: changePassword,
  authErrorMessage: authErrorMessage,
};
