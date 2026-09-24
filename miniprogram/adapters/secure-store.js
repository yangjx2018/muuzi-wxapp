/**
 * 微信小程序本地存储适配。
 * Token 仅存本机；不得上报 MuuZi 官方服务。
 */
const PREFIX = 'muuzi_wx:';

function key(name) {
  return PREFIX + name;
}

function get(name) {
  try {
    return wx.getStorageSync(key(name));
  } catch (e) {
    return '';
  }
}

function set(name, value) {
  wx.setStorageSync(key(name), value == null ? '' : value);
}

function remove(name) {
  try {
    wx.removeStorageSync(key(name));
  } catch (e) {
    /* ignore */
  }
}

function clearSessionKeys() {
  [
    'matrix_access_token',
    'matrix_user_id',
    'matrix_device_id',
    'matrix_refresh_token',
    'matrix_sync_since',
    'homeserver',
    'node_origin',
    'node_domain',
    'instance_id',
    'node_json',
    'creator_session_json',
    'creator_access_token',
    'creator_refresh_token',
    // 账号绑定/本机会话附属（退出节点必须一并清掉）
    'auth_flow_json',
    'me_open_share',
    'me_space_org_id',
    'public_page_skin_id',
  ].forEach(remove);

  // 现场交流本机 pending（含当前账号 userId 后缀）
  try {
    if (typeof wx !== 'undefined' && wx.getStorageInfoSync) {
      var info = wx.getStorageInfoSync() || {};
      var keys = info.keys || [];
      var prefix = PREFIX + 'field_pending_v1:';
      keys.forEach(function (fullKey) {
        if (String(fullKey).indexOf(prefix) === 0) {
          try {
            wx.removeStorageSync(fullKey);
          } catch (e) {
            /* ignore */
          }
        }
      });
    }
  } catch (e) {
    /* ignore */
  }
}

module.exports = {
  get: get,
  set: set,
  remove: remove,
  clearSessionKeys: clearSessionKeys,
  KEYS: {
    MATRIX_ACCESS_TOKEN: 'matrix_access_token',
    MATRIX_USER_ID: 'matrix_user_id',
    MATRIX_DEVICE_ID: 'matrix_device_id',
    MATRIX_REFRESH_TOKEN: 'matrix_refresh_token',
    MATRIX_SYNC_SINCE: 'matrix_sync_since',
    HOMESERVER: 'homeserver',
    NODE_ORIGIN: 'node_origin',
    NODE_DOMAIN: 'node_domain',
    INSTANCE_ID: 'instance_id',
    NODE_JSON: 'node_json',
  },
};
