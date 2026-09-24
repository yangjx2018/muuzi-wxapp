/**
 * 节点商城商品目录 · 对齐 App storefront.ts
 * Matrix Bearer 只发往当前节点 /cosmac/market/v1/creator/*
 */
var http = require('./http');

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

function invalid() {
  throw new Error('店铺返回的数据暂不可用，请重新连接。');
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseStores(value) {
  if (
    !isObject(value) ||
    value.api_version !== 'storefront.v1' ||
    !Array.isArray(value.stores) ||
    value.stores.length > 1000
  ) {
    invalid();
  }
  var seen = {};
  return value.stores.map(function (item) {
    if (
      !isObject(item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      typeof item.name !== 'string' ||
      typeof item.entity_type !== 'string' ||
      typeof item.role !== 'string' ||
      !item.role ||
      item.role.length > 64
    ) {
      invalid();
    }
    if (seen[item.id]) invalid();
    seen[item.id] = true;
    return {
      id: item.id,
      name: item.name,
      entity_type: item.entity_type === 'enterprise' ? 'enterprise' : 'personal',
      role: item.role,
    };
  });
}

function parseStorePage(value, creatorId) {
  if (
    !isObject(value) ||
    value.api_version !== 'storefront.v1' ||
    !isObject(value.store) ||
    value.store.id !== creatorId ||
    !Array.isArray(value.items)
  ) {
    invalid();
  }
  var seen = {};
  var items = value.items.map(function (item) {
    if (
      !isObject(item) ||
      typeof item.product_id !== 'string' ||
      !item.product_id ||
      seen[item.product_id]
    ) {
      invalid();
    }
    seen[item.product_id] = true;
    return {
      product_id: item.product_id,
      version: String(item.version || ''),
      kind: item.kind === 'skill' ? 'skill' : 'agent',
      name: String(item.name || ''),
      description: String(item.description || ''),
      price_amount_minor: Number(item.price_amount_minor) || 0,
      price_currency: String(item.price_currency || 'CNY'),
    };
  });
  return {
    api_version: 'storefront.v1',
    store: {
      id: value.store.id,
      name: String(value.store.name || ''),
      entity_type:
        value.store.entity_type === 'enterprise' ? 'enterprise' : 'personal',
    },
    catalog_revision: Number(value.catalog_revision) || 0,
    items: items,
    next_cursor:
      typeof value.next_cursor === 'string' && value.next_cursor
        ? value.next_cursor
        : null,
  };
}

function storePrice(product) {
  var minor = Number(product && product.price_amount_minor) || 0;
  var currency = String((product && product.price_currency) || 'CNY');
  var major = (minor / 100).toFixed(2);
  if (currency === 'CNY' || currency === 'RMB') return '¥' + major;
  return major + ' ' + currency;
}

function marketRequest(session, suffix) {
  var origin = parseHttpsOrigin(sessionOrigin(session));
  var token = sessionToken(session);
  if (!origin) {
    return Promise.reject(new Error('节点地址无效，请重新选择节点。'));
  }
  if (!token) {
    return Promise.reject(new Error('请重新登录当前节点后查看店铺。'));
  }
  return http
    .request({
      url: origin + '/cosmac/market/v1/creator/' + suffix,
      method: 'GET',
      header: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
      timeout: 20000,
    })
    .catch(function (err) {
      var status = err && err.statusCode;
      if (status === 401) {
        throw new Error('请重新登录当前节点后查看店铺。');
      }
      if (status === 409) {
        throw new Error('商品目录已更新，请重新连接加载。');
      }
      if (status === 404) {
        throw new Error('当前节点尚未提供店铺接口。');
      }
      if (err && err.code === 'NETWORK') {
        throw new Error('暂时连不上店铺，请检查网络后重试。');
      }
      throw new Error((err && err.message) || '店铺暂时无法连接，请稍后重试。');
    });
}

function fetchStores(session) {
  return marketRequest(session, 'storefronts').then(parseStores);
}

function fetchStoreProducts(session, creatorId, cursor) {
  var query =
    'creator_id=' +
    encodeURIComponent(creatorId) +
    '&page_size=20&cursor=' +
    encodeURIComponent(cursor || '');
  return marketRequest(session, 'storefront-products?' + query).then(function (
    body
  ) {
    return parseStorePage(body, creatorId);
  });
}

module.exports = {
  fetchStores: fetchStores,
  fetchStoreProducts: fetchStoreProducts,
  storePrice: storePrice,
  parseStores: parseStores,
  parseStorePage: parseStorePage,
};
