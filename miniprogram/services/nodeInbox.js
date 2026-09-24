/**
 * 节点私人频道绑定 · 对齐 App node-inbox.ts
 * Matrix token 只发往所选节点，不进平台 API。
 */

var http = require('./http');

/**
 * @typedef {'body'|'notification'} InboxMode
 * @typedef {{
 *   available: boolean,
 *   node: {origin:string, instance_id:number, sender_id:string, client_id:string}|null,
 *   binding: {binding_id:string, mode:InboxMode, enabled:boolean}|null
 * }} InboxConfig
 */

function sessionUserId(session) {
  return String((session && (session.matrixUserId || session.user_id)) || '');
}

function sessionToken(session) {
  return String((session && (session.accessToken || session.access_token)) || '');
}

function sessionDomain(session) {
  return String(
    (session &&
      (session.nodeDomain ||
        (session.node && (session.node.domain || session.node.nodeDomain)))) ||
      ''
  );
}

function sessionInstanceId(session) {
  if (!session) return null;
  if (session.instanceId != null) return Number(session.instanceId);
  if (session.node && session.node.instance_id != null) {
    return Number(session.node.instance_id);
  }
  return null;
}

function sessionOrigin(session) {
  return String(
    (session &&
      (session.nodeOrigin ||
        (session.node && (session.node.nodeOrigin || session.node.origin)))) ||
      ''
  ).replace(/\/$/, '');
}

/**
 * 校验 origin 为精确 HTTPS Origin（无凭据、无路径/查询/片段）。
 * @param {string} value
 * @returns {{protocol:string, hostname:string, origin:string}|null}
 */
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
      return {
        protocol: u.protocol,
        hostname: u.hostname,
        origin: u.origin,
      };
    }
  } catch (e) {
    /* fall through */
  }
  var m = /^https:\/\/([a-z0-9.-]+)(?::(\d+))?$/i.exec(value);
  if (!m) return null;
  return {
    protocol: 'https:',
    hostname: m[1].toLowerCase(),
    origin: value,
  };
}

/**
 * @param {object} session miniprogram session.snapshot()
 * @param {InboxConfig} config
 */
function selectedInboxNode(session, config) {
  var node = config && config.node;
  var parsed = parseHttpsOrigin(sessionOrigin(session));
  var domain = sessionDomain(session);
  var instanceId = sessionInstanceId(session);
  var userId = sessionUserId(session);
  if (
    !config ||
    !config.available ||
    !node ||
    !parsed ||
    !domain ||
    parsed.hostname !== domain ||
    node.origin !== parsed.origin ||
    Number(node.instance_id) !== Number(instanceId) ||
    node.client_id !== 'guduu-muuzi' ||
    !/^@[^:\s]+:[^\s]+$/.test(node.sender_id) ||
    node.sender_id.length > 255 ||
    node.sender_id === userId
  ) {
    throw new Error('当前节点尚未开放留言频道');
  }
  return node;
}

function validateBindingBody(value, method, input) {
  if (
    !value ||
    Object.keys(value)
      .sort()
      .join('|') !== 'active|binding_id|mode' ||
    typeof value.active !== 'boolean' ||
    (value.binding_id !== null && !/^ib_[a-f0-9]{32}$/.test(value.binding_id)) ||
    (value.mode !== null &&
      value.mode !== 'body' &&
      value.mode !== 'notification') ||
    (value.active && (!value.binding_id || !value.mode)) ||
    (method === 'PUT' && (!value.active || value.mode !== (input && input.mode))) ||
    (method === 'DELETE' && value.active)
  ) {
    throw new Error('频道状态尚未确认');
  }
  return value;
}

/**
 * @param {object} session
 * @param {InboxConfig} config
 * @param {'GET'|'PUT'|'DELETE'} method
 * @param {{room_id:string, mode:InboxMode}} [input]
 * @param {function():boolean} [active]
 * @param {function} [requestFn]
 */
function nodeInboxBinding(
  session,
  config,
  method,
  input,
  active,
  requestFn
) {
  var isActive = typeof active === 'function' ? active : function () {
    return true;
  };
  function check() {
    if (!isActive()) throw new Error('账号已切换，请重新打开信箱设置');
  }
  check();
  var node = selectedInboxNode(session, config);
  var token = sessionToken(session);
  if (!token) throw new Error('频道暂未连接。请稍后重试；节点接收账号需要先加入私人频道。');
  var req = requestFn || http.request;
  var opts = {
    url: node.origin + '/cosmac/connect/apps/guduu-muuzi/inbox/binding',
    method: method,
    header: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json',
    },
    timeout: 12000,
  };
  if (method === 'PUT') {
    opts.header['Content-Type'] = 'application/json';
    opts.data = {
      api_version: 'application-inbox.v1',
      room_id: input && input.room_id,
      mode: input && input.mode,
    };
  }
  return req(opts)
    .then(function (body) {
      check();
      var text = '';
      try {
        text =
          typeof body === 'string' ? body : JSON.stringify(body == null ? '' : body);
      } catch (e) {
        throw new Error('频道状态无效');
      }
      if (text.length > 4096) throw new Error('频道状态无效');
      var value =
        typeof body === 'object' && body !== null
          ? body
          : JSON.parse(text || 'null');
      return validateBindingBody(value, method, input);
    })
    .catch(function (err) {
      if (
        err &&
        (err.message === '账号已切换，请重新打开信箱设置' ||
          err.message === '频道状态尚未确认' ||
          err.message === '频道状态无效' ||
          err.message === '当前节点尚未开放留言频道')
      ) {
        throw err;
      }
      throw new Error(
        '频道暂未连接。请稍后重试；节点接收账号需要先加入私人频道。'
      );
    });
}

module.exports = {
  selectedInboxNode: selectedInboxNode,
  nodeInboxBinding: nodeInboxBinding,
  parseHttpsOrigin: parseHttpsOrigin,
};
