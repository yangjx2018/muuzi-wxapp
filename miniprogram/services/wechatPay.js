/**
 * 微信小程序支付 · 对齐 PRD「JSAPI 为主」
 * 平台若下发 jsapi 参数则调起 wx.requestPayment；
 * 仅扫码（Native）或未配置时诚实失败，禁止假开通。
 */

function extractJsapiParams(checkout) {
  if (!checkout || typeof checkout !== 'object') return null;
  var sources = [
    checkout,
    checkout.payment,
    checkout.jsapi,
    checkout.miniprogram,
  ];
  for (var i = 0; i < sources.length; i++) {
    var p = sources[i];
    if (!p || typeof p !== 'object') continue;
    var timeStamp = String(p.timeStamp || p.timestamp || '');
    var nonceStr = String(p.nonceStr || p.nonce_str || '');
    var pkg = String(p.package || p.pkg || '');
    var paySign = String(p.paySign || p.pay_sign || '');
    var signType = String(p.signType || p.sign_type || 'RSA');
    if (timeStamp && nonceStr && pkg && paySign) {
      return {
        timeStamp: timeStamp,
        nonceStr: nonceStr,
        package: pkg,
        signType: signType,
        paySign: paySign,
      };
    }
  }
  return null;
}

function isWechatConfigured(channels) {
  return (channels || []).some(function (c) {
    return c && c.id === 'wechat' && c.configured !== false;
  });
}

function preferChannel(channels) {
  var usable = (channels || []).filter(function (c) {
    return c && c.configured !== false;
  });
  var wechat = usable.find(function (c) {
    return c.id === 'wechat';
  });
  if (wechat) return wechat.id;
  var online = usable.find(function (c) {
    return c.id !== 'manual';
  });
  if (online) return online.id;
  return usable[0] ? usable[0].id : '';
}

/**
 * @returns {Promise<'paid'|'cancel'|'fail'>}
 */
function requestJsapiPayment(params) {
  return new Promise(function (resolve, reject) {
    if (!params) {
      reject(new Error('缺少微信支付参数'));
      return;
    }
    wx.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType || 'RSA',
      paySign: params.paySign,
      success: function () {
        resolve('paid');
      },
      fail: function (err) {
        var msg = (err && (err.errMsg || err.message)) || '';
        if (/cancel/i.test(msg)) {
          resolve('cancel');
          return;
        }
        var error = new Error(
          msg.replace(/^requestPayment:fail\s*/i, '') ||
            '微信支付未完成，请重试'
        );
        error.code = 'WECHAT_PAY_FAIL';
        reject(error);
      },
    });
  });
}

/**
 * 处理 createOrder / recheckout 返回的 checkout。
 * @returns {Promise<{outcome: string, note: string, codeUrl?: string}>}
 */
function handleCheckout(checkout, options) {
  options = options || {};
  var jsapi = extractJsapiParams(checkout);
  if (jsapi) {
    return requestJsapiPayment(jsapi).then(function (result) {
      if (result === 'paid') {
        return {
          outcome: 'jsapi_ok',
          note: '已发起微信支付；到账后套餐会自动生效，请稍候。',
        };
      }
      return {
        outcome: 'jsapi_cancel',
        note: '已取消支付，订单仍为待付，可再次付款。',
      };
    });
  }

  if (checkout && checkout.kind === 'qr' && (checkout.code_url || options.allowQr)) {
    var codeUrl = checkout.code_url || '';
    return Promise.resolve({
      outcome: 'qr_only',
      note:
        '当前微信渠道返回的是扫码单，小程序 JSAPI 参数尚未下发。可复制链接到微信打开付款；本页不会假开通。',
      codeUrl: codeUrl,
    });
  }

  if (checkout && checkout.kind === 'redirect' && checkout.redirect_url) {
    return Promise.resolve({
      outcome: 'redirect',
      note:
        '该渠道需在浏览器完成付款。小程序内请复制链接到系统浏览器打开；付完回到本页会自动更新。',
      codeUrl: checkout.redirect_url,
    });
  }

  if (checkout && checkout.kind === 'manual') {
    return Promise.resolve({
      outcome: 'manual',
      note: checkout.message || '线下付款：联系平台完成付款，确认后套餐立即生效。',
    });
  }

  return Promise.resolve({
    outcome: 'unsupported',
    note:
      (checkout && checkout.message) ||
      '当前支付结果无法在小程序内完成。请确认平台已开通微信小程序 JSAPI，或改用其他已配置渠道。',
  });
}

module.exports = {
  extractJsapiParams: extractJsapiParams,
  isWechatConfigured: isWechatConfigured,
  preferChannel: preferChannel,
  requestJsapiPayment: requestJsapiPayment,
  handleCheckout: handleCheckout,
};
