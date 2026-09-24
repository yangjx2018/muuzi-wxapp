/**
 * 中央商城目录 · 对齐 App guduu.fetchCentralMarket
 * Matrix Bearer 只发往当前节点 /cosmac/market/central-catalog
 */
var http = require('./http');

var ATTACHABLE = { agent: true, skill: true };

function sessionToken(session) {
  return String((session && (session.accessToken || session.access_token)) || '');
}

function sessionOrigin(session) {
  return String(
    (session &&
      (session.nodeOrigin ||
        (session.node && (session.node.nodeOrigin || session.node.origin)))) ||
      ''
  ).replace(/\/$/, '');
}

function parseHttpsOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    if (typeof URL === 'function') {
      var u = new URL(value);
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.pathname !== '/' ||
        u.search ||
        u.hash
      ) {
        return null;
      }
      return u.origin;
    }
  } catch (e) {
    /* fall through */
  }
  if (!/^https:\/\/[^/@?#]+$/i.test(value)) return null;
  return value.replace(/\/$/, '');
}

function normalizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  var productId = String(item.product_id || '');
  var kind = String(item.kind || '');
  if (!productId || !kind) return null;
  return {
    product_id: productId,
    kind: kind,
    name: String(item.name || ''),
    description: String(item.description || ''),
    kindLabel: kind === 'agent' ? 'Agent' : kind === 'skill' ? '技能' : kind,
    attachable: !!ATTACHABLE[kind],
  };
}

function fetchCentralMarket(session) {
  var origin = parseHttpsOrigin(sessionOrigin(session));
  var token = sessionToken(session);
  if (!origin) {
    return Promise.reject(new Error('节点地址无效，请重新选择节点。'));
  }
  if (!token) {
    return Promise.reject(new Error('请重新登录当前节点后再试。'));
  }
  return http
    .request({
      url: origin + '/cosmac/market/central-catalog',
      method: 'GET',
      header: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
      timeout: 20000,
    })
    .then(function (body) {
      var raw = (body && body.items) || [];
      if (!Array.isArray(raw)) return [];
      return raw
        .map(normalizeItem)
        .filter(function (item) {
          return item && item.attachable;
        });
    })
    .catch(function (err) {
      if (err && err.statusCode === 404) {
        throw new Error('这个节点还没开通中央商城，暂时挂不了商品');
      }
      if (err && err.code === 'NETWORK') {
        throw new Error('暂时连不上商城，请检查网络后重试。');
      }
      throw new Error((err && err.message) || '商城读不到');
    });
}

module.exports = {
  fetchCentralMarket: fetchCentralMarket,
  ATTACHABLE: ATTACHABLE,
};
