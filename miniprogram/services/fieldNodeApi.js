/**
 * 对齐 MuuziGit fieldNodeApi.ts — guest/* 匿名；host/* 需节点 Matrix Bearer。
 */
var deployments = require('../config/fieldNodes');
var caps = require('./fieldCapabilities');
var http = require('./http');

var uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var proof = /^[A-Za-z0-9_-]{43}$/;

var routes = {
  'host/capabilities': true,
  'host/prepare': true,
  'host/create': true,
  'host/find': true,
  'host/read': true,
  'host/recipient': true,
  'host/decide': true,
  'host/revoke': true,
  'guest/capabilities': true,
  'guest/request': true,
  'guest/leave': true,
  'guest/status': true,
  'guest/preview': true,
  'guest/session/exchange': true,
  'guest/session/status': true,
  'guest/message/send': true,
  'guest/message/status': true,
  'guest/message/read': true,
};

function isHttpsOrigin(value) {
  if (typeof value !== 'string' || !value.startsWith('https://')) return false;
  try {
    if (typeof URL === 'function') {
      var u = new URL(value);
      return u.origin === value && !u.username && !u.password;
    }
  } catch (e) {
    /* fall through */
  }
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value);
}

function approvedFieldNode(instanceId, origin, registry) {
  registry = registry || deployments;
  var found = registry.filter(function (v) {
    return v && v.instanceId === instanceId && (!origin || v.origin === origin);
  });
  if (found.length !== 1) return null;
  var v = found[0];
  if (
    !/^[1-9][0-9]*$/.test(v.instanceId) ||
    !v.name ||
    v.protocol !== caps.FIELD_JOIN_DRAFT_PROTOCOL ||
    !/^[0-9a-f]{64}$/.test(v.artifactSha256) ||
    !/^\/[a-z0-9/-]+$/.test(v.apiPath) ||
    v.apiPath.endsWith('/') ||
    !isHttpsOrigin(v.origin) ||
    !isHttpsOrigin(v.entryOrigin)
  ) {
    return null;
  }
  return {
    instanceId: v.instanceId,
    origin: v.origin,
    name: v.name,
    entryOrigin: v.entryOrigin,
    apiPath: v.apiPath,
    protocol: v.protocol,
    artifactSha256: v.artifactSha256,
  };
}

function fieldLink(node, invite) {
  var expiresOk =
    typeof invite.expiresAt === 'number' &&
    isFinite(invite.expiresAt) &&
    Math.floor(invite.expiresAt) === invite.expiresAt &&
    invite.expiresAt > 0;
  if (
    !invite ||
    !uuid.test(invite.id) ||
    typeof invite.joinProof !== 'string' ||
    !proof.test(invite.joinProof) ||
    !expiresOk
  ) {
    throw new Error('FIELD_LINK_INVALID');
  }
  return (
    node.entryOrigin +
    '/connect/join/' +
    invite.id +
    '#n=' +
    encodeURIComponent(node.instanceId) +
    '&p=' +
    encodeURIComponent(invite.joinProof) +
    '&e=' +
    encodeURIComponent(String(invite.expiresAt))
  );
}

function parseFieldLink(url) {
  var m = String(url || '').match(
    /^(https:\/\/[^#?\s]+)\/connect\/join\/([0-9a-f-]{36})(?:\?(?:[^#]*))?#(.*)$/i
  );
  if (!m) throw new Error('FIELD_LINK_INVALID');
  var id = m[2];
  var params = {};
  String(m[3])
    .split('&')
    .forEach(function (part) {
      if (!part) return;
      var eq = part.indexOf('=');
      if (eq < 0) return;
      params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(
        part.slice(eq + 1)
      );
    });
  var keys = Object.keys(params).sort().join(',');
  var instanceId = params.n || '';
  var joinProof = params.p || '';
  var expiresAt = Number(params.e);
  if (
    !uuid.test(id) ||
    !/^[1-9][0-9]*$/.test(instanceId) ||
    !proof.test(joinProof) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0 ||
    keys !== 'e,n,p'
  ) {
    throw new Error('FIELD_LINK_INVALID');
  }
  return {
    instanceId: instanceId,
    invitationId: id,
    joinProof: joinProof,
    expiresAt: expiresAt,
  };
}

function parseFieldQuery(query) {
  query = query || {};
  var id = String(query.id || query.invitationId || '');
  var instanceId = String(query.n || query.instanceId || '');
  var joinProof = String(query.p || query.joinProof || '');
  var expiresAt = Number(query.e || query.expiresAt);
  if (
    !uuid.test(id) ||
    !/^[1-9][0-9]*$/.test(instanceId) ||
    !proof.test(joinProof) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0
  ) {
    throw new Error('FIELD_LINK_INVALID');
  }
  return {
    instanceId: instanceId,
    invitationId: id,
    joinProof: joinProof,
    expiresAt: expiresAt,
  };
}

var FAIL_CODES = {
  ACCESS_DENIED: true,
  SESSION_CLOSED: true,
  SESSION_UNAVAILABLE: true,
  INVITATION_CLOSED: true,
  INVITATION_UNAVAILABLE: true,
  TOPIC_OCCUPIED: true,
  STALE_REVISION: true,
  MESSAGE_PENDING: true,
  NODE_FIELD_DISABLED: true,
  RATE_LIMITED: true,
  CURSOR_UNAVAILABLE: true,
};

/**
 * @param {object} node approved field node
 * @param {{ origin: string, token: function(): string }} [owner] host 调用必填
 */
function createFieldNodeApi(node, owner) {
  if (!approvedFieldNode(node.instanceId, node.origin, [node])) {
    throw new Error('FIELD_NODE_INVALID');
  }
  if (owner && owner.origin !== node.origin) {
    throw new Error('FIELD_NODE_INVALID');
  }
  var selected = {
    origin: node.origin,
    apiPath: node.apiPath,
  };
  return function call(route, body) {
    if (!routes[route] || (route.indexOf('host/') === 0 && !owner)) {
      return Promise.reject(
        Object.assign(new Error('FIELD_ROUTE_DENIED'), {
          code: 'FIELD_ROUTE_DENIED',
        })
      );
    }
    var header = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (route.indexOf('host/') === 0) {
      var token = owner.token();
      if (!token || /\s/.test(token)) {
        return Promise.reject(
          Object.assign(new Error('FIELD_AUTH_REQUIRED'), {
            code: 'FIELD_AUTH_REQUIRED',
          })
        );
      }
      header.Authorization = 'Bearer ' + token;
    }
    var url = selected.origin + selected.apiPath + '/' + route;
    return http
      .request({
        url: url,
        method: 'POST',
        data: body || {},
        timeout: 15000,
        header: header,
      })
      .catch(function (err) {
        var code = (err && err.code) || '';
        var mapped = FAIL_CODES[code] ? code : 'FIELD_UNAVAILABLE';
        throw Object.assign(new Error('FIELD_REQUEST_FAILED'), {
          code: mapped,
          statusCode: err && err.statusCode,
          body: err && err.body,
        });
      });
  };
}

module.exports = {
  approvedFieldNode: approvedFieldNode,
  fieldLink: fieldLink,
  parseFieldLink: parseFieldLink,
  parseFieldQuery: parseFieldQuery,
  createFieldNodeApi: createFieldNodeApi,
  deployments: deployments,
};
