/**
 * 节点企业组织创建 · 对齐 App enterpriseOrganization.ts
 * Matrix access token 只发往所选节点，不经平台。
 */
const http = require('./http');

function charLen(text) {
  return Array.from(String(text || '')).length;
}

function validateNodeOrigin(origin) {
  var url;
  try {
    url = new URL(origin);
  } catch (e) {
    throw new Error('节点地址无效，请重新登录');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('节点地址无效，请重新登录');
  }
  return url.origin.replace(/\/$/, '');
}

function normalizeRows(data) {
  if (!data || !Array.isArray(data.organizations)) {
    throw new Error('节点返回的组织信息不完整');
  }
  var rows = data.organizations;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (
      !row ||
      !['string', 'number'].includes(typeof row.org_id) ||
      !String(row.org_id) ||
      typeof row.name !== 'string' ||
      typeof row.slug !== 'string' ||
      typeof row.is_owner !== 'boolean'
    ) {
      throw new Error('节点返回的组织信息不完整');
    }
  }
  return rows;
}

function fetchEntries(origin, accessToken) {
  return http
    .request({
      url: origin + '/cosmac/org/entries',
      method: 'GET',
      header: {
        Authorization: 'Bearer ' + accessToken,
        Accept: 'application/json',
      },
    })
    .then(normalizeRows)
    .catch(function (err) {
      if (err && err.statusCode === 401) {
        throw new Error('节点登录已失效，请重新登录');
      }
      if (err && err.message && /组织信息不完整/.test(err.message)) throw err;
      throw new Error('无法核对节点组织，请稍后重试');
    });
}

/**
 * @param {{ nodeOrigin: string, accessToken: string }} session
 * @param {string} displayName
 * @returns {Promise<{org_id:string|number, slug:string, name:string, is_owner:boolean}>}
 */
function createEnterpriseOrganization(session, displayName) {
  var name = String(displayName || '')
    .trim()
    .replace(/\s+/g, ' ');
  var len = charLen(name);
  if (len < 2 || len > 120) {
    return Promise.reject(new Error('企业名称需要 2–120 个字符'));
  }
  if (!session || !session.accessToken || !session.nodeOrigin) {
    return Promise.reject(new Error('未登录节点，请重新登录'));
  }
  var origin;
  try {
    origin = validateNodeOrigin(session.nodeOrigin);
  } catch (e) {
    return Promise.reject(e);
  }
  var token = session.accessToken;

  return fetchEntries(origin, token).then(function (existing) {
    var owned = null;
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].is_owner === true) {
        owned = existing[i];
        break;
      }
    }
    if (owned) return owned;
    if (existing.length) {
      throw new Error(
        '你已加入节点企业组织；当前节点每个账号只支持一个企业组织，请先联系组织管理员'
      );
    }
    var failed = false;
    return http
      .request({
        url: origin + '/cosmac/tenants/self-service',
        method: 'POST',
        header: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        data: {
          action: 'request',
          tenant_type: 'enterprise',
          display_name: name,
        },
        timeout: 20000,
      })
      .catch(function () {
        failed = true;
        return null;
      })
      .then(function () {
        return fetchEntries(origin, token);
      })
      .then(function (after) {
        var created = null;
        for (var j = 0; j < after.length; j++) {
          if (after[j].is_owner === true) {
            created = after[j];
            break;
          }
        }
        if (!created) {
          throw new Error(
            failed
              ? '节点创建未确认，请核对组织状态后重试'
              : '节点尚未返回可管理的企业组织，请稍后核对'
          );
        }
        return created;
      });
  });
}

module.exports = {
  createEnterpriseOrganization: createEnterpriseOrganization,
};
