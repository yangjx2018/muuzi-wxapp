const config = require('../config');
const store = require('../adapters/secure-store');

const NODE_KEY = 'selected_node_domain';

function whitelist() {
  return (config.NODE_WHITELIST || []).slice();
}

function isWhitelisted(domain) {
  const wanted = String(domain || '')
    .trim()
    .toLowerCase();
  return whitelist().some(function (n) {
    return n.domain === wanted;
  });
}

/**
 * 仅白名单节点可连（决策 7）。禁止目录搜索任意域名。
 */
function resolveNode(domain) {
  const wanted = String(domain || '')
    .trim()
    .toLowerCase();
  const item = whitelist().find(function (n) {
    return n.domain === wanted;
  });
  if (!item) {
    const err = new Error('该节点不在首期白名单内，请选择已开放的节点');
    err.code = 'NODE_NOT_WHITELISTED';
    throw err;
  }
  return {
    domain: item.domain,
    instance_id: item.instance_id,
    company_name: item.company_name || item.label || item.domain,
    brandName: item.company_name || item.label || item.domain,
    nodeOrigin: item.nodeOrigin.replace(/\/$/, ''),
    homeserverUrl: (item.homeserverUrl || item.nodeOrigin).replace(/\/$/, ''),
    label: item.label || item.domain,
  };
}

function defaultNode() {
  const list = whitelist();
  if (!list.length) return null;
  try {
    return resolveNode(list[0].domain);
  } catch (e) {
    return null;
  }
}

function rememberDomain(domain) {
  if (isWhitelisted(domain)) store.set(NODE_KEY, domain);
}

function rememberedDomain() {
  const d = store.get(NODE_KEY);
  return isWhitelisted(d) ? d : '';
}

function resolveInitialNode() {
  const remembered = rememberedDomain();
  if (remembered) return resolveNode(remembered);
  return defaultNode();
}

module.exports = {
  whitelist: whitelist,
  isWhitelisted: isWhitelisted,
  resolveNode: resolveNode,
  defaultNode: defaultNode,
  rememberDomain: rememberDomain,
  rememberedDomain: rememberedDomain,
  resolveInitialNode: resolveInitialNode,
};
