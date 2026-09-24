/**
 * 会员 · 对齐 WebMembershipScreen + PRD 微信 JSAPI
 * 未配置渠道诚实失败；禁止假开通。
 */
const session = require('../../../services/session');
const creator = require('../../../services/creator');
const billingText = require('../../../services/billingText');
const wechatPay = require('../../../services/wechatPay');

var POLL_MS = 5000;
var POLL_MAX_MS = 10 * 60 * 1000;

Page({
  data: {
    phase: 'loading',
    error: '',
    note: '',
    busy: '',
    planName: '',
    planMeta: '',
    features: [],
    featureCatalog: billingText.FEATURE_LABELS.map(function (pair) {
      return pair[1];
    }),
    trialAvailable: false,
    trialDays: 0,
    trialName: '',
    interval: 'month',
    channel: '',
    channels: [],
    wechatReady: false,
    payHint: '',
    pending: null,
    payLink: '',
    plans: [],
    orders: [],
    isPaying: false,
  },

  _alive: true,
  _token: '',
  _poll: null,

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    this.bootstrap();
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this._alive = false;
    this.stopPoll();
  },

  goBack() {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/me/index' });
      },
    });
  },

  stopPoll() {
    if (this._poll && this._poll.timer) clearTimeout(this._poll.timer);
    this._poll = null;
  },

  startPoll(orderId) {
    var self = this;
    if (!this._token || !orderId) return;
    if (this._poll && this._poll.orderId === orderId) return;
    this.stopPoll();
    var started = Date.now();
    var tick = function () {
      if (!self._alive) return;
      if (Date.now() - started > POLL_MAX_MS) {
        self._poll = null;
        return;
      }
      self
        .reload()
        .then(function (billing) {
          if (!self._alive) return;
          var order = (billing.orders || []).find(function (o) {
            return o.id === orderId;
          });
          if (!order || order.status !== 'pending') {
            self._poll = null;
            if (order && order.status === 'paid') {
              self.setData({
                note: '付款成功，套餐已生效',
                payLink: '',
              });
            }
            return;
          }
          self._poll = {
            orderId: orderId,
            timer: setTimeout(tick, POLL_MS),
          };
        })
        .catch(function () {
          if (!self._alive) return;
          self._poll = {
            orderId: orderId,
            timer: setTimeout(tick, POLL_MS),
          };
        });
    };
    this._poll = { orderId: orderId, timer: setTimeout(tick, POLL_MS) };
  },

  bootstrap() {
    var self = this;
    self.setData({ phase: 'loading', error: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return self.reload();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ phase: 'ready' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          phase: 'error',
          error: (err && err.message) || '连接平台失败',
        });
      });
  },

  applyBilling(billing, keepChannel) {
    var channels = (billing.channels || []).filter(function (c) {
      return c && c.configured !== false;
    });
    var wechatReady = wechatPay.isWechatConfigured(channels);
    var channel = keepChannel || this.data.channel;
    if (!channel || !channels.some(function (c) {
      return c.id === channel;
    })) {
      channel = wechatPay.preferChannel(channels);
    }
    var features = Object.keys(billing.features || {})
      .map(function (key) {
        return billingText.featureLine(key, billing.features[key]);
      })
      .filter(Boolean);
    var pending =
      (billing.orders || []).find(function (o) {
        return o.status === 'pending';
      }) || null;
    if (pending) {
      pending = Object.assign({}, pending, {
        amountLabel: billingText.money(
          pending.amount_minor,
          pending.currency
        ),
        intervalLabel: pending.interval === 'year' ? '年付' : '月付',
        expiresLabel: pending.expires_at
          ? billingText.shortDate(pending.expires_at) + ' 前有效'
          : '',
      });
    }
    var interval = this.data.interval || 'month';
    var plans = (billing.plans || [])
      .filter(function (p) {
        return !p.is_default;
      })
      .map(function (plan) {
        var price =
          interval === 'year'
            ? plan.price_yearly_minor
            : plan.price_monthly_minor;
        var current =
          plan.id === (billing.plan && billing.plan.id) &&
          ['trialing', 'active', 'past_due'].indexOf(billing.status) !== -1;
        return {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          current: current,
          price: price,
          priceLabel: price
            ? billingText.money(price, plan.currency) +
              ' / ' +
              (interval === 'year' ? '年' : '月')
            : '暂不可购',
        };
      });
    var orders = (billing.orders || []).slice(0, 5).map(function (order) {
      return {
        id: order.id,
        title:
          order.plan_name +
          ' · ' +
          (order.interval === 'year' ? '年付' : '月付') +
          ' · ' +
          billingText.money(order.amount_minor, order.currency),
        meta: order.id + ' · ' + (order.channel_label || order.channel),
        state: billingText.orderStatusLabel(order.status, order.paid_at),
      };
    });
    var payHint = '';
    if (!channels.length) {
      payHint =
        '平台尚未开通任何付款渠道。可浏览套餐与试用；在线购买暂不可用（不会假开通）。';
    } else if (!wechatReady) {
      payHint =
        '微信小程序 JSAPI 渠道未配置。可用其他已开通渠道，或联系平台开通微信支付后再试。';
    } else {
      payHint =
        '将优先使用微信支付。若平台仅返回扫码单而无 JSAPI 参数，会诚实提示，不会假开通。';
    }
    this.setData({
      planName: (billing.plan && billing.plan.name) || '未订阅',
      planMeta:
        billingText.billingMeta(billing) + (billing.grace ? ' · 宽限期' : ''),
      features: features,
      trialAvailable: !!billing.trial_available && !!billing.trial_plan,
      trialDays: (billing.trial_plan && billing.trial_plan.trial_days) || 0,
      trialName: (billing.trial_plan && billing.trial_plan.name) || '',
      channel: channel,
      channels: channels.map(function (c) {
        return {
          id: c.id,
          label: c.id === 'manual' ? '联系平台线下付' : c.label,
          selected: c.id === channel,
        };
      }),
      wechatReady: wechatReady,
      payHint: payHint,
      pending: pending,
      plans: plans,
      orders: orders,
      isPaying:
        ['trialing', 'active', 'past_due'].indexOf(billing.status) !== -1,
    });
    if (pending && pending.channel !== 'manual') {
      this.startPoll(pending.id);
    }
    return billing;
  },

  reload() {
    var self = this;
    return creator.fetchMembership(this._token).then(function (billing) {
      if (!self._alive) return billing;
      return self.applyBilling(billing, true);
    });
  },

  setIntervalMonth() {
    var self = this;
    this.setData({ interval: 'month' }, function () {
      if (self._token) self.reload();
    });
  },

  setIntervalYear() {
    var self = this;
    this.setData({ interval: 'year' }, function () {
      if (self._token) self.reload();
    });
  },

  pickChannel(e) {
    var id = e.currentTarget.dataset.id;
    var channels = this.data.channels.map(function (c) {
      return Object.assign({}, c, { selected: c.id === id });
    });
    this.setData({ channel: id, channels: channels });
  },

  run(key, action) {
    var self = this;
    if (!this._token || this.data.busy) return Promise.resolve();
    this.setData({ busy: key, error: '' });
    return Promise.resolve()
      .then(action)
      .then(function () {
        return self.reload();
      })
      .catch(function (err) {
        if (!self._alive) return;
        var msg = (err && err.message) || '操作失败';
        if (err && err.code === 'CHANNEL_NOT_CONFIGURED') {
          msg = '所选支付渠道尚未开通，请联系平台配置后再试（不会假开通）。';
        }
        self.setData({ error: msg });
      })
      .then(function () {
        if (self._alive) self.setData({ busy: '' });
      });
  },

  afterCheckout(order, checkout) {
    var self = this;
    return wechatPay.handleCheckout(checkout).then(function (result) {
      if (!self._alive) return;
      var patch = { note: result.note, payLink: result.codeUrl || '' };
      self.setData(patch);
      if (result.codeUrl) {
        /* 可选：自动复制方便用户去微信打开 */
      }
      if (order && order.id && order.channel !== 'manual') {
        self.startPoll(order.id);
      }
      if (result.outcome === 'jsapi_ok' && order && order.id) {
        self.startPoll(order.id);
      }
    });
  },

  startTrial() {
    var self = this;
    this.run('trial', function () {
      return creator.startTrial(self._token).then(function () {
        if (self._alive) {
          self.setData({
            note: '试用已开通，分身托管和付费权益立即可用。',
          });
        }
      });
    });
  },

  buy(e) {
    var self = this;
    var planId = e.currentTarget.dataset.id;
    if (!planId) return;
    if (this.data.pending) {
      this.setData({ error: '还有待付订单，请先付款或取消。' });
      return;
    }
    if (!this.data.channels.length) {
      this.setData({
        error: '暂无可用付款渠道，无法下单（不会假开通）。',
      });
      return;
    }
    var channel = this.data.channel || 'manual';
    this.run('buy:' + planId, function () {
      return creator
        .createOrder(self._token, {
          plan_id: planId,
          interval: self.data.interval,
          channel: channel,
        })
        .then(function (result) {
          return self.afterCheckout(result.order, result.checkout);
        });
    });
  },

  payAgain() {
    var self = this;
    var pending = this.data.pending;
    if (!pending) return;
    var target =
      pending.channel === 'manual' && this.data.channel !== 'manual'
        ? this.data.channel
        : pending.channel || this.data.channel;
    this.run('again:' + pending.id, function () {
      return creator
        .recheckoutOrder(self._token, pending.id, target)
        .then(function (result) {
          return self.afterCheckout(result.order, result.checkout);
        });
    });
  },

  cancelPending() {
    var self = this;
    var pending = this.data.pending;
    if (!pending) return;
    this.run('cancel:' + pending.id, function () {
      return creator.cancelOrder(self._token, pending.id).then(function () {
        self.stopPoll();
        if (self._alive) {
          self.setData({ note: '订单已取消', payLink: '' });
        }
      });
    });
  },

  copyPayLink() {
    var url = this.data.payLink;
    if (!url) {
      wx.showToast({ title: '暂无付款链接', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
  },
});
