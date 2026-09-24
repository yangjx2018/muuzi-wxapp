/** 会员文案 · 对齐 MuuziGit billing-text.ts */

var FEATURE_LABELS = [
  ['muu_curation', '分身托管：首页只看 Muu 精选，每天一份「我替你看了多少条」'],
  ['templates', '更多主页模板'],
  ['custom_domain', '自定义域名'],
  ['shop', '开店铺'],
  ['analytics', '浏览统计'],
  ['verified_eligible', '可申请认证'],
  ['remove_branding', '隐藏 MuuZi 页脚标识'],
  ['storage_mb', '存储空间'],
];

function shortDate(iso) {
  if (!iso) return '';
  var date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

function billingMeta(billing) {
  if (!billing) return '';
  switch (billing.status) {
    case 'trialing':
      return '试用中 · 至 ' + shortDate(billing.trial_ends_at);
    case 'active':
      return billing.current_period_end
        ? '有效至 ' + shortDate(billing.current_period_end)
        : '生效中';
    case 'past_due':
      return '欠费 · 宽限期内权益照旧';
    case 'canceled':
      return '上一份订阅已取消';
    case 'expired':
      return '上一份订阅已到期';
    default:
      return '未订阅';
  }
}

function money(minor, currency) {
  var amount = (Number(minor || 0) / 100).toFixed(2).replace(/\.00$/, '');
  return currency === 'CNY' ? '¥' + amount : amount + ' ' + currency;
}

function featureLine(key, value) {
  var entry = null;
  for (var i = 0; i < FEATURE_LABELS.length; i++) {
    if (FEATURE_LABELS[i][0] === key) {
      entry = FEATURE_LABELS[i];
      break;
    }
  }
  if (!entry) return null;
  if (key === 'templates') {
    return Array.isArray(value) && value.length > 1
      ? entry[1] + '（' + value.length + ' 套）'
      : null;
  }
  if (key === 'storage_mb') {
    if (!(Number(value) > 0)) return null;
    return (
      entry[1] +
      ' ' +
      (Number(value) >= 1024
        ? Math.round(Number(value) / 1024) + ' GB'
        : value + ' MB')
    );
  }
  return value === true ? entry[1] : null;
}

function orderStatusLabel(status, paidAt) {
  if (status === 'pending') return '待付';
  if (status === 'paid') return '已付 ' + shortDate(paidAt);
  if (status === 'refunded') return '已退款';
  if (status === 'canceled') return '已取消';
  if (status === 'expired') return '已过期';
  return status || '';
}

module.exports = {
  FEATURE_LABELS: FEATURE_LABELS,
  shortDate: shortDate,
  billingMeta: billingMeta,
  money: money,
  featureLine: featureLine,
  orderStatusLabel: orderStatusLabel,
};
