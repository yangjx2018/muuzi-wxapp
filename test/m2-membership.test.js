const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

before(() => {
  global.wx = {
    requestPayment(opts) {
      if (opts && opts.success) opts.success({});
    },
  };
});

describe('M2.5 membership + WeChat JSAPI', () => {
  it('billingText formats money and meta', () => {
    const t = require('../miniprogram/services/billingText');
    assert.equal(t.money(19900, 'CNY'), '¥199');
    assert.match(t.billingMeta({ status: 'active', current_period_end: '2026-12-01' }), /有效至/);
    assert.equal(t.featureLine('shop', true), '开店铺');
    assert.equal(t.featureLine('shop', false), null);
  });

  it('wechatPay extracts JSAPI and prefers wechat channel', async () => {
    const pay = require('../miniprogram/services/wechatPay');
    assert.equal(pay.isWechatConfigured([{ id: 'wechat', configured: true }]), true);
    assert.equal(pay.isWechatConfigured([{ id: 'manual' }]), false);
    assert.equal(
      pay.preferChannel([
        { id: 'manual', configured: true },
        { id: 'wechat', configured: true },
      ]),
      'wechat'
    );
    const params = pay.extractJsapiParams({
      kind: 'jsapi',
      timeStamp: '1',
      nonceStr: 'n',
      package: 'prepay_id=x',
      paySign: 's',
      signType: 'RSA',
    });
    assert.equal(params.package, 'prepay_id=x');
    const ok = await pay.handleCheckout({
      kind: 'jsapi',
      timeStamp: '1',
      nonceStr: 'n',
      package: 'prepay_id=x',
      paySign: 's',
    });
    assert.equal(ok.outcome, 'jsapi_ok');

    const qr = await pay.handleCheckout({
      kind: 'qr',
      code_url: 'weixin://wxpay/bizpayurl?pr=x',
    });
    assert.equal(qr.outcome, 'qr_only');
    assert.match(qr.note, /不会假开通|JSAPI/);

    const none = await pay.handleCheckout({ kind: 'unknown' });
    assert.equal(none.outcome, 'unsupported');
  });

  it('creator exposes membership order helpers', () => {
    const creator = require('../miniprogram/services/creator');
    assert.equal(typeof creator.fetchMembership, 'function');
    assert.equal(typeof creator.startTrial, 'function');
    assert.equal(typeof creator.createOrder, 'function');
    assert.equal(typeof creator.recheckoutOrder, 'function');
    assert.equal(typeof creator.cancelOrder, 'function');
  });

  it('membership page wires billing trial buy wechat honesty', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/membership/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/membership/index.wxml'),
      'utf8'
    );
    assert.doesNotMatch(js, /createStubPage/);
    assert.match(js, /fetchMembership/);
    assert.match(js, /startTrial/);
    assert.match(js, /createOrder/);
    assert.match(js, /wechatPay|handleCheckout/);
    assert.match(js, /不会假开通|CHANNEL_NOT_CONFIGURED|payHint/);
    assert.match(wxml, /开始试用|startTrial/);
    assert.match(wxml, /bindtap="buy"/);
    assert.match(wxml, /payHint|不会假开通/);
  });
});
