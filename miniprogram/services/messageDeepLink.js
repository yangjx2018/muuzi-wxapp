/**
 * 消息深链 · 对齐 App /messages?room=
 *
 * 微信小程序坑：
 * 1) encodeURIComponent 不编码 `!`
 * 2) 即便编成 %21 / %3A，部分基础库 onLoad query 仍会丢/截断 Matrix 房号
 *    `!xxx:server` → 会话页 roomId 为空 → 立刻 navigateBack，表现为「点了没反应」
 *
 * 因此 openRoom 采用三通道：
 * - globalData / storage 传原文（主通道）
 * - URL 仅带纯十六进制 rid（无 ! : 等特殊字符，兜底）
 */

var STORAGE_KEY = 'muuzi_open_room_id';

function encodeRoomIdParam(roomId) {
  var s = String(roomId || '');
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var h = s.charCodeAt(i).toString(16);
    out += h.length < 2 ? '0' + h : h;
  }
  return out;
}

function decodeRoomIdParam(raw) {
  var text = String(raw || '').trim();
  if (!text) return '';
  // 纯 hex（新协议）
  if (/^[0-9a-fA-F]+$/.test(text) && text.length % 2 === 0) {
    try {
      var chars = [];
      for (var i = 0; i < text.length; i += 2) {
        chars.push(String.fromCharCode(parseInt(text.substr(i, 2), 16)));
      }
      var decoded = chars.join('');
      if (decoded) return decoded;
    } catch (e) {
      /* fall through */
    }
  }
  // 旧 URI 编码 / 已解码原文
  try {
    return decodeURIComponent(text);
  } catch (e2) {
    return text;
  }
}

function stashRoomId(roomId) {
  var id = String(roomId || '');
  if (!id) return;
  try {
    var app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData) {
      app.globalData.openRoomId = id;
    }
  } catch (e0) {
    /* ignore */
  }
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync(STORAGE_KEY, id);
    }
  } catch (e1) {
    /* ignore */
  }
}

function takeStashedRoomId() {
  var id = '';
  try {
    var app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData && app.globalData.openRoomId) {
      id = String(app.globalData.openRoomId);
      app.globalData.openRoomId = '';
    }
  } catch (e0) {
    /* ignore */
  }
  if (id) {
    try {
      if (typeof wx !== 'undefined' && wx.removeStorageSync) {
        wx.removeStorageSync(STORAGE_KEY);
      }
    } catch (e1) {
      /* ignore */
    }
    return id;
  }
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      id = String(wx.getStorageSync(STORAGE_KEY) || '');
      if (id && wx.removeStorageSync) wx.removeStorageSync(STORAGE_KEY);
    }
  } catch (e2) {
    /* ignore */
  }
  return id || '';
}

function parseRoomQuery(query) {
  if (!query || typeof query !== 'object') return '';
  var raw = query.rid || query.roomId || query.room || '';
  if (typeof raw !== 'string' || !raw) return '';
  return decodeRoomIdParam(raw);
}

/** 会话页专用：优先取 openRoom 暂存，再回落 query */
function resolveOpenRoomId(query) {
  var stashed = takeStashedRoomId();
  if (stashed) return stashed;
  return parseRoomQuery(query || {});
}

function roomChatUrl(roomId) {
  if (!roomId) return '';
  // 只用安全 hex，避免微信 query 特殊字符坑
  return '/pages/messages/room/index?rid=' + encodeRoomIdParam(roomId);
}

function openRoom(roomId) {
  var id = String(roomId || '');
  var url = roomChatUrl(id);
  if (!url) {
    return Promise.reject(new Error('会话无效'));
  }
  stashRoomId(id);
  return new Promise(function (resolve, reject) {
    wx.navigateTo({
      url: url,
      success: function () {
        resolve(id);
      },
      fail: function (err) {
        // 导航失败时清掉暂存，避免下次误进旧会话
        try {
          takeStashedRoomId();
        } catch (e0) {
          /* ignore */
        }
        var msg =
          (err && (err.errMsg || err.message)) || '无法打开会话';
        reject(new Error(msg));
      },
    });
  });
}

module.exports = {
  parseRoomQuery: parseRoomQuery,
  resolveOpenRoomId: resolveOpenRoomId,
  roomChatUrl: roomChatUrl,
  openRoom: openRoom,
  encodeRoomIdParam: encodeRoomIdParam,
  decodeRoomIdParam: decodeRoomIdParam,
  stashRoomId: stashRoomId,
  takeStashedRoomId: takeStashedRoomId,
  STORAGE_KEY: STORAGE_KEY,
};
