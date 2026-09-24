/**
 * 收件箱筛选 · 对齐 MessagesScreen visibleRooms / category
 */

var WORKSPACE_META = [
  {
    key: 'business',
    name: '业务工作区',
    description: '陌生人的咨询与业务沟通',
  },
  {
    key: 'muu',
    name: 'Muu 工作区',
    description: 'Muu 会话、Agent 任务与报告',
  },
  {
    key: 'following',
    name: 'Muu 关注私聊区',
    description: '与已关注的人保持联系',
  },
];

function categoryOf(room, workspaces, followedPeers) {
  if (!room) return null;
  var list = workspaces || [];
  for (var i = 0; i < list.length; i++) {
    var space = list[i];
    if (
      space.channelId === room.roomId ||
      space.inboxChannelId === room.roomId
    ) {
      return space.key;
    }
  }
  if (room.kind === 'ai') return 'muu';
  if (room.kind === 'direct') {
    if (followedPeers && room.peerId && followedPeers[room.peerId]) {
      return 'following';
    }
    return 'business';
  }
  return null;
}

/**
 * @param {object} opts
 * @param {Array} opts.rooms
 * @param {Array} [opts.workspaces]
 * @param {Array} [opts.nodeWorkspaces] { roomId, channelIds[] }
 * @param {string} [opts.workspace] 'all' | key | node roomId
 * @param {string} [opts.inboxFilter] all|unread|mentions
 * @param {string} [opts.roomType] all|direct|group
 * @param {string} [opts.search]
 * @param {object} [opts.followedPeers] peerId -> true
 * @param {boolean} [opts.showEmptyAi]
 */
function filterInbox(opts) {
  opts = opts || {};
  var rooms = opts.rooms || [];
  var workspaces = opts.workspaces || [];
  var nodeWorkspaces = opts.nodeWorkspaces || [];
  var workspace = opts.workspace || 'all';
  var inboxFilter = opts.inboxFilter || 'all';
  var roomType = opts.roomType || 'all';
  var search = String(opts.search || '')
    .trim()
    .toLowerCase();
  var followedPeers = opts.followedPeers || null;
  var showEmptyAi = !!opts.showEmptyAi;

  var out = [];
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    if (!room) continue;

    if (
      !showEmptyAi &&
      room.kind === 'ai' &&
      !room.starred &&
      !(room.preview && room.preview !== room.subtitle) &&
      !room.unread
    ) {
      // 空 AI 会话默认隐藏（无消息摘要且无未读）
      continue;
    }

    if (workspace !== 'all') {
      var cat = categoryOf(room, workspaces, followedPeers);
      var inNode = false;
      for (var n = 0; n < nodeWorkspaces.length; n++) {
        var nw = nodeWorkspaces[n];
        if (
          nw.roomId === workspace &&
          Array.isArray(nw.channelIds) &&
          nw.channelIds.indexOf(room.roomId) >= 0
        ) {
          inNode = true;
          break;
        }
      }
      if (cat !== workspace && !inNode) continue;
    }

    if (inboxFilter === 'unread' && !(room.unread > 0)) continue;
    if (inboxFilter === 'mentions' && !room.mentioned) continue;

    if (roomType === 'direct' && room.kind !== 'direct') continue;
    if (roomType === 'group' && room.kind === 'direct') continue;

    if (search) {
      var hay = String(room.name || '') + ' ' + String(room.preview || '');
      if (hay.toLowerCase().indexOf(search) < 0) continue;
    }

    out.push(room);
  }
  return out;
}

function workspaceLabel(workspace, nodeWorkspaces) {
  if (!workspace || workspace === 'all') return '全部消息';
  for (var i = 0; i < WORKSPACE_META.length; i++) {
    if (WORKSPACE_META[i].key === workspace) return WORKSPACE_META[i].name;
  }
  var list = nodeWorkspaces || [];
  for (var n = 0; n < list.length; n++) {
    if (list[n] && list[n].roomId === workspace) {
      return list[n].name || '节点工作区';
    }
  }
  return '工作区';
}

function countByWorkspace(rooms, workspaces, followedPeers) {
  var counts = { all: (rooms || []).length, business: 0, muu: 0, following: 0 };
  for (var i = 0; i < (rooms || []).length; i++) {
    var cat = categoryOf(rooms[i], workspaces, followedPeers);
    if (cat && counts[cat] !== undefined) counts[cat] += 1;
  }
  return counts;
}

module.exports = {
  WORKSPACE_META: WORKSPACE_META,
  categoryOf: categoryOf,
  filterInbox: filterInbox,
  workspaceLabel: workspaceLabel,
  countByWorkspace: countByWorkspace,
};
