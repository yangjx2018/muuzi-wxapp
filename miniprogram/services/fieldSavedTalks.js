/**
 * 已保存的现场交流（C-05）
 * App：Matrix field 工作区 channelIds → 进消息 / 继续扫码。
 */

var DEFERRED_NOTE =
  '尚无已保存的现场交流。面对面确认保存后，话题会出现在这里。';

var CONTINUE_NOTE =
  '继续扫码交流需要已加入的现场话题房间。请先完成现场交流，或从列表进入。';

var EMPTY_PREVIEW = '查看节点中的交流记录';

/**
 * @param {Array} matrixRooms listJoined 项
 * @param {Array} [nodeWorkspaces] workspaceViews 结果
 * @returns {{ phase: 'deferred' | 'ready', items: Array, note: string }}
 */
function listSavedFieldTalks(matrixRooms, nodeWorkspaces) {
  if (!matrixRooms || !Array.isArray(matrixRooms) || matrixRooms.length === 0) {
    return {
      phase: 'deferred',
      items: [],
      note: DEFERRED_NOTE,
    };
  }

  var idSet = Object.create(null);
  var spaces = nodeWorkspaces || [];
  var hasFieldSpace = false;
  for (var s = 0; s < spaces.length; s++) {
    var space = spaces[s];
    if (!space || !space.field || !Array.isArray(space.channelIds)) continue;
    hasFieldSpace = true;
    for (var c = 0; c < space.channelIds.length; c++) {
      if (space.channelIds[c]) idSet[space.channelIds[c]] = true;
    }
  }

  var items = [];
  for (var i = 0; i < matrixRooms.length; i++) {
    var room = matrixRooms[i];
    if (
      !room ||
      typeof room.roomId !== 'string' ||
      !room.roomId ||
      typeof room.name !== 'string'
    ) {
      continue;
    }
    var include = false;
    if (hasFieldSpace) {
      include = !!idSet[room.roomId];
    } else if (room.field) {
      // sync 尚未带回 field space 子关系时，回退 topic 标记
      include = true;
    }
    if (!include) continue;
    items.push({
      roomId: room.roomId,
      name: room.name,
      preview:
        typeof room.preview === 'string' && room.preview
          ? room.preview
          : EMPTY_PREVIEW,
    });
  }
  if (!items.length) {
    return { phase: 'deferred', items: [], note: DEFERRED_NOTE };
  }
  return { phase: 'ready', items: items, note: '' };
}

function continueAvailability(roomId, matrixReady, joinedField) {
  if (!matrixReady) {
    return {
      ok: false,
      reason: 'deferred',
      message: CONTINUE_NOTE,
    };
  }
  if (typeof roomId !== 'string' || !roomId || !joinedField) {
    return {
      ok: false,
      reason: 'missing',
      message:
        '无法恢复这个现场话题，请从当前账号的现场列表重新进入。',
    };
  }
  return { ok: true, reason: 'ready', message: '' };
}

module.exports = {
  DEFERRED_NOTE: DEFERRED_NOTE,
  CONTINUE_NOTE: CONTINUE_NOTE,
  EMPTY_PREVIEW: EMPTY_PREVIEW,
  listSavedFieldTalks: listSavedFieldTalks,
  continueAvailability: continueAvailability,
};
