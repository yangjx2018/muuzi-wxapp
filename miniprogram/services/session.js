const store = require('../adapters/secure-store');
const config = require('../config');
const nodeService = require('./node');
const creator = require('./creator');
const http = require('./http');

let memory = {
  signedIn: false,
  matrixUserId: '',
  accessToken: '',
  deviceId: '',
  homeserver: '',
  nodeOrigin: '',
  nodeDomain: '',
  instanceId: null,
  node: null,
};

var refreshInFlight = null;

function snapshot() {
  return Object.assign({}, memory);
}

function isSignedIn() {
  return !!memory.signedIn && !!store.get(store.KEYS.MATRIX_ACCESS_TOKEN);
}

function clearLocal() {
  var creatorToken = '';
  try {
    var raw = store.get('creator_session_json');
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.token === 'string') creatorToken = parsed.token;
    }
  } catch (e) {
    creatorToken = '';
  }
  store.clearSessionKeys();
  creator.clearCreatorSession();
  memory = {
    signedIn: false,
    matrixUserId: '',
    accessToken: '',
    deviceId: '',
    homeserver: '',
    nodeOrigin: '',
    nodeDomain: '',
    instanceId: null,
    node: null,
  };
  // 停掉 Matrix sync（懒加载，避免与 runtime 循环依赖）
  try {
    require('./matrixRuntime').resetForSignOut();
  } catch (e) {
    /* ignore */
  }
  // 平台 Creator 注销尽力而为，失败不影响本地已清空
  if (creatorToken && typeof creator.closeCreatorSession === 'function') {
    creator.closeCreatorSession(creatorToken).catch(function () {});
  }
}

/** 退出当前节点：清本地会话并回登录页 */
function signOutAndRelaunch() {
  clearLocal();
  wx.reLaunch({ url: '/pages/auth/login/index' });
}

function restore() {
  const token = store.get(store.KEYS.MATRIX_ACCESS_TOKEN);
  const userId = store.get(store.KEYS.MATRIX_USER_ID);
  const deviceId = store.get(store.KEYS.MATRIX_DEVICE_ID);
  const homeserver = store.get(store.KEYS.HOMESERVER);
  const nodeOrigin = store.get(store.KEYS.NODE_ORIGIN);
  const nodeDomain = store.get(store.KEYS.NODE_DOMAIN);
  const instanceId = store.get(store.KEYS.INSTANCE_ID);
  let node = null;
  try {
    const raw = store.get(store.KEYS.NODE_JSON);
    if (raw) node = JSON.parse(raw);
  } catch (e) {
    node = null;
  }
  if (!node && nodeDomain) {
    try {
      node = nodeService.resolveNode(nodeDomain);
    } catch (e) {
      node = null;
    }
  }

  if (!token || !userId || !homeserver) {
    clearLocal();
    return Promise.resolve(snapshot());
  }

  memory = {
    signedIn: true,
    matrixUserId: userId,
    accessToken: token,
    deviceId: deviceId || '',
    homeserver: homeserver,
    nodeOrigin: nodeOrigin || (node && node.nodeOrigin) || '',
    nodeDomain: nodeDomain || (node && node.domain) || '',
    instanceId: instanceId ? Number(instanceId) : node ? node.instance_id : null,
    node: node,
  };
  return Promise.resolve(snapshot());
}

function beginSession(node, login) {
  if (!node || !login || !login.access_token || !login.user_id || !login.device_id) {
    throw new Error('节点未返回完整登录会话');
  }
  store.set(store.KEYS.MATRIX_ACCESS_TOKEN, login.access_token);
  store.set(store.KEYS.MATRIX_USER_ID, login.user_id);
  store.set(store.KEYS.MATRIX_DEVICE_ID, login.device_id);
  store.set(store.KEYS.MATRIX_REFRESH_TOKEN, login.refresh_token || '');
  store.set(store.KEYS.HOMESERVER, node.homeserverUrl);
  store.set(store.KEYS.NODE_ORIGIN, node.nodeOrigin);
  store.set(store.KEYS.NODE_DOMAIN, node.domain);
  store.set(store.KEYS.INSTANCE_ID, String(node.instance_id));
  store.set(store.KEYS.NODE_JSON, JSON.stringify(node));
  nodeService.rememberDomain(node.domain);

  memory = {
    signedIn: true,
    matrixUserId: login.user_id,
    accessToken: login.access_token,
    deviceId: login.device_id,
    homeserver: node.homeserverUrl,
    nodeOrigin: node.nodeOrigin,
    nodeDomain: node.domain,
    instanceId: node.instance_id,
    node: node,
  };
  try {
    require('./matrixRuntime').ensureStarted();
  } catch (e) {
    /* Matrix sync 失败不阻断登录；消息页可重试 */
  }
  return snapshot();
}

/** Update Matrix Client-Server base after well-known resolution. */
function updateHomeserver(homeserverUrl) {
  var url = String(homeserverUrl || '').replace(/\/$/, '');
  if (!url || !memory.signedIn) return snapshot();
  store.set(store.KEYS.HOMESERVER, url);
  memory.homeserver = url;
  if (memory.node) {
    memory.node = Object.assign({}, memory.node, { homeserverUrl: url });
    try {
      store.set(store.KEYS.NODE_JSON, JSON.stringify(memory.node));
    } catch (e) {
      /* ignore */
    }
  }
  return snapshot();
}

/**
 * Align App `@guduu/node-auth` session refresh:
 * POST /_matrix/client/v3/refresh with stored refresh_token.
 * Rotates access (and optionally refresh) token without clearing local login.
 */
function refreshMatrixToken() {
  if (refreshInFlight) return refreshInFlight;
  var refresh = store.get(store.KEYS.MATRIX_REFRESH_TOKEN);
  var homeserver = String(memory.homeserver || store.get(store.KEYS.HOMESERVER) || '').replace(
    /\/$/,
    ''
  );
  if (!memory.signedIn || !refresh || !homeserver) {
    return Promise.reject(
      Object.assign(new Error('节点登录已失效，请重新登录'), {
        code: 'M_UNKNOWN_TOKEN',
      })
    );
  }
  refreshInFlight = http
    .request({
      url: homeserver + '/_matrix/client/v3/refresh',
      method: 'POST',
      data: { refresh_token: refresh },
      timeout: 15000,
    })
    .then(function (data) {
      refreshInFlight = null;
      if (!data || typeof data.access_token !== 'string' || !data.access_token) {
        throw Object.assign(new Error('节点未返回有效会话'), {
          code: 'INCOMPLETE_SESSION',
        });
      }
      store.set(store.KEYS.MATRIX_ACCESS_TOKEN, data.access_token);
      memory.accessToken = data.access_token;
      if (typeof data.refresh_token === 'string' && data.refresh_token) {
        store.set(store.KEYS.MATRIX_REFRESH_TOKEN, data.refresh_token);
      }
      return snapshot();
    })
    .catch(function (err) {
      refreshInFlight = null;
      var code = String(
        (err && err.code) ||
          (err && err.body && (err.body.errcode || err.body.code)) ||
          ''
      );
      if (
        code === 'M_UNKNOWN_TOKEN' ||
        code === 'M_MISSING_TOKEN' ||
        (err && (err.statusCode === 401 || err.statusCode === 403))
      ) {
        throw Object.assign(new Error('节点登录已失效，请重新登录'), {
          code: 'M_UNKNOWN_TOKEN',
          cause: err,
        });
      }
      throw err;
    });
  return refreshInFlight;
}

/** 段 B：节点登录成功后换 Creator；失败不撤销 Matrix。 */
function ensureCreatorSession() {
  if (!isSignedIn()) return Promise.reject(new Error('未登录'));
  return creator.loadCreatorSession({
    accessToken: memory.accessToken,
    matrixUserId: memory.matrixUserId,
    nodeOrigin: memory.nodeOrigin,
    nodeDomain: memory.nodeDomain,
    instanceId: memory.instanceId,
  });
}

function enterDefaultTab() {
  const url = config.DEFAULT_TAB;
  wx.switchTab({
    url: url,
    fail: function (err) {
      console.log('[session] switchTab fail ' + JSON.stringify(err || {}));
      // 部分时机（如 toast 未结束）switchTab 会失败；reLaunch 仍可进 tab 页
      wx.reLaunch({ url: url });
    },
  });
}

function requireSignedInOrRedirect() {
  if (isSignedIn()) return true;
  wx.reLaunch({ url: '/pages/auth/login/index' });
  return false;
}

function getDefaultNode() {
  return nodeService.resolveInitialNode();
}

module.exports = {
  restore: restore,
  isSignedIn: isSignedIn,
  clearLocal: clearLocal,
  signOutAndRelaunch: signOutAndRelaunch,
  snapshot: snapshot,
  beginSession: beginSession,
  updateHomeserver: updateHomeserver,
  refreshMatrixToken: refreshMatrixToken,
  ensureCreatorSession: ensureCreatorSession,
  enterDefaultTab: enterDefaultTab,
  requireSignedInOrRedirect: requireSignedInOrRedirect,
  getDefaultNode: getDefaultNode,
};
