const http = require('./http');
const rules = require('./rules');

function authErrorMessage(error) {
  if (!error) return '操作暂不可用，请稍后重试';
  if (error.code === 'NETWORK') return error.message || '暂时无法连接，请检查网络后重试';
  if (error.code === 'EMAIL_PROVIDER_NOT_CONFIGURED') {
    return '节点尚未配置邮件服务，请联系节点管理员';
  }
  if (error.code === 'IDENTITY_PASSWORD_RECOVERY_NOT_CONFIGURED') {
    return '节点未开启密码找回，请联系节点管理员';
  }
  if (error.code === 'M_LIMIT_EXCEEDED' || error.statusCode === 429) {
    return '操作过于频繁，请稍后再试';
  }
  if (error.statusCode === 401 || error.statusCode === 403) {
    return '账号、密码或验证码不正确，或节点未允许此操作';
  }
  return error.message || '节点未确认操作成功，请检查输入或稍后核实';
}

function wrap(promise) {
  return promise.catch(function (error) {
    throw new Error(authErrorMessage(error));
  });
}

function loginAtNode(node, method, identifier, password, code) {
  const path = method === 'email' ? 'login/email' : 'login/account';
  const body =
    method === 'email'
      ? { email: identifier.trim(), password: password }
      : { username: identifier.trim(), password: password };
  if (code) body.code = String(code).trim();
  return wrap(
    http.request({
      url: node.nodeOrigin + '/cosmac/' + path,
      method: 'POST',
      data: body,
    })
  );
}

function requestEmailCode(node, purpose, email) {
  const path = purpose === 'register' ? 'register/request-code' : 'reset/request-code';
  return wrap(
    http.request({
      url: node.nodeOrigin + '/cosmac/' + path,
      method: 'POST',
      data: { email: rules.normalizeEmail(email) },
    })
  );
}

function registerAtNode(node, email, code, username, password) {
  return wrap(
    http.request({
      url: node.nodeOrigin + '/cosmac/register/verify',
      method: 'POST',
      data: {
        email: rules.normalizeEmail(email),
        code: code,
        username: String(username).trim().toLowerCase(),
        password: password,
      },
    })
  );
}

function resetPasswordAtNode(node, email, code, password) {
  return wrap(
    http.request({
      url: node.nodeOrigin + '/cosmac/reset/verify',
      method: 'POST',
      data: {
        email: rules.normalizeEmail(email),
        code: code,
        password: password,
      },
    })
  );
}

module.exports = {
  loginAtNode: loginAtNode,
  requestEmailCode: requestEmailCode,
  registerAtNode: registerAtNode,
  resetPasswordAtNode: resetPasswordAtNode,
  authErrorMessage: authErrorMessage,
};
