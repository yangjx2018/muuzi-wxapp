/**
 * 对齐 MuuziGit fieldVisitorEntry.ts — 小程序用 query / 粘贴链接解析邀请。
 * 不持久化 joinProof 到长期 key；临时 key 仅本机接续用。
 */
var api = require('./fieldNodeApi');
var store = require('../adapters/secure-store');

var TEMP_PREFIX = 'field.entry.temp:';
var PERSIST_PREFIX = 'muuzi.field.return.v1:';

function resolveNode(link) {
  var node = api.approvedFieldNode(link.instanceId);
  if (!node) return null;
  return { node: node, link: link };
}

/** 从完整 HTTPS 邀请 URL 解析 */
function visitorEntryFromUrl(url) {
  try {
    var link = api.parseFieldLink(url);
    var resolved = resolveNode(link);
    if (!resolved) return null;
    if (String(url).indexOf(resolved.node.entryOrigin + '/') !== 0) {
      return null;
    }
    remember(resolved);
    return resolved;
  } catch (e) {
    return null;
  }
}

/** 从小程序 onLoad options 解析 */
function visitorEntryFromQuery(query) {
  try {
    var link = api.parseFieldQuery(query);
    var resolved = resolveNode(link);
    if (!resolved) return null;
    remember(resolved);
    return resolved;
  } catch (e) {
    return null;
  }
}

function entryKey(invitationId) {
  return '/connect/join/' + invitationId;
}

function remember(resolved) {
  var path = entryKey(resolved.link.invitationId);
  var source =
    resolved.node.entryOrigin +
    path +
    '#n=' +
    encodeURIComponent(resolved.link.instanceId) +
    '&p=' +
    encodeURIComponent(resolved.link.joinProof) +
    '&e=' +
    encodeURIComponent(String(resolved.link.expiresAt));
  store.set(TEMP_PREFIX + path, source);
  store.set(
    PERSIST_PREFIX + path,
    JSON.stringify({
      version: 1,
      instanceId: resolved.node.instanceId,
      nodeOrigin: resolved.node.origin,
      invitationId: resolved.link.invitationId,
      expiresAt: resolved.link.expiresAt,
    })
  );
}

/** 仅 locator；无 joinProof 时不可提交新申请 */
function visitorEntryFromStorage(invitationId) {
  try {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        invitationId
      )
    ) {
      return null;
    }
    var path = entryKey(invitationId);
    var temp = store.get(TEMP_PREFIX + path);
    if (temp) {
      return visitorEntryFromUrl(temp);
    }
    var raw = store.get(PERSIST_PREFIX + path);
    if (!raw) return null;
    var value = JSON.parse(raw);
    var node = api.approvedFieldNode(value.instanceId);
    if (
      !value ||
      value.version !== 1 ||
      !node ||
      value.nodeOrigin !== node.origin ||
      value.invitationId !== invitationId ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= 0
    ) {
      return null;
    }
    return {
      node: node,
      link: {
        instanceId: node.instanceId,
        invitationId: value.invitationId,
        expiresAt: value.expiresAt,
        joinProof: '',
      },
    };
  } catch (e) {
    return null;
  }
}

function clearVisitorEntry(invitationId) {
  var path = entryKey(invitationId);
  store.remove(TEMP_PREFIX + path);
  store.remove(PERSIST_PREFIX + path);
}

/** 统一入口：优先 query，其次粘贴 URL，再次 storage */
function resolveVisitorEntry(options) {
  options = options || {};
  if (options.link) {
    var fromUrl = visitorEntryFromUrl(String(options.link).trim());
    if (fromUrl) return fromUrl;
  }
  if (options.id || options.n || options.p || options.e) {
    var fromQuery = visitorEntryFromQuery(options);
    if (fromQuery) return fromQuery;
  }
  if (options.id) {
    return visitorEntryFromStorage(String(options.id));
  }
  return null;
}

module.exports = {
  visitorEntryFromUrl: visitorEntryFromUrl,
  visitorEntryFromQuery: visitorEntryFromQuery,
  visitorEntryFromStorage: visitorEntryFromStorage,
  clearVisitorEntry: clearVisitorEntry,
  resolveVisitorEntry: resolveVisitorEntry,
};
