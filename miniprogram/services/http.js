function request(options) {
  const url = options.url;
  const method = options.method || 'GET';
  const data = options.data;
  const header = Object.assign(
    { Accept: 'application/json' },
    options.header || {}
  );
  if (data !== undefined && !header['content-type'] && !header['Content-Type']) {
    header['content-type'] = 'application/json';
  }

  return new Promise(function (resolve, reject) {
    wx.request({
      url: url,
      method: method,
      data: data,
      header: header,
      timeout: options.timeout || 20000,
      success: function (res) {
        const body = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
          return;
        }
        const err = new Error(extractMessage(body, res.statusCode));
        err.statusCode = res.statusCode;
        err.code = extractCode(body);
        err.body = body;
        reject(err);
      },
      fail: function () {
        var host = '';
        try {
          host = String(url || '')
            .replace(/^https?:\/\//i, '')
            .split('/')[0];
        } catch (e) {
          host = '';
        }
        const err = new Error(
          host
            ? '连不上 ' + host + '，检查网络后再试'
            : '暂时无法连接，请检查网络后重试'
        );
        err.code = 'NETWORK';
        reject(err);
      },
    });
  });
}

function extractMessage(body, status) {
  if (body && typeof body === 'object') {
    if (typeof body.error === 'string' && body.error) return body.error;
    if (typeof body.message === 'string' && body.message) return body.message;
  }
  if (status === 429) return '操作过于频繁，请稍后再试';
  if (status === 401 || status === 403) return '账号、密码或验证码不正确，或节点未允许此操作';
  return '节点未确认操作成功（' + status + '）';
}

function extractCode(body) {
  if (!body || typeof body !== 'object') return '';
  // Prefer Matrix errcode; product `code` is secondary.
  return String(body.errcode || body.code || '');
}

module.exports = {
  request: request,
};
