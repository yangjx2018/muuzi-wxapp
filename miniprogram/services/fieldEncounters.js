/**
 * 对齐 MuuziGit fieldEncounters.ts
 * Field API 走官方 Platform + Creator token（段 B），不是节点 Matrix。
 */
const config = require('../config');
const http = require('./http');
const rules = require('./fieldEncounterRules');

function fieldRequest(token, path, body, key) {
  var opts = {
    url: config.PLATFORM_API + '/api/creator/field/v1' + path,
    method: body === undefined ? 'GET' : 'POST',
    header: { Authorization: 'Bearer ' + token },
    timeout: 15000,
  };
  if (body !== undefined) {
    opts.data = body;
    opts.header['Idempotency-Key'] = key || '';
  }
  return http.request(opts).catch(function (err) {
    if (err && err.statusCode === 404 && path === '/capabilities') {
      return { available: false };
    }
    var code = (err && err.code) || '';
    if (err && err.body && typeof err.body.code === 'string') {
      code = err.body.code;
    }
    throw Object.assign(new Error(rules.fieldErrorMessage(code)), {
      statusCode: err && err.statusCode,
      code: code || (err && err.code) || '',
    });
  });
}

function fieldCapabilities(token) {
  return fieldRequest(token, '/capabilities').then(function (data) {
    if (!data || typeof data.available !== 'boolean') {
      throw new Error('话题服务返回格式不正确。');
    }
    var langs = Array.isArray(data.speechLanguages)
      ? data.speechLanguages.filter(function (v) {
          return typeof v === 'string';
        })
      : [];
    return {
      available: data.available,
      deletion: data.deletion === true,
      speech: data.available && data.speech === true,
      speechLanguages: langs,
    };
  });
}

function listFieldEncounters(token, before) {
  var path =
    '/encounters?limit=20' +
    (before ? '&before=' + encodeURIComponent(before) : '');
  return fieldRequest(token, path).then(function (data) {
    if (
      !data ||
      !Array.isArray(data.items) ||
      !data.items.every(rules.isFieldEncounter) ||
      !(data.nextBefore === null || typeof data.nextBefore === 'string')
    ) {
      throw new Error('话题列表返回格式不正确。');
    }
    return { items: data.items, nextBefore: data.nextBefore };
  });
}

function createFieldEncounter(token, input, key) {
  return fieldRequest(token, '/encounters', input, key).then(function (data) {
    if (!rules.isFieldEncounter(data)) {
      throw new Error('未能确认话题创建结果，请重试原请求。');
    }
    return data;
  });
}

function closeFieldEncounter(token, item, key) {
  return fieldRequest(
    token,
    '/encounters/' + encodeURIComponent(item.encounterId) + '/close',
    { expectedRevision: item.revision, saveHistory: false },
    key
  ).then(function (data) {
    if (!rules.isFieldEncounter(data)) {
      throw new Error('未能确认话题结束结果，请重试原请求。');
    }
    return data;
  });
}

function deleteFieldEncounter(token, item, key) {
  return fieldRequest(
    token,
    '/encounters/' + encodeURIComponent(item.encounterId) + '/delete',
    { expectedRevision: item.revision },
    key
  ).then(function (data) {
    if (!rules.isDeletedEncounter(data, item.encounterId)) {
      throw new Error('未能确认删除结果，请重试原操作。');
    }
  });
}

module.exports = {
  fieldCapabilities: fieldCapabilities,
  listFieldEncounters: listFieldEncounters,
  createFieldEncounter: createFieldEncounter,
  closeFieldEncounter: closeFieldEncounter,
  deleteFieldEncounter: deleteFieldEncounter,
};
