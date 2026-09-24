/**
 * 现场话题 Matrix 动作 · 对齐 MuuziGit matrix-field.ts（HTTP，无 matrix-js-sdk）
 * 客户端 → 所选节点；不经过官方服务器存档。
 */

var cryptoUtil = require('../utils/field-crypto');
var zhDateTime = require('../utils/zhDateTime');

var FIELD_STATE = 'co.muuzi.field';
var TOPIC_RE = /^[0-9a-f-]{36}$/;
var EVENT_RE = /^\$[^\s]{1,255}$/;

function fieldAlias(owner, key) {
  var server = owner.slice(owner.indexOf(':') + 1);
  var hex = cryptoUtil.sha256Hex(owner + ':' + key);
  var part = 'muuzi-field-' + hex;
  return { alias: '#' + part + ':' + server, part: part };
}

function errcode(err) {
  return String((err && (err.code || (err.body && err.body.errcode))) || '');
}

function findState(events, type, stateKey) {
  stateKey = stateKey == null ? '' : stateKey;
  for (var i = 0; i < (events || []).length; i++) {
    var e = events[i];
    if (e && e.type === type && (e.state_key || '') === stateKey) return e;
  }
  return null;
}

/**
 * @param {object} api matrixApi 实例（须含 getRoomIdForAlias/createRoom/roomState/sendStateEvent/sendEvent/getMessages/leave/forget/getJoinedRooms/getEvent）
 * @param {function(): string} getUserId
 * @param {function(): boolean} active
 * @param {object} [cleanup] { read, write, clear }
 */
function createFieldActions(api, getUserId, active, cleanup) {
  var fingerprints = Object.create(null);
  var pending = Object.create(null);
  var queues = Object.create(null);
  var closed = Object.create(null);
  var occupied = Object.create(null);
  var opened = Object.create(null);

  function check() {
    if (typeof active === 'function' && !active()) {
      throw new Error('账号已切换');
    }
  }

  function serial(key, run) {
    var prev = queues[key] || Promise.resolve();
    var result = prev.catch(function () {}).then(run);
    queues[key] = result.then(
      function () {},
      function () {}
    );
    return result;
  }

  function ensure(key, kind, create, retainScan) {
    if (create === undefined) create = true;
    check();
    var owner = getUserId() || '';
    if (!/^@[^:]+:.+$/.test(owner)) {
      return Promise.reject(new Error('节点身份无效'));
    }
    var names = fieldAlias(owner, key);
    return api
      .getRoomIdForAlias(names.alias)
      .catch(function (error) {
        if (errcode(error) !== 'M_NOT_FOUND' || !create) throw error;
        check();
        var body = {
          name:
            kind === 'space'
              ? '现场交流'
              : zhDateTime.fieldTopicRoomName(),
          room_alias_name: names.part,
          visibility: 'private',
          preset: 'private_chat',
          creation_content: Object.assign(
            { 'm.federate': false },
            kind === 'space' ? { type: 'm.space' } : {}
          ),
          initial_state: [
            {
              type: FIELD_STATE,
              state_key: '',
              content: { owner: owner, key: key, kind: kind },
            },
            {
              type: 'm.room.history_visibility',
              state_key: '',
              content: { history_visibility: 'joined' },
            },
          ],
        };
        return api.createRoom(body).catch(function (failure) {
          if (errcode(failure) !== 'M_ROOM_IN_USE') throw failure;
          return api.getRoomIdForAlias(names.alias);
        });
      })
      .then(function (room) {
        check();
        return api.roomState(room).then(function (state) {
          check();
          var markerEv = findState(state, FIELD_STATE, '');
          var marker = markerEv && markerEv.content;
          var creation = findState(state, 'm.room.create', '');
          var isSpace =
            creation && creation.content && creation.content.type === 'm.space';
          if (
            !creation ||
            creation.sender !== owner ||
            !marker ||
            marker.owner !== owner ||
            marker.key !== key ||
            marker.kind !== kind ||
            (kind === 'space') !== !!isSpace
          ) {
            throw new Error('现场话题归属校验失败');
          }
          if (kind === 'topic' && marker.mode === 'scan') {
            if (!retainScan) {
              throw new Error('本频道已进入扫码交流，不能继续单手机代录');
            }
            if (
              !markerEv ||
              markerEv.sender !== owner ||
              creation.content['m.federate'] !== false ||
              typeof marker.recorder !== 'string' ||
              !/^@[^\s:]+:[^\s]+$/.test(marker.recorder)
            ) {
              throw new Error('扫码频道标记无法核验，已保留');
            }
            occupied[key] = true;
            check();
            return room;
          }
          var joinRuleEv = findState(state, 'm.room.join_rules', '');
          var joinRule =
            joinRuleEv && joinRuleEv.content && joinRuleEv.content.join_rule;
          if (joinRule !== 'invite') {
            throw new Error('现场频道权限已变化，停止保存');
          }
          for (var i = 0; i < state.length; i++) {
            var e = state[i];
            if (e.type === 'm.room.encryption') {
              throw new Error('现场频道权限已变化，停止保存');
            }
            if (
              e.type === 'm.room.member' &&
              e.state_key !== owner &&
              e.content &&
              (e.content.membership === 'join' ||
                e.content.membership === 'invite')
            ) {
              throw new Error('现场频道权限已变化，停止保存');
            }
          }
          check();
          return repairTopicRoomName(room, state).then(function () {
            return room;
          });
        });
      });
  }

  function repairTopicRoomName(roomId, state) {
    var nameEv = findState(state, 'm.room.name', '');
    var current = String(
      (nameEv && nameEv.content && nameEv.content.name) || ''
    ).trim();
    var fixed = zhDateTime.normalizeFieldRoomName(current);
    if (!fixed || fixed === current) return Promise.resolve();
    return api
      .sendStateEvent(roomId, 'm.room.name', { name: fixed }, '')
      .then(function () {
        check();
      })
      .catch(function () {
        /* 无改名权限或短暂失败时由列表 normalize 兜底 */
      });
  }

  function openTopic(topicKey) {
    if (!TOPIC_RE.test(topicKey) || closed[topicKey]) {
      return Promise.reject(new Error('现场话题已结束或编号无效'));
    }
    if (cleanup && cleanup.read(topicKey)) {
      return Promise.reject(new Error('现场话题已结束或编号无效'));
    }
    return ensure('workspace', 'space').then(function (space) {
      return ensure(topicKey, 'topic').then(function (room) {
        check();
        var via = (getUserId() || '').split(':').slice(1).join(':');
        return api
          .sendStateEvent(space, 'm.space.child', { via: [via] }, room)
          .then(function () {
            opened[topicKey] = { space: space, room: room };
            check();
            return room;
          });
      });
    });
  }

  function open(topicKey) {
    return serial(topicKey, function () {
      return openTopic(topicKey);
    });
  }

  function finishRemoval(topicKey, value) {
    check();
    return api
      .sendStateEvent(value.space, 'm.space.child', {}, value.room)
      .then(function () {
        check();
        return api.forget(value.room);
      })
      .then(function () {
        check();
        if (cleanup) cleanup.clear(topicKey);
        delete opened[topicKey];
      });
  }

  function close(topicKey) {
    return serial(topicKey, function () {
      check();
      var value = opened[topicKey];
      if (!value) return Promise.resolve();
      if (closed[topicKey]) return finishRemoval(topicKey, value);
      if (occupied[topicKey]) {
        if (cleanup) cleanup.clear(topicKey);
        return Promise.resolve();
      }
      return ensure(topicKey, 'topic', false, true).then(function () {
        if (occupied[topicKey]) {
          if (cleanup) cleanup.clear(topicKey);
          return;
        }
        function scanHistory(from, page) {
          if (page >= 20) {
            return Promise.reject(new Error('话题历史尚未核对完毕，已保留'));
          }
          return api
            .getMessages(value.room, from, 100, 'b')
            .then(function (history) {
              check();
              if (!history || !Array.isArray(history.chunk)) {
                throw new Error('无法确认空话题');
              }
              for (var i = 0; i < history.chunk.length; i++) {
                if (history.chunk[i].state_key === undefined) {
                  if (cleanup) cleanup.clear(topicKey);
                  return;
                }
              }
              if (!history.end) {
                return ensure(topicKey, 'topic', false, true).then(function () {
                  if (occupied[topicKey]) {
                    if (cleanup) cleanup.clear(topicKey);
                    return;
                  }
                  check();
                  if (cleanup) cleanup.write(topicKey, value);
                  check();
                  return api.leave(value.room).then(function () {
                    closed[topicKey] = true;
                    check();
                    return finishRemoval(topicKey, value);
                  });
                });
              }
              if (history.end === from) {
                throw new Error('无法确认完整历史');
              }
              return scanHistory(history.end, page + 1);
            });
        }
        return scanHistory(undefined, 0);
      });
    });
  }

  function save(topicKey, recordKey, record) {
    if (
      !TOPIC_RE.test(topicKey) ||
      !TOPIC_RE.test(recordKey) ||
      (record.replaces !== undefined && !EVENT_RE.test(record.replaces)) ||
      (record.speaker !== 'mine' && record.speaker !== 'guest') ||
      !String(record.original || '').trim() ||
      !String(record.translated || '').trim() ||
      String(record.original).length > 4500 ||
      String(record.translated).length > 4500 ||
      !/^[a-z]{2,3}$/.test(record.source) ||
      !/^[a-z]{2,3}$/.test(record.target)
    ) {
      return Promise.reject(new Error('交流记录无效'));
    }
    var id = topicKey + ':' + recordKey;
    var snapshot = {
      speaker: record.speaker,
      source: record.source,
      target: record.target,
      original: record.original,
      translated: record.translated,
    };
    if (record.replaces) snapshot.replaces = record.replaces;
    var fingerprint = JSON.stringify(snapshot);
    if (fingerprints[id] && fingerprints[id] !== fingerprint) {
      return Promise.reject(new Error('同一次保存不能更换内容'));
    }
    fingerprints[id] = fingerprint;
    if (pending[id]) return pending[id];

    var operation = serial(topicKey, function () {
      return openTopic(topicKey).then(function (room) {
        check();
        var chain = Promise.resolve();
        if (snapshot.replaces) {
          chain = api.getEvent(room, snapshot.replaces).then(function (previous) {
            var marker =
              previous &&
              previous.content &&
              previous.content['co.muuzi.field.record'];
            var relates =
              previous &&
              previous.content &&
              previous.content['m.relates_to'];
            if (
              !previous ||
              previous.type !== 'm.room.message' ||
              previous.sender !== getUserId() ||
              !marker ||
              marker.topic !== topicKey ||
              marker.speaker !== snapshot.speaker ||
              (relates && relates.rel_type === 'm.replace')
            ) {
              throw new Error('无法核验原交流记录，停止更正');
            }
            check();
          });
        }
        return chain.then(function () {
          occupied[topicKey] = true;
          var body =
            '现场交流 · ' +
            (snapshot.speaker === 'mine' ? '本人发言' : '对方发言（身份未关联）') +
            '\n由 ' +
            getUserId() +
            ' 的设备记录\n原文（' +
            snapshot.source +
            '）：' +
            snapshot.original +
            (snapshot.source === snapshot.target
              ? '\n同语种交流 · 未调用翻译'
              : '\n自动翻译（' +
                snapshot.target +
                '）：' +
                snapshot.translated);
          var content = {
            msgtype: 'm.text',
            body: body,
            'co.muuzi.field.record': {
              topic: topicKey,
              key: recordKey,
              speaker: snapshot.speaker,
            },
          };
          var payload = snapshot.replaces
            ? Object.assign({}, content, {
                body: '* ' + body,
                'm.new_content': content,
                'm.relates_to': {
                  rel_type: 'm.replace',
                  event_id: snapshot.replaces,
                },
              })
            : content;
          return api
            .sendEvent(room, 'm.room.message', payload, 'field-' + recordKey)
            .then(function (result) {
              if (
                !result ||
                typeof result.eventId !== 'string' ||
                result.eventId.charAt(0) !== '$'
              ) {
                throw new Error('保存结果尚未确认');
              }
              check();
              return { roomId: room, eventId: result.eventId };
            });
        });
      });
    });
    pending[id] = operation;
    operation.finally(function () {
      delete pending[id];
    }).catch(function () {});
    return operation;
  }

  function recover(topicKey) {
    if (!TOPIC_RE.test(topicKey)) {
      return Promise.reject(new Error('现场话题编号无效'));
    }
    return serial(topicKey, function () {
      check();
      if (closed[topicKey]) return Promise.resolve();
      var interrupted = cleanup && cleanup.read(topicKey);
      if (interrupted) {
        var names = fieldAlias(getUserId() || '', topicKey);
        return api.getRoomIdForAlias(names.alias).then(function (resolved) {
          check();
          return ensure('workspace', 'space', false).then(function (space) {
            if (
              resolved !== interrupted.room ||
              space !== interrupted.space
            ) {
              throw new Error('空话题恢复目标已变化');
            }
            return api.getJoinedRooms().then(function (joined) {
              check();
              if (
                !Array.isArray(joined) ||
                !joined.every(function (id) {
                  return typeof id === 'string';
                })
              ) {
                throw new Error('无法核验话题退出状态');
              }
              if (joined.indexOf(interrupted.room) < 0) {
                opened[topicKey] = interrupted;
                closed[topicKey] = true;
                return;
              }
              return ensure(topicKey, 'topic', false, true).then(function (room) {
                if (
                  interrupted.room !== room ||
                  interrupted.space !== space
                ) {
                  throw new Error('空话题恢复目标已变化');
                }
                opened[topicKey] = { space: space, room: room };
              });
            });
          });
        });
      }
      return ensure(topicKey, 'topic', false, true)
        .then(function (room) {
          return ensure('workspace', 'space', false).then(function (space) {
            opened[topicKey] = { space: space, room: room };
          });
        })
        .catch(function (error) {
          if (errcode(error) === 'M_NOT_FOUND') return;
          throw error;
        });
    }).then(function () {
      return close(topicKey);
    });
  }

  return {
    FIELD_STATE: FIELD_STATE,
    open: open,
    save: save,
    close: close,
    recover: recover,
    fieldAlias: fieldAlias,
  };
}

module.exports = {
  FIELD_STATE: FIELD_STATE,
  fieldAlias: fieldAlias,
  createFieldActions: createFieldActions,
};
