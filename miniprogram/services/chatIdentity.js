/**
 * Presentation-only contact labels (parity with App chat-identity.ts).
 * Matrix user IDs remain the routing truth; remarks live in account_data
 * `im.muuzi.chat_labels` so the same Matrix account can share labels with App.
 */

var CHAT_LABELS_ACCOUNT_DATA = 'im.muuzi.chat_labels';

function emptyPreferences() {
  return { contacts: Object.create(null), nodes: Object.create(null) };
}

function serverOf(id) {
  if (typeof id !== 'string' || id.charAt(0) !== '@') return '';
  var colon = id.indexOf(':');
  return colon > 1 ? id.slice(colon + 1).toLowerCase() : '';
}

function cleanMap(input) {
  var out = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  var keys = Object.keys(input);
  for (var i = 0; i < keys.length; i++) {
    var id = keys[i];
    var text = input[id];
    if (typeof text !== 'string') continue;
    out[id] = String(text).trim().slice(0, 80);
  }
  return out;
}

function preferencesFromAccountData(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return emptyPreferences();
  }
  return {
    contacts: cleanMap(content.contacts),
    nodes: cleanMap(content.nodes),
  };
}

function preferencesFromStore(accountData) {
  return preferencesFromAccountData(
    accountData && accountData[CHAT_LABELS_ACCOUNT_DATA]
  );
}

function contactIdentity(userId, ownId, nickname, preferences, brands) {
  preferences = preferences || emptyPreferences();
  brands = brands || Object.create(null);
  var server = serverOf(userId);
  var raw = typeof nickname === 'string' ? nickname.trim() : '';
  var display = raw === userId ? '' : raw;
  var remark =
    typeof preferences.contacts[userId] === 'string'
      ? preferences.contacts[userId]
      : '';
  var nodeRemark =
    typeof preferences.nodes[server] === 'string'
      ? preferences.nodes[server]
      : '';
  var ownServer = serverOf(ownId);
  var crossNode = !!(server && ownServer && server !== ownServer);
  var localpart =
    server && typeof userId === 'string'
      ? userId.slice(1, userId.indexOf(':'))
      : userId;
  var name = remark || display || localpart || '未知用户';
  var brand =
    typeof brands[server] === 'string' && brands[server] ? brands[server] : '';
  var source = nodeRemark || brand || server;
  return {
    userId: userId,
    nickname: display,
    name: name,
    server: server,
    crossNode: crossNode,
    source: source,
    remark: remark,
    nodeRemark: nodeRemark,
  };
}

/** Single-line list/title form matching App ContactLabel visuals. */
function listLabel(identity) {
  if (!identity) return '';
  if (identity.crossNode && identity.source) {
    return identity.name + ' ⇄ ' + identity.source;
  }
  return identity.name;
}

function preferencesKey(instanceId, userId) {
  return (
    'chat-labels.v1:' +
    String(instanceId == null ? '' : instanceId) +
    ':' +
    String(userId || '')
  );
}

function readPreferences(storageGet, key) {
  try {
    var raw =
      typeof storageGet === 'function' ? storageGet(key) : storageGet;
    if (!raw) return emptyPreferences();
    var value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      contacts: cleanMap(value && value.contacts),
      nodes: cleanMap(value && value.nodes),
    };
  } catch (e) {
    return emptyPreferences();
  }
}

function writePreferences(storageSet, key, preferences) {
  if (typeof storageSet !== 'function') {
    throw new Error('暂时无法保存备注');
  }
  storageSet(
    key,
    JSON.stringify({
      contacts: (preferences && preferences.contacts) || {},
      nodes: (preferences && preferences.nodes) || {},
    })
  );
}

/**
 * Merge local cache under account_data (account wins), then apply form edits.
 * Parity with App updatePreferences.
 */
function updatePreferences(current, userId, remark, nodeRemark) {
  if (!serverOf(userId)) throw new Error('联系人账号无效');
  var r = String(remark == null ? '' : remark).trim();
  var n = String(nodeRemark == null ? '' : nodeRemark).trim();
  if (r.length > 80 || n.length > 80) {
    throw new Error('备注最多 80 个字符');
  }
  var base = current || emptyPreferences();
  var contacts = Object.assign(Object.create(null), base.contacts || {});
  var nodes = Object.assign(Object.create(null), base.nodes || {});
  contacts[userId] = r;
  nodes[serverOf(userId)] = n;
  return { contacts: contacts, nodes: nodes };
}

function mergePreferences(accountPrefs, localPrefs) {
  return {
    contacts: Object.assign(
      Object.create(null),
      (localPrefs && localPrefs.contacts) || {},
      (accountPrefs && accountPrefs.contacts) || {}
    ),
    nodes: Object.assign(
      Object.create(null),
      (localPrefs && localPrefs.nodes) || {},
      (accountPrefs && accountPrefs.nodes) || {}
    ),
  };
}

module.exports = {
  CHAT_LABELS_ACCOUNT_DATA: CHAT_LABELS_ACCOUNT_DATA,
  emptyPreferences: emptyPreferences,
  serverOf: serverOf,
  preferencesFromAccountData: preferencesFromAccountData,
  preferencesFromStore: preferencesFromStore,
  contactIdentity: contactIdentity,
  listLabel: listLabel,
  preferencesKey: preferencesKey,
  readPreferences: readPreferences,
  writePreferences: writePreferences,
  updatePreferences: updatePreferences,
  mergePreferences: mergePreferences,
};
